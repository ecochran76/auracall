# Plan0386 bounded Standards/Spec reconciliation

Baseline: c568cf3e6be710042b6353252934eaa127eeef4b (PR213).
Reviewed head: 6a07668e481ef6cb46f816a8e8a2dcca63f25337 (PR217).
Diff: `git diff c568cf3e6...6a07668e4`; commits: PR214-217 and their source commits.
Mode: primary-only closed-world reconciliation of the accepted packet and wider
plan criteria; accepted prior scoped remediation reviews are not reopened.
Sources: Plan0386, current-main acceptance JSON, live-follow operating contract,
active-lanes P85, Issue165 readback, planning/documentation/validation policies.
No new live run, implementation, or independent review is claimed.

## Standards

Accepted finding S1, blocking accurate handoff, high confidence: P85 still says
capture/repeat unproven and points to the old receipt; the plan's Current State
opens with historical PR155. Policy0005 requires current state and prompt
semantic reconciliation. Reproducer: compare those fields against the PR217
receipt's positiveCapture and unchangedRepeat. Consequence: fresh agents repeat
already accepted work. Remediation: current-state summary and P85 receipt/gate
correction. Preserve historical checkpoints and keep plan OPEN.
No new code-standard findings accepted in this bounded documentation review.

## Spec

Accepted finding P1, blocking wider closeout, high confidence: renewed scope
requires “automatic changed/unchanged handling, scheduler resume after
acceptance.” The receipt proves an explicit fixed-conversation capture plus
unchanged repeat. It contains no changed-frontier or scheduler-resume evidence;
finalRuntime.schedulerPaused is true. Consequence: bounded acceptance cannot
close the wider goal. Reproducer: inspect positiveCapture, unchangedRepeat,
finalRuntime against renewed scope. Disposition: needs_evidence for changed
frontier, then dependent scheduler continuation; retain OPEN status.

Rejected candidate: original Bailey-only Gate D means the renewed four-step
packet failed. Later explicit user scope accepts one genuinely missing local
asset through normal follow and automatic child. That packet passed; old Bailey
failures remain evidence, not retroactive successes.

Repeat limitation: one ECONNREFUSED at terminal browser cleanup. Preserve it;
independent byte/hash/mtime, manifest/archive counts and cached asset HTTP200
support unchanged reuse. Do not infer zero provider metadata traffic.

Next flow: /to-spec for one changed-frontier acceptance packet, using existing
repo plan authority. Define exact before/after selection and prior-byte retention
before any code or provider effect. Scheduler continuation remains dependent.
The optional skill tracker file docs/agents/issue-tracker.md is missing; use
existing GitHub/repo policy now and run /setup-matt-pocock-skills before a new
multi-ticket skill flow. No competing tracker or glossary was created.
Memory disposition: unavailable; existing receipt records no qualified AuraCall
Graphiti group. Current repository evidence suffices for this reconciliation.

Summary: Standards 1 accepted stale-state finding, corrected; Spec 1 accepted
wider closeout gap, OPEN pending changed-frontier and scheduler evidence.
