# Live-Follow Reverse-Mtime Frontier | 0145-2026-06-27

State: CLOSED
Lane: P01

## Purpose

Use the provider conversation list order as a first-class freshness signal for
account-mirror live follow. ChatGPT, Gemini, and Grok all expose chats in
reverse modified-time order, so a bounded live-follow pass should not walk old
conversation detail surfaces after it reaches cached-fresh rows.

## Current State

- Live follow already preserves provider-observed conversation order when
  merging newly observed rows into cached catalog rows.
- Conversation freshness derivation can mark a row stale when index/list
  evidence is newer than cached detail or manifest evidence.
- Materialization priority can use stale, partial, and missing-asset freshness
  states after catalog rows exist.
- The metadata/detail collector still treats conversation detail inventory as a
  cursor walk. It can resume or restart by index, but it does not currently
  stop at the first cached-fresh frontier in a reverse-mtime conversation list.
- ChatGPT rate-limit incidents showed that repeated old-chat detail/context
  reads are expensive even when the top-of-list index already tells us which
  chats plausibly changed.
- 2026-06-27 implementation progress:
  - added a shared `conversationFreshnessFrontier` helper that selects detail
    candidates from reverse-mtime conversation rows and emits status evidence;
  - threaded cached conversation freshness summaries from persisted catalog
    rows into the metadata collector before detail inventory starts;
  - ChatGPT, Gemini, and Grok conversation detail candidate lists now apply the
    frontier before conversation file/context reads, while ChatGPT Library and
    Grok account-file inventory remain separate;
  - `full_sweep` keeps selecting every row, while missing mtime, stale cache,
    missing local assets, and incomplete large-chat chunks still select detail;
  - `liveFollow.freshFrontierThreshold` is now configurable, defaulting to `3`;
  - unit/type/lint/plan-audit validation has passed;
  - installed runtime packaging/restart succeeded and the installed CLI started
    bounded steady-follow operation
    `acctmirror_completion_fa025714-358f-4b0c-bc7b-654608198ad2`, but the
    operation blocked before collection with
    `account_mirror_identity_mismatch` for expected
    `eric.cochran@soylei.com`, so live frontier readback and reduced
    detail-read churn remain unproven.

## Problem Statement

Live follow is doing more provider work than needed. Once a provider returns a
reverse-mtime conversation list, the newest rows are the only rows likely to
need detail refresh in ordinary steady-follow. If a pass reaches a contiguous
span of cached-fresh rows with no missing local assets and no incomplete
message chunk cursor, continuing to navigate/read older conversations burns
provider interactions without improving cache completeness.

The fix should preserve `full_sweep` and `full_missing_assets` semantics. This
is not a metadata-only retreat; it is a lower-churn way to choose which detail
surfaces deserve browser work.

## Cross-Service Design

1. Add a shared reverse-mtime frontier model.
   - Store or pass a lightweight map keyed by provider conversation id.
   - Include cached `detailObservedAt`, `manifestObservedAt`, freshness state,
     routeability state, asset completeness, missing-local counts, and any
     incomplete detail chunk cursor.
   - Treat `updatedAt`, `lastMessageAt`, or equivalent provider mtime from the
     list row as the remote freshness marker.

2. Keep list/index refresh as the front door.
   - Each pass may still read the bounded conversation list for the service.
   - The frontier applies before expensive detail surfaces such as context,
     conversation files, project files, media inventory, or artifact scraping.

3. Evaluate rows top-down.
   - Read detail for changed, unknown, partial, stale, missing-asset, or
     incomplete-chunk rows.
   - Count cached-fresh rows toward a contiguous fresh frontier only when the
     provider row has a usable mtime and the cache proves detail/manifest/assets
     are current.
   - Stop steady-follow detail scanning after the configured fresh-frontier
     threshold, unless the sweep mode requires full verification.

4. Preserve explicit catch-up modes.
   - `full_sweep` can continue beyond the frontier when the operator explicitly
     asks for a full verification pass.
   - `full_missing_assets` should skip cached-complete old rows but still select
     old rows with missing local assets.
   - Provider guards, identity mismatch, CAPTCHA/sorry pages, and hard stops
     remain stronger than frontier decisions.

5. Expose evidence.
   - Status should report the provider, sweep mode, frontier decision, rows
     examined, rows selected for detail, first stopped row, and fallback reason
     when the frontier cannot be trusted.

## Service Plan

### ChatGPT

- Apply the frontier to root and project conversation lists after the merged
  reverse-mtime list is assembled.
- Use ChatGPT list-row `updatedAt` as the primary marker, with `lastMessageAt`
  or provider-specific metadata as fallback if present.
- Keep large-chat chunk cursors authoritative: an incomplete context chunk
  always remains selectable even if the list row otherwise appears fresh.
- Preserve account-library inventory as a separate surface. Library file rows
  are not conversation-list rows and should keep their own capped inventory and
  materialization policy.
- Avoid direct `/c/<id>` or context refresh for cached-fresh old rows during
  steady-follow.
- Initial implementation target: `chatgpt/wsl-chrome-3`, because recent
  provider warnings came from repeated SoyLei detail/context work.

### Gemini

- Apply the frontier to the left-rail conversation list, not to arbitrary
  direct `/app/<id>` navigation.
- Keep the existing no-renavigation posture: the rail/list page is the cheap
  source of order and freshness, while direct conversation navigation remains a
  selected-detail action only.
- Treat malformed sign-in/static app rows, Google `sorry`/CAPTCHA pages, and
  terminal routeability evidence as stop conditions outside the frontier.
- Keep project/Gem discovery opportunistic and separate from conversation
  detail selection.
- Use selected-conversation/bounded catch-up modes for old rows with known
  missing assets rather than sweeping the whole old rail in steady-follow.

### Grok

- Apply the frontier to Grok conversation/history rows before reading
  conversation detail or media surfaces.
- Keep Grok account-file and Imagine inventory separate from chat-history
  freshness; those surfaces may have their own ordering and must not be hidden
  behind the chat frontier.
- Use the frontier primarily to prevent steady-follow from revisiting older
  cached chats when the newer rows already prove no cache change.
- Fall back to existing bounded cursor behavior when Grok rows lack reliable
  mtime evidence.

## Implementation Tracks

### Track A: Shared Freshness Frontier Contract

- Define a provider-neutral `ConversationFreshnessFrontier` input/output shape.
- Add helpers to compare provider-row mtime against cached detail/manifest
  evidence.
- Add explicit fallback reasons for missing mtime, unordered provider evidence,
  incomplete cached detail, missing local assets, active guard, or full-sweep
  override.

### Track B: Collector Integration

- Thread cached conversation freshness summaries from refresh service into the
  provider metadata collector before detail inventory starts.
- Filter or rank detail candidates before `safeReadConversationFiles` and
  `safeReadConversationContext`.
- Preserve existing cursor resume for incomplete inventory and chunked context
  reads.

### Track C: Provider-Specific Adapters

- ChatGPT: prove root and project list rows are descending by mtime and apply
  the frontier to both surfaces.
- Gemini: prove left-rail rows are descending by mtime and keep direct app
  routes selected-only.
- Grok: prove history rows are descending by mtime and isolate chat-history
  frontier decisions from account-file and Imagine surfaces.

### Track D: Evidence, Tests, And Operator Readback

- Add unit tests for:
  - fresh frontier stop;
  - stale newest row selected;
  - missing local assets selected even when old;
  - incomplete large-chat chunk selected;
  - missing mtime fallback to existing cursor behavior;
  - full-sweep override continuing past the frontier.
- Add status evidence for frontier decisions and remaining selected detail
  candidates.
- Add docs/runbook notes for each provider as live proof lands.

## Non-Goals

- Do not reduce the configured cache completeness target.
- Do not change `full_sweep` into metadata-only mode.
- Do not bypass provider guard or identity checks.
- Do not create a new browser-service pacing layer in this plan; browser-service
  pacing remains the lower-level owner for request cadence.
- Do not use the frontier for non-chat surfaces such as ChatGPT Library, Grok
  Files, or Grok Imagine unless those surfaces get their own ordering proof.

## Acceptance

- ChatGPT steady-follow reads the reverse-mtime conversation index and skips
  old cached-fresh detail rows before browser context/file reads.
- Gemini steady-follow uses the rail order as the freshness frontier without
  adding repeated direct app navigation.
- Grok steady-follow uses history order for chat detail selection while keeping
  file/media surfaces separate.
- `full_sweep` and missing-asset catch-up still reach old rows when they are
  explicitly stale, partial, missing local assets, or chunk-incomplete.
- Account-mirror status exposes frontier evidence sufficient to explain why a
  pass stopped, selected a row, or fell back to cursor scanning.
- Focused unit tests and at least one installed live proof pass for the target
  SoyLei ChatGPT lane demonstrate reduced detail-read churn without losing
  cache catch-up.

## Validation Plan

- `pnpm vitest run tests/accountMirror/chatgptMetadataCollector.test.ts`
- `pnpm vitest run tests/accountMirror/conversationFreshness.test.ts`
- `pnpm vitest run tests/accountMirror/refreshService.test.ts`
- Provider-specific tests for Gemini and Grok collector behavior as each
  service slice lands.
- `pnpm exec tsc --noEmit --pretty false`
- focused `pnpm exec biome lint` on changed source/test files
- `pnpm run plans:audit -- --keep 145`
- Installed `chatgpt/wsl-chrome-3` readback showing frontier evidence, provider
  guard clear/cooldown state, and lower detail/context read count than the
  prior cursor-only behavior.

## 2026-06-27 Installed Proof Status

- Implemented ChatGPT row-mtime hydration from already-loaded ChatGPT
  localStorage history caches. This removed the earlier
  `missing_remote_mtime` fallback for most visible rows.
- Implemented raw-cache summary hydration in `refreshService` so steady-follow
  frontier checks can derive cached freshness from persisted conversation
  context plus cached conversation assets, not only pre-attached
  `conversationFreshness` fields.
- Installed proof `acctmirror_completion_d8e1af61-0e52-4394-9789-6ddc0a62d764`
  completed, emitted frontier evidence, but selected all `27` examined rows
  because every row lacked remote mtime.
- Installed proof `acctmirror_completion_92586cf3-2d34-4f07-80e3-8443f4c9b9fd`
  completed after row-mtime hydration. Remote mtimes were present for most
  rows, but the frontier still selected all `27` examined rows with
  `fallbackReason="missing_cached_summary"`.
- Installed proof `acctmirror_completion_22e5919b-db13-42fa-bb88-e24ae43b64b0`
  completed after cached-summary hydration. It selected all `27` examined rows
  with `fallbackReason="cached_state_not_fresh"`; row evidence showed stale
  cached detail and/or `missing_local_assets`, so the live SoyLei lane did not
  contain a contiguous cached-fresh frontier.
- Subsequent installed proof work fixed two live-readback gaps:
  - ChatGPT steady-follow now resets the detail cursor to the newest selected
    rows after frontier filtering, instead of continuing a prior deep cursor
    when the frontier has already excluded at least one cached-fresh row.
  - Scanned conversation detail rows now leave durable
    `detailObservedAt`/`manifestObservedAt`/`detailCompleteness` metadata, and
    cached-summary hydration strips stale embedded `conversationFreshness`
    records before deriving current freshness from row metadata, cached
    context, and assets.
- Installed proof `acctmirror_completion_14973999-511f-4fef-9d87-b6c9b2dfc2d4`
  completed with the scanned-row metadata write path active; persisted
  `conversations.json` then showed rows `0..3` annotated with
  `detailObservedAt="2026-06-27T17:40:08.292Z"` and
  `detailCompleteness="complete"`.
- Installed proof `acctmirror_completion_23b7b425-f9ec-40b5-98ce-d0ea46bdc696`
  ran before the stale-summary rehydration fix was installed. It selected `24`
  of `25` examined rows and scanned `0` detail rows only because it yielded to
  foreground owner
  `response-run:resp_69cc117b60d747d9a769f283f1eacc77:open-notebook-pro-chatgpt-soylei`;
  this is not accepted as frontier proof.
- The final validation retry after installing stale-summary rehydration was
  blocked by ChatGPT provider guard/cooldown:
  `acctmirror_completion_0adca450-6e65-4088-abac-4c75fb96831b` blocked until
  `2026-06-27T18:34:11.106Z`,
  `acctmirror_completion_a54eaaa2-da01-4543-bcd3-a0cbe425a5a9` extended the
  guard until `2026-06-27T18:49:11.119Z`, and
  `acctmirror_completion_8cd8956f-1dec-4813-a9fd-a55ea7756dba` extended the
  guard until `2026-06-27T19:04:11.132Z`.
- At this checkpoint, the implementation emitted actionable frontier reasons
  in the installed service and wrote/rehydrated durable scanned-row freshness
  evidence, but the acceptance gate requiring a guard-clear installed live pass
  with lower detail/context read count than cursor-only behavior was still not
  met on the target live lane.
- Follow-up installed proof found that later index-only merges could still
  erase the scanned-row detail metadata because conversation merges were shallow
  over nested `metadata`. The refresh-service persisted-catalog merge and the
  collector root/project merge now preserve existing nested conversation
  metadata while still accepting incoming index fields such as title, order,
  and `updatedAt`.
- Installed proof `acctmirror_completion_5ac10f4d-01bf-42cd-93a8-c7cb6032fc1c`
  ran after the metadata-preserving merge was installed. It completed with
  provider guard clear and no foreground-owner yield, but still selected `26`
  of `27` examined rows because the frontier decision happened before that pass
  wrote the repaired scanned-row metadata. It scanned rows `0..3`, persisted
  `detailObservedAt`/`manifestObservedAt`/`detailCompleteness=complete` for
  those rows, and left the cursor at `nextConversationIndex=4`.
- A second bounded installed proof
  `acctmirror_completion_4ea08242-b885-48a4-b0d5-1df31fdbfda3` was started
  after verifying rows `0..3` retained detail metadata, but ChatGPT surfaced a
  visible `Too many requests` guard during `listConversations` before any
  refresh result was recorded. The lane is delayed until
  `2026-06-27T19:44:32.158Z`.
- At this point in the proof sequence, the metadata-preservation defect was
  fixed and the cache contained the expected fresh-row evidence, but the final
  acceptance proof still needed a guard-clear installed pass showing the fresh
  frontier reducing `rowsSelectedForDetail` and `detailScannedThisPass`.
- A local cache-row probe after the metadata-completeness rehydration fix showed
  rows `1..3` deriving `state="fresh"` with `reasons=["detail_current"]` from
  persisted `metadata.detailCompleteness="complete"` even when no detail file
  was loaded.
- Installed proof `acctmirror_completion_a3401827-527a-4d21-9721-943797bd38f8`
  completed on the installed `auracall-api.service` runtime after the ChatGPT
  cooldown expired. The refresh
  `acctmirror_2e6a4275-60ad-48cc-aeb8-a97f4ab44a9f` reported provider guard
  clear, `conversationFreshnessFrontier.frontierReached=true`,
  `rowsExamined=4`, `rowsSelectedForDetail=1`, and first stopped row index `3`
  (`6a3c3aa8-10b4-83ea-99e5-f2952009139b`). Row `0` was selected for
  `cached_state_not_fresh` and `missing_local_assets`; rows `1` and `2` were
  `fresh-frontier`; row `3` was `stopped`; `detailScannedThisPass` was
  `projects=0`, `conversations=1`, `total=1`; `attachmentInventory.yielded`
  was `false`.
- Plan is `CLOSED`: the final installed proof met the target SoyLei ChatGPT
  churn-reduction gate, while focused tests and shared collector integration
  cover the cross-provider ChatGPT/Gemini/Grok frontier contract and preserve
  explicit `full_sweep` semantics.

## Definition Of Done

Plan 0145 closes when ChatGPT, Gemini, and Grok steady-follow detail selection
all use reverse-mtime conversation order as a freshness frontier, explicit
catch-up modes still preserve full cache semantics, and operator status can
explain each provider's frontier decisions without relying on chat history.
