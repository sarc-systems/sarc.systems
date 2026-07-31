#!/usr/bin/env python3
"""Structural report on the Library's relationship graph.

Parses every `content/library/<slug>/index.md` bundle's front matter and
builds an undirected graph from the two ways entries actually connect —
`creators[].ref` (who made it) and `related[].ref` (an editorial cross-
reference) — the same two fields assets/js/library-map.js's Map view draws
from. No inferred edges: this reports exactly what's been explicitly
declared, nothing derived from shared subjects/tags/types.

Uses PyYAML for real front-matter parsing (confirmed available in this
environment — `python3 -c "import yaml"`). This is a different tradeoff from
scripts/audit-library-images.py, which deliberately avoids a PyYAML
dependency after a `pip install pyyaml` failure in a prior environment setup
("externally-managed-environment") — see that script's own docstring. If
PyYAML is ever unavailable here again, a venv or `pipx install pyyaml` is
the fix; this script does not have a regex fallback.

Reports: counts by public/specific type, edge count, connected components
(largest component size/percentage), isolated (zero-edge) entries, highest-
degree entries, basic data-integrity checks (duplicate IDs, dangling refs,
unknown relation types/creator roles, near-duplicate titles, missing
metadata) — the same checks the site's own build-time validator
(layouts/partials/library-validate.html) enforces as hard errors, surfaced
here as a browsable report instead — plus content-quality sections used by
the "librarian" agent (.claude/agents/librarian.md) alongside the connection
work: entries whose body prose is notably short (a thin one-liner rather
than a real researched paragraph), person/group/organization entries with no
image at all (the highest-value image gap — see CLAUDE.md's Library image
rules before ever proposing a fix for this one), and a grouped breakdown of
creator credits with no `ref` (a plain name only) — Librarian Mode D's own
research queue (see .claude/agents/librarian.md), grouping every unresolved
name across the whole catalog, flagging names that exactly match an existing
entry's title (a likely-resolvable candidate — still needs a human/agent to
confirm identity before adding a ref, never auto-matched), and splitting
repeated names (worth research — connects several works at once) from
single-use ones (usually a minor credit, fine to leave as a plain name).
This is a read-only, offline analysis tool for planning what most needs
improving — it does not replace `make check`, which is the authoritative
build-time gate.

Usage: python3 scripts/library-structural-report.py [--json]
  --json   also write a machine-readable dump (research/library-audit/
           structural-report.json) alongside the markdown report, for a
           script or agent that wants to work with the graph programmatically
           rather than re-parsing the markdown.

Writes: research/library-audit/structural-report.md
"""
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
LIBRARY_DIR = ROOT / "content" / "library"
LIBRARY_YAML = ROOT / "data" / "library.yaml"
OUT_MD = ROOT / "research" / "library-audit" / "structural-report.md"
OUT_JSON = ROOT / "research" / "library-audit" / "structural-report.json"


def load_vocab():
    with open(LIBRARY_YAML) as f:
        data = yaml.safe_load(f)
    return {
        "type_to_public": {t["type"]: t["public_type"] for t in data["types"]},
        "relation_types": set(data["relation_types"]),
        "subjects": {s["subject"] for s in data["subjects"]},
        "creator_roles": set(data["creator_roles"]),
    }


def load_entries():
    entries, duplicate_ids, parse_errors = {}, defaultdict(list), []
    for slug in sorted(p.name for p in LIBRARY_DIR.iterdir() if p.is_dir()):
        path = LIBRARY_DIR / slug / "index.md"
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8")
        parts = text.split("---\n", 2)
        if len(parts) < 3:
            parse_errors.append((slug, "no front matter delimiters"))
            continue
        try:
            fm = yaml.safe_load(parts[1])
        except Exception as e:  # noqa: BLE001 - report and keep going
            parse_errors.append((slug, str(e)))
            continue
        if not fm or "library" not in fm:
            continue
        lib = fm["library"]
        eid = lib.get("id", slug)
        if eid in entries:
            duplicate_ids[eid].append(slug)
        body = parts[2].strip() if len(parts) > 2 else ""
        entries[eid] = {
            "slug": slug,
            "title": fm.get("title", ""),
            "type": lib.get("type", ""),
            "sarc_work": lib.get("sarc_work", False),
            "creators": fm.get("creators") or [],
            "related": fm.get("related") or [],
            "subjects": fm.get("subjects") or [],
            "images": fm.get("images") or [],
            "draft": fm.get("draft", False),
            "body_words": len(body.split()),
        }
    return entries, duplicate_ids, parse_errors


def build_graph(entries, vocab):
    edges, dangling, unknown_rel, unknown_role, missing_ref_creator = [], [], [], [], []
    for eid, e in entries.items():
        for c in e["creators"]:
            if not isinstance(c, dict):
                continue
            role = c.get("role")
            if role and role not in vocab["creator_roles"]:
                unknown_role.append((eid, role))
            ref = c.get("ref")
            if ref:
                if ref in entries:
                    edges.append((ref, eid, "creator", role or ""))
                else:
                    dangling.append((eid, "creators", ref))
            else:
                missing_ref_creator.append((eid, c.get("name", ""), role or ""))
        for r in e["related"]:
            if not isinstance(r, dict):
                continue
            rel, ref = r.get("relation"), r.get("ref")
            if rel and rel not in vocab["relation_types"]:
                unknown_rel.append((eid, rel))
            if ref:
                if ref in entries:
                    edges.append((eid, ref, "related", rel or ""))
                else:
                    dangling.append((eid, "related", ref))
    return edges, dangling, unknown_rel, unknown_role, missing_ref_creator


def connected_components(entries, edges):
    adj = defaultdict(set)
    for a, b, _kind, _label in edges:
        adj[a].add(b)
        adj[b].add(a)
    visited, components = set(), []
    for eid in entries:
        if eid in visited:
            continue
        stack, comp = [eid], []
        visited.add(eid)
        while stack:
            cur = stack.pop()
            comp.append(cur)
            for nb in adj[cur]:
                if nb not in visited:
                    visited.add(nb)
                    stack.append(nb)
        components.append(comp)
    components.sort(key=len, reverse=True)
    degree = {eid: len(adj[eid]) for eid in entries}
    return components, degree


def main():
    want_json = "--json" in sys.argv
    vocab = load_vocab()
    entries, duplicate_ids, parse_errors = load_entries()
    edges, dangling, unknown_rel, unknown_role, missing_ref_creator = build_graph(entries, vocab)
    components, degree = connected_components(entries, edges)
    isolated = [c[0] for c in components if len(c) == 1]
    single_edge = [eid for eid in entries if degree[eid] == 1]

    by_public, by_specific = Counter(), Counter()
    for e in entries.values():
        by_specific[e["type"]] += 1
        pub = vocab["type_to_public"].get(e["type"])
        if pub:
            by_public[pub] += 1

    title_norm = defaultdict(list)
    for eid, e in entries.items():
        norm = re.sub(r"[^a-z0-9]", "", e["title"].lower())
        title_norm[norm].append(eid)
    dup_titles = {k: v for k, v in title_norm.items() if len(v) > 1}

    top_degree = sorted(degree.items(), key=lambda kv: -kv[1])[:20]
    total = len(entries)

    # A rough, deliberately simple heuristic — not a quality judgment, just
    # "worth a second look": a real researched paragraph in this catalog's
    # own house style typically runs 60-150+ words; anything at or under 25
    # reads as a thin one-liner stub. False positives (a legitimately
    # concise, complete entry) are expected and fine — a human/agent still
    # reads the actual text before deciding to expand anything.
    SHORT_BIO_THRESHOLD = 25
    short_bios = sorted(
        (eid for eid, e in entries.items() if e["body_words"] <= SHORT_BIO_THRESHOLD),
        key=lambda eid: entries[eid]["body_words"],
    )

    # Missing images, scoped to the public types where a portrait/likeness
    # is the highest-value gap (person/group/organization) — images are
    # optional generally (see CLAUDE.md), and a Work/System/Concept/Place/
    # Event entry with no image is routine, not a gap worth flagging here.
    PORTRAIT_PUBLIC_TYPES = {"person", "group", "organization"}
    missing_portrait_image = sorted(
        eid for eid, e in entries.items()
        if not e["images"] and vocab["type_to_public"].get(e["type"]) in PORTRAIT_PUBLIC_TYPES
    )

    # Unresolved creator credits, grouped by normalized name — Librarian
    # Mode D's research queue (see .claude/agents/librarian.md). Grouping
    # (not just listing) is the point: the same real name typically recurs
    # verbatim in front matter across several works, so a plain per-credit
    # list would make a single frequently-credited person look like several
    # unrelated one-off mentions.
    def norm_name(name):
        return re.sub(r"\s+", " ", name.strip().lower())

    by_creator_name = defaultdict(list)  # normalized name -> [(eid, role), ...]
    display_name = {}  # normalized name -> an actual as-written name, for display
    for eid, name, role in missing_ref_creator:
        if not name:
            continue
        key = norm_name(name)
        by_creator_name[key].append((eid, role))
        display_name.setdefault(key, name)

    title_lookup = {norm_name(e["title"]): eid for eid, e in entries.items() if e["title"]}
    exact_title_candidates = sorted(
        (key for key in by_creator_name if key in title_lookup),
        key=lambda k: -len(by_creator_name[k])
    )
    repeated_unresolved = sorted(
        (key for key in by_creator_name if len(by_creator_name[key]) >= 2),
        key=lambda k: -len(by_creator_name[k])
    )
    single_use_unresolved = sorted(
        (key for key in by_creator_name if len(by_creator_name[key]) == 1),
        key=lambda k: display_name[k].lower()
    )

    lines = [
        "# Library Structural Report",
        "",
        f"Generated by `scripts/library-structural-report.py`. Total entries: **{total}**",
        "",
        "## Counts by public type", "",
    ]
    lines += [f"- {pt}: {n}" for pt, n in by_public.most_common()]
    lines += ["", "## Counts by specific type", ""]
    lines += [f"- {t}: {n}" for t, n in by_specific.most_common()]
    lines += [
        "", "## Relationship graph", "",
        f"- Total edges (creators + related, deduplicated by direction): {len(edges)}",
        f"- Connected components: {len(components)}",
        f"- Largest component size: {len(components[0]) if components else 0}"
        f" ({(len(components[0]) / total * 100) if total else 0:.1f}% of graph)",
        f"- Isolated entries (0 edges): {len(isolated)}",
        f"- Entries with exactly 1 edge: {len(single_edge)}",
        "", "## Top 20 highest-degree entries", "",
    ]
    lines += [f"- {eid} ({entries[eid]['type']}): {d}" for eid, d in top_degree]
    lines += [
        "", "## Data integrity", "",
        f"- Duplicate `library.id` values: {len(duplicate_ids)} "
        + (str(dict(duplicate_ids)) if duplicate_ids else "(none)"),
        f"- Dangling relationship references: {len(dangling)} "
        + ("\n  " + "\n  ".join(f"{a} --{field}--> {b}" for a, field, b in dangling) if dangling else "(none)"),
        f"- Unknown relation types used in content: {len(unknown_rel)} "
        + (str(unknown_rel) if unknown_rel else "(none)"),
        f"- Unknown creator roles used in content: {len(unknown_role)} "
        + (str(unknown_role) if unknown_role else "(none)"),
        f"- Parse errors: {len(parse_errors)} " + (str(parse_errors) if parse_errors else "(none)"),
        f"- Duplicate/near-duplicate normalized titles: {len(dup_titles)}",
    ]
    lines += [f"  - {v}" for v in dup_titles.values()]
    lines += [
        "", "## Missing metadata", "",
        f"- Entries with no subjects: {sum(1 for e in entries.values() if not e['subjects'])}",
        f"- Entries with no images: {sum(1 for e in entries.values() if not e['images'])}"
        " (expected to be common — images are optional)",
        f"- Creator credits with no `ref` (plain name only): {len(missing_ref_creator)}",
        "",
        "## Creator credits without refs", "",
        "Librarian Mode D's research queue (see .claude/agents/librarian.md) "
        "— grouped by normalized name so a person credited on several works "
        "shows up once, not as several unrelated one-off mentions. This is "
        "for research prioritization only: never treat a match here as "
        "confirmed identity without checking it.",
        "",
        f"### Exact existing-title candidates ({len(exact_title_candidates)})", "",
        "An unresolved credit whose name exactly matches an existing "
        "entry's title — a likely candidate for adding `ref`, but confirm "
        "identity before doing so (a same-named different person/entity is "
        "possible, if less common).",
        "",
    ]
    lines += [
        f"- \"{display_name[k]}\" -> candidate: {title_lookup[k]} — "
        + ", ".join(f"{eid} ({role})" if role else eid for eid, role in by_creator_name[k])
        for k in exact_title_candidates
    ]
    lines += [
        "", f"### Repeated unresolved creators ({len(repeated_unresolved)})", "",
        "Credited on 2+ works — worth researching even without an obvious "
        "existing-entry match, since resolving the name once connects "
        "every work it appears on.",
        "",
    ]
    lines += [
        f"- \"{display_name[k]}\" — {len(by_creator_name[k])} credits: "
        + ", ".join(f"{eid} ({role})" if role else eid for eid, role in by_creator_name[k])
        for k in repeated_unresolved
    ]
    lines += [
        "", f"### Single-use unresolved creators ({len(single_use_unresolved)})", "",
        "Credited on exactly one work — usually a minor/one-off credit; "
        "most of these are fine to leave as a plain name (see the hard "
        "rules in .claude/agents/librarian.md Mode D before creating an "
        "entry for one).",
        "",
    ]
    lines += [
        f"- \"{display_name[k]}\" — {by_creator_name[k][0][0]}"
        + (f" ({by_creator_name[k][0][1]})" if by_creator_name[k][0][1] else "")
        for k in single_use_unresolved
    ]
    lines += [
        "",
        f"## Short bios (body prose <= {SHORT_BIO_THRESHOLD} words) — candidates for expansion", "",
        "A heuristic, not a judgment — read the actual entry before deciding "
        "it needs work; some legitimately concise entries will show up here.",
        "",
    ]
    lines += [
        f"- {eid} ({entries[eid]['type']}, {entries[eid]['body_words']} words): \"{entries[eid]['title']}\""
        for eid in short_bios
    ]
    lines += [
        "", "## Person/group/organization entries with no image", "",
        "Scoped to the public types where a portrait/likeness is the "
        "highest-value image gap — see CLAUDE.md's Library image rules "
        "(credit vs source, rights status) before proposing a fix for any "
        "of these; portraits prefer black-and-white when there's a genuine "
        "choice of sourced options.",
        "",
    ]
    lines += [
        f"- {eid} ({entries[eid]['type']}): \"{entries[eid]['title']}\""
        for eid in missing_portrait_image
    ]
    lines += ["", "## Isolated entries (full list)", ""]
    lines += [f"- {eid} ({entries[eid]['type']}): \"{entries[eid]['title']}\"" for eid in sorted(isolated)]

    OUT_MD.parent.mkdir(parents=True, exist_ok=True)
    OUT_MD.write_text("\n".join(lines) + "\n")
    print(f"Total entries: {total}")
    print(f"Components: {len(components)}  Largest: {len(components[0]) if components else 0}")
    print(f"Isolated: {len(isolated)}")
    print(f"Report written to {OUT_MD.relative_to(ROOT)}")

    if want_json:
        OUT_JSON.write_text(json.dumps({
            "entries": {
                eid: {
                    "title": e["title"], "slug": e["slug"], "type": e["type"],
                    "public_type": vocab["type_to_public"].get(e["type"]),
                    "creators": e["creators"], "related": e["related"], "degree": degree[eid],
                }
                for eid, e in entries.items()
            },
            "components": components,
            "isolated": isolated,
        }, indent=2))
        print(f"Machine-readable dump written to {OUT_JSON.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
