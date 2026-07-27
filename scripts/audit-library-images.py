#!/usr/bin/env python3
"""Audit credit/source/rights metadata for every image in the Library.

Scans content/library/*/index.md, extracts each entry's `images` array (a
line-based reader, not a full YAML parser — the front matter here is always
simple `key: "value"` pairs at consistent indentation), and reports the same
things the build-time check in layouts/partials/library-validate.html looks
for, plus a plain-text table for manual review. Makes no network requests —
this only reads files already on disk, so it stays deterministic and offline.

Usage: python3 scripts/audit-library-images.py [--strict]
  --strict   exit nonzero on warnings too, not just hard errors

Exit code is nonzero if any hard error is found (mirrors the Hugo build
gate), so this can be wired into CI independently of `make check`.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LIB_DIR = ROOT / "content" / "library"
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


def load_image_rights_vocab():
    text = LIBRARY_YAML.read_text()
    m = re.search(r"^image_rights_status:\s*\[([^\]]*)\]", text, re.MULTILINE)
    if not m:
        return {"sarc-owned", "public-domain", "licensed", "permitted",
                "promotional", "fair-use", "archival", "unknown"}
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
        m = re.match(rf'^{key}:\s*"?([^"\n]*)"?\s*$', line)
        if m:
            return m.group(1).strip()
    return default


def get_library_id_type(lines):
    lib_id, lib_type = "", ""
    in_lib = False
    for line in lines:
        if re.match(r"^library:\s*$", line):
            in_lib = True
            continue
        if in_lib:
            if re.match(r"^\S", line):
                break
            m = re.match(r'^\s*id:\s*"?([\w-]+)"?', line)
            if m:
                lib_id = m.group(1)
            m = re.match(r'^\s*type:\s*"?([\w-]+)"?', line)
            if m:
                lib_type = m.group(1)
    return lib_id, lib_type


def parse_images(lines):
    """Return a list of dicts, one per `images[]` entry."""
    images = []
    in_images = False
    cur = None
    in_rights = False
    for line in lines:
        if re.match(r"^images:\s*$", line):
            in_images = True
            continue
        if in_images:
            if re.match(r"^\S", line):  # next top-level key — images block over
                break
            item_start = re.match(r'^\s{2}-\s*file:\s*"([^"]*)"', line)
            if item_start:
                if cur:
                    images.append(cur)
                cur = {"file": item_start.group(1)}
                in_rights = False
                continue
            if cur is None:
                continue
            if re.match(r"^\s{4}rights:\s*$", line):
                in_rights = True
                continue
            if in_rights:
                m = re.match(r'^\s{6}status:\s*"?([\w-]+)"?', line)
                if m:
                    cur["rights_status"] = m.group(1)
                    continue
                m = re.match(r'^\s{6}note:\s*"([^"]*)"', line)
                if m:
                    cur["rights_note"] = m.group(1)
                    continue
                if not re.match(r"^\s{6}\S", line):
                    in_rights = False
            for key in ("alt", "role", "caption", "credit", "source", "anchor"):
                m = re.match(rf'^\s{{4}}{key}:\s*"([^"]*)"', line)
                if m:
                    cur[key] = m.group(1)
                    break
            else:
                m = re.match(r"^\s{4}decorative:\s*true", line)
                if m:
                    cur["decorative"] = True
    if cur:
        images.append(cur)
    return images


def audit_image(entry_path, entry_id, im, img_rights_vocab):
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
    note = im.get("rights_note", "")
    if status:
        if status not in img_rights_vocab:
            errors.append(f"invalid rights.status {status!r}")
        if status in ("licensed", "permitted") and not note:
            errors.append(f"rights.status {status!r} has no note")
        if status == "public-domain" and not src:
            errors.append("rights.status public-domain with no source")
        if status == "unknown":
            warnings.append("rights status is unknown")

    credit = im.get("credit", "")
    if credit and credit.strip().lower() in PLATFORM_NAMES:
        warnings.append(f"credit {credit!r} names a platform, not a creator")
    if not src and status != "sarc-owned":
        warnings.append("no source recorded")
    if im.get("role") == "cover" and not im.get("caption") and not credit and not note:
        warnings.append("cover doesn't identify its edition")

    return errors, warnings


def main():
    strict = "--strict" in sys.argv
    img_rights_vocab = load_image_rights_vocab()

    rows = []
    total_images = 0
    with_source = 0
    with_known_credit = 0
    unresolved_credit = 0
    unresolved_rights = 0
    needs_research = []
    error_count = 0
    warning_count = 0

    source_tally = {}
    for md in sorted(LIB_DIR.glob("*/index.md")):
        lines = parse_front_matter(md.read_text())
        for im in parse_images(lines):
            src = im.get("source", "")
            if src:
                source_tally[src] = source_tally.get(src, 0) + 1

    for md in sorted(LIB_DIR.glob("*/index.md")):
        text = md.read_text()
        lines = parse_front_matter(text)
        if get_scalar(lines, "draft") == "true":
            continue
        lib_id, lib_type = get_library_id_type(lines)
        entry_id = lib_id or md.parent.name
        images = parse_images(lines)

        for im in images:
            total_images += 1
            errors, warnings = audit_image(md, entry_id, im, img_rights_vocab)

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

    print(f"\n{total_images} images audited", file=sys.stderr)
    print(f"{with_source} with source recorded", file=sys.stderr)
    print(f"{with_known_credit} with a non-platform credit", file=sys.stderr)
    print(f"{unresolved_credit} with an unresolved (platform-name) credit", file=sys.stderr)
    print(f"{unresolved_rights} with no/unknown rights status", file=sys.stderr)
    print(f"{error_count} hard errors, {warning_count} warnings", file=sys.stderr)
    if needs_research:
        print(f"{len(needs_research)} images still need manual research:", file=sys.stderr)
        for r in needs_research:
            print(f"  - {r}", file=sys.stderr)

    if error_count or (strict and warning_count):
        sys.exit(1)


if __name__ == "__main__":
    main()
