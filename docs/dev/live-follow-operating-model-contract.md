# Live-Follow Operating Model Contract

This contract records the shared live-follow vocabulary used by account-mirror
completion, scheduler, status, CLI/API readback, and operator surfaces.

The source of truth in code is
`src/accountMirror/liveFollowOperatingModel.ts`.

## Routine Phases

Collector phases:

- `identity`: verify the provider account binding without mutating provider
  state.
- `projects`: read the provider project index.
- `root-conversations`: read account-level conversation rail/catalog rows.
- `project-conversations`: read project-scoped conversation rows.
- `chatgpt-library`: read ChatGPT account-library metadata.
- `detail-inventory`: load selected chats and parse context, files, artifacts,
  media, and remote download references.
- `merge-persisted-catalog`: merge newly observed rows with persisted catalog
  state.
- `complete`: no collector phase remains for the current evidence window.

Routine-only phases:

- `materialization`: recover or materialize known remote assets according to
  policy.
- `account-library`: advance account-library catch-up work.

## Routine Decision States

- `disabled`: live follow is not enabled for this account.
- `unsupported`: the provider/account cannot currently support live follow.
- `missing_identity`: the target lacks provider account identity proof.
- `provider_guarded`: provider guard, CAPTCHA, sorry page, or cooldown blocks
  work.
- `operator_preempted`: foreground operator/API/browser work has priority.
- `running`: a live-follow completion is running or in its idle waiting state.
- `queued`: live-follow work is queued but not running yet.
- `paused`: an active live-follow completion is paused.
- `attention_needed`: the latest live-follow completion failed, blocked, or was
  cancelled.
- `backfilling`: historical metadata catch-up remains.
- `steady_follow`: newest-first maintenance is active.
- `materialization_pending`: metadata is sufficient for the current policy, but
  local bytes or materialization work remain.
- `account_library_catchup`: account-library catch-up remains.
- `caught_up`: live-follow metadata is current for configured provider surfaces.
- `eligible`: the account can run the next routine pass now.
- `delayed`: cadence, politeness, or another non-terminal delay is active.

## Materialization Backlog States

- `none`: no known remote assets are missing local materialization.
- `metadata_current_backlog`: metadata is current under the active policy, but
  known remote assets are not local.
- `materialization_required`: active policy requires local bytes and known
  remote assets are missing locally.
- `inventory_unknown`: remote asset inventory is not complete enough to judge
  local materialization.

`metadata_current_backlog` must not reselect a chat for detail scraping by
itself. Policies that require local bytes should expose or queue
`materialization_required` work instead.
