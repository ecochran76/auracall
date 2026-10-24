# T04: Submit and complete Grok text prompts reliably

Status: proposed; not a published implementation issue.
Parent: https://github.com/ecochran76/auracall/issues/398

## What to build

Select an explicit model or preserve the current one, submit intact prompts and return attributable completed responses.

## Blocked by

- T02: Admit owned Grok backend requests before dispatch

## Acceptance criteria

- [ ] Verify selected model/entitlement including Build discovery; explicit selection misses reject.
- [ ] Multiline text/token boundaries survive; target one exact composer/submit surface.
- [ ] Delayed/unknown commit never blindly triggers another send.
- [ ] Streaming pauses, same-length replacements, warnings and terminal response evidence are distinguished.
- [ ] Validate public behavior with the agreed source/installed/live evidence distinctions; update operator docs and decision traceability.

No live effect is authorized by this draft. Bind exact target and authority in the execution packet.
