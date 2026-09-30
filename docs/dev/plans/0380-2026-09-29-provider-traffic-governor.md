# Authoritative Provider Traffic Governor | 0380-2026-09-29

State: OPEN
Lane: P80
Work item: ecochran76/auracall#138
Source base: `origin/main` at `51efd47732af8c2c68be6c1fb4532e502cc7121a`
Branch: `fix/issue-138-provider-traffic-governor`
Target: `main`
Integration: merge

## Stable Objective

Route every AuraCall-initiated physical provider-browser action through one
browser-service traffic governor that validates ownership and attribution,
enforces persisted admission and pacing before effect, records physical action
settlement, and converts detected provider warnings into a durable profile
cooldown before any later action can proceed.

## Current Evidence

- During live follow on `wsl-chrome-3`, the operator observed ChatGPT's visible
  `Too many requests` dialog while the profile rate-limit file retained an
  empty detection history and no cooldown.
- The provider-interaction ledger recorded zero warnings, yet a later scheduler
  pass recorded a successful reload and conversation read.
- Issue 131 / Plan 0378 protects prompt terminal exits with a bounded delayed
  same-endpoint warning census, but scheduler and history-materialization paths
  do not necessarily traverse that terminal reconciliation seam.
- `BrowserInteractionGovernor` provides optional pacing; its ledger-backed form
  owns persisted admission and attribution for affinity workloads.
- `BrowserMutationAuditSink` separately observes physical actions, is optional,
  and deliberately swallows sink failures. `navigateAndSettle`,
  `reloadAndSettle`, and `openOrReuseChromeTarget` therefore have parallel,
  independently optional control paths.
- Direct physical CDP mutations are concentrated in browser-service navigation,
  reload, target-open/reuse, and exact-target routing helpers, with a small
  number of provider-specific callers.

## Current State

- The incident is contained: account-mirror scheduling is operator-paused and
  the owned `wsl-chrome-3` browser was closed.
- Issue 138 is open and linked to dependent algorithm issue 139.
- This lane starts from the current canonical remote tip in an isolated clean
  worktree. No installed-runtime or live-provider action belongs to this plan.
- Provider-neutral configured clients now acquire exact ephemeral traffic
  authority in both serialized and affinity modes. Serialized mode remains
  concurrency-disabled but retains the durable registry/ledger required for
  fail-closed admission. Target reuse is admitted before focus/navigation and
  client close releases its authority exactly once; an un-attributable target
  creation or attachment stops before provider effect.
- The legacy direct browser prompt path now preserves the exact leased governor
  through local and remote target attachment and assistant-response recovery.
  Required-authority connection failures no longer fall back to an arbitrary
  first target.

## Architecture Contract

- Introduce a browser-service `ProviderTrafficGovernor` as the sole lifecycle
  boundary for physical provider actions.
- A governed action carries one immutable attribution context: provider,
  runtime profile, managed browser profile, workload, operation, and exact tab
  lease. A provider-work action with missing attribution fails before effect.
- `begin` performs abort, ownership, pacing, persisted admission, and awaited
  start-recording before the CDP mutation.
- `settle` records physical outcome and performs the configured bounded warning
  probe. A detected warning writes both the provider-interaction warning and
  provider-specific persisted cooldown, then terminates the operation.
- Audit persistence is authoritative for governed provider work; diagnostic
  projections may remain best-effort only when they are explicitly downstream
  of the authoritative record.
- Provider adapters own warning classification and cooldown persistence hooks;
  browser-service owns lifecycle ordering, attribution, and fail-closed
  enforcement.
- Operator bootstrap/login actions that genuinely lack a tab lease must use an
  explicit non-provider-work authority classification; they may not silently
  impersonate governed background work.

## Execution Packets

1. Add provider-free RED contract tests for missing attribution, admission or
   audit failure before effect, successful action settlement, post-action
   warning persistence, and next-action rejection under cooldown.
2. Add the provider-neutral governor lifecycle in browser-service and adapt the
   existing ledger-backed interaction governor and mutation audit into it rather
   than introducing another independent counter.
3. Make navigation, reload/fallback reload, target creation/reuse, and
   exact-target routing consume the governor lifecycle; remove direct optional
   pacing/audit combinations from these physical seams.
4. Thread exact configured attribution and ChatGPT warning/cooldown hooks through
   prompt, live-follow, history-materialization, CRUD, and diagnostic provider
   paths. Classify any explicit operator bootstrap exception at its call site.
5. Add a structural regression that inventories direct physical CDP mutation
   sites and proves production provider-work callers cannot bypass the governor.
6. Update operator/developer contracts, the fixes log, journal, lane catalog,
   and issue receipt. Run focused tests, adjacent browser suites, typecheck,
   scoped lint, build, diff hygiene, CodeGraph readback, and planning/lane
   audits before publication and integration.

## Acceptance Criteria

- [x] Provider-free reproduction proves a visible post-action ChatGPT warning
      on scheduler/materialization work was previously absent from both the
      interaction ledger and profile cooldown.
- [x] All AuraCall-initiated physical target, navigation, reload, location
      assignment, and governed in-page actions traverse one browser-service
      governor lifecycle.
- [x] Provider work with missing operation or tab-lease attribution fails
      before any physical action.
- [x] Persisted admission, pacing, and start recording finish before effect;
      an unreadable or unwritable authoritative safety state fails closed.
- [x] A detected warning records a sanitized provider warning, persists the
      profile cooldown, freezes related work, and rejects the next action.
- [x] Prompt, live follow, history materialization, CRUD, and diagnostics have
      no lower-level provider-work mutation bypass.
- [x] Existing effect-state truthfulness, lease generation fencing, terminal
      reconciliation, and `Answer now` prohibition remain green.
- [x] Provider-free focused and adjacent validation, typecheck, lint, build,
      diff hygiene, CodeGraph, and planning/lane audits pass with durable
      receipts.

## Non-goals

- Do not add CDP network request metering or an HTTPS interception proxy.
- Do not capture provider request/response bodies, headers, cookies, query
  strings, or account content.
- Do not optimize the account-mirror change-frontier algorithm; Issue 139 owns
  that dependent work.
- Do not resume the scheduler, launch a provider browser, dismiss a warning,
  install the runtime, or run a live provider canary in this source lane.

## Stop Rules

- Stop before any provider or installed-runtime effect.
- Stop rather than weakening attribution when a caller cannot prove its owning
  operation and lease.
- Stop if warning persistence would overwrite stronger existing cooldown or
  uncertain-effect evidence.
- Preserve the operator pause and do not clear provider guards or tab leases.

## Current Next Action

Publish the provider-free acceptance receipt, review the branch, and integrate
through the required pull-request path. Installed adoption and live acceptance
remain explicitly outside this plan.

## Provider-Free Acceptance Receipt

- Source checkpoint: `2f638ac3c`.
- Focused governor/legacy prompt verification: 72 tests passed across the
  affected authority, prompt, lease, target-reuse, and structural suites.
- Comprehensive suite before the final compatibility repair: 3,414 tests
  passed and 69 skipped. Four change-related failures exposed minimal
  browser-service test doubles; checkpoint `2f638ac3c` repaired them and the
  affected 72-test slice passes. The remaining broad-suite exceptions are the
  two established baseline failures (one structural assertion and one Grok
  timeout) plus three MCP stdio suites referencing a Node executable removed
  by the WSL reboot.
- Typecheck, production build, full lint (zero errors; existing warnings only),
  and diff hygiene pass. No live provider, browser, scheduler, lease, install,
  or runtime effect was performed.
