# Plan 0386 live-follow materialization repair loop

Work item: #165. Owner: ecochran76. Date: 2026-10-03.
Source base: canonical `6b4fedaa7537957d1c3619fc8e76b25478b4788d`.
Branch: `fix/issue-165-live-follow-replay`. Integration: PR into main.

## Authority and counter

The operator authorized up to five repair cycles: local reproduction, source
repair, traffic-bound validation, one installed control per cycle, and
incremental unchanged/new-asset proof. Installed controls in this resumed goal:
**0 of 5**. A failed or ambiguous control stops that cycle; another cycle needs
new local evidence and a reviewed repair. Provider warnings, CAPTCHA, identity
drift, uncertain ownership, and unknown effects remain hard stops. No prompt,
account-wide refresh, warning dismissal, or scheduler resume is inferred.

## Corrected original failure evidence

The compact monitoring projection deliberately strips entries and telemetry.
The original control's claimed zero entry count and absent telemetry were
projection observations, not full-record facts. A direct read of the persisted
job store on 2026-10-03 proves one skipped artifact entry, reason
`readChatgptConversationContext:6ab6d340-89e4-83ea-9990-d8fb278993e6: regenerate response`.
It records two `chatgpt.reloadBlockingSurface` and two
`chatgpt.reopenConversation` actions before candidate collection. The job still
had one job-level attempt, zero materialized assets, and no manifest. Prior
claims that no internal recovery happened are corrected here. Sanitized full
readback: `2026-10-03-plan0386-full-evidence-correction.json`.

## Local feedback loop

`pnpm vitest run tests/browser/chatgptMaterializationReplay.test.ts`
executes the actual discovery and tagging evaluations, candidate normalization,
LlmService selection, artifact transfer helper, filesystem stability wait,
file-reference construction, and cache/manifest writing. The CDP transport and
DOM are deterministic fixtures based on the recorded assistant root and ZIP
control. ZIP bytes are synthetic; identity, browser ownership, provider render
timing, and archive publication require separate installed proof.

A real headless loopback-browser harness was attempted first but its initial
navigation acknowledgment stalled before product code ran. That harness was
replaced, not counted as a product regression. Owned replay Chrome processes
were terminated; no provider traffic or managed operator profile was used.

Reproduced defects before source repairs:

- Three normal Regenerate/Continue generating labels produced retry-affordance
  matches without independent failure text. The complete product replay with
  Regenerate also stalled in the recovery wait. Normal controls now remain
  usable; explicit Retry and independent error/rate-limit evidence are retained.
- A stale `A-stale.txt` in the artifact directory was returned as the new ZIP.
  Native download attribution now requires a changed file fingerprint since a
  pre-click baseline, matching filename (including Chromium collision suffix),
  stable nonzero bytes, and one unambiguous fresh candidate. Mismatch and
  multiple-download failures have explicit manifest reasons.
- The preview-pane Download action still used DOM click. An executable viewer
  fixture rejected that call before the repair; direct and viewer controls now
  share the same trusted CDP pointer helper.
- History materialization's one-navigation traffic plan omitted the existing
  single-conversation-visit contract. The new option is wired into production
  list options. Any real blocking surface on that path now fails before reload,
  reopening, dismissal, or recovery sleep. Normal prompt paths retain their
  existing recovery behavior.

Focused validation: 355 tests across replay, adapter, LlmService files, history
materialization, and provider traffic planning; typecheck, scoped lint, build,
plan audit (385 keep, zero errors), and diff hygiene.

The replay checks clean, stale, collision, mismatched, ambiguous, ordinary
Regenerate, and failed Retry cases. It requires one trusted move/press/release
sequence for transfers, exact bytes/type/name/manifest, and zero navigation.
The failed Retry case requires no pointer input, reload, or navigation.

## Remaining proof

Validate and integrate this checkpoint, install the exact canonical merge,
verify installed/source parity, then run one installed artifact-only control
on the exact bound `wsl-chrome-3` root Bailey conversation with maxItems=1.
Read full persisted evidence, not only the monitoring projection. Verify file
bytes/type/checksum, manifest, archive projection, traffic, ownership, and
cleanup. Only after a positive control prove unchanged/new-asset convergence.
Gate D stays open and scheduler remains paused.

## Primary review

Fixed point: canonical base `6b4fedaa7537957d1c3619fc8e76b25478b4788d`.
Standards axis: no accepted blocking findings after scoped lint, typed seams,
diff hygiene, doc reconciliation, and isolated synthetic test-state review.
Spec axis: this packet proves the local product-path repair and traffic-bound
failure behavior; installed and incremental live-follow acceptance remain
explicitly incomplete. No scheduler resume or skill-adoption edits are included.
