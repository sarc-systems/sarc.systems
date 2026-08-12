---
title: "Entry"
# This is NOT a page - it exists purely so Hugo treats "entry" as a real
# section (content/library/entry/), which is what makes the :sections[1]
# permalink rule (hugo.toml) resolve a flat-tree Entry's canonical URL to
# /library/entry/<slug>/ instead of collapsing to /library/<slug>/ (Hugo's
# :sections[N] permalink tokens walk the SECTION tree - directories with
# their own _index.md - not raw path segments; the <public-type> folders
# beneath this one deliberately have no _index.md of their own, so they
# never become sections and never appear in the URL). build: render: never
# means this file produces no output of its own - there is no
# /library/entry/ page, by design; see CLAUDE.md Library "Collection
# membership".
build:
  render: never
  list: never
draft: false
---
