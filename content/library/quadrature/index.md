---
title: "Quadrature"
summary: "Two periodic signals offset by exactly a quarter cycle (90°) — the relationship behind quadrature oscillators, phase detection, and stereo/spatial encoding."

library:
  id: quadrature
  type: concept
  sarc_work: false

subjects: [time, computation]

images: []

access: []

related:
  - {ref: phase, relation: related-work}
  - {ref: pll, relation: related-work}

draft: false
---

A special case of [phase](/library/phase/) offset in which two periodic signals of the same frequency differ by exactly a quarter cycle, 90°. A pair of quadrature signals — commonly labeled I (in-phase) and Q (quadrature) — carries more information than either alone, since their relative sign and magnitude encode direction as well as magnitude; the relationship is used to detect phase and frequency error in a [phase-locked loop](/library/pll/), to build oscillators that output sine and cosine simultaneously, and in stereo and spatial audio encoding.
