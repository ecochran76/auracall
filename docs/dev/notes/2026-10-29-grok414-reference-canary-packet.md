# Proposed #414 conversation-bound reference canary — 2026-10-29

State: PREPARED — NOT APPROVED; no dispatch.
Authority owner: Plan0458, root coordinator. This is a proposed additional packet,
not a renewal or replay of the four previously approved canaries.

## Concrete effects

One fresh retained root conversation in the configured default Grok browser,
with the exact previously verified account. Select a qualified native Fast chat
mode; refuse an unqualified mode or Build mode. Start with an empty composer,
no other attachments or selected Connectors/tools.

- Upload exactly one local synthetic file, `reference-414.txt`.
- Byte count: 107. SHA-256: `5e34ff7e9d8997af149b7a875940dce6117c1f2b73fc23e7ae159ea197d38e78`.
- Exact UTF-8 contents:

```text
AuraCall ticket 414 referenced-file acceptance.
Synthetic test data only.
No personal data or credentials.
```

- Send exactly one Grok message, verbatim:

> Acknowledge the attached reference-414.txt by filename only. Do not use tools, search, external services, or modify anything.

The file and private packet are prepared under the user-scoped
`implementation-native/20261029-reference-packet` directory. Recheck bytes before
upload. Create a durable attempt fence before dispatch; a timeout or uncertain
upload/Send is not retried. Retain the target, conversation and provider file
identity/response evidence for subsequent bounded read/materialization work.

## Why a new approval is needed

The approved four-effect packet explicitly permitted the403 uploads with no
Send; those uploads were unsent roots with conversationId=null. Current selected
workspace-file acceptance cannot supply conversation-bound upload provenance.
This proposed packet adds one actual Grok Send and a fresh upload. It is not
mail sending, a Connector operation or app publication.

## Acceptance and hard stops

Observe actual conversation-bound provider attachment metadata and the mounted
native preview/download contract. Subsequent implementation uses TDD against that
qualified contract; metadata-only success is not byte acceptance. Preserve
conversation/app/version provenance exactly as observed, leaving absent fields
null. No guessed API endpoints, executed hooks, generated-code execution or
provider identity aliases.

Bounds: one upload, one Grok Send, no automatic replay, no Bot/Connector edits,
no mail Send, no Build generation, no publication, no legal-consent acceptance,
no cleanup/deletion. Stop on account/target drift, CAPTCHA/MFA, new consent,
unqualified controls or uncertain effects; retain evidence. User approval of
this exact packet is required before either provider effect.
