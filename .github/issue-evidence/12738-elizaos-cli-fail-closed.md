# Evidence - #12738 (packages/elizaos CLI fast-fail slice)

Scope of this slice: the `.elizaos/template.json` J1 command boundary consumed by
`elizaos upgrade`. Before this change, `readProjectMetadata` did a bare
`JSON.parse` and no shape validation, so a corrupt ledger surfaced as an
unhandled `SyntaxError` stack trace, and a syntactically-valid-but-malformed
ledger (e.g. `{}`) was accepted as fabricated metadata and let `upgrade`
proceed past corrupt required input (crashing later mid-render).

## Inventory (this slice)

| path | line | pattern | verdict |
|------|------|---------|---------|
| src/project-metadata.ts | readProjectMetadata | bare `JSON.parse`, no shape guard | REMOVE SLOP → typed `ProjectMetadataError`, fail closed |
| src/commands/upgrade.ts | upgrade() read site | uncaught throw → ugly stack | REMOVE SLOP → catch typed error, `clack.cancel` + exit 1 |
| src/scaffold.ts | isShallowGitRepo catch | `catch { return false }` | KEEP → `// error-policy:J4` optional reference-repo probe |

Other catches in this package audited and left as-is (documented file-presence
probes in `migrate/ocplatform-reader.ts` where "not present" is a valid no-data
state; `package-info.ts` reads of the always-shipped package.json throw
naturally). Those are not fabricated defaults on required paths.

## Real end-to-end CLI transcript (built dist/cli.js)

    ########## CASE 1: corrupt (unparseable) template.json ##########
    fixture: { this is not valid json
    $ node dist/cli.js upgrade
    └  Corrupt project metadata at .../.elizaos/template.json: invalid JSON
       (Expected property name or '}' in JSON at position 2 ...).
       Fix or remove the file and re-run, or re-create the project.
    EXIT CODE: 1

    ########## CASE 2: valid JSON, wrong shape (empty object) ##########
    fixture: {}
    $ node dist/cli.js upgrade
    └  Corrupt project metadata at .../.elizaos/template.json:
       missing or invalid 'templateId'. Fix or remove the file and re-run...
    EXIT CODE: 1

    ########## CASE 3: no metadata at all (valid no-op) ##########
    $ node dist/cli.js upgrade
    └  No .elizaos/template.json metadata found in the current directory.
    EXIT CODE: 1  (unchanged pre-existing behavior)

Case 1 previously emitted a raw `SyntaxError` stack trace; Case 2 previously
proceeded on fabricated metadata and failed later. Both now fail closed with a
clear message and non-zero exit at the boundary.

## Unit tests

`src/project-metadata.test.ts` - 9 tests, real temp `.elizaos/template.json`
fixtures (missing → null, valid round-trip, unparseable, bare string, array,
empty object, non-string values, missing managedFiles, non-string hashes).

    $ bun run test src/project-metadata.test.ts
    ✓ src/project-metadata.test.ts (9 tests) 15ms
    Test Files  1 passed (1)
    Tests  9 passed (9)

## Full-suite / typecheck

    $ bun run test
    Test Files  1 failed | 9 passed (10)   Tests  65 passed (65)
    # the 1 "failed" file is src/migrate/migrate.test.ts - PRE-EXISTING on
    # origin/develop: it imports the optional cross-package dev dep
    # `@elizaos/agent/services/agent-export`, absent from this lane's
    # node_modules. Untouched by this change (no migrate files edited).

    $ bun run typecheck   # tsgo --noEmit
    EXIT: 0

N/A: model trajectory / screenshots - this slice is a CLI metadata boundary with
no model interaction or UI surface.
