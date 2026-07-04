# #12081 / #8756 Launch-Hardening Status

Generated: 2026-07-04T10:18:38.202Z

This is a read-only collector. It does not deploy, approve environments, SSH to
hosts, or print secret values.

## Verdict

| Check | Status |
| Required production environment secrets exist | yes |
| Latest build-agent-image run for develop is green | no |
| Latest provisioning-worker deploy for develop is green | no |
| Fresh-agent cloud provisioning probe passed | no / not run |
| Issue closeable from this evidence alone | no |

## Develop Head

- Branch: `develop`
- SHA: `da8b55c8a376ed94589d77419ff0179000803d77`

## Environment Secrets (production)

| Secret | Present | Updated At |
| SANDBOX_REGISTRY_REDIS_URL | yes | 2026-06-23T17:01:28Z |
| ELIZA_PROVISIONING_HOST | yes | 2026-06-11T20:58:52Z |
| ELIZA_PROVISIONING_SSH_KEY | yes | 2026-06-11T22:45:29Z |

## Cloud Auth Secret

| Secret | Present | Updated At | Source |
| ELIZACLOUD_API_KEY | yes | 2026-04-05T07:46:17Z | github-repo-secret-list |

## Workflows

| Workflow | Run | Status | Conclusion | Head SHA | Updated |
| Build Agent Image | https://github.com/elizaOS/eliza/actions/runs/28700073925 | pending |  | 08e54a13820eb3255ba733c7340b62fa7b1608ba | 2026-07-04T08:09:02Z |
| Deploy Eliza Provisioning Worker | https://github.com/elizaOS/eliza/actions/runs/28700073935 | pending |  | 08e54a13820eb3255ba733c7340b62fa7b1608ba | 2026-07-04T08:09:02Z |

## Image

- Image: `ghcr.io/elizaos/eliza:develop`
- Digest: `sha256:54ce3645bcd3d5e23a2b06466691888a5bd656985e699984dbe3eb860b2c1a06`
- Inspect succeeded: yes

## Local Regression Check

- `provisioning-worker-env-reconcile.test.ts`: passed

## Fresh-Agent Probe

- Attempted: yes
- Passed: no
- Report path: `/tmp/8756-status-20260704T1019Z/cloud-provisioning.json`

## Remaining

This evidence can close the #12081 operator lane only when all verdict rows are
green. If the workflow rows are still pending, cancelled, or missing, the live
operator lane has not been proven complete. If the fresh-agent probe is not run,
persistence, lean-plugin loading, and runtime reachability remain unverified.
