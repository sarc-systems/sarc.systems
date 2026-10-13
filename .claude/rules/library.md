---
paths:
  - "content/library/**"
  - "data/library.yaml"
  - "data/library/**"
  - "layouts/library/**"
  - "layouts/partials/library-*"
  - "assets/js/library-*"
  - "assets/css/library.css"
  - "archetypes/library-entry.md"
  - "scripts/audit-library-images.py"
---

<!-- Moved verbatim from the root CLAUDE.md; loads only when working on Library files. -->

## Library

> **Library v2 landed, then Entry identity went global.** All six phases of
> the original multi-Collection architecture (Library as a meta-Collection,
> `research` as the first child Collection, per-Collection vocabularies,
> Shelves, Projections, and a non-production genericity fixture proving
> none of it is SARC-Research-specific) are implemented — see
> `docs/library-v2.md` for the full target architecture and terminology,
> and the "Library v2 — Collections, Shelves, Projections" subsection below
> for a summary of what's new. A subsequent migration then broke that
> architecture's original assumption that every Entry has exactly one
> owning Collection: an Entry's canonical storage/identity is now
> Collection-independent, and it declares its membership in one or more
> Collections explicitly — see "Collection membership" below, which is
> authoritative over `docs/library-v2.md` wherever the two disagree.
> Production Collections today: `research` (the original corpus),
> `manuals`, and `music`; `field-kit` (non-production) is a **deliberate
> exception** — it was left on the original one-Collection-per-Entry,
> path-derived model, unmigrated, on purpose (see below). `/library/` is
> the meta-Collection root. **What's not yet cleaned up**: this section's
> older prose (Map view internals, image handling, etc. — mostly unchanged
> in behavior by either migration) still doesn't weave Shelves/Projections/
> multi-membership into every relevant paragraph — treat "Collection
> membership" below as authoritative wherever it conflicts with older prose
> elsewhere in this section.

**Each Collection is one unified catalog of entries** — a growing research
collection and small knowledge graph, not a set of shelves in the old sense
of directory-like sections (Library v2's own `Shelf` concept, below, is a
different thing — a named, overlapping, non-exclusive selection, never a
directory). There are no public Writings / References / Manuals / Sources /
Reading / Links sections. Anything durable SARC wants to identify, annotate,
connect, preserve, or point toward is an *entry*: essays, books, manuals,
people, groups, organizations, recordings, releases, compositions, films,
lectures, websites, software, instruments, systems, documents. Type, subject,
and access are **metadata and filters, never sections.** Section colour is
**Forest** (in `data/palette.yaml`; never hardcoded — this is the Library
section's own site-chrome accent, separate from a Collection's own identity
color, below). `research`'s vocabulary lives in `data/library.yaml` — the
single source of truth for its own templates, filters, JSON index,
archetype, and validation; a different Collection may have its own
independent vocabulary instead (see "Library v2" below).

**Collection membership — global canonical Entry storage/identity, many-to-
one no longer, many-to-many instead.** A Library-owned entry (`research`,
`manuals`, or `music` — the three Collections on this model) is stored at
`content/library/entry/<public-type>/<slug>/index.md` — grouped by public
type only (person, group, organization, work, system, place, concept,
event; see "Public Type vs Specific Type" below) purely for editorial
navigability, **never by Collection**: storage no longer implies or limits
which Collection(s) an entry belongs to. Every such entry publishes at one
canonical, Collection-independent URL, `/library/entry/<slug>/` (e.g.
`/library/entry/david-tudor/`) — never a Collection-prefixed one. Which
Collection(s) an entry belongs to is purely editorial data, its own
front-matter field:

```yaml
library:
  id: david-tudor
  type: person
  collections: [research]          # or [research, music], etc.
```

`collections` names one or more ids from `data/library/collections.yaml`,
validated (non-empty, no duplicates, every id must exist); order is
editorial only and never affects behavior. Membership is **never derived**
from type, subject, creator, title, filesystem directory, or the
relationship graph — always this explicit list. Do not duplicate an entry
into multiple content bundles to represent multi-Collection membership —
one canonical bundle, `collections` naming everywhere it belongs. A
Collection's own Catalog/Images/Map gathers its members by scanning for
this field (`library-collect.html`), not by directory prefix.

The flat URL is a Hugo `[permalinks]` config (`hugo.toml`,
`library = "/library/:sections[1]/:contentbasename/"`) unchanged since
Library v2 — `:sections[1]` is a Hugo *section* (a directory with its own
`_index.md`), which is why entries live under `content/library/entry/`
specifically: that directory has its own non-rendered `_index.md`
(`build: {render: never, list: never}`) purely so "entry" is a real
section and `:sections[1]` resolves to it, producing `/library/entry/
<slug>/`. No type subfolder exists for `content/library/entry/<public-type>/`
itself (no `_index.md` there) — Hugo generates a page only where one
exists, so the type folders never produce their own list pages.
`layouts/partials/library-validate.html` fails the build if an entry's
storage folder doesn't match its derived public type, or its
`library.collections` names an unregistered Collection or is empty.
Taxonomy changes (a specific-type edit that changes the derived public
type) require moving the bundle to the new type folder via `git mv` — but
never require changing the published URL, since neither a Collection nor
the public-type folder appears in it. A canonical entry page shows its
memberships as plain metadata (`Collections → Research · Music`, each
linking to that Collection's own root) — never one visually "primary"
Collection, and never a query-string/JS trick to fake a contextual
breadcrumb; the page itself stays fully context-independent regardless of
where a visitor arrived from. The Library **root** (`/library/`, with no
Collection segment) is the meta-Collection itself — see `docs/library-v2.md`
§ 11 and "Library v2" below. It does not host Entries of its own the way
`/library/research/` etc. do; its own "Entries" are Collection-summary
records, one per production-eligible registered Collection.

**`field-kit` is the one deliberate exception.** The non-production
genericity fixture (below) was left entirely on the *original*
Library v2 model — storage at `content/library/field-kit/<public-type>/
<slug>/index.md`, one exclusively-owned Collection derived from that path,
publishing at `/library/field-kit/<slug>/` — unmigrated, on purpose: it's
a small, frozen, non-production fixture, and migrating it too would mix 8
fictional entries into the same physical folders as real people/works for
no benefit. `library-resolve-collection.html`/`library-collect.html`/
`library-validate.html` all support both models simultaneously via a
union, not a replacement, of the old path-derived mechanism and the new
membership-list mechanism — this is not an inconsistency to "eventually
fix," it's how `field-kit` stays a stable, working proof of the engine's
genericity without being pulled into every future evolution of the
production Collection model.

**Stable identity.** Every entry stored under `content/library/entry/` has
a `library.id` unique **globally**, across the whole `research`/`manuals`/
`music` corpus together (not the title, URL, slug, or path — entries never
move, since storage is Collection-independent). Relationships
(`creators[].ref`, `related[].ref`) resolve through this bare `library.id`,
globally, regardless of which Collection(s) either side belongs to — there
is no namespaced `<collection>:<id>` form, and none is needed now that ids
are genuinely unique site-wide. `field-kit`'s ids remain scoped to
`field-kit` alone, isolated from the global corpus (consistent with it
being unmigrated). The old `reference_id` is gone; validation rejects it.
`library.id` is exposed in markup (`<article data-library-id="…">`) so a
future comment system can key to it.

**Library v2 — Collections, Shelves, Projections.** The Library is a
*recursive modular collection browser*, not a single fixed corpus — see
`docs/library-v2.md` for the full architecture and terminology. Summary of
what's new (all implemented; consult that doc, not this paragraph, for
detail that will drift less):

- **Collection** — a bounded corpus with its own schema/vocabulary, Facets,
  Shelves, Projections, Views, source, and one stable Colorplan identity
  color. Registered in `data/library/collections.yaml`. `research` is the
  original corpus; `manuals` was split out of it; `music` is a curated
  musical corpus built on the global Entry model (see "Collection
  membership" above — all three share one flat Entry storage/identity, an
  Entry choosing which it belongs to via `library.collections`);
  `field-kit` is a small non-production fixture, deliberately left on the
  original one-Collection-per-Entry model, proving the engine holds for a
  genuinely different domain (see below). A Collection's identity color
  shows as a left-rule accent on its
  Collection-summary Catalog card and as that Collection's own node fill on
  the root Map (`assets/js/library-map.js` prefers an entry's own declared
  `color` over the shared per-public-type color for exactly this reason) —
  never asserted as one dominant color over the Library root itself, which
  stays neutral.
- **Per-Collection vocabulary** — `data/library.yaml` is the shared default
  vocabulary (types, public_types, subjects, creator_roles, relation_types,
  access_kinds, rights vocab) used by `research`, `manuals`, and `music`
  alike (all three leave `vocabulary:` unset in the registry — a
  deliberate simplification for now, since an Entry with memberships in
  Collections that used genuinely different vocabularies is an unsolved
  general problem; see "Collection membership" above), not necessarily a
  site-wide global one. A Collection
  declaring `vocabulary: <name>` in its registry row gets an entirely
  independent vocabulary from `data/library/vocabularies/<name>.yaml`
  instead — different specific types, different (and not necessarily
  eight) public types, different subjects, different creator roles and
  relation types. Resolved per-page by `library-vocab.html`/
  `library-page-context.html`; `library-public-types.html` takes a
  vocabulary as input rather than assuming the global one, and every
  `partialCached` call site varies its cache key by vocabulary name.
- **Shelf** — a named, persistent, overlapping selection of Entries within
  one Collection (`data/library/shelves/<collection>.yaml`), never a
  directory or an exclusive parent. Three authoring methods, normalized
  into one membership rule (`library-entry-shelves.html`):
  `(rule matches ∪ explicit includes ∪ entry-declared) − explicit excludes`,
  explicit exclusion always winning. Multiple active Shelves combine by
  union/OR, same as multiple values within one Facet; different Facets
  still combine by AND. Renders as toggleable chips (`Shelf` fieldset in
  the existing Filter disclosure) exactly like Type/Subject, with the same
  "don't show an empty facet" rule — `research` has no Shelves defined yet,
  so nothing renders there; `field-kit`'s three overlapping Shelves
  (`Bench Stock`, `Fragile Items`, `Mara's Essentials`) are the live
  demonstration. Full URL state (`?shelf=a,b`).
- **Projection** — transforms a Collection's focus set (corpus after
  Shelves/Filters) into a displayed set for a View; every Collection has at
  least the implicit `all` Projection (identity transform). A Projection
  declares which Views it's compatible with; the *effective* Views at any
  moment are `Collection.views.enabled ∩ Projection.views`. Switching
  Projection resolves the current View through `resolveProjectionView()`
  (`assets/js/library-filter.js`): keep it if still compatible, else the
  Projection's own `default_view`, else its first View — and hides any View
  button the new Projection doesn't support. The Projection chip row (next
  to View, reusing the same `.rf-facet`/`.rf-chip` styling) only renders
  once a Collection has more than the implicit `all` — `field-kit`'s
  `inventory` Projection (Catalog only) is the live demonstration:
  selecting it auto-switches away from Map/Images and hides both buttons.
- **The `field-kit` fixture** (`content/library/field-kit/`,
  `build.production: false` in the registry, kept out of production via
  `cascade: [{draft: true}]` on its own `_index.md` — Hugo excludes draft
  content entirely from a build without `-D`; the registry flag is the
  human-readable marker of that fact, not the enforcement mechanism) is 8
  fictional entries (a technician, a workshop, a container, three tools,
  two materials) with their own vocabulary, Shelves, Projections,
  relationships, and creator credits, used to prove none of the above is
  secretly SARC-Research-specific. Visit `/library/field-kit/` directly
  with `make dev` — it deliberately never appears as a card on the Library
  root, in any environment, so it doesn't need to be mentally filtered out
  of the real catalog while browsing.
- **Root Map cross-Collection halo** — a boundary node (an Entry that
  belongs to at least one Collection *other* than the one a given Map
  belongs to — including, now, an Entry with real multi-Collection
  membership, or a cross-Collection `creators[].ref`/`related[].ref` such
  as the `manuals` Klein + Hummel UE-100 manual crediting the `research`
  Klein + Hummel Organization) draws an outer ring in one foreign
  Collection's color, on top of its own normal type-driven fill/shape
  (`drawCollectionHalo()` in `library-map.js`, checking membership in
  `collectionIds` rather than equality against a single value). When a
  node has more than one foreign membership, only the first foreign
  Collection's color is drawn — a deliberate simplification, not an
  oversight.

**Cross-site inclusion.** A canonical page elsewhere (a Label release, a Systems
manual, a Studio doc) joins the catalog with `library: { include: true, id: … }`
— no duplication; its canonical URL stays put. In-section pages under
`content/library/` are included implicitly. Dedup by canonical page.

**Unified schema** (only the fields an entry needs):

```yaml
library:
  id: the-expanding-universe
  type: album          # one of data/library.yaml types (person, book, manual, album, essay, website, system, …)
  sarc_work: false     # true if produced by SARC — a filter axis, not a shelf
creators:              # who made it; drives internal links + reverse "works"
  - {ref: laurie-spiegel, name: "Laurie Spiegel", role: artist}
subjects: [computation, time, sound]        # controlled; see below
images:                # ordered; first = primary (thumbnail + featured + OG)
  - {file: "cover.jpg", alt: "Front cover", caption: "", credit: "", source: "", role: cover, anchor: Top}
access:                # where to find it (many per entry); url/file exclusive
  - {label: "Bandcamp", kind: bandcamp, url: "https://…"}
  - {label: "Download PDF", kind: hosted-file, file: "manual.pdf"}
related:               # editorial links: {ref, relation}
  - {ref: meta-hodos, relation: discusses}
weight:  sort_title:                       # optional catalog ordering
```

- **type** — nested under `library` (never Hugo's top-level `type`). One primary
  per entry (full list in `data/library.yaml`). Presentation adapts to it; there
  is no section per type. For agents: **`person`** = an individual (Xenakis,
  Turing, Merzbow — there is no `artist` type; `artist` survives only as a
  creator *role*); **`group`** = a band / ensemble / collective (AMM, Kraftwerk);
  **`organization`** = an institution / label / studio (GRM, Frog Peak).
- **sarc_work** — independent of type (a SARC manual and a third-party manual are
  both `type: manual`). Previously powered a visible *Origin* filter; that
  facet is removed from the UI for now (still a valid field, still in the
  JSON index) and can come back the same way Type/Subject work if wanted.
- **subjects** — a small controlled vocabulary (why it matters to SARC).
  **`time` is deliberately broad** (chronology, duration, rhythm, cycles, scale,
  memory, simultaneity, historical time) — not `chronology`. Don't add casually.
- **creators / related** — the knowledge graph (see below).
- **images** — ordered; the first is the primary. No separate cover/image/
  thumbnail fields; array order alone decides the primary. Per-image fields:
  `file` (required, bundle-relative), `alt` (required unless `decorative: true`),
  optional `caption` / `credit` / `source` / `role` / `rights`, and optional
  **`anchor`** (`Center` default; `Top`, `Smart`, … ) controlling the
  square-thumbnail crop focus (use `Top` when a centred crop cuts through a
  portrait's head). Images live in the bundle and are resolved through Hugo
  resources — never hotlink or auto-republish third-party artwork.

  **`credit` vs `source` — different claims, never invent either.** A
  **source** is the exact page where the image was obtained or its
  provenance can be verified — an official artist/estate/publisher/label/
  archive/museum page, a Wikimedia Commons *file description* page, the
  exact Bandcamp/Discogs/Goodreads record, the exact article. Not a bare
  homepage, a search-results page, `google.com`, or (when a contextual page
  exists) a raw CDN image URL. A **credit** is who actually made or
  legitimately supplies the image — a photographer, designer, archive, or
  "SARC" — and is optional: leave it absent rather than naming the *site
  you found the image on* (a platform is a `source`, essentially never a
  `credit`). Optional per-image `rights.status` (`sarc-owned`,
  `public-domain`, `licensed`, `permitted`, `unknown` — a separate, smaller
  vocabulary from the hosted-file `rights.status` below) records what's
  actually known about the image's *copyright condition*, without implying a
  legal determination that hasn't been made; pair `licensed`/`permitted` with
  a `note` explaining the basis. **`rights` is not where a rationale for use
  goes** — a separate optional `use.basis` (`identification`, `editorial`,
  `promotional`, `fair-use`, `archival`) plus `use.note` records *why* SARC is
  using an image whose rights aren't sarc-owned/public-domain/licensed/
  permitted (an official cover shown to identify an edition, a manual diagram
  kept for archival documentation, etc). Keeping these separate means the
  schema never implies more legal certainty than a `use.basis` alone
  provides. Examples:

  ```yaml
  # photograph, creator known
  - {file: cover.jpg, alt: "...", credit: "Photograph by Kira Perov",
     source: "https://composers-inside-electronics.net/..."}
  # cover artwork, edition matters — rights unknown, used for identification
  - {file: cover.jpg, alt: "...", role: cover,
     caption: "Penguin Audio edition.", source: "https://...",
     rights: {status: unknown},
     use: {basis: identification, note: "Publisher cover art used for identification."}}
  # analytical diagram — not the original score
  - {file: fig.jpg, alt: "...", role: diagram,
     credit: "Analytical diagram by Pierre Couprie",
     caption: "A later analysis, not the original manuscript.", source: "https://..."}
  # SARC-owned photograph
  - {file: photo.jpg, alt: "...", credit: "SARC", rights: {status: sarc-owned}}
  # provenance genuinely unresolved — honest, not a guess
  - {file: portrait.jpg, alt: "...", source: "https://...",
     rights: {status: unknown, note: "Photographer not yet established."}}
  ```

  Build-time validation (`library-validate.html`) fails on a bare-homepage/
  Google/malformed `source`, an invalid `rights.status` or `use.basis`, or a
  `licensed`/`permitted`/`public-domain` claim with no note or source to back
  it — and warns (without failing) on a platform-name `credit`, a missing
  `source`, a raw-CDN `source`, or an unresolved `rights.status`.
  `make library-image-audit` (`scripts/audit-library-images.py`) gives an
  offline, non-network report of the same, for auditing beyond what a single
  build run surfaces — see that script's docstring for exactly what it does
  and does not cover.
- **access** — how to reach the thing; storage location never sets the type.

**Knowledge graph.** `creators[].ref` (another entry's `library.id`) links the
name and **automatically** grows a *Works in the Library* section on that entry
(reverse of `creators[].ref`) — never hand-maintain work lists. A creator with a
`name` but no `ref` is fine. `related` renders *Related in the Library* and is
**bidirectional**: a relation declared on one entry also appears on its target,
labelled by the inverse (`data/library.yaml` `relation_inverse`, e.g. a
composer's `part-of GRM` shows as *Member* on GRM) — so declare an affiliation
once, on either side. Creator attribution uses `creators`, never `related`.
Partials: `library-{creators,works,related}.html`.

**Landing** (`layouts/library/list.html`): intro → **View**/**Filters**
(`.library-controls` — Type/Subject, Clear, result count, and the View switch
stack as two rows, View above Filter, so opening the Filter disclosure only
ever grows the block downward and never shifts or crowds View. Filter is
collapsed by default behind a native `<details>`/`<summary>`,
no custom disclosure JS; `library-filter.js` sets `open` explicitly on every
load/history navigation — true when the URL already carries an active filter,
false otherwise, overriding whatever a browser's own reload/history-state
restoration would otherwise leave it at) → **All entries** (ruled records with
thumbnails). **Filter** by type + subject: OR within a facet, AND across;
shareable `?type=a,b&subject=c`; history-aware; Clear; polite `aria-live`
count. Without JS the whole catalog is visible and `.library-controls`
(Filter + View) is hidden entirely (CSS-gated on `data-nojs`) — Catalog is
the complete no-JS fallback. Records carry `data-type` / `data-subjects` /
`data-library-id`.

**Catalog / Images / Map view switch.** A presentation toggle, not a second
page or a gallery — it changes what's visible, never the underlying entry
set. **Catalog** is the existing ruled records; **Images** shows only the
primary images of the currently matching entries, same filters, same order,
same crop; **Map** is the force-directed relationship diagram (see its own
section below). Catalog and Images both render from one entry collection at
build time (`#library-list` / `#library-image-index`, see
`library-image-index.html`) and both call the same `library-thumbnail.html`
partial for image resolution — this is the only place that resolves an
entry's primary image into a thumbnail, so the two views can never end up
with a different derivative, crop, or size. Sizing is one shared CSS custom
property, `--library-thumbnail-size` (set once, redefined at the mobile
breakpoint) — the Catalog thumbnail's `width`/`height` and the Images grid's
item `width`/`height` both read it, so changing one changes both by
construction. **Map is the default view** — state is `?view=catalog|images`
in the URL, but an absent or invalid `view` resolves to Map, not Catalog or
Images (the switch lists Map first for the same reason); `library-filter.js`
only ever adds `view=catalog` or `view=images` to the URL, never `view=map`.
One script (`library-filter.js`) owns View/Type/Subject state, filters both
result collections, and updates a view-aware result count (`"N entries · M
with images"` in Images view; `"0 images among N matching entries"` when none
match; Catalog and Map share the same plain count). Entries with no image are
simply omitted from the Images grid (Catalog still lists them normally) —
never a placeholder. The whole view switch requires JS (there is no
server-rendered Images or Map view), so it's hidden under `data-nojs` exactly
like the filter form; Catalog remains the complete no-JS fallback. Reuses
`.rf-facet`/`.rf-chip` styling — no new visual theme.

**Map view (experimental).** A third View option — `layouts/partials/library-map-view.html`
(`#library-map`) + `assets/js/library-map.js`. A restrained research diagram of
**explicit editorial relationships only** — never a knowledge graph, semantic
search, similarity/recommendation engine, or automatic clustering. Every edge
is something SARC actually declared in front matter: `creators[].ref` (a
person/group credited on a work) and `related[].ref` (carrying its
`data/library.yaml` relation type through, e.g. `part-of`, `influenced-by`,
`documents`). Nothing is inferred from shared subjects/tags. Rendered on two
stacked `<canvas>` elements — a background layer for the full graph, and a
small interaction layer on top for hover-only decoration (see "Render/
interaction" below) — a from-scratch rewrite of an earlier SVG
implementation; treat the specific numbers below as replaceable, not
load-bearing, but the two-layer Canvas architecture itself is current.

*Layout.* Full, genuinely force-directed, and deterministic: every node's
initial position is a **seed** derived from its own stable `library.id` (a
small hash → seeded PRNG, never `Math.random()`), so the same graph produces
substantially the same layout on every reload. The WHOLE visible graph
settles as ONE continuous simulation (`forceIterationWithCentering()`) —
full pairwise repulsion between every visible node, not scoped to a
connected component, is what keeps disconnected clusters and singletons
visually separated; an earlier design ran each component's own small local
simulation and packed the results afterward, which read as an ugly,
physics-less jump no matter how it was eased (direct user feedback) —
inter-component spacing is now an emergent property of the same repulsion
that untangles each component's own edges, the way mainstream interactive
force graphs (Obsidian, Gephi, d3-force) work. Repulsion is deliberately
**exact O(n²) pairwise**, not a Barnes-Hut/grid many-body approximation —
tried and rejected: aggregating a spread-out cluster into one center-of-mass
point systematically undercounts true inverse-square repulsion against
anything outside it (Jensen's inequality), which silently broke "disconnected
components stay separated" in testing on two 20-node clusters (exact
pairwise correctly grew their separation; both a quadtree and a uniform-grid
approximation instead pulled them closer together) — a real property this
file's own header calls load-bearing, not a micro-optimization worth the
risk. Edge springs pull each pair back toward `BASE_K` (the one spacing
constant governing every visible node's repulsion), scaled per edge by its
category (`SPRING_CATEGORY_MULT`: structural full strength, contextual the
loosest, historical between — the same three-way category also used for
line style below, now also expressed physically). Collision uses a
**static** radius per node (precomputed once in `buildGraph()`, larger for
image-capable nodes regardless of whether they're currently rendering as an
image — see Image nodes below), resolved via a dedicated spatial-grid pass
(`resolveOverlapsOnce()`) rather than folded into the O(n²) force loop.
`relayout(visibleIds)` is the one orchestrator for both the initial load and
every filter change: recompute adjacency/communities (below) → on the true
first call only, synchronously fit the viewport to the just-seeded (not yet
settled) positions, before anything has painted — waiting until the settle
finished could land the fit at whatever moment happened to finish, which if
the user had already clicked something read as an unexplained little zoom
seemingly caused by their selection → settle the whole visible graph
continuously (`runContinuousSettle()`, below) → once genuinely converged,
rebuild the spatial index and community hulls (`finishRelayout()`). A filter
change gets spatial continuity because the settle is **warm-started** from
current positions, not re-seeded — survivors keep roughly where they were.

The settle itself follows the standard alpha-decay convergence model (1 →
~0 over the course of a settle, the same shape d3-force's own long-tuned
defaults use, reimplemented in plain vanilla JS — see CLAUDE.md's own
"never a JS site framework" rule), animated one tick at a time via
`requestAnimationFrame` rather than a fixed batch of iterations, since a
large densely-connected graph genuinely needs more time to untangle than a
small one; `SIM_SPEED` is a pure playback-speed control, independent of the
convergence math itself. It still comes to a genuine, permanent stop once
alpha decays low enough (`SIM_ALPHA_MIN`) — not a perpetually drifting
physics demo — and then keeps ticking through the SAME animated loop, now
applying direct overlap correction (`resolveOverlapsOnce()`) instead of a
force step, until a pass finds nothing left to resolve, so any final
untangling the user sees is still ordinary settle motion, never a
synchronous jump applied after the fact. That overlap correction also
runs every ordinary tick throughout the settle, not only after alpha
crosses `SIM_ALPHA_MIN` — an earlier version called it only in the
post-alpha phase, and because exponential decay tapers visible motion to
nothing well before alpha numerically crosses that threshold, the settle
would appear to have already finished (the map sitting still for a second
or two) before that phase suddenly started nudging apart whatever
residual overlap — usually in the densest, most contended part of the
graph, near the center — force integration alone hadn't fully resolved,
reading as an unexplained glitch rather than the tail of the same settle.
Resolving overlaps continuously from early on means there's rarely
anything left for the post-alpha phase to actually do by the time it's
reached. `prefers-reduced-motion` runs the identical alpha-decay convergence
synchronously to completion in one pass instead of animating it across
frames — same final layout, no motion. Node type only affects appearance,
never physical placement. **Dragging** a node (press-and-move past a small
threshold, promoting what would otherwise be a plain click) pins it to the
pointer while a moderate reheat (`DRAG_ALPHA`, not a full alpha=1 reset)
keeps the rest of the graph responding to it live — every other node still
feels the dragged node's repulsion/spring pull from wherever it currently
is; only the dragged node itself is exempt from the physics that would
otherwise move it.

A node's on-screen SIZE also communicates structural connectivity — degree
across the WHOLE fetched graph, never just the currently visible/filtered
subset, computed once in `buildGraph()` (a hub shouldn't visibly shrink just
because a filter currently hides some of its neighbors). A nonlinear (sqrt)
mapping, clamped to a `[min, max]` range (`MAP_VISUALS.nodeDegreeScale`),
keeps a few very-high-degree hubs from dominating the composition while
still giving isolated nodes a smaller-but-clearly-visible floor.

**Community fields** — a soft, low-opacity hull drawn behind each
sufficiently large detected *community* (`detectCommunities()`, label
propagation over the currently visible graph, recomputed only when topology
itself changes — a relayout, never per settle-tick or per drag). Not the
same thing as a connected component: an edge only ever exists between two
nodes already in the same component, so components alone could never
distinguish a "local" edge from a longer-range one. Deliberately the
simplest well-known community algorithm that actually subdivides one large
component (no npm dependency exists or is allowed here), using
SYNCHRONOUS/Jacobi-style label updates specifically — an earlier
asynchronous version verifiably failed on the simplest adversarial case (two
dense cliques joined by a single bridge edge), since one clique's label
could flood the whole far clique within a single pass; synchronous updates
need the bridge to survive several full passes first, giving each clique's
own internal majority a real chance to hold. A community below a configured
minimum size simply gets no field — small components and singletons, common
in this graph, stay ordinary and ungrouped, never hidden or flagged. Opacity
is tuned deliberately low (confirmed via an actual browser screenshot, not
guessed): this graph's communities overlap heavily in the force-directed
layout (a community is a purely visual annotation, never a layout
constraint), and ordinary canvas alpha-compositing stacks each overlapping
hull on top of the last, so a higher starting value compounded into a
visible haze across most of the graph rather than the "visible only after
looking for it" restraint intended. An edge whose two endpoints fall in
DIFFERENT detected communities (`isCrossCommunity()`) gets a gentle,
deterministic curve instead of a straight line (`edgeGeometry()`) — sign and
variance are cached per-edge at build time, never `Math.random()`, so a
curved edge is stable across every render — plus a modestly reduced
opacity; this never changes, even under selection/hover emphasis, so a
curved edge never temporarily straightens out.

*Edges.* Every explicit relationship between visible nodes stays visible at
all times — never hidden just because nothing is selected. Three restrained
line-style categories, resolved once per edge in `buildGraph()` from its
`kind`/`label` against a small table (`RELATION_CATEGORY`, checked against
every one of `data/library.yaml`'s `relation_types` — nothing falls through
unmapped): **structural** (solid — a creator credit, `part-of`, `made-with`,
`implements`, `based-at`, …), **historical** (dashed — `influenced-by`,
`successor-to`, `predecessor-to`), **contextual** (dotted —
`affiliated-with`, `used-by`, `discusses`, …). Never colored by relationship
type, only by interaction/selection state (drawn each frame by
`drawBackground()`/`drawInteraction()`, not a persistent DOM class): a
stepped-by-hop-distance opacity falloff from whatever's currently selected
(see Selection Hierarchy below) at rest, a brighter/thicker tier plus the
`--signal` color for edges touching the *selected* node directly, and the
strongest tier — heavier stroke, plus a small relationship label rendered
right at the edge's own midpoint — for edges touching whichever node is
currently *hovered*, gone the instant that hover ends. A curved
(cross-community) edge keeps its curve under every one of these emphasis
states — see Community fields above.

*Render/interaction.* Two stacked `<canvas>` elements, not SVG — a
background layer (`#library-map-bg-canvas`, the full graph at rest, redrawn
whenever layout, a filter change, a resize, pan/zoom, or a selection change
happens) and a small interaction layer on top (`#library-map-fx-canvas`, the
one that actually receives pointer events; hover-only decoration, redrawn
independently so a hover never forces a full-graph repaint). Repaint is
event-driven, not a continuous render loop — `invalidate()`/
`invalidateHover()` mark one or both layers dirty and schedule at most one
`requestAnimationFrame` at a time. Pan is a pointerdown+pointermove+pointerup
drag on the fx canvas (translating the world-space viewBox); zoom is
zoom-to-cursor on wheel (the world point under the pointer is captured
before resizing the extent, then the viewBox is shifted so that same point
is still under the pointer after). Touch is a first-class second input,
not an afterthought bolted onto the mouse path: Pointer Events give each
simultaneous touch its own `pointerId`, tracked in `touchPoints`
(`initPointerHandling()`), and a second finger going down always aborts
whatever single-pointer pan/drag-candidate/drag was in progress and
starts a pinch instead. Pinch-zoom (`updatePinch()`) reuses the exact
zoom-to-anchor math the wheel handler uses, just re-run every tick against
the pinch's own current midpoint (so a pinch that drifts sideways pans
right along with it) and scaled from an absolute start-of-gesture distance
ratio rather than multiplied incrementally tick-over-tick, so repeated
small floating-point steps can't accumulate drift. Lifting one finger back
to a single pointer reseeds an ordinary pan from wherever that finger
currently is, so the transition doesn't jump either — an earlier
single-pointer-only design (one shared `start`/`panning` pair, silently
assuming only one pointer could ever be down) had a second finger's own
pointerdown overwrite that shared state out from under the first finger's
pan, which read as the whole map jumping around erratically on any pinch
attempt. Hit-testing uses a dedicated uniform
spatial grid (`buildSpatialIndex()`/`hitTestWorld()`, bucket size matching
`BASE_K`), since Canvas has no per-element DOM to hit-test against directly.
Pressing down ON a node doesn't immediately start a drag — it becomes a
candidate first, promoted to an actual drag only once the pointer crosses
the same movement threshold panning already uses; below that threshold,
releasing is a plain click-to-select, exactly like pressing on empty canvas
starts a pan immediately (there's nothing there to drag). Cards sit at
FIXED screen corners (see Preview cards below), which can put one directly
under the cursor when a node near that corner is hovered/selected — the
browser then routes the pointer to the (opaque) card instead of the canvas,
firing a `pointerleave`; clearing hover in response would hide the card,
re-expose the canvas underneath, and immediately re-trigger hover on the
very next move (a real flicker loop this exact pattern caused once already,
in an earlier node-anchored card design) — `relatedTarget` is checked
against `.library-map-card` first, so the hover stays exactly as it was
whenever the pointer is still over one of the widget's own cards. HiDPI-aware
canvas sizing (buffer = CSS size × `devicePixelRatio`, scaled back down via
`ctx.setTransform` so every draw call stays in ordinary CSS-pixel
coordinates) re-runs via `ResizeObserver` whenever the container's own box
genuinely changes, not on every frame. `library-map.js` runs independently
of `library-filter.js`; the two coordinate through exactly one channel, a
`library:filter-change` `document` event (view + active Type/Subject), plus
`library-map.js` reading `location.search` directly once at startup for the
same information (script load order means the very first firing of that
event predates its own listener existing). Filtering hides non-matching
nodes and any edge touching one — same field as Catalog/Images, never a
separate one. Requires JS like Images/Map's siblings; hidden under
`data-nojs`. Canvas has no per-node accessibility subtree for a screen
reader or Tab order to hook into (unlike the earlier SVG version's one
focusable `<g>` per node) — building a synthetic one would be real,
maintenance-heavy machinery for a view whose accessibility story already
rests elsewhere: Catalog is the complete, semantic, fully keyboard-navigable
listing of the same entries. What Map still keeps keyboard-accessible:
Escape clears the selection; the pan/zoom/filter controls around the map are
ordinary HTML; and once a selection exists (via a pointer click), its
persistent card's title is a real link, reachable by Tab like any other
page content. This is expected to evolve; treat the force layout itself as
replaceable, not load-bearing.

**Public Type vs Specific Type.** Every entry's `library.type` (book, essay,
album, composition, film, person, group, organization, instrument, software,
…) is the SPECIFIC type — what form the thing takes — and stays exactly
that granular in front matter; nothing here flattens or renames it. A
separate, much smaller vocabulary, `data/library.yaml`'s `public_types`
(eight values: `person`, `group`, `organization`, `work`, `system`, `event`,
`place`, `concept`), is what the site actually **filters and colors by** —
"what kind of thing is this?" rather than "what form does this work take?".
Every specific type maps to exactly one public type (`types[].public_type`
in the same file); a handful of specific types (book, essay, story, paper,
article, manual, recording, album, composition, film, video, lecture, audio,
podcast, website, archive, repository, project, document, other) all map to
the single public type `work`, and a separate handful (instrument, module,
software, hardware, language, interface, method, technique, system) all map
to `system` — see "Systems Ontology" below for why that's its own public
type, not a Work subtype — while `person`/`group`/`organization` map 1:1
(they have no finer subtypes to distinguish). The mapping lives in exactly
one place, `partials/library-public-types.html`
(a pure function of `data/library.yaml`, called via `partialCached` so its
small double loop runs once per build, not once per entry) — every Hugo
template that needs either direction of the mapping (`list.json`,
`library-filters.html`, `library-record.html`, `library-image-index.html`)
resolves through this one partial, and it fails the build (`errorf`) if a
type has no `public_type`, a `public_type` doesn't exist, or a public type is
missing its `color`/`shape`. Client-side JS (`library-filter.js`,
`library-map.js`) never re-derives this mapping — it only ever reads the
already-resolved `public_type` field `list.json` exports per entry, plus the
`public_type_styles` dict, both computed server-side. A dev-only audit
(`library-validate.html`, gated on `hugo.IsServer` so it never runs in
production builds) prints entry counts per public type, and per specific
type within any public type that has more than one (today, Work and System).

**Systems Ontology.** The Library distinguishes three fundamental kinds of
entities: **Agents** (who creates — Person/Group/Organization), **Works**
(what is created), and **Systems** (what creation happens *through*) — a
synthesizer, programming language, modular panel, software environment, or
hardware module is a System, never a Work, even though it's a "thing" in
the same sense a book or album is. `system` is a public type coequal with
`work`, not a subtype of it. System subtypes (specific types, purely
descriptive, same mechanism as any Work subtype): `instrument`, `module`,
`software`, `hardware`, `language`, `interface`, `method`, `technique`, and
the generic `system` (when no finer subtype fits — a whole platform, say —
exactly how bare `person`/`group`/`organization` work). **No `panel`
subtype, ever** — a Serge "Soup Kitchen" panel and its "Resonant Equalizer"
module are both just `type: instrument` / `type: module` System entries;
what makes one a sub-assembly of the other is a `related` declaration
(`part-of`), not a type distinction — hierarchy is relationships, not
vocabulary, so it nests arbitrarily deep (a module part-of a panel part-of
a synthesizer) without ever growing the type list. Who designed, developed,
or manufactured a System is a `creators[].role` (`designer`/`developer`/
`manufacturer`, crediting a person OR an organization — e.g. Wolfgang Palm
as `designer` and PPG as `manufacturer` on the same entry) exactly like any
other creator credit, **never** a `related` relation — this follows directly
from the site's existing "creator attribution uses `creators`, never
`related`" rule, so Systems introduced no new relation types for this.
`related` relation types Systems actually do use: `part-of` (hierarchy, see
above — also still used unchanged for a person/group joining an
organization), `influenced-by` (e.g. the PPG Wave 2 influencing the Waldorf
Microwave XT), `successor-to`/`predecessor-to` (e.g. the Synclavier Regen
succeeding the Synclavier II), plus three added for this: `implements`,
`programmed-in` (a piece of software and the language it's written in —
e.g. SuperCollider `programmed-in` C++), and `compatible-with` (symmetric).
`part-of`'s inverse label is resolved CONTEXTUALLY (`library-related.html`,
not a static `data/library.yaml` lookup like every other relation): a
System declaring `part-of` renders as **"Contains"** on its target (a
synthesizer's page shows the panels it contains), while a Person/Group
declaring `part-of` an Organization still renders as **"Member"** — same
relation type, different inverse label, chosen by the DECLARING entry's own
public type. A `MIDI`-vs-`FM synthesis` distinction is the guiding example
for classifying ambiguous cases: a concrete, adopted protocol (MIDI) is a
System (subtype `protocol`) — something with an actual specification
someone can implement or violate; a general idea or technique (FM
synthesis, wavetable synthesis) is a Concept — nothing to "implement," just
a way of thinking about sound. The same split applies to instruments-vs-
methods generally: a specific real device (PPG Wave 2) is always a System;
the abstract technique it embodies (wavetable synthesis) is always a
Concept. Concept entries are a small, deliberately dictionary-like
vocabulary — cybernetics/systems-theory/mathematics terms (phase,
feedback, memory, variety, limit cycle, state machine, …) and genuine
cross-instrument sound-synthesis techniques (FM, granular, wavetable, …),
not a glossary of one instrument family's own operational jargon (patching,
matrix mixing, voltage-control conventions and the like) — those belong in
an entry's own prose, not as their own Concept entries.

**Institutions and Studios.** Electronic-music studios, labs, and research
centers are `Organization` or `Place`, never a `Studio` public type — an
entry gets exactly one of the two. **Organization** = a continuing
institutional/administrative/creative body (Groupe de Recherches Musicales,
BBC Radiophonic Workshop, Institute of Sonology). **Place** = a specific
room, building, or physical facility (GRM Studios, Studio 54 du GRM, Maida
Vale Studios, Espace de Projection). When an institution and its premises
share a name closely, split them only when the distinction is historically
or graphically useful (e.g. GRM the organization vs. GRM Studios the
building it's based at) — don't default to splitting. Historical relocation
is a `related` fact (`based-at` pointing at a new Place, `predecessor-to`/
`successor-to` across a renaming), never a change to an entity's type.
Founding and directing are `creators[].role` (`founder`, `director`) exactly
like System's designer/developer/manufacturer — never `related` — since the
site's "creator attribution uses `creators`, never `related`" rule applies
here unchanged; likewise an organization "developing" a system (GRM
developing GRM Tools) is that System's `developer` creator credit, not a
studio-side relation. What's left uses four relations added for this
branch: `based-at` (Organization → Place it's sited at or headquartered in;
inverse "Hosts"), `commissioned-by` (a Work commissioned by an Organization
or Person, distinct from who actually made it), `affiliated-with` (a
looser Person↔Organization/Place tie than a creator credit — staff,
resident, associate; collapses the vaguer "worked at"/"associated with"
cases), and `created-at` (a Work's recording/composition/production site —
one relation covers all three; distinguish them in prose, not vocabulary,
matching "prefer a smaller, well-connected graph over a large set of
isolated entries"). Physical containment (a room part of a building, a
studio housing a specific instrument) reuses `part-of` like System
hierarchy — no new containment relation. Detailed institutional flavor
(broadcast workshop, computer music center, university laboratory, …) is
prose, not a new specific type per flavor, unless a genuine cluster of
entries shares one (see the actual `types:` entries added for this branch
in `data/library.yaml`, all mapping to `organization` or `place`).

**Node Type Encoding.** One canonical color+shape token per PUBLIC type
(not per specific type), shared by Map nodes *and* the Type filter chip
swatches — never two separate mappings. Defined once in
`data/library.yaml`'s `public_types` and resolved by
`partials/library-public-types.html` (see "Public Type vs Specific Type"
above), then exported once per public type in `list.json`'s
`public_type_styles`, so neither `library-map.js` nor `library-filters.html`
hard-codes a mapping of its own. `color` is always a `data/colorplan.json`
slug, referenced as `var(--colorplan-<slug>)` — Colorplan is this site's only
colour source, full stop. Shape is the type cue whenever an entry has no
image (see "Image nodes" below for when it does) — one of `circle | square |
diamond | triangle`, reused across public types by design (color is the
primary distinguisher, shape reinforces it) — reinforced by colour, never a
permanent text badge. On Type filter chips, the same token renders as a
small decorative (`aria-hidden`) swatch before the label — a legend, not a
redesign: chips stay the existing plain outlined buttons, never full-colour
pills, and the filter itself only ever offers the seven public types (the
chip's `data-value`/URL `?type=` is always a public type slug like `work`,
never a specific type), narrowed to whichever are actually present among
published entries.

**Image nodes.** Selection-dependent, not unconditional: the *selected* node
and its *direct* neighbors always show their `primary_image` (already
processed/cropped for `index.json` elsewhere — no separate map-specific
derivative) when they have one; every other entry, even one with an image,
shows the plain abstract type shape at rest — a dense unfiltered map (600+
nodes) stays legible instead of turning into a wall of photos, while images
still do their real job of disambiguating same-titled entries exactly where
it matters: around the current focus. Beyond direct neighbors, a capped,
shared budget of 2nd- AND 3rd-order neighbors (one pool, not a separate
allowance per hop — a 3rd-order neighbor competes for the same limited
slots as a 2nd-order one) also gets to show its image, so the effect isn't a
hard cliff at exactly one hop out; the budget itself narrows automatically
at a wider zoom (`MAP_VISUALS.selectionImages.zoomTiers`, with hysteresis so
a couple of stray wheel ticks near a boundary don't flicker the image
population back and forth) and candidates are chosen by strictly
deterministic ordering (visible degree within the current filtered graph,
then total graph degree, then stable `library_id` — never a
cultural-importance or popularity signal). Both representations — the
abstract shape and, once actually needed, the image — are drawn fresh every
frame by `drawShapeNode()`/`drawImageNode()`, chosen per node via
`isImageActive()` (the single source of truth both the background and
interaction layers call, so they can never disagree on which nodes are
currently image-active); the underlying `<img>` object backing an
image-active node is created lazily, only the first time that node actually
becomes image-active (`getNodeImage()`/`nodeImageCache`), so panning/
hovering/selecting around the graph doesn't eagerly fetch hundreds of images
up front. Collision uses a **static** radius per node regardless of which
representation is currently showing — any entry that has an image gets the
larger image-node footprint even while it's rendering as the smaller
abstract shape (`nodeRadius()`) — so a selection change never needs to
re-run collision, only redraw. Sized noticeably larger than the abstract
dots but still plainly "a node," not a card: a filled background square
keeps a small photo from reading as a loose floating picture, and its
*border stroke color* is the node's public-type color (the same mechanism a
plain shape's fill uses) — an image node still reads as its broad type at a
glance without the artwork itself ever being recolored.

**Selection-Centered Navigation.** Clicking a node makes it *the selection* —
a stable point of focus (`selectedId`) that persists until another node is
selected, a filter change removes it from the matching set, or it's
explicitly cleared. Hovering a *different* node never replaces it — the
Selection Hierarchy below is driven entirely by `selectedId`; hover is a
separate, secondary layer (see "Hover" below) that never touches it. This is
what makes the graph "walkable": select a neighbor, its own neighbors become
the next thing to explore, select one of those, and so on, without ever
leaving the map. Selecting deliberately moves NOTHING — not the node, not
the camera: an earlier design both nudged the selected neighborhood apart
for breathing room and animated the viewport to recenter on the selection,
and per direct user feedback both read as disconcerting motion breaking
visual continuity, so a click now only ever updates which tiers/card are
showing (`selectNode()`), leaving the graph and the camera exactly where
they were. `selectedId` has an explicit way out (`deselectNode()`): clicking
anywhere that isn't a node or a card (empty canvas, the hint text, elsewhere
on the page), or pressing Escape, drops it — otherwise walking the graph
would be a one-way ratchet with no way back to the unfocused resting state.
A filter change that hides the current selection clears it rather than
leaving a phantom focus on an invisible node.

**Selection Hierarchy.** A node's visual shows at full opacity at rest — no
node reads as lesser than another until something is actually selected.
Selecting a node computes every reachable node's hop distance from it via a
plain BFS over the current adjacency (`computeSelectionDistances()`), then a
STEPPED opacity ladder (`MAP_VISUALS.selection.opacitySteps`) applies:
direct (1-hop) neighbors read the brightest, 2 hops dimmer still, 3 hops
dimmer again, and anything past that — or never reached at all (a different
component, or simply outside the currently visible/filtered set) — clamps
to the same dimmest floor tier; a flat single "everyone else" tier read as
too subtle in practice (direct user feedback), so this is deliberately a
steeper, multi-step falloff than that first attempt. The selected node
itself always renders at full opacity, with a distinct double concentric
ring (not used anywhere else) and a modest size bump — a same-sized image
neighbor can otherwise make it hard to spot at a glance. A non-selected
edge's own opacity is whichever of its two endpoints is CLOSER to the
selection; an edge touching the selection directly gets the strongest tier
plus the `--signal` color — but never a persistent text label on the edge
itself outside of an active hover (see Edges above); the preview cards are
where relation/role context surfaces on demand instead. The selected node's
own detected community (see Community fields above) also gets a boosted-
opacity hull pass, layered on top of the plain base opacity every other
hull still uses.

**Hover — secondary, never replacing the selection.** Hovering a node other
than the current selection (`setHovered()`) draws a light dashed ring around
just that one node (on the interaction layer only, so it never forces a
full-graph repaint) and shows a second, transient card (see Preview cards
below) — "what I'm considering next," visible *alongside* the selected
node's persistent card, "where I am" — plus, when a different node is
already selected at the same time, a small relationship bridge panel
between the two cards (see "Relationship bridge panel" below). Neither the
hovered node's own opacity tier nor the selection's own tiers change because
of this — hover is purely additive, on top of whatever the Selection
Hierarchy already drew. Ending the hover (`clearHovered()`) removes the ring
and hides the hover card (and the bridge panel, if it was showing);
hovering the already-selected node is a no-op, since its card is already the
persistent one on screen. Canvas has no per-node keyboard focus at all (see
"Render/interaction" above) — Catalog is the complete keyboard/screen-
reader-navigable listing of the same entries instead.

**Preview cards.** Two independent instances of the same small controller
(`makeCardController()`/`populateCard()`/`showCardFor()`/`hideCardFor()`) —
`#library-map-card` (the persistent selected card) and `#library-map-hover-card`
(the transient hover card, `.library-map-card--hover` modifier: dashed
outline, slightly lower opacity, higher z-index — the only departures from
the shared style) — so both can render at once without duplicating logic.
Each shows: primary image (when the entry has one) + title + subtitle
(`creator_names · type_label · year`, whichever are present — SPECIFIC type,
e.g. "Composition"/"Album"/"Essay", real disambiguating metadata for a work;
suppressed only for `person`/`group` entries, exactly like
`library-record.html`'s catalog kicker, since the node's own shape/color
already says "Person" and restating it in words would be redundant) + a
short, JS-truncated summary snippet. Sized as a real catalog card, not a
small tooltip, though still deliberately restrained ("a catalog preview, not
a popup dialog"): plain ruled/paper styling matching the rest of the
Library, no shadow, no rounded corners. Position is FIXED via CSS, not
node-relative at all — the selected card always sits in the render window's
upper-right corner, the hover card always upper-left, regardless of where
the node itself currently is; an earlier design anchored each card near its
own node (probing several directions/distances to dodge covering it or
other nodes) and had to reposition it on every pan/zoom/settle tick — per
direct user feedback, a card that chases its node around read as
disconcerting, so fixed corners are simpler, predictable, and never need
repositioning from a camera or layout change; only the *content* changes.
Outline style is the distinguishing cue in this fixed layout: solid for the
standing selection, dashed for the transient hover — same idea the node-
level selected/hovered rings on the canvas already use. Being ordinary HTML
outside the canvas entirely, pan/zoom never affects a card's size or
position at all. A drag-to-pan gesture that starts and ends over empty
canvas still fires a trailing DOM `click`; `initPointerHandling()` tracks
whether the pointer actually moved past a small threshold (`didPan`) so that
trailing click isn't misread by the click-away deselect handler as "clicked
away" — panning the map must never clear the selection. Clicking either
card is the one gesture that actually navigates to the entry's real page —
a plain click on a node only selects it.

**Relationship bridge panel.** When a node is selected AND a different node
is hovered at the same time (both preview cards visible), a minimal edge
label — never a third card — occupies whatever horizontal gap already
exists between them (`assets/js/library-map.js`'s "Relationship bridge
panel" section; `#library-map-bridge` in `library-map-view.html`). It never
navigates, changes selection or hover, moves a node, reheats the
simulation, or pans/zooms/fits the viewport — purely derived, purely
additive, recomputed from scratch on every selection/hover/filter change
(`updateBridge()`) rather than patched incrementally. The real gap here is
often only ~54-70px (two fixed-width preview cards on this site's own
capped content width — see `--wrap`), too narrow for most words on one
line, so this is built around wrapping rather than truncation: **never an
ellipsis, never a mid-word break** — a label that doesn't fit is either
shortened (direct case) or replaced with a bare count (second-order case)
before it's ever cut off. Two cases, direct always taking priority over
second-order: a **direct** relationship (one or more explicit edges
between the two, from `edgesByPair` — an "idA|idB" -> edges index built
once alongside the graph, giving an O(1)-average lookup) shows exactly
**one** compact relation label — the strongest by category, then
vocabulary order (`directRelationships()`) — resolved through a
centralized, bridge-specific short-label map (`BRIDGE_SHORT_LABELS`,
covering every creator role and relation type in `data/library.yaml`;
e.g. `collaborator-of` → "Collab", `affiliated-with` → "Affiliated" — a
deliberately shortened form, never the mechanically truncated raw string)
and rendered one WORD per line (`"Part Of"` → `PART` / `OF`). A
**second-order** relationship (no direct edge, but `neighbors(selected) ∩
neighbors(hovered)` is non-empty within the currently *visible* graph —
`graphAdjacency`, so a filtered-out intermediary is structurally never a
candidate, not filtered after the fact) shows "Via" plus the single
*strongest* shared intermediary's title, also one word per line — never a
path, never either edge's own label — chosen by `sharedIntermediaries()`'s
deterministic ordering (strongest relationship-category pair, then visible
degree, then total graph degree, then stable `library_id` — no
cultural-importance or popularity signal, same discipline as the
second-order IMAGE budget above), plus a bare "+N" line when more than
`maxIntermediaries` (1) shared intermediary exists. Before anything is
ever rendered, every candidate word is measured against the real available
width (`measureToken()`/`wordsFit()` — an offscreen clone of the actual
line style, never a hardcoded font-metrics guess): a direct label whose
short form still doesn't fit simply hides the panel rather than show it
corrupted; a second-order intermediary *title* (an arbitrary entity name,
the one case genuinely capable of containing an unbreakably long single
word) falls back to a bare node count instead — "Via" / "3 Nodes" — with
the real title still fully preserved, never lost, as the panel's `title`
attribute and its body's `aria-label`. No sentence, no endpoint titles
(the cards already identify both entries), no heading of any kind — every
line shares one small (~9px, below the site's own `--t-xs` scale)
mono-uppercase treatment. Placement (`layoutBridge()`) never resizes or
moves either card — the two preview cards themselves sit close to the
render window's own edges (`0.4rem`, not a generous inset) specifically to
leave more of that gap for this panel. `layoutBridge()` measures the
cards' own current bounding boxes, decides content against that real gap
(`BRIDGE_CFG.minimumWidth` — deliberately low, since one-word-per-line
wrapping needs far less width than a single-line label would — through
`maximumWidth`, a hard ceiling), then lets the label box shrink-to-fit its
own content (never forced wider than it needs, only ever capped by
`maximumWidth`) and centers THAT actual box in the gap, vertically
centered relative to the two cards. The flanking rules
(`.library-map-bridge-rule`, `layoutBridgeRules()`) are deliberately
separate, plain elements, not `::before`/`::after` pseudo-elements
competing with the label for the same box width — an earlier flex-row
design had the rules and the label fighting over that width, and once the
label's content came close to filling it the rules collapsed to zero and
the text visibly drifted off-center; decoupling them (each rule just spans
independently from wherever the already-centered label ended up out to
its own card) fixed this and can't regress the same way. When the gap is
narrower than `minimumWidth`, or even the fallback content doesn't fit,
the panel is simply hidden, never relocated below the cards or over the
graph. `pointer-events: none` throughout (a click "through" the panel
reaches the canvas underneath it,
same as empty space would).

**Images.** Resolved through Hugo page resources (never hotlink Bandcamp/Discogs/
publishers; never auto-download third-party artwork). List = square thumbnail
(`Fill`, srcset, w/h, lazy, `object-fit: cover`); no image → clean text-only row.
Single page = prominent **uncropped** primary near the header + a simple
responsive gallery, caption/credit/source rendered as distinct elements — a
caption, a credit line, and a `Source ↗` link, never concatenated into one
string, never a bare URL (`library-image-caption.html`, shared by the primary
image and the gallery). List and random-panel thumbnails never show
caption/credit/source — that stays on the single-entry page only. Same image
model for every type, including release artwork. See `credit` vs `source`
above.

**Access & rights.** Access kinds in `data/library.yaml`; `hosted-file` (needs a
bundle `file`) is the only kind that makes SARC a host and so drives the rights
guard. Rights statuses unchanged (`sarc-owned`, `public-domain`, `licensed`,
`permitted`, `archival`, `review`, `external-link-only`); a `hosted-file` entry
whose rights aren't publishable **fails the build** and must stay a draft.
`archival` = deliberate, takedown-on-request hosting of a long-discontinued
product's docs (not a public-domain claim); don't fabricate rights, don't infer
public domain from age, don't mirror/cache/proxy external files or images. The
private iCloud manual archive remains off-limits (no scan/index/publish; never
expose a local path).

**JSON index.** `/library/index.json` (`layouts/library/list.json`) — the whole
published catalog, display-ready, powering random + future search/viz. No
filesystem paths, drafts, or rights-review notes. The HTML remains canonical.

**No database.** Hugo content + normalized front matter + `library.id` +
`index.json` are the migration path if one is ever justified. Do not add a DB,
CMS, API server, or frontend framework. Comments are **not** built yet, only
keyed-by-`library.id`-ready.

**Validation** (`library-validate.html`, once via `partialCached`). Production
build fails on: duplicate/missing `library.id`; residual `reference_id`; missing/
unknown `library.type`; unknown subject; invalid creator role; unresolved
creator/related `ref`; invalid relation; an access item with both `url` and
`file`, an unknown kind, a `hosted-file` with no/unresolvable file; a `hosted-file`
with unsafe rights; an unresolvable/duplicate image; a non-decorative image
without alt. It does **not** fail on: no images, a creator name without `ref`, no
related, an absent optional field, or a subject with one entry.

**Presentation.** Ruled catalog rows — never
commercial cards, cover
grids, shadows, ratings, badges, hover-zoom, or streaming-service styling. Images
are documentary, not decoration. Reuse the base shell/header/footer/type — don't
fork the layout. One archetype: `archetypes/library-entry.md`
(`hugo new --kind library-entry library/entry/<public-type>/<slug>/index.md`,
e.g. `library/entry/person/misha-mengelberg/index.md` — the public type is
source organization only and never appears in the published URL, and don't
forget to set `library.collections` to the id(s) this entry belongs to, see
"Collection membership" above). `field-kit` alone still uses
`library/field-kit/<public-type>/<slug>/index.md` (no `collections` field —
see the "deliberate exception" note above). Moving/renaming a URL: add the
old path under `aliases:`.
