# T11: Configure Bot Connectors, Skills and knowledge

Status: proposed; not a published implementation issue.
Parent: https://github.com/ecochran76/auracall/issues/398

## What to build

Configure supported Connector/tool permissions, Skills and knowledge sources for an exact owned Bot and verify its saved configuration.

## Blocked by

- T05: Use exact composer attachments and recent files
- T06: Inspect Grok Connector catalog and installed state
- T10: Create and edit Bot instructions and model defaults

## Acceptance criteria

- [ ] Discover configuration choices and distinguish granted tools from merely listed services.
- [ ] Persist/read back exact Connector/Skill/source identities; duplicate filenames/names remain unambiguous.
- [ ] Missing provider controls report unsupported/account-gated and leave the corresponding acceptance gate open.
- [ ] No catalog Bot install, deletion, scheduling, memory or appearance controls are added.
- [ ] Validate public behavior with the agreed source/installed/live evidence distinctions; update operator docs and decision traceability.

No live effect is authorized by this draft. Bind exact target and authority in the execution packet.
