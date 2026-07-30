# CLAUDE.md — sarc.systems

Project-level instructions for Claude Code. Read this before changing anything.

## What this is

The website of the **Studio for Advanced Research in Cybernetics (SARC)**.
Production domain: `https://sarc.systems`. Deployed as static files to GitHub
Pages (custom domain); see Deployment below.

Phase one is a **Journal** documenting current SARC work — especially the
SARC-100 system and associated YouTube videos. The site is architected as one
institutional site with eventual departments (Journal, Systems, Studio, Label,
Library) but only the Journal, Home, and About are public now. **Systems** is
the department for hardware and software development; the **SARC-100 lives under
Systems** (as a system/project within it), not as its own top-level department.

Two kinds of content, kept conceptually distinct:

1. **Journal entries** — dated, historical records. Never retroactively
   rewritten (typo fixes and revision notes are fine).
2. **Reference pages** (future: module pages, releases, essays) — living
   documents describing current state, which link back to journal entries via
   shared taxonomy.

**External references:**

- GitHub org: <https://github.com/sarc-systems>
- SARC-100 source/development: <https://github.com/sarc-systems/SARC-100>

This website repo is separate from the SARC-100 hardware/software repo above.

## Technology

**Use:** Hugo Extended · Markdown · Git/GitHub · plain HTML templates · plain
CSS · minimal JS. The theme is custom and lives in this repo.

**Never introduce:** React, Vue, Tailwind, Bootstrap, any JS site framework,
a database, a CMS, a large third-party Hugo theme, client-side rendering, or
npm dependencies that a short Hugo template or CSS rule could replace.

Git + Markdown **are** the CMS.

## Commands

```
make dev        # hugo server with drafts (-D), local dev
make build      # production build (minified, correct baseURL)
make check      # production build + validation and link checks
make new-post   # new journal page bundle from archetype
make deploy     # check, then push main; GitHub Actions publishes to Pages
make colorplan  # regenerate Colorplan palette outputs from the source ASE
```

Keep the Makefile short and legible. Do not build an elaborate task runner.
The build must fail loudly on major content or template errors.

## File structure

```
content/
  _index.md
  journal/
    _index.md
    2026/
      <slug>/            # leaf page bundle
        index.md
        cover.jpg        # assets live with the post
        diagram.svg
        example.mp3
  about/index.md
  systems/_index.md              # reserved, draft/unlinked (hardware/software dept)
  systems/sarc-100/_index.md     # SARC-100 lives under Systems
  systems/sarc-100/modules/_index.md
  studio/_index.md
  studio/projects/_index.md
  label/_index.md
  label/releases/_index.md
  library/_index.md                   # unified catalog landing (+ index.json output)
  library/<slug>/index.md             # flat entries (books, people, groups, manuals, releases, …)
  library/<slug>/cover.jpg            # entry images live in the bundle
layouts/          # custom theme: baseof, home, journal list/single, taxonomies, 404
layouts/library/{list,single}.html + list.json   # unified catalog + JSON index
layouts/partials/library-*.html      # collect, record, featured, filters, view-switch,
                                      #   image-index, map-view, thumbnail, images,
                                      #   image-caption, access, creators, works, related,
                                      #   rights, validate
assets/js/library-filter.js          # catalog filter, view switch, and chance selection
assets/js/library-map.js             # experimental Map view (force-directed relationship diagram)
scripts/audit-library-images.py      # offline image credit/source/rights report (`make library-image-audit`)
layouts/partials/mark.html           # generated four-row mark SVG — do not edit
design/fonts/Nasalization-Rg.otf     # mark source font (build-time only, unchanged)
scripts/generate-mark.py             # regenerates the mark SVG (`make mark`)
assets/css/       # site CSS (see CSS architecture) — incl. library.css
assets/css/generated/colorplan.css   # generated — do not edit
assets/img/       # source visual assets incl. the SARC four-row mark (original raster — never modify)
data/colorplan.json                  # generated — do not edit
data/palette.yaml                    # central section/project colour assignments
data/library.yaml                    # Library types + subjects + roles + relations + access vocab
scripts/colorplan-source.json        # committed raw palette capture (importer input)
scripts/import-colorplan.mjs         # deterministic Colorplan importer
archetypes/journal.md                # + library-entry (one unified Library archetype)
static/           # passthrough files (robots.txt, favicon, etc.)
```

Journal posts are **leaf page bundles**: every substantive post carries its own
images, audio, diagrams, and PDFs. Future department `_index.md` files may
exist as drafts but are not linked or published until those sections launch.
Do not publish empty sections to make the site look larger.

## Front-matter schema (journal)

```yaml
---
title: "Sonifying the Computation of Pi"
date: 2026-07-23T11:00:00-06:00
summary: "One-sentence summary shown on the index and in meta descriptions."
entry_type: "worklog"        # worklog | video | essay | announcement | field-note
topics: [computation, control-voltage, bela]
projects: [sarc-100]
series: [computational-instruments]   # optional
youtube: ""                  # optional video URL
image: ""                    # optional featured image (bundle-relative)
lastmod:                     # optional, when meaningfully updated
revision_note: ""            # optional, human-readable note about updates
draft: true
---
```

Taxonomies: **topics**, **projects**, **series** (plus `entry_type` as a
filterable field). Do not add taxonomies without a clear, current use.

## Journal presentation

The public term is **"Journal," never "Blog."** One chronological stream; entry
types are metadata, not separate blogs. Index entries show date, entry type,
project, title, summary — in the flavor of:

```
23 JUL 2026
WORKLOG · SARC-100
Sonifying the Computation of Pi
A clocked computational process whose intermediate state becomes control voltage.
```

No card grids, no stock-image thumbnails, no commercial editorial layout.

Single entries support: title, date, updated date, entry type, topics, project,
optional lead image, long-form text, figures with captions, YouTube embed,
native audio, code blocks, tables, footnotes, downloadable documents,
prev/next links, auto-generated related entries (by shared projects/topics),
optional revision note.

## Shortcodes

- `youtube` — **click-to-load / privacy-conscious**: render a static thumbnail
  or facade; load the iframe (youtube-nocookie) only on user interaction. Do
  not ship YouTube's scripts on page load.
- `figure` — image + caption, `<figure>/<figcaption>`, responsive `srcset`
  via Hugo image processing, width/height attributes, lazy loading. Figures
  may extend wider than the text column when appropriate.
- `audio` — native `<audio controls>`, no JS player library, `preload="none"`.

## Navigation

Header (and footer) wordmark is **SARC** set in Nasalization — *not* the
four-row mark. It is baked to SVG outline paths (`layouts/partials/wordmark.html`,
generated by `scripts/generate-mark.py` / `make mark`, `fill: currentColor`), the
same build-time-only use of the font as the mark. The font is never embedded or
shipped as a webfont: the free Typodermic licence permits creating a logo but
lists "web page (embedded)" as *not allowed*, so shipping outlines (a logo) is
the compliant path.

Current desktop nav: `SARC | JOURNAL | LIBRARY | ABOUT | ▶ | ⌥` (YouTube and
GitHub are external links to the SARC channel and GitHub org, rendered as
small inline monochrome icons — `layouts/partials/icon.html`, outline glyphs
from Feather Icons, MIT licence, `stroke: currentColor` so they always match
the surrounding link's colour/hover state — instead of text, in both the
header nav and footer; each keeps a `.visually-hidden` accessible name
("YouTube"/"GitHub") since the icon alone says nothing to a screen reader.
Which menu items get an icon is config-driven (`[menus.main.params] icon =
"youtube"` in `hugo.toml`), not a template special-case, so it's the same
mechanism for any future icon-bearing link). Future:
`SARC | JOURNAL | SYSTEMS | STUDIO | LABEL | LIBRARY | ABOUT` (plus the
external YouTube/GitHub icons) — the nav is built from the `[menus]` definition
in `hugo.toml`, so adding a department is a config change, not a redesign.

Small screens: simple, accessible menu (works without JS — e.g. details/summary
or a no-JS-fallback pattern). No animated navigation systems.

## Visual direction

Character: technical bulletin × research archive × independent label catalog ×
experimental systems documentation. **Not**: software startup, synth retailer,
cyberpunk game UI, music blog, generic Hugo theme, dashboard.

- Palette: black, warm white, grays. Color enters only through the Colorplan
  system (below), used as restrained coded signals — the base site stays
  primarily monochrome.
- Strong typographic hierarchy, generous negative space, visible structural grid.
- Precise dates and metadata as visual elements.
- Large technical images and diagrams; high-quality long-form reading
  typography (readable measure, never excessively wide).
- Monospace only where semantically meaningful (code, data, metadata) — not as
  a costume.
- Fonts: locally hosted or system stack. No font CDNs.

**Banned:** terminal green, fake CRT, glitch animation, neon gradients,
excessive glow, animated backgrounds, dashboard panels, rounded SaaS cards,
decorative circuit imagery, generic futuristic fonts. The strangeness comes
from material and organization, not sci-fi decoration.

### CSS architecture

Plain CSS in `assets/css/`, piped through Hugo (concatenate + minify). A small
set of files by concern (e.g. `base`, `layout`, `journal`, `mark`, `print`).
Custom properties for the palette and type scale. Class naming: simple,
descriptive, kebab-case (`.journal-index`, `.entry-meta`). No utility-class
frameworks, no CSS-in-JS, no preprocessors.

## Colorplan palette

All color on the site comes from the **G . F Smith Colorplan** paper range.
The initial digital source is the complete 55-color Colorplan table published
by Jukebox Print (<https://www.jukeboxprint.com/print-guide/paper/colorplan>),
which provides official name, Hex, RGB, CMYK, and Pantone reference per color.
These are screen approximations of physical papers — treat them as SARC's
canonical digital palette unless deliberately superseded later. Never manually
approximate or transcribe values, and never scrape product photos or derive
colors from images.

- Source snapshot: `scripts/colorplan-source.json` — the raw 55-color table
  (name, Hex, RGB, CMYK, Pantone) captured from the Jukebox page, committed.
  The Jukebox table is **client-rendered JavaScript** and is not present in a
  plain HTTP fetch, so it is captured once into this snapshot (from the rendered
  DOM); refresh it deliberately when the palette source changes.
- Importer: `scripts/import-colorplan.mjs`, run via `make colorplan`. It reads
  the committed snapshot (pure/offline, no dependencies) and generates
  `data/colorplan.json` (structured Hugo data) and
  `assets/css/generated/colorplan.css` (CSS custom properties). Given the same
  snapshot it always produces byte-identical output.
- The snapshot and generated output are **committed**. Normal Hugo builds and
  deploys never fetch anything — re-run the importer deliberately only when the
  snapshot changes.
- Generated files carry a header stating they are generated and must not be
  edited by hand, and record the source URL and retrieval date.

The importer must: import all 55 colors; preserve published names; generate
stable lowercase hyphenated slugs; validate Hex/RGB agreement; preserve CMYK
and Pantone as metadata; calculate WCAG contrast against black and white and
choose a recommended default foreground; flag colors where neither foreground
suffices for small text; reject duplicate names or slugs; **fail if the
expected table structure changes** rather than guessing; report the count of
imported colors; and produce deterministic output.

Jukebox also publishes suggested duplex pairings — do **not** import them as
design rules. SARC release color pairs are editorial decisions.

CSS naming keeps the official names — `--colorplan-factory-yellow`,
`--colorplan-marrs-green`, `--colorplan-ebony`. Never rename to generic values
like `yellow-1` or `green-3`.

### Color hierarchy

Colorplan operates in two related systems:

**Site sections.** Each institutional section (Journal, Systems, Studio,
Label, Library) may have one assigned Colorplan color, stored centrally (site
config/data), never hardcoded in templates. A section color may drive: active
nav, rules, metadata, links, selection, index markers, Open Graph graphics.
It is a coded signal — pages do not become saturated color fields.

**Label releases.** Each release has two Colorplan colors matching its
physical paper combination, in front matter:

```yaml
palette:
  primary: factory-yellow
  secondary: cobalt
  layout: split-horizontal
```

Initial release palette layouts: `solid`, `split-horizontal`,
`split-vertical`, `frame`, `band`, `reverse`. Release pages may use their pair
far more extensively than Journal pages. **Historical releases keep their
assigned pair permanently.**

### Palette inheritance

Resolve a page's color in this order:

1. Explicit page palette
2. Associated release or project palette
3. Institutional section color
4. Neutral SARC default

Journal posts normally inherit from their primary project/section — no
repeated color declarations. **Entry type never determines color**: worklogs,
videos, essays, announcements, and field-notes are distinguished by labels,
typography, or symbols. A SARC-100 video keeps SARC-100's color identity and
is identified typographically as a video.

### Palette preview page

Maintain a development-only Colorplan reference page (draft/unpublished)
showing every imported color with official name, slug, generated hex,
suggested foreground, and large- and small-text samples; plus all current
section assignments and all release pairs in use. Its purpose is catching
import mistakes and poor contrast without hand-editing the palette.

## Library

**One unified catalog of entries** — a growing research collection and small
knowledge graph, not a set of shelves. There are no public Writings / References
/ Manuals / Sources / Reading / Links sections. Anything durable SARC wants to
identify, annotate, connect, preserve, or point toward is an *entry*: essays,
books, manuals, people, groups, organizations, recordings, releases,
compositions, films, lectures, websites, software, instruments, systems, documents.
Type, subject, and access are **metadata and filters, never sections.** Section
colour is **Forest** (in `data/palette.yaml`; never hardcoded). All vocabularies
live in `data/library.yaml` — the single source of truth for templates, filters,
the JSON index, archetypes, and validation.

**Flat URLs.** Library-owned entries live at `content/library/<slug>/index.md`
and publish at `/library/<slug>/` — do **not** encode type/subject in the URL and
do **not** create per-type content trees. Taxonomy changes must never require
page moves.

**Stable identity.** Every entry has a unique `library.id` (not the title, URL,
slug, or path — entries may move). Relationships resolve through `library.id`.
The old `reference_id` is gone; validation rejects it. `library.id` is exposed in
markup (`<article data-library-id="…">`) so a future comment system can key to it.

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
weight:  sort_title:  featured:            # optional ordering / no-JS random default
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

**Landing** (`layouts/library/list.html`): intro → **From the Library** (one
entry sampled from whatever the controls below currently define) →
**View**/**Filters** (`.library-controls` — Type/Subject, Clear, result count,
and the View switch share one flex row, View pinned top-right so opening the
Filter disclosure only grows the Filter column, not the whole row; Filter is
collapsed by default behind a native `<details>`/`<summary>`, no custom
disclosure JS; `library-filter.js` sets `open` explicitly on every
load/history navigation — true when the URL already carries an active filter,
false otherwise, overriding whatever a browser's own reload/history-state
restoration would otherwise leave it at) → **All entries** (ruled records with
thumbnails). Even though the controls render *below* the chance panel, they
still define its field: View/Type/Subject define one matching set, and both
the chance panel and the complete results are sampled/filtered from that same
set — there is exactly one matching-set computation (`library-filter.js`'s
`matchesFields`/`matchesDataset`/`matchesEntry`), never a separate one for the
random pick; DOM position doesn't change that coupling. **Filter** by type +
subject: OR within a facet, AND across; shareable `?type=a,b&subject=c`;
history-aware; Clear; polite `aria-live` count. Without JS the whole catalog
is visible and `.library-controls` (Filter + View) is hidden entirely
(CSS-gated on `data-nojs`), and the chance panel stands as its unfiltered
deterministic fallback (`featured: true` or first) since there's no
client-side filtering to apply it to. Records carry `data-type` /
`data-subjects` / `data-library-id`.

**Catalog / Images view switch.** A presentation toggle, not a second page or a
gallery — it changes what's visible, never the image itself. **Catalog** is the
existing ruled records; **Images** shows only the primary images of the
currently matching entries, same filters, same order, same crop. Both render
from one entry collection at build time (`#library-list` /
`#library-image-index`, see `library-image-index.html`) and both call the same
`library-thumbnail.html` partial for image resolution — this is the only place
that resolves an entry's primary image into a thumbnail, so the two views can
never end up with a different derivative, crop, or size. Sizing is one shared
CSS custom property, `--library-thumbnail-size` (set once, redefined at the
mobile breakpoint) — the Catalog thumbnail's `max-height` and the Images grid's
item `width`/`height` both read it, so changing one changes both by
construction. **Images is the default view** — state is `?view=catalog|images`
in the URL, but an absent or invalid `view` resolves to Images, not Catalog
(the switch lists Images first for the same reason); `library-filter.js` only
ever adds `view=catalog` to the URL, never `view=images`. One script
(`library-filter.js`; there is no separate random script anymore) owns
View/Type/Subject state, filters both result collections, updates a
view-aware result count (`"N entries · M with images"` in Images view; `"0
images among N matching entries"` when none match), and — every single time
any of that state changes — revalidates the chance panel against the same
field. Entries with no image are simply omitted from the Images grid (Catalog
still lists them normally) — never a placeholder.

**Chance panel eligibility & revalidation.** The chance panel's pool is exactly
the matching entries (from `/library/index.json`, fetched once client-side —
the DOM's result records don't carry enough to render a featured card),
further narrowed to entries with a primary image whenever Images view is
active (Catalog may sample an image-less entry; Images never does). On *any*
filter/view change the current pick is kept if it's still in the pool — it
does not reshuffle just because an unrelated facet changed — and only its
presentation (Images-view text hidden/shown) re-renders if needed; only when
the current pick falls outside the new pool is a fresh one drawn. **"Select
again"** is the one action that always forces a different entry (excluding the
current one) from the live pool, and is hidden entirely when the pool has ≤1
eligible entry (a single-entry pool still displays that entry, just with
nothing to select again into). A pool of zero entries replaces the panel
content with a restrained empty state — `"No matching entries."`, or `"No
matching entries have images."` specifically when entries match but none have
one — and never falls back to an unrelated/unfiltered entry. In Images view,
the featured thumbnail link gets a real accessible name (`aria-label`, since
the title link it normally defers to is `hidden`) by removing the
`aria-hidden`/`tabindex` that suppress it as a redundant link in Catalog view;
switching back to Catalog restores the text without re-picking. A polite,
sparse `aria-live` region (`[data-chance-announce]`, only updated when the
picked entry's identity actually changes — never on every filter click)
announces `"Selected: <title> by <creators>"`. The pick itself is
`sessionStorage`-only, revalidated against the live pool on every read — it
never becomes URL state (View/Type/Subject are the only URL-backed state); a
stored id that's no longer eligible is simply discarded and redrawn.
The whole view switch and chance-selection behavior requires JS (there is no
server-rendered Images view or client-filtered chance pick), so the switch is
hidden under `data-nojs` exactly like the filter form; Catalog with its
unfiltered fallback pick remains the complete no-JS fallback. Reuses
`.rf-facet`/`.rf-chip` styling — no new visual theme.

**Map view (experimental).** A third View option — `layouts/partials/library-map-view.html`
(`#library-map`) + `assets/js/library-map.js`. A restrained research diagram of
**explicit editorial relationships only** — never a knowledge graph, semantic
search, similarity/recommendation engine, or automatic clustering. Every edge
is something SARC actually declared in front matter: `creators[].ref` (a
person/group credited on a work) and `related[].ref` (carrying its
`data/library.yaml` relation type through, e.g. `part-of`, `influenced-by`,
`documents`). Nothing is inferred from shared subjects/tags.

*Layout.* Full, genuinely force-directed — over the whole visible graph, over
every filtered subset, and stable across reloads, not a live physics demo.
Every node's initial position is a **deterministic seed** derived from its own
stable `library.id` (a small hash → seeded PRNG), never `Math.random()` — the
same graph produces substantially the same layout every time. Connected
components (plain union-find, recomputed against whichever subset is
currently *visible* — filtering changes reachability) are treated as layout
units: each gets its own small local force+collision simulation
(`layoutComponent()`, warm-started from current positions, with a trivial
direct-placement fast path for singletons/pairs — a typical Library-sized
graph is heavily fragmented, most components are singletons or pairs, not
"one giant component plus stragglers"), then packed into shared coordinates.
The very first load does a fresh deterministic multi-row shelf-pack
(`packComponents()` — sorted by size then id, wraps rows to roughly match the
canvas's own aspect ratio, so a fragmented graph doesn't degenerate into one
long strip of tiny islands); every relayout after that instead resolves
overlaps incrementally (`resolveComponentOverlaps()`) rather than re-tiling
everything from scratch — this is what gives a **filter change spatial
continuity**: survivors keep roughly where they were, and only genuinely
new/newly-conflicting content moves. `relayout(visibleIds)` is the one
orchestrator for both the initial load and every filter change (recompute
components → lay out → pack/resolve → fit viewport with padding → render);
it always runs to convergence synchronously and then **stops** — settled, not
continuously drifting. Collision uses a static radius per node (precomputed
once in `buildGraph()`, larger for image-capable nodes regardless of whether
they're currently rendering as an image — see Image nodes below) so
selecting a node never needs to re-run collision or repacking. Node type
still only affects appearance, never physical placement.

*Selection deliberately bypasses `relayout()` entirely* — it must never
regenerate the whole graph or destroy the user's mental map of it. Selecting
a node instead runs `reheatNeighborhood()`, a short bounded local relax: the
selected node + its direct neighbors + their neighbors get full movement
against each other (genuine breathing room, not just a held-flat position),
while every other currently-visible node gets only a small capped nudge
(rather than being perfectly immovable) so the neighborhood has something to
yield into instead of hitting a wall of frozen nodes — a real risk for a hub
node embedded deep in a densely-linked component. Distant/unrelated nodes
still barely move (a few px, not a repositioning). This runs once,
synchronously, then the existing pan-only `recenterOn()`/`animateViewBox()`
brings the selected node to a consistent focal position at the *current*
zoom — selection never refits or rescales the viewport, only pans to it.

*Edges.* Every explicit relationship between visible nodes stays visible at
all times — never hidden just because nothing is selected. Three restrained
line-style categories, resolved once per edge in `buildGraph()` from its
`kind`/`label` against a small table (`RELATION_CATEGORY`, checked against
every one of `data/library.yaml`'s `relation_types` — nothing falls through
unmapped): **structural** (solid — a creator credit, `part-of`, `made-with`,
`implements`, `based-at`, …), **historical** (dashed — `influenced-by`,
`successor-to`, `predecessor-to`), **contextual** (dotted —
`affiliated-with`, `used-by`, `discusses`, …). Never colored by relationship
type, only by interaction state: a default thin/low-opacity line at rest, a
brighter/thicker `is-active` tier for edges touching the *selected* node, and
the strongest tier (`is-hovered`, plus a small relationship label near the
midpoint) for edges touching whichever node is currently *hovered* — the
label vanishes the instant that hover ends, reusing the existing node-hover
mechanism rather than adding separate hover handling on `<line>` elements.

*Render/interaction.* `render()` builds SVG once (`renderInitial()`); every
subsequent `relayout()`/reheat only updates positions/visibility
(`updatePositions()`/`applyVisibility()`), never rebuilds node/edge DOM
structure. Pan via pointer drag on the SVG viewBox, zoom via wheel; hover/
focus drives the Selection Hierarchy below plus a preview card — click
navigates to the entry, same as an Images thumbnail; the hint text is a
caption strip below the canvas, never an overlay on top of it.
`library-map.js` runs independently of `library-filter.js`; the two
coordinate through exactly one channel, a `library:filter-change` `document`
event (view + active Type/Subject), plus `library-map.js` reading
`location.search` directly once at startup for the same information (script
load order means the very first firing of that event predates its own
listener existing). Filtering hides non-matching nodes and any edge touching
one — same field as Catalog/Images, never a separate one. Requires JS like
Images/Map's siblings; hidden under `data-nojs`. `prefers-reduced-motion`
skips the viewBox tween (filter-fit and selection-recenter both jump straight
to their final state) and skips `reheatNeighborhood()` entirely — the
simplest, safest reading, even though the reheat itself is a synchronous
instant recompute rather than a frame-by-frame animation. This is expected to
evolve; treat the force layout itself as replaceable, not load-bearing.

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
public type. A `MIDI`-vs-`control voltage` distinction is the guiding
example for classifying ambiguous cases: a concrete, adopted protocol (MIDI,
1 V/octave pitch control) is a System (subtype `protocol`) — something
with an actual specification someone can implement or violate; a general
idea or technique (voltage control, modular synthesis, FM synthesis) is a
Concept — nothing to "implement," just a way of thinking about sound. The
same split applies to instruments-vs-methods generally: a specific real
device (PPG Wave 2) is always a System; the abstract technique it embodies
(wavetable synthesis) is always a Concept.

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

**Image nodes.** Selection-dependent, not unconditional: only the *selected*
node and its *direct neighbors* render using their primary_image (already
processed/cropped for `index.json` elsewhere — no separate map-specific
derivative); every other entry, even one with an image, shows the plain
abstract type shape until it becomes selected or adjacent — a dense unfiltered
map (400+ nodes) stays legible at rest instead of turning into a wall of
photos, while images still do their real job of disambiguating same-titled
entries exactly where it matters: around the current focus. Both
representations exist in the DOM for any `hasImage` node from the very first
`renderInitial()` pass (`createShape()` + `createImageVisual()`, a cheap
`display` toggle between `.map-node-shape`/`.map-node-image` driven by
`setNodeImageActive()`, called from `applySelectionTiers()` — never a
destroy/recreate on every selection change); the `<image>`'s `href` itself is
only ever set the first time a node actually becomes image-active
(`showNodeImage()`), so panning/hovering/selecting around the graph doesn't
eagerly fetch hundreds of images up front. Collision uses a **static** radius
per node regardless of which representation is currently showing — any entry
that has an image gets the larger image-node footprint even while it's
rendering as the smaller abstract shape (`nodeRadius()` in `buildGraph()`) —
so a selection change never needs to re-run collision or repacking, only
re-render that one node's own visual. Sized noticeably larger than the
abstract dots but still plainly "a node," not a card: a bordered background
rect (`.map-image-node-bg`) keeps a small photo from reading as a loose
floating picture, and both it and the `<image>` carry `.map-shape` so they
fade through the emphasis tiers below in step, exactly like an abstract node
would. The border's *stroke color* is the node's public-type color (set
inline, same mechanism as a plain shape's fill) — an image node still reads
as its broad type at a glance without the artwork itself ever being
recolored. Entries without an image never get a `.map-node-image` group at
all; the graph stays complete either way.

**Selection-Centered Navigation.** Clicking a node makes it *the selection* —
a stable point of focus (`selectedId`) that persists until another node is
selected, a filter change removes it from the matching set, or it's
explicitly cleared. Hovering a *different* node never replaces it — the
Selection Hierarchy below is driven entirely by `selectedId`; hover is a
separate, secondary layer (see "Hover" below) that never touches it. This is
what makes the graph "walkable": select a neighbor, its own neighbors become
the next thing to explore, select one of those, and so on, without ever
leaving the map. `selectedId` has an explicit way out (`deselectNode()`):
clicking anywhere that isn't a node or a card (empty canvas, the hint text,
elsewhere on the page), or pressing Escape, drops it — otherwise walking the
graph would be a one-way ratchet with no way back to the unfocused resting
state. A filter change that hides the current selection clears it
(`applyFilter()`) rather than leaving a phantom focus on an invisible node.

**Selection Hierarchy.** A node's visual (shape or image, whichever
`createNodeVisual()` chose) shows at full opacity at rest — no node reads as
lesser than another until something is actually selected. Selecting a node
drives four tiers, computed fresh each time (`applySelectionTiers()`, nodes
and edges together): the node itself (`is-selected`, full opacity); its
direct edges (`is-neighbor`, medium); everything else in the same connected
component reachable by *some* path but not directly adjacent (`is-connected`
— "connected background," a plain union-find over the edge list computed
once after `buildGraph()`, not exposed on its own); and everything in a
different component entirely, which recedes the most (no extra class — just
the parent `#library-map-nodes.has-selection` default). Directly-connected
edges also pick up `is-active` (heavier stroke, `--signal` color) so the
connected path reads clearly — but never a text label on the edge itself,
hover or not; the preview cards are where relation/role context surfaces on
demand instead.

**Hover — secondary, never replacing the selection.** Hovering a node other
than the current selection (`setHovered()`) adds a light dashed outline
(`.is-hovered`, `:not(.is-selected)` so it never fights the selected node's
own stronger outline) and shows a second, transient card (see below) — "what
I'm considering next," visible *alongside* the selected node's persistent
card, "where I am." Neither the hovered node's own opacity tier nor the
selection's tiers change because of this — hover is purely additive. Ending
the hover (`clearHovered()`) removes the outline and hides the hover card;
hovering the already-selected node is a no-op, since its card is already the
one showing. Keyboard access skips this whole split and stays simple:
Enter/Space on a focused node always navigates directly, since neither card
is independently reachable by Tab.

**Preview cards.** Two independent instances of the same small controller
(`makeCardController()`/`populateCard()`/`positionCardFor()`/
`showCardFor()`/`hideCardFor()`) — `#library-map-card` (the persistent
selected card) and `#library-map-hover-card` (the transient hover card,
`.library-map-card--hover` modifier: lower opacity, higher z-index, no other
redesign) — so both can render at once without duplicating logic. Each
shows: primary image (when the entry has one) + title + subtitle
(`creator_names · type_label · year`, whichever are present — SPECIFIC type,
e.g. "Composition"/"Album"/"Essay", real disambiguating metadata for a work;
suppressed only for `person`/`group` entries, exactly like
`library-record.html`'s catalog kicker, since the node's own shape/color
already says "Person" and restating it in words would be redundant) + a
short, JS-truncated summary snippet. Sized as a real catalog card, not a
small tooltip, though still deliberately restrained ("a catalog preview, not a
popup dialog"): plain ruled/paper styling matching the rest of the Library,
no shadow, no rounded corners. Being ordinary HTML positioned by pixel
coordinates derived from a node's current on-screen position
(`nodeScreenPosition()`, using the SVG's bounding rect + current viewBox)
means each card is entirely outside the SVG coordinate system — pan/zoom
never affects its size. Panning/zooming re-derives just that position on
every step (`repositionVisibleCards()`) so a visible card tracks its node
instead of staying pinned to its old screen location while the graph moves
underneath it — a node's own SVG-space coordinates never change during a
pan, only the viewBox does. A drag-to-pan gesture that starts and ends over
empty canvas still fires a trailing DOM `click`; `initPanZoom()` tracks
whether the pointer actually moved past a small threshold (`didPan`) so that
trailing click is not misread by the click-away deselect handler above as
"clicked away" — panning the map must never clear the selection. Clicking
either card is the one gesture that actually navigates to the entry's real
page — a plain click on a node only selects it.

Card placement actively avoids covering other nodes, not just a fixed
corner offset: a selected node's own direct neighbors are, by construction,
usually the *closest* nodes to it (spring attraction pulls connected nodes
together), so always anchoring the card at the same +14px corner regularly
parked it directly on top of exactly the neighbors it exists to help the
user see. `positionCardFor()` tries that default corner first and, if any
currently-visible node's screen position would fall under the card, probes
a small set of other directions/distances (`CARD_DIRS`/`CARD_DISTANCES`),
using whichever placement covers the fewest nodes (ties favor the smallest
distance, then the default corner) — cheap since it's only checked once per
`showCardFor()`/pan-reposition, not per frame.

**Recenter.** Selecting a node animates the viewBox (`recenterOn()`, built on
the shared `animateViewBox()` helper — see "Map view" above — ~320ms,
ease-in-out) so the node lands at the current viewBox's *center* — "a
consistent focal position," current zoom preserved (only `currentVB.x/y`
move, never `.w/.h`), no abrupt jump. `prefers-reduced-motion: reduce` skips
the animation and jumps straight there. This is deliberately pan-only —
`relayout()`'s packing/fit-to-viewport never re-runs on selection. What
*does* now run on selection is `reheatNeighborhood()` (see "Map view"
above), a short bounded local relax giving the selected node's immediate
neighborhood real breathing room — the "modest local re-layout around the
selection, spreading out crowded neighbors" once deferred here is exactly
what that function is. A user-initiated pan or zoom cancels any in-flight
view animation (`animateViewBox()`'s single shared handle — the same one
`relayout()`'s filter-change viewport fit uses, so the two can never fight
each other either) so nothing stomps on `currentVB` mid-transition.

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

**Templates/JS/CSS.** `layouts/library/{list,single}.html`, `list.json`;
`partials/library-{collect,record,random,featured,filters,view-switch,
image-index,map-view,thumbnail,images,access,creators,works,related,rights,
validate}.html`; `assets/js/library-{filter,map}.js` (there is no separate
random script — that logic lives in `library-filter.js`, see the chance-panel
paragraph above); `assets/css/library.css`. Ruled catalog rows — never
commercial cards, cover
grids, shadows, ratings, badges, hover-zoom, or streaming-service styling. Images
are documentary, not decoration. Reuse the base shell/header/footer/type — don't
fork the layout. One archetype: `archetypes/library-entry.md`
(`hugo new --kind library-entry library/<slug>/index.md`). Moving/renaming a URL:
add the old path under `aliases:`.

## The SARC four-row mark

The supplied grayscale image (repeated/reflected SARC letterforms on black,
soft luminous edges, visible coupling lines) is an important visual artifact —
**not** the circular SARC logo (that arrives later).

Rules:

- Preserve the original raster in the repo unchanged; never overwrite it.
- Use it prominently on the homepage — masthead / institutional plate scale.
  Substantial space, no aggressive cropping, no color effects.
- Do not propagate its glow into the rest of the interface.
- Do not shrink it into a nav logo. The header uses the SARC text wordmark.

### Live landing mark (SVG reconstruction)

**Implemented** — `layouts/partials/mark.html` (generated by
`scripts/generate-mark.py` / `make mark` from `design/fonts/Nasalization-Rg.otf`),
animated by `assets/js/mark.js`, styled in `assets/css/mark.css`. The mark is a
responsive SVG system: 

- Four rows of four letters. Rows are reflected across the figure's centre in
  pairs (Row 2 is the fold-mirror of Row 1, Row 3 the centre-reflection of Row
  2, Row 4 the centre-reflection of Row 1), so at rest the mark reads as the
  woven SARC reflection.
- All four rows are emitted as their own animatable groups (no passive `<use>`).
  Every one of the sixteen letters is an independently transformable SVG group;
  the rows are not coupled.
- Animation: one letter, chosen at random from any row, turns at a time, on a
  fixed cadence (currently every 2.26s).
- Permitted transform: a 90° rotation in a random direction and restoration to
  canonical (a readable letter turns ±90°, then turns back — never a 180° jump).
  (Reflections and position swaps — removed.)
- A letter returns to readable on its own (no synchronized global reset). No
  jitter, flicker, glitch, arbitrary-angle rotation, or elastic distortion.
- `prefers-reduced-motion`: static canonical state.
- Optional interaction: click a letter → rotate it; click elsewhere on the mark
  → one constrained random mutation; pointer over the mark pauses the autonomous
  sequence.
- No "Enter" screen — institutional name and primary nav sit directly beneath
  the mark. This animation is the only prominent moving element on the site.

## Homepage quote

Beneath the mark and institutional name sits one editorial quotation —
replacing what used to be a static discipline line
("computation · nonlinear dynamics · feedback · synthesis"). This is homepage
editorial content, **not part of the Library**: quotes are never stored in a
Library entry's front matter, never become Library entries themselves, and
never appear in `index.json`, the Library filters/counts, or the Library
random-selection system. An optional `library_ref` may point *into* the
Library (a one-way pointer, validated to resolve — see below), but that's the
only relationship between the two systems.

**Data.** `data/homepage_quotes.yaml` — a flat list. Each quote: `id`
(required, unique, stable kebab-case — session storage and the client script
key on this, never on array position or on `text`), `text` (required),
`author` (required), `work` (optional), `year` (optional), `citation`
(required — an editorial verification note for maintainers; not shown on the
page), `source_url` (optional, the exact source page, never a bare homepage
or search result), `library_ref` (optional, another entry's `library.id`),
`enabled` (optional, default true). Quotes must be manually selected and
verified — one sentence or a distinctive fragment, roughly 5–25 words,
language relevant to SARC's intellectual position; no generic inspirational
language, slogans, lyrics, or paraphrases presented as direct quotations.
Leave a quote `enabled: false` rather than guess at uncertain wording; leave
`citation` honestly hedged (e.g. "exact page not yet pinned down") rather than
inventing a page number or edition. Quality over quantity — a handful of
carefully verified quotes beats a large uncertain set.

**Rendering.** `layouts/partials/homepage-quotes-resolve.html` resolves the
enabled quotes once, computing `library_url`/`link_target` per quote so
neither the server render nor the client script needs its own Library lookup:
`link_target` is `"work"` when the quote names a `work` (assumed to be the
referenced entry), `"author"` when the resolved entry is a `person` and no
`work` is given, `"full"` when `library_ref` resolves but neither applies, or
empty when there's no `library_ref` at all. `homepage-quote-attribution.html`
renders the footer for one resolved quote from that rule — author linked,
work linked (in `<cite>`), the whole attribution linked, or nothing linked;
an external `source_url` is always a separate, distinctly-labelled `Source ↗`
link, never conflated with a Library link. `homepage-quote.html` renders the
**first enabled quote** (deterministic; `Math.random()` in a Hugo template
would only randomize once per build, not per session, so the SSR version is
never random) as the no-JS fallback, embeds all enabled quotes as inline JSON
(`#homepage-quotes-data`, no separate fetch), and inlines
`assets/js/homepage-quote.js`'s content directly as a **non-deferred**
`<script>` — deliberately not the usual `<script src defer>` pattern used
elsewhere, so it runs synchronously as the parser reaches it, right after the
fallback markup, avoiding a visible flash from the fallback quote to the
session pick. The client script mirrors the attribution-link rule by hand
(same accepted duplication as `library-featured.html`/`cardHTML()` for the
Library's chance panel) since it can't call a Hugo partial at runtime.

**Selection.** One quote, stable for the browser session (`sessionStorage`,
revalidated against the current enabled set on every read — a stored id
that's no longer enabled/present is discarded and redrawn), refreshing keeps
it, a new session may get another. A light `localStorage` memory of the last
session's pick avoids immediate repetition across sessions when there's more
than one enabled quote; this is a convenience, not a real history. No
"select again" control, no timer/rotation, no visible counter — a rotating
institutional epigraph, not a quote-of-the-day widget.

**Validation** (`homepage-quotes-validate.html`, via `partialCached` from
`head.html`, alongside but independent of the Library's own validator). Fails
the build on: a missing/duplicate `id`; missing `text`/`author`/`citation`; a
non-boolean `enabled`; a malformed, Google, or bare-homepage `source_url`; a
`library_ref` that doesn't resolve to exactly one published Library entry;
duplicate quote text (normalized whitespace/case). Warns (doesn't fail) on a
quote well past the ~5–25-word guideline.

## Accessibility

Semantic HTML; keyboard-accessible navigation with visible focus states;
sufficient contrast; meaningful heading structure; alt text on all content
images; accessible figure captions; reduced-motion behavior; descriptive link
text; accessible mobile nav. **Reading and navigation must work with JS
disabled.**

## Technical requirements

Ship from the start: correct production `baseURL`; RSS (full journal feed);
XML sitemap; `robots.txt`; canonical URLs; Open Graph + social preview meta;
structured page titles; meta descriptions (fall back to `summary`); responsive
images with width/height and lazy loading; print stylesheet; custom 404; draft
preview in dev; clean URLs; a redirect mechanism (Hugo aliases in front matter,
plus server config on the host if ever needed); Hugo's built-in Chroma syntax
highlighting (build-time, no client library); reasonable security headers via
the host's server configuration (e.g. `.htaccess`) where available; no secrets
in the repo — deploy credentials live outside it.

## Performance

Minimal JS, minimal external requests. No autoplay media. No cookie banner
(nothing to consent to — see Analytics below). YouTube via click-to-load
facade. Optimized images via Hugo image processing.

## Analytics

**GoatCounter** (`sarc.goatcounter.com`) — one small async script
(`layouts/_default/baseof.html`, right before `</body>`), no cookies. Per
GoatCounter's own docs, IP address and User-Agent are used transiently to
de-duplicate a session and are not written to its database or disk — no
persistent personal identifier is stored. GoatCounter does **not** honor Do
Not Track by default, so the inline snippet in `baseof.html` implements
GoatCounter's documented DNT guard itself (checks `navigator.doNotTrack` and
skips loading `count.js` entirely when it's set) — do not remove that guard
or load the script unconditionally. This is a deliberate, narrow exception to
"minimal external requests": one script, one request per page load, chosen
specifically because it doesn't compromise the site's privacy posture the
way conventional analytics would. Do not add any other analytics, tracking
pixel, or A/B testing script without the same deliberate conversation.

## Deployment

The site is hosted on **GitHub Pages** and deploys automatically: pushing to
`main` triggers `.github/workflows/deploy.yml`, which builds with the pinned
Hugo Extended version (`hugo --gc --minify`) and publishes `public/` to Pages.
`make deploy` runs `make check` locally, then pushes `main`. Deploy from `main`
only; `public/` is gitignored and never edited by hand. Nothing server-side —
the site is fully static.

Hosting facts (discovered when the site first went live):

- **Domain:** registered at Namecheap — domain only, no web hosting.
- **DNS + email:** Fastmail is the authoritative DNS host (nameservers
  `ns1`/`ns2.messagingengine.com`) and runs email for `@sarc.systems`. The apex
  `A` records point at GitHub Pages (`185.199.108–111.153`); **MX, DKIM, and SPF
  stay on Fastmail — never change the mail records when editing DNS.**
- **Site host:** GitHub Pages, repo `sarc-systems/sarc.systems` (public — Pages
  on a free plan requires a public repo; the repo carries no secrets by design).
  The custom domain is pinned by `static/CNAME`; GitHub issues/renews the HTTPS
  certificate (Let's Encrypt) once the domain's DNS verifies.
- Fastmail can also host static sites from file storage, but Pages is used for
  git-push deploys, CI build, and CDN. (Namecheap Advanced DNS is **not**
  authoritative — DNS is edited in Fastmail.)

## Validation

`make check` runs the production build plus available checks (e.g. internal
link checking, HTML validation if tooling is present). A new post must be
publishable via `make new-post` + editing Markdown only — if a post requires a
template edit, the template is wrong.

## Non-goals (do not build)

Store/cart, user accounts, comments, newsletter infrastructure, full-text
search, interactive SARC-100 simulations, release or artist databases, headless
CMS, heavier/conventional analytics beyond the one GoatCounter script (see
Analytics above — no cookie-based tracking, no ad-tech, no session replay),
multiple themes, dark/light toggle, complex animation, placeholder pages for
unlaunched departments.

## Working rules for Claude Code

- Follow this file before changing the project; update it when conventions
  genuinely change.
- Prefer simple, legible code over clever abstraction.
- Do not rewrite major portions of the site to implement a small feature.
- Do not add a dependency where a short Hugo template or CSS rule suffices.
- Preserve existing content and visual assets; never modify or overwrite the
  original SARC mark raster.
- Journal entries are historical records — do not rewrite published entries;
  use `lastmod` and `revision_note` for meaningful updates.
- Keep future-section structure intact (`systems/` — with `systems/sarc-100/`,
  `studio/`, `label/`, `library/`) but unpublished until those departments are
  real.
