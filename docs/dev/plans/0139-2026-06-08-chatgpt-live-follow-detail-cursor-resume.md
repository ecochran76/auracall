# ChatGPT Live-Follow Detail Cursor Resume | 0139-2026-06-08

State: CLOSED
Lane: P01

## Purpose

Fix the remaining `chatgpt/wsl-chrome-2` live-follow recovery failure after
Plans 0137 and 0138. Identity now repairs correctly and operator recovery can
bypass failure backoff, but ChatGPT account-mirror collection still times out
during metadata/detail inventory.

## Current State

- Live identity evidence is provider-app authoritative for
  `consult@polymerconsultinggroup.com`.
- Default status remains `delayed / failure-backoff` after
  `Account mirror metadata collector timed out for chatgpt/wsl-chrome-2`.
- Recovery status with `ignore_failure_backoff=true` is eligible.
- Latest persisted metadata evidence shows:
  - observed this pass: `conversations=28`, `artifacts=23`, `files=23`;
  - retained from cache: `conversations=40`, `artifacts=41`, `files=50`;
  - merged total: `conversations=68`, `artifacts=64`, `files=73`;
  - `attachmentInventory.nextConversationIndex=1`;
  - `attachmentInventory.scannedConversations=1`;
  - `attachmentInventory.scannedProjects=0`;
  - `attachmentInventory.yielded=false`.
- Code currently resumes `attachmentInventory` for Gemini steady-follow, but
  ChatGPT only reuses the cursor in `full_sweep`. ChatGPT steady-follow
  discards the cursor and restarts detail inventory from the beginning each
  pass.
- API logs do not record account-mirror collector phase progress, so timeout
  diagnosis depends on persisted sidecar inference.

## Problem Statement

ChatGPT live-follow cannot make durable progress through large detail inventory
when each steady-follow pass restarts detail reading at the first conversation.
A timed-out pass persists a useful cursor, but the next steady-follow pass does
not use it. The system repeatedly scans the same early detail surface, times
out, and returns to failure backoff.

The missing observability compounds the problem: a timeout only reports the
whole collector timed out, not the last collector phase or cursor position.

## Options Considered

### Option A: Increase collector timeout

Rejected as the primary fix. A larger timeout may mask the symptom but does not
make progress durable. A future large account would hit the same failure mode.

### Option B: Force live-follow recovery into `full_sweep`

Rejected as the primary fix. It would reuse the cursor, but it changes the
sweep semantics and may trigger broader materialization behavior than ordinary
live-follow needs.

### Option C: Resume ChatGPT detail cursors during steady-follow

Chosen. ChatGPT should reuse persisted attachment detail cursors when the prior
evidence proves detail inventory is incomplete. This matches Gemini's progress
model and preserves the bounded per-pass limits.

### Option D: Add phase progress persistence

Chosen as a companion diagnostic fix. Persist lightweight phase progress during
collection so future timeouts identify the last phase and cursor position.

## Scope

- Change ChatGPT attachment cursor selection so steady-follow resumes prior
  `attachmentInventory` when prior asset/detail inventory is incomplete.
- Preserve existing full-sweep cursor behavior.
- Keep project-conversation cursor behavior unchanged unless evidence shows it
  blocks progress.
- Add collector phase progress evidence that can survive timeout failures.
- Surface phase progress through account-mirror status evidence.
- Update tests and docs for the new cursor-resume contract.
- Install and validate against `chatgpt/wsl-chrome-2`.

## Non-Goals

- Do not weaken identity checks.
- Do not bypass provider guard/manual-clear or hard-stop behavior.
- Do not make steady-follow unbounded.
- Do not hand-edit user cache as the product fix.
- Do not change handoff behavior.

## Acceptance

- Unit tests prove ChatGPT steady-follow reuses prior incomplete
  `attachmentInventory` cursor.
- Unit tests prove ChatGPT still starts fresh when prior detail inventory is
  complete or absent.
- Unit tests prove collector phase progress is persisted on timeout.
- Installed live proof on `chatgpt/wsl-chrome-2` shows a recovery pass starts
  from the prior cursor rather than restarting at conversation index `0`.
- Live status exposes phase/cursor evidence sufficient to diagnose any
  remaining timeout.
- Active history-materialization and mirror-completion queues are not leaked.

## Validation Plan

- `pnpm vitest run tests/accountMirror/chatgptMetadataCollector.test.ts`
- `pnpm vitest run tests/accountMirror/refreshService.test.ts`
- focused status/API tests if status shape changes
- `pnpm exec tsc --noEmit --pretty false`
- focused `pnpm exec biome lint` on changed source/test files
- `pnpm run build`
- `pnpm run plans:audit -- --keep 139`
- `pnpm run install:user-runtime-service`
- `systemctl --user restart auracall-api.service`
- live recovery refresh for `chatgpt/wsl-chrome-2` with
  `ignoreFailureBackoff=true`
- live status and queue readback

## Definition Of Done

Plan 0139 closes when ChatGPT steady-follow makes durable progress through
detail inventory by resuming its persisted attachment cursor, and future
metadata timeouts expose the last collector phase/cursor evidence instead of a
generic timeout only.

## Closeout

- Implemented ChatGPT steady-follow cursor selection so prior
  `attachmentInventory` resumes when previous evidence proves detail inventory
  is incomplete; complete or absent detail evidence still starts fresh.
- Added collector progress evidence for account-mirror phases and retained the
  latest phase/cursor evidence on timeout failures.
- Status readback now preserves `metadataEvidence.collectorProgress`.
- Live installed proof for `chatgpt/wsl-chrome-2`:
  - before recovery, status was `eligible` with provider-app authoritative
    identity `consult@polymerconsultinggroup.com`;
  - persisted cursor was
    `attachmentInventory.nextConversationIndex=1`;
  - bounded recovery refresh still timed out, but post-timeout status exposed
    `collectorProgress.phase=detail-inventory`,
    `collectorProgress.event=failed`, and
    `collectorProgress.attachmentCursor.nextConversationIndex=1`, proving the
    pass started from the prior cursor instead of index `0`.
- Queue readback after the live proof:
  - active history-materialization jobs: `0`;
  - queued/running mirror completions: `0`;
  - idle-waiting/paused live-follow completions remained as scheduled
    live-follow state, not foreground leaks.
- Validation:
  - `pnpm vitest run tests/accountMirror/chatgptMetadataCollector.test.ts tests/accountMirror/refreshService.test.ts`
  - `pnpm vitest run tests/accountMirror/statusRegistry.test.ts`
  - `pnpm exec tsc --noEmit --pretty false`
  - focused `pnpm exec biome lint` on changed account-mirror source/test files
  - `pnpm run build`
  - `pnpm run plans:audit -- --keep 139`
  - `pnpm run install:user-runtime-service`
  - `systemctl --user restart auracall-api.service`
