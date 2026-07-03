# #11760 — on-device inference memory policy: evidence

Policy implemented: **RAM-class caps + idle unload + pressure release** of the
resident inference state (no process isolation — rationale in the PR body).

Verification device: **arm64 emulator AVD (emulator-5554), Android 15 / API 35,
MemTotal 8129212 kB ≈ 7.75 GiB usable → RAM class `standard` by measurement.**
The 5.7 GB-class (Pixel 6a) profile is forced for the soak via the policy's
debug-prop override surface:

```
adb shell setprop debug.eliza.inference.ram_class constrained
adb shell setprop debug.eliza.inference.idle_unload_ms 120000   # 2 min, observable
```

This is honestly NOT a 5.7 GB device: lmkd's kill line sits higher here than on
the Pixel 6a, so the emulator soak proves the policy *fires and reclaims* under
real ambient pressure with the constrained profile active; the device-exact
10-minute soak on Pixel 6a hardware is the hardware-lab row (#11734).

## Files

| file | what |
| --- | --- |
| `exit-info-before-install.txt` | `dumpsys activity exit-info` before installing this build (shared-emulator churn visible: PACKAGE_UPDATED entries from sibling sessions) |
| `exit-info-after-soak.txt` | same dump after the soak — the acceptance row: no `reason=3 (LOW_MEMORY)` kill of `ai.elizaos.app` during the soak window |
| `policy-decision-logs.txt` | logcat + agent-log lines showing the RAM-class decision, the exported env, and each release (idle / pressure) with reasons |
| `meminfo-timeline.tsv` | `dumpsys meminfo ai.elizaos.app` (TOTAL PSS/RSS) + bun agent process RSS sampled through load → chat → idle-unload → reload → pressure-release |
| `soak-driver.log` | full transcript of the soak driver (chat turns via `/v1/chat/completions`, ballast mount, timings) |

## Soak protocol

1. Install the current-tree debug APK (web bundle + agent bundle baked from this branch).
2. Force the constrained profile via debug props (above), launch, wait for `/api/health`.
3. Chat turn → model loads (RSS climbs by the weights + ctx footprint).
4. Idle ≥ 2 min → **idle unload** log + RSS drop (policy lever a).
5. Chat turn again → model reloads on demand, reply returned (lossless recovery).
6. Mount a tmpfs ballast and fill until `MemAvailable` < 12 % of MemTotal →
   **pressure release** log + RSS drop while the app stays foreground (lever c).
7. ≥ 10 min total under this ambient pressure; final `exit-info` shows no
   LOW_MEMORY kill of the app during the window.
