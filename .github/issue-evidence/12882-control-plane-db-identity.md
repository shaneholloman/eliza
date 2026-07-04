# Issue #12882 evidence: container control-plane forwarded DB identity

## Summary

- Added a fail-closed guard for `x-eliza-cloud-database-url` before the sidecar calls `runWithCloudBindingsAsync`.
- Forwarded DB identity is pinned to the sidecar's configured `DATABASE_URL` plus optional full-URL allowlist entries.
- The identity key includes scheme, credentials, host, port, exact database path, and canonical query params.
- Different database/user/port on the same host, query override params like `?host=evil`, duplicate query keys, malformed URLs, and missing trusted identity are rejected.

## Verification

- `bun test packages/cloud/shared/src/lib/services/containers/forwarded-database-url-guard.test.ts packages/cloud/shared/src/lib/config/containers-env-db-allowlist.test.ts`
  - Passed: 35 tests, 0 failed.
- `bunx biome check packages/cloud/services/container-control-plane/src/index.ts packages/cloud/shared/src/lib/config/containers-env.ts packages/cloud/shared/src/lib/config/containers-env-db-allowlist.test.ts packages/cloud/shared/src/lib/services/containers/forwarded-database-url-guard.ts packages/cloud/shared/src/lib/services/containers/forwarded-database-url-guard.test.ts packages/cloud/services/container-control-plane/CLAUDE.md packages/cloud/services/container-control-plane/AGENTS.md`
  - Passed.
- `bun run --cwd packages/cloud/services/container-control-plane typecheck`
  - Blocked by existing transitive workspace resolution errors outside the touched files, for example missing `@elizaos/auth/*`, `@elizaos/shared/contracts/service-routing`, and `@elizaos/plugin-sql` imports from `app-core` / `cloud-shared`.
- `bun run --cwd packages/cloud/shared typecheck 2>&1 | rg 'forwarded-database-url-guard|containers-env'`
  - No touched-file type errors were reported.

## Live sidecar route transcript

Started the real sidecar service via `Bun.serve`:

```bash
env HOST=127.0.0.1 PORT=39886 \
  CONTAINER_CONTROL_PLANE_TOKEN=token \
  DATABASE_URL='postgres://svc:pw@db.internal.example:5432/cloud' \
  bun run --cwd packages/cloud/services/container-control-plane start
```

Health route:

```text
GET /health

HTTP/1.1 200 OK
{"success":true,"service":"container-control-plane"}
```

Attack case: valid internal token but attacker-controlled same-host different database in `x-eliza-cloud-database-url`.

```text
GET /api/v1/cron/deployment-monitor
x-container-control-plane-token: token
x-eliza-cloud-database-url: postgres://svc:pw@db.internal.example:5432/exfil

HTTP/1.1 403 Forbidden
{"success":false,"error":"Forwarded database identity is not trusted"}
```

Structured backend log:

```text
[container-control-plane] rejected forwarded database URL (fail-closed) {
  reason: "forwarded database identity does not match the pinned control-plane database (or allowlist)",
}
```

Missing internal token is still rejected before the DB guard:

```text
GET /api/v1/cron/deployment-monitor
x-eliza-cloud-database-url: postgres://svc:pw@db.internal.example:5432/exfil

HTTP/1.1 403 Forbidden
{"success":false,"error":"Forbidden"}
```

## Container lane

N/A in this checkout: Docker Desktop daemon is not running.

```text
Cannot connect to the Docker daemon at unix:///Users/shawwalters/.docker/run/docker.sock. Is the docker daemon running?
```

This change affects sidecar request validation before container operations run; the live `Bun.serve` transcript above exercises the real route and guard without requiring a Docker node.

## DB / migration / UI / model / audio evidence

- DB state: N/A - the rejected attack path returns before `runWithCloudBindingsAsync`, node mirroring, or repository mutation.
- Migration up/down: N/A - no schema change.
- UI evidence: N/A - hosted-agent security hardening, no UI path.
- Model/audio evidence: N/A - no model or audio path.

