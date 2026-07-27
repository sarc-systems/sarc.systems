# Library image credit/source/rights audit

Snapshot from `make library-image-audit` (`scripts/audit-library-images.py`),
regenerated after the rights/use schema split. Re-run the script for current
numbers — this file is a point-in-time record, not a live report. See the
script's own docstring for exactly what it scans and its parser's known
limitations (line-based, not full YAML — documented there rather than here so
it can't drift out of sync).

## Totals

- **193** catalog entries scanned — every `content/library/*` bundle plus any
  page elsewhere in `content/` joining via `library.include: true` (none yet;
  Systems/Studio/Label aren't public)
- **186** images audited
- **114** have a `source` recorded
- **49** have a `credit` naming an actual creator, photographer, archive, or
  institution (not a platform)
- **1** has a `credit` that's just a platform name (`Wikipedia`) — the
  corrected batch described below got the other 62; this one predates it
- **185** have no `rights.status`, or an explicit `unknown` status — this
  number rose after the rights/use split below, since `promotional` and
  `archival` no longer count as a *rights* status at all (see "What this pass
  fixed")
- **0 hard errors** — the production build passes
- **191 warnings**, which break down by category as:
  - **72** images with no `source` at all
  - **47** cover images with nothing identifying their edition
  - **27** images with an explicit `rights.status: unknown`
  - **44** sources that are raw image files rather than a contextual page
  - **1** credit naming a platform
  - These five numbers sum to 191 because, in the current corpus, no single
    image triggers more than one category at once — that's incidental, not
    guaranteed. A future image could trigger two categories at once (e.g. no
    source *and* an unidentified cover edition), which would make the
    category breakdown sum to more than the warning total. If you see that,
    it's not a counting error — it means some images have multiple issues.

## What this pass fixed (rights/use schema split)

The image-level rights vocabulary used to conflate two different claims:
a copyright *status* (`sarc-owned`, `public-domain`, `licensed`, `permitted`)
and an editorial *rationale for using the image anyway* (`promotional`,
`fair-use`, `archival`) — despite living in one field called `rights.status`,
which implied more legal certainty than the rationale values ever provided.

Split into two independent fields (`data/library.yaml`):

```yaml
images:
  - file: cover.jpg
    rights:
      status: unknown        # sarc-owned | public-domain | licensed | permitted | unknown
    use:
      basis: identification  # identification | editorial | promotional | fair-use | archival
      note: "Label cover art used for identification."
```

`rights.status` no longer accepts `promotional`/`fair-use`/`archival` — those
became `use.basis` values instead, paired with a `use.note`. 14 existing
entries used one of those three as a `rights.status` and were migrated:
11 cover images (`promotional` → `rights.status: unknown` +
`use: {basis: identification, note: <unchanged>}`) and 3 manual diagrams
(`archival` → `rights.status: unknown` + `use: {basis: archival, note:
<unchanged>}`). No `note` text was altered — only which field it lives under.
`layouts/partials/library-validate.html` and `scripts/audit-library-images.py`
both validate `use.basis` against the new vocabulary the same way they
already validated `rights.status`.

## Earlier fixes (credit/source/rights audit pass)

1. **Schema.** Added `images[].rights.status`/`rights.note` (and, as of the
   split above, `images[].use.basis`/`use.note`) — distinct from the
   page-level `rights_status` (which gates whether SARC may host a *file*,
   not a *picture*).
2. **Rendering.** `layouts/partials/library-image-caption.html` renders
   caption, credit, and source as three distinct elements (a `Source ↗`
   link, never a bare URL) instead of one run-together string. List/random
   thumbnails are unchanged.
3. **Validation.** `layouts/partials/library-validate.html` fails the build
   on: a `source` that's a bare homepage, a Google URL, or malformed; an
   invalid `rights.status` or `use.basis`; a `licensed`/`permitted` claim
   with no note; a `public-domain` claim with no source to check it against.
   It warns (without failing) on: a `credit` naming a platform; a missing
   `source`; a `source` that's a raw image file rather than a contextual
   page; a `source` reused across unrelated entries; a `cover` image with
   nothing identifying its edition; `rights.status: unknown`.
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
   URL wherever one existed and no `source` had been recorded yet. (One
   further platform credit, `wikipedia` on an entry added afterward, remains
   — see totals above.)
6. **~20 photographs/diagrams individually re-researched**, each replacing a
   bare-homepage source with the specific page it actually came from, and
   crediting the real party where the source page named one (e.g. Éliane
   Radigue → "Photograph by Vincent Pontet" via the CutCommon article; the
   *Invisible Generation* poster → "Poster design by Michael English" via
   RealityStudio's own writeup).

## Entries most worth manual research next

These 53 images have **neither** a `source` **nor** a `credit` — the
thinnest provenance in the catalog (list current as of this snapshot; run
`make library-image-audit` for the live list):

`alvin-lucier`, `amm`, `an-approach-to-cybernetics`, `bernard-parmegiani`,
`brian-eno`, `cecil-taylor`, `chemical-basis-of-morphogenesis`,
`christopher-langton`, `cluster`, `cybernetics-of-the-sacred`,
`denis-charles`, `derek-bailey`, `don-cherry-terry-riley-koln-1975`,
`ed-blackwell`, `eliane-radigue`, `evolutionary-biology-of-plants`,
`georg-cantor`, `gilles-deleuze`, `godel-escher-bach`,
`handmade-electronic-music`, `john-conway`, `jon-hassell`,
`jorge-luis-borges`, `kick-that-habit`, `kraftwerk`, `la-legende-deer`,
`la-monte-young`, `laurie-spiegel`, `masahiko-togashi`, `music-and-trance`,
`non-serviam`, `on-the-sensations-of-tone`, `origin-of-consciousness`,
`outside-the-dream-syndicate`, `pierre-schaeffer`, `reality-gates`,
`richard-pinhas`, `rouge`, `ryoji-ikeda`, `shanti`, `silence`, `steve-reid`,
`steve-roach`, `susumu-yokota`, `terry-riley`, `tetsuo-iron-man`,
`the-circular-ruins`, `the-soundscape`, `throbbing-gristle`,
`tree-of-knowledge`, `trilogie-de-la-mort` (a second image on that entry;
its cover is separately sourced), `voice-crack`, `william-s-burroughs`.

Most of these predate the original audit (portraits and covers added before
`source`/`credit` conventions were established, plus a few added afterward
without a source in hand yet). None are mislabeled as far as this pass could
tell — they're just thin on provenance, which is the honest state to leave
them in rather than inventing a photographer or page that can't be verified.

## Images not removed

No image was removed or replaced in either pass purely for having incomplete
credit — a missing photographer/designer credit isn't grounds for pulling a
useful, accurately-described image. The only image content changes were the
corrections described above (Orwell portrait relabeled; six diagram
`source`s moved to `credit`; 14 entries' `rights.status` split into
`rights`/`use`).
