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

## Planned: live SVG reconstruction

`CLAUDE.md` describes an eventual responsive-SVG reconstruction of the mark
(stable outer rows, an active transform layer, derived reflections,
reduced-motion behaviour). That remains future work and should be built against
these real letterforms — not the placeholder that previously stood in for it.
