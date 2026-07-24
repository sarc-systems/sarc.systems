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
  status: review              # publishable: sarc-owned|public-domain|licensed|permitted|archival.
  basis: ""                   # `review` keeps a hosted file a draft. For a long-discontinued
  source: ""                  # product's manual, `archival` is the usual publishable status.
  note: ""
draft: true
---

Notes on the manual, its provenance, and how it is used. A manual may be hosted,
linked to an authoritative source (`availability: external`, `external_url`), or
listed as a bibliographic record when no legitimate online copy exists
(`availability: bibliographic`, no file).
