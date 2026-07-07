# Live-Follow Target Resume Readiness | 0153-2026-07-06

State: OPEN
Lane: P01

## Goal

Convert the post-0152 live-follow posture from "attention-needed but
explained" into an operator-safe target resume routine. The work should decide
and prove what happens to each subscribed account class that 0152 deliberately
kept out of blind broad resume: operator-paused ChatGPT accounts,
provider-blocked Gemini accounts, false Grok identity-blocked rows caused by
cross-namespace identity comparison, and account-library or materialization
backlogs that should not force broad chat re-scrapes.

This plan does not replace the 0152 operating model. It applies that model to
the remaining non-safe targets one class at a time, with installed evidence
that each target either joins safe steady-follow/bounded-resume or remains
excluded for a precise operator-visible reason.

## Current State

- Plan 0152 is closed. Installed `/status` exposes per-target `resumePolicy`
  so broad resume no longer needs to infer safety from completion status,
  routine decision, or provider errors.
- `chatgpt/wsl-chrome-2` and `chatgpt/wsl-chrome-4` are safe steady-follow
  evidence and should continue on cadence.
- `chatgpt/default` and `chatgpt/wsl-chrome-3` are operator-paused. Automatic
  reconciliation must not unpause or policy-upgrade them without an explicit
  operator decision. `wsl-chrome-3` is the preferred first controlled proof
  target because metadata is complete, rate-limit guard evidence is clear, and
  the remaining work is a distinct materialization policy/backlog decision.
- `gemini/auracall-gemini-pro` is provider-blocked by legacy bounded-left-rail
  semantics. It needs a provider-specific repair path before automatic resume.
- `grok/default` no longer blocks on the false cross-namespace identity
  comparison fixed in commit `f5ddde4f`. Installed status now reports
  `safe_steady_follow` with no attention needed, while its current
  `failure-backoff`/identity recheck timing remains a normal cadence issue
  rather than a tenant mismatch.
- Account-library and local materialization backlogs remain separate from
  metadata-current steady-follow. They must not make a complete metadata row
  restart root/project rail walking.
- Status now needs an explicit synthesized target decision because
  `resumePolicy`, `routineDecision`, and `materializationBacklog` each answer a
  different question. Operators need one row-level decision that says whether a
  target can resume, requires operator action, needs provider repair, or needs
  materialization policy/progress.

## Live Survey | 2026-07-07

Installed `/status` on port `18095` reports live-follow
`severity=attention-needed`, desired-enabled targets `6`, paused `3`,
attention-needed `3`, complete `5`, and in-progress `1` after installing the
target-decision status surface.

| Target | Status | Resume class | Routine | Materialization | Rate-limit/LLM evidence |
| --- | --- | --- | --- | --- | --- |
| `chatgpt/default` | `paused`, `complete` | `operator_paused` / `targetDecision=operator_paused` | `identity` | `materialization_required`, 235 remote missing, 0 local | no provider guard, `llmServiceRequests=0`, CDP 9 |
| `chatgpt/wsl-chrome-2` | `idle_waiting`, `complete` | `safe_steady_follow` | `steady_follow` | `materialization_required`, 221 remote missing, 0 local | no provider guard, `llmServiceRequests=0`, CDP 8 |
| `chatgpt/wsl-chrome-3` | `paused`, `complete` | `operator_paused` / `targetDecision=operator_paused` | `complete` | `metadata_current_backlog`, `metadata_only`, 433 remote missing, 1 local | no provider guard, `llmServiceRequests=0`, CDP 8 |
| `chatgpt/wsl-chrome-4` | `idle_waiting`, `complete` | `safe_steady_follow` | `steady_follow` | `materialization_required`, 235 remote missing, 0 local | no provider guard, `llmServiceRequests=0`, CDP 8 |
| `gemini/auracall-gemini-pro` | `paused`, `in_progress` | `provider_blocked` / `targetDecision=provider_repair_required` | `detail-inventory` | `materialization_required`, 64 remote missing, 0 local | no current guard; legacy bounded-left-rail blocker |
| `grok/default` | `idle_waiting`, `complete` | `safe_steady_follow` | delayed identity recheck | none | no attention needed; no false mismatch blocker |

Disabled or unconfigured rows remain out of the subscribed-target success
definition: `gemini/default`, `grok/windows-chrome-test`,
`grok/wsl-chrome-2`, and `grok/auracall-grok-auto`.

## Execution Evidence | 2026-07-07

- Installed service PID `59885` exposed `targetDecision` from `/status`, then
  target-level controls resumed both operator-paused ChatGPT rows without broad
  unpausing:
  - `chatgpt/wsl-chrome-3` completion
    `acctmirror_completion_a364044f-2779-4e00-b866-e6421f2f1aae` ran one
    bounded pass, returned to `idle_waiting`, advanced to `passCount=8`, and
    kept `llmServiceRequests=0`, CDP calls `8`, and provider guard `null`.
  - `chatgpt/default` completion
    `acctmirror_completion_f9756e54-af2c-438f-9516-a2a1c063783e` moved from
    `operator_paused` to `idle_waiting` through the same bounded control path;
    it now reports `targetDecision=materialization_required`.
- Capped account-history materialization jobs were started after the ChatGPT
  resume proof:
  - `hmj_287fe1033232432cbbd075db0ded0b12` for
    `chatgpt/wsl-chrome-3`: `succeeded`, 3 conversations, 2 assets
    materialized, 0 failed.
  - `hmj_1c1fd9a68ae642708972cdbe02f8a345` for
    `chatgpt/wsl-chrome-4`: `succeeded`, 3 conversations, 1 asset
    materialized, 0 failed.
  - `hmj_1801628928404d4ab2d02ac00c7204d7` for
    `chatgpt/wsl-chrome-2`: `skipped`, 3 conversations, no downloadable
    assets found, 0 failed.
  - `hmj_dd01c900f66d4c54a24566614f1bd6b9` for `chatgpt/default`: `skipped`,
    1 conversation, no downloadable assets found, 0 failed. The prior default
    `maxItems=3` probe, `hmj_e93bde050f8041889136a32242ab7695`, failed on the
    local stale threshold after 120000 ms and needs queue/runtime hardening
    before larger default materialization batches.
- Final installed readback after the bounded work: desired-enabled targets `6`,
  paused `1`, attention-needed `1`, complete `5`, in-progress `1`; all ChatGPT
  rows are `idle_waiting` and guard-clear, while
  `gemini/auracall-gemini-pro` remains `provider_repair_required`.

## Decision Tree

1. If a target is already `safe_steady_follow`, keep it on cadence and do not
   spend provider budget unless its frontier says there is new metadata.
2. If a target is `operator_paused`, require an explicit target-level operator
   action that records why this account should resume, what phase is permitted,
   and whether only one bounded pass is allowed.
3. If a target is `provider_blocked`, repair or replace the provider-specific
   policy before any automatic resume. Do not retry the old blocked completion
   as a liveness test.
4. If a Grok target is `identity_blocked`, first determine whether the
   detected provider-app value is comparable to the configured tenant identity.
   Email-vs-display-name and email-vs-provider-user-id are not comparable and
   must not block live follow.
5. If a target is metadata-current with only materialization/account-library
   backlog, route that backlog through its own queue/status surface rather than
   restarting full chat scraping.
6. If foreground operator/API/browser work appears, defer before provider
   refresh and keep the target in its prior classification.

## Milestones

- M1: Add an operator-facing target resume matrix that lists every subscribed
  target, current `resumePolicy`, synthesized `targetDecision`, permitted next
  action, materialization posture, and exact blocker.
- M2: Define target-level controls for operator-paused ChatGPT rows:
  observe-only, run one bounded pass, resume cadence, or keep paused.
- M3: Prove one ChatGPT operator-paused target can be resumed only through the
  explicit control path, without policy-upgrading other paused targets.
- M4: Convert Gemini from `provider_blocked` to a bounded provider-specific
  plan or repair path that does not reuse the legacy blocked completion as the
  broad-resume mechanism.
- M5: Convert Grok from false `identity_blocked` to eligible or
  safe-bounded-resume by making identity comparison provider-aware and clearing
  stale mismatch readback when the keys are not comparable.
- M6: Keep account-library and local materialization backlog out of metadata
  freshness decisions, with status readback that names the separate queue.
- M7: Reconcile broad live-follow after M2-M6 and prove that enabled targets
  are only `safe_steady_follow`, `safe_bounded_resume`, or intentionally
  blocked/paused with no ambiguous state.

## Work Tracks

- Critical path:
  - maintain the target resume matrix;
  - pick one target class at a time;
  - prove classification before and after the action through installed
    `/status`;
  - leave unrelated targets unchanged.
- Parallelizable:
  - ChatGPT paused-target operator UX/docs;
  - Gemini bounded-left-rail provider repair design;
  - Grok false identity-mismatch semantics and stale-state cleanup;
  - account-library/materialization backlog readback refinement.

## Non-Goals

- Do not broadly unpause every active live-follow completion.
- Do not tune rate-limit thresholds as a substitute for reducing provider
  interactions.
- Do not make account-library or local asset materialization a reason to
  restart root/project conversation rails.
- Do not click provider human-verification, confirmation, or answer-now
  surfaces automatically.
- Do not treat disabled, identity-blocked, or provider-blocked targets as
  healthy simply because other accounts are safe steady-follow.

## Acceptance Criteria

- [x] Installed `/status` or an equivalent operator readback shows a target
  resume matrix with subscribed targets, `resumePolicy`, synthesized
  `targetDecision`, next permitted action, materialization posture, and blocker.
- [x] Operator-paused ChatGPT targets can only resume through explicit
  target-level controls, and one installed proof shows no unrelated paused
  target was upgraded.
- [ ] Gemini provider-blocked live follow has a bounded repair/replacement path
  that avoids the legacy blocked completion as the automatic broad-resume path.
- [x] Grok false identity-blocked live follow no longer treats provider
  display/user labels as mismatches against configured browser tenant email,
  and stale mismatch readback no longer keeps the target blocked.
- [x] Materialization/account-library backlog remains separate from
  metadata-current live-follow freshness in status and scheduling behavior.
- [ ] Installed broad reconciliation leaves no desired-enabled target in an
  ambiguous state: each is safe steady-follow, safe bounded resume, explicit
  operator-paused, provider-blocked, identity-blocked, or disabled.

## Definition Of Done

This plan closes when installed AuraCall can run broad live-follow
reconciliation with every subscribed account classified into an intentional
target state, at least one formerly operator-paused ChatGPT target has an
explicitly controlled outcome, Gemini blockers are either repaired or preserved
as precise follow-up states, and Grok false identity-blocked state is eliminated
without causing broad resume to restart expensive scrape work.
