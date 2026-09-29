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
- Source commit `5dc24ca8941ed22875cf01e1fb731a471ebc7a55` now preserves
  `<br>` boundaries, normalizes one terminal presentation ellipsis, and reports
  committed-but-unverified turns with truthful effect state and error wording.
- Self-review commit `5109272d23018006843d0c26c23a20f0acef082f`
  confines ellipsis equivalence to post-Send committed-turn verification;
  pre-Send composer equality remains exact and rejects the same extra glyph.

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

- [x] A provider-free regression reproduces the observed inline-file
      committed-turn false negative and fails before the repair.
- [x] `<br>` and block presentation boundaries preserve enough structure for
      the submitted effective prompt and committed turn to normalize equally.
- [x] One bounded provider presentation ellipsis is tolerated without allowing
      unrecognized authored text.
- [x] A new committed user turn plus cleared composer and conversation route is
      classified `effect_observed` on verification failure.
- [x] Focused/adjacent tests, typecheck, scoped lint, build, diff hygiene, and
      plan audit pass; the P77 lane adds no new finding to the repo-wide lane
      audit's pre-existing unrelated debt.
- [ ] Source changes are committed, pushed, reviewed through a linked pull
      request, and reconciled with the issue before closure.

## Stop Rules

- Do not retry session `mail-wake-review-1790685771`.
- Stop if the repair accepts any fixture containing added authored text.
- Keep installed/live acceptance separate from provider-free source proof.

## Provider-Free Validation

- The `<br>` regression failed before the repair with
  `Observed evidence:- First result- Second result` and passed afterward.
- The bounded terminal-ellipsis regression failed before normalization and
  passed afterward; authored suffix text remains rejected.
- Focused and adjacent browser tests: 57/57 passed.
- `pnpm typecheck`: passed.
- Scoped Biome check: passed with only the pre-existing exported `__test__`
  naming warning and three pre-existing informational suggestions.
- `pnpm build`: passed.
- Plan-library audit: 376 candidates, 0 validation errors.
- The repo-wide active-lane audit remains non-green on pre-existing lanes; its
  reported problems contain no P77 finding.
