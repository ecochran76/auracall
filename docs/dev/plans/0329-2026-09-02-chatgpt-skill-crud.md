# ChatGPT Skill CRUD | 0329-2026-09-02

State: OPEN
Lane: P22
Operational state: LIVE_RESUMED_UPDATE_DELETE_READY
Branch: feat/plan0329-chatgpt-skill-crud
Target: main
Integration: merge
Revision: 9 | 2026-09-02

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
- The next create attempt reached the editor and stopped before submit because
  CodeMirror exposes newline-separated `.cm-line` elements whose parent
  `textContent` concatenates lines. A disposable no-submit draft proved all
  fields accepted and Create enabled. Line-aware readback now preserves exact
  source hashing, and post-dispatch submit/confirm loss proceeds only to exact
  postcondition observation or terminal `outcome-unknown`.
- The one authorized Create was dispatched and returned `outcome-unknown`
  because ChatGPT saved to the newly observed `/skills/editor/<32-hex-id>`
  route rather than the expected query-detail route. Read-only inspection
  proves exactly one recoverable canary with the expected v1 fields and stable
  ID. Per the lane hard stop, Create was not retried and update/delete did not
  run; the exact editor is intentionally preserved for operator adjudication.
- The provider-free route contract now accepts both observed exact detail and
  saved-editor routes, and inventory capture navigates from an editor to the
  root before waiting for both scopes. The repair passes 33 tests, typecheck,
  build, scoped lint, and diff hygiene but is not reinstalled or used to mutate
  the preserved canary in this turn.
- P16 reconciliation is complete at the semantic level. Its only
  `bin/auracall.ts` delta adds `--wait-for-response`, `--timeout-ms`, and
  `--tool-approval` to the existing developer-app `apps test` command; P22 adds
  the separate `skills` command and modules. The branches textually conflict
  because both insert near the same CLI region, so integration must preserve
  both blocks, with P16 rebased or manually resolved after P22 reaches `main`.
  No P16 code, branch, worktree, or authority was changed by this audit.
- The operator adjudicated the recovered exact-ID artifact as the successful
  one authorized Create and authorized resumption on that same canary. No
  second Create is permitted or needed.
- Read-only retained-surface inspection observed that the saved editor's
  `More` menu contains only `Download`, while the exact skill's `Created by
  me` card menu contains `Chat`, `Edit`, `Download`, `Uninstall`, and `Delete`.
  The final adapter therefore updates through the exact editor route and
  deletes only after a fresh complete API inventory binds the requested ID and
  name to one exact `Created by me` card. Delete menu and confirmation presses
  use trusted pointers, and both query-detail and editor-route identities must
  be absent before the navigation postcondition can pass.
- The resumed provider-free repair passes 12 directly affected tests,
  typecheck, production build, scoped zero-warning lint, diff hygiene, and the
  328-candidate zero-error plan audit. Commit/publish, one runtime install, and
  the one update/read/delete/absence live sequence remain.
- The first resumed installed `show` failed closed before mutation because the
  query-detail surface did not become a reliable programmatic source readback
  in the retained tab. The exact saved-editor route still exposed the stable
  ID, name, description, and newline-preserving `SKILL.md`; readback now uses
  that exact-ID editor directly. The repair again passes the 33-test packet,
  typecheck, production build, scoped lint, and diff hygiene. One corrective
  reinstall is required before the canary may proceed; no update or delete has
  been dispatched.
- Workspace-runtime readback localized the remaining failure to an invalid
  generated browser expression: the TypeScript template converted the intended
  CodeMirror `join('\\n')` delimiter into a literal newline inside a JavaScript
  string. Escaping the generated delimiter restored exact readback of v1 hash
  `542533651dddbac3a44de8de44b398f498c686212df40b5542f448351823547d`.
  A new executable-expression regression freezes the boundary; 34 focused and
  adjacent tests, typecheck, production build, scoped lint, and diff hygiene
  pass. The canary remains unchanged and no mutation has been dispatched.

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
