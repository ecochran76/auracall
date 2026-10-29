# Proposed #414 conversation-bound reference canary — 2026-10-29

State: APPROVED AND CONSUMED — user replied yes to this exact packet.
One upload and one Grok Send were dispatched; no replay is authorized.
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
unqualified controls or uncertain effects; retain evidence. The user approved this exact packet before both provider effects.
That approval is consumed; it does not authorize another upload or Send.

## Execution checkpoint

A fresh retained root passed the original-account and native Fast checks. One
107-byte upload returned complete/ready with the expected source SHA-256. One
Grok Send returned from the submit helper; its terminal-response wait timed out.
The same retained target was reconciled read-only, with no resubmission: the
reply acknowledges the exact filename and the human response DTO binds the actual
uploaded fileMetadataId to the new conversation. DOM response identity and
gateway identity remain distinct. Canonical human DTO membership is independently
qualified; metadata is not yet referenced-byte acceptance.

One reversible native Open attachment click exposed its actual Download control.
Its current committed SidePanel cache pairs the exact active file metadata with
the actual native asset URL and observed asset-server origin; no URL was guessed.
A separate referenced-file adapter is being implemented through TDD against this
contract. Raw identity, URL/cache and effect-fence receipts remain private.
