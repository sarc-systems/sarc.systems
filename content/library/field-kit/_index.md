---
title: "Field Kit"
summary: "A traveling instrument technician's tool case — a small, deliberately non-SARC fixture proving the Library engine works for an unrelated domain, vocabulary, and Shelf/Projection configuration."
type: library
# Cascades draft: true to every page in this Collection (this _index.md
# included) — the ACTUAL mechanism keeping the Library v2 genericity
# fixture (docs/library-v2.md § 14) out of production: Hugo excludes
# draft content entirely from a build without -D, so `make build`/
# `make check` produce no output for this Collection at all (not linked,
# not routed, not in the sitemap), while `make dev` (hugo server -D)
# builds and serves it normally. data/library/collections.yaml's
# `build.production: false` on this Collection is the declarative,
# human-readable marker of the same fact; library-validate.html's
# content-dependent checks (section-page consistency, Shelf references)
# are explicitly guarded to skip a non-production Collection during an
# actual production build, since its content is legitimately absent then.
cascade:
  - draft: true
# This section index doubles as field-kit's own Collection-summary Entry
# at the Library root (/library/) — see docs/library-v2.md § 11 and the
# equivalent comment in content/library/research/_index.md. id/type/color
# here duplicate data/library/collections.yaml's engine-authoritative
# registry entry deliberately, and are read through the SHARED
# data/library.yaml vocabulary (not field-kit's own) when rendered at the
# root — the "collection" type lives in the shared vocab as a root-only,
# engine-level concept. Keep these three fields in sync with the registry
# entry of the same id — library-validate.html checks it.
library:
  id: field-kit
  type: collection
  color: mandarin
outputs:
  - HTML
  - JSON
---
