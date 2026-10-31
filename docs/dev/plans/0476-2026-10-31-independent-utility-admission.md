# Utility parent settlement diagnosis

State: CLOSED
Lane: P476

## Current State

Source repair qualified on clean current-main base at c5351194282e2c90555aec7c17ddb5dadfec9072. Utility settlement counted its own active read parent as an unfinished request when backend budgeting was enabled, poisoning the lease and causing the next sequential call's exact process-owned refusal. Closing the parent before request reconciliation fixes it. Eight affected files/181tests pass; full typecheck and scoped lint pass. See docs/dev/notes/2026-10-31-utility-parent-settlement.md. No runtime installation or OAuth action; existing uncertain live leases remain fenced. Original source checkout/other worktrees untouched. Finite source diagnosis/repair complete; main integration and runtime rollout are separate.

## Scope and non-goals

Repair only the false self-fence in configured utility settlement. Preserve actual unknown effects, pending requests, warnings, identity and existing one-utility-tab-per-process contract. No live prompt, OAuth action, browser restart, lock clearance, grant mutation, runtime installation, broad review or unrelated Grok work. Existing poisoned live leases are not cleared automatically.

## Feedback loop

`pnpm vitest run tests/browser/utilityParentSettlement.test.ts --maxWorkers=1`

Valid RED before repair: budget-off and real-pending controls pass; budget-on and completed-backend-read cases fail with Live-follow crawler lease acquisition failed: process-owned. Total1.89s,23ms body. The only difference in the first pair is explicit request budgeting. Corrected local test setup errors are retained in private logs and not counted as product RED. Initial independent-two-utility expectation was rejected after checking the explicit one-utility-per-process contract; its fixture was removed. It does not justify weakening ownership.

## Hypotheses and evidence

Initial process-alias/census/claim-revision hypotheses were tested against a provisional two-caller fixture and rejected as a product-defect basis. Retained exact helper metadata instead shows an unknown read-only parent and no separate backend-request rows. Ranked follow-up: self-parent misclassification, missing request trace, cancellation race. A single-caller/no-browser/no-timeout/no-network differential reproduces the exact refusal only with backend budgeting, eliminating the latter requirements. A retained unknown-vs-settled state control separately confirms that the existing refusal is a deliberate fence.

An initial shared-authority filter made focused tests green but broke five active-action safety tests. Rejected and completely reverted. Final repair moves the existing utility governor close before request reconciliation; shared authority and registry admission rules are unchanged. Regression cases cover budget off/on, completed requests and genuinely unfinished requests. No debug instrumentation added to production.

## Validation and done

Original minimized budgeted reproduction must pass, plus affected ownership/request/coexistence tests, full typecheck and scoped lint. Bind results to a clean main-based branch and publish source custody. Update CONTEXT, testing guide, dev journal/fixes log and roadmap/runbook. Keep actual installed/native/OAuth boundaries explicit. Source qualification does not clear prior unknown leases or establish native reauthorization. Main integration/runtime cutover remain separate.

## Closeout evidence

Source-only plan closes after181affectedtests, full typecheck, scoped lint and diff checks. Main-library audit retains69exact baseline findings, verified against a clean origin/main archive; no new plan finding. Renamed0475→0476 because current main already uses0475; investigation/failure history is unchanged. See the diagnosis note for commands, rejected candidate fix, cleanup and source/installed/live boundaries.
