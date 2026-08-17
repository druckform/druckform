---
"@druckform/core": patch
---

Mermaid diagrams now render in the Docker image. `mermaid-cli` (`mmdc`) was never installed in the image, so every document containing a ```` ```mermaid ```` fence failed — and because the CLI inside the container re-ran engine detection in `auto` mode, the missing tool surfaced as `druck: 'docker' not found` and exit 127 rather than naming Mermaid. Three fixes:

- The image installs `@mermaid-js/mermaid-cli` (pinned), reusing the Chromium already present instead of downloading its own.
- The Docker relay pins `DRUCK_ENGINE=local` inside the container, so a tool missing from the image reports that tool instead of attempting a second, impossible relay.
- Mermaid renders pass Puppeteer `--no-sandbox --disable-dev-shm-usage`, which headless Chromium requires when running as root in a container.
