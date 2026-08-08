---
title: "Turing machine"
summary: "An abstract model of computation — an infinite tape, a read/write head, and a finite table of rules — that defines what it means for a function to be computable at all."

library:
  id: turing-machine
  type: concept
  sarc_work: false

creators:
  - {name: "Alan Turing", role: researcher, ref: alan-turing}

subjects: [computation, memory]

images: []

access: []

related:
  - {ref: state-machine, relation: related-work}

draft: false
---

An abstract computing device consisting of an infinite tape divided into cells, a head that reads and writes one cell at a time and can move left or right, and a finite table of rules governing what the head does next based on the current state and the symbol it reads. [Alan Turing](/library/research/alan-turing/) introduced it in 1936 not as a machine to be built but as a precise definition of what it means for a function to be computable at all — a [state machine](/library/research/state-machine/) with unbounded memory, and still the reference model against which every real computer's theoretical power is measured.
