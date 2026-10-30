# ChatGPT list-conversations efficiency audit — 2026-10-30

Source baseline: `563faa1a7e0e2cb5b334398c245f092c273689e8`.
Research only; no live provider requests or production changes.

## Algorithm and cost model

[`ChatgptService.listConversations`](../../../src/browser/llmService/providers/chatgptService.ts)
(lines141–165) resolves a utility target in tab-affinity mode, otherwise builds
options and uses an outer retry wrapper. The utility ID is a per-service random
UUID (lines17–33); target custody and traffic admission do not merge identical
listing results across independent services/workflows.

The [adapter](../../../src/browser/providers/chatgptAdapter.ts), lines13908–13963,
admits a conversation-read interaction, attaches/resolves a tab, checks expected
identity, dismisses any create-project dialog, and scrapes. A recognized connection
failure can replay the whole attempt. The non-affinity service also has an outer
retry; this is a conditional amplification path, not a measured retry frequency.

Identity (lines6009–6085) makes `/api/auth/session` requests through the generated
expression (lines4230ff): one on first-success, up to five for nonqualifying
responses, separated by2s; thrown evaluation errors need separate handling.
It also reads fallback identity from the page. These checks establish authority;
removing them to save calls is not an acceptable optimization.

Listing itself (lines7823–8149) reads DOM anchors and enriches those anchors from
localStorage history metadata. It does not use a dedicated paginated conversation
inventory API. Project listings navigate/settle the project and check/open its
Chats panel; same-route settling can avoid a physical navigation, so a call to
the navigation helper is not proof of another HTTP load. The helper nevertheless
increments `Page.navigate`/`chatgpt.navigateUrl` telemetry before learning whether
navigation occurred (lines5254–5306), making those counters unsuitable as exact
network counts.

For additional history, lines8155–8270 read again, scroll a heuristic container,
sleep650–999ms, and read again, up to160scrolls. Five stable-count increments stop
the loop; non-scrollable rounds count as two. Each round replaces the prior rows.
Scrolls may trigger lazy-load HTTP requests, but the probe does not simulate or
count those requests. Empty initial lists poll for6s and do not enter pagination.

## Confirmed findings, ranked

1. **Recovery loses caller constraints.** `scrapeChatgptConversations` calls
   `withChatgptBlockingSurfaceRecovery` with debug/reopen only (lines8143–8148),
   omitting `providerOptions: options`. The wrapper checks
   `providerOptions.accountMirrorInventory` for rate-limit hard stops and passes
   those options to recovery (lines1229–1324). Thus this listing path cannot
   apply that account-mirror-specific refusal or the caller's navigation policy
   through those checks. Its reopen callback also has no provider options
   (lines1387–1411). Recovery can dismiss/reload/reopen and replay, adding work
   during a provider warning. This is a source-confirmed propagation defect;
   an offline synthetic warning through the actual wrapper/reopen callback
   produces one intercepted recovery and one intercepted reopen despite
   `accountMirrorInventory: true, allowNavigation: false`. A control forwarding
   the omitted options stops before either effect. No live warning was activated
   or recovery HTTP traffic measured.
2. **No sharing of identical in-flight listings at these seams.** Independent
   calls repeat target setup, auth requests and scrolling. The probe runs three
   source scrapers concurrently:21DOM reads/15scrolls versus7/5for one. Three
   executions of the actual generated auth expression invoke three offline
   fetches. This proves source operation multiplicity, not three full production
   workflow executions or cross-process shared-network behavior. Any sharing
   must key exact account/workspace/browser generation, root/project, requested
   coverage and policy; preserve caller cancellation and fresh authorization.
3. **Pagination both repeats and loses work.** For24available cumulative rows,
   limit25, the loop performs7reads/5scrolls: an immediate redundant read plus
   three no-growth bottom rounds. With a simulated virtualized8-row window,
   it observes48distinct IDs, stops after5scrolls because the count never grows,
   and returns only the last8. Progress should count newly observed identities;
   retain a bounded union and explicit coverage, not only the current DOM count.
   Virtualization is a controlled algorithm counterexample, not a claim that
   today's provider rail uses that exact8-row layout.
4. **Pagination ignores caller cancellation locally.** The history helper takes
   no options/signal, performs ordinary sleeps and never checks cancellation.
   The source scraper probe receives an already-aborted signal and still makes
   all7reads/5scrolls. Production transports/ownership gates can independently
   reject commands, so this does not prove that an entire cancelled workflow
   continues provider requests. Explicit loop/sleep cancellation would bound
   unnecessary work reliably at the algorithm seam.
5. **Incremental coverage is weak.** `historySince` exists in the
   [list options](../../../src/browser/providers/types.ts) but is not consumed by
   this ChatGPT adapter. The account-mirror
   [`readBoundedConversations`](../../../src/accountMirror/chatgptMetadataCollector.ts)
   (lines1735–1809) asks for history on each read. Root listing accepts all visible
   conversation anchors; project listings follow and are merged by ID afterward
   (lines610–698). This can repeat discovery for overlapping visible rows.
   Deduplication after provider work cannot save its traffic. Exact overlap and
   workflow frequency require measurement, not an assumed N+1 request count.

## Reproduction and limits

Run from repository root with installed dependencies:

```sh
node docs/dev/notes/2026-10-30-chatgpt-list-efficiency-probe.mjs
```

The [probe](2026-10-30-chatgpt-list-efficiency-probe.mjs) extracts actual current
TypeScript function declarations via the compiler AST and executes them offline.
Only external boundaries—DOM observations, scroll results, sleeping, recovery
entry and fetch—are simulated. All assertions passed. It confirms algorithmic
work counts, loss, cancellation behavior and option propagation; it does not
qualify provider behavior, HTTP amplification, installed-runtime identity, or
the root cause of the reported concurrent429s. No browser or provider session
was opened. No tests or fixtures were changed to manufacture a production failure.

## Recommended next packet

Repair recovery option propagation first, including reopen/navigation policy and
the account-mirror warning refusal, with a public adapter regression proving zero
recovery effects after a qualified rate-limit warning. Then make pagination
bounded, cumulative, identity-aware and cancellable. After those correctness
fixes, add identical in-flight read sharing at the common entry point that spans
the actual concurrent callers. Avoid indefinite result caches or treating cached
identity as authorization. A separately authorized bounded live trace should
count real request categories for one versus concurrent listings, preserving
warning stops and comparing equivalent coverage before selecting any API-first
replacement. Increasing rate limits or retries would not address repeated work.
