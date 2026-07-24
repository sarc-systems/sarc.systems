---
title: "{{ replace .File.ContentBaseName `-` ` ` | title }}"
date: {{ .Date }}
summary: ""
authors:
  - "SARC"
library:
  include: true
  type: writing
document_type: essay          # essay | paper | report | statement | manifesto | transcript
availability: hosted          # SARC hosts the full text (this HTML page)
# file: "essay.pdf"           # optional PDF edition offered alongside the HTML
topics: []
rights:
  status: sarc-owned
  basis: "Original SARC work"
draft: true
---

Write the finished text here — HTML-first. Assets (figures, a PDF edition) live
in this bundle. A Writing is a durable finished text, distinct from a dated
Journal entry.
