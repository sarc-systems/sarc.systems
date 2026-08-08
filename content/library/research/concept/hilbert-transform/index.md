---
title: "Hilbert Transform"
summary: "A linear operator that shifts every frequency component of a signal by 90°, used to construct the analytic signal and recover instantaneous phase, frequency, and amplitude."
year: 1905

library:
  id: "hilbert-transform"
  type: concept
  sarc_work: false

creators:
  - {name: "David Hilbert", role: researcher, ref: david-hilbert}

subjects: [number, computation, sound]

images: []

access: []

related: []

draft: false
---

Introduced by [David Hilbert](/library/research/david-hilbert/) in work on Riemann-Hilbert boundary value problems, the Hilbert transform is a linear operator that shifts every frequency component of a real-valued signal by a quarter cycle (90°) without changing its amplitude. Adding this phase-shifted version to the original signal, multiplied by the imaginary unit, produces the analytic signal — a complex-valued representation whose magnitude and unwrapped phase directly give the signal's instantaneous amplitude and instantaneous frequency at every point in time. This makes the transform a standard tool in signal processing and electronic music: single-sideband modulation, envelope followers, frequency shifters (as distinct from pitch shifters, since a frequency shift is not proportional across a signal's partials), and phase vocoders all depend on it.
