# ChatGPT tab-affinity guarded rollout | 0360-2026-09-25

State: OPEN
Lane: P53
Branch: feat/issue-49-chatgpt-affinity-rollout
Target: main
Integration: merge
Work item: ecochran76/auracall#49
Plan version: 1

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

## Authority and Current State

- Issue 49 owns the work and the branch starts from canonical `main` at
  `17001ba1a5305f3641d4f6737e0db17b028e5923`.
- The operator authorized planning and execution of the guarded rollout.
- GitHub Actions are unavailable and are explicitly skipped by operator
  direction. Focused and widened local validation remain mandatory.
- Any browser/provider effect is limited to the qualified ChatGPT
  `wsl-chrome-3` AuraCall runtime profile and exact expected Pro/personal
  identity. Identity drift, CAPTCHA, provider warning, cooldown, unknown
  ownership, or uncertain effect is a hard stop.
- Never click ChatGPT's `Answer now`. No asset materialization, unrelated
  scheduler mutation, warning override, or automatic retry is authorized.

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
- Start a bounded soak with two conversation bindings and one dedicated
  metadata-only live-follow crawler. Use the smallest prompt/read budget needed
  to prove coexistence; all later observations are read-only status/census
  checks unless an explicit additional effect is separately authorized.
- Preserve periodic sanitized snapshots for a real 24-48 hour elapsed window.
- Stop immediately on any hard-stop condition and roll the tested runtime
  profile back to `serialized`.

Terminal condition: the elapsed window and final zero-orphan census are
durably evidenced. Merely starting the soak is not completion.

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
- Asset materialization or unrelated Account Mirror scheduler operations.
- Treating a short smoke, fixture, or unelapsed soak as rollout acceptance.

## Rollback

Set `browser.tabConcurrencyMode` to `serialized` in the affected AuraCall
runtime profile and restart only the AuraCall API/runtime process required to
reload configuration. Do not close, reload, or navigate browser targets as part
of rollback unless exact ownership is independently proved. Preserve the soak
receipt and read back status showing `mode = serialized`, `enabled = false`,
and no affinity maintenance owner.
