# ChatGPT Targeted Conversation Artifact Scrape | 0148-2026-06-28

State: CLOSED
Lane: P01

## Purpose

Stop ChatGPT live-follow detail passes from spending their bounded browser work
on account-library and project surfaces when the freshness frontier has already
selected one or more conversations for artifact enrichment.

## Current State

- Live-follow for `chatgpt/wsl-chrome-3` is paused after repeated ChatGPT
  provider-guard blocks with `passCount=0` and `90` detail surfaces remaining.
- The latest successful bounded proof showed the reverse-mtime frontier working
  (`rowsExamined=4`, `rowsSelectedForDetail=1`, `frontierReached=true`), but
  the detail pass scanned `4` projects and `0` conversations.
- `readBoundedChatgptDetailInventory` currently reads account-library inventory
  first, then delegates to attachment inventory. Attachment inventory scans
  projects before conversations unless told otherwise.
- Once a selected ChatGPT conversation is loaded, artifact discovery should be
  mostly DOM/app-state parsing plus authenticated download URL iteration, not
  repeated account-library/project/history navigation.

## Problem Statement

The current ChatGPT steady-follow detail path has the wrong scaling shape. A
frontier-selected artifact-rich chat can still miss the actual conversation
scrape because the pass consumes its bounded interaction budget on broader
library and project surfaces first. Rate-limit guards are then symptom
handling: they report provider pressure, but the algorithm is creating that
pressure by doing too much unrelated navigation for a targeted enrichment task.

## Scope

- Add a ChatGPT steady-follow detail mode that prioritizes selected
  conversations before project surfaces.
- Skip account-library inventory for ChatGPT steady-follow conversation detail
  passes unless explicitly requested by a full sweep or account-library path.
- Preserve full-sweep and account-library behavior for broad catalog recovery.
- Add focused unit coverage proving a steady-follow selected conversation is
  scraped before projects and without account-library reads.
- Record the operator lesson that the current failure is scrape algorithm
  shape, not just provider-guard tuning.

## Non-Goals

- Do not resume live-follow automatically after the code change; the user
  paused the lane intentionally.
- Do not change provider guard, cooldown, or rate-limit detection semantics in
  this slice.
- Do not add a new public API endpoint.
- Do not implement binary artifact download redesign beyond making the selected
  conversation scrape reachable first.

## Acceptance

- [x] In ChatGPT steady-follow mode with frontier-selected conversations, the
  collector does not call `listAccountFiles` before conversation detail reads.
- [x] In that same mode, selected conversation detail is read before project
  file surfaces.
- [x] Full sweep / broad inventory behavior can still include account-library
  and project inventory.
- [x] Focused tests prove the call order and retained broad-mode behavior.
- [x] Dev journal and fixes log capture the scaling diagnosis and paused
  runtime evidence.

## Validation Plan

- `pnpm vitest run tests/accountMirror/chatgptMetadataCollector.test.ts`
- `pnpm vitest run tests/accountMirror/conversationFreshnessFrontier.test.ts tests/accountMirror/refreshService.test.ts`
- `pnpm exec tsc --noEmit --pretty false`
- `pnpm exec biome check src/accountMirror/chatgptMetadataCollector.ts tests/accountMirror/chatgptMetadataCollector.test.ts`
- `pnpm run plans:audit -- --keep 148`

## Closeout

- Added a ChatGPT targeted detail mode for steady-follow frontier-selected
  conversations:
  - skip account-library inventory for that targeted pass;
  - prioritize selected conversations before project-file surfaces.
- Kept the existing broad/default behavior available for full inventory paths;
  the existing combined library plus conversation inventory test still covers
  the default.
- Added regression coverage proving the targeted mode calls only
  `listConversationFiles` and `getConversationContext` for the selected
  conversation when the pass budget is one detail read.
- Did not resume live-follow. The paused `chatgpt/wsl-chrome-3` evidence is the
  reason for this repair, not a proof target to retry automatically.
- Validation passed:
  - `pnpm vitest run tests/accountMirror/chatgptMetadataCollector.test.ts`;
  - `pnpm vitest run tests/accountMirror/conversationFreshnessFrontier.test.ts tests/accountMirror/refreshService.test.ts`;
  - `pnpm exec tsc --noEmit --pretty false`;
  - `pnpm exec biome check src/accountMirror/chatgptMetadataCollector.ts tests/accountMirror/chatgptMetadataCollector.test.ts`.

## Definition Of Done

Plan 0148 closed when ChatGPT steady-follow could reach the selected
conversation-artifact scrape without first burning the pass on account-library
or project surfaces, focused validation passed, and the runtime lesson was
recorded without resuming the paused live-follow lane.
