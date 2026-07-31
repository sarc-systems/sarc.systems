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
degree entries, and basic data-integrity checks (duplicate IDs, dangling
refs, unknown relation types/creator roles, near-duplicate titles, missing
metadata) — the same checks the site's own build-time validator
(layouts/partials/library-validate.html) enforces as hard errors, surfaced
here as a browsable report instead. This is a read-only, offline analysis
tool for planning which entries most need connecting — it does not replace
`make check`, which is the authoritative build-time gate.

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
                missing_ref_creator.append((eid, c.get("name", "")))
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
        "", "## Isolated entries (full list)", "",
    ]
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
