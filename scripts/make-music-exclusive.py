#!/usr/bin/env python3
"""make-music-exclusive.py — remove `research` from `library.collections` on
every Entry that's a Music member, per an explicit editorial decision to
make Music exclusive of Research rather than overlapping (a deliberate
reversal of this migration's original "overlap is acceptable" design).

Targeted TEXT edit (same discipline as the other Library migration
scripts): rewrites `  collections: [research, music]` to
`  collections: [music]` and nothing else in the file.

Usage:
    python3 scripts/make-music-exclusive.py            # dry run (default)
    python3 scripts/make-music-exclusive.py --apply     # do it

Idempotent: an entry whose collections list is already just `[music]` (or
doesn't contain `research`) is skipped.
"""

import argparse
import glob
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

COLLECTIONS_RE = re.compile(r"^(\s*collections:\s*)\[([^\]]*)\](\s*)$")


def patch(index_md):
    with open(index_md, encoding="utf-8") as f:
        lines = f.readlines()

    for i, line in enumerate(lines):
        m = COLLECTIONS_RE.match(line.rstrip("\n"))
        if not m:
            continue
        prefix, inner, suffix = m.groups()
        current = [c.strip() for c in inner.split(",") if c.strip()]
        if "music" not in current:
            return "skip", "not a Music member", lines
        if "research" not in current:
            return "skip", "already exclusive of research", lines
        new_items = [c for c in current if c != "research"]
        new_line = f"{prefix}[{', '.join(new_items)}]{suffix}\n"
        lines[i] = new_line
        return "patched", None, lines

    return "error", "no `collections:` line found", lines


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--apply", action="store_true", help="actually patch front matter (default: dry run)")
    args = ap.parse_args()

    candidates = sorted(glob.glob(os.path.join(ROOT, "content/library/entry/*/*/index.md")))

    planned, skipped, errors = [], [], []
    for path in candidates:
        status, detail, patched_lines = patch(path)
        if status == "error":
            errors.append(f"{os.path.relpath(path, ROOT)}: {detail}")
        elif status == "skip":
            skipped.append(os.path.relpath(path, ROOT))
        else:
            planned.append((path, patched_lines))

    print(f"make-music-exclusive: {len(candidates)} flat-tree entries scanned")
    print(f"  to patch: {len(planned)}")
    print(f"  skip (not Music, or already exclusive): {len(skipped)}")
    if errors:
        print(f"  ERRORS: {len(errors)}")
        for e in errors:
            print("   -", e)

    if not args.apply:
        print(f"\nDry run — {len(planned)} entries would lose 'research' membership. Re-run with --apply to execute.")
        if errors:
            sys.exit(1)
        return

    if errors:
        print("\nRefusing to --apply: errors above must be resolved first.")
        sys.exit(1)

    for path, patched_lines in planned:
        with open(path, "w", encoding="utf-8") as f:
            f.writelines(patched_lines)

    print(f"\nMade {len(planned)} entries exclusive to Music (dropped research membership).")


if __name__ == "__main__":
    main()
