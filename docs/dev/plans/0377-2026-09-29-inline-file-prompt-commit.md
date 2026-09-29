# Inline-File Prompt Commit Verification | 0377-2026-09-29

State: OPEN
Lane: P77
Work item: ecochran76/auracall#128
Source base: `origin/main` at `00e0cfc4c1c34eba688c27419b390b82f01b7bfb`
Branch: `fix/issue-128-inline-file-commit`
Target: `main`
Integration: merge

## Stable Objective

Accept a committed ChatGPT user turn only when it faithfully represents the
exact effective prompt AuraCall submitted, including deterministic inline-file
sections, while preserving wrong-text rejection and truthful provider-effect
classification.

## Current Evidence

- Installed session `mail-wake-review-1790685771` queued and submitted the full
  10,526-character assembled prompt, opened a new `/c/...` conversation, added
  one user turn, and cleared the composer.
- Its committed-turn reader returned the requested prompt plus the inline
  `File: .../SKILL.md` section, but flattened Markdown `<br>` boundaries so
  `repository:\n- A...` became `repository:- A...`.
- The normalized expected and observed strings first diverge at character 834.
  The observed presentation also ends in one provider ellipsis.
- The verifier therefore emitted `prompt-commit-unconfirmed` with
  `hasNewTurn=true`, `composerCleared=true`, `inConversation=true`, but labeled
  the provider effect `unknown`.
- Existing focused tests pass 27/27 and do not reproduce this inline-file DOM
  presentation.

## Execution Packet

- Add one provider-free committed-turn regression matching the observed `<br>`
  list boundaries and prove it fails before the repair.
- Preserve `<br>` boundaries in committed-turn text extraction, then prove the
  assembled Markdown and rendered turn normalize identically.
- Treat only a bounded terminal presentation ellipsis as provider chrome;
  arbitrary added authored text must remain rejected.
- Classify a newly committed in-conversation user turn with a cleared composer
  as `effect_observed`, even when exact text verification still fails.
- Validate focused prompt/session tests, typecheck, scoped lint, build, diff
  hygiene, plan audit, and lane audit.

## Non-goals

- Retrying the terminal session or resubmitting its prompt.
- Weakening exact composer pre-Send verification.
- Accepting arbitrary prefixes, suffixes, truncation, or added user-authored
  text as a committed match.
- Changing connected-app selection, tab affinity, wake routing, or receipt
  publication.
- Running a live provider acceptance without a separate explicit authority
  gate.

## Acceptance Criteria

- [ ] A provider-free regression reproduces the observed inline-file
      committed-turn false negative and fails before the repair.
- [ ] `<br>` and block presentation boundaries preserve enough structure for
      the submitted effective prompt and committed turn to normalize equally.
- [ ] One bounded provider presentation ellipsis is tolerated without allowing
      unrecognized authored text.
- [ ] A new committed user turn plus cleared composer and conversation route is
      classified `effect_observed` on verification failure.
- [ ] Focused/adjacent tests, typecheck, scoped lint, build, diff hygiene, plan
      audit, and lane audit pass.
- [ ] Source changes are committed, pushed, reviewed through a linked pull
      request, and reconciled with the issue before closure.

## Stop Rules

- Do not retry session `mail-wake-review-1790685771`.
- Stop if the repair accepts any fixture containing added authored text.
- Keep installed/live acceptance separate from provider-free source proof.

