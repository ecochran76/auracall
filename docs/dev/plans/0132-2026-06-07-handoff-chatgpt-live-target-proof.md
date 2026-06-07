# Handoff ChatGPT Live Target Proof Plan | 0132-2026-06-07

State: CLOSED
Lane: P01

## Purpose

Continue Plan 0114 after Plan 0131 exposed the ChatGPT browser target adapter
from operator surfaces. This slice proves the adapter against a real ChatGPT
target runtime profile with explicit approvals, selected file staging, live
prompt submission, readback artifacts, and replayable recovery evidence.

The target profile for this proof is the SoyLei ChatGPT Pro lane
`wsl-chrome-3` bound to `eric.cochran@soylei.com`. The source side uses a
synthetic bounded packet so this slice proves live target mutation mechanics
without depending on full source-conversation cache completion.

## Current State

- `auracall handoff recover-live <id> --target-adapter chatgpt-browser` is
  available and defaults remain packet-only unless selected explicitly.
- SoyLei ChatGPT Pro identity smoke for `wsl-chrome-3` reported matching
  expected and actual identity before live mutation.
- A synthetic cross-tenant packet
  `plan0132-chatgpt-live-proof` was prepared under
  `/tmp/auracall-plan0132-live-proof/handoffs`.
- Upload approval, submit approval, ChatGPT browser upload recovery, and
  ChatGPT browser submit recovery all succeeded.
- Target readback is cached for
  `https://chatgpt.com/c/6a24f299-85b0-83ea-b2ee-388297774fca`.

## Scope

- Prepare one synthetic cross-tenant handoff packet with source context and a
  selected local file.
- Target `chatgpt` runtime profile `wsl-chrome-3`.
- Record upload and submit approvals with package digest binding.
- Execute upload recovery through `--target-adapter chatgpt-browser`.
- Execute submit recovery through `--target-adapter chatgpt-browser`.
- Inspect `target/upload-result.json`, `target/submission-result.json`,
  `target/readback.json`, `target/live-recovery.json`, and status readback.
- Record exact evidence and any live-provider blockers.

## Non-Goals

- Do not claim full source conversation transfer is complete in this slice.
- Do not use the original user source conversation as the live proof source.
- Do not bypass approval gates.
- Do not retry through captcha, human-verification, or suspicious provider
  guard pages.

## Definition Of Done

Plan 0132 closes as **Handoff ChatGPT Live Target Proof Installed** when an
approved packet successfully reaches a live ChatGPT target conversation through
the SoyLei `wsl-chrome-3` browser adapter, and the packet contains upload,
submission, readback, live-recovery, and status evidence proving the adapter
path.

If provider/browser state blocks mutation, the plan remains open with exact
blocker evidence and the next safe recovery action.

## Validation Plan

- `pnpm tsx bin/auracall.ts --profile wsl-chrome-3 profile identity-smoke --target chatgpt --json`
- `pnpm tsx bin/auracall.ts --profile wsl-chrome-3 handoff prepare ... --dry-run --json`
- `pnpm tsx bin/auracall.ts --profile wsl-chrome-3 handoff approve-upload ... --json`
- `pnpm tsx bin/auracall.ts --profile wsl-chrome-3 handoff recover-live ... --target-adapter chatgpt-browser --json`
- `pnpm tsx bin/auracall.ts --profile wsl-chrome-3 handoff approve-submit ... --json`
- `pnpm tsx bin/auracall.ts --profile wsl-chrome-3 handoff recover-live ... --target-adapter chatgpt-browser --json`
- `pnpm tsx bin/auracall.ts handoff status ... --json`
- `pnpm run plans:audit -- --keep 132`
- `git diff --check`

## Exit Criteria

Closed as **Handoff ChatGPT Live Target Proof Installed**.

Evidence:

- Identity smoke: `runtimeProfile=wsl-chrome-3`, target `chatgpt`, expected
  and actual identity `eric.cochran@soylei.com`, plan type `pro`, preflight
  `ok=true`.
- Packet: `plan0132-chatgpt-live-proof`.
- Package digest:
  `085d77917832440ea4b740a022410e87f41155ae067f6c4e1e976b1b676b1dd2`.
- Upload result: `status=uploaded`, `uploadedFileCount=1`,
  provider file id
  `chatgpt-prompt-attachment-ba61af1c5b160dbc496d49c7e506614e`.
- Submit result: `status=submitted`, `uploadAttemptCount=1`,
  `submitAttemptCount=1`.
- Readback: `status=readback_cached`, target conversation
  `https://chatgpt.com/c/6a24f299-85b0-83ea-b2ee-388297774fca`,
  provider message id `chatgpt-tab:B87D2B37180B63836C40111750F925AC`.
- Resume plan: `currentStage=complete`, `nextAction=complete`.
