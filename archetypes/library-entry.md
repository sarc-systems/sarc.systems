---
title: "{{ replace .File.ContentBaseName `-` ` ` | title }}"
summary: ""
year:

library:
  id: "{{ .File.ContentBaseName }}"   # stable, unique id — don't reuse the title/URL
  type: ""                            # one of data/library.yaml types (book, person, manual, album, essay, website, …)
  sarc_work: false                    # true if produced by SARC
  collections: []                     # one or more ids from data/library/collections.yaml, e.g. [research] or [research, music]

# Who made it. `ref` (another entry's library.id) links the name and adds a
# reverse "Works in the Library" on that entry; omit ref for a plain name.
# role ∈ creator_roles (author|artist|composer|manufacturer|organization|…).
creators: []

# Controlled subjects (see data/library.yaml). Why it matters to SARC.
subjects: []

# Ordered images (first = primary/thumbnail). alt required unless decorative.
# Optional per-image: caption, credit, source, role, and anchor (Top/Center/Smart
# — use Top when a centred square crop cuts through a portrait's head).
# images:
#   - {file: "cover.jpg", alt: "…", caption: "", credit: "", role: cover, anchor: Top}
images: []

# Where to find it. kind selects the verb; `hosted-file` needs a bundle `file`
# (and a publishable rights status), all others need a `url`. url/file exclusive.
access: []

# Editorial links: {ref: <library.id>, relation: <relation_types>}.
related: []

# rights:                             # required for a hosted-file (see CLAUDE.md § Library)
#   status: external-link-only
#   note: ""

weight:                               # optional manual ordering (lower first)
sort_title:                           # optional alpha-sort override
draft: true
---

A concise original SARC annotation explaining why this entry belongs in the
Library.
