# T13: Publish an explicitly selected Build app through Grok

Status: published, OPEN, ready-for-agent (subject to blockers).
Issue: https://github.com/ecochran76/auracall/issues/411
Parent: https://github.com/ecochran76/auracall/issues/398

## What to build

Publish/share a concrete generated app version through Grok-native controls and report exact publication readback.

## Blocked by

- T12: Generate Build apps and retrieve their artifacts — https://github.com/ecochran76/auracall/issues/410

## Acceptance criteria

- [ ] Observe native publishing control and account availability; do not invent external hosting.
- [ ] Require an explicit concrete app/version operation and preserve its provider-observed publication URL.
- [ ] Unknown publish reconciles before retry; failed/partial states do not claim publication.
- [ ] Bounded native acceptance is separate from source and installed validation; no unapproved version is published.
- [ ] Validate public behavior with the agreed source/installed/live evidence distinctions; update operator docs and decision traceability.

No live effect is authorized by this draft. Bind exact target and authority in the execution packet.

Publication approved explicitly in chat after breakdown review. Actor, canonical
URL, full body, OPEN state, labels and blockers were individually read back.
Native sub-issue/dependency mutations are outside the configured action registry;
parent and blocker URLs in the issue body are the supported relationship record.
