# Live-Follow Target Resume Readiness | 0153-2026-07-06

State: OPEN
Lane: P01

## Goal

Convert the post-0152 live-follow posture from "attention-needed but
explained" into an operator-safe target resume routine. The work should decide
and prove what happens to each subscribed account class that 0152 deliberately
kept out of blind broad resume: operator-paused ChatGPT accounts, provider-
blocked Gemini accounts, identity-blocked Grok accounts, and account-library or
materialization backlogs that should not force broad chat re-scrapes.

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
  operator decision.
- `gemini/auracall-gemini-pro` is provider-blocked by legacy bounded-left-rail
  semantics. It needs a provider-specific repair path before automatic resume.
- `grok/default` is identity-blocked. Its completeness evidence is not enough
  to resume until account identity/config repair is proven.
- Account-library and local materialization backlogs remain separate from
  metadata-current steady-follow. They must not make a complete metadata row
  restart root/project rail walking.

## Decision Tree

1. If a target is already `safe_steady_follow`, keep it on cadence and do not
   spend provider budget unless its frontier says there is new metadata.
2. If a target is `operator_paused`, require an explicit target-level operator
   action that records why this account should resume, what phase is permitted,
   and whether only one bounded pass is allowed.
3. If a target is `provider_blocked`, repair or replace the provider-specific
   policy before any automatic resume. Do not retry the old blocked completion
   as a liveness test.
4. If a target is `identity_blocked`, repair identity/config evidence first,
   then rerun classification before provider work.
5. If a target is metadata-current with only materialization/account-library
   backlog, route that backlog through its own queue/status surface rather than
   restarting full chat scraping.
6. If foreground operator/API/browser work appears, defer before provider
   refresh and keep the target in its prior classification.

## Milestones

- M1: Add an operator-facing target resume matrix that lists every subscribed
  target, current `resumePolicy`, permitted next action, and exact blocker.
- M2: Define target-level controls for operator-paused ChatGPT rows:
  observe-only, run one bounded pass, resume cadence, or keep paused.
- M3: Prove one ChatGPT operator-paused target can be resumed only through the
  explicit control path, without policy-upgrading other paused targets.
- M4: Convert Gemini from `provider_blocked` to a bounded provider-specific
  plan or repair path that does not reuse the legacy blocked completion as the
  broad-resume mechanism.
- M5: Convert Grok from `identity_blocked` to either repaired identity/config
  evidence or a durable disabled/blocked state with a precise operator note.
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
  - Grok identity/config investigation;
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

- [ ] `/status` or an equivalent operator readback shows a target resume matrix
  with subscribed targets, `resumePolicy`, next permitted action, and blocker.
- [ ] Operator-paused ChatGPT targets can only resume through explicit
  target-level controls, and one installed proof shows no unrelated paused
  target was upgraded.
- [ ] Gemini provider-blocked live follow has a bounded repair/replacement path
  that avoids the legacy blocked completion as the automatic broad-resume path.
- [ ] Grok identity-blocked live follow has repaired identity/config evidence
  or a durable disabled/blocked operator state.
- [ ] Materialization/account-library backlog remains separate from
  metadata-current live-follow freshness in status and scheduling behavior.
- [ ] Installed broad reconciliation leaves no desired-enabled target in an
  ambiguous state: each is safe steady-follow, safe bounded resume, explicit
  operator-paused, provider-blocked, identity-blocked, or disabled.

## Definition Of Done

This plan closes when installed AuraCall can run broad live-follow
reconciliation with every subscribed account classified into an intentional
target state, at least one formerly operator-paused ChatGPT target has an
explicitly controlled outcome, and Gemini/Grok blockers are either repaired or
preserved as precise follow-up states without causing broad resume to restart
expensive scrape work.
