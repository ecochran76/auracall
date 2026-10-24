# T01: Govern Grok reads and expose effective account controls

Status: proposed; not a published implementation issue.
Parent: https://github.com/ecochran76/auracall/issues/398

## What to build

Run a bounded Grok identity/model-discovery command through shared account operation governance, with the same controls and outcomes in CLI/API/MCP and Ops status.

## Blocked by

None — can start immediately.

## Acceptance criteria

- [ ] Exact runtime profile/account/target custody is verified; Grok stays serialized.
- [ ] Concurrent processes share operation caps; warning/ownership failures block before effects.
- [ ] Effective account settings, overrides, wait reason and next eligible time are visible; waiting is bounded and cancellable.
- [ ] Preserve ChatGPT/Gemini behavior; discriminate this Grok path with real orchestration tests.
- [ ] Validate public behavior with the agreed source/installed/live evidence distinctions; update operator docs and decision traceability.

No live effect is authorized by this draft. Bind exact target and authority in the execution packet.
