# Large Chat Resumable Context Sync | 0140-2026-06-10

State: CLOSED
Lane: P01

## Purpose

Make live-follow resilient when an individual ChatGPT conversation is too large
or slow to read as one all-or-nothing `ConversationContext`.

## Current State

- Account-mirror detail inventory has a resumable `attachmentInventory` cursor,
  but that cursor only advances between project and conversation surfaces.
- ChatGPT `readConversationContext` currently returns one whole
  `ConversationContext` containing all visible messages, files, sources, and
  artifacts.
- Plan 0139 fixed retrying from the same conversation index, and the
  2026-06-09 timeout repair bounded slow provider subreads, but a very large
  chat still cannot be synced in resumable chunks.
- If one conversation needs multiple passes, there is no persisted
  intra-conversation cursor that says which message or artifact range was
  already scanned.

## Problem Statement

Large chats can take longer than one bounded live-follow pass. The system must
be able to persist partial progress inside a conversation and resume from that
point on a later pass. Otherwise, live-follow can keep revisiting the same large
chat and delay or starve the rest of account-mirror sync.

## Design

- Add a provider-neutral partial context shape that can represent one chunk of
  a conversation while preserving the existing whole `ConversationContext`
  contract for ordinary callers.
- Add a ChatGPT-specific chunk read path for account-mirror detail inventory:
  - read the visible full context once per provider call;
  - slice messages/sources/artifacts/files by a bounded message window;
  - return an intra-conversation cursor when more message ranges remain.
- Persist intra-conversation cursor evidence inside `metadataEvidence` so the
  next live-follow pass can resume the same conversation before advancing to the
  next conversation.
- Keep the existing between-conversation `attachmentInventory` cursor as the
  outer cursor. The inner cursor only blocks outer advancement until the current
  conversation chunk is complete.
- Merge chunked context evidence into the same artifact/file inventory surface
  used by existing account-mirror code.

## Scope

- Extend browser provider types and ChatGPT adapter options with an optional
  account-mirror context chunk request.
- Extend account-mirror metadata evidence/status normalization for a resumable
  conversation detail cursor.
- Teach `readBoundedAttachmentInventory` to process a partial conversation chunk
  and persist/consume the inner cursor.
- Add focused unit tests for:
  - first chunk of a large chat keeps the outer conversation cursor pinned;
  - second chunk resumes and advances the outer cursor when the chat completes;
  - status normalization preserves the inner cursor.
- Update operator docs and durable fix notes.

## Non-Goals

- Do not change normal `llmService.getConversationContext` cache semantics.
- Do not require ChatGPT to expose a native API cursor.
- Do not make one live-follow pass unbounded.
- Do not change target handoff behavior.

## Acceptance

- A large ChatGPT conversation can be split across multiple account-mirror
  passes using persisted cursor evidence.
- A pass that only reads part of a conversation does not advance the outer
  conversation cursor past that conversation.
- The next pass resumes from the inner cursor and advances the outer cursor
  only after the conversation chunk sequence completes.
- Existing whole-context callers continue to receive complete
  `ConversationContext` payloads.
- Focused tests, TypeScript, focused lint, build, and plan audit pass.
- Installed live-follow status exposes the inner cursor when a large chat is
  mid-sync; the live `wsl-chrome-2` proof did not happen to hit a >24-message
  chat in the scanned window, so this specific visible-status shape is covered
  by focused tests while live proof covers cursor advancement and cache
  commit.

## Validation Plan

- `pnpm vitest run tests/accountMirror/chatgptMetadataCollector.test.ts`
- `pnpm vitest run tests/accountMirror/statusRegistry.test.ts`
- `pnpm vitest run tests/browser/chatgptAdapter.test.ts`
- `pnpm exec tsc --noEmit --pretty false`
- focused `pnpm exec biome lint` on touched files
- `pnpm run build`
- `pnpm run plans:audit -- --keep 140`
- install/restart user runtime if source validation passes
- live status/refresh proof for `chatgpt/wsl-chrome-2` when feasible

## Definition Of Done

Plan 0140 closes when account-mirror live-follow can persist and resume
progress inside one large ChatGPT conversation without blocking the rest of
live-follow sync, and current validation evidence proves the behavior.

## Closeout

- Implemented provider-neutral `accountMirrorContextChunk` options and ChatGPT
  message-window slicing metadata.
- Preserved chunk metadata through `llmService.getConversationContext`.
- Persisted `attachmentInventory.conversationDetail` and collector progress
  evidence so account-mirror can pin the outer conversation cursor while a
  large chat has more chunks.
- Live validation exposed a separate cache-index corruption bug
  (`cache-index.json` contained an appended second JSON document). The fix now
  writes provider JSON caches and cache indexes through temp-file rename and
  salvages/re-writes the first valid cache-index document on read.
- Validation passed:
  - `pnpm vitest run tests/browser/providerCache.test.ts tests/accountMirror/chatgptMetadataCollector.test.ts tests/accountMirror/statusRegistry.test.ts tests/browser/chatgptAdapter.test.ts tests/browser/llmServiceContext.test.ts`
    (`154` tests);
  - `pnpm exec tsc --noEmit --pretty false`;
  - focused `pnpm exec biome lint` on touched cache/provider/test files;
  - `pnpm run build`;
  - `pnpm run plans:audit -- --keep 140`.
- Installed runtime proof:
  - `systemctl --user restart auracall-api.service` left the service active;
  - explicit `chatgpt/wsl-chrome-2` refresh
    `acctmirror_059ee058-f5bc-4087-aeae-15c6fbc16835` completed at
    `2026-06-10T15:35:47.054Z`;
  - durable status advanced `attachmentInventory.nextConversationIndex` from
    `17` to `21`, cleared `lastFailureAt`, and reset
    `consecutiveFailureCount` to `0`;
  - the repaired cache index parses as valid JSON with `85` entries and an
    `account-mirror/snapshot.json` entry.
