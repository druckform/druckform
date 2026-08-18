---
template: consulting
title: E2E Consulting Assessment
---

:::exec-summary
Two findings, one high severity.
:::

::findings-summary

::pagebreak

:::finding{severity="high" id="F_01" title="Secrets recoverable from CI logs"}
:::impact
Credentials are recoverable by anyone with read access.
:::
:::evidence
- `deploy.yml` echoes the token
:::
:::recommendation
Mask the variable and rotate the token.
:::
:::

:::finding{severity="medium" id="F-02" title="No dependency pinning"}
:::evidence
Floating version ranges in the manifest.
:::
:::

Remediation for :ref[F_01]{kind=finding} is tracked separately.

::appendix

# Methodology

Interviews and a review of the deployment pipeline.
