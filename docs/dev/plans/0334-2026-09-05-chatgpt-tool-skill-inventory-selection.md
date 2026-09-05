# ChatGPT Tool And Skill Inventory Selection | 0334-2026-09-05

State: OPEN
Lane: P27
Operational state: VALIDATING
Branch: fix/plan0334-chatgpt-tool-skill-selection
Target: main
Integration: merge
Revision: 10 | 2026-09-05

## Stable Objective

Make AuraCall's ChatGPT capability inventory and selection contract match the
current authenticated composer: discover the correct root composer when other
retained ChatGPT tabs exist, represent the current tool drawer with durable
internal capability IDs, select a current drawer tool by durable identity, and
support guarded exact-account/exact-ID Skill selection without submitting a
prompt.

## Current State

- The original source and installed static capability reports were
  byte-equivalent apart from generation time, but the static ChatGPT catalog
  had only eight broad entries. That baseline has since been superseded by the
  Revision 9 source implementation and the still-older installed runtime.
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
- Revision 4 installed with exact source parity, and its read-only Skill list
  preserved all pre-existing routes while returning the same complete 11-item
  inventory. Foreground inspection then proved that background layout suppresses
  the healthy root composer's geometry: the greeting-only root has no editor,
  while the healthy root exposes it immediately after `Page.bringToFront`.
  Revision 5 foregrounds each retained candidate before visibility proof and
  permits one final corrective install plus the same read-only checks only.
- Revision 5 is pushed and installed with byte-identical adapter, Skills, and
  composer-tool modules. Installed live capability discovery now returns in
  under ten seconds with 29 entries, including available durable Shopping,
  local-upload, library, web-search, deep-research, and model-selector IDs.
  Installed exact-account Skill listing again returns all 11 entries, preserves
  every route, and leaves the qualified root at zero user text/zero pills.
- The remaining acceptance gate is a fresh exact-ID Skill-selection canary.
  Because the already-dispatched canary is terminal `outcome-unknown` and the
  plan's one-click budget is exhausted, that requires explicit new operator
  authority; it cannot be inferred from the successful read-only checks.
- A final no-click DevTools audit opened the exact Skill detail route and found
  exactly one visible `Try in chat` control. It is a plain button with no link,
  test ID, or Skill-bearing parent, so neither route presence nor inventory can
  prove the button's composer-selection effect. The exact home route was
  restored at zero user text/zero pills and project focus was preserved.
- The operator's explicit `ok go` authorizes exactly one fresh installed
  exact-ID Skill-selection and cleanup canary under Revision 6. This supersedes
  only the exhausted Skill-click ceiling; it authorizes no prompt, upload,
  model change, Skill execution, `Answer now`, install, or retry.
- Revision 6 dispatched exactly one installed `Try in chat` activation. Chrome
  history proves the exact Skill-bound route, then a provider-authored example
  prompt route, then restoration of the original home route. Both composers
  finish at zero user text/zero pills, with no conversation or submission.
  The CLI result filter emitted no accepted JSON because the installed proof
  treated provider-prefilled text as user content; the terminal live result is
  `outcome-unknown`, and no retry is permitted.
- Revision 7 repairs that observed proof drift provider-free. Selection now
  distinguishes an exact decoded provider `prompt` parameter from user-authored
  text while still requiring the exact Skill marker/route, and it independently
  captures a pill-free empty original composer before any navigation. The new
  red regression failed on the absent classification. The affected cone passes
  246/246 with typecheck, build, and touched-file lint. The comprehensive lane
  passes 3,081 tests with the known raw-CDP allowlist failure plus one 30 ms
  timing assertion that passed its single focused rerun. No install or live
  action is admitted.
- The comprehensive-run browser census kept Chrome PID `1933` and the exact
  project conversation, but the previously qualified home target disappeared
  while a new greeting-only home target appeared. Foregrounding that exact new
  target still exposed no prompt editor. This is test-isolation/browser-state
  drift and blocks another Skill canary independently of the install gate.
- Revision 7 source, tests, contracts, and the inconclusive live receipt are
  published at checkpoint `b5ceb8837e40e1866029b8e52eeadd046b2e31ec`.
- A follow-up read-only CDP survey disproved the greeting-only diagnosis for
  both current home targets: each has one visible, empty
  `textarea[name="prompt-textarea"]`, but no longer has the legacy
  `#prompt-textarea` ID. Revision 8 makes prompt-workbench qualification and
  Skill preflight/proof/cleanup accept both exact provider shapes. The affected
  cone remains 246/246 with typecheck, build, lint, and diff hygiene passing;
  the new source pristine-composer probe returns true on both retained home
  targets. Source is published at checkpoint `aa461805` and remains uninstalled.
- Revision 9 closes the remaining provider-free drawer-proof drift found in the
  source audit. Capability discovery and its direct drawer probe now accept
  current `.__menu-item` rows without requiring `tabindex`; selected tool/app
  pills are read from the exact composer form instead of assuming they are
  children of the prompt editor; and local-upload qualification recognizes the
  current named textarea. The affected cone passes 247/247 with typecheck,
  build, lint, and diff hygiene; checkpoint `138ec354` remains uninstalled.
- Integration-readiness reconciliation against freshly fetched `origin/main`
  reports zero commits behind, 18 ahead, and no merge conflict. The exact-branch
  lane audit still fails P27 as `unregistered_active` because its catalog entry
  exists only on this topic branch and has not reached canonical `main`; other
  reported lane problems predate and are outside Plan 0334. The bounded receipt
  is `docs/dev/notes/2026-09-05-plan0334-integration-readiness.json`.
- Draft PR [#1](https://github.com/ecochran76/auracall/pull/1) now exposes the
  complete topic branch and P27 proposal for review. It is explicitly
  non-mergeable until exact-source installation, one newly authorized
  non-submitting Skill canary, receipt reconciliation, and plan closure pass.
- GitHub reports the PR mergeable and clean, but CI is not merely pending: the
  exact head has zero check suites and zero commit statuses after three bounded
  polls. Repository Actions is enabled and the active CI workflow declares a
  `pull_request` trigger for `main`, so CI dispatch itself remains unresolved.
- Read-only SHA-256 parity inspection now proves that the installed
  `chatgptComposerTool.js`, `chatgptAdapter.js`, and `chatgptSkills.js` bundles
  each differ from the Revision 9 production build. GitHub's repository API
  separately confirms Actions is enabled with all actions allowed, default
  workflow write permission, and active workflow `CI`; repository events show
  both the PR-open and branch-push deliveries without any resulting run. The
  remaining installation and live canary gates therefore cannot be represented
  as already satisfied, and CI remains `not_dispatched` at the platform edge.
- The newly authorized Revision 9 install reached exact three-module parity,
  but its pre-selection `skills list` failed closed before inventory because
  ChatGPT's current `/api/auth/session` response omitted email and account
  qualifiers. The exact `script#client-bootstrap[type="application/json"]`
  retained complete `authStatus=logged_in` session identity. Revision 10
  projects only user/account identity fields from that bootstrap, merges them
  beneath endpoint fields, and never returns its access token. Red/green
  coverage plus the affected 238-test cone, typecheck, build, lint, and diff
  hygiene pass. No Skill selection was dispatched, so the authorized one-click
  canary remains available after one corrective exact-source install.
- Revision 10 is installed with exact adapter parity and its read-only preflight
  passes exact-account authorization. Skill inventory then failed closed because
  automated navigation to both the canonical `/skills` editor and the separate
  `/plugins` browser reached ChatGPT's domain-filter block page. The current
  public route manifest still declares `skills/editor/:hazelnutId?` and the
  `/backend-api/hazelnuts` family, so no speculative route migration was made.
  The block-page target was closed; the healthy home and SoyLei project remain
  at zero text/zero pills with project focus restored. No `Try in chat` action
  occurred, and the live hard-stop receipt is
  `docs/dev/notes/2026-09-05-plan0334-revision10-live-hard-stop.json`.

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
- Revision 5 supersedes that ceiling only for the background-geometry defect
  discovered by the required post-install read-only verification. One final
  corrective install is admitted; no later install or selection action is
  authorized by this plan.
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
- Revision 6 supersedes only the exhausted Skill-selection ceiling after fresh
  explicit operator authority. It admits one installed exact-ID `skills select`
  attempt with exact-account and empty-composer preflight, observed selection,
  exact cleanup, and route restoration. Its outcome is terminal; no second
  activation, prompt, upload, model change, Skill execution, `Answer now`, or
  install is authorized.
- Revision 7 admits provider-free source, test, and documentation repair for the
  exact provider-prefill mismatch exposed by the terminal Revision 6 attempt.
  It authorizes no install, browser navigation, selection, prompt, upload,
  model change, Skill execution, `Answer now`, or retry.
- Revision 8 admits only provider-free source, tests, documentation, and
  read-only DOM/accessibility inspection for the current named-textarea
  composer shape. It authorizes no install, browser navigation, selection,
  prompt, upload, model change, Skill execution, `Answer now`, or retry.
- Revision 9 admits the same provider-free and read-only envelope for current
  drawer-row, composer-scoped pill, and local-upload qualification repair. It
  authorizes no install, browser interaction, selection, prompt, upload, model
  change, Skill execution, `Answer now`, or retry.
- The operator's fresh `ok go` authorizes exact-source installation and one
  bounded non-submitting exact-ID Skill canary. Revision 10 uses the ordinary
  in-envelope repair/retest path after the first installed read-only inventory
  exposed reduced auth-session evidence: one corrective install is admitted,
  followed by read-only exact-account inventory and at most one Skill selection
  activation. Zero prompts, uploads, model changes, `Answer now`, or selection
  retries remain mandatory.

## Acceptance Criteria

- [x] A failing provider-free regression reproduces each repaired defect before
      production changes.
- [x] Static and discovered capability reports expose durable current-drawer
      identities, including Shopping, without treating file rows as tools.
- [x] Live discovery chooses the root composer deterministically when a project
      conversation is also retained.
- [x] Existing tool selection accepts a durable Shopping selector and verifies
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
