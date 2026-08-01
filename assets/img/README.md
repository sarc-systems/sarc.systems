# assets/img

Source visual assets for the site.

## The SARC four-row mark (original raster)

The supplied grayscale image — repeated/reflected SARC letterforms on black,
soft luminous edges, visible coupling lines. An important visual artifact (it is
**not** the circular SARC logo, which arrives later).

Files (both are the supplied originals, **preserved unchanged** — never
overwrite or re-encode them):

- `rect15_larger.png` — 681×631. **Used on the homepage masthead** and as the
  social-preview image. Displayed with `mix-blend-mode: screen` so its black
  ground drops onto the black plate with no visible box edge.
- `rect15.png` — 486×486, tighter crop. Kept as the alternate original.

**Rules (from `CLAUDE.md`):** preserve the originals unchanged; use the mark
prominently at masthead scale with substantial space and no colour effects; do
not propagate its glow into the rest of the interface; do not shrink it into a
nav logo (the header uses the SARC text wordmark).

## Live SVG reconstruction

Implemented — `layouts/partials/mark.html` (generated from these real
letterforms by `scripts/generate-mark.py` / `make mark`), animated by
`assets/js/mark.js`. See `CLAUDE.md` § "Live landing mark (SVG
reconstruction)" for the full behaviour.
