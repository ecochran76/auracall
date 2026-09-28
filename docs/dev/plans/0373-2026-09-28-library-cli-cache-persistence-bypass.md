# ChatGPT Library CLI Cache Persistence Bypass | 0373-2026-09-28

State: CLOSED
Lane: P73
Work item: #107
Source base: `origin/main` at `fe6375955848afabacd9ef554dc943529866bcd1`
Branch: `fix/issue-107-library-cache-bypass`

## Objective

Return the exact one-shot `library-files` CLI provider inventory without
waiting for account-file cache identity resolution or persistence, while
preserving cache behavior for Account Mirror and every general list caller.

## Current State

- Installed diagnostics on canonical `fe6375955` entered `dom-inventory` at
  `12:53:15.143` and `service-cache-context` at `12:53:15.166`, proving the
  provider DOM inventory succeeded in about 23 milliseconds.
- The CLI did not request abort until `12:54:05.757`; only then did execution
  enter `service-cache-write`, and affinity settled at `12:54:06.377`.
- `LlmService.refreshAccountFilesCache` unconditionally resolves cache context
  and writes returned provider files, so a local cache hook can mask a complete
  read-only CLI result.

## Scope

- Add an exact `skipAccountFileCachePersistence` list option.
- Pass it only from the one-shot `library-files` CLI alongside the existing
  no-retry option.
- Return normalized provider files before cache context resolution and cache
  write only when the option is explicitly true.
- Add provider-free regression coverage for immediate provider result return
  with pending cache hooks and unchanged default persistence.
- Update operator, testing, journal, fixes, roadmap, runbook, and lane records.

## Non-goals

- Widening or adding a deadline around cache context or persistence.
- Changing Account Mirror, scheduler, materialization, upload/delete refresh,
  or general `listAccountFiles` cache semantics.
- Changing exact-target adoption, retry, navigation, refresh, target creation,
  disposal, or lease settlement behavior.
- Installed or live browser/provider testing, prompt submission, or Send.

## Acceptance Criteria

- [x] The CLI exact option reaches production account-file list wiring.
- [x] Provider files return without calling cache context or cache write when
      the skip option is true, even when either hook would remain pending.
- [x] Default/general account-file listing still resolves and writes cache.
- [x] Focused provider-free tests, typecheck, scoped lint, P73 planning wiring,
      lane YAML, and diff hygiene pass. The active-only planning audit retains
      two unrelated Plan 0362 findings and seven accepted baseline findings.

## Closure Checkpoint | Provider-Free Accepted

- `checkpoint_id`: `P0373-C01`
- `state_transition`: ISSUE_107_CACHE_CONTEXT_MASKED_RESULT ->
  P0373_CLOSED_PROVIDER_FREE_ACCEPTED
- `progress_classification`: blocker_removal
- `acceptance_state`: exact CLI cache-persistence bypass implemented;
  installed acceptance withheld
- `evidence`: installed P72 timestamps supplied by the operator,
  red-before-green pending-hook fixture, unchanged default persistence fixture,
  focused Library lifecycle suite, typecheck, scoped lint, P73-clean planning
  audit, lane YAML validation, and diff hygiene
- `material_blockers`: separately authorized correct-install acceptance remains
  outside this source-only slice
- `next_action_or_stop_reason`: commit locally and stop before installation,
  browser access, provider work, push, merge, or rebase

## Installed Acceptance Readback

- Commit `9cebdc9c308638ceef9aab3a43c3b6f753fdacba` was installed once with
  `pnpm run install:user-runtime`; the installed bundle contained the CLI-only
  skip option and the pre-cache early return.
- One read-only `auracall --profile wsl-chrome-3 library-files --json` ran. It
  terminated in 2.37 seconds instead of reproducing the cache-persistence hang,
  but returned exit 1 with `complete: false` and zero usable files.
- The privacy-reduced acceptance projection did not retain
  `incompleteReason`; no second provider run was made. This accepts the bounded
  cache-hang correction only. Full issue 107 acceptance remains unresolved;
  live GitHub readback currently reports the issue closed.

## Definition Of Done

The one-shot CLI returns its already-complete provider inventory before local
account cache work, while every caller that does not opt out retains the
existing cache contract.
