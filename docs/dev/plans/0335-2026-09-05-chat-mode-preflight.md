# Chat Mode Preflight | 0335-2026-09-05

State: OPEN
Lane: P28
Operational state: VALIDATING
Branch: fix/chatgpt-chat-mode-preflight
Target: fix/plan0334-chatgpt-tool-skill-selection
Integration: merge
Revision: 1 | 2026-09-05

## Stable Objective

Require positive Chat/Work control evidence on new-chat and project landing
pages before prompting. Preserve established-conversation compatibility.

## Current State

The installed smoke authenticated but claimed Chat while live radios showed
Work. The prompt remained uncommitted and Work quota was exhausted. Two
provider-free regressions reproduce the false success when a root composer
mounts before mode controls or controls never appear. Both pass after waiting
for fresh controls and restricting the fallback to established conversation
routes. The hydration timing is a reproduced explanation, not a captured live
timeline. Installed and live validation remain.

## Scope And Bounds

One isolated repair based on the installed P27 source, one focused acceptance
pass, one runtime adoption and one distinct post-repair smoke. No Skill
selection, account change, service restart, scheduler control, or automatic
prompt retry. Preserve other worktrees. P27 remains the integration parent.

## Acceptance Criteria

- Root controls may mount after the composer; selected Work must switch to Chat.
- Missing root controls must fail before prompting.
- Existing conversation, Work-marker, and menu-mode cases remain green.
- Typecheck, production build, scoped lint, and planning audit pass.
- Installed bytes match; one post-repair smoke verifies actual Chat and reply.

## Definition Of Done

Record source, installed, and live results separately; publish the validated
checkpoint and preserve unresolved live gates without claiming cooperation.
