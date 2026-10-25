# Issue444 — Grok account-reference projection compatibility

Plan0456 / ticket444; frozen source base
`e1bb4dbc94c5d50dc4f210dbd783cbfb2bbd3b5a`.

The shared `projectGrokAccountReference` owns identifier precedence
(id, accountId, email, handle), surrounding-whitespace normalization, identifier
kind tags and SHA-256 projection. It accepts verified identity observations; it
cannot establish account authority. Existing account preflight and operation
custody checks remain at each service boundary.

Compatibility is deliberate and has no implicit default: Bots/Build select
`legacy-untagged`; Files/Connectors/installation select `typed-v1`. Case and handle
spelling are preserved. Existing legacy collisions between identifier kinds are
preserved rather than claiming a new separation/interchange contract. Typed
references retain identifier-kind separation. No persisted journal version,
operation ID, CLI/API/MCP response schema or diagnostic identifier is migrated.

## Public seams and proof

`tests/browser/grok444AccountReferences.test.ts` exercises real Bots list, Build
discover, Files context, Connectors list and connector-installation reconcile.
Controlled CDP executes actual identity detection and configured session authority;
it does not replace preflight with an account-reference stub. Literal pre-repair
reference examples protect precedence, normalization, stable identity across
label changes, both compatibility families, and typed identifier-kind separation.
Unverified account controls reject at all four discovery services. A seeded
version-1 journal with a literal existing operation ID survives reconciliation
and service restart without another installation; another identity cannot adopt
that saved intent. Shared output checks exclude raw account ID/email.

These seams prove source compatibility, not provider discovery completeness,
installed/browser acceptance or a cross-surface reference interchange contract.
The accountId fallback remains centrally owned for the existing identity type;
current Grok browser identity detection exposes id/email/handle, so these public
browser fixtures do not claim accountId-only provider observation.

## Validation receipt

All commands run in the isolated issue444 worktree. The repository test setup
(`tests/setup-env.ts`) sets each worker's `AURACALL_HOME_DIR` to a disposable
`/tmp/auracall-vitest-*` directory and removes it after the tests. The shell
commands also supplied `AURACALL_HOME=/tmp/auracall444.*`; that variable is not
read by AuraCall and is not the isolation mechanism. Writable installation
journals are separately created under temporary directories and removed after
each test.
No live provider/browser, native probe or installation was performed.

- Initial characterization: `pnpm vitest run tests/browser/grok444AccountReferences.test.ts --maxWorkers=1` — 8/8 pass on original projections.
- Controlled regression red, same command: changing Bots from the legacy hash to
  an accidental kind-tagged hash produces 2 failures / 6 passes. This is fault
  injection proving compatibility sensitivity, not a claim of a preexisting
  functional failure. The original issue is duplicated ownership.
- Green after central ownership: same command — 8/8 pass, then persisted-journal
  coverage — 9/9 pass.
- Final affected lane: `pnpm vitest run tests/browser/grok444AccountReferences.test.ts tests/browser/grok403Files.test.ts tests/browser/grok404ConnectorsService.test.ts tests/browser/grok405InstallationService.test.ts tests/browser/grok407Bots.test.ts tests/browser/grok410Build.test.ts tests/http.grokFilesBots.test.ts tests/http.grokBuild.test.ts --maxWorkers=2` — 8 files, 71 tests pass, 19.12 seconds. Includes the final 13 new tests.
- `pnpm typecheck` — pass; `pnpm check` — pass on the final committed implementation (the repository `check` script aliases typecheck).
- `pnpm exec biome lint src/browser/grokAccountReference.ts src/browser/grokBotsService.ts src/browser/grokBuildService.ts src/browser/grokFilesService.ts src/browser/grokConnectorsService.ts src/browser/grokConnectorInstallationService.ts tests/browser/grok444AccountReferences.test.ts` — 7 files, zero warnings/errors.
- `git diff --check` — pass.

Memory disposition: `forbidden` — this execution expressly prohibits memory
writes. This note is implementation evidence, not a Graphiti write receipt.
Issue closure, integration and post-closure review remain with the primary lane.
