---
title: "{{ replace .File.ContentBaseName `-` ` ` | title }}"
date: {{ .Date }}
summary: ""
entry_type: "worklog"        # worklog | video | essay | announcement | field-note
topics: []
projects: []
series: []                   # optional
youtube: ""                  # optional video URL
image: ""                    # optional featured image (bundle-relative)
lastmod:                     # optional, when meaningfully updated
revision_note: ""            # optional, human-readable note about updates
draft: true
---

Write the entry here. Assets (images, audio, diagrams, PDFs) live in this same
folder and are referenced with the `figure`/`audio` shortcodes.
