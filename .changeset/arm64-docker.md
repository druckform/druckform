---
"@druckform/core": patch
---

`--engine docker` (and `--engine auto`'s Docker fallback) now works on Apple Silicon. The published Docker image is built multi-arch (linux/amd64 + linux/arm64) instead of amd64-only, so it pulls and runs natively on arm64. Also adds `DRUCK_DOCKER_PLATFORM` to force the container platform (e.g. `linux/amd64`) when relaying to Docker.
