# Grok index mirroring

The existing account-mirror refresh and live-follow operations collect bounded
Grok root and discovered project history. Each completed scope read stores its
qualified rows and continuation together in a private account-bound checkpoint
under `~/.auracall/cache/account-mirror/grok-index/`. Runtime profiles and accounts
have separate checkpoint keys. Files use private permissions and atomic rename.

A cancelled or failed in-flight scope does not advance its continuation. A later
refresh replays that scope while retaining completed scope reads. After visible
scopes finish, steady follow preserves that completed backfill and makes bounded
fresh head observations. Stored row fingerprints identify new or changed rows
in that observed window; unfinished head work resumes without resetting the
archive checkpoint. Newly discovered projects receive bounded inventory work.
Retained rows survive incremental reads. Relative labels such as today or an
item age remain estimates for since-filtering; they are omitted from durable
`updatedAt` and change fingerprints. Qualified absolute timestamps still detect
date changes. Legacy checkpoints can normalize earlier unqualified estimates
once through existing bounded continuation before reaching a stable frontier.
Provider warning/failure is still a
failure, rather than permission to serve cached success.

Visible Chats does not establish a global newest-first change feed. Reaching a
known head fingerprint qualifies only the observed window; older changes outside
it remain unobserved and require an explicit `full_sweep`. All qualified rows
already present in that observed page are considered, including changes after
an unchanged row. A row-limit continuation preserves unfinished observed work. Follow reports this
partial coverage rather than claiming the entire archive is unchanged. Explicit
full sweeps use their own resumable bounded work and retain prior rows. Fresh
cursor-null observations reset the owned history scroll surface to its head;
cursor-bearing continuations keep their position. Public follow progress includes
`observationCoverage: partial` and `requiresFullSweep: true`; row fingerprints and
frontier identifiers remain private.

Use the existing completion operation for an explicit sweep:
`POST /v1/account-mirrors/completions` or MCP
`account_mirror_completion_start`, selecting `provider: grok`,
`sweepMode: full_sweep`, an explicit `maxPasses` bound and
`materializationPolicy: metadata_only` for metadata work. The ordinary refresh
MCP tool does not expose sweep mode.

Foreground work can request cooperative yield before project discovery, between
history pages/scopes and before account-file/detail inventory. A dispatched page
retains the existing provider-call deadline; yield does not interrupt an unknown
provider effect or authorize another browser owner.

Bounded history reads retain an AuraCall-owned history view for the exact
account, browser generation and query. Settled views can coexist, while active
history and foreground utility work share exclusive admission. Missing browser
process provenance refuses the read before target discovery or creation. A
changed endpoint/process fingerprint also refuses before target lookup or any
original custody mutation; absence from another browser cannot prove target loss. An
uncertain cleanup fences later utility admission until ownership is reconciled.

After a process restart, a retained view continues under the same page bound. If
the view was lost, successive bounded reads rebuild its prefix to find the saved
anchor. A vanished anchor requests a fresh bounded sweep instead of repeating an
unchanged cursor indefinitely. Legacy unowned cursors likewise report
`cursor-restart-required` and clear the private continuation; retained rows are
deduplicated during replay. Project histories use the same qualified bounded
reader, rather than treating the mounted sidebar subset as a complete inventory.

Public account-mirror metadata evidence adds `grokIndex`: visible-scope
`phase` (`backfill` or `follow`), `state`, completed/total scope counts, retained
row count and omissions. Public progress reports `active` while a refresh runs
and `failed` when the latest failed refresh is unresolved, overriding older
checkpoint state. Existing eligibility/backoff remains authoritative. Opaque cursors are absent
from this public evidence and mirrored conversation metadata.

Visible Chats completion does not prove hidden or undiscovered Bot scopes.
Observed Bot provenance stays with its conversation; unresolved scope discovery
is reported as an omission. This source change does not enable a scheduler,
install a runtime, or establish native account-wide acceptance.

## Bounded conversation detail (#413)

Detail reads request fresh content with cache fallback and automatic retries
disabled. They carry the exact conversation/project route and positive Bot
provenance from Chats; absence of Bot provenance remains unknown. Foreign active
routes fail before content extraction, and route identity is checked again before
return. Governed detail passes omit independent account-file inventory and use
one context visit for messages and referenced file metadata.

The private detail cursor resumes mounted-message chunks. Each context reports
`observedContent` (`partial` until the last mounted chunk, then `complete`) and
`historyCoverage` separately. The current mounted-DOM reader reports history as
`partial`, with `reason: history-boundary-unobserved`; even the final mounted
chunk cannot establish that older unloaded history is absent. No provider API or
pagination capability is inferred from a visible response card.

The DOM reads text, sources and referenced file metadata only for the selected
card slice; row counting and its compact inventory fingerprint do not transport
unselected message text. Successful chunks retain a contiguous cached prefix. Continuations must match the
same mounted-row inventory fingerprint, conversation, project and positively observed
Bot identity; changed snapshots fail instead of joining unrelated content. Failed
reads retain their unfinished detail cursor. An explicit cache-only context read
can return retained content; a failed fresh mirror read cannot silently use it.
Unavailable mounted history is a failure with explicit unavailable diagnostics,
not an empty successful conversation. Context-read receipts distinguish failure,
timeout and cancellation. No incomplete-history visit is promoted to complete
frontier evidence.

Cancellation is checked after acquisition, before navigation and content/file
reads, and before cache publication. Mirror extraction does not click source
chips or asynchronously expand source panels. Existing account request admission,
operation governors and foreground scheduler yielding continue to apply; reaching
a local bound does not clear a provider warning.

Validation is provider-free source evidence. Installation, current native Grok
history pagination/end-boundary observation, and hidden Bot scope discovery remain
separate qualification gates. No live effects or scheduler enablement are implied.

A bounded follow read preserves previously qualified messages and references
outside its current chunk when the mounted-row inventory and conversation,
project and Bot custody still match. An unreadable mounted card is unavailable
content, rather than permission to advance past missing text. Later chunks
preserve literal assistant text even when it quotes project instructions.
Cancellation remains authoritative after cache and receipt delivery boundaries;
a pre-dispatched local write may finish, but cannot become a successful Grok read
after cancellation.
