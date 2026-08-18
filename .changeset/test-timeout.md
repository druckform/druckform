---
"@druckform/core": patch
---

Raises the vitest timeout to 30s. Several integration tests transpile every
component of every bundled template; they run in 1-3s alone but the parallel
pool inflates that past the 5s default, so they failed sporadically and were
treated as known flakes. No test asserts timing.
