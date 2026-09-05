# Installed Durable Model Survey | 0333-2026-09-05

State: OPEN
Lane: P26
Operational state: AUTHORIZED_INSTALL_AND_READ_ONLY_SURVEY
Branch: ops/plan0333-installed-model-survey
Target: main
Integration: merge
Revision: 3 | 2026-09-05

## Stable Objective

Install the integrated durable model schema from exact current `origin/main`,
prove the installed runtime contains that schema, and manually survey the
already-retained `wsl-chrome-3` ChatGPT surface through its Chrome developer
port for the current composer tool drawer, upload input, model-family picker,
horizontal Power slider, and the distinct older-model conversation surface.

## Current State

- Plan 0332 is integrated at `fedc2d70` and provider-free accepted.
- The installed user runtime still records Plan 0331's checkout and install
  time, so installation of the durable schema is not yet proven.
- The retained `wsl-chrome-3` managed browser profile is currently represented
  by Chrome PID `1933` on fixed DevTools port `45015`; this must be revalidated
  immediately before attachment.
- Graphiti was healthy but supplied only stale routing leads; current process,
  runtime metadata, and direct DevTools readback remain authoritative.
- The first install proved the integrated catalog byte-for-byte, then live
  closeout auditing found the handoff CLI help and current smoke scripts still
  advertised legacy selectors. A red CLI-help regression reproduced the gap;
  the repair now uses durable selectors throughout current operational code.

## Scope

- Install once from this clean worktree at exact current `origin/main`.
- Verify wrapper/runtime metadata and installed durable-schema bytes.
- Attach read-only to the existing `wsl-chrome-3` browser profile on port
  `45015`; do not launch, navigate, reload, or close Chrome.
- Inspect the active composer and one older-model chat, opening only transient
  menu/drawer surfaces needed to enumerate their controls.
- Record exact model labels, slider labels/positions, tool/upload controls,
  account/blocking state, and post-survey browser/process invariants.

## Effect Budget

- At most two `pnpm run install:user-runtime` invocations: the first integrated
  install exposed the post-install help gap; one replacement install is allowed
  only after the corrective source checkpoint is validated and pushed.
- At most three read-only navigations in the otherwise unused ChatGPT home tab
  to existing conversations already listed by that attached page, followed by
  restoration to the home URL. This is permitted only to locate one genuine
  older-model surface after both pre-opened conversations proved current-model.
- Zero API-service restarts, prompts, uploads, model selections, conversation
  mutations, browser launches, reloads, or closes.
- No `Answer now`, scheduler, completion, materialization, or provider-tool
  action.
- Transient opening and dismissal of existing composer menus is permitted only
  for this manual survey and must not change selected state.
- Stop on identity ambiguity, CAPTCHA/human verification, ownership mismatch,
  missing composer separation, or any changed pre-click state.

## Acceptance Criteria

- [ ] Exact source and remote-main commit agree before installation.
- [ ] Installed metadata names this clean worktree and a fresh install time.
- [ ] Installed code advertises the six durable ChatGPT selectors and maps
      `openai:frontier` to `gpt-6-astra`.
- [ ] Handoff help and current operational smoke scripts use durable selectors;
      versioned provider IDs remain only in compatibility/provider contracts.
- [ ] Exact retained Chrome PID/port/profile ownership is proven before and
      after the survey.
- [ ] The active composer tool drawer and upload input are observed without an
      upload.
- [ ] The current model-family picker and horizontal Power slider are observed
      without changing their checked values.
- [ ] One older-model conversation is compared and its different model surface
      is recorded without selecting a model or retry action.
- [ ] All visible composers remain empty and no prompt/provider action occurs.
- [ ] Receipt, journal, roadmap, runbook, and active-lane state agree.

## Definition of Done

The exact integrated revision is installed and directly read back, the
retained browser survey produces bounded source-backed evidence for both
current and older-model ChatGPT surfaces, no persistent provider state changes,
and the plan is closed with its receipt committed, pushed, and integrated.
