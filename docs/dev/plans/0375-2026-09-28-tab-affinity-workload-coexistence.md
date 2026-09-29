# Tab-Affinity Workload Coexistence | 0375-2026-09-28

State: OPEN
Lane: P75
Work item: ecochran76/auracall#123
Source base: `origin/main` at `fe6375955848afabacd9ef554dc943529866bcd1`
Branch: `fix/issue-123-tab-affinity-coexistence`
Target: `main`
Integration: merge
Blocks: ecochran76/auracall#121 installed acceptance

## Stable Objective

Restore the accepted ChatGPT tab-affinity contract so foreground conversation,
utility/history-materialization, and live-follow workloads can coexist on
distinct exact targets within one managed browser profile. Preserve genuine
profile-wide control exclusion, exact-target ownership, aggregate tenant
limits, provider-warning stops, identity checks, and uncertain-effect fences.

## Current State

- Plan 0359 / issue 46 is closed and previously proved two conversation tabs
  plus one dedicated live-follow crawler tab coexisting under one aggregate
  interaction ledger.
- During issue 121 installed acceptance, fresh foreground sessions were denied
  before provider work with `tab-leases-active` while unrelated exact-tab
  leases existed.
- The installed API status reported `serialized` while the shared affinity
  registry held active/idle leases for AuraCall runtime profile
  `wsl-chrome-3`. The effective-mode/config boundary therefore also requires
  reconciliation.
- Issue 121's connector implementation remains isolated on PR 122. This lane
  owns only the prerequisite browser-coordination repair.

## Ranked Hypotheses

1. Foreground provisioning fails to resolve/adopt the already-running managed
   browser endpoint and incorrectly enters profile-wide browser-startup
   control, which correctly rejects any fenced tab lease.
2. API, CLI, and background workers materialize different effective
   `tabConcurrencyMode` values for the same AuraCall runtime profile, causing
   incompatible coordination paths and misleading status.
3. An admission helper treats any fenced target as a profile-wide conflict
   instead of reserving a distinct target for ordinary exact-tab work.
4. Lease retirement timing alone explains the denial. This is lower-ranked
   because coexistence should not require unrelated settled leases to retire.

## Execution Units

### P75.1 | Deterministic reproduction and localization

- Owner: primary issue-123 session.
- Write surface: provider-free tests only until one red-capable regression is
  established.
- Required signal: existing managed endpoint + unrelated utility/materialized
  lease + new foreground conversation request reproduces
  `tab-leases-active` at the production seam.
- Terminal condition: the red fixture identifies whether endpoint resolution,
  configuration materialization, or generic reservation causes the denial.

### P75.2 | Minimal shared repair

- Owner: primary issue-123 session.
- Expected write surface: tab-affinity configuration/admission/provisioning
  modules and directly affected tests; no connector files.
- Preserve profile-control exclusion when the managed browser is absent or a
  genuine profile-wide operation is requested.
- Terminal condition: the P75.1 regression and adjacent coexistence suites pass
  without weakening target ownership, quotas, warnings, or effect-state rules.

### P75.3 | Installed coexistence acceptance

- Owner: primary issue-123 session; serialized live effects only.
- Install the exact validated commit and prove source/runtime byte parity.
- Run one bounded installed coexistence smoke using the existing configured
  background workload and one new exact foreground target. Do not pause
  schedulers, override leases, retry a terminal session, or click ChatGPT's
  `Answer now` control.
- Terminal condition: both workloads retain distinct targets, the foreground
  request reaches its expected terminal result, registry/ledger evidence is
  settled, and final service/browser health is known.

### Join | Issue 121 continuation

- Merge issue 123 first.
- Rebase PR 122 onto repaired `main`, resolve only truthful overlap, and
  reinstall the exact combined tip.
- Issue 121 owns its one fresh connector-plus-wake acceptance and closure.

## Non-goals

- Changing connected-app selection, composer DOM parsing, or committed-prompt
  verification.
- Raising `maxConcurrentChats` or adding a new global tab quota.
- Making browser startup or arbitrary profile-wide controls concurrent.
- Weakening provider warnings, identity gates, target-route verification,
  uncertain-effect fencing, or no-retry behavior.
- Pausing scheduler/materialization controls merely to manufacture a quiet
  acceptance window.
- Running GitHub Actions.

## Acceptance Criteria

- [x] One deterministic provider-free regression reproduces the installed
      foreground denial with an existing endpoint and unrelated exact-tab
      lease.
- [x] Ordinary exact-tab reservation does not require profile-wide startup
      control when the managed endpoint already exists.
- [x] Absent-browser startup remains blocked while any fenced lease exists.
- [x] API, CLI, and background-worker effective-mode/status evidence agrees for
      the selected AuraCall runtime profile.
- [x] Conversation, utility/materialization, and live-follow target ownership
      remains exact and mutually isolated.
- [x] `maxConcurrentChats`, aggregate interaction limits, provider warnings,
      identity, CAPTCHA, and effect-state hard stops remain intact.
- [ ] Focused and adjacent tests, typecheck, scoped lint, build, diff hygiene,
      planning audit, and active-lane audit pass.
- [ ] One exact installed coexistence smoke passes with source/runtime parity
      and final ownership reconciliation.

## Definition Of Done

The issue-123 repair is integrated into canonical `main`, its installed
coexistence receipt proves ordinary exact-tab work no longer waits for unrelated
background leases, issue 123 is closed, and PR 122 is rebased onto that exact
canonical repair without absorbing browser-coordination implementation.

## Stop Rules

- Stop on CAPTCHA, human verification, identity mismatch, provider warning,
  unknown target ownership, or effect uncertainty.
- Do not retry any terminal provider session.
- One red reproduction, one bounded repair pass, and one installed coexistence
  smoke are the hard execution bounds. Reframe or record a successor issue if
  an accepted blocker remains after that repair pass.
