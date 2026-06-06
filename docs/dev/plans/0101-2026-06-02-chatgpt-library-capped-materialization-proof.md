# ChatGPT Library Capped Materialization Proof Plan | 0101-2026-06-02

State: CLOSED
Lane: P01

## Purpose

Move ChatGPT account-library materialization from corrected preview evidence to
bounded installed proof without enabling broad automatic live-follow queueing.
Plan 0100 closed with account-library catch-up in `preview_only` mode. The
follow-up Library eligibility correction proved that ChatGPT Library rows with
real download authority are not metadata-only: installed catalog readback now
shows route-authorized `chatgpt-library-file-row-click` rows with
`eligibility=null`, and `/status` reports selected preview candidates. Plan
0101 finishes the next safe slice: clear the browser-health gate, run capped
operator materialization against the selected candidates, prove archive
idempotence, then decide whether live follow stays preview-only or can move to
a more permissive mode in a later plan.

## Current State

- Plan 0100 is closed and installed `chatgpt/wsl-chrome-3` remains configured
  as account-library `preview_only`.
- The installed runtime/API service has the Library eligibility correction:
  - stable-hash/title-only Library rows remain
    `unsupported_account_library_asset`;
  - route-authorized Library rows with `providerFileId`,
    `chatgpt://file/...`, or
    `materializationSurface=chatgpt-library-file-row-click` remain eligible.
- Installed catalog proof after the correction:
  - Mason's route-authorized Library row
    `d4670fc4-15d9-5ca7-b48f-026a8e33f87a` has
    `remoteUrl=chatgpt://file/file_00000000730071fbaf48666ad6bf5ca3`,
    `providerFileId=file_00000000730071fbaf48666ad6bf5ca3`,
    `materializationSurface=chatgpt-library-file-row-click`, and
    `eligibility=null`;
  - stable-hash duplicate row
    `d7e7b360-4a37-5d81-9293-ffaf1c94e05a` still reports
    `unsupported_account_library_asset`;
  - installed catalog reports `24` route-authorized
    `chatgpt-library-file-row-click` rows without unsupported eligibility.
- Installed `/status` for `chatgpt/wsl-chrome-3` now reports:
  - `mode=preview_only`;
  - `activeJobCount=0`;
  - `eligibleCandidates=26`;
  - `selectedCandidates=3`;
  - `archivedFamilies=8`;
  - `unresolvedStale=11`;
  - `unsupportedOrTerminal=12`;
  - `duplicateFamilies=3`.
- Browser-health blocker is cleared in the installed runtime: the launch
  command may still include `about:blank` as a Chrome startup argument, but
  catch-up is blocked only when an actual blank page target remains or DevTools
  health fails. Installed `/status` now reports
  `browserHealth.status=observed`, `launchCommandHasBlankArg=true`,
  `openBlankPageCount=0`, and `reason=null`.

## Scope

- Clear or repair the `chatgpt/wsl-chrome-3` browser-health gate without
  changing the retired frontend.
- Keep account-library live follow in `preview_only`; do not enable automatic
  scheduler queueing in this plan.
- Run bounded operator account-library materialization proof using the same
  selector shown in `/status` preview.
- Prove installed materialization for:
  - one `maxItems=1` pass;
  - one `maxItems=3` pass only if the first pass is clean.
- Verify archive/search asset availability, family skip behavior, active-job
  drain, and no duplicate re-downloads.
- Record the final operating decision and exact proof in roadmap/runbook/dev
  journal.

## Non-Goals

- Do not run broad multi-tenant catch-up.
- Do not enable automatic account-library live-follow queueing.
- Do not raise conversation-history materialization caps.
- Do not route account-library rows through conversation-history recovery.
- Do not touch or patch the retired frontend.
- Do not use ChatGPT model selector, feature signature, or unrelated provider
  controls during read-only proof or materialization.
- Do not retry indefinitely if provider guard, identity mismatch, browser
  health, or active-job gates block the run.

## Work Tracks

### Track 1 | Browser-Health Gate Clearance

Status: completed.

- Inspect installed `/status` browser-health readback for
  `chatgpt/wsl-chrome-3`.
- Identify why the managed browser launch command includes an `about:blank`
  argument:
  - stale process from previous proof;
  - browser-service launch args;
  - profile/session startup state;
  - leftover tab target.
- Clear or restart only the affected managed browser profile, preserving
  account/session state.
- Re-read `/status` and require:
  - `browserHealth.status=idle` or another non-blocking state;
  - no actual blank page target remains;
  - `activeJobCount=0`;
  - preview still reports selected candidates.
- Stop if provider guard, CAPTCHA, identity mismatch, or browser service
  instability appears.

Acceptance evidence:

- Exact `/status` readback before and after clearance.
- No account-library materialization job is created during clearance.
- Active account-library jobs remain `0`.

Result:

- Before repair, installed `/status` reported
  `browserHealth.status=blocked`, reason
  `managed browser was launched with an about:blank argument`,
  `launchCommandHasBlankArg=true`, `openBlankPageCount=0`, and
  `activeJobCount=0`.
- After repair/install/restart, installed `/status` reported
  `browserHealth.status=observed`, `reason=null`, `processAlive=true`,
  `devToolsResponsive=true`, `launchCommandHasBlankArg=true`,
  `openBlankPageCount=0`, `pageTargetCount=1`, `pid=6908`, `port=45015`,
  `mode=preview_only`, and `activeJobCount=0`.

### Track 2 | Candidate Snapshot And Proof Budget

Status: completed.

- Capture the installed preview candidate snapshot immediately before proof.
- Record:
  - `catalogFiles`;
  - `eligibleCandidates`;
  - `selectedCandidates`;
  - archived/unresolved/unsupported/duplicate counts;
  - selected candidate ids, names, provider file ids, and family signatures if
    available from job/result readback.
- Confirm the first proof budget is `maxItems=1` and the second budget is
  `maxItems=3`.
- Confirm `force=false` so archived-family skip is active.

Acceptance evidence:

- Preview readback still selects candidates under the same selector used by
  account-library materialization.
- No candidate is stable-hash/title-only without routeable file authority.

Result:

- Pre-proof installed `/status` readback:
  `catalogFiles=60`, `eligibleCandidates=26`, `selectedCandidates=3`,
  `archivedFamilies=8`, `unresolvedStale=11`,
  `unsupportedOrTerminal=12`, `duplicateFamilies=3`, `activeJobCount=0`.
- First post-materialization preview advanced to `eligibleCandidates=25` and
  `archivedFamilies=9`.
- Replay/second single-item pass advanced to `eligibleCandidates=24` and
  `archivedFamilies=10`.

### Track 3 | Capped Operator Materialization Proof

Status: completed.

- Run one installed account-library reconciliation job for
  `chatgpt/wsl-chrome-3` with:
  - `provider=chatgpt`;
  - `runtimeProfile=wsl-chrome-3`;
  - `assetSource=account-library`;
  - `assetKinds=[files]`;
  - `maxItems=1`;
  - `force=false`;
  - configured provider-work timeout.
- Wait for terminal job state and record:
  - job id;
  - terminal status;
  - metrics;
  - per-entry status;
  - archive item ids;
  - asset routes;
  - local paths;
  - checksums where available.
- Only if the first proof is clean, run one `maxItems=3` proof with the same
  guardrails.
- Stop on:
  - repeated download of an already archived family;
  - unsupported/stable-hash row selected for browser work;
  - provider-work timeout;
  - model-selector interaction;
  - browser-health regression;
  - active job not returning to `0`.

Acceptance evidence:

- `maxItems=1` materializes or skips cleanly with no failed browser churn.
- `maxItems=3` only runs after `maxItems=1` passes.
- All materialized entries have archive item ids and asset routes.
- Active account-library jobs return to `0`.

Result:

- `maxItems=1` job `hmj_0391838191ce4bfebe5f5001ecb68cee` succeeded with
  `materialized=1`, `failed=0`, `skipped=0`, `duplicateAliases=0`.
  It materialized provider id `1c9239c5-738b-5868-a435-41e3c247dd86`
  through `chatgpt-library-file-row-click` to archive item
  `history-file:chatgpt:eric.cochran_soylei.com:account-library:1c9239c5-738b-5868-a435-41e3c247dd86`.
  Local file size and checksum were verified as `152683` bytes and
  SHA-256 `4dce14d2273a7d295d6ff5280dfacbde769761ec4a3e422ee2a8f925d89eef86`.
- A same-budget follow-up job
  `hmj_02ccb145fd024c85a56919aad71ca731` did not reuse the prior job record,
  but it selected the next unarchived family instead of redownloading the
  first file. It succeeded with `materialized=1`, `failed=0`, `skipped=0`,
  `duplicateAliases=0`, provider id
  `95845cd0-ed20-5614-a4cf-16dae89b37a1`, and checksum
  `4fe7c38a512c75f416c0d87de9a23c5167b27ec7cdfa40490c61c1647ef2ed53`.
  This job sat queued for about 98 seconds before starting; the selector
  advanced correctly, but queue latency remains a health signal for the next
  scheduler slice.
- `maxItems=3` job `hmj_d1cf6ea905864ff9b3259e026d95cff5` succeeded with
  `materialized=3`, `failed=0`, `skipped=0`, `duplicateAliases=0`.
  It materialized:
  - `dd6bb9bd-eb46-5a46-93de-7c03fa8e711b`,
    SHA-256 `6f25875cea2f211730cee5a0835f4d8944f6821cf5faa9e252bd8595f1bbe7bf`,
    `71382` bytes;
  - `71917ceb-94bb-5d59-a078-d75dfe8c60b7`,
    SHA-256 `ed262179f3601d99a340d1d0bd5c05960656d965b0c42e79361a091523f9b154`,
    `156654` bytes;
  - `3de8da8f-d19a-5e71-a6f9-71e98ec1d4ba`,
    SHA-256 `e847b7884c5a646eece7406fb8ee55e5710ad30ac4766530049ec7092cb1d153`,
    `40530` bytes.

### Track 4 | Archive, Search, And Idempotence Readback

Status: completed.

- Verify each materialized file is available from the installed archive asset
  route.
- Verify local path exists and byte count/checksum is stable.
- Verify run archive/search projection reflects durable availability.
- Re-run preview after proof and confirm:
  - newly archived families move into `archivedFamilies` or otherwise stop
    spending selected budget;
  - selected candidates decrease or advance to the next unarchived families;
  - duplicate families do not re-download.
- Query active account-library materialization jobs and require active count
  `0`.

Acceptance evidence:

- Archive HTTP asset routes return success for materialized items.
- No terminal materialized entry lacks archive linkage.
- Follow-up preview does not select the same archived families again.

Result:

- Active account-library materialization jobs returned to `0` after each
  proof pass.
- Hash/size checks matched the job result for all four newly materialized
  proof files and the replay file.
- Final installed `/status` readback reported `mode=preview_only`,
  `activeJobCount=0`, `browserHealth.status=observed`, `reason=null`,
  `openBlankPageCount=0`, `catalogFiles=60`, `eligibleCandidates=21`,
  `selectedCandidates=3`, `archivedFamilies=13`, `unresolvedStale=11`,
  `unsupportedOrTerminal=12`, and `duplicateFamilies=3`.

### Track 5 | Enablement Decision

Status: completed.

- Decide the final state for this plan:
  - keep `preview_only`;
  - move to a narrowly eligible/manual-triggered mode in a later plan;
  - or revert to disabled if proof exposes provider/browser instability.
- This plan must not enable automatic live-follow queueing itself unless the
  user explicitly changes scope after proof.
- Update `ROADMAP.md`, `RUNBOOK.md`, `docs/dev/dev-journal.md`, and this plan
  with:
  - final job ids;
  - exact installed readback;
  - final operating decision;
  - next recommended bounded slice.

Acceptance evidence:

- Docs show the final decision and why.
- Any remaining blocker has an exact unblocker.

Result:

- Final decision: keep ChatGPT account-library live follow in `preview_only`.
  Manual/operator account-library jobs are now proven to materialize
  route-authorized Library files from the installed runtime, but automatic
  queueing should wait for a follow-up scheduler-health slice because one
  same-budget follow-up job remained queued for about 98 seconds before
  starting.
- Next bounded slice: harden account-library scheduler/job lifecycle before
  allowing automatic eligible mode. The exact concerns are queued-job latency,
  duplicate active-source expectations versus selector advancement, and
  continued proof that archived families are skipped before browser work.

## Critical Path

1. Clear the browser-health gate.
2. Capture preview candidate snapshot.
3. Run `maxItems=1` installed proof.
4. Validate archive/search/idempotence.
5. Run `maxItems=3` installed proof only if the first proof is clean.
6. Validate post-proof preview and active-job drain.
7. Record final operating decision.

## Parallelizable Work

- Local tests for eligibility/preview selection can run while docs are updated.
- Archive route verification and job readback can run in parallel after each
  terminal job.
- Roadmap/runbook/dev-journal updates can be drafted before proof, but final
  proof values must be filled only after installed evidence exists.

## Acceptance Criteria

- `chatgpt/wsl-chrome-3` browser health no longer blocks account-library
  proof, or the plan records the exact blocker and stops before materializing.
- Installed preview still reports selected route-authorized candidates.
- `maxItems=1` proof reaches terminal state with no failed/unsupported row
  churn.
- `maxItems=3` proof runs only after `maxItems=1` passes.
- Every materialized file has archive item id, asset route, local path, and
  available asset readback.
- No duplicate re-download of archived account-library families.
- No model-selector, feature-signature, or unrelated provider interaction
  occurs during proof.
- Active account-library materialization jobs return to `0`.
- Automatic account-library live-follow queueing remains disabled or
  preview-only unless explicitly scoped otherwise.

Final status: all criteria passed for manual/operator capped materialization.
Automatic account-library queueing remains intentionally preview-only pending a
separate scheduler-health plan.

## Definition Of Done

- This plan is updated with final proof and set to `CLOSED` or left `OPEN`
  with a precise blocker.
- `ROADMAP.md`, `RUNBOOK.md`, and `docs/dev/dev-journal.md` reflect the final
  state.
- Focused tests pass:
  - `pnpm vitest run tests/accountMirror/catalogService.test.ts -t
    "eligibility"`;
  - `pnpm vitest run tests/runtime.historyMaterializationService.test.ts -t
    "delayed cached catalog|account-library"`.
- `pnpm exec tsc --noEmit` passes.
- Relevant focused lint passes for touched code/tests.
- `pnpm run build` and user-runtime/API install pass if runtime code changes.
- Installed `/status`, job readback, archive readback, and active-job readback
  are recorded.
- `pnpm run plans:audit -- --keep 101` passes.
- `git diff --check` passes.

## Validation

- `pnpm vitest run tests/http.responsesServer.test.ts -t "does not block account-library catch-up on launch about:blank"` passed.
- `pnpm vitest run tests/http.responsesServer.test.ts -t "reports preview-only ChatGPT account-library catch-up counts"` passed.
- `pnpm vitest run tests/accountMirror/catalogService.test.ts -t "eligibility"` passed.
- `pnpm vitest run tests/runtime.historyMaterializationService.test.ts -t "delayed cached catalog|account-library"` passed after updating two older test mocks to include archive `listItems`, catalog readback, and Library provider-file identity.
- `pnpm exec biome lint src/http/responsesServer.ts tests/http.responsesServer.test.ts tests/runtime.historyMaterializationService.test.ts` passed with existing `noNonNullAssertion` warnings in the large HTTP test file.
- `pnpm exec tsc --noEmit` passed.
- `pnpm run build` passed.
- `pnpm run install:user-runtime` passed.
- `pnpm run install:user-api-service` passed.
- `systemctl --user restart auracall-api.service` completed and
  `systemctl --user is-active auracall-api.service` returned `active`.
- Installed CLI `/home/ecochran76/.local/bin/auracall --version` returned
  `0.1.1`.
- `pnpm run plans:audit -- --keep 101` passed with `Validation errors: 0`.
- `git diff --check` passed.
