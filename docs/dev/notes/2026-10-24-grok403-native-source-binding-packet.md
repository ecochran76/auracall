# Grok native upload source-binding packet — #403

State: BLOCKED_NATIVE_DISCOVERY. Proposal only; no provider upload authorized or
performed. Work: [#403](https://github.com/ecochran76/auracall/issues/403),
[Plan0452](../plans/0452-2026-10-24-grok-upgrade-spec.md), Plan0453.
Source base: `83e0951e8ca6b1da564be940088c671cc9e9ddd5`.

## Verified missing contract

`createGrokFileClient.upload` binds the exact composer/native input, dispatches
one `DOM.setFileInputFiles`, checks the native FileList and observes added stable
provider IDs and ready/error/progress state in the same composer. It deliberately
returns `unconfirmed/grok_file_source_binding_unavailable` after otherwise-ready
observations: no surveyed evidence joins those provider IDs to the exact selected
File object/content. Existing regression coverage rejects an unrelated newly
ready same-name chip. Keep that guard and the normal prompt's refusal intact.

Focused source inspection found no Grok composer-upload request/response parser
or captured native upload wire schema. Existing account/project file paths use
DataTransfer plus basename/UI persistence, which cannot supply this missing
binding. The adapter's Network response observer at project creation watches
`/rest/workspaces` error responses; it is unrelated to composer upload identity.
The [survey](2026-10-24-grok-ux-survey.md) explicitly performed no upload. Neither
a generic CDP request ID nor same-name/count changes establish byte-to-ID proof.
Do not invent upload endpoint/response keys or infer source binding from timing.

## Prepared exact synthetic inputs

The following local files were created without provider interaction. Both have
basename `same.txt`, length 104 bytes, UTF-8/ASCII content and distinct SHA-256.
They contain a ticket marker plus a statement that they have no private data or
external-action instructions. Existing differing files would have been preserved.

| Local file | SHA-256 |
| --- | --- |
| `/tmp/auracall-grok403-native-20261024/a/same.txt` | `ba9c19c698d121877c84db5fb7ef38114c3f7646e741e40b1d7af893df63556e` |
| `/tmp/auracall-grok403-native-20261024/b/same.txt` | `a480e9c9947f0be6a3ef946788f54d42761790b8a0ac453cd7e683c396c40d37` |

Their contents can be reproduced exactly by replacing TAG with A or B in:

```text
AuraCall ticket 403 synthetic native binding canary TAG.
No private data or external action instructions.
```

Both lines end with one LF. Recheck bytes/hash before use; temporary paths alone
are not durable artifact proof. Do not substitute an arbitrary local file.

## Proposed target and effects

The supported read-only profile/config readback for the sibling
[#408 packet](2026-10-24-grok408-native-discovery-packet.md) confirms AuraCall
runtime profile `default`, browser profile `default`, resolved provider `grok`.
It does not prove a current Grok account identity. Before effects, bind and verify
one exact configured expected account, opaque account reference, owned browser
process identity and target. Account drift, absent binding or ambiguous custody
stops execution. Use separate owned empty root composers for the two inputs;
serialize them under the existing Grok authority. Do not borrow a foreign tab.

After explicit authorization, permit at most two provider uploads: one exact
file A, then file B on a separately qualified empty composer, with no prompt
submission. The first prospective command is:

```sh
auracall grok-files --runtime-profile default --action upload \
  --paths /tmp/auracall-grok403-native-20261024/a/same.txt --json
```

The second uses the exact B path only after the first target/effect is reconciled
and the separate target has qualified custody. These commands are proposed, not
executed. The current source should return unconfirmed even if the upload was
accepted; that result does not authorize an automatic repeat. It may already
have persisted synthetic bytes to the provider account. Preserve that target.

## Bounded native capture and acceptance

1. Before each single dispatch, retain account/target/composer/project identity,
   existing stable file IDs and limits, and the synthetic file hash/length.
   Attach observation only to that owned target and exact operation window.
2. Capture the actual upload mechanism and request/response relationship:
   origin/path/method, request ID, frame/loader/initiator as available, content
   representation and returned provider file ID/readiness. Do not retain headers,
   cookies, credentials or unrelated request/response bodies. Keep raw private
   observations outside Git and curate a structural fixture afterward.
3. Require a positive link from the selected bytes to the actual upload body and
   from that request's completed response to its exact provider file ID. An
   observed content digest or verified download/readback matching the input hash
   can qualify byte identity. Network.postData may omit multipart file bytes;
   missing data remains unknown. No filename/timestamp/count-only substitute.
4. Read exact composer state for that bound ID and ensure no error/progress or
   context/account drift. Retain explicit unavailable/unknown outcome if the
   provider does not expose enough evidence. Do not count a visible ready chip
   as source-binding proof.
5. Use A and B observations to demonstrate different byte identities despite
   the same basename/length. Build real-path provider-free tests that reject
   swapped IDs, unrelated ready chips, wrong digest, late/foreign responses,
   context drift and incomplete response data before enabling success.
6. Re-run the public CLI/API/MCP path with the source fix at an exact integrated
   commit and separately verify installed identity/native behavior. A discovery
   upload is not installed or finished-product acceptance.

Stop on CAPTCHA/MFA, warning, entitlement block, unqualified ownership, request
ambiguity, unexpected provider consent or any unknown effect. Reconcile retained
state before any retry. No Send, project mutation, file deletion or destructive
cleanup is included. Retain synthetic provider files for attribution; cleanup
requires separately qualified target/action authority.

## Validation and disposition

The two prepared files have the exact hashes/length above. `git diff --check`
passes for this documentation-only packet. No production behavior changed and no
product test/red-green claim is made. Existing source-binding tests and accepted
review remediation remain intact; #403 stays open and #409 remains blocked.
Memory disposition: forbidden — no explicit user request to write memory.
