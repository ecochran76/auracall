# Handoff ChatGPT Prompt Attachment Adapter Plan | 0130-2026-06-07

State: CLOSED
Lane: P01

## Purpose

Continue Plan 0114 after Plan 0129 installed the provider-native upload runner
contract. The next practical step is the first provider-specific adapter path:
ChatGPT target handoff through the existing browser prompt submission surface
with selected files attached to the submitted prompt.

ChatGPT does not expose a clean standalone pre-submit provider file upload path
through the current browser automation surface. This slice therefore wires a
prompt-attachment adapter: upload approval stages selected packet files as
ChatGPT prompt attachments, and submit approval performs the live-capable
browser prompt submission with those attachments.

## Current State

- `recover-live` can execute approved upload or submit actions through a
  `HandoffTargetAdapter`.
- Provider-native upload and prompt runner contracts exist.
- `ChatgptService.runPrompt(...)` can submit prompts through `runBrowserMode`,
  but `PromptInput` did not carry attachments.
- No handoff adapter yet bridges selected packet files into ChatGPT browser
  prompt attachments.

## Scope

- Extend `PromptInput` with optional browser attachments.
- Pass ChatGPT prompt attachments through `ChatgptService.runPrompt(...)` to
  `runBrowserMode(...)`.
- Add `createChatgptBrowserHandoffTargetAdapter(...)`.
- Stage selected handoff files as ChatGPT prompt attachments during the upload
  recovery step, with stable prompt-attachment ids.
- Submit the target primer, compact context JSON, and selected files through
  the ChatGPT browser prompt path during the submit recovery step.
- Preserve host-owned approval gates, package digests, upload-set digests, and
  packet readback artifacts.
- Prove the adapter with mocked-browser tests at the `runBrowserMode` boundary.

## Non-Goals

- Do not run a live ChatGPT browser smoke in this slice.
- Do not pretend ChatGPT has a standalone pre-submit provider file manager
  upload path.
- Do not put ChatGPT selectors or browser heuristics in `src/handoff/service.ts`.
- Do not combine upload and submit approvals.

## Definition Of Done

Plan 0130 closes as **Handoff ChatGPT Prompt Attachment Adapter Installed**
when a ChatGPT-specific handoff target adapter can stage selected files,
submit the approved primer and compact context through the existing ChatGPT
browser prompt path with attachments, and persist normal handoff submit/readback
artifacts behind the existing recovery contract.

## Validation Plan

- `pnpm vitest run tests/browser/chatgptService.test.ts tests/cli/handoffCommand.test.ts tests/http.handoffOperator.test.ts`
- `pnpm exec tsc --noEmit --pretty false`
- focused `pnpm exec biome lint` on handoff, ChatGPT service, CLI, HTTP,
  console, and tests
- `pnpm run console:build`
- `pnpm run plans:audit -- --keep 130`
- `git diff --check`
- `pnpm run build`

## Exit Criteria

Closed as **Handoff ChatGPT Prompt Attachment Adapter Installed**. The first
provider-specific handoff adapter is wired to the existing ChatGPT browser
prompt-attachment path. A real target-profile live smoke remains the next
bounded proof.
