# Issue #11691 — container metadata egress guard

## Summary

Hardened newly bootstrapped Hetzner container nodes against tenant-container reads
of cloud-init user-data through the cloud metadata endpoint.

Changes made:

- Added a boot-persistent `eliza-container-egress-guard.service` to
  `buildContainerNodeUserData()` that installs a `DOCKER-USER` iptables drop for
  `169.254.169.254/32`.
- Apply the guard immediately after Docker starts and before the shared tenant
  bridge network, registry login/logout, or pre-pull work runs.
- Stopped treating broad GitHub tokens (`GITHUB_TOKEN`, `GH_TOKEN`, `CR_PAT`) as
  container-node pull credentials. Nodes now use the dedicated registry pull env
  vars only: `CONTAINERS_REGISTRY_TOKEN`, `ELIZA_APP_IMAGE_REGISTRY_TOKEN`, or
  `GHCR_TOKEN`.

## Validation

### Targeted tests

Command:

```bash
bun test packages/cloud/shared/src/lib/services/containers/node-bootstrap.test.ts packages/cloud/shared/src/lib/services/containers/hetzner-client/registry.test.ts
```

Result:

- Pass: 15
- Fail: 0
- Expect calls: 30

Covered assertions:

- User-data includes the metadata endpoint drop in `DOCKER-USER`.
- Guard service is enabled before tenant network creation.
- No registry token configured still performs stale-credential `docker logout`.
- Dedicated registry token still performs `docker login`.
- Broad `GITHUB_TOKEN` is not embedded in user-data and does not trigger login.

### Typecheck

Command:

```bash
bun run --cwd packages/cloud/shared typecheck
```

Result: pass (`tsgo --noEmit`).

### Lint

Command:

```bash
bun run --cwd packages/cloud/shared lint
```

Result: pass (`biome check .`, 1312 files checked).

### Root verify

Commands:

```bash
git fetch origin && git rebase origin/develop
bun install
bun run verify
```

Result: fail after build/typecheck on an unrelated `audit:test-realness`
baseline issue:

- `test-realness-audit` reported `todoTest must stay at 0, found 1`.
- The failure points at an existing `test.todo` under the vendored opencode tree,
  outside this change's cloud bootstrap path:
  `plugins/plugin-agent-orchestrator/vendor/opencode/packages/opencode/test/session/instruction.test.ts`.
- Before that failure, the root build/typecheck lane completed: 483 successful
  Turbo tasks, followed by passing build/typecheck dependency audits,
  `audit-tee-secret-leak`, and `audit-scripts`.

During the first root verify run, `audit:type-safety-ratchet` failed because the
repo baseline had drifted to 79 `as unknown as` casts against a budget of 75.
The warmup eviction e2e fixture now removes four unsafe casts and supplies the
current `ShellController` shape directly. A focused rerun of
`bun run audit:type-safety-ratchet` passed at the required baseline:
`as unknown as: 75 / 75`.

### Package test sweep

Command:

```bash
bun run --cwd packages/cloud/shared test
```

Result: fail with unrelated existing package-suite drift:

- Pass: 2496
- Skip: 52
- Fail: 13
- Expect calls: 6818

Failures were outside the touched files:

- `0164_pooled_credentials migration up (#11332) > is registered in the drizzle journal`
- `AppFrontendHosting — DB invariants + GC + failure cleanup (#10690 review) > pglite applied`
- `container billing gate + row-lock guard` (2 failures, missing `settled_at` in PGlite schema)
- `updateCampaign` advertising reconciliation fixture failures (7 failures; ad account inactive fixture)
- `reconcile() — settle reserved vs actual` (2 failures; missing settlement column/query path)

The touched bootstrap tests passed during this full package run as well.

## Evidence Matrix

- Real cloud node: N/A - this change is a deterministic cloud-init generation
  hardening; no Hetzner node credentials were available in this environment.
- Backend logs: N/A - no API/runtime path changed; behavior is generated
  bootstrap script content.
- DB rows/migrations: N/A - no schema or repository behavior changed.
- UI screenshots/video: N/A - no UI change.
- Model trajectories: N/A - no model, prompt, action, or provider behavior changed.
