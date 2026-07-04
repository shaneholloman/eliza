# Issue #12883 — per-node SSH pinning and hosted-agent egress default-deny

## Scope

- Replaced Docker SSH trust-on-first-use behavior with fail-closed host-key pinning.
- Required docker-node bootstrap/admin registration to carry a `hostKeyFingerprint`.
- Added cloud-init host-key fingerprint capture to the node self-registration payload.
- Moved non-Headscale hosted-agent Docker containers to a separate `--internal` bridge network (`<base>-agent-deny`).
- Added an operator-generated Kubernetes `NetworkPolicy` with `policyTypes: ["Egress"]` and `egress: []` for operator-managed agent pods.

## Command / run-spec evidence

- Non-Headscale Docker agent run-spec test asserts:
  - `--network 'containers-isolated-agent-deny'`
  - `docker network create --driver bridge --internal 'containers-isolated-agent-deny'`
- Headscale Docker agent run-spec test asserts:
  - `--network 'containers-isolated'`
  - no `--internal`, preserving VPN bootstrap reachability.
- Operator pod spec test asserts:
  - `apiVersion: networking.k8s.io/v1`
  - `kind: NetworkPolicy`
  - `podSelector.matchLabels["eliza.ai/server"]`
  - `policyTypes: ["Egress"]`
  - `egress: []`
- Bootstrap callback tests assert:
  - missing host-key fingerprint rejects before DB update
  - wrong fingerprint rejects node identity mutation
  - matching fingerprint permits liveness/identity update
  - existing autoscaler placeholder can set its first fingerprint only when hostname/user/port are unchanged
  - brand-new node creation stores the provided fingerprint
- Node bootstrap test asserts:
  - `ssh-keygen -l -E sha256 -f /etc/ssh/ssh_host_ed25519_key.pub`
  - RSA fallback
  - fail-closed `exit 1` when no host-key fingerprint can be read

## Verification

- `bun test packages/cloud/shared/src/lib/services/__tests__/agent-container-security.test.ts packages/cloud/shared/src/lib/services/containers/node-bootstrap.test.ts packages/cloud/api/__tests__/bootstrap-callback-node-identity.test.ts packages/cloud/services/operator/capabilities/__tests__/generators-network-policy.test.ts`
  - Pass: 26 tests, 0 failures.
- `bun test --cwd packages/cloud/services/operator`
  - Pass: 7 tests, 0 failures.
- `bunx biome check <11 touched files>`
  - Pass.
- `bun run --cwd packages/cloud/shared lint`
  - Pass.
- `bun run --cwd packages/cloud/api lint`
  - Pass.
- `bun run --cwd packages/cloud/services/operator lint`
  - Pass.
- `bun run --cwd packages/cloud/services/operator typecheck`
  - Pass.
- `bun run --cwd packages/cloud/shared typecheck`
  - Blocked by existing transitive baseline errors in `packages/app-core/src/services/account-pool.ts`, `packages/app-core/src/services/coding-account-bridge.ts`, and `packages/shared/src/i18n/keyword-matching.ts`; no touched-file errors were reported.
- `bun run --cwd packages/cloud/api typecheck`
  - Same existing transitive baseline errors as shared typecheck; no touched-file errors were reported.
- `docker version --format '{{.Server.Version}}'`
  - Blocked: Docker daemon unavailable at `unix:///Users/shawwalters/.docker/run/docker.sock`.
- `git diff --check`
  - Pass.
- `bun run verify`
  - Attempted. Pre-turbo audits passed (`check:agents-claude`, type-safety ratchet, error-policy ratchet).
  - Failed in unrelated `@elizaos/plugin-calendar#typecheck` with existing missing workspace/module errors under `packages/agent`, `packages/shared`, `packages/ui`, and `plugins/plugin-calendar`.
  - Write-mode lint side effects from the verify attempt were restored before staging.

## Evidence rows

- UI evidence: N/A - hosted-agent security hardening, no UI path.
- Model trajectory: N/A - no model-backed path changed.
- Audio evidence: N/A - no voice/transcript/TTS/STT path changed.
- Real Docker container execution: blocked by local Docker daemon unavailability; command/run-spec inspections above cover the changed Docker command boundary.
