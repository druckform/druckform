# GitHub Actions — Release setup

## npm publishing — OIDC trusted publishing (no token)

`release.yml` publishes to npm via **OIDC trusted publishing** — there is **no `NPM_TOKEN` secret**. Auth is derived from the workflow's OIDC identity, so the only requirements are:

1. `release.yml` grants `id-token: write` (already set).
2. The runner upgrades npm to ≥ 11.5.1 before publishing (the `Upgrade npm for OIDC trusted publishing` step). `changeset publish` runs `pnpm publish`, which delegates to the system npm CLI, so the upgraded npm does the OIDC exchange.
3. **Each package has a Trusted Publisher configured on npmjs.com.** Do this once per package:
   - npmjs.com → **@druckform/core** → Settings → **Trusted Publisher** → **GitHub Actions**
     - Organization or user: `druckform`
     - Repository: `druckform`
     - Workflow filename: `release.yml` (filename only — not the full path)
     - Environment: *(leave blank)*
   - Repeat for **@druckform/mcp**.
4. `package.json` `repository.url` must match the publishing repo (`github.com/druckform/druckform`) — it does. The GitHub OIDC token, the npm trusted-publisher config, and `repository.url` must all agree, or npm returns a misleading `E404`.

Provenance attestations are generated automatically under OIDC (no `--provenance` flag needed).

> **First publish was bootstrapped manually** (`npm login` + `npm publish`) because a trusted publisher can only be configured for a package that already exists. OIDC handles every release from now on.

## Other secrets

| Secret | Used by | Notes |
|---|---|---|
| `TURBO_TOKEN` | ci.yml, release.yml | Turborepo remote cache — [turbo.build](https://turbo.build/repo/docs/core-concepts/remote-caching); leave unset to skip caching |
| `TURBO_TEAM` | ci.yml, release.yml | Turborepo team slug (omit if unused) |

`GITHUB_TOKEN` is provided automatically for GHCR push + Changesets PR operations. It needs **read/write** workflow permissions: repo (or org) → Settings → Actions → General → Workflow permissions → "Read and write permissions".

## pnpm version

Pinned to **9.13.2** in `package.json` (`packageManager`), `Dockerfile`, `ci.yml`, and `release.yml`. **Do not use 9.14.x** — it broke `pnpm publish` arg-forwarding to npm (pnpm#8788), which surfaced as `EINVALIDTAGNAME` during `changeset publish`.

## GHCR visibility

The image `ghcr.io/druckform/druckform` is created **private** on its first push. After the first release run, make it public and link it to the repo:

GitHub → org **druckform** → Packages → **druckform** → Package settings →
- **Change visibility → Public** (so `docker run ghcr.io/druckform/druckform:latest` works for plugin users)
- **Manage Actions access** → add repo `druckform/druckform` with **Write**
