# Grok retained artifact materialization

A successful configured `grok-build --action export` now rechecks the native
workspace ZIP against its retained byte count and SHA256, then records it in the
existing run archive. The Build result's `materialization` field reports
`indexed`, `not_materialized`, or `failed`, local archive item IDs and verified
bytes. A persistence or verification failure does not turn the already observed
export effect into a safe retry. Native export still needs its own effect authority;
materialization does not implicitly request another export.

The new archive item ID is a local receipt identifier. It is not a provider app,
version, file or artifact ID. Its metadata retains the exact observed account
reference, target, conversation, assistant, current gateway, archive checksum and
app/version fields. Unobserved app/version remains null. Build account-reference
hashes are not reinterpreted as another subsystem's account identity namespace.

Use existing public surfaces to inspect and reuse the selected item:

```sh
auracall api archive --provider grok --kind generated_artifact --json
auracall api archive-materialize '<returned-local-item-id>' --json
auracall api archive-materialization-create '<returned-local-item-id>' --json
```

The existing HTTP interfaces are `GET /v1/archive`,
`POST /v1/archive/items/{archive_item_id}/materialize`, and durable jobs under
`/v1/archive/materializations`. The corresponding existing MCP archive contracts
remain the shared materialization interfaces. Queued archive jobs keep their durable job ID,
active-job reuse, cancellation/recovery and foreground-work gate. A selected
Build receipt is bounded to one archive of at most25MiB. Its local reuse performs
no provider download. Existing history-materialization item budgets, cursors,
provider drain/foreground yielding and restart contracts are unchanged; this
bridge does not broaden Grok history coverage or replace its checkpoints.

Every selected Build archive is independently rechecked before reuse or serving.
Missing, changed, symlinked or otherwise unqualified bytes become unavailable;
the original checksum is retained. `force` does not silently fetch a replacement
workspace snapshot. Replacements need a separately authorized exact native export.
The generic filename/URI fallback cannot lend a Build archive to another artifact.
Never execute or extract generated code merely to validate materialization.

Build/Ops materialization coverage is explicitly limited to the selected archive.
It reports verified local counts/bytes with `complete=false`,
`referencedFiles=not_qualified`, and observed/unobserved app identity. Ops counters are the last indexed observation at `observedAt`; they are not
a fresh filesystem scan. Read the selected archive item to revalidate its current
bytes. These counters are not account-wide artifact inventory, completed history
backfill or publication proof.
A failed provider read is not a successful empty inventory.

Grok's existing Files context/recent/select/upload APIs do not supply a qualified
referenced-file download API. Referenced-file byte retrieval remains an unmet
#414 gate. Metadata discovery, initial native transfer, verified local reuse,
unavailable bytes and uncertain provider effects remain distinct evidence states;
this archive bridge only qualifies the retained workspace portion. Source tests,
installed identity and any future native acceptance must be reported separately.

Selected-conversation history reconciliation shares one new-transfer budget across
its exact conversation frontier. Each subsequent conversation receives only the
remaining allowance, and zero remaining allowance ends the pass even when the
target-count allowance remains. Cached reuse does not spend this transfer budget.
The durable job's attempt receipts retain the allowance before each attempt;
restarting or issuing another pass does not establish complete provider history
or qualify an unobserved referenced-file download control.

For an explicit `conversationIds` frontier, the public job result also retains
`selectedFrontier`: the exact attempted and unattempted IDs, final target/transfer
budget, `providerHistoryComplete=false`, and `assetCoverage=unknown`. This survives
service restart through the existing durable job store. Unattempted means no
attempt in that pass; it can include an asset already covered by verified archive
reuse. Attempted does not mean complete, available or safe to retry. The field is
an observation checkpoint, not a provider cursor or an automatic resume command.
