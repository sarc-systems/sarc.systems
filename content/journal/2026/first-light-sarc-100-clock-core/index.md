---
title: "First Light: The SARC-100 Clock Core"
date: 2026-06-30T09:30:00-06:00
summary: "The master clock and control-voltage bus that everything else on the SARC-100 will hang from."
entry_type: "worklog"
topics: [control-voltage, clocking, hardware]
projects: [sarc-100]
series: [computational-instruments]
draft: false
---

Before anything can be sonified, there has to be a clock and a bus to carry
voltages between modules. This entry records the first working version of both
on the SARC‑100.

## The clock

A single low-jitter master clock, divided down into a small set of related
rates. Everything downstream — sequencers, latches, the computational taps in
later work — references this one source, so the whole instrument stays phase-
coherent by construction rather than by correction.

## The bus

Control voltage is distributed on a shared 0–5 V bus with per-module attenuation
at the point of use. It is deliberately dumb: no addressing, no digital
handshake, just voltage and time. That constraint is the point — it keeps the
instrument legible.

The next worklog taps this bus with a computational source for the first time.
