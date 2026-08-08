---
title: "State machine"
summary: "An abstract model of computation consisting of a finite set of states and the rules that transition between them in response to input."

library:
  id: state-machine
  type: concept
  sarc_work: false

subjects: [time, computation, memory]

images: []

access: []

related:
  - {ref: turing-machine, relation: related-work}
  - {ref: cellular-automata, relation: related-work}

draft: false
---

An abstract model of computation defined by a set of distinct states, one active at a time, and a set of rules describing which state comes next given the current state and an input. A state machine formalizes a system whose behavior depends not just on its present input but on where it already is in some prior sequence — the model underlying everything from a vending machine's logic to a synthesizer's envelope stages, and a restricted special case of the more general [Turing machine](/library/research/turing-machine/).
