---
title: "Sonifying the Computation of Pi"
date: 2026-07-23T11:00:00-06:00
summary: "A clocked computational process whose intermediate state becomes control voltage."
entry_type: "worklog"
topics: [computation, control-voltage, bela, sonification]
projects: [sarc-100]
series: [computational-instruments]
youtube: "kbceHW9pjHM"
image: ""
draft: false
---

The question this worklog follows is narrow: what does it sound like when a
machine computes π? Not the number read aloud, but the *process* — the
intermediate state of an algorithm, tapped continuously and routed into the
control-voltage domain of the SARC‑100.

## The process as oscillator

A spigot algorithm produces the digits of π one at a time, but its internal
registers move constantly between digit emissions. Those registers are the
material. On each tick of a slow master clock the current register value is
latched, scaled, and written to a DAC channel as a control voltage.

{{< figure src="diagram.svg" alt="Signal path: master clock into a spigot register, latched to a DAC, out as control voltage into the SARC-100." caption="The signal path. A slow clock latches the algorithm's register state to a DAC; the resulting control voltage drives pitch and timbre on the SARC-100." class="wide" >}}

Because the register state is deterministic, the sequence is *fixed* — the same
every run — but it is not periodic on any human timescale. It reads as
structured and non-repeating at once, which is exactly the quality worth
chasing.

## Clocking and range

Two parameters do most of the work:

| Parameter        | Range        | Effect                                    |
| ---------------- | ------------ | ----------------------------------------- |
| Clock period     | 40  – 2000 ms | Density of events; the "tempo" of compute |
| Register scaling | 0 – 5 V       | Mapping of state onto pitch/timbre        |

At long clock periods the computation becomes a slow melodic contour. Below
roughly 60 ms per tick the same data crosses into the audio rate and the
register sequence is heard directly as timbre rather than as a sequence of
pitches.[^1]

## What the video shows

The recording below runs the process open-loop for four minutes: first at a slow
clock, then accelerating until the register crosses into audio rate. No pitch
quantisation — the raw scaled voltage drives the oscillator so the arithmetic
stays audible.

{{< youtube id="kbceHW9pjHM" title="Sonifying the computation of Pi on the SARC-100" >}}

## Next

The register tap is currently single-channel. The next pass splits high and low
words of the register onto two DAC channels so the same computation drives two
coupled voices — the beginning of treating an algorithm as a small ensemble.

[^1]: The 60 ms figure is approximate and depends on the register's rate of
    change, which is not constant across the algorithm's run.
