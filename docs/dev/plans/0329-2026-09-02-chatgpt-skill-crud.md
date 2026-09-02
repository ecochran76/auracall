# ChatGPT Skill CRUD | 0329-2026-09-02

State: OPEN
Lane: P22
Operational state: CREATE_PRESUBMIT_REPAIR_ACCEPTED_REINSTALL_READY
Branch: feat/plan0329-chatgpt-skill-crud
Target: main
Integration: merge
Revision: 4 | 2026-09-02

## Stable Objective

Implement and prove exact-account, exact-ID ChatGPT Skill create, read, update,
and delete through AuraCall, using one disposable deterministic canary skill
and leaving no provider artifact behind.

## Current State

- Plan 0327 accepted the read-only lifecycle contract and observed separate
  `/skills` inventory/detail surfaces, stable 32-hex skill IDs, installed and
  created-by-me groups, owner/file-tree/review fields, a create control, and a
  separate `Try in chat` action. It authorized no mutation.
- Plan 0328 is integrated and installed/live accepted; long observation expiry
  and exact reattachment no longer gate this lane.
- The unfinished P16 developer-app submit lane is preserved. P22 may share CLI
  registration and generic browser primitives, but must not edit or borrow
  developer-app identity/lifecycle semantics without explicit reconciliation.
- Exact-account read-only discovery observed the separate editor route, name
  and description fields, CodeMirror `SKILL.md`, disabled-until-valid Create,
  Upload, and Back surfaces. It submitted nothing and restored the original
  three-tab browser state.
- Provider-free exact-ID list/show/create/update/delete is implemented in a
  separate Skill adapter and CLI module. Mutations require expected account,
  explicit confirmation, complete inventory, and fresh hash/absence readback;
  update additionally requires the exact prior content hash.
- The first installed list stopped before mutation because the current root
  cards omit `skill_id` anchors. Bounded read-only inspection proved the page
  loads separate authenticated installed/created `hazelnuts` inventories;
  capture now binds only complete successful responses and gives created
  ownership precedence for overlapping IDs.
- The focused and adjacent packet passes 33 tests plus typecheck, production
  build, scoped zero-warning lint, diff hygiene, and a 328-candidate zero-error
  plan audit for the first checkpoint. The inventory repair passes focused
  tests, typecheck, scoped lint, and diff hygiene; rebuild/reinstall and the
  single zero-retry disposable CRUD canary remain.
- Reinstalled inventory readback is complete. The first create command stopped
  before submit when the trusted-pointer click listener lost its ephemeral
  activation receipt during the menu render. The exact visible Create-menu
  postcondition is now authoritative after the trusted CDP pointer dispatch;
  no provider mutation or canary artifact occurred. Focused tests, typecheck,
  build, scoped lint, and diff hygiene pass for the repair.

## Execution Graph

1. Inspect the authenticated create surface read-only on exact AuraCall runtime
   and browser profile `wsl-chrome-3`; open and close only, with no upload or
   submit.
2. Freeze minimal private/redacted fixtures and implement `skills list/show`
   with exact account, stable ID, lifecycle state, owner, and file inventory.
3. Implement guarded `skills create/update/delete` with explicit confirmation,
   exact source hash, exact-ID targeting, optimistic update precondition, and
   fresh postcondition readback. Never target a mutation by name alone.
4. Run provider-free TDD, affected suites, typecheck, build, scoped lint, plan
   audit, and diff hygiene; reconcile any `bin/auracall.ts` overlap with P16.
5. Commit and publish before one runtime install. Prove byte parity without API
   restart or managed-browser ownership change.
6. Create one uniquely named disposable skill from a deterministic minimal
   bundle, read it back by returned ID, update it once to a second known hash,
   read it back again, then delete that exact ID and prove absence.
7. Preserve the transferred Chrome process, release all operation locks, and
   close the lane only when no canary skill remains.

## Acceptance Criteria

- `SCR-R1`: list/show distinguish installed, created-by-me, review, and unknown
  fields without inferring version or enabled state the provider does not show.
- `SCR-R2`: duplicate names remain readable but every mutation requires a
  stable exact skill ID after creation; expected-account mismatch and
  incomplete inventory fail before mutation.
- `SCR-R3`: create binds the exact input bundle hash to one fresh stable ID and
  a complete postcondition readback; uncertain submission is never retried.
- `SCR-R4`: update requires the exact observed ID and expected prior content
  hash, proves the new file/content hash, and records a recoverable partial
  state if the provider exposes replacement rather than in-place semantics.
- `SCR-R5`: delete requires explicit confirmation and exact ID, then proves
  absence from a fresh complete inventory/detail readback.
- `SCR-R6`: installed/live proof performs at most one create, one update, and
  one delete on the disposable canary, with zero invocation/prompt Send and no
  residual skill, lock, service restart, or browser ownership change.

## Bounds

- One read-only create-surface inspection, one deterministic canary skill, one
  create, one update, one delete, and zero mutation retries.
- Opening and closing a dialog is discovery, not mutation; no upload occurs
  until provider-free contracts and exact account identity pass.
- Never click `Try in chat` or `Answer now`; never send a prompt or invoke a
  skill in this lane.
- CAPTCHA, MFA, identity ambiguity, missing stable ID, incomplete inventory,
  uncertain mutation outcome, or unexpected confirmation/review gates are hard
  stops. Preserve any exact recoverable artifact and report the unblocker.
- No scheduler, completion, materialization, developer-app, OAuth, API restart,
  or unrelated browser/process mutation.

## Definition Of Done

All six criteria have provider-free and installed/live evidence, the temporary
skill is proven absent, exact process/lock cleanup is recorded, P16 overlap is
reconciled, and the accepted lane is integrated.
