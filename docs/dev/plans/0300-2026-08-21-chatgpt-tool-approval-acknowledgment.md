# ChatGPT Tool-Approval Acknowledgment | 0300-2026-08-21

State: OPEN
Lane: P01
Operational state: P0 DIAGNOSIS AND RED CONTRACT

## Stable Objective

Make AuraCall reliably continue ChatGPT/LitScout runs when an exact configured
tool-approval click has taken effect but ChatGPT retains the original approval
surface, without double-clicking, treating arbitrary assistant text as proof,
weakening exact-action matching, or replaying a durable LitScout action.

## Current State

- Plan 0299 is closed, pushed, installed byte-exact, and live-proven for Chat
  and Work mode semantics. Its classifier repair is not implicated.
- LitScout Plan 0434 used that installed runtime for one exact Chat/Sol High/
  `allow-once` submission. AuraCall clicked the approval and stopped with
  `chatgpt-tool-approval-not-confirmed` because the surface did not disappear.
- LitScout independently proves that click took effect: Session 68 receipt
  `rar_a67995bf6d112868a4afd5968ac83b06` succeeded `approve_enrichment` and
  wrote approved plan `rep_08cd75bbf4313f4c3b0077dcdf8a729f` for one
  zero-positive-spend full-text attempt on Work `2897`, with zero approval-time
  provider calls.
- The requested AuraCall output is absent. Enrichment execution, Analyze,
  evidence synthesis, and claim/citation audit did not run. The exact resumable
  boundary is fresh authenticated `research_continue`; approval replay is
  prohibited.
- CodeGraph localizes the failure to
  `createChatgptToolApprovalHandler(...)`: after one fenced trusted click it
  accepts only surface disappearance or replacement. Its caller already runs
  inside assistant-response polling, but the handler has no positive
  post-click acknowledgment input beyond the approval probe itself.

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
   symptom: the clicked approval fingerprint remains visible while independent
   positive ChatGPT response/tool progress proves the click was accepted.
3. Generate and test ranked falsifiable hypotheses against the RED seam and,
   if needed, bounded read-only DOM evidence from the retained conversation.
4. Implement the smallest provider-owned acknowledgment state machine. It must
   accept only explicit positive post-click progress, retain disappearance or
   replacement success, and leave an unchanged surface without progress as a
   fenced terminal error.
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
- No DOM disappearance bypass based only on elapsed time, pointer dispatch,
  arbitrary assistant text, or an unbound external receipt.
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

- `TAA-R1`: a fast deterministic regression goes RED on the exact persisted-
  surface/positive-progress case and GREEN only after the repair.
- `TAA-R2`: disappearance and new-fingerprint acknowledgment still succeed;
  unchanged surface without positive progress still errors after one click.
- `TAA-R3`: manual, ambiguity, pre-click drift, one-attempt fencing, repeated
  legitimate approvals, exact paired labels, and `Answer now` exclusion pass.
- `TAA-R4`: acknowledgment evidence is post-click, target-local, monotonic, and
  stronger than arbitrary text or time; no LitScout-specific receipt logic is
  embedded in AuraCall.
- `TAA-R5`: focused/affected/full provider-free tests, typecheck, build, scoped
  lint, CodeGraph, plan audit, and diff hygiene pass on the pushed source.
- `TAA-R6`: installed affected artifacts are byte-exact with pushed source and
  AuraCall API plus managed-browser ownership recover healthy after install.
- `TAA-R7`: one real LitScout run proves the installed handler can continue
  past a retained approval surface or the live surface disappears normally;
  the test returns a terminal response and durable receipt reconciliation with
  zero duplicate clicks, retries, or completed-action replay.
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
acknowledgment state machine that continues after positively proven post-click
progress even when the old approval DOM persists, while unchanged ambiguous
surfaces remain one-click fenced; the Session-68 approval is not replayed; and
all source, runtime, controller, effect, repository, and remote evidence agrees.
