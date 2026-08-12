#!/usr/bin/env python3
"""apply-music-membership.py — apply the reviewed Music Collection membership
proposal (research/library-audit/music-collection-proposal.csv) to each
approved Entry's `library.collections` front matter.

For every row with `music == yes`, adds "music" to that Entry's existing
`library.collections` list. Like migrate-library-entries.py, this is a
targeted TEXT insertion, not a YAML re-parse/re-dump: every flat-tree
Entry's `library:` block has the uniform shape

    library:
      id: <id>
      type: <type>
      sarc_work: <bool>
      collections: [<existing>]

so this finds that exact `  collections: [...]` line and rewrites just its
bracket contents, appending `music` — nothing else in the file changes.

Usage:
    python3 scripts/apply-music-membership.py            # dry run (default)
    python3 scripts/apply-music-membership.py --apply     # do it

Idempotent: an Entry whose collections list already contains "music" is
skipped and reported, not double-added.
"""

import argparse
import csv
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROPOSAL_CSV = os.path.join(ROOT, "research/library-audit/music-collection-proposal.csv")

COLLECTIONS_RE = re.compile(r"^(\s*collections:\s*)\[([^\]]*)\](\s*)$")


def patch_collections(index_md):
    with open(index_md, encoding="utf-8") as f:
        lines = f.readlines()

    for i, line in enumerate(lines):
        m = COLLECTIONS_RE.match(line.rstrip("\n"))
        if not m:
            continue
        prefix, inner, suffix = m.groups()
        current = [c.strip() for c in inner.split(",") if c.strip()]
        if "music" in current:
            return "skip", "already a member", lines
        new_line = f"{prefix}[{', '.join(current + ['music'])}]{suffix}\n"
        lines[i] = new_line
        return "patched", None, lines

    return "error", "no `collections:` line found", lines


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--apply", action="store_true", help="actually patch front matter (default: dry run)")
    args = ap.parse_args()

    if not os.path.isfile(PROPOSAL_CSV):
        raise SystemExit(f"apply-music-membership: {PROPOSAL_CSV} not found")

    with open(PROPOSAL_CSV, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    bad_music = [r for r in rows if r["music"] not in ("yes", "no")]
    if bad_music:
        print("apply-music-membership: refusing — unresolved music values remain:")
        for r in bad_music:
            print(" ", r["id"], r["music"])
        sys.exit(1)

    approved = [r for r in rows if r["music"] == "yes"]

    planned, skipped, errors = [], [], []
    for r in approved:
        index_md = os.path.join(ROOT, r["source_path"])
        if not os.path.isfile(index_md):
            errors.append(f"{r['id']}: source_path {r['source_path']} does not exist")
            continue
        status, detail, patched_lines = patch_collections(index_md)
        if status == "error":
            errors.append(f"{r['id']} ({r['source_path']}): {detail}")
        elif status == "skip":
            skipped.append(r["id"])
        else:
            planned.append((r["id"], index_md, patched_lines))

    print(f"apply-music-membership: {len(approved)} approved rows")
    print(f"  to patch: {len(planned)}")
    print(f"  already members (skip): {len(skipped)}")
    if errors:
        print(f"  ERRORS: {len(errors)}")
        for e in errors:
            print("   -", e)

    if not args.apply:
        print(f"\nDry run — {len(planned)} entries would gain music membership. Re-run with --apply to execute.")
        if errors:
            sys.exit(1)
        return

    if errors:
        print("\nRefusing to --apply: errors above must be resolved first.")
        sys.exit(1)

    for entry_id, index_md, patched_lines in planned:
        with open(index_md, "w", encoding="utf-8") as f:
            f.writelines(patched_lines)

    print(f"\nApplied music membership to {len(planned)} entries.")


if __name__ == "__main__":
    main()
