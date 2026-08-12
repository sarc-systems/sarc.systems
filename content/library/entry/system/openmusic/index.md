---
title: "OpenMusic"
summary: "IRCAM's visual, Lisp-based computer-aided composition environment."

library:
  id: openmusic
  type: software
  sarc_work: false
  collections: [music]

creators:
  - {name: "IRCAM", role: developer, ref: ircam}

subjects: [computation, language]

images: []

access: []

related:
  - {ref: lisp, relation: programmed-in}
  - {ref: computer-music, relation: implements}

draft: false
---

Developed at [IRCAM](/library/research/ircam/) as the successor to an earlier line of in-house computer-aided composition tools, OpenMusic is a visual programming environment built on Common Lisp: composers wire together modules on a graphical patch, much as in Max or Pure Data, but the results render as conventional musical notation rather than audio signal flow. Released under GPLv3 and available for macOS, Windows, and Linux, it has been extended by user-contributed libraries into constraint programming, spectral analysis, and sound synthesis, and used by composers including Kaija Saariaho, Tristan Murail, and Brian Ferneyhough.
