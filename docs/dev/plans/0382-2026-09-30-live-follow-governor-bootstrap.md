# Live-Follow Governor Bootstrap | 0382-2026-09-30

State: OPEN
Lane: P82
Work item: ecochran76/auracall#146
Source base: `origin/main` at `35f854ad5`
Branch: `fix/issue-146-live-follow-governor-bootstrap`
Target: `main`
Integration: merge

## Stable Objective

Make a cold-start ChatGPT account-mirror live-follow pass acquire exactly one
valid crawler target and lease under explicit provider-traffic admission, then
bind all later connect, navigation, refresh, and warning probes to the
lease-specific governor without weakening the fail-closed traffic contract.

## Current State

Issue #139 is integrated and installed, and the account-mirror scheduler remains
operator-paused. A single authorized installed canary on `wsl-chrome-3` began
with zero non-released leases and zero active browser-profile controls, then
failed before its first pass with `Provider traffic governor is required before
physical action: provider:chatgpt:connect-tab.` Direct CDP observation recorded
one ChatGPT root target and 152 requests before failure, with no document
navigation and no visible rate-limit warning.

The bootstrap order is circular. `createConfiguredLiveFollowAffinity` must
resolve or start the managed browser and acquire the crawler target before it
has the crawler lease ID required by the final `ProviderTrafficGovernor`.
However, the browser startup/connect-tab seam already requires a governor.

## Architecture Contract

1. Cold-start target acquisition is a distinct, explicit pre-lease phase. It
   must have bounded attribution and traffic admission; it is not exempt from
   the governor contract.
2. Pre-lease authority may perform only the minimum physical work required to
   resolve/start the exact managed browser and obtain the candidate crawler
   target. It must not navigate, reload, focus, enumerate conversation detail,
   or submit provider content.
3. The candidate target is reserved exactly once. After reservation, the
   lease-bound governor replaces the pre-lease authority for every subsequent
   action. No action may fall through to an ungoverned compatibility path.
4. Existing endpoints and targets must be inspected before reuse. Missing,
   duplicate, stale, cross-route, cross-account, or ambiguously owned targets
   fail closed and are never silently adopted.
5. Startup request counts and target creation remain visible in aggregate
   amplification evidence. A pre-lease phase cannot disappear from accounting
   merely because the completion fails before identity collection.
6. Visible ChatGPT rate-limit, CAPTCHA, verification, or identity-conflict
   evidence stops all work without dismissal, navigation, reload, or retry and
   persists the existing sanitized warning signature.

## Execution

1. Add a provider-free cold-start regression that reproduces the installed
   failure at the real `resolveServiceTarget` / connect-tab boundary.
2. Introduce the minimum explicit pre-lease provider-traffic authority needed
   for exact target acquisition, with bounded attribution and settlement.
3. Hand off atomically to the lease-bound live-follow governor and prove one
   lease, one target, and no ungoverned physical action.
4. Run focused and adjacent provider-free suites, typecheck, affected lint and
   build, CodeGraph readback, diff hygiene, and planning audit.
5. Merge through a pull request, install the exact canonical merge, restart the
   API, and repeat only the authorized one-pass direct-CDP canary. Keep the
   scheduler paused throughout.

## Acceptance Criteria

- [ ] Provider-free coverage reproduces the former cold-start failure and
      passes only when startup/connect-tab has explicit traffic authority.
- [ ] Cold start creates or adopts exactly one candidate crawler target and
      reserves exactly one active live-follow lease.
- [ ] The final governor is bound to the exact lease generation and owns every
      post-reservation connect, navigation, refresh, and warning probe.
- [ ] Stale, duplicate, mismatched, or ambiguous targets and leases fail closed.
- [ ] Startup/target physical work contributes to sanitized aggregate traffic
      and amplification evidence.
- [ ] Provider-free warning fixtures stop immediately and preserve the existing
      sanitized signature without dismissal or retry.
- [ ] Focused and adjacent tests, typecheck, build, affected lint, CodeGraph,
      diff hygiene, and planning audit pass.
- [ ] The exact canonical merge is installed and one bounded `wsl-chrome-3`
      `steady_follow` canary completes or reaches a truthful governed terminal
      state under direct CDP with no warning and no residual bad lease.
- [ ] Scheduler posture remains paused after acceptance; resume remains a
      separate operator decision.

## Non-goals

- No scheduler resume or unattended live-follow enablement.
- No prompt submission, `Answer now` interaction, warning dismissal, or retry
  after a provider warning.
- No general HTTPS interception proxy or request-body capture.
- No cleanup of unrelated browser profiles, worktrees, leases, or completions.
- No weakening of governor-required semantics at shared physical-action seams.

## Stop Rules

- Stop live work immediately on a visible rate-limit warning, CAPTCHA,
  verification page, identity ambiguity, missing exact lease, or duplicate or
  stale target ownership.
- Do not retry an uncertain provider effect. Reconcile current browser, lease,
  governor, and completion evidence first.
- Keep `auracall-account-mirror-scheduler.service` inactive and the API
  scheduler operator-paused throughout this plan.

