# ChatGPT Tool-Approval Acknowledgment | 0300-2026-08-21

State: CLOSED / EXACT-CARD SOURCE AND INSTALL ACCEPTED / LIVE ACCEPTANCE BLOCKED ON PLAN 0301
Lane: P01
Operational state: P6 CLOSED; EXACT-CARD REPAIR RETAINED; POST-SUBMIT LOCK SUCCESSOR ACTIVE

## Stable Objective

Make AuraCall reliably distinguish sequential ChatGPT/LitScout approval cards
inside one assistant turn, so a succeeded action can advance to the next exact
card without double-clicking, weakening exact-action matching, or replaying a
durable LitScout action.

## Current State

- Plan 0299 is closed, pushed, installed byte-exact, and live-proven for Chat
  and Work mode semantics. Its classifier repair is not implicated.
- LitScout Plan 0434 used that installed runtime for one exact Chat/Sol High/
  `allow-once` submission. AuraCall clicked the approval and stopped with
  `chatgpt-tool-approval-not-confirmed` because the surface did not disappear.
- LitScout independently proves that the first click took effect: Session 68 receipt
  `rar_a67995bf6d112868a4afd5968ac83b06` succeeded `approve_enrichment` and
  wrote approved plan `rep_08cd75bbf4313f4c3b0077dcdf8a729f` for one
  zero-positive-spend full-text attempt on Work `2897`, with zero approval-time
  provider calls.
- The requested AuraCall output is absent. Enrichment execution, Analyze,
  evidence synthesis, and claim/citation audit did not run. The exact resumable
  boundary is fresh authenticated `research_continue`; approval replay is
  prohibited.
- Read-only retained DOM localizes the failure more precisely. A distinct next
  `data-testid="tool-approval-card"` for research execution remains enabled in
  `conversation-turn-8`; the prior approval card is gone. The probe rooted at
  the containing turn and truncated its first 500 characters, so sequential
  cards in that turn received the same fingerprint and the handler falsely
  reported that the original card had not disappeared.
- The exact-card RED is GREEN after the one-line root repair. Fourteen focused
  approval tests, 138 affected contract tests, typecheck, scoped zero-warning
  lint, build, and the full provider-free suite (`2942` passed, `65` skipped)
  pass. CodeGraph is current and reports both local and remote browser callers.
  Source is ready for commit/push before the single install/restart gate.
- Product `fa831b02` is pushed, installed byte-exact, and served after one API
  restart. The one real LitScout acceptance passed Send, then exposed a separate
  browser-operation lifetime defect: account-mirror refresh acquired the same
  profile while the foreground run still awaited tool approval. Chrome stayed
  alive and LitScout recorded zero new effects. Plan 0301 owns that repair and
  the separately frozen real acceptance; Plan 0300 is not reopened.

## Planning Metadata

- Parent: Plan 0286 ChatGPT third-party tool approval policy.
- Immediate predecessors: Plans 0288, 0290, 0299, and LitScout Plan 0434.
- Critical-path owner/lane: `/root` / `p0300_tool_approval_acknowledgment`.
- Branch/worktree: `fix/plan0300-chatgpt-tool-approval-acknowledgment` in the
  primary AuraCall worktree.
- Expected write set: the provider-owned ChatGPT approval handler and exact
  response-poll integration; focused tests; this plan; `ROADMAP.md`,
  `RUNBOOK.md`, `docs/dev/dev-journal.md`, `docs/dev-fixes-log.md`, and narrow
  operator/testing guidance; one acceptance receipt.
- Parallel work: none. Diagnosis, RED, implementation, source acceptance,
  install, and live LitScout validation stay serialized.

## Required Work

1. Preserve the Plan-0434 failure/session, durable LitScout receipt, approved
   Work-2897 plan, repo/runtime identities, and zero-replay boundary.
2. Add one fast deterministic public-seam regression that reproduces the exact
   symptom: a long shared assistant-turn prefix hides the exact current card
   identity and collapses two sequential approvals to one fingerprint.
3. Generate and test ranked falsifiable hypotheses against the RED seam and,
   if needed, bounded read-only DOM evidence from the retained conversation.
4. Implement the smallest provider-owned repair: root discovery and
   fingerprinting at the exact current `tool-approval-card`, retain
   disappearance or distinct-card replacement success, and leave a truly
   unchanged card as a fenced terminal error.
5. Prove unchanged manual/ambiguous/changed-before-click/one-attempt/
   sequential-approval behavior and the categorical `Answer now` exclusion.
6. Run focused and affected suites, typecheck, build, scoped zero-warning lint,
   full provider-free tests, CodeGraph readback, plan audit, and diff hygiene.
7. Push accepted source, install once at an observed idle boundary, prove
   source/installed byte parity and healthy API/browser ownership, then run one
   bounded zero-retry LitScout acceptance from fresh Session-68 controller
   authority. It must not replay `approve_enrichment` and must stay inside the
   approved USD `0` positive-spend envelope.
8. Reconcile the AuraCall session/output, ChatGPT response, LitScout receipts,
   Session corpus, provider calls/spend, installed runtime, repository, and
   remote state before closure.

## Non-Goals

- No Chat/Work classifier changes, broad selector relaxation, generic
  `allow`/`continue` matching, `Answer now` click, or `always-allow` widening.
- No DOM disappearance bypass based on elapsed time, pointer dispatch,
  arbitrary assistant text, generic turn growth, or an unbound external
  receipt.
- No replay of Session-68 search, downselection, or enrichment approval; no
  direct LitScout approval-store write or stale-token execution.
- No positive or unknown marginal spend, OAuth widening, Graphiti write,
  publication, filing, signature, or third-party communication.
- No release/tag/npm publication or unrelated scheduler, account-mirror,
  browser-profile, provider-identity, or browser-service refactor.

## Critical Path

1. `P0`: freeze plan/current evidence and push before implementation.
2. `P1`: establish the one-command deterministic RED regression and capture
   the exact failing assertion.
3. `P2`: diagnose with 3-5 ranked hypotheses; implement the minimal fix only
   after the RED seam is proven.
4. `P3`: complete provider-free source acceptance, commit, push, and verify
   CodeGraph/remote state.
5. `P4`: install once at an idle boundary and prove byte/runtime parity.
6. `P5`: execute one zero-retry real LitScout acceptance from fresh controller
   readback; stop and reconcile without resubmission on any ambiguous effect.
7. `P6`: close durable docs/receipt only when source, installed runtime,
   LitScout effects, repo, and remote evidence agree.

## Acceptance Criteria

- `TAA-R1`: a fast deterministic regression goes RED on the exact whole-turn
  prefix collision and GREEN only after exact-card rooting.
- `TAA-R2`: disappearance and distinct-card acknowledgment still succeed;
  an unchanged card still errors after one click.
- `TAA-R3`: manual, ambiguity, pre-click drift, one-attempt fencing, repeated
  legitimate approvals, exact paired labels, and `Answer now` exclusion pass.
- `TAA-R4`: acknowledgment evidence is exact-card-local and stronger than
  arbitrary turn text or time; no LitScout-specific receipt logic is embedded
  in AuraCall.
- `TAA-R5`: focused/affected/full provider-free tests, typecheck, build, scoped
  lint, CodeGraph, plan audit, and diff hygiene pass on the pushed source.
- `TAA-R6`: installed affected artifacts are byte-exact with pushed source and
  AuraCall API plus managed-browser ownership recover healthy after install.
- `TAA-R7`: one real LitScout run proves the installed handler can continue
  from one succeeded approval to the next exact card in the same turn; the test
  returns a terminal response and durable receipt reconciliation with zero
  duplicate clicks, retries, or completed-action replay.
- `TAA-R8`: Session 68, provider-call/spend effects, output, runtime, repo, and
  remote state are fully reconciled; any incomplete live result is reported as
  such and does not become a reliability claim.

## Bounds And Stops

- One implementation attempt plus at most one evidence-backed repair.
- One user-runtime install and one API restart after pushed source acceptance.
- One real LitScout prompt submission, zero resubmissions, zero regenerate,
  zero stale-token recovery, and zero completed-action replay.
- Stop before the live run on account/profile/conversation/controller/input/
  installed/branch/remote drift, browser ownership ambiguity, unknown spend,
  or missing exact current action authority.
- Stop after Send without retry on unresolved action disposition, duplicate
  risk, positive/unknown spend, provider/session identity drift, or any effect
  outside the frozen envelope.

## Definition Of Done

AuraCall has a source-tested, installed, and real-LitScout-proven approval
acknowledgment state machine that distinguishes sequential exact cards within
one assistant turn while unchanged cards remain one-click fenced; the
Session-68 approval is not replayed; and all source, runtime, controller,
effect, repository, and remote evidence agrees.
