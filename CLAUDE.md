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
layouts/partials/library-*.html      # collect, record, random, featured, filters, images,
                                      #   image-caption, access, creators, works, related,
                                      #   rights, validate
assets/js/library-filter.js          # catalog filter (type/subject/sarc; progressive enhancement)
assets/js/library-random.js          # "From the Library" random entry
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

Current desktop nav: `SARC | JOURNAL | LIBRARY | ABOUT | YOUTUBE | GITHUB`
(YouTube and GitHub are external links to the SARC channel and GitHub org).
Future: `SARC | JOURNAL | SYSTEMS | STUDIO | LABEL | LIBRARY | ABOUT` (plus the
external YouTube/GitHub links) — the nav is built from the `[menus]` definition
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
  type: release        # one of data/library.yaml types (person, book, manual, release, essay, website, system, …)
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
  both `type: manual`). Powers the *Origin* filter.
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
  `public-domain`, `licensed`, `permitted`, `promotional`, `fair-use`,
  `archival`, `unknown` — a separate, smaller vocabulary from the
  hosted-file `rights.status` below) records what's actually known without
  implying a legal determination that hasn't been made; pair `licensed` /
  `permitted` with a `note` explaining the basis. Examples:

  ```yaml
  # photograph, creator known
  - {file: cover.jpg, alt: "...", credit: "Photograph by Kira Perov",
     source: "https://composers-inside-electronics.net/..."}
  # cover artwork, edition matters
  - {file: cover.jpg, alt: "...", role: cover,
     caption: "Penguin Audio edition.", source: "https://...",
     rights: {status: promotional, note: "Publisher cover art used for identification."}}
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
  Google/malformed `source`, an invalid `rights.status`, or a `licensed`/
  `permitted`/`public-domain` claim with no note or source to back it —  and
  warns (without failing) on a platform-name `credit`, a missing `source`, a
  raw-CDN `source`, or an unresolved `rights.status`. `make library-image-audit`
  (`scripts/audit-library-images.py`) gives an offline, non-network report of
  the same, for auditing beyond what a single build run surfaces.
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
random entry, `library-random.js` + `sessionStorage`, "Another entry"; a
deterministic server-rendered fallback — `featured: true` or first — keeps it
non-blank with no JS) → **filters** → **All entries** (ruled records with
thumbnails). **Filter** by type + subject + SARC-work: OR within a facet, AND
across; shareable `?type=a,b&subject=c&sarc=true`; history-aware; Clear; polite
`aria-live` count; `library-filter.js`. Without JS the whole catalog is visible
and the filter form is hidden (CSS-gated on `data-nojs`). Records carry
`data-type` / `data-subjects` / `data-sarc` / `data-library-id`.

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
`partials/library-{collect,record,random,featured,filters,images,access,creators,
works,related,rights,validate}.html`; `assets/js/library-{filter,random}.js`;
`assets/css/library.css`. Ruled catalog rows — never commercial cards, cover
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
(`layouts/_default/baseof.html`, right before `</body>`), no cookies, no
personal data collected, respects Do Not Track. This is a deliberate,
narrow exception to "minimal external requests": one script, one request
per page load, chosen specifically because it doesn't compromise the
site's privacy posture the way conventional analytics would. Do not add
any other analytics, tracking pixel, or A/B testing script without the
same deliberate conversation.

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
