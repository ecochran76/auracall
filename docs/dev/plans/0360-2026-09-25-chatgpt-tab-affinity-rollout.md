# ChatGPT tab-affinity guarded rollout | 0360-2026-09-25

State: OPEN
Lane: P53
Branch: feat/issue-49-chatgpt-affinity-rollout
Target: main
Integration: merge
Work item: ecochran76/auracall#49
Plan version: 26

## Stable Objective

Move Plan 0359's integrated exact-tab affinity from explicit acceptance into a
guarded ChatGPT rollout. Give operators a compact, sanitized view of lease
health, workload mix, interaction pressure, provider guards, expiry, and
rollback state; make the one-setting serialized rollback explicit and tested;
and retain durable evidence from a real 24-48 hour soak before enabling
tab-affinity by default for ChatGPT.

This lane does not redesign tab ownership. It operationalizes the accepted
provider-neutral contracts. Gemini and Grok remain serialized until separate
provider-specific acceptance exists.

## Current State

- Issue 49 owns the work and the branch starts from canonical `main` at
  `17001ba1a5305f3641d4f6737e0db17b028e5923`.
- The operator authorized planning and execution of the guarded rollout.
- GitHub Actions are unavailable and are explicitly skipped by operator
  direction. Focused and widened local validation remain mandatory.
- Any browser/provider effect is limited to the qualified ChatGPT
  `wsl-chrome-3` AuraCall runtime profile and exact expected Pro/personal
  identity. Identity drift, CAPTCHA, provider warning, cooldown, unknown
  ownership, or uncertain effect is a hard stop.
- Never click ChatGPT's `Answer now`. The operator authorized one bounded
  catch-up with at most six materialization items; unrelated scheduler
  mutation, warning override, and automatic retry remain unauthorized.
- Packets 1 through 3 are implemented provider-free. P53 is registered on
  canonical main through PR 50 at `b2d78d8e9`. `/status`, Browser Ops, CLI,
  and MCP share the sanitized affinity projection and visible serialized
  rollback. The append-only soak helper enforces hard stops and a real 24-hour
  minimum. Focused validation passes 232 tests plus typecheck; publication of
  this implementation packet and installed soak remain open.
- PR 51 integrated the provider-free packet at `45a74c1cb`, and that exact
  merge is installed. Exact ChatGPT identity is Pro/personal and matches the
  configured `wsl-chrome-3` account. The soak start is correctly blocked by
  retained historical registry attention: one lost lease, four expired idle
  leases, and four outcome-unknown fences. No receipt, prompt, live-follow
  pass, or provider interaction was created. Explicit reconciliation of those
  fences is the next gate; the rollout must not baseline them away.
- The blocked preflight exposed a lifecycle defect rather than an operator
  cleanup duty: uncertain idle leases were excluded from TTL retirement,
  active leases ignored heartbeat expiry while their long-lived process stayed
  alive, old lost leases were not revisited, and an absent managed browser
  deferred cleanup forever. Plan v4 adds a provider-neutral repair packet that
  preserves uncertainty history while making those operational fences
  self-retiring under revision-fenced target-absence or exact-target proof.
- Packet 5J traced the leased detail-read timeout to contradictory option
  semantics: Account Mirror explicitly granted navigation on its retained
  crawler target, while the shared policy rejected every navigation whenever
  that target was retained. The source repair and installed acceptance are
  complete at canonical `2d6115f88`.
- Packet 6's first installed start receipt proved the intended three-tab
  coexistence, but preflight found that the receipt evaluator did not fail on
  post-baseline target creation, a new admission rejection, or a provider
  warning event that had cooled before the next snapshot. The crawler was
  cancelled after 36 seconds and that receipt is retained as preflight-only
  evidence. Plan v23 requires those delta hard stops before the authoritative
  24-hour clock starts.
- The delta hard stops merged through PR 75 at canonical `79ec9d3e1` and that
  exact build is installed. Authoritative receipt
  `725d6c25-cab9-4c9d-8b36-9a8622a440a2` started at
  `2026-09-26T02:10:31.856Z` with two idle conversation leases and one active
  metadata-only crawler lease. Its first post-start snapshot is accepted.
  A five-minute local timer appends snapshots and cancels the exact crawler
  plus stops the isolated API on any hard stop. The 24-hour elapsed gate is
  still open; default enablement remains forbidden.
- The authoritative soak failed after 9 minutes. Three consecutive crawler
  detail reads timed out, the completion failed at
  `2026-09-26T02:16:03.072Z`, and the snapshot at
  `2026-09-26T02:19:56.632Z` recorded `outcome-unknown`. The five-minute
  monitor cancelled the crawler and stopped the isolated API as designed.
  After a host reboot, the enabled normal API made two startup attempts; both
  were denied before browser launch by `tab-leases-active`. The normal API was
  stopped again, the obsolete 24-hour wake was cancelled, and ports
  18095/18096/45015 plus the managed browser process are absent. Receipt
  `725d6c25-cab9-4c9d-8b36-9a8622a440a2` is failed evidence and cannot satisfy
  the soak gate. Default enablement remains forbidden pending diagnosis and a
  new full-duration receipt.
- Packet 6A reproduced two provider-free defects behind that failure. The
  detail inventory deliberately promoted three transient timeouts into a fatal
  crawler error despite persisting a continuation cursor, and the read-only
  affinity finalizer converted every failure into an `outcome-unknown` lease.
  The repair now checkpoints and yields the pass at the timeout threshold so a
  later pass resumes at the next conversation, while all live-follow failures
  settle as known read-only outcomes. Focused regression coverage proves both
  the timeout pass and its subsequent catch-up pass. A new installed canary and
  full 24-hour receipt remain required; the failed receipt is unchanged.

## Acceptance Gates

1. Browser Ops, CLI, and MCP expose the same sanitized tab-concurrency posture:
   mode, rollback value, lease states, workloads, lifetime pressure, provider
   warnings, admission rejections, aggregate usage, target actions, and
   retirement disposition. They expose no target, conversation, operation,
   tenant, or provider-content identifiers.
2. Operators can see the configured mode and the exact rollback instruction
   without mutating configuration from the dashboard.
3. Deterministic tests prove serialized rollback creates no tab-affinity
   registry, ledger, or maintenance owner and preserves existing behavior.
4. A durable soak receipt records start/end timestamps, exact source and
   installed identities, bounded interaction budget, periodic sanitized
   snapshots, hard-stop findings, and final target/process census.
5. During the 24-48 hour soak, two ordinary ChatGPT conversations and one
   dedicated metadata-only live-follow crawler can coexist without cross-tab
   navigation, reload, focus churn, unnecessary target creation, leaked lease,
   provider warning, or aggregate-limit bypass.
6. Default enablement is a separate final packet and may occur only after the
   full elapsed soak window passes every gate. A failed gate rolls the tested
   AuraCall runtime profile back to `serialized` and preserves the receipt.

## Execution Packets

### Packet 1: Register and freeze the rollout contract

- Open and claim issue 49.
- Register P53 in the plan, roadmap, runbook, journal, and active-lane catalog.
- Record Plan 0359 as the dependency and confirm no competing work item or PR.

Terminal condition: the lane is discoverable from canonical planning surfaces
before implementation begins.

### Packet 2: Operator status and rollback UX

- Project the existing sanitized tab-concurrency status into Browser Ops.
- Extend CLI/MCP Browser Ops summaries and contract checks with the same
  projection.
- Show `serialized` as the immediate rollback value and document where
  `browser.tabConcurrencyMode` is configured.
- Keep the dashboard read-only; configuration mutation is out of scope.

Terminal condition: provider-free fixtures prove parity across HTTP dashboard,
CLI, and MCP without browser launch or provider work.

### Packet 3: Rollback and soak evidence tooling

- Add a provider-free status/receipt helper that evaluates hard stops and
  writes append-only, sanitized soak snapshots under AuraCall-owned state.
- Test both healthy and rejected snapshots, including warning, lost lease,
  unknown outcome, expired idle, navigation/reload/focus churn, and quota
  pressure.
- Document the exact start, inspect, stop, and rollback workflow.

Terminal condition: deterministic tests can prove acceptance and rejection
without a browser or provider.

### Packet 4: Local acceptance and publication

- Run focused tests, widened affected tests, typecheck, production build,
  scoped formatting/lint, plan audit, and diff hygiene.
- Run a fresh browser/process census after tests.
- Publish the coherent implementation branch and open a PR linked to issue 49.
- Skip GitHub Actions only under the recorded operator waiver.

Terminal condition: the published diff and local evidence are reviewable and
the source packet is safe to integrate.

### Packet 5: Installed ChatGPT soak

- Install only an exact canonical merged commit.
- Verify installed/source parity and exact expected ChatGPT identity before any
  interaction.
- Packet 4A is integrated and installed, but its first production maintenance
  interval exposed a scheduling defect: the API checked only the root browser
  mode even though maintenance scans resolved AuraCall runtime profiles.
  Packet 4B makes the default maintenance owner active when any resolved
  ChatGPT runtime profile selects tab-affinity.
- Packet 4B merged through PR 54 at canonical `d95357ba4` and that exact source
  was installed. On the first service-owned interval, all five stale fences
  converged to released: four uncertain leases retained
  `effectState=outcome-unknown` at revision 6 and the lost settled lease
  released at revision 7. No managed Chrome process or known debug-port
  listener appeared. The 24-48 hour soak remains unstarted.
- The authorized soak launch passed exact Pro/personal identity, then stopped
  before prompts because status counted four released historical uncertainty
  records as current `outcomeUnknown` attention. Packet 4C corrects that
  projection without deleting or weakening the retained uncertainty evidence.
- Packet 4C merged at canonical `5ebaba198`, passed 234 affected tests plus
  typecheck/build, and was installed. The repeated identity proof passed, but
  the managed API restart auto-created a queued live-follow completion in
  `backfill_history` with `full_missing_assets`, not the authorized
  metadata-only soak crawler. The API and browser were stopped before prompts,
  before receipt creation, and before a completed pass or materialization
  outcome. The managed service remains stopped pending explicit completion
  control authority.
- The operator authorized the broader bounded catch-up. Resume reached the
  existing crawler target but failed before materialization with missing
  provider-session authorization. Exact-target ChatGPT reads bypassed utility
  reacquisition as designed, but also bypassed the normal option builder that
  attaches identity authority. Packet 5B restores that envelope without
  changing the exact tab or adding provider retries.
- Packet 5B merged through PR 58 at canonical `d71362be3` and was installed.
  The first new bounded catch-up was rejected before browser work as
  `already-queued`, even though the earlier live-follow completion was already
  terminal. Its failed tab-affinity acquisition had occurred after setting the
  mirror's in-memory queued flag but before entering the collector cleanup
  block. Packet 5C clears and persists terminal status on that pre-collector
  failure path before any further catch-up attempt.
- Packet 5C merged through PR 59 at canonical `053a239f7` and was installed.
  Startup created one live-follow completion using the configured six-item cap.
  Its first pass completed successfully with exact Pro/personal session proof,
  one retained crawler lease, six aggregate active interactions, no warning,
  and no duplicate target. It indexed 30 conversations, inspected two detail
  surfaces, and yielded at the six-interaction budget with 22 detail surfaces
  remaining. Materialization correctly did not start before detail inventory.
  The completion was paused between passes and explicitly resumed to continue
  gradual catch-up under existing cooldowns.
- The first materialization job then exposed a separate tab-identity defect:
  each per-candidate `createLlmService` call generated a new random utility ID,
  producing successive `chatgpt-service-*` tabs even though all calls belonged
  to one durable history-materialization job. The managed API was stopped
  gracefully after the job reached terminal failed; the live-follow completion
  remains operator-paused. Packet 5D derives one stable utility affinity ID
  from the durable job ID and passes it through every history-materialization
  service construction, allowing the existing lease registry to reacquire the
  same exact tab.
- Packet 5D merged through PR 61 at canonical `8a36d4126` and was installed.
  A two-candidate proof created one target and adopted it five times, proving
  cross-instance reuse. Both candidates then failed because the utility layer
  forced `preserveActiveTab=true`; the adapter correctly refused to move the
  root target to the candidate conversation. Packet 5E permits navigation only
  when the owning caller explicitly requests it and navigates the exact leased
  target in place rather than falling back to an unleased replacement tab.
- Packet 5E merged through PR 62 at canonical `764c8af66` and was installed.
  Its bounded two-item proof retained one lease and one leased target across
  three observed adoptions, with no provider warning. The requested
  conversation route did not settle and remained on the ChatGPT root, but the
  ChatGPT navigation wrapper discarded the failed settle result for non-project
  URLs. The job therefore continued a long read against the wrong route instead
  of failing closed. Packet 5F makes every ChatGPT route-settle failure fatal;
  no further live retry is permitted until that repair is canonical and
  installed.
- Packet 5F merged through PR 63 at canonical `f62e57e63` and was installed.
  The preceding job then reached terminal failed with exact identity match,
  one materialization target creation, five adoptions, and zero warnings. Four
  navigation reservations nevertheless remained started after terminal job
  settlement. Their common durable job operation ID proves they came from
  timed-out browser promises that continued after their `Promise.race` caller
  returned. A separate random utility lease also appeared after job terminal.
  Scheduler history and the target status record attribute it to scheduled
  detail-inventory refresh `acctmirror_855cb75e-9df6-4645-97d5-b315ce1593d6`,
  which completed one five-interaction pass. The API was stopped cleanly and
  both tabs were left for TTL retirement.
  Packet 5G terminally closes ledger governors so late continuations fail
  before reserving or performing another provider interaction.
- Packet 5H merged through PR 66 at canonical `5c06cfd91`. The defect was the
  scheduler request omitting `liveFollowOperationId`, not a collector helper
  dropping an exact target. Scheduled targets now use one stable crawler
  identity across passes. The widened provider-free set passes 292 tests with
  typecheck/build, and the installed scheduler bytes match source. The API
  remains stopped; installed live proof is still a separate gate.
- Start a bounded soak with two conversation bindings and one dedicated
  metadata-only live-follow crawler. Use the smallest prompt/read budget needed
  to prove coexistence; all later observations are read-only status/census
  checks unless an explicit additional effect is separately authorized.
- Preserve periodic sanitized snapshots for a real 24-48 hour elapsed window.
- Stop immediately on any hard-stop condition and roll the tested runtime
  profile back to `serialized`.

Terminal condition: the elapsed window and final zero-orphan census are
durably evidenced. Merely starting the soak is not completion.

### Packet 4A: Lease lifecycle repair

- Treat heartbeat/idle and absolute TTL as operational ownership deadlines,
  including when the owner is a still-live long-running API process.
- Permit expired idle `outcome-unknown` leases to retire without clearing or
  retrying the uncertain provider effect.
- Revisit pre-existing lost leases on every maintenance pass. Release missing
  targets, close only exact attributable expired targets with post-close
  absence proof, and preserve identity mismatches.
- Treat an absent endpoint from read-only managed-browser resolution as target
  absence proof in the maintenance path; never launch a browser for cleanup.

Terminal condition: provider-free regression tests prove stale fences converge
without manual registry edits and without weakening no-retry uncertainty.

### Packet 4B: Runtime-profile maintenance scheduling

- Derive default maintenance ownership from the same resolved AuraCall runtime
  profiles the maintenance pass visits, not only the root browser block.
- Preserve explicit interval overrides and proof-scope suppression.
- Install the exact canonical repair and verify the five stale fences converge
  without starting the managed browser or performing a provider interaction.

Terminal condition: a nested-profile regression passes and installed
maintenance releases the stale leases with a zero-process, zero-listener
browser census. Satisfied by canonical `d95357ba4` on 2026-09-25.

### Packet 4C: Released uncertainty status boundary

- Keep released `outcome-unknown` records durable in the lease registry.
- Count outcome-unknown attention only across operationally fenced lease
  states, matching `fencedLeaseCount` and the soak hard-stop meaning.
- Reinstall the canonical repair, repeat exact identity proof, and require a
  clean accepted soak-start receipt before any bounded prompt interaction.

Terminal condition: provider-free status regression and installed affinity
status both prove released history remains present while operational unknown
attention is zero.

### Packet 5A: Live-follow control interlock

- Do not adopt the queued full-sweep/full-materialization completion as soak
  evidence.
- Keep the managed API stopped so restart reconciliation cannot resume it.
- Let isolated no-completion maintenance retire the uncertain crawler lease
  after its normal TTL without launching Chrome.
- Require explicit operator authority before pausing or cancelling the queued
  completion, then configure or invoke only a metadata-only crawler for soak.

Terminal condition: the conflicting completion cannot auto-resume, the stale
crawler fence is released by TTL, and an accepted soak receipt can be created
before bounded prompt or crawler interactions.

### Packet 5B: Exact-target provider-session authority

- Rebuild ChatGPT list options for an already exact target with
  `ensurePort=false`, preserving host, port, and target ID.
- Attach the configured provider-session authorization before exact-target
  reads or mutations without reacquiring a utility tab.
- Reinstall canonically and run only one newly created bounded catch-up after
  the failed completion and uncertain lease have reached a safe terminal state.

Terminal condition: the bounded catch-up passes identity authorization,
completes within aggregate limits, and records any materialization outcome
without target proliferation or retrying the failed uncertain operation.

### Packet 5C: Pre-collector queued-state cleanup

- Treat live-follow affinity acquisition as part of the refresh lifecycle,
  even when no browser operation is acquired.
- If affinity acquisition throws, clear both transient queued/running flags,
  persist the terminal failure timestamps and counter, and rethrow the original
  hard-stop error.
- Prove the target becomes eligible for a new operator-authorized operation
  rather than remaining falsely `already-queued` for the API process lifetime.

Terminal condition: regression coverage proves a failed affinity acquisition
cannot strand queued state, then the canonical installed runtime permits one
fresh bounded catch-up without manual cache edits.

### Packet 5D: Durable materialization utility-tab identity

- Permit a caller to supply the ChatGPT utility affinity identity instead of
  generating one per `ChatgptService` instance.
- Derive that identity from the durable history-materialization job ID and use
  it for conversation refresh, materialization, account-library, media, and
  project-source service construction.
- Preserve random per-instance identities for unrelated callers that do not
  supply a durable routine identity.

Terminal condition: provider-free coverage proves repeated service instances
for one job present one utility identity and the registry reuses one exact tab;
installed validation shows no additional utility target during a bounded job.

### Packet 5E: In-place navigation for a job-owned utility tab

- Preserve the active utility route by default, but honor an explicit
  `allowNavigation=true` request from the durable job.
- When an exact leased target is on a different valid ChatGPT route, navigate
  that same target to the preferred conversation and retain its identity.
- If exact-target attachment or navigation fails, fail closed instead of
  opening a replacement target outside the lease.

Terminal condition: provider-free navigation tests pass and a bounded installed
job visits multiple candidate conversations with one target creation, no
replacement target, and no provider warning.

### Packet 5F: Fail closed when an exact route does not settle

- Apply the navigation result uniformly to conversation, root, library, and
  project routes instead of checking failure only when a project ID is present.
- Preserve the route-specific diagnostic and stop the materialization attempt
  before any extraction can run against the wrong page.
- Keep the existing exact lease and do not create or select a replacement tab.

Terminal condition: provider-free coverage proves an unsettled ordinary
conversation route throws, focused tests plus typecheck/build pass, and the
canonical installed runtime is ready for a separately authorized bounded proof.

### Packet 5G: Fence browser continuations after operation completion

- Distinguish settling the current interaction from terminally closing its
  ledger-backed governor.
- On terminal utility or live-follow completion, close the governor before
  idling the lease. Reject later interactions both before and after rate-limit
  pacing, including a continuation already waiting when close occurs.
- If close races after reservation, start and immediately settle that exact
  reservation as cancelled/none so the append-only ledger has no orphan.

Terminal condition: provider-free tests prove late and pacing continuations
cannot create a started orphan, focused materialization/live-follow suites plus
typecheck/build pass, and the canonical runtime remains stopped pending a
separately authorized live proof.

### Packet 5H: Bind scheduled live follow to its crawler tab

- The traced defect is the scheduler-to-refresh boundary: periodic scheduled
  passes omitted `liveFollowOperationId`, so refresh never created a crawler
  affinity context and the collector was never supplied exact crawler options.
  ChatGPT reads then correctly fell through to random `chatgpt-service-*`
  utility affinity under the incomplete request.
- Give every scheduled target a stable, content-free live-follow operation ID
  derived from provider and AuraCall runtime profile. Reuse that identity on
  every pass so refresh reacquires and heartbeats the target's crawler lease
  and carries its exact target through identity, index, and detail inventory.
- Prove provider-free that one scheduled pass cannot create a generic utility
  lease: the scheduler request must carry the stable identity, and refresh
  coverage must continue to pass the resulting exact affinity into collection.

Terminal condition: a fixture scheduled pass uses only its crawler lease and
target, all aggregate interaction records name that routine, and no live proof
runs until this packet is canonical and installed.

Installed evidence: canonical `02f7a3613` completed scheduler refresh
`acctmirror_2018493f-c299-4c10-8ac2-b5ed3c4bce00` on `wsl-chrome-3` with exact
identity match, five settled interactions, one live-follow lease, zero generic
utility leases, and zero warnings. The lease retired released/settled after
TTL. A maintenance-only server started without an explicit scheduler interval
inherited configured cadence and began one unintended second pass before being
stopped; this added one adoption and two settled reads, but no new target or
warning. Cleanup also found one proof-launched unleased ChatGPT startup page
after the leased crawler target disappeared. Packet 5H's binding is accepted,
but perfect one-tab lifecycle acceptance remains open.

### Packet 5I: Remove the unleased browser-startup page

- Trace the `ensurePort=true` browser startup path that leaves one ChatGPT page
  outside the crawler lease before `openTarget` creates the leased crawler.
- Adopt the attributable compatible startup page when safe, or close it with
  post-close absence proof before reserving a distinct crawler target.
- Add provider-free coverage proving cold-start live follow yields exactly one
  ChatGPT page and one crawler lease, with no unleased compatible target.

Terminal condition: cold-start acceptance has one created-or-adopted page,
one crawler lease, zero unleased ChatGPT pages, and normal TTL retirement.

Source evidence: the coordinator now adopts the only compatible, unowned page
reported by a cold browser start and records adoption instead of target
creation. A sole incompatible startup page is closed and proved absent before
the crawler is created. It does not inspect arbitrary existing endpoints for
adoption, and multiple ambiguous cold-start pages fail closed without opening
another page. The configured ChatGPT adapter reuses the target census already
returned by `resolveServiceTarget`, refuses an unavailable census, and avoids
an extra DevTools list request. Focused provider-free tests and typecheck pass.
Installed cold-start acceptance and TTL retirement remain required before this
packet is accepted.

Installed evidence: canonical `d45aab67c` completed one isolated scheduler
refresh `acctmirror_93f30b23-c053-466e-9d2e-b43b7798f01d` on exact
`wsl-chrome-3`. Cold start produced one ChatGPT page whose target ID exactly
matched the new live-follow lease. The lease recorded one adoption, zero target
creations, and zero navigation/reload/focus/close actions. Five of six allowed
provider interactions settled without warning. After the fixed idle TTL, the
lease transitioned through lost fencing to released/settled with
`retirementReason=idle-expired`; the target, port, and proof-owned Chrome
process were absent. Packet 5I is accepted.

### Packet 5J: Make leased detail-read route changes explicit

- Diagnose why three detail reads in the Packet 5I canary found the exact
  leased target at ChatGPT root instead of the requested conversation route.
- Define the necessary crawler route transition as a governed, rate-limited
  lease action without restoring random-tab selection or unnecessary refresh.
- Prove provider-free and installed that sequential detail reads stay on the
  same target, record the necessary navigation, and do not incur two-minute
  route-mismatch timeouts.

Terminal condition: multiple detail reads complete on one leased target with
explicit route-transition accounting, no extra page, and no provider warning.

Source evidence: explicit `allowNavigation` now controls route authority even
when `preserveActiveTab` retains the exact target. The ChatGPT transition uses
the existing renavigation governor, and a physically performed transition
records a lease navigation action and advances the claim used by the final
heartbeat/idle transition. Focused provider-free tests pass 255 tests plus
typecheck, build, formatting, and the plan audit. The source was integrated
through PR 72 at canonical `2d6115f88`.

Installed evidence: canonical `2d6115f88` completed scheduler refresh
`acctmirror_d066eff9-472f-4b95-828c-26537cca119e` on exact `wsl-chrome-3`.
Four sequential detail reads used lease
`d4764519-a9a3-47a0-a34b-f19e33a32f01` and target
`E6D96203C19C96D296FB48B532C0BCD0`. The lease recorded one adoption, four
navigations, and zero creations/reloads/focuses/closes. Each navigation had a
separate settled governed interaction; all four detail stages completed with
no route-mismatch error. The approximately two-minute stage spacing came from
the configured cooldown, while the navigation interactions themselves settled
in 0.5-3.8 seconds. One exact ChatGPT page remained bound to the idle/settled
lease, all five provider interactions settled, no provider warning appeared,
and the isolated API was stopped. Packet 5J is accepted.

### Packet 6: Default enablement or retained rollback

- Before starting the soak clock, reconcile the evaluator with Packet 5J:
  permit governed live-follow route traversal while retaining a hard stop on
  conversation, new-conversation, or utility navigation growth. Publish only
  sanitized workload-class action totals; expose no target, conversation,
  operation, tenant, or content identifier.
- If every soak gate passes, change only the ChatGPT rollout default needed to
  select tab-affinity while retaining explicit `serialized` override.
- Re-run provider-free and installed status checks and integrate the final
  packet through a PR.
- If any gate fails, retain serialized behavior, close no evidence gap by
  retrying provider effects, and open a bounded repair successor.

Terminal condition: the default decision, exact commit, validation, installed
readback, and rollback posture are recorded; issue 49 closes only then.

### Packet 6A: Resumable timeout and read-only settlement repair

- Replace fatal escalation of three consecutive detail-read timeouts with a
  persisted yield at the next conversation cursor.
- Prove the next pass resumes and completes the remaining conversation rather
  than restarting or abandoning materialization catch-up.
- Settle live-follow failures as known read-only outcomes; never create an
  `outcome-unknown` provider-effect fence for a routine that cannot submit.
- Preserve provider-warning classification and all aggregate interaction
  accounting. Do not weaken timeout, warning, CAPTCHA, identity, or rate-limit
  guards.

Terminal condition: provider-free regressions, widened local validation,
canonical integration, exact installation, and one bounded installed canary
pass without a new outcome-unknown fence. Only then may a new Packet 6 soak
receipt start.

## Non-goals

- Gemini or Grok concurrent-tab enablement.
- Raising provider interaction limits or weakening warning/cooldown policy.
- Automatic handling of CAPTCHA, MFA, login, or `Answer now`.
- A dashboard configuration editor.
- Asset materialization beyond the explicitly authorized bounded six-item
  catch-up, or unrelated Account Mirror scheduler operations.
- Treating a short smoke, fixture, or unelapsed soak as rollout acceptance.

## Rollback

Set `browser.tabConcurrencyMode` to `serialized` in the affected AuraCall
runtime profile and restart only the AuraCall API/runtime process required to
reload configuration. Do not close, reload, or navigate browser targets as part
of rollback unless exact ownership is independently proved. Preserve the soak
receipt and read back status showing `mode = serialized`, `enabled = false`,
and no affinity maintenance owner.
