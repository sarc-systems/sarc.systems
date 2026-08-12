# Library v2 — architecture

Status: **design doc.** This document is the source of truth for Library v2
terminology, schema, and invariants; CLAUDE.md's Library section is
authoritative wherever the two now conflict (in particular for anything
introduced by the global-Entry-identity migration below — CLAUDE.md's
"Collection membership" subsection is the current word on it). Work order:
`todo_libv2.txt` (repo root, not tracked in git — treat as the originating
brief; this doc is the binding spec going forward).

**Global Entry identity (post-Phase-6 migration).** The original phased plan
below (§§1–14) shipped a Collection registry with THREE production-eligible
Collections — `research` (the original corpus), `manuals` (split out of
`research`), and the non-production `field-kit` genericity fixture — each
still on the single-owning-Collection model this doc originally specified: a
Hugo-adapter Entry's Collection was derived from its storage path, and
`library.id` was unique per-Collection. A subsequent migration broke that
exclusivity for `research`/`manuals` (and added `music` as a fourth
Collection) so one canonical Entry can belong to several Collections at
once — see CLAUDE.md § Library "Collection membership" for the current
model: Entry storage moved to a flat, Collection-independent
`content/library/entry/<public-type>/<slug>/index.md` publishing at
`/library/entry/<slug>/`; membership is an editorial `library.collections:
[...]` front-matter list, validated against the registry; `library.id` is
now globally unique across that flat corpus. **`field-kit` was deliberately
left out of this migration** — it still uses the exact single-owning-
Collection, path-derived model described in §§2–4 below, on purpose, as a
frozen non-production fixture; every place this doc says a Hugo-adapter
Entry's Collection is "derived from the path" is still literally true for
`field-kit`, just no longer true for `research`/`manuals`/`music`. Treat
§§1, 2.2, 2.3, 4.1, and 10.3 below as describing that now-legacy model
(still accurate for `field-kit`) rather than the current one — CLAUDE.md is
authoritative for the current one.

Decisions in this document were made against the *actual* current
implementation (Hugo 0.121+, `hugo.Data.*`, the existing `library-*`
partials and `assets/js/library-{filter,map}.js`), not a clean-slate design —
see "Relationship to the current implementation" at the end for the specific
gaps this closes.

---

## 1. Terminology

Use these terms consistently in code, config, docs, and UI. Do not use
"Shelf" to mean a content directory or an exclusive parent — Shelves overlap
by design.

| Term | Meaning |
|---|---|
| **Library** | The site's `/library/` root. Itself a Collection (the meta-Collection) whose Entries describe other Collections. |
| **Collection** | A bounded corpus of Entries with its own schema, Facets, Shelves, Projections, Views, source, and one Color Plan identity color. |
| **Entry** | One globally canonical thing. Belongs to one or more Collections (`library.collections`, editorial, many-to-many — see CLAUDE.md § Library "Collection membership"; `field-kit` alone still uses the original exactly-one-owning-Collection, path-derived model below). May sit on any number of Shelves per Collection it belongs to. May reference Entries in other Collections. |
| **Shelf** | A named, persistent, possibly-overlapping selection of Entries within one Collection. Does not own Entries. |
| **Filter** | A temporary user constraint (today: Type, Subject — Collection-defined facets in v2). |
| **Facet** | A filterable field a Collection declares (e.g. Research: type/subject; a future Music collection: format/year/label/genre). |
| **Projection** | Transforms a focus set into a displayed set: may add context Entries, collapse/aggregate/derive relationships, or suppress hubs. Declares which Views it's compatible with. |
| **View** | An interchangeable renderer of a projected result (Catalog, Images, Map today). |
| **Focus set** | The result of Collection corpus → Shelves → Filters. What Catalog/Images normally show. |
| **Displayed set** | The result of applying a Projection to the focus set. What Map (and future Views) show — may include Context Entries. |
| **Context Entry** | An Entry included by a Projection to support display (e.g. a credited person shown around a Shelf of records) without being a member of that Shelf. |
| **Cross-Collection reference** | A `relations`/`creators[].ref` pointing at an Entry namespaced into a different Collection. |

Pipeline (unchanged from the work order):

```
Collection corpus → Shelves → Filters → (future: Search) → Focus set
  → Projection → Displayed set → View
```

---

## 2. Routing and storage

### 2.1 URL scheme

Superseded for `research`/`manuals`/`music` — see the note at the top of
this document. Current scheme:

```
/library/                          Library root (meta-Collection)
/library/research/                 the "research" Collection's own Catalog
/library/manuals/                  the "manuals" Collection's own Catalog
/library/music/                    the "music" Collection's own Catalog
/library/entry/<slug>/             any Entry's one canonical URL, regardless
                                    of which Collection(s) it belongs to
/library/field-kit/                the field-kit fixture (unchanged, below)
/library/field-kit/<slug>/         a field-kit Entry (unchanged, below)
```

The scheme originally specified here — `/library/<collection>/<slug>/` per
Entry — is what `field-kit` still uses, unmigrated.

**No aliases from the pre-v2 flat URLs** (`/library/<slug>/`). Confirmed with
the site owner: the site is live but not linked or advertised anywhere yet,
so existing URLs can move without redirects. Phase 4 is a plain `git mv`,
not an alias-preserving migration.

### 2.2 Storage convention (legacy — `field-kit` only)

`field-kit`'s Entries still use exactly this convention, unmigrated:

```
content/library/<collection>/<public-type>/<slug>/index.md
```

e.g. `content/library/field-kit/tool/tuning-fork-set/index.md`. Its
Collection id is still **derived from the path** — the first path segment
under `content/library/` — mirroring how `public_type` is derived from the
*next* segment down, checked by `library-validate.html`'s storage-folder
guard for exactly this Collection (see §9).

`research`/`manuals`/`music` Entries instead live at the flat, Collection-
independent `content/library/entry/<public-type>/<slug>/index.md`, and
declare membership explicitly via `library.collections: [...]` — see
CLAUDE.md § Library "Collection membership" for the current model.

### 2.3 Permalinks

The rule (`hugo.toml`), unchanged since it was first generalized:

```toml
[permalinks.page]
  library = "/library/:sections[1]/:contentbasename/"
```

`:sections[1]` is a Hugo **section** token — it walks the section tree
(directories with their own `_index.md`), not raw path segments — so it
still resolves `field-kit`'s Entries to `/library/field-kit/<slug>/`
exactly as originally specified here. `research`/`manuals`/`music` Entries
now live under `content/library/entry/`, which has its own (non-rendered:
`build: {render: never, list: never}`) `_index.md` purely so "entry" is a
real section — the same token then resolves them to
`/library/entry/<slug>/`. No per-Collection permalink config exists or is
needed for either case. The public-type segment (`concept/`, `tool/`, …) is
dropped from the URL in both cases — editorial organization only, never
part of the address.

The Library root itself (`/library/`) and each Collection's own root
(`/library/research/`, `/library/music/`, …) are Hugo **section list
pages** (`_index.md`), not covered by the `permalinks.page` rule above
(that rule only applies to leaf bundles). Each carries `type: library` so
it resolves to the same `layouts/library/list.html` / `list.json`
templates as every other Collection and the root — see §4.

---

## 3. Collection registry

Canonical registry: **`data/library/collections.yaml`**.

```yaml
collections:
  - id: research
    title: SARC Research
    description: >
      Historical, conceptual, technical, and artistic references
      surrounding SARC.
    color: forest              # data/colorplan.json slug — never raw hex
    source:
      adapter: hugo
      section: library/research
    views:
      enabled: [catalog, images, map]
      default: map
    projections:
      default: all
    build:
      production: true
```

Field notes:

- `id` — must equal the path segment used in storage (§2.2) and route
  (§2.1) for `adapter: hugo` Collections. Validated (§9).
- `color` — must resolve to an existing `data/colorplan.json` `colors[].slug`.
  No raw hex, ever, anywhere in this file. See §7.
- `source.adapter` — see §8. `research`'s adapter is `hugo`; `source.section`
  is the content path segment it owns.
- `views.enabled` — the Views this Collection's data can support *at all*.
  Intersected with a Projection's own `views` at render time (§6.4).
- `projections.default` — every Collection implicitly has an `all`
  Projection (§6); this names which Projection loads with no
  `?projection=` in the URL.
- `build.production` — `false` keeps a Collection (e.g. a future personal
  Discogs import, or the Phase 6 fixture) out of production builds without a
  full visibility/auth subsystem. Gating happens at the same point
  `library-collect.html` gathers entries (§5): a non-production Collection
  is simply excluded from the collected set when `hugo.IsProduction` is true.

This file does not replace `data/library.yaml` — that remains the shared
default vocabulary (types, public_types, subjects, roles, relations, access
kinds, rights), used by `research` (no `vocabulary:` field), `manuals`, and
`music` alike (both also unset — a deliberate, documented simplification
for now, see CLAUDE.md § Library "Vocabulary"; a flat-tree Entry always
resolves this shared vocabulary regardless of which of the three it belongs
to). A Collection with a different ontology gets its **own** vocabulary
file under `data/library/vocabularies/<name>.yaml`, referenced from its
registry entry's `vocabulary:` field — `field-kit` is the one Collection
that does this today. The registry itself only ever holds Collection-level
metadata (identity, color, views, source, build), never a duplicate of a
Collection's internal vocabulary.

---

## 4. Normalized Collection contract

The shared browser (Catalog/Images/Map partials + `library-filter.js` +
`library-map.js`) consumes exactly one shape, regardless of source adapter:

```jsonc
{
  "collection": {
    "id": "research",
    "title": "SARC Research",
    "color": "forest",
    "description": "…"
  },
  "entries": [ /* Entry[], see §4.1 */ ],
  "relationships": [ /* derived at read time from creators[]/related[], see §4.2 */ ],
  "shelves": [ /* Shelf[], see §5 */ ],
  "facets": [ /* Facet[], see §6.1 */ ],
  "projections": [ /* Projection[], see §6.2 */ ],
  "views": ["catalog", "images", "map"]
}
```

This is the JSON shape emitted at `/library/<collection>/index.json` and at
`/library/index.json` (the root — see §11). It is **generated by the Hugo
adapter today**; a future non-Hugo adapter (Discogs, BibTeX, …) must produce
the identical shape, so nothing downstream needs to know or care where the
data came from. The browser (templates + JS) must never import a Hugo page
object directly outside the adapter boundary (§8).

### 4.1 Entry contract — superseded for `research`/`manuals`/`music`

The shape below (collection-local `id`, a singular `collection` field, a
synthesized `{collection}:{id}` namespaced form for cross-Collection
references) was never actually implemented for ref resolution — every real
lookup (`library-creators.html`, `library-related.html`,
`library-works.html`, `list.json`) always resolved `library.id` globally,
site-wide, regardless of Collection. The subsequent migration made the
*storage/identity* model match that reality instead of the other way
round: `library.id` is now genuinely globally unique across the flat
`research`/`manuals`/`music` corpus, and `collection` (singular) became
`collections` (plural, an entry's actual membership list). Current shape
(see CLAUDE.md § Library "Collection membership" / "JSON index"):

```jsonc
{
  "id": "david-tudor",                    // globally unique
  "collections": ["research"],            // every Collection this Entry belongs to
  "title": "David Tudor",
  "type": "person",
  "public_type": "person",
  "summary": "…",
  "year": null,
  "url": "/library/entry/david-tudor/",   // one canonical URL regardless of membership
  "images": [ /* unchanged shape */ ],
  "creators": [ /* unchanged shape */ ],
  "subjects": [ /* unchanged shape */ ],
  "access": [ /* unchanged shape */ ],
  "related": [ /* unchanged shape */ ],
  "shelves": ["staff-picks"],             // resolved Shelf membership, see §5.4
  "source": {"adapter": "hugo"}
}
```

`field-kit` alone keeps the original shape (singular `collection`,
collection-local id) — it was never migrated.

### 4.2 Relationships

Derived, not stored: one relationship per `creators[].ref` (`kind: creator`)
and per `related[].ref` (`kind: related`), exactly as `library-map.js`
already builds its edge list today (see §12) — this section documents that
existing behavior as part of the normalized contract rather than changing
it. Refs are bare `library.id` values, resolved globally — see §4.3.

### 4.3 Namespaced identity — not implemented, and no longer planned

This section originally specified a `{collection}:{id}` synthesized
namespaced form for cross-Collection references. It was never built (every
real ref-resolution call site always did a flat, global lookup by bare
`library.id`), and the global-Entry-identity migration removes the need
for it outright: since `library.id` is now genuinely unique across the
whole `research`/`manuals`/`music` corpus, a bare id is already
unambiguous everywhere — `ref: herbert-brun` is sufficient regardless of
which Collection(s) the referencing and referenced Entries belong to. See
CLAUDE.md § Library "Entry identity."

---

## 5. Shelves

Shelves are named, persistent, **overlapping** selections within one
Collection, normalized into one membership representation before rendering
regardless of authoring method.

### 5.1 Entry-declared

```yaml
shelves: [staff-picks, core-references]
```

(Top-level front-matter field on an Entry, same tier as today's `subjects`.)

### 5.2 Rule-based

```yaml
id: paperface
title: Paperface Era
filter:
  era: paperface
```

`filter` matches against Entry facet values (§6.1) — Collection-defined
fields, not hardcoded to `type`/`subject`.

### 5.3 Curated

```yaml
id: essential-serge
title: Essential Serge
include: [serge:dusg, serge:ssg, serge:vcfq]
```

### 5.4 Combined, and membership precedence

```yaml
id: sarc-relevant
title: SARC-Relevant
filter:
  subjects: {includes: cybernetics}
include: [serge:quadrature-oscillator]
exclude: [serge:unrelated-entry]
```

Precedence, computed once per Collection at build/normalization time:

```
membership = (rule matches ∪ explicit includes ∪ entry-declared)
             − explicit excludes
```

Explicit exclusion always wins. Shelves are stored as a Collection-level
list (`data/library/<collection>-shelves.yaml`, or inline in the Collection's
own data file — exact location is a Phase 5 implementation detail, not
fixed here) plus whatever `shelves:` front matter Entries declare.

### 5.5 Combination and UI

Multiple **active** Shelves combine by union/OR (a broader selection, not a
narrower one). Shelves render as toggleable controls (checkboxes/chips),
never as directory navigation — consistent with how Type/Subject already
render as `.rf-chip` controls today (`library-filters.html`).

---

## 6. Facets, Projections, Views

### 6.1 Facets

Each Collection declares its own Facets; the shared engine renders Facet
controls from that declaration rather than hardcoding Type/Subject. For
`research`, the Facet declaration is effectively `data/library.yaml`'s
`types`/`public_types` (as Type) and `subjects` (as Subject) — expressed
generically so a future Collection's Facets (format/year/label/genre;
era/function/designer/manufacturer) plug into the identical rendering and
filtering code path. Facet combination semantics (unchanged from today,
generalized):

```
multiple Shelves                     OR
multiple values within one Facet     OR
different Facets                     AND
future text search                   AND (once implemented)
```

### 6.2 Projections

Every Collection has an implicit `all` Projection (identity transform, no
context Entries added). Additional Projections are declared per Collection:

```yaml
projections:
  - id: all
    title: All Entries
    views: [catalog, images, map]
    default_view: catalog
  - id: personnel
    title: Personnel Network
    views: [map, table]
    default_view: map
```

A Projection may: choose Entry types, choose relationship types, add
Context Entries, collapse/aggregate Entries, derive relationships, suppress
high-degree hubs, apply minimum relationship weights, expose
temporal/tabular structures. **None of this is implemented beyond `all` in
this work order** — Phase 5 adds the mechanism and config surface; new
non-`all` Projections beyond what's needed to prove the mechanism are out of
scope.

### 6.3 Views

A View registry, not per-Collection template branching:

```
Catalog, Images, Map   (implemented)
Timeline, Table, Matrix, Geographic Map, Small Multiples   (future — not implemented)
```

Conceptual contract (implementation may differ in exact call shape, but the
separation must hold):

```js
render({
  collection, focusEntries, displayedEntries, relationships,
  shelves, filters, projection, selection, state
})
```

### 6.4 Collection × Projection View compatibility

```
effective views = Collection.views.enabled ∩ Projection.views
```

When switching Projection:

1. keep the current View if it's in the new effective set;
2. else use the Projection's `default_view`;
3. else use the first view in the effective set;
4. update the URL deterministically (`replaceState`, not a new history entry,
   matching today's "invalid values are removed through replaceState" rule).

No colors are configured for Views or Projections (§7).

---

## 7. Color Plan integration

- Collection identity color is the **only** new color concept in v2. It
  must be a `data/colorplan.json` `colors[].slug` — validated at build time
  (§9) against the actual generated palette, not a hand-maintained copy of
  valid slugs.
- Collection color identifies: Collection cards at `/library/`, Collection
  nodes in the root Map, active-Collection context/accents, Collection
  badges, ownership rings on cross-Collection Map nodes.
- Collection color does **not** replace: Entry-type styling
  (`public_type_styles`, unchanged — color+shape per public type, §12),
  selection/hover state, community/measurement encodings, relationship
  styling, or accessibility labels.
- Cross-Collection Map treatment (§12.3): node fill/shape = Entry type
  (existing `public_type_styles` mechanism, unchanged); outer ring/border/badge
  = owning Collection color (new).
- Shelves, Views, and Projections do not get persistent identity colors in
  v2 (explicit non-goal, matching the work order).
- The existing `data/palette.yaml` `sections.library: forest` assignment is
  **unchanged** — that's the Library *section's* site-chrome accent (nav,
  breadcrumbs, `--signal` per `palette-vars.html`), a separate mechanism
  from per-Collection identity color and not something this doc touches.
  The Library root stays visually neutral per the work order: it does not
  assert one dominant Collection color over its children.

---

## 8. Source adapters

The adapter boundary:

> **The adapter owns:** source parsing, stable source ids, source-specific
> metadata, normalization into the §4 contract, provenance, caching.
>
> **The browser owns:** Collections, Shelves, Filters, Projections, Views,
> selection, URL state, presentation.

Source-specific logic must never leak into a View implementation
(`library-map.js`, `library-filter.js`, the `library-*` render partials).

**Implemented in this work order:** the Hugo adapter —
`content/library/<collection>/**/index.md` (+ each Collection's own vocab
data file) → normalized contract, via a generalized `library-collect.html` /
`list.json` pair parameterized by Collection instead of hardcoded to
`Section "library"` (Phase 2).

**Documented, not implemented:** Discogs CSV + API, BibTeX, RIS, Zotero
export, academic-library CSV, YouTube API, local PDF directory, manual
YAML/JSON. Each would be a script or Hugo data-transform step that emits the
§4 contract (or a `data/library/<collection>.json` a Hugo template reads
directly) and registers itself in `collections.yaml` with the matching
`source.adapter` value. Multi-source reconciliation within one Collection is
out of scope.

---

## 9. Validation

Extends `library-validate.html` (today's structure — data-driven checks
against `hugo.Data.library`, run once via `partialCached` — already
generalizes cleanly; only the storage-folder check and the `Section
"library"` collect-scope are hardcoded to a single root and need real
restructuring, not just extension — see §13). New/changed checks, all build
failures unless noted:

- Duplicate Collection `id` in `collections.yaml`.
- Duplicate Entry `id`, globally, across the flat `research`/`manuals`/
  `music` corpus (superseded — see §4.1/§4.3 and CLAUDE.md § Library "Entry
  identity"; `field-kit` alone still scopes this per-Collection).
- Missing/invalid `library.collections` on a flat-tree Entry (superseded —
  see §10.3): empty, names an unregistered Collection, or has a duplicate.
- Unknown Collection referenced (root-level Collection relationships, §12.3).
- Unknown Shelf id referenced by a `?shelf=` URL param or config.
- Invalid Shelf `include`/`exclude` reference (an id that doesn't resolve
  within that Shelf's Collection).
- Unknown Projection id.
- Unknown View id.
- Projection/View incompatibility in config (a Projection naming a View its
  Collection doesn't enable at all — impossible to ever satisfy).
- Invalid `default_view` (not in the Projection's own `views`).
- Collection `color` not a real `data/colorplan.json` slug.
- Broken cross-Collection Entry reference: **warning**, not failure (§4.3) —
  the target Collection may not exist yet in this work order.
- Storage-folder / route collision: two Collections claiming the same `id`
  or route prefix.

---

## 10. Entry front matter

### 10.1 Unchanged fields

No change to the shape of `creators`, `subjects`, `images`, `access`,
`related`, `summary`, `year`, `weight`, `sort_title`, `draft` — all remain
top-level front matter (`Params.X`), exactly as today. **This is a
deliberate decision, not an oversight**: CLAUDE.md's prose currently implies
a more unified `library:`-nested block than the code actually has (only
`id`/`type`/`sarc_work` are nested); v2 does not "fix" this by rewriting
front matter across all 737 existing Entries, since that would be an
unrelated, purely mechanical content migration the work order explicitly
warns against ("avoid unrelated ontology changes"). CLAUDE.md's Library
section is corrected to describe the actual shape when it's rewritten in
Phase 4.

### 10.2 New: `shelves`

```yaml
shelves: [staff-picks, core-references]
```

Optional, top-level, same tier as `subjects` (§5.1).

### 10.3 `library.collections` — superseded

This section originally specified that Collection membership was derived
from storage path only, with no front-matter field for it. That's still
literally true for `field-kit`, but no longer true in general: a flat-tree
Entry (`research`/`manuals`/`music`) carries an explicit, editorial
`library.collections: [id, ...]` list — many-to-many, validated against
`data/library/collections.yaml`, order-independent. See CLAUDE.md § Library
"Collection membership" for the current field shape and validation rules.

---

## 11. The Library root

`/library/` is a Collection whose Entries are **Collection-summary
records**, one per registered Collection (including itself is *not*
included — the root doesn't list itself). Each Collection-summary Entry
exposes, per the work order:

```jsonc
{
  "id": "research",
  "collections": ["library"],       // owning collection is the meta-collection itself
  "public_type": "collection",      // a new public type, root-only
  "title": "SARC Research",
  "summary": "…",                   // from collections.yaml `description`
  "url": "/library/research/",
  "images": [ /* representative image, where available */ ],
  "facets": {"color": "forest"},
  "extra": {
    "entry_count": 737,
    "views_enabled": ["catalog", "images", "map"],
    "source_description": "…"
  }
}
```

Rendered through the **same** Catalog/Images/Map partials and the same
`library-map.js` as any Collection — the root is not a bespoke page. This is
possible because those partials already consume the normalized §4 contract
generically; the root's `/library/index.json` is generated by the same
`list.json` template, scoped to the Collection registry instead of a
Collection's own Entries (Phase 2/3 implementation: `list.json` gains a
"what am I listing" parameter — either "the entries of Collection X" or
"the registered Collections themselves").

Root Map nodes are Collections; root-level Collection-to-Collection
relationships are **explicitly authored** (a new small config, e.g. a
`relations:` list in `collections.yaml` or a sibling file) — automatic
derivation from lower-level cross-Collection Entry references is explicitly
deferred (work order non-goal).

Initial root Views: Catalog, Images, Map — same set as any Collection,
enabled the same way (`views.enabled` — the root is configured in
`collections.yaml` too, or a reserved `library` pseudo-Collection entry).

---

## 12. Map generalization

`library-map.js` (2718 lines) needs **no change to its fetch, physics,
rendering, or interaction model** to support multiple Collections — see
§12.1. Two specific pieces of hardcoded SARC-vocabulary need to move to
data (§12.2), and one new rendering rule is additive (§12.3).

### 12.1 Already collection-agnostic (confirmed, no change needed)

- Graph data fetch is `new URL("index.json", location.href)` — **relative
  to the embedding page**, so a Map embedded on `/library/research/`
  already fetches `/library/research/index.json` and one embedded on
  `/library/` already fetches `/library/index.json`, with zero code change.
- Node color/shape are read entirely from the fetched `public_type_styles`
  dict at runtime — never hardcoded per type.
- Community detection, force layout, selection hierarchy, hover, preview
  cards, bridge panel: all operate on the fetched graph generically, with
  no reference to SARC-specific type/relation strings anywhere in that code.

### 12.2 Must move from hardcoded JS to data (Phase 2)

- `HUB_TYPES = { person: true, group: true, organization: true }` (JS
  literal) → becomes a `hub: true` field on the relevant rows of each
  Collection's own `public_types`-equivalent vocabulary, exported through
  that Collection's `public_type_styles` (already fetched at runtime) as
  `{..., hub: true}`. `library-map.js` reads `typeStyles[n.publicType].hub`
  instead of a hardcoded object.
- `RELATION_CATEGORY` (JS map, full duplicate of `data/library.yaml`'s
  `relation_types` → structural/historical/contextual) → becomes a
  `category` field added to each Collection's own `relation_types` entries,
  exported as `relation_category` in that Collection's `/index.json`
  (sibling to the existing `relation_inverse` export, which is already
  passed through unused today — see Explore findings). `library-map.js`
  reads `data.relation_category[kind] || "contextual"`. Unmapped relation
  types keep the existing graceful fallback to `"contextual"`.

This is required, not optional, for the Phase 6 fixture (§14) to render
correctly with its own type/relation vocabulary — without it, the fixture's
hub sizing and edge line-styles would silently and incorrectly inherit
SARC's specific vocabulary.

### 12.3 New: cross-Collection boundary nodes

When a Collection's graph includes an Entry actually owned by a different
Collection (a `related`/`creators[].ref` target resolving to a namespaced
id in another Collection, §4.3):

- node fill/shape: unchanged — still driven by that Entry's own
  `public_type` (i.e. what kind of thing it is), per §12.2's existing
  mechanism.
- **new**: an outer ring/border in the *owning* Collection's identity
  color (§7), so it's visually distinguishable from a locally-owned node of
  the same public type at a glance.
- clicking navigates to the Entry's real canonical URL (in its owning
  Collection), same as today's node-click-navigates behavior.
- **not implemented**: importing the entire external Collection's other
  Entries/edges, aggregating Entry-level cross-Collection references into
  Collection-to-Collection edges, or drilling into aggregated evidence — all
  explicit work-order non-goals.

No other Map behavior changes: selection never pans/zooms/recenters/moves
nodes/reheats the simulation (unchanged); deterministic seeded layout
(unchanged); existing Map URL params (`view`, `select`) behavior intact.

---

## 13. Relationship to the current implementation (gap list)

Concrete deltas the Explore survey found, each mapped to the phase that
closes it:

| Current behavior | Location | Gap | Closed in |
|---|---|---|---|
| `Section "library"` hardcoded as the entire corpus membership test | `library-collect.html` | No notion of "which Collection" | Phase 2 |
| `list.json` / `/library/index.json` is a single fixed endpoint | `layouts/library/list.json` | Needs to be re-invocable per Collection + once for the root | Phase 2/3 |
| Storage-folder check assumes `content/library/<public-type>/<slug>/`, depth 2 | `library-validate.html` | Needs depth 3 (`<collection>/<public-type>/<slug>/`) | Phase 2 |
| `library.id` required globally unique site-wide | `library-validate.html` | Relaxed to unique-within-collection; namespaced id synthesized, not stored | Phase 2 |
| `where site.RegularPages "Params.library.id" .` — global unscoped ref lookup | `list.json`, `library-works.html`, `library-related.html`, `single.html` | Needs Collection-scoped lookup (and cross-Collection lookup by namespaced id) | Phase 2 |
| Hardcoded `/library/` links (breadcrumb, type/subject filter links, back-nav) | `layouts/library/single.html` | Needs to derive its own Collection's root path | Phase 4 |
| Single static `"Library"` nav entry | `hugo.toml` `[[menus.main]]` | Fine as-is — `/library/` still the one nav entry; Collections are discovered *within* the Library root, not each promoted to top nav | No change needed |
| `HUB_TYPES`, `RELATION_CATEGORY` hardcoded JS | `assets/js/library-map.js` | Move to data, per Collection | Phase 2 (§12.2) |
| Front matter nests only `id`/`type`/`sarc_work` under `library:` | all Entries | Documented as intentional, not "fixed" | §10.1 (no code change) |

---

## 14. Genericity fixture (Phase 6)

A small, deliberately non-SARC-shaped Collection, `build.production: false`,
proving the engine holds no Collection-specific assumptions:

**"Field Kit"** — a handful of everyday-object Entries (6–10), its own
types (`tool`, `material`, `container`) mapped to its own public types, its
own Facets (`material`, `era`, `condition`), two overlapping Shelves
(`"Bench Stock"`, `"Loaned Out"`), an `all` Projection (Catalog/Images/Map)
and a second Projection restricted to `catalog` only, a handful of
relationships, and a Colorplan color distinct from `research`'s. Confirmed
with the site owner (dummy/test data, clearly out of the real catalog's
domain, dev-only).

---

## 15. Non-goals (unchanged from the work order)

Discogs importing, Discogs API auth, academic-service importing, BibTeX/RIS
importing, text search, Timeline/Table/Matrix/Geographic Map Views,
automatic entity reconciliation, automatic alias matching across
Collections, derived Collection-to-Collection relationships, a universal
all-Entries graph, authentication, arbitrary Collection colors, Shelf
colors, View colors, Projection colors, a major Map redesign, unrelated
content-taxonomy migrations, URL aliases for the pre-v2 flat Entry URLs.
