---
title: "{{ replace .File.ContentBaseName `-` ` ` | title }}"
summary: ""
creator: ""
manufacturer: ""
models: []
library:
  include: true
  type: manual
availability: hosted          # hosted | external | bibliographic
file: ""                      # bundle-relative PDF when availability: hosted
language: "English"
source_date: ""
document_date: ""
topics: []
rights:
  status: review              # MUST be established before a hosted file may publish
  basis: ""
  source: ""
  note: ""
draft: true
---

Notes on the manual, its provenance, and how it is used. A manual may be hosted,
linked to an authoritative source (`availability: external`, `external_url`), or
listed as a bibliographic record when no legitimate online copy exists
(`availability: bibliographic`, no file).
