#!/usr/bin/env python3
"""
apply-library-subject-audit.py

Applies the approved 2026-08-02 Library Subject audit to
content/library/<public-type>/<slug>/index.md front matter.

Reads an authoritative audit CSV (columns: id, decision, current_subjects,
proposed_subjects, confidence, source_path, plus other reference columns
that are ignored) and, for every row with decision == "change" whose
repository current Subject set matches the CSV's current_subjects set,
rewrites only the top-level `subjects:` field to the CSV's exact
proposed_subjects list (in the given order).

Never touches anything else in the file. Never reserializes the full YAML
front matter. Idempotent: a second --apply run makes zero edits.

Usage:
    python3 scripts/apply-library-subject-audit.py <audit.csv> --check
    python3 scripts/apply-library-subject-audit.py <audit.csv> --apply
    python3 scripts/apply-library-subject-audit.py <audit.csv> --check \
        --report research/library-audit/subject-audit-2026-08-02-application-report.txt
"""

import argparse
import csv
import re
import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    print("ERROR: PyYAML is required (pip install pyyaml)", file=sys.stderr)
    sys.exit(2)

REPO_ROOT = Path(__file__).resolve().parent.parent
LIBRARY_CONTENT = REPO_ROOT / "content" / "library"
VOCAB_FILE = REPO_ROOT / "data" / "library.yaml"

FRONT_MATTER_DELIM = re.compile(r"^---\s*$", re.MULTILINE)
SUBJECTS_LINE = re.compile(r"^subjects:(.*)$")
LIST_ITEM_LINE = re.compile(r"^\s*-\s*(.+?)\s*$")


def load_controlled_vocab():
    with open(VOCAB_FILE, encoding="utf-8") as f:
        data = yaml.safe_load(f)
    subjects = data.get("subjects", [])
    return {s["subject"] for s in subjects}


def normalize_set(items):
    """Normalize a subject list for order-insensitive comparison."""
    return frozenset(s.strip().lower() for s in items if s.strip())


def split_pipe_list(value):
    if value is None:
        return []
    value = value.strip()
    if value == "":
        return []
    return [v.strip() for v in value.split("|") if v.strip()]


class EntryFile:
    """Represents one content/library/<type>/<slug>/index.md file."""

    def __init__(self, path):
        self.path = path
        self.text = path.read_text(encoding="utf-8")
        self.library_id = None
        self.subjects = None
        self.subjects_line_start = None  # index into self.lines
        self.subjects_line_end = None  # exclusive
        self.malformed = False
        self.malformed_reason = None
        self._parse()

    def _parse(self):
        delims = list(FRONT_MATTER_DELIM.finditer(self.text))
        if len(delims) < 2:
            self.malformed = True
            self.malformed_reason = "no front matter delimiters found"
            return
        fm_start = delims[0].end()
        fm_end = delims[1].start()
        fm_text = self.text[fm_start:fm_end]

        try:
            fm_data = yaml.safe_load(fm_text)
        except yaml.YAMLError as e:
            self.malformed = True
            self.malformed_reason = f"YAML parse error: {e}"
            return

        if not isinstance(fm_data, dict):
            self.malformed = True
            self.malformed_reason = "front matter did not parse to a mapping"
            return

        library = fm_data.get("library")
        if isinstance(library, dict):
            self.library_id = library.get("id")
        if not self.library_id:
            self.malformed = True
            self.malformed_reason = "missing library.id"
            return

        subj = fm_data.get("subjects", [])
        if subj is None:
            subj = []
        if not isinstance(subj, list):
            self.malformed = True
            self.malformed_reason = "subjects field is not a list"
            return
        self.subjects = [str(s) for s in subj]

        # Locate the subjects: line(s) within the front matter, in terms
        # of absolute line numbers in the whole file, for surgical replace.
        self.lines = self.text.splitlines(keepends=True)
        # figure out line index of fm_start / fm_end
        fm_start_line = self.text[:fm_start].count("\n")
        fm_end_line = self.text[:fm_end].count("\n")

        found = False
        for i in range(fm_start_line, fm_end_line):
            line = self.lines[i]
            m = SUBJECTS_LINE.match(line.rstrip("\n"))
            if m:
                found = True
                rest = m.group(1).strip()
                if rest != "":
                    # inline form: subjects: [a, b] or subjects: []
                    self.subjects_line_start = i
                    self.subjects_line_end = i + 1
                else:
                    # multiline list form
                    j = i + 1
                    while j < fm_end_line and LIST_ITEM_LINE.match(
                        self.lines[j].rstrip("\n")
                    ):
                        j += 1
                    self.subjects_line_start = i
                    self.subjects_line_end = j
                break
        if not found:
            self.malformed = True
            self.malformed_reason = "could not locate subjects: line for editing"

    def render_subjects_line(self, subjects):
        if not subjects:
            return "subjects: []\n"
        return "subjects: [" + ", ".join(subjects) + "]\n"

    def apply_subjects(self, subjects):
        """Return new full file text with subjects field replaced."""
        new_line = self.render_subjects_line(subjects)
        new_lines = (
            self.lines[: self.subjects_line_start]
            + [new_line]
            + self.lines[self.subjects_line_end :]
        )
        return "".join(new_lines)


def enumerate_entries():
    """Return dict: library_id -> EntryFile, plus lists of malformed/dupes."""
    id_to_entry = {}
    duplicates = []
    malformed = []
    for path in sorted(LIBRARY_CONTENT.glob("*/*/index.md")):
        entry = EntryFile(path)
        if entry.malformed:
            malformed.append((path, entry.malformed_reason))
            continue
        if entry.library_id in id_to_entry:
            duplicates.append(
                (entry.library_id, id_to_entry[entry.library_id].path, path)
            )
            continue
        id_to_entry[entry.library_id] = entry
    return id_to_entry, duplicates, malformed


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("csv_path", help="Path to the authoritative audit CSV")
    mode = ap.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true", help="Dry-run mode")
    mode.add_argument("--apply", action="store_true", help="Write changes")
    ap.add_argument("--report", help="Optional path to write a text report")
    args = ap.parse_args()

    controlled_vocab = load_controlled_vocab()

    # Load CSV
    csv_rows = []
    with open(args.csv_path, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            csv_rows.append(row)

    exit_code = 0
    hard_block = False  # blocks --apply even for otherwise-clean rows
    report_lines = []

    def log(line=""):
        print(line)
        report_lines.append(line)

    # --- Duplicate IDs in CSV ---
    seen_ids = {}
    dup_csv_ids = []
    for row in csv_rows:
        rid = row["id"]
        if rid in seen_ids:
            dup_csv_ids.append(rid)
        seen_ids[rid] = row
    if dup_csv_ids:
        log(f"ERROR: duplicate audit CSV ids: {sorted(set(dup_csv_ids))}")
        exit_code = 1
        hard_block = True

    # --- Unknown subjects in CSV proposed/current ---
    invalid_subjects = []
    for row in csv_rows:
        for col in ("current_subjects", "proposed_subjects"):
            for s in split_pipe_list(row.get(col, "")):
                if s not in controlled_vocab:
                    invalid_subjects.append((row["id"], col, s))
    if invalid_subjects:
        log(f"ERROR: invalid subjects found in CSV: {invalid_subjects}")
        exit_code = 1
        hard_block = True

    # --- Enumerate repo entries ---
    id_to_entry, duplicates, malformed = enumerate_entries()
    if duplicates:
        log(f"ERROR: duplicate library.id in repository: {duplicates}")
        exit_code = 1
        hard_block = True
    if malformed:
        log(f"ERROR: malformed entries: {malformed}")
        exit_code = 1
        hard_block = True

    repo_ids = set(id_to_entry.keys())
    audit_ids = set(row["id"] for row in csv_rows)

    missing_ids = sorted(audit_ids - repo_ids)
    extra_ids = sorted(repo_ids - audit_ids)

    if missing_ids:
        # Reported per spec, but does not block applying the otherwise-clean
        # rows: a missing id means that one entry cannot be resolved/edited
        # (and its row is excluded from files_changed below), not that the
        # whole run is untrustworthy.
        log(f"ERROR: audit ids not found in repository ({len(missing_ids)}): {missing_ids}")
        exit_code = 1

    # --- Process rows ---
    change_rows = [r for r in csv_rows if r["decision"] == "change"]
    retain_rows = [r for r in csv_rows if r["decision"] == "retain"]
    other_decision_rows = [
        r for r in csv_rows if r["decision"] not in ("change", "retain")
    ]

    files_changed = []
    already_applied = []
    conflicts = []
    retain_mismatches = []
    zero_subject_entries = []
    unresolved_rows = []

    for row in csv_rows:
        rid = row["id"]
        entry = id_to_entry.get(rid)
        if entry is None:
            unresolved_rows.append(rid)
            continue

        current_repo_norm = normalize_set(entry.subjects)
        csv_current_norm = normalize_set(split_pipe_list(row.get("current_subjects", "")))
        csv_proposed_list = split_pipe_list(row.get("proposed_subjects", ""))
        csv_proposed_norm = normalize_set(csv_proposed_list)

        if row["decision"] == "retain":
            if current_repo_norm != csv_current_norm:
                retain_mismatches.append(
                    (rid, sorted(current_repo_norm), sorted(csv_current_norm))
                )
            continue

        if row["decision"] != "change":
            continue

        if current_repo_norm == csv_proposed_norm:
            # Already applied (or coincidentally already correct) — no edit.
            already_applied.append(rid)
            continue

        if current_repo_norm != csv_current_norm:
            conflicts.append(
                (rid, sorted(current_repo_norm), sorted(csv_current_norm))
            )
            continue

        # Apply
        files_changed.append((rid, entry.path, entry.subjects, csv_proposed_list))
        if len(csv_proposed_list) == 0:
            zero_subject_entries.append(rid)

    if conflicts:
        log(f"CONFLICTS (current-state mismatch, skipped) [{len(conflicts)}]:")
        for rid, cur, csv_cur in conflicts:
            log(f"  {rid}: repo={cur} csv_current={csv_cur}")
        exit_code = 1
        hard_block = True

    if retain_mismatches:
        log(f"NOTE: retain rows where repo subjects differ from CSV current_subjects [{len(retain_mismatches)}]:")
        for rid, cur, csv_cur in retain_mismatches:
            log(f"  {rid}: repo={cur} csv_current={csv_cur}")

    # --- Report summary ---
    log("")
    log("=== Subject Audit Application Report ===")
    log(f"Audit rows read: {len(csv_rows)}")
    log(f"Change rows: {len(change_rows)}")
    log(f"Retain rows: {len(retain_rows)}")
    if other_decision_rows:
        log(f"Other-decision rows (unexpected): {len(other_decision_rows)}")
    log(f"Files to change: {len(files_changed)}")
    log(f"Already-applied rows: {len(already_applied)}")
    log(f"Conflicts: {len(conflicts)}")
    log(f"Missing audit ids (not in repo): {len(missing_ids)}")
    log(f"Additional repository entries ignored (post-audit): {len(extra_ids)}")
    if extra_ids:
        log(f"  {extra_ids}")
    log(f"Invalid subjects in CSV: {len(invalid_subjects)}")
    log(f"Entries ending with zero subjects: {len(zero_subject_entries)} -> {zero_subject_entries}")

    unresolved_change_rows = [
        rid for rid in unresolved_rows
        if seen_ids.get(rid, {}).get("decision") == "change"
    ]
    expected_changed = (
        len(change_rows)
        - len(already_applied)
        - len(conflicts)
        - len(unresolved_change_rows)
    )
    if len(files_changed) != expected_changed:
        log(
            f"WARNING: files_changed ({len(files_changed)}) != change_rows - already_applied - conflicts ({expected_changed})"
        )

    log("")
    if files_changed:
        log(f"Entries to modify [{len(files_changed)}]:")
        for rid, path, old, new in files_changed:
            log(f"  {rid}: {old} -> {new}")

    # --- Write files if --apply ---
    if args.apply:
        if hard_block:
            log("")
            log("ABORTING apply: hard-blocking errors present above (duplicate/invalid ids, invalid subjects, malformed entries, or conflicts). Fix and re-run.")
        else:
            for rid, path, old, new in files_changed:
                entry = id_to_entry[rid]
                new_text = entry.apply_subjects(new)
                path.write_text(new_text, encoding="utf-8")
            log("")
            log(f"APPLIED: wrote {len(files_changed)} files.")

    if args.report:
        Path(args.report).write_text("\n".join(report_lines) + "\n", encoding="utf-8")

    if exit_code == 0 and (missing_ids or dup_csv_ids or invalid_subjects or duplicates or malformed or conflicts):
        exit_code = 1

    return exit_code


if __name__ == "__main__":
    sys.exit(main())
