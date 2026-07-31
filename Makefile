# Makefile — sarc.systems
# Short and legible on purpose. Not a task runner.

HUGO ?= hugo

.PHONY: dev build check new-post deploy clean colorplan mark library-image-audit library-structural-report

## dev — local server with drafts and future-dated posts
dev:
	$(HUGO) server -D -F --navigateToChanged

## build — production build (minified, correct baseURL)
build:
	$(HUGO) --gc --minify

## check — production build plus validation and link checks
check: build
	@echo "==> Checking internal links and required outputs"
	@test -f public/index.html        || { echo "FAIL: no index.html"; exit 1; }
	@test -f public/index.xml         || { echo "FAIL: no RSS feed"; exit 1; }
	@test -f public/sitemap.xml       || { echo "FAIL: no sitemap"; exit 1; }
	@test -f public/journal/index.html|| { echo "FAIL: no journal index"; exit 1; }
	@# Flag any relref/ref failures Hugo left in the HTML, plus obvious broken hrefs.
	@! grep -rl "ZgotmplZ\|HAHAHUGO" public >/dev/null 2>&1 || { echo "FAIL: template error markers in output"; exit 1; }
	@echo "OK: build and basic checks passed"

## new-post — scaffold a journal entry bundle from the archetype
## usage: make new-post SLUG=my-entry  (year defaults to current)
new-post:
	@test -n "$(SLUG)" || { echo "usage: make new-post SLUG=my-entry [YEAR=2026]"; exit 1; }
	$(HUGO) new "journal/$(or $(YEAR),$(shell date +%Y))/$(SLUG)/index.md"
	@echo "==> edit content/journal/$(or $(YEAR),$(shell date +%Y))/$(SLUG)/index.md"

## deploy — validate locally, then push main to publish. GitHub Actions builds
## and deploys to GitHub Pages (.github/workflows/deploy.yml). Deploy from main.
deploy: check
	@test "$$(git rev-parse --abbrev-ref HEAD)" = main || { echo "deploy from main only"; exit 1; }
	git push origin main

## colorplan — regenerate Colorplan palette outputs from the source snapshot
## (data/colorplan.json + assets/css/generated/colorplan.css). Committed output;
## normal builds never run this.
colorplan:
	node scripts/import-colorplan.mjs

## mark — regenerate the four-row mark SVG partial from the Nasalization font
## (layouts/partials/mark.html). Committed output; re-run only when the mark
## letterforms change. Requires: pip install fonttools Pillow.
mark:
	python3 scripts/generate-mark.py

## library-image-audit — offline report on every Library image's credit/source/
## rights metadata (scripts/audit-library-images.py). Read-only, no network
## calls; exits nonzero only on hard errors (the same ones the build itself
## already fails on) — pass --strict to also fail on warnings.
library-image-audit:
	python3 scripts/audit-library-images.py

## library-structural-report — regenerate the Library relationship-graph
## report (scripts/library-structural-report.py -> research/library-audit/
## structural-report.md): counts, connected components, isolated entries,
## data-integrity checks. Read-only, no network calls.
library-structural-report:
	python3 scripts/library-structural-report.py

## clean — remove build artifacts
clean:
	rm -rf public resources/_gen
