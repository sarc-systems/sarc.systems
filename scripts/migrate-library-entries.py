#!/usr/bin/env python3
"""migrate-library-entries.py — move `research`/`manuals` Library Entries out
of their Collection-owned directories into the flat, Collection-independent
canonical storage location, and stamp each with its new `library.collections`
membership.

Before:  content/library/research/<public-type>/<slug>/index.md
After:   content/library/entry/<public-type>/<slug>/index.md
         (front matter gains `  collections: [research]` inside the
         existing `library:` block)

Same for `content/library/manuals/...` -> `collections: [manuals]`.

`field-kit` is never touched — it stays on the old path-derived,
single-owning-Collection model deliberately (see CLAUDE.md / docs/library-v2.md).

Every one of the 737 entries under research/manuals has an identical
`library:` block shape (verified before writing this script):

    library:
      id: <id>
      type: <type>
      sarc_work: <bool>

so this is a targeted TEXT insertion (one new line, right after the
`sarc_work:` line), never a full YAML re-parse/re-dump — a real YAML
round-trip (PyYAML; ruamel isn't available here) would reformat every
file's flow-style inline dicts (`{ref: ..., role: ...}`) into block style,
an unacceptable diff across hundreds of unrelated files. If a file's
`library:` block doesn't match that exact expected shape, this script
refuses to touch it and reports it for manual handling rather than
guessing.

Usage:
    python3 scripts/migrate-library-entries.py            # dry run (default)
    python3 scripts/migrate-library-entries.py --apply     # do it

Idempotent: an entry already carrying a `collections:` line inside its
`library:` block, or already living under content/library/entry/, is
reported and skipped.
"""

import argparse
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SOURCES = [
    ("research", os.path.join(ROOT, "content/library/research")),
    ("manuals", os.path.join(ROOT, "content/library/manuals")),
]
DEST_ROOT = os.path.join(ROOT, "content/library/entry")


def find_entries(collection_id, coll_dir):
    """Yield (public_type, slug, bundle_dir) for every Entry bundle under
    coll_dir — i.e. every immediate child of a public-type folder, skipping
    the Collection's own _index.md."""
    if not os.path.isdir(coll_dir):
        raise SystemExit(f"migrate-library-entries: {coll_dir} does not exist")
    for public_type in sorted(os.listdir(coll_dir)):
        pt_dir = os.path.join(coll_dir, public_type)
        if not os.path.isdir(pt_dir):
            continue  # e.g. _index.md, cover.png sit directly in coll_dir
        for slug in sorted(os.listdir(pt_dir)):
            bundle_dir = os.path.join(pt_dir, slug)
            index_md = os.path.join(bundle_dir, "index.md")
            if os.path.isfile(index_md):
                yield public_type, slug, bundle_dir


def patch_front_matter(index_md, collection_id):
    """Insert `  collections: [<collection_id>]` right after the
    `  sarc_work:` line inside the `library:` block. Returns
    (status, detail) where status is one of:
      "patched"  — line inserted, caller should write the file back
      "skip"     — already has a collections: line, nothing to do
      "error"    — block didn't match the expected shape
    """
    with open(index_md, encoding="utf-8") as f:
        lines = f.readlines()

    try:
        lib_idx = next(i for i, l in enumerate(lines) if l.rstrip("\n") == "library:")
    except StopIteration:
        return "error", "no top-level `library:` line found", lines

    id_line = lines[lib_idx + 1] if lib_idx + 1 < len(lines) else ""
    type_line = lines[lib_idx + 2] if lib_idx + 2 < len(lines) else ""
    sarc_line = lines[lib_idx + 3] if lib_idx + 3 < len(lines) else ""
    next_line = lines[lib_idx + 4] if lib_idx + 4 < len(lines) else ""

    if next_line.strip().startswith("collections:"):
        return "skip", "already has collections:", lines

    if not (
        id_line.startswith("  id:")
        and type_line.startswith("  type:")
        and sarc_line.startswith("  sarc_work:")
    ):
        return "error", (
            f"library: block at line {lib_idx + 1} doesn't match the expected "
            f"id/type/sarc_work shape — got {id_line!r} {type_line!r} {sarc_line!r}"
        ), lines

    new_line = f"  collections: [{collection_id}]\n"
    patched = lines[: lib_idx + 4] + [new_line] + lines[lib_idx + 4 :]
    return "patched", None, patched


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--apply", action="store_true", help="actually patch front matter and git mv (default: dry run)")
    args = ap.parse_args()

    planned = []  # (collection_id, public_type, slug, src_dir, dest_dir)
    errors = []
    skipped = []
    seen_targets = {}  # (public_type, slug) -> collection_id, for collision detection

    for collection_id, coll_dir in SOURCES:
        for public_type, slug, bundle_dir in find_entries(collection_id, coll_dir):
            index_md = os.path.join(bundle_dir, "index.md")
            dest_dir = os.path.join(DEST_ROOT, public_type, slug)

            key = (public_type, slug)
            if key in seen_targets:
                errors.append(f"COLLISION: {public_type}/{slug} claimed by both {seen_targets[key]!r} and {collection_id!r}")
                continue
            seen_targets[key] = collection_id

            if os.path.exists(dest_dir):
                errors.append(f"COLLISION: destination {os.path.relpath(dest_dir, ROOT)} already exists (from {bundle_dir})")
                continue

            status, detail, patched_lines = patch_front_matter(index_md, collection_id)
            if status == "error":
                errors.append(f"{os.path.relpath(index_md, ROOT)}: {detail}")
                continue
            if status == "skip":
                skipped.append(os.path.relpath(bundle_dir, ROOT))
                continue

            planned.append((collection_id, public_type, slug, bundle_dir, dest_dir, index_md, patched_lines))

    counts = {}
    for collection_id, *_ in planned:
        counts[collection_id] = counts.get(collection_id, 0) + 1

    print("migrate-library-entries: plan")
    for collection_id, _ in SOURCES:
        print(f"  {collection_id}: {counts.get(collection_id, 0)} entries to migrate")
    if skipped:
        print(f"  already migrated / skipped: {len(skipped)}")
    if errors:
        print(f"  ERRORS: {len(errors)}")
        for e in errors:
            print("   -", e)

    if not args.apply:
        print(f"\nDry run — {len(planned)} entries would be moved. Re-run with --apply to execute.")
        if errors:
            sys.exit(1)
        return

    if errors:
        print("\nRefusing to --apply: errors above must be resolved first.")
        sys.exit(1)

    for collection_id, public_type, slug, bundle_dir, dest_dir, index_md, patched_lines in planned:
        with open(index_md, "w", encoding="utf-8") as f:
            f.writelines(patched_lines)
        dest_parent = os.path.dirname(dest_dir)
        os.makedirs(dest_parent, exist_ok=True)
        subprocess.run(
            ["git", "mv", os.path.relpath(bundle_dir, ROOT), os.path.relpath(dest_dir, ROOT)],
            cwd=ROOT, check=True,
        )

    print(f"\nMigrated {len(planned)} entries.")
    for collection_id, _ in SOURCES:
        print(f"  {collection_id}: {counts.get(collection_id, 0)}")


if __name__ == "__main__":
    main()
