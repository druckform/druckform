---
"@druckform/core": patch
---

Ship the bundled templates in the published package. Previously `files` was `["dist"]`, so an npm install had no `base`/`report`/`examples` templates and `druck templates`/`render` found nothing to work with. `templates/` is now published alongside `dist/`, so rendering works from a plain `npm install -g @druckform/core` and not only from the Docker image.
