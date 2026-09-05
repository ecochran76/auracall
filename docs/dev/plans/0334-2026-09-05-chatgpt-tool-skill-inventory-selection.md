# ChatGPT Tool And Skill Inventory Selection | 0334-2026-09-05

State: OPEN
Lane: P27
Operational state: IMPLEMENTING
Branch: fix/plan0334-chatgpt-tool-skill-selection
Target: main
Integration: merge
Revision: 4 | 2026-09-05

## Stable Objective

Make AuraCall's ChatGPT capability inventory and selection contract match the
current authenticated composer: discover the correct root composer when other
retained ChatGPT tabs exist, represent the current tool drawer with durable
internal capability IDs, select a current drawer tool by durable identity, and
support guarded exact-account/exact-ID Skill selection without submitting a
prompt.

## Current State

- Source and installed static capability reports are byte-equivalent apart from
  generation time, but the static ChatGPT catalog has only eight broad entries.
- Direct DevTools inspection of the retained `wsl-chrome-3` managed browser
  profile observed `Add photos & files`, `Add from library`, `Create image`,
  `Web search`, `Shopping`, `Deep research`, and `Google Drive`.
- The manifest already recognizes the renamed local-file and library rows, but
  `Shopping` has no durable capability ID or known selection label.
- Installed live capability discovery chose the retained project conversation
  while requiring the ChatGPT root URL and failed before returning inventory.
- Authenticated exact-account Skill inventory is complete with stable IDs, but
  capability reporting still marks Skill invocation unknown and the Skills CLI
  has no non-submitting selection command.
- The focused pre-change contract suite passes 65/65. This proves existing
  behavior, not the missing current-drawer and Skill-selection contracts.
- Graphiti is healthy but its atlas returned no relevant AuraCall memory cloud;
  current repository, installed runtime, and DevTools evidence are authoritative.
- Provider-free implementation is green: durable Shopping and current file-row
  identities, root-composer discovery, exact-ID Skill selection/cleanup, CLI,
  feature schemas, and documentation are implemented. The affected cone passes
  250/250, typecheck/build/lint pass, and the full suite passes 3,073 tests with
  one unrelated current-main allowlist failure.
- The new worktree is not present in the current CodeGraph index, so structural
  readback used the exact changed source plus typecheck/tests as the documented
  native fallback. Live install and bounded canaries remain.
- The first installed read-only discovery chose a second root tab that had no
  visible prompt composer and exposed only a partial auth-session identity. It
  stopped before drawer inspection. Revision 2 moves capability discovery and
  Skill identity preflight to a fresh disposable root tab, waits for the visible
  composer, and permits one replacement install plus one post-repair discovery.
- The fresh disposable root also rendered the authenticated greeting without a
  prompt composer and was closed. Revision 3 qualifies retained root candidates
  by a visible composer, skips the service-preferred non-composer root, and
  permits one final replacement install and discovery attempt.
- The final aggregate discovery acquired its operation lease but did not return
  within five minutes; it was stopped without any drawer selection. Direct CDP
  survey of the qualified root then proved the current drawer rows, `6 Pro`,
  the five-position Power slider, and the older-conversation compatibility form.
- The exact-account Skill inventory is live complete at 11 `created-by-me`
  entries. The one authorized `Try in chat` canary returned `outcome-unknown`:
  its identity preflight qualified the correct root, but its later generic CDP
  attachment navigated an unrelated retained tab. That tab was restored to its
  exact original URL and both ChatGPT composers were empty with no Skill marker.
- The one Shopping canary opened the correct current drawer and produced the
  exact `Shopping` inline pill. The old proof rejected that non-plugin pill;
  direct readback recovered the exact outcome and the composer was cleared to
  zero text/zero pills. No selection click may be retried.
- Revision 4 binds the entire Skills workflow to the qualified prompt-workbench
  connection, recognizes current popover rows without a `tabindex`, treats all
  durable inline selection pills as tool state, and measures empty user content
  after excluding selection pills. It permits one safety replacement install
  plus read-only inventory/tab-preservation verification, but no further tool
  or Skill selection action.

## Scope

- Add durable ChatGPT tool capability identities for the currently observed
  drawer, including Shopping, while keeping provider labels as aliases rather
  than internal control keys.
- Make browser capability discovery deterministically bind the ChatGPT root
  composer when multiple compatible retained tabs exist.
- Preserve local upload as an attachment action, not a composer tool.
- Add guarded exact-account/exact-ID Skill selection through the existing
  Skills adapter and CLI, using ChatGPT's separate `Try in chat` action.
- Verify selection without prompt submission and clear any transient composer
  selection before returning.
- Update operator docs, journal, fixes log, roadmap, runbook, and lane catalog.

## Non-goals

- No prompt submission, Skill execution, upload, model selection, app install,
  connector authorization, or persistent tool-approval choice.
- No scheduler, completion, materialization, API-service, or unrelated browser
  profile changes.
- No attempt to infer Skill execution semantics from labels alone.

## Effect Budget

- Provider-free tests and local build/lint may run as needed.
- At most one user-runtime install after the implementation checkpoint is
  committed and pushed.
- Revision 2 permitted one replacement install after the first installed
  read-only discovery exposed the root-tab readiness defect; that allowance is
  exhausted.
- Revision 3 permits one final replacement install for retained-root composer
  qualification. No install is authorized after that gate.
- Revision 4 supersedes only the install ceiling: one final safety replacement
  is admitted for the concrete cross-tab attachment and current-pill proof
  defects found by the already-spent canaries. No install is authorized after
  that replacement.
- Live work is limited to the already-retained `wsl-chrome-3` ChatGPT managed
  browser profile on DevTools port `45015` after exact identity and empty
  composer preflight.
- At most one non-submitting Shopping selection and cleanup, and one
  non-submitting exact-ID Skill `Try in chat` selection and cleanup.
- Zero prompts, uploads, model changes, `Answer now`, retries, or persistent
  provider mutations. Stop on identity ambiguity, CAPTCHA, ownership mismatch,
  duplicate controls, changed composer state, or unconfirmed cleanup.
- The failed read-only discovery did not spend either selection canary. One
  post-repair disposable-root discovery is permitted; selection actions remain
  exactly one Shopping and one Skill attempt with no retry.
- The disposable-root failure also spent no selection action. Revision 3 admits
  one final read-only discovery through an already-observed healthy retained
  root; it does not widen either selection budget.
- The Skill `Try in chat` and Shopping selection budgets are now each exhausted.
  Their uncertain command outcomes are terminal no-retry states. Only read-only
  inventory, tab-route, empty-composer, source/install-parity, and test evidence
  may be collected after the Revision 4 install.

## Acceptance Criteria

- [x] A failing provider-free regression reproduces each repaired defect before
      production changes.
- [x] Static and discovered capability reports expose durable current-drawer
      identities, including Shopping, without treating file rows as tools.
- [ ] Live discovery chooses the root composer deterministically when a project
      conversation is also retained.
- [ ] Existing tool selection accepts a durable Shopping selector and verifies
      the exact provider label.
- [ ] `skills select` requires exact account and exact stable Skill ID, uses the
      separate `Try in chat` action, submits no prompt, and cleans up composer
      state on success and failure.
- [ ] Focused, affected, typecheck, build, lint, CodeGraph/readback, planning,
      diff-hygiene, source/install-parity, and bounded live gates pass.
- [ ] Receipt, journal, fixes log, roadmap, runbook, and lane catalog agree.

## Definition Of Done

The validated implementation is committed, pushed, installed from the exact
source checkpoint, and directly proves current tool inventory/selection plus
exact-ID Skill selection on the retained authenticated browser with no prompt
or persistent provider effect. The plan is then closed and integrated to
`main` with explicit receipts and cleanup evidence.
