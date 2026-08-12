---
title: "MIDI Polyphonic Expression (MPE)"
summary: "An extension convention over MIDI enabling independent per-note expressive control."

library:
  id: midi-polyphonic-expression
  type: protocol
  sarc_work: false
  collections: [research, music]

subjects: [computation, instruments, language]

images: []

access: []

related:
  - {ref: midi, relation: version-of}

draft: false
---

A convention layered over standard MIDI, assigning each simultaneously played note its own MIDI channel so pitch bend, pressure, and other continuous controllers can be applied independently per note rather than to a whole instrument at once.
