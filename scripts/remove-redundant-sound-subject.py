#!/usr/bin/env python3
"""remove-redundant-sound-subject.py — drop the `sound` Subject from every
Entry that belongs to the Music Collection, since Collection membership
itself now conveys "this is about sound/music" and the Subject becomes
redundant metadata on those entries specifically. An entry that carries
`sound` but is NOT a Music member (e.g. Klein+Hummel monitors, Hans Jenny's
cymatics work, Krohn-Hite test gear) keeps it unchanged — for those, `sound`
is not redundant, it's the only sound-related signal.

Targeted TEXT edit only (same discipline as migrate-library-entries.py /
apply-music-membership.py) — handles both front-matter shapes actually used
in this corpus:

    subjects: [time, sound, perception]      (732 entries, inline)
    subjects:
      - sound
      - instruments                          (5 entries, block)

Usage:
    python3 scripts/remove-redundant-sound-subject.py            # dry run
    python3 scripts/remove-redundant-sound-subject.py --apply     # do it

Idempotent: an entry with no `sound` subject (or not a Music member) is
simply skipped.
"""

import argparse
import glob
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

INLINE_RE = re.compile(r"^(subjects:\s*)\[([^\]]*)\](\s*)$")
BLOCK_HEADER_RE = re.compile(r"^subjects:\s*$")
BLOCK_ITEM_RE = re.compile(r"^(\s*-\s*)([a-zA-Z0-9_-]+)(\s*)$")


def is_music_member(text):
    m = re.search(r"^\s*collections:\s*\[([^\]]*)\]\s*$", text, re.M)
    if not m:
        return False
    return "music" in [c.strip() for c in m.group(1).split(",")]


def remove_sound(lines):
    """Returns (changed, became_empty, new_lines) or (False, False, lines) if no sound subject found."""
    for i, line in enumerate(lines):
        stripped = line.rstrip("\n")

        m = INLINE_RE.match(stripped)
        if m:
            prefix, inner, suffix = m.groups()
            items = [c.strip() for c in inner.split(",") if c.strip()]
            if "sound" not in items:
                return False, False, lines
            items = [c for c in items if c != "sound"]
            new_line = f"{prefix}[{', '.join(items)}]{suffix}\n"
            new_lines = lines[:]
            new_lines[i] = new_line
            return True, (len(items) == 0), new_lines

        if BLOCK_HEADER_RE.match(stripped):
            # scan following block-list item lines
            j = i + 1
            item_idxs = []
            found_sound = None
            while j < len(lines):
                im = BLOCK_ITEM_RE.match(lines[j].rstrip("\n"))
                if not im:
                    break
                item_idxs.append(j)
                if im.group(2) == "sound":
                    found_sound = j
                j += 1
            if found_sound is None:
                return False, False, lines
            new_lines = lines[:]
            del new_lines[found_sound]
            remaining = len(item_idxs) - 1
            return True, (remaining == 0), new_lines

    return False, False, lines


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--apply", action="store_true", help="actually patch front matter (default: dry run)")
    args = ap.parse_args()

    candidates = sorted(glob.glob(os.path.join(ROOT, "content/library/entry/*/*/index.md")))

    planned = []
    became_empty = []
    not_music = 0
    no_sound = 0

    for path in candidates:
        with open(path, encoding="utf-8") as f:
            text = f.read()
        if not is_music_member(text):
            not_music += 1
            continue
        lines = text.splitlines(keepends=True)
        changed, empty, new_lines = remove_sound(lines)
        if not changed:
            no_sound += 1
            continue
        planned.append((path, new_lines))
        if empty:
            became_empty.append(path)

    print(f"remove-redundant-sound-subject: {len(candidates)} flat-tree entries scanned")
    print(f"  not a Music member (skip): {not_music}")
    print(f"  Music member, no 'sound' subject (skip): {no_sound}")
    print(f"  to patch: {len(planned)}")
    if became_empty:
        print(f"  subjects becomes EMPTY for {len(became_empty)} entries:")
        for p in became_empty:
            print("   -", os.path.relpath(p, ROOT))

    if not args.apply:
        print(f"\nDry run — {len(planned)} entries would lose the 'sound' subject. Re-run with --apply to execute.")
        return

    for path, new_lines in planned:
        with open(path, "w", encoding="utf-8") as f:
            f.writelines(new_lines)

    print(f"\nRemoved 'sound' subject from {len(planned)} Music-member entries.")


if __name__ == "__main__":
    main()
