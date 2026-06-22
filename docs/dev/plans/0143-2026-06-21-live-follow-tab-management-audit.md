# Live-Follow Tab Management Audit | 0143-2026-06-21

State: CLOSED
Lane: P03

## Current State

- A local incident review found the default ChatGPT tenant browser profile
  `~/.auracall/browser-profiles/default/chatgpt` holding multiple live
  `chatgpt.com` page targets after account-mirror/live-follow activity.
- The immediate operator cleanup closed those default-profile page targets and
  confirmed the corresponding DevTools port exited, but the repo still needs a
  product-code fix so read-only live-follow work does not leave disposable tabs
  behind.
- AuraCall still owns normal managed browser launches directly in this slice.
  Agent-browser cutover remains a future architecture direction; current fixes
  must tighten AuraCall's tab lifecycle contract without assuming agent-browser
  has already become the browser owner.

## Audit Evidence

- Shared browser-service target creation is centralized in
  `packages/browser-service/src/chromeLifecycle.ts`:
  - `openOrReuseChromeTarget(...)` reuses exact/blank/same-origin targets,
    records `target-open-or-reuse` mutation audit rows, and calls
    `cleanupChromeTargetStockpile(...)`.
  - Cleanup is therefore triggered only when callers use this shared open/reuse
    primitive.
- `LlmService.buildListOptions(...)` resolves the service target, passes
  `browserService`, carries mutation audit, and forwards the selected tab target
  into provider list options.
- Gemini and Grok provider adapters consistently close newly opened read tabs
  in `finally` blocks when `shouldClose && targetId`.
- ChatGPT `connectToChatgptTab(...)` computes `shouldClose`, `targetId`, `host`,
  and `port`, but most ChatGPT read/list operations destructure only `client`
  and close the CDP session. They do not close disposable tabs returned by
  `connectToChatgptTab(...)`.
- ChatGPT has raw `openChromeTarget(...)` fallback paths when a previously
  selected target fails, which bypasses `openOrReuseChromeTarget(...)` stockpile
  cleanup and mutation attribution.
- Account-mirror detail inventory calls `listConversationFiles(...)`,
  `getConversationContext(...)`, `listAccountFiles(...)`, and project/file read
  methods through the generic client. The collector does not express whether
  its reads are disposable inventory probes or retained operator/service tabs.

## Findings

1. ChatGPT read-only live-follow paths can leak newly opened tabs.
   The adapter returns enough metadata to close them, but the close logic is not
   centralized and is missing from the common read/list methods.

2. Cross-provider tab lifecycle policy is duplicated and uneven.
   Gemini/Grok repeat the close-on-disposable pattern across many methods,
   while ChatGPT mostly closes only the CDP client. That makes future provider
   drift more likely.

3. The tab stockpile cleanup boundary is too narrow.
   Cleanup only runs after `openOrReuseChromeTarget(...)`; raw
   `openChromeTarget(...)` fallback paths can create tabs without immediately
   trimming stale service tabs.

4. Account-mirror/live-follow lacks an explicit tab-lifecycle intent in
   provider list options.
   The collector's inventory probes are usually disposable unless they attach
   to an explicitly submitted tab. The current options cannot express that
   intent directly.

5. Future agent-browser cutover needs an ownership seam, not another provider
   workaround.
   AuraCall should keep provider adapters consuming a small tab/session
   lifecycle contract so the direct-CDP implementation can later delegate to
   agent-browser access-plan/session ownership.

## Implementation Plan

1. Add a shared provider-list option for tab lifecycle intent.
   - Default must preserve current behavior for prompt/submitted-tab paths.
   - Account-mirror inventory can opt into disposable read tabs.

2. Centralize ChatGPT disposable-tab cleanup.
   - Add a small helper around `connectToChatgptTab(...)` results that always
     closes the CDP client and, when policy allows, closes newly opened targets.
   - Apply it first to ChatGPT read-only/list/detail inventory methods used by
     account-mirror/live-follow.

3. Thread disposable intent from account-mirror detail reads.
   - Use the new option for account-mirror project/account/conversation file
     and conversation-context probes.
   - Preserve `preserveActiveTab` semantics for submitted-tab readback.

4. Add regression tests.
   - Prove ChatGPT list/read paths close disposable targets when
     `shouldClose=true`.
   - Prove existing `preserveActiveTab` or explicit `tabTargetId` readback does
     not close the submitted tab.

5. Record agent-browser readiness boundary.
   - Document that the same lifecycle intent should become the bridge to
     agent-browser access-plan/session ownership during cutover.

## Implementation Result

- Added `BrowserProviderListOptions.tabLifecycle` with
  `"retain" | "dispose-new"` as the provider-list lifecycle intent.
- Centralized ChatGPT tab cleanup through a helper that always closes the CDP
  client and only closes the browser target when all of these are true:
  `tabLifecycle === "dispose-new"`, `shouldClose === true`, a `targetId` is
  present, no explicit `tabTargetId` was supplied, and `preserveActiveTab` is
  not set.
- Converted ChatGPT list/read/project/file methods that use
  `connectToChatgptTab(...)` to close through the centralized helper.
- Threaded disposable lifecycle through ChatGPT account-mirror library,
  project-file, conversation-file, and conversation-context reads while keeping
  Gemini/Grok generic inventory call shapes unchanged.
- Live proof showed cleanup-after-close was not sufficient by itself: a first
  checkout-backed refresh kept the page count stable initially but reused and
  navigated an existing same-origin ChatGPT tab, then left additional
  conversation tabs after settling.
- Tightened the implementation so disposable reads do not attach the resolved
  service tab, skip existing same-origin candidates, and force
  `openOrReuseChromeTarget(..., { reusePolicy: "new" })`; the disposable target
  is then closed through the central helper and browser-service stockpile
  cleanup trims stale same-origin tabs.
- Added focused regression coverage in
  `tests/browser/chatgptTabLifecycle.test.ts` and updated
  `tests/accountMirror/chatgptMetadataCollector.test.ts` expectations.

## Acceptance Criteria

- [x] ChatGPT account-mirror inventory read paths close newly opened disposable
  tabs.
- [x] Existing submitted-tab/preserve-active-tab readback remains protected from
  cleanup.
- [x] Shared option naming and docs make the tab lifecycle contract available to
  other provider adapters.
- [x] Targeted tests pass for ChatGPT tab lifecycle behavior.
- [x] `docs/dev/dev-journal.md` and `docs/dev-fixes-log.md` record the incident
  lesson and the fix.

## Definition Of Done

- [x] Code implements the bounded cleanup policy.
- [x] Tests cover both cleanup and no-cleanup paths.
- [x] Durable docs are updated.
- [x] Targeted validation passes:
  - `pnpm vitest run tests/browser/chatgptTabLifecycle.test.ts tests/accountMirror/chatgptMetadataCollector.test.ts`
  - `pnpm run typecheck`
- [x] Live checkout-backed proof passes:
  - Started scoped proof API with
    `pnpm tsx bin/auracall.ts --profile default api serve --port 18143 --account-mirror-proof-provider chatgpt --account-mirror-proof-runtime-profile default --background-drain-interval-ms 0 --account-mirror-scheduler-interval-ms 0 --no-account-mirror-completions-on-start`.
  - Posted one explicit refresh with `ignoreMinimumInterval=true`,
    `ignoreFailureBackoff=true`, and `queueTimeoutMs=0`.
  - Refresh completed for `chatgpt/default` with detected identity
    `ecochran76@gmail.com`, merged counts `projects=5`,
    `conversations=416`, `artifacts=109`, `files=113`, `media=0`.
  - Default ChatGPT DevTools page targets changed from `29` before the patched
    refresh to `2` after it; `added=[]` and `changed=[]`, with stale
    same-origin targets removed by stockpile cleanup.
- [x] Installed user-runtime proof passes:
  - Ran `pnpm run install:user-runtime`, then restarted
    `auracall-api.service`.
  - API status reported the installed service serving from
    `/home/ecochran76/.auracall/user-runtime/node_modules/auracall/dist/bin/auracall.js`
    on port `18095`.
  - Posted one authenticated explicit refresh to the installed
    `/v1/account-mirrors/refresh` endpoint for `chatgpt/default` with
    `ignoreMinimumInterval=true`, `ignoreFailureBackoff=true`, and
    `queueTimeoutMs=0`.
  - Refresh completed for runtime profile `default` / browser profile
    `default` in about 92 seconds with metadata counts `projects=5`,
    `conversations=416`, `artifacts=109`, `files=125`, `media=0`.
  - The default ChatGPT managed browser was not listening before the installed
    proof; after the proof, DevTools port `45011` had exactly one page target,
    `https://chatgpt.com/`, with no project/library tab stockpile left behind.
  - Installed account-mirror status for `chatgpt/default` reported
    `accountLevel=Business`, provider guard `clear`, live-follow enabled, and
    the expected minimum-interval delay after the successful explicit refresh.

## Follow-Up Boundary

- A separate `chatgpt/wsl-chrome-3` Pro lane still reported a stale provider
  guard warning for `Too many requests` in installed status, while the default
  Business lane used for this tab-retention proof was clear. Treat Pro-lane
  rate-limit repair as a separate provider-guard/cooldown follow-up, not as a
  failure of the default Business tab-lifecycle fix.
