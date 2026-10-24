# T15: Mirror full Grok conversation content incrementally

Status: published, OPEN, ready-for-agent (subject to blockers).
Issue: https://github.com/ecochran76/auracall/issues/413
Parent: https://github.com/ecochran76/auracall/issues/398

## What to build

Populate the local mirror with complete observed conversation content and referenced artifact metadata under bounded read budgets.

## Blocked by

- T14: Backfill Grok conversation indexes and follow changes — https://github.com/ecochran76/auracall/issues/412

## Acceptance criteria

- [ ] Resume bounded detail reads with exact conversation/project/Bot identity.
- [ ] Distinguish observed complete content, partial pagination, failure, cache reuse and unavailable history.
- [ ] No work continues navigating or writing late success after cancellation/deadline.
- [ ] Same shared account request/operation guards and foreground priority apply through scheduler/collector composition.
- [ ] Validate public behavior with the agreed source/installed/live evidence distinctions; update operator docs and decision traceability.

No live effect is authorized by this draft. Bind exact target and authority in the execution packet.

Publication approved explicitly in chat after breakdown review. Actor, canonical
URL, full body, OPEN state, labels and blockers were individually read back.
Native sub-issue/dependency mutations are outside the configured action registry;
parent and blocker URLs in the issue body are the supported relationship record.
