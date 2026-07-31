---
title: "Servo (servomechanism)"
summary: "A feedback control system that continuously compares a mechanism's actual position or speed against a target and corrects the error."

library:
  id: servo
  type: concept
  sarc_work: false

subjects: [feedback]

images: []

access: []

related:
  - {ref: pid-controller, relation: related-work}
  - {ref: governor, relation: related-work}

draft: false
---

A feedback control system that continuously measures a mechanism's actual position, velocity, or other output, compares it against a target, and drives an actuator to correct the difference — the general mechanism behind everything from a ship's autopilot to a camera autofocus motor. A [governor](/library/governor/) is a simple servomechanism specialized to regulate speed alone; a [PID controller](/library/pid-controller/) is the standard formal algorithm used to compute a servo's correction from present, accumulated, and changing error.
