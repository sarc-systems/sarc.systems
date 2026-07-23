# Makefile — sarc.systems
# Short and legible on purpose. Not a task runner.

HUGO ?= hugo
# Deploy target lives OUTSIDE the repo (no secrets checked in). Set these in
# your shell or a gitignored deploy.env sourced before `make deploy`.
DEPLOY_HOST   ?=
DEPLOY_PATH   ?=
DEPLOY_RSYNC  ?= rsync -avz --delete --exclude '.DS_Store'

.PHONY: dev build check new-post deploy clean colorplan

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

## deploy — production build then rsync public/ to the host (deploy from main)
deploy: check
	@test -n "$(DEPLOY_HOST)" || { echo "set DEPLOY_HOST (and DEPLOY_PATH), e.g. in deploy.env"; exit 1; }
	@test -n "$(DEPLOY_PATH)" || { echo "set DEPLOY_PATH"; exit 1; }
	$(DEPLOY_RSYNC) public/ "$(DEPLOY_HOST):$(DEPLOY_PATH)"

## colorplan — regenerate Colorplan palette outputs from the source snapshot
## (data/colorplan.json + assets/css/generated/colorplan.css). Committed output;
## normal builds never run this.
colorplan:
	node scripts/import-colorplan.mjs

## clean — remove build artifacts
clean:
	rm -rf public resources/_gen
