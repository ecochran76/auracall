# ChatGPT tab-affinity guarded rollout | 0360-2026-09-25

State: OPEN
Lane: P53
Branch: feat/issue-49-chatgpt-affinity-rollout
Target: main
Integration: merge
Work item: ecochran76/auracall#49
Plan version: 14

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
  returned. A separate random utility lease also appeared after job terminal;
  its exact caller is not proven, so it is preserved as unattributed evidence.
  The API was stopped cleanly and both tabs were left for TTL retirement.
  Packet 5G terminally closes ledger governors so late continuations fail
  before reserving or performing another provider interaction.
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

### Packet 6: Default enablement or retained rollback

- If every soak gate passes, change only the ChatGPT rollout default needed to
  select tab-affinity while retaining explicit `serialized` override.
- Re-run provider-free and installed status checks and integrate the final
  packet through a PR.
- If any gate fails, retain serialized behavior, close no evidence gap by
  retrying provider effects, and open a bounded repair successor.

Terminal condition: the default decision, exact commit, validation, installed
readback, and rollback posture are recorded; issue 49 closes only then.

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
