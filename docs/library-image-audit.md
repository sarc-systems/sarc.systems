# Library image credit/source/rights audit

Snapshot from `make library-image-audit` (`scripts/audit-library-images.py`),
run after the credit/source/rights repair pass. Re-run the script for current
numbers — this file is a point-in-time record, not a live report.

## Totals

- **176** images audited across every published Library entry
- **111** have a `source` recorded
- **47** have a `credit` naming an actual creator, photographer, archive, or
  institution (not a platform)
- **0** have a `credit` that's just a platform name (Bandcamp, Discogs,
  Wikipedia, Google, …) — the corrected batch is described below
- **166** have no `rights.status`, or an explicit `unknown` status
- **0 hard errors** — the production build passes; every `source` is either
  absent or a real absolute URL pointing at a specific record, not a bare
  homepage, search page, or Google link
- **116 warnings** — flagged for review, none block the build (see
  "Remaining warnings" below)

## What this pass fixed

1. **Schema.** Added `images[].rights.status`/`rights.note` and a small
   image-level rights vocabulary (`sarc-owned`, `public-domain`, `licensed`,
   `permitted`, `promotional`, `fair-use`, `archival`, `unknown`) in
   `data/library.yaml`, distinct from the existing page-level
   `rights_status` (which gates whether SARC may host a *file*, not a
   *picture*).
2. **Rendering.** `layouts/partials/library-image-caption.html` now renders
   caption, credit, and source as three distinct elements (a `Source ↗`
   link, never a bare URL) instead of one run-together string. List/random
   thumbnails are unchanged.
3. **Validation.** `layouts/partials/library-validate.html` now fails the
   build on: a `source` that's a bare homepage, a Google URL, or malformed;
   an invalid `rights.status`; a `licensed`/`permitted` claim with no note;
   a `public-domain` claim with no source to check it against. It also warns
   (without failing) on: a `credit` naming a platform; a missing `source`;
   a `source` that's a raw image file rather than a contextual page; a
   `source` reused across unrelated entries; a `cover` image with nothing
   identifying its edition; `rights.status: unknown`.
4. **26 pre-existing hard errors resolved** — the validator immediately
   caught real problems already in the corpus:
   - 20 images citing a bare homepage as `source` (`discogs.com/`,
     `monoskop.org/`, `cense.earth/`, `ebay.com/`, …) — each replaced with
     the exact record/page, found by hand (Discogs release/master pages,
     specific articles, specific wiki entries). Where no stable exact page
     exists (an expired eBay listing), the source was dropped rather than
     kept as a fake "exact page."
   - 6 images where `source` held descriptive text instead of a URL (e.g.
     `source: "Iannis Xenakis"`, `source: "Vehicles"`) — these were actually
     mis-filed `credit` values (the diagram's own author, or the book it was
     scanned from) and were moved to `credit` accordingly.
   - One case (`nineteen-eighty-four`) turned out to be a bigger mistake
     than a bad `source`: the "cover" image was actually a portrait of
     George Orwell at his typewriter, not book cover art. Relabeled
     `role: portrait`, corrected `alt`, and credited the actual photographer
     (Vernon Richards, Canonbury Square, late 1945) once found.
5. **62 platform-name credits removed** (`credit: "Bandcamp"`,
   `"Discogs"`, `"Wikipedia"`, `"Google"`, `"Spotify"`, …) via a one-off
   script, backfilling `source` from the entry's own Bandcamp/Discogs access
   URL wherever one existed and no `source` had been recorded yet.
6. **~20 photographs/diagrams individually re-researched**, each replacing a
   bare-homepage source with the specific page it actually came from, and
   crediting the real party where the source page named one (e.g. Éliane
   Radigue → "Photograph by Vincent Pontet" via the CutCommon article; the
   *Invisible Generation* poster → "Poster design by Michael English" via
   RealityStudio's own writeup).

## Remaining warnings (114)

Left as honest open items rather than guessed at:

- **~64 images with no `source` at all.** Mostly older portrait/cover
  entries added before this audit existed. Not a build blocker — `credit`
  alone is an accepted minimal state — but worth closing opportunistically.
- **~43 sources that are raw image files** (a CDN asset URL) rather than a
  page with context. Several of these are legitimate — no contextual page
  exists for a direct-hosted image (e.g. some `f4.bcbits.com`/`i.scdn.co`
  URLs where the Bandcamp/Spotify page itself is already cited separately
  in `access`) — but each is worth a second look.
- **~46 cover images with no caption/credit identifying their edition** —
  e.g. a plain "Cover of X" with no note on which pressing/reissue is
  pictured. Lower priority: most of these are single-edition Bandcamp
  digital releases where "the edition" is unambiguous.
- **7 explicit `rights.status: unknown`** — deliberately honest, not a
  defect; each already carries a `note` explaining what's unresolved.

## Entries most worth manual research next

These 49 images have **neither** a `source` **nor** a `credit` — the
thinnest provenance in the catalog (list current as of this snapshot; run
`make library-image-audit` for the live list):

`alvin-lucier`, `amm`, `an-approach-to-cybernetics`, `bernard-parmegiani`,
`brian-eno`, `cecil-taylor`, `chemical-basis-of-morphogenesis`,
`christopher-langton`, `cluster`, `cybernetics-of-the-sacred`,
`denis-charles`, `derek-bailey`, `evolutionary-biology-of-plants`,
`georg-cantor`, `gilles-deleuze`, `godel-escher-bach`,
`handmade-electronic-music`, `john-conway`, `jon-hassell`,
`jorge-luis-borges`, `kick-that-habit`, `kraftwerk`, `la-legende-deer`,
`la-monte-young`, `laurie-spiegel`, `masahiko-togashi`, `music-and-trance`,
`non-serviam`, `on-the-sensations-of-tone`, `origin-of-consciousness`,
`outside-the-dream-syndicate`, `pierre-schaeffer`, `reality-gates`,
`richard-pinhas`, `rouge`, `ryoji-ikeda`, `shanti`, `silence`, `steve-reid`,
`steve-roach`, `susumu-yokota`, `terry-riley`, `tetsuo-iron-man`,
`the-circular-ruins`, `the-soundscape`, `throbbing-gristle`,
`tree-of-knowledge`, `voice-crack`, `william-s-burroughs`.

Most of these predate this audit (portraits and covers added in earlier
sessions before `source`/`credit` conventions were established). None are
mislabeled as far as this pass could tell — they're just thin on
provenance, which is the honest state to leave them in rather than
inventing a photographer or page that can't be verified.

## Images not removed

No image was removed or replaced in this pass purely for having incomplete
credit — per the working rules for this task, a missing photographer/designer
credit isn't grounds for pulling a useful, accurately-described image. The
only image content changes were the corrections described above (Orwell
portrait relabeled; six diagram `source`s moved to `credit`).
