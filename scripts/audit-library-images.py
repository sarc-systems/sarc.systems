#!/usr/bin/env python3
"""Audit credit/source/rights metadata for every image in the Library.

Scope: every entry the Hugo build treats as a catalog member — every
`content/library/<slug>/index.md` bundle, PLUS any page anywhere else in
`content/` that opts in with `library: {include: true, id: ...}` (a Label
release, a Systems manual, a Studio doc joining the catalog from its own
canonical URL). This mirrors the selection logic in
`layouts/partials/library-validate.html`
(`where site.RegularPages "Section" "library" | union where
"Params.library.include" true`). `_index.md` list pages and drafts are
skipped, same as the Hugo build.

PARSER LIMITATION — read this before trusting a "clean" report.  This is a
line-based front-matter reader, not a YAML parser, so it only understands the
house style this catalog has used so far:

  - `images:` as a block sequence, each item starting `  - file: "..."`
  - scalar fields (`alt`, `role`, `caption`, `credit`, `source`, `anchor`)
    each on their own line at a fixed 4-space indent under the item
  - `rights:` / `use:` as nested mappings at 4-space indent, their own
    `status`/`note`/`basis` scalars at 6-space indent
  - scalar values double-quoted, single-quoted, or bare (unquoted) — all
    three are recognized

It does NOT understand: flow-style mappings (`- {file: "x.jpg", alt: "..."}`
on one line), multi-line block scalars (`|` or `>`), inline comments after a
value, or any indentation other than the one this catalog has used so far.
If an entry's `images` block is ever written in one of those forms, this
script will silently skip fields it doesn't recognize — it does NOT raise an
error for a form it can't parse, because it has no real grammar to fall back
on. The Hugo build-time validator
(`layouts/partials/library-validate.html`) is the authoritative check — it
uses Hugo's actual YAML/TOML front matter parsing and cannot be fooled this
way. Treat this script as a helpful offline report, not a substitute for
`make check`. If this ever needs to be airtight, replace the parser with
PyYAML rather than extending these regexes further (blocked previously in
this environment by `pip install pyyaml` failing with
"externally-managed-environment" — a venv or `pipx` install would resolve
that if it's worth the added setup step).

Usage: python3 scripts/audit-library-images.py [--strict]
  --strict   exit nonzero on warnings too, not just hard errors

Exit code is nonzero if any hard error is found (mirrors the Hugo build
gate), so this can be wired into CI independently of `make check`.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT_DIR = ROOT / "content"
LIBRARY_YAML = ROOT / "data" / "library.yaml"

PLATFORM_NAMES = {
    "google", "goodreads", "spotify", "bandcamp", "discogs", "wikipedia",
    "wikimedia", "wikimedia commons", "substack", "popmatters",
    "amoeba music", "amoeba", "red bull music academy", "tape op", "xing",
    "youtube", "internet archive", "abebooks", "whyy", "reddit",
}

IMAGE_EXT_RE = re.compile(r"\.(jpg|jpeg|png|webp|gif)(\?.*)?$", re.IGNORECASE)
BARE_HOMEPAGE_RE = re.compile(r"^https?://[^/]+/?$")
ABS_URL_RE = re.compile(r"^https?://")

# A scalar value: "double-quoted", 'single-quoted', or bare-unquoted (trimmed,
# trailing comment stripped). Used for every image field below.
_VALUE_RE = r'(?:"([^"\n]*)"|\'([^\'\n]*)\'|([^\s#][^\n]*?))\s*(?:#.*)?$'


def _scalar_match(pattern_prefix, line):
    m = re.match(pattern_prefix + _VALUE_RE, line)
    if not m:
        return None
    return next((g for g in m.groups() if g is not None), "").strip()


def load_vocab(name, fallback):
    text = LIBRARY_YAML.read_text()
    m = re.search(rf"^{name}:\s*\[([^\]]*)\]", text, re.MULTILINE)
    if not m:
        return fallback
    return {v.strip() for v in m.group(1).split(",") if v.strip()}


def parse_front_matter(text):
    """Return the front matter lines (between the first two '---' markers)."""
    lines = text.split("\n")
    if not lines or lines[0].strip() != "---":
        return []
    for i in range(1, len(lines)):
        if lines[i].strip() == "---":
            return lines[1:i]
    return []


def get_scalar(lines, key, default=""):
    for line in lines:
        v = _scalar_match(rf"^{key}:\s*", line)
        if v is not None and re.match(rf"^{key}:\s*\S", line):
            return v
    return default


def get_library_meta(lines):
    """Return (library.id, library.type, library.include) from the `library:` block."""
    lib_id, lib_type, lib_include = "", "", False
    in_lib = False
    for line in lines:
        if re.match(r"^library:\s*$", line):
            in_lib = True
            continue
        if in_lib:
            if re.match(r"^\S", line):
                break
            m = re.match(r'^\s*id:\s*', line)
            if m:
                v = _scalar_match(r"^\s*id:\s*", line)
                if v:
                    lib_id = v
                continue
            m = re.match(r'^\s*type:\s*', line)
            if m:
                v = _scalar_match(r"^\s*type:\s*", line)
                if v:
                    lib_type = v
                continue
            if re.match(r"^\s*include:\s*true\s*$", line):
                lib_include = True
    return lib_id, lib_type, lib_include


def parse_images(lines):
    """Return a list of dicts, one per `images[]` entry."""
    images = []
    in_images = False
    cur = None
    in_rights = False
    in_use = False
    for line in lines:
        if re.match(r"^images:\s*$", line):
            in_images = True
            continue
        if in_images:
            if re.match(r"^\S", line):  # next top-level key — images block over
                break
            item_start = re.match(r'^\s{2}-\s*file:\s*', line)
            if item_start:
                if cur:
                    images.append(cur)
                file_ = _scalar_match(r'^\s{2}-\s*file:\s*', line) or ""
                cur = {"file": file_}
                in_rights = False
                in_use = False
                continue
            if cur is None:
                continue
            if re.match(r"^\s{4}rights:\s*$", line):
                in_rights, in_use = True, False
                continue
            if re.match(r"^\s{4}use:\s*$", line):
                in_rights, in_use = False, True
                continue
            if in_rights or in_use:
                if not re.match(r"^\s{6}\S", line):
                    in_rights = in_use = False
                else:
                    prefix = "rights_" if in_rights else "use_"
                    v = _scalar_match(r"^\s{6}status:\s*", line)
                    if in_rights and v is not None and re.match(r"^\s{6}status:\s*\S", line):
                        cur[prefix + "status"] = v
                        continue
                    v = _scalar_match(r"^\s{6}basis:\s*", line)
                    if in_use and v is not None and re.match(r"^\s{6}basis:\s*\S", line):
                        cur[prefix + "basis"] = v
                        continue
                    v = _scalar_match(r"^\s{6}note:\s*", line)
                    if v is not None and re.match(r"^\s{6}note:\s*\S", line):
                        cur[prefix + "note"] = v
                        continue
            for key in ("alt", "role", "caption", "credit", "source", "anchor"):
                if re.match(rf"^\s{{4}}{key}:\s*\S", line):
                    v = _scalar_match(rf"^\s{{4}}{key}:\s*", line)
                    if v is not None:
                        cur[key] = v
                        break
            else:
                if re.match(r"^\s{4}decorative:\s*true", line):
                    cur["decorative"] = True
    if cur:
        images.append(cur)
    return images


def find_entries():
    """Yield (path, front_matter_lines, library_id) for every catalog entry,
    matching the Hugo validator's selection: content/library/* bundles, plus
    any other page anywhere in content/ with library.include: true."""
    for md in sorted(CONTENT_DIR.rglob("*.md")):
        if md.name == "_index.md":
            continue
        text = md.read_text()
        lines = parse_front_matter(text)
        if get_scalar(lines, "draft") == "true":
            continue
        lib_id, lib_type, lib_include = get_library_meta(lines)
        rel = md.relative_to(CONTENT_DIR)
        in_library_section = rel.parts[0] == "library"
        if not (in_library_section or lib_include):
            continue
        if not lib_id:
            continue
        yield md, lines, lib_id


def audit_image(entry_path, im, img_rights_vocab, img_use_vocab):
    errors, warnings = [], []
    file_ = im.get("file", "")
    if file_ and not (entry_path.parent / file_).exists():
        errors.append(f"file {file_!r} not found in bundle")
    if not im.get("alt") and not im.get("decorative"):
        errors.append("missing alt (and not decorative)")

    src = im.get("source", "")
    if src:
        if not ABS_URL_RE.match(src):
            errors.append(f"malformed source {src!r}")
        elif "google.com" in src:
            errors.append(f"source is a Google URL: {src!r}")
        elif BARE_HOMEPAGE_RE.match(src):
            errors.append(f"source is a bare homepage: {src!r}")
        elif IMAGE_EXT_RE.search(src):
            warnings.append(f"source is a raw image file, not a contextual page: {src!r}")

    status = im.get("rights_status", "")
    rnote = im.get("rights_note", "")
    if status:
        if status not in img_rights_vocab:
            errors.append(f"invalid rights.status {status!r}")
        if status in ("licensed", "permitted") and not rnote:
            errors.append(f"rights.status {status!r} has no note")
        if status == "public-domain" and not src:
            errors.append("rights.status public-domain with no source")
        if status == "unknown":
            warnings.append("rights status is unknown")

    basis = im.get("use_basis", "")
    if basis and basis not in img_use_vocab:
        errors.append(f"invalid use.basis {basis!r}")

    credit = im.get("credit", "")
    if credit and credit.strip().lower() in PLATFORM_NAMES:
        warnings.append(f"credit {credit!r} names a platform, not a creator")
    if not src and status != "sarc-owned":
        warnings.append("no source recorded")
    use_note = im.get("use_note", "")
    if im.get("role") == "cover" and not im.get("caption") and not credit and not rnote and not use_note:
        warnings.append("cover doesn't identify its edition")

    return errors, warnings


def main():
    strict = "--strict" in sys.argv
    img_rights_vocab = load_vocab(
        "image_rights_status",
        {"sarc-owned", "public-domain", "licensed", "permitted", "unknown"},
    )
    img_use_vocab = load_vocab(
        "image_use_basis",
        {"identification", "editorial", "promotional", "fair-use", "archival"},
    )

    rows = []
    total_images = 0
    with_source = 0
    with_known_credit = 0
    unresolved_credit = 0
    unresolved_rights = 0
    needs_research = []
    error_count = 0
    warning_count = 0

    entries = list(find_entries())

    source_tally = {}
    for md, lines, entry_id in entries:
        for im in parse_images(lines):
            src = im.get("source", "")
            if src:
                source_tally[src] = source_tally.get(src, 0) + 1

    for md, lines, entry_id in entries:
        images = parse_images(lines)

        for im in images:
            total_images += 1
            errors, warnings = audit_image(md, im, img_rights_vocab, img_use_vocab)

            src = im.get("source", "")
            if src and source_tally.get(src, 0) > 1:
                warnings.append(f"source reused across {source_tally[src]} entries")

            if src:
                with_source += 1
            credit = im.get("credit", "")
            if credit and credit.strip().lower() not in PLATFORM_NAMES:
                with_known_credit += 1
            elif credit:
                unresolved_credit += 1
            if im.get("rights_status", "") in ("", "unknown"):
                unresolved_rights += 1

            problem = "; ".join(errors + warnings)
            if errors:
                error_count += len(errors)
            if warnings:
                warning_count += len(warnings)
            if errors or (not src and not credit):
                needs_research.append(f"{entry_id} :: {im.get('file', '?')}")

            rows.append((
                entry_id, im.get("file", ""), im.get("role", ""),
                credit, src, im.get("rights_status", ""), problem,
            ))

    widths = [32, 24, 10, 24, 42, 12]
    header = ("entry", "image", "role", "credit", "source", "rights", "problem")
    print("  ".join(h.ljust(w) for h, w in zip(header, widths)) + "  problem")
    print("  ".join("-" * w for w in widths) + "  " + "-" * 7)
    for row in rows:
        cells = [str(c)[:w].ljust(w) for c, w in zip(row[:6], widths)]
        print("  ".join(cells) + "  " + row[6])

    print(f"\n{len(entries)} catalog entries scanned "
          f"(content/library/* plus any library.include: true pages)", file=sys.stderr)
    print(f"{total_images} images audited", file=sys.stderr)
    print(f"{with_source} with source recorded", file=sys.stderr)
    print(f"{with_known_credit} with a non-platform credit", file=sys.stderr)
    print(f"{unresolved_credit} with an unresolved (platform-name) credit", file=sys.stderr)
    print(f"{unresolved_rights} with no/unknown rights status", file=sys.stderr)
    print(f"{error_count} hard errors, {warning_count} warnings "
          f"(a single image can trigger more than one warning category, so "
          f"this total will not equal the count of images with warnings)",
          file=sys.stderr)
    if needs_research:
        print(f"{len(needs_research)} images still need manual research:", file=sys.stderr)
        for r in needs_research:
            print(f"  - {r}", file=sys.stderr)

    if error_count or (strict and warning_count):
        sys.exit(1)


if __name__ == "__main__":
    main()
