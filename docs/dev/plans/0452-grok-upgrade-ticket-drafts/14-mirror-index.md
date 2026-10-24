# T14: Backfill Grok conversation indexes and follow changes

Status: proposed; not a published implementation issue.
Parent: https://github.com/ecochran76/auracall/issues/398

## What to build

Run bounded resumable account-wide index backfill followed by incremental follow, with foreground preemption and restart recovery.

## Blocked by

- T03: Discover current Chats and scoped conversation history

## Acceptance criteria

- [ ] Discover root/project/Bot chats when available; retain omissions and coverage.
- [ ] Persist cursor/phase/next eligibility across cancellation, safe yield and restart.
- [ ] Foreground work prevents new background phases and receives bounded cooperative drain.
- [ ] CLI/API/MCP/Ops show active/paused/partial/failed states; stale cache does not erase a fresh failure.
- [ ] Validate public behavior with the agreed source/installed/live evidence distinctions; update operator docs and decision traceability.

No live effect is authorized by this draft. Bind exact target and authority in the execution packet.
