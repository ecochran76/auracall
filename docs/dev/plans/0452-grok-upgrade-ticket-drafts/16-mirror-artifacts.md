# T16: Materialize Grok referenced files and generated artifacts

Status: published, OPEN, ready-for-agent (subject to blockers).
Issue: https://github.com/ecochran76/auracall/issues/414
Parent: https://github.com/ecochran76/auracall/issues/398

## What to build

Retain verified local bytes for discoverable referenced files and generated artifacts and resume incomplete work without re-downloading proved assets.

## Blocked by

- T12: Generate Build apps and retrieve their artifacts — https://github.com/ecochran76/auracall/issues/410
- T15: Mirror full Grok conversation content incrementally — https://github.com/ecochran76/auracall/issues/413

## Acceptance criteria

- [ ] Bind each selected asset to conversation/app/version provenance and verify bytes/size/retained checksum as available.
- [ ] Separate metadata-only, transferred, reused, unavailable, partial and uncertain outcomes.
- [ ] Preserve materialization cursor/budgets and foreground-priority drain/restart behavior.
- [ ] Expose local coverage and exact remaining work across public contracts/Ops; do not turn provider failure into successful inventory.
- [ ] Validate public behavior with the agreed source/installed/live evidence distinctions; update operator docs and decision traceability.

No live effect is authorized by this draft. Bind exact target and authority in the execution packet.

Publication approved explicitly in chat after breakdown review. Actor, canonical
URL, full body, OPEN state, labels and blockers were individually read back.
Native sub-issue/dependency mutations are outside the configured action registry;
parent and blocker URLs in the issue body are the supported relationship record.
