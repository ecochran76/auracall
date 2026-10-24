# Grok index mirroring

The existing account-mirror refresh and live-follow operations collect bounded
Grok root and discovered project history. Each completed scope read stores its
qualified rows and continuation together in a private account-bound checkpoint
under `~/.auracall/cache/account-mirror/grok-index/`. Runtime profiles and accounts
have separate checkpoint keys. Files use private permissions and atomic rename.

A cancelled or failed in-flight scope does not advance its continuation. A later
refresh replays that scope while retaining completed scope reads. After visible
scopes finish, follow starts from their current heads on the next bounded cycle;
retained rows survive incremental reads. Provider warning/failure is still a
failure, rather than permission to serve cached success.

Foreground work can request cooperative yield before project discovery, between
history pages/scopes and before account-file/detail inventory. A dispatched page
retains the existing provider-call deadline; yield does not interrupt an unknown
provider effect or authorize another browser owner.

Public account-mirror metadata evidence adds `grokIndex`: visible-scope
`phase` (`backfill` or `follow`), `state`, completed/total scope counts, retained
row count and omissions. Existing refresh state and eligibility/backoff remain
authoritative for active, paused and failed operations. Opaque cursors are absent
from this public evidence and mirrored conversation metadata.

Visible Chats completion does not prove hidden or undiscovered Bot scopes.
Observed Bot provenance stays with its conversation; unresolved scope discovery
is reported as an omission. This source change does not enable a scheduler,
install a runtime, or establish native account-wide acceptance.
