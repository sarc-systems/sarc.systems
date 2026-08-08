# Library v2 — architecture

Status: **design doc, phased implementation in progress.** This document is
the source of truth for Library v2 terminology, schema, and invariants. It
supersedes the single-Collection description of the Library in CLAUDE.md
until the migration (Phase 4) lands, at which point CLAUDE.md's Library
section is rewritten to match and this note is removed. Work order:
`todo_libv2.txt` (repo root, not tracked in git — treat as the originating
brief; this doc is the binding spec going forward).

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
| **Entry** | One thing in a Collection's corpus. Exactly one canonical owning Collection. May sit on any number of Shelves. May reference Entries in other Collections. |
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

```
/library/                          Library root (meta-Collection)
/library/research/                 the "research" Collection (today's corpus)
/library/research/<slug>/          a research Entry
/library/<collection>/             a future Collection
/library/<collection>/<slug>/      a future Collection's Entry
```

**No aliases from the pre-v2 flat URLs** (`/library/<slug>/`). Confirmed with
the site owner: the site is live but not linked or advertised anywhere yet,
so existing URLs can move without redirects. Phase 4 is a plain `git mv`,
not an alias-preserving migration.

### 2.2 Storage convention

Extends the existing public-type storage convention (source organization
only, never encoded redundantly in the URL) by exactly one level:

```
content/library/<collection>/<public-type>/<slug>/index.md
```

e.g. `content/library/research/concept/feedback/index.md`.

A Hugo-adapter Collection's id is **derived from the path**, not from a
front-matter field — `content/library/<collection>/...`, the first path
segment under `content/library/`. This mirrors exactly how `public_type` is
already derived from the *next* path segment down and checked by
`library-validate.html`'s storage-folder guard (see §9). No new
`library.collection` front-matter field is introduced; front-matter shape
for individual Entries is otherwise **unchanged** (see §10.1).

### 2.3 Permalinks

Today's single rule:

```toml
[permalinks.page]
  library = "/library/:contentbasename/"
```

becomes:

```toml
[permalinks.page]
  library = "/library/:sections[1]/:contentbasename/"
```

`:sections[1]` is the path segment immediately under `content/library/` —
i.e. the collection id — so `content/library/research/concept/feedback/index.md`
→ `/library/research/feedback/`. This generalizes to any future Hugo-adapter
Collection automatically: no per-collection permalink config needed. The
public-type segment (`concept/`) is dropped from the URL exactly as it is
today (editorial organization only).

The Library root itself (`/library/`) and each Collection's own root
(`/library/research/`) are Hugo **section list pages** (`_index.md`), not
covered by the `permalinks.page` rule above (that rule only applies to leaf
bundles). `content/library/research/_index.md` carries `type: library` so it
resolves to the same `layouts/library/list.html` / `list.json` templates as
every other Collection and the root — see §4.

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

This file does not replace `data/library.yaml` — that remains the
`research` Collection's own vocabulary (types, public_types, subjects,
roles, relations, access kinds, rights). A future Collection with a
different ontology gets its **own** vocabulary file (e.g.
`data/library/music.yaml`), referenced from its registry entry. The
registry itself only ever holds Collection-level metadata (identity, color,
views, source, build), never a duplicate of a Collection's internal
vocabulary.

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

### 4.1 Entry contract

```jsonc
{
  "id": "david-tudor",                    // collection-local, stable, unique WITHIN the collection
  "collection": "research",
  "title": "David Tudor",
  "type": "person",                       // Collection-specific type
  "public_type": "person",                // resolved via the Collection's own type→public_type map
  "summary": "…",
  "year": null,
  "url": "/library/research/david-tudor/",
  "images": [ /* unchanged shape */ ],
  "creators": [ /* unchanged shape */ ],
  "subjects": [ /* unchanged shape */ ],
  "access": [ /* unchanged shape */ ],
  "related": [ /* unchanged shape */ ],
  "shelves": ["staff-picks"],             // resolved Shelf membership, see §5.4
  "source": {"adapter": "hugo"}
}
```

`id` stays **collection-local** — today's `library.id` requirement
(globally unique across the whole site) is relaxed to unique-within-collection.
The fully namespaced id used for cross-Collection references and rendering
(§4.3) is synthesized at read time as `"{collection}:{id}"` — it is never
stored as a literal string in front matter. This matches the work order's
"explicit namespaced references are sufficient for v2; do not build a
separate global entity-reconciliation system."

`type`/`public_type` split is unchanged in spirit from today
(`library.type` → `public_type` via each Collection's own vocabulary and its
own `library-public-types`-style resolver) — just no longer assumed to be
*the* one global `data/library.yaml` vocabulary. `research`'s vocabulary
(`data/library.yaml`) is unchanged.

### 4.2 Relationships

Derived, not stored: one relationship per `creators[].ref` (`kind: creator`)
and per `related[].ref` (`kind: related`), exactly as `library-map.js`
already builds its edge list today (see §12) — this section documents that
existing behavior as part of the normalized contract rather than changing
it. A relationship's `target` may be a bare collection-local id (same
Collection) or a fully namespaced id (`other-collection:slug`, §4.3).

### 4.3 Namespaced identity

```
research:david-tudor
serge:dusg
music:discogs-release:12345
manuals:serge-1976
videos:phase-rotation
```

A cross-Collection relationship targets the canonical namespaced Entry id:

```yaml
related:
  - {type: uses, target: serge:serge-modular}
```

No global entity-reconciliation system. An unresolvable cross-Collection
reference is a **build warning**, not a build failure (§9) — the target
Collection may not exist yet.

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
- Duplicate Entry `id` **within a Collection** (was: site-wide).
- Missing/malformed namespaced id on a cross-Collection reference.
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

### 10.3 No new `library.collection` field

Collection membership is derived from storage path for `adapter: hugo`
Collections (§2.2) — not a front-matter field. A future non-Hugo-adapter
Collection has no `content/library/...` bundle at all, so the question
doesn't arise for it.

---

## 11. The Library root

`/library/` is a Collection whose Entries are **Collection-summary
records**, one per registered Collection (including itself is *not*
included — the root doesn't list itself). Each Collection-summary Entry
exposes, per the work order:

```jsonc
{
  "id": "research",
  "collection": "library",          // owning collection is the meta-collection itself
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
