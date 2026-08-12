---
title: "Music"
summary: "Composers, musicians, groups, recordings, compositions, instruments, and musical institutions and practices that matter to SARC's own research."
type: library
# This section index doubles as Music's own Collection-summary Entry at the
# Library root (/library/) — see docs/library-v2.md § 11 and the equivalent
# comment in content/library/research/_index.md. id/type/color here
# duplicate data/library/collections.yaml's engine-authoritative registry
# entry deliberately, and are read through the SHARED data/library.yaml
# vocabulary (not a Music-specific one — it shares research's vocabulary,
# see the comment in collections.yaml) when rendered at the root. Keep
# these three fields in sync with the registry entry of the same id —
# library-validate.html checks it.
library:
  id: music
  type: collection
  color: tabriz-blue
# Placeholder cover — see the equivalent comment in
# content/library/research/_index.md. Generate/regenerate with
# `make library-covers`.
images:
  - file: "cover.png"
    alt: "Solid square in Colorplan Tabriz Blue, representing the Music collection"
    role: cover
    credit: "SARC"
    rights:
      status: sarc-owned
outputs:
  - HTML
  - JSON
draft: false
---
