---
title: "Gate"
summary: "A control signal marking the duration a note or event is held, on for its length and off otherwise."

library:
  id: gate-signal
  type: protocol
  sarc_work: false

subjects: [instruments, time]

images: []

access: []

related:
  - {ref: trigger-signal, relation: related-work}

draft: false
---

A control signal that stays high for the duration a note or event is held and low otherwise, commonly used to open an envelope generator's sustain phase — distinct from a trigger, which only marks an event's onset.
