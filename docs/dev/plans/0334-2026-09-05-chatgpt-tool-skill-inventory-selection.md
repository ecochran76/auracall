# ChatGPT Tool And Skill Inventory Selection | 0334-2026-09-05

State: OPEN
Lane: P27
Operational state: IMPLEMENTING
Branch: fix/plan0334-chatgpt-tool-skill-selection
Target: main
Integration: merge
Revision: 1 | 2026-09-05

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
- Live work is limited to the already-retained `wsl-chrome-3` ChatGPT managed
  browser profile on DevTools port `45015` after exact identity and empty
  composer preflight.
- At most one non-submitting Shopping selection and cleanup, and one
  non-submitting exact-ID Skill `Try in chat` selection and cleanup.
- Zero prompts, uploads, model changes, `Answer now`, retries, or persistent
  provider mutations. Stop on identity ambiguity, CAPTCHA, ownership mismatch,
  duplicate controls, changed composer state, or unconfirmed cleanup.

## Acceptance Criteria

- [ ] A failing provider-free regression reproduces each repaired defect before
      production changes.
- [ ] Static and discovered capability reports expose durable current-drawer
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
