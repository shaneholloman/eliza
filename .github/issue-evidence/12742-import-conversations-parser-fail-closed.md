# #12742 fallback-slop: import-conversations parser fail-closed evidence

Part of #12275-E (browser/homepage/native package sweep, split of #12182).
Slice: `packages/import-conversations` parsers. The rest of #12275-E's package
list (`packages/browser-extension`, `packages/contracts`, `packages/homepage`,
`packages/os`, `packages/native`) was audited and its remaining handlers are
already legitimate/correct (see inventory below); this PR removes the concrete
fallback slop found in the conversation-export parsers.

## The slop

The three export parsers (`chatgpt`, `claude`, `hermes`) each wrapped their
`detect()` probe — and hermes wrapped `parse()`'s directory reads — in a blanket
`catch { return false }` / `catch { entries = [] }`. That conflated two very
different conditions:

1. **"input is not this format"** — the honest answer to `detect()`, e.g. the
   path resolves to nothing recognizable. This *should* return `false`.
2. **"input IS this format but the required payload is corrupt/unreadable"** —
   a resolved `conversations.json` whose body is truncated JSON, or an existing
   `sessions/` dir that fails to read (EACCES/EIO/ENOTDIR). This is a real
   failure on required input and was being **swallowed as `false`**, so an
   import of a genuinely-corrupt export reported "no parser recognized this
   export" instead of surfacing the corruption.

## Per-site inventory

| path | line (pre) | pattern | verdict |
|---|---|---|---|
| parsers/claude.ts | `resolveInput` stat `catch { return undefined }` | swallow-all | **fix**: ENOENT → undefined (not an export), else throw |
| parsers/claude.ts | `detect` `catch { return false }` | swallow-all | **fix**: removed; corrupt resolved payload now throws |
| parsers/chatgpt.ts | `resolveInput` outer stat `catch { return undefined }` | swallow-all | **fix**: ENOENT → undefined, else throw |
| parsers/chatgpt.ts | `resolveInput` inner file-stat `catch { return undefined }` | swallow-all | **fix**: ENOENT → undefined, else throw |
| parsers/chatgpt.ts | `detect` `catch { return false }` | swallow-all | **fix**: removed; corrupt resolved payload now throws |
| parsers/hermes.ts | `detect` stat `catch { return false }` | swallow-all | **fix**: ENOENT → false, else throw |
| parsers/hermes.ts | `detect` readdir `catch { return false }` | swallow-all (dir already existsSync'd) | **fix**: removed; readdir failure now surfaces |
| parsers/hermes.ts | `detect` signature-peek `catch { return false }` | untrusted line parse | **keep J3** (annotated): non-JSON signature line = not recognizable |
| parsers/hermes.ts | `parse` sessions readdir `catch { entries = [] }` | swallow-all → empty | **fix**: removed; failure surfaces instead of importing zero sessions |
| parsers/hermes.ts | `parse` memories readdir `catch { entries = [] }` | swallow-all → empty | **fix**: removed; failure surfaces instead of dropping notes |
| parsers/hermes.ts | `parseSessionFile` per-line `JSON.parse` catch | truncated JSONL tail | **keep J3** (annotated): skip corrupt line on still-appending log |
| parsers/hermes.ts | `parseMemoryFile` readFile `catch { return undefined }` | swallow-all | **fix**: ENOENT (benign readdir/read race) → skip, else throw |

Kept handlers each carry a grep-able `// error-policy:J3 <reason>` annotation.

### Audited-and-already-correct (no change) in the rest of #12275-E

- `packages/browser-extension`: `throwApiError` catch still throws
  `RelayApiError` (J1 boundary; body-parse failure only degrades the message);
  `isReachableAgentApiBaseUrl`'s catch is an honest reachability probe (failure
  = not reachable); URL-normalizer catches return `null` as a J3 "invalid input"
  validator signal. No masking.
- `packages/contracts`: no error-handling catches (only a `catchphrase` field).
- `packages/import-conversations` core (`pipeline`, `manifest`, `render`,
  `redact`, `sink`, `document-service`, `zip-entry`, `json-array-stream`):
  already fail-closed — they throw on missing sink / malformed JSON / malformed
  zip; no default-return-from-catch slop.

## Verification

```bash
bun run --cwd packages/import-conversations test
```
Result: 10 files / 113 tests passed (5 new fail-closed tests added: claude +2,
chatgpt +1, hermes +4 net; corrupt-payload throws + I/O-failure surfaces + still
returns false on genuinely-absent input).

```bash
bun run --cwd packages/import-conversations typecheck
```
Result: passed (`useUnknownInCatchVariables` on; `isNotFound(error: unknown)`
narrows correctly).

```bash
bunx @biomejs/biome check src/parsers/*.ts
```
Result: clean.

N/A rows: no rendered UI/native/device behavior changed in this slice, so no
screenshots/recordings — `N/A - parser library, no UI surface`.
