---
title: "PID controller"
summary: "A control algorithm that corrects a system's error using three combined terms — proportional, integral, and derivative — the standard formal method behind most feedback control."

library:
  id: pid-controller
  type: concept
  sarc_work: false

creators:
  - {name: "Nicolas Minorsky", role: researcher}

subjects: [dynamics, cybernetics, computation, feedback]

images: []

access: []

related:
  - {ref: servo, relation: related-work}

draft: false
---

A feedback control algorithm that computes its correction from three combined terms: proportional (the current error), integral (the accumulated error over time), and derivative (the rate at which the error is changing) — a formulation flexible enough to correct steady offset, not just instantaneous error, without overcorrecting. Nicolas Minorsky published the first rigorous three-term analysis in 1922, developed for automatic ship steering and modeled on how a human helmsman actually corrects a course, and it remains the standard general-purpose algorithm behind a [servo](/library/research/servo/)'s correction.
