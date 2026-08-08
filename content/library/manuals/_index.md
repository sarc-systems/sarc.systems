---
title: "Manuals"
summary: "Hardware and instrument manuals, service documentation, and technical literature."
type: library
# This section index doubles as the manuals Collection's own Collection-
# summary Entry at the Library root (/library/) — see docs/library-v2.md
# § 11 and the equivalent comment in content/library/research/_index.md.
# id/type/color here duplicate data/library/collections.yaml's engine-
# authoritative registry entry deliberately, and are read through the
# SHARED data/library.yaml vocabulary (not manuals' own — it shares
# research's vocabulary, see the comment in collections.yaml) when
# rendered at the root. Keep these three fields in sync with the registry
# entry of the same id — library-validate.html checks it.
library:
  id: manuals
  type: collection
  color: imperial-blue
# Placeholder cover — see the equivalent comment in
# content/library/research/_index.md.
images:
  - file: "cover.png"
    alt: "Solid square in Colorplan Imperial Blue, representing the Manuals collection"
    role: cover
    credit: "SARC"
    rights:
      status: sarc-owned
outputs:
  - HTML
  - JSON
draft: false
---
