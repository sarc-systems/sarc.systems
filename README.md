# sarc.systems

Website of the **Studio for Advanced Research in Cybernetics (SARC)**.
Static site built with **Hugo Extended**. Git + Markdown are the CMS.

See [`CLAUDE.md`](./CLAUDE.md) for the full project conventions — read it before
changing anything.

## Requirements

- **Hugo Extended `v0.164.0`** (pinned; the `extended` build is required for
  image processing and asset bundling). Check with `hugo version` — the string
  must contain `+extended`.

  ```
  brew install hugo          # macOS
  ```

## Commands

```
make dev        # hugo server with drafts (-D) + future posts, local dev
make build      # production build (minified, correct baseURL) -> public/
make check      # production build + required-output and link checks
make new-post SLUG=my-entry   # new journal bundle from the archetype
make deploy     # check + rsync public/ to the host (deploy from main only)
```

## Structure

- `content/` — Markdown. Journal entries are **leaf page bundles** under
  `content/journal/<year>/<slug>/` and carry their own images/audio/diagrams.
- `layouts/` — the custom theme (plain HTML templates, no third-party theme).
- `assets/css/` — plain CSS, concatenated + minified through Hugo.
- `assets/js/` — minimal progressive-enhancement JS (the landing mark).
- `assets/img/` — source visual assets, incl. the SARC four-row mark.
- `static/` — passthrough files (`robots.txt`, favicon, …).

## The SARC four-row mark

The homepage masthead renders the **original supplied grayscale raster** of the
four-row mark (`assets/img/rect15_larger.png`) at institutional-plate scale,
using `mix-blend-mode: screen` so its black ground blends into the black plate.
The originals are **preserved unchanged — never overwrite or re-encode them.**

The responsive-SVG reconstruction described in `CLAUDE.md` remains planned future
work. See `assets/img/README.md`.

## Deploy

`make deploy` runs `make check` then rsyncs `public/` to the host docroot.
Credentials/targets are **not** in the repo — set them in a gitignored
`deploy.env`:

```
DEPLOY_HOST=user@host.example.com
DEPLOY_PATH=/var/www/sarc.systems/public_html/
```

then `set -a; . ./deploy.env; set +a; make deploy` (or export them in your
shell). Deploy from `main` only; `public/` is gitignored and never hand-edited.
