---
title: "Phase-locked loop (PLL)"
summary: "A feedback circuit that continuously adjusts an oscillator's phase and frequency to match a reference signal."

library:
  id: pll
  type: concept
  sarc_work: false
  collections: [music]

creators:
  - {name: "Henri de Bellescize", role: researcher}

subjects: [time, dynamics, feedback]

images: []

access: []

related:
  - {ref: quadrature, relation: related-work}
  - {ref: servo, relation: related-work}

draft: false
---

A feedback circuit that compares the phase of a local oscillator against a reference signal and continuously adjusts the oscillator to minimize the difference, locking the two into a fixed phase relationship. Henri de Bellescize published the first PLL circuit, for synchronous radio reception, in 1932; the technique became a standard building block of radio, television, and telecommunications engineering, and later a core circuit in analog synthesizers, used both to track pitch and to generate [quadrature](/library/research/quadrature/) and sync signals.
