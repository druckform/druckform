# GitHub Actions — Required Secrets

| Secret | Used by | How to obtain |
|---|---|---|
| `TURBO_TOKEN` | ci.yml, release.yml | Turborepo remote cache — create at [turbo.build](https://turbo.build/repo/docs/core-concepts/remote-caching) or leave unset to skip caching |
| `TURBO_TEAM` | ci.yml, release.yml | Your Turborepo team slug (omit if using personal token) |
| `NODE_AUTH_TOKEN` | release.yml | npm access token with `publish` scope — create at npmjs.com → Access Tokens |

`GITHUB_TOKEN` is provided automatically by GitHub Actions for GHCR access and Changesets PR operations — no manual setup needed.

## Pre-publish checklist

Before the first release, verify the npm package names are available:

```bash
npm view druckform     # want 404
npm view druckform-mcp # want 404
```

## GHCR visibility

After the first push, set the `druckform` GHCR package to public via:
GitHub → Profile → Packages → druckform → Package Settings → Change visibility → Public
