# Grok #403 — source and native upload acceptance packet

State: ACCEPTANCE_PACKET_READY. Primary owns final acceptance and tracker closure.
Work: [#403](https://github.com/ecochran76/auracall/issues/403),
[Plan0458](../plans/0458-2026-10-25-grok-native-frontier.md).

## Qualified execution

Native source was frozen at `53cbfbb7a4dd6fc1ccd4f7edbe0b299515970dde`.
Each receipt records actual source/dirty state and helper hashes. Root-owned dirty
changes were CLI registration and documentation, not the File implementation.
The primary must verify intended-main File modules against that frozen source.

Two approved synthetic uploads were performed, each on a distinct genuinely new,
empty owned root composer in configured `default/grok`. Both files were named
`same.txt`, both were104bytes, and their bytes and provider metadata IDs differed.
Configured account proof matched before/after; no account identifiers or asset
URLs are reproduced here. Both targets and the original claims remain retained.
No Send or upload replay occurred; the approved two-upload allowance is exhausted.

A initially remained unconfirmed. Its exact native File object, digest, provider
metadata and server-rendered bytes were subsequently reconciled without replay;
the uncertainty history and supported settlement audit remain intact. After the
readiness repair, the public source command function returned complete/ready for
A context with `sourceAgreement: observed-native`. B's single public source upload
returned complete/`grok_files_ready` with `sourceAgreement: local-manifest`.

Actual committed renderer and composer evidence qualified readiness: valid
metadata suppresses phase-based loading presentation, and the same form's native
Submit handler and aria-disabled state follow committed `isQueryable`. A's
file-only composer was queryable with an empty editor. No button was submitted.

## Original criteria

| Criterion | Source evidence | Native evidence |
| --- | --- | --- |
| Duplicate basenames cannot establish attachment identity. | Same native File object, SHA256/length, verified account URI and metadata ID; wrong bytes/account/File and conflicting props rejected. Recent selection fixture uses a unique provider ID. | A and B share basename/length, differ in digest and provider ID; each actual provider preview contains its exact104bytes. |
| Ready/error/progress states come from the exact composer; missing confirmation fails visibly. | Committed-root/host proof, root consistency, same-form native Submit eligibility; false/stale/prose/other-form/disabled/private/deleted gates remain non-ready. Error/progress and lost-context fixtures remain fail-closed. | Actual committed render/submit predicate captured; A context and B upload report ready. Phase alone was not used as readiness. |
| Selected project/file context and limits are explicit; no silent proceed-anyway path. | Bound composer, provenance and input limits; project drift, native selection mismatch and error fixtures reject continuation. | Root scope, sole file, empty composer, file-input state and same account/target/generation qualified before each upload. No project mutation or native limit fault injection. |
| Public wrapper outcomes and artifact provenance remain coherent under governed requests. | CLI/MCP configured-authority fixtures, missing-governor refusal, unknown cleanup custody, normal prompt attachment preparation and account-drift guard. | Actual public command function used configured service/native transport. B emitted one completed HTTP200 upload response with matching `fileMetadata.fileMetadataId`; exact Open attachment returned server200 and matching preview digest. CDP omitted request body bytes, so no wire-body digest is claimed. |
| Validate source/installed/live distinctions; update operator docs and decision traceability. | Source commits `be8cfc177`, `ba399fa6c`, `dfc064364`, `3aaa7c958`, `f716e2a6c`; configuration, journal and fixes log updated in the same slices. | Native evidence is tied to frozen source53cb, not an installed-runtime replacement or compiled executable acceptance. |

Focused validation: `pnpm vitest run tests/browser/grok403Files.test.ts tests/browser/grokProviderSessionBinding.test.ts --maxWorkers=1` —38tests passed. Full typecheck and targeted Biome/diff checks passed on the worker source; primary integration validation remains separate.

## Evidence locators and limits

Private immutable receipts are under
`~/.auracall/private/grok/implementation-native/plan0458-403/`:

- `canary-a-public-native-ready-v4.json` — SHA256 `83741dd21f7620b00833bd06adb7219619f948566c0663f4c9905431f31209ca`.
- `canary-b-native-acceptance-composite-r14.json` — SHA256 `c01af15efd5e3170522da1c88c3e9eb3f78ac44bfafa95bc487b9d79b978d0d1`.

These composites link the raw account, source, dispatch, before-close, native
response and exact server-byte receipts by hash. B's wire response schema was
observed as `{uploadId, fileMetadata}`; upload-operation ID and provider file ID
remain distinct. Ordinary configured utility cleanup completed and no Grok lease
remained unreleased after the canaries.

Native Recent item selection remains unqualified; the first public attempt
opened its owned chooser and failed before item dispatch. That path currently
has provider-free exact-ID selection coverage only. No real Send, installed-runtime adoption,
private-file upload, deletion or publication is claimed. The primary should
resolve any additional native Recent acceptance requirement before closing403.
Memory disposition: forbidden — no explicit request to write memory.

Recent chooser follow-up: one public selection request opened the Attach and
Recent menus, then failed during chooser observation before reaching the item
selection expression. Exact source-expression replay qualifies zero item dispatch;
this is distinct from the two observed menu opener clicks. The additive public
`selectionDispatch: "not-dispatched"` field preserves that attribution through
cleanup errors. Overall `unconfirmed` status, retained target and unknown-effect
fence remain intact until supported evidence reconciliation. No retry is implied.
Native Recent row metadata and successful selection remain unqualified.

Passive guard-attribution read r20 proves the retained Recent subtree exceeds
the prior 256-depth bound: form/Attach each found its unique host, but another
current branch reached depth 256; Recent trigger/chooser/rows exhausted ancestry
at 256. No failed-root props established metadata. The shared observer now permits
512 ancestry/topology depth with the same 20,000-node budget, exact scope host,
unique-host and stable-current checks. File and Connector readers use that same
helper. A deep portal plus unrelated deep branch regression fails before this
correction and passes after; ancestry, topology and node-budget exhaustion still
return unavailable. This is source qualification, not native Recent acceptance.
