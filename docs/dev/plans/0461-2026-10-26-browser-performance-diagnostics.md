# Plan0461 — Opt-in browser performance diagnostics

State: CLOSED
Branch: feat/browser-performance-diagnostics
Target: main
Work item: Plan0461 (user-invoked TDD following issue464 retrospective)
Base: ad7b34d264290b0c8e11297a25c53c096214a90a

## Current State

Source implementation and acceptance are complete. Opt-in reporting uses existing app-list stages and owned Fetch/Network callbacks, with no extra protocol commands. Serialized work; no delegation. Existing issue464 remains closed. User-authorized deployment continuation is now accepted: PR479 merged, CLI activated and installed native reporting verified. API and MCP activation remain outside this CLI change.

## Scope and seams

Add `apps list --performance`, emitting a bounded sanitized aggregate report on stderr for the same command, including failures. Preserve terminal stdout, deadlines, admission, ownership and cleanup. Collect only the exact owned connection after attachment; report partial coverage. No provider calls, service upgrades or CI in this source slice.

1. Report collector public API: synthetic protocol timing/events prove request churn, route allowlisting, admission duration and stage totals; misses live transport wiring.
2. Real owned admission with a fake CDP boundary: prove request events/admission observations reach the report and listeners stop on disposal; misses provider behavior.
3. Actual CLI action with isolated dispatch: prove opt-in, stderr-only output and failure reporting; misses installed/live runtime identity.

Use one red→green slice at a time. Capture exact commands. Reuse existing tests/harness. No raw headers, bodies, URLs, account data or target IDs in output. Fixed route categories and bounded pending request tracking. Admission duration includes local governor overhead and is not pure quota waiting. Observation starts after connection attachment and cannot prove complete startup traffic.

## Acceptance and closeout

Targeted checks, typecheck, scoped lint and source build pass; Standards/Spec review. Update README/testing/context/journal/fixes. Commit and publish source checkpoint under repo policy; integration/deployment separately qualified. Keep original cwd and unrelated Grok worktrees intact.


## TDD evidence

- Collector: `pnpm vitest run tests/browser/browserPerformanceDiagnostics.test.ts --maxWorkers=1`.
  Initial import absence was setup-only; executable scaffold then failed the actual
  155-request/timing assertion (empty report, 12ms). Implementation passed it.
  Bounded/early-failure case subsequently failed on absent observed-connection
  coverage, then passed after adding explicit attachment accounting.
- Owned path: `pnpm vitest run tests/browser/backendRequestAdmission.test.ts -t 'owned native-style backend burst' --maxWorkers=1`.
  Red: actual command path continued 13 requests but report counted zero requests
  and admissions. Green: report counts 13 admissions, 12 response headers and one
  failed-before-response outcome; existing transport cleanup remains proven.
- CLI: `pnpm vitest run tests/cli/developerAppWaitingDiagnostics.test.ts --maxWorkers=1`.
  Red: both opt-in cases lacked the stderr report; both disabled controls passed.
  Green: all four combinations pass, including terminal-only failure JSON and
  timer disposal.

## Source acceptance

161 tests across six files passed:
`pnpm vitest run tests/browser/browserPerformanceDiagnostics.test.ts tests/browser/backendRequestAdmission.test.ts tests/cli/developerAppWaitingDiagnostics.test.ts tests/cli/developerAppFailureDiagnostics.test.ts tests/cli/developerAppTerminalExit.test.ts tests/cli/chatgptDeveloperAppsCommand.test.ts --maxWorkers=1`.
An earlier selection had one five-second Grok bootstrap timeout; both affected
Grok variants passed in isolation and the complete selection passed on rerun.
No timeout or admission budget was changed.

After extending existing known-denial/unknown-effect tests to collect diagnostics,
all four affected admission cases passed with:
`pnpm vitest run tests/browser/backendRequestAdmission.test.ts -t 'owned backend denial releases|owned native-style backend burst' --maxWorkers=1`.
These overlap the 161-case selection; do not add their counts.

Final typecheck, full source build, scoped Biome lint, docs:list and diff checks
pass. Compiled app-list help advertises the new flag. This is source/build proof;
no installed runtime activation or live provider measurement is claimed. CI was
excluded as instructed.

## Primary review

Fixed source base: ad7b34d264290b0c8e11297a25c53c096214a90a.
Standards: repository conventions, privacy/durability and smell baseline checked;
no remaining blocking finding. New helper is source-layer ChatGPT observation,
not a cross-provider browser-service API. Existing listener lifecycle is reused.
Spec: requirements met for opt-in stage/request/admission observation, bounded
allowlisted output, failure reports and unchanged stdout/control authority.
Known limitations are documented: setup before configuration, startup before
interception, worker/peer traffic, missing network correlation, overlapping
summed durations and unfinished admissions are not complete timing authority.
No code-review delegation was used. No service restart or provider probe occurred.

Source checkpoint: `1afa3fe44` (validated source/build; draft PR delivery).


## Deployment continuation — 2026-10-26

User explicitly requested merge and deployment after source review. PR479 merged
at `b2ecae89a641650877160a482d7aff461c871697`. Its source tree matches the validated
published checkpoint. Staged a separate runtime package; compiled bin, report
collector, owned admission, response observer and CLI operation modules match
validated build hashes. Installed help advertises `--performance`, then the
user CLI wrapper was atomically promoted. Version remains0.1.1; source/hash
receipts identify this build. Existing API/MCP runtimes were preserved.

One installed native `apps list --json --performance` completed normally in
26.601s with complete34-app inventory and exactly one terminal stdout JSON plus
one performance stderr report. The report observed two owned connections and43
backend interception observations:2installed,1linked,40other;2responses,41failures
before an observed response,0unresolved. Admission timing reports34attempts,
3admitted,31rejected,0pending. These are interception observations, not globally
unique provider requests or proof of dispatch; sums overlap and include local
work. Output retained no raw URL/header/body/account/target identifiers in the
performance report. Raw inventory stdout stays in private user state.

Fresh process/CDP readback retains the browser process generation, HTTP200 and
active API process. MCP wrapper bytes are unchanged and the owned CLI exited.
Private receipts: `~/.local/state/auracall-plan0461-20261026/activation.json`,
`installed-live-result.json`, `installed-performance-report.json` and
`deployment-readback.json`. No CI was run; no service/browser restart or
capacity/deadline change was used. Plan0461 is CLOSED with installed CLI acceptance.
