# Dev Journal

Log ongoing progress, current focus, and problems/solutions. Keep entries brief and ordered newest-first.

## Entry format

- Date:
- Focus:
- Progress:
- Issues:
- Next:

## Entries

- Date: 2026-04-09
- Focus: Harden startup recovery observability for bounded host recovery.
- Progress: Added coverage in [tests/http.responsesServer.test.ts](/home/ecochran76/workspace.local/oracle/tests/http.responsesServer.test.ts) for startup-recovery cap saturation (`recoverRunsOnStartMaxRuns`) so bounded recovery logs include a `cap=<n> hits reached` marker plus skip-reason accounting when candidates exceed the run cap.
- Issues: None.
- Next: Keep startup recovery bounded and startup-only while we validate whether a dedicated recovery daemon is needed for multi-process operators.

- Date: 2026-04-09
- Focus: Add startup run recovery to `serve` without changing route shape.
- Progress: Updated [src/http/responsesServer.ts](/home/ecochran76/workspace.local/oracle/src/http/responsesServer.ts) so `serveResponsesHttp` starts with `recoverRunsOnStart: true`, and `createResponsesHttpServer` can now invoke `executionHost.drainRunsUntilIdle(...)` for stale persisted direct runs before serving readback. Added host reuse options (`recoverRunsOnStart`, `recoverRunsOnStartMaxRuns`) and optional injectable `executionHost`, and ensured recovered runs use the same injected `now`/runner wiring as foreground execution. Exported `createExecutionRequestFromRecord` from [src/runtime/responsesService.ts](/home/ecochran76/workspace.local/oracle/src/runtime/responsesService.ts) so server-level host recovery can reconstruct requests with the same normalization path used by request-driven execution.
- Issues: This recovery remains bounded and direct-run only. We intentionally avoid introducing a background scheduler; startup recovery is a recovery-on-launch hook.
- Next: Reassess whether recovery should remain startup-only or move to a dedicated recovery daemon before widening beyond the `responses` API.

- Date: 2026-04-09
- Focus: Harden the responses service seam by reusing a single host and preserving stored-run context.
- Progress: Updated [src/runtime/responsesService.ts](/home/ecochran76/workspace.local/oracle/src/runtime/responsesService.ts) to accept an injected runtime host, reuse one `ExecutionServiceHost`, and reconstruct a full `ExecutionRequest` from persisted run records before invoking the runner callback. The callback now receives both `(request, context)` so downstream executors can use run/step details without additional store lookups. Added/updated targeted regression coverage in [tests/runtime.responsesService.test.ts](/home/ecochran76/workspace.local/oracle/tests/runtime.responsesService.test.ts) to assert callback reconstruction behavior.
- Issues: Existing record-to-request reconstruction currently trusts normalized legacy shapes and backfills defaults, so it is intentionally conservative and aligned to the direct-run request shape currently emitted by `createDirectExecutionBundle`.
- Next: Decide whether we should extend this seam to a dedicated background polling host for API serve or keep this bounded synchronous callback path as the runtime/API checkpoint and shift to the broader roadmap review.

- Date: 2026-04-09
- Focus: Extend service-host to drain multi-step runs through a bounded local pass loop.
- Progress: Added `drainRunsUntilIdle(...)` to `src/runtime/serviceHost.ts` with bounded pass and run execution controls, plus regression coverage for a two-step run advancing across passes in `tests/runtime.serviceHost.test.ts`. Consolidated team runtime bridge execution by using the new host loop in `src/teams/runtimeBridge.ts` so projected team runs advance through all local runnable steps in one bounded call.
- Issues: No remaining host-seam regressions in local runtime tests, but recovery semantics are still request-scoped until a real background worker/service daemon is introduced.
- Next: Decide whether next slice should add a dedicated background service host launcher/process and operator restart hook, or keep host-liveness recovery to API-triggered calls for now.

- Date: 2026-04-09
- Focus: Add execution-summary visibility to the internal team-runtime bridge.
- Progress: Extended `src/teams/runtimeBridge.ts` to return a bounded `executionSummary` alongside persisted runtime records. The summary maps each planned team step to its runtime counterpart and includes terminal count plus current runtime status and per-step status/failure details. Updated `tests/teams.runtimeBridge.test.ts` to lock this behavior for success, fail-fast, and blocked-unrunnable cases.
- Issues: Team step states in the bridge payload are now derived from runtime execution status rather than plan-time `TeamRunStep` states; transport/API-facing surfaces remain untouched.
- Next: Decide whether this same summary shape should be reused by any future team execution API path, and add dedicated readback if/when a team execution operator surface is added.

- Date: 2026-04-08
- Focus: Add bounded execution readback on the existing `responses` routes without widening the protocol.
- Progress: Extended the runtime/API response model so runtime-backed direct responses now surface a small `metadata.executionSummary` object. The current fields are `terminalStepId`, `completedAt`, `lastUpdatedAt`, and `failureSummary`. Added focused coverage in `tests/runtime.api.test.ts`, `tests/runtime.responsesService.test.ts`, and `tests/http.responsesServer.test.ts`, and updated the user/runtime docs so the new readback is documented as a bounded metadata extension on the existing routes.
- Issues: This is intentionally not a general execution-inspection API. The host still does not expose event streams, full event history, lease state, or a separate inspect route.
- Next: Decide whether the next bounded host improvement should be a slightly richer local service seam above `responsesService` or stop here and push the current runtime/API checkpoint.

- Date: 2026-04-08
- Focus: Pull bounded direct-run orchestration back out of HTTP so the host stays a thin adapter.
- Progress: Added `src/runtime/responsesService.ts` as the runtime-backed application seam for direct `responses` work. That module now owns direct-run bundle construction, bounded local runner invocation, and response readback mapping. `src/http/responsesServer.ts` now delegates to that service instead of building bundles and invoking `executeStoredExecutionRunOnce(...)` itself. Added focused coverage in `tests/runtime.responsesService.test.ts`.
- Issues: The host is thinner now, but response readback is still intentionally minimal. Failed runs surface `status: failed`, but there is still room for a later bounded execution-summary polish on the same routes if we need more operator detail.
- Next: Decide whether the next bounded host follow-up should be response readback polish on the existing routes or a broader local service-host seam above `responsesService`, without reopening `chat/completions`, auth, or streaming.

- Date: 2026-04-08
- Focus: Land the first bounded local runner behavior under the existing `responses` host.
- Progress: Added `src/runtime/runner.ts` as the first real runner/service execution seam. It uses the existing runtime control, lease, dispatcher, and persisted record layers to execute one sequential direct-run step with fail-fast behavior and persisted `step-started` / `step-succeeded` / `step-failed` transitions. Wired `src/http/responsesServer.ts` so `POST /v1/responses` now creates a direct run and immediately performs one bounded local runner pass before returning. Added focused coverage in `tests/runtime.runner.test.ts` and updated `tests/http.responsesServer.test.ts` to prove completed and failed direct-run states through the same bounded surface.
- Issues: This is still not a broader service host or a real provider execution engine. The host remains dev-only, non-streaming, unauthenticated, and `responses`-only, and the current direct-run pass still does not produce rich assistant text unless a future executor supplies it.
- Next: Decide whether to keep the host synchronous for one more checkpoint or factor the runner invocation behind a more explicit local service-host seam before any MCP/team work resumes.

- Date: 2026-04-08
- Focus: Turn the new active lane choice into an implementation-ready runner plan.
- Progress: Added `docs/dev/runtime-runner-slice-plan.md` to define the first real runtime execution slice after the bounded `responses` checkpoint. The plan keeps scope tight: sequential local runner behavior only, single owner, fail-fast, persisted run/step/event/shared-state transitions, and bounded readback through the existing `responses` host. Linked that plan from the top-level execution/runtime docs so the next coding step is explicit.
- Issues: Subagent parallelism was requested and attempted, but the current thread limit blocked new spawns during this turn. The underlying audit still converged locally: no pressure for `chat/completions`, and the stronger next lane is runner/service behavior before team execution.
- Next: Implement the runner slice conservatively, starting with one internal runtime runner module and the minimum step-state transition helpers needed for one direct run to progress.

- Date: 2026-04-08
- Focus: Resolve the post-runtime-checkpoint lane choice instead of letting API breadth or team work drift forward.
- Progress: Audited the two plausible next lanes in parallel. The outcome is now explicit in the planning docs: `chat/completions` stays deferred because there is no concrete repo-internal pressure for it, and the team-execution bridge also stays deferred because the runtime/service layer still lacks the first real runner behavior. The next active lane is now documented as service-host / runner orchestration on top of the existing runtime control seam.
- Issues: The next implementation slice is no longer about missing planning. It is about adding the first actual execution behavior without widening transport breadth or inventing team-specific execution semantics too early.
- Next: Plan the first bounded sequential local runner slice: single-owner, fail-fast, local-first execution that can advance a stored direct run through step-state transitions for the existing `responses` host.

- Date: 2026-04-08
- Focus: Reassess the roadmap at the runtime/API phase-1 checkpoint instead of continuing by inertia.
- Progress: Updated the active planning docs so they no longer describe runtime/API as an upcoming lane. `docs/dev/next-execution-plan.md` and `docs/dev/api-compatibility-plan.md` now reflect that the first runtime/API milestone is already in place: runtime core, bounded `responses` adapter, and local dev-only `auracall api serve`. The next step is now documented as a deliberate choice point between service-host/runner work, API phase 2, or the team-execution bridge.
- Issues: The implementation question is no longer “what is the next missing primitive?” It is “which post-checkpoint lane matters most?” That choice should be explicit before more API surface lands.
- Next: Commit the tiny `api serve` ergonomics slice plus this roadmap correction, then do one bounded roadmap review for service-host vs `chat/completions` vs team bridge before more implementation.

- Date: 2026-04-08
- Focus: Finish the bounded `api serve` host ergonomics slice without widening the route surface.
- Progress: Tightened the local responses host operator UX in `src/http/responsesServer.ts` by adding the AuraCall version to `/status`, standardizing the route template on `/v1/responses/{response_id}`, and changing startup guidance to print a real local probe command instead of echoing a non-probe bind URL such as `0.0.0.0`. Added a first-run local smoke sequence to `docs/testing.md`, plus matching user-facing examples in `README.md` and `docs/openai-endpoints.md`.
- Issues: This is still a tiny host-UX pass only. The surface remains dev-only, unauthenticated, non-streaming, and `responses`-only.
- Next: Pause again unless concrete client pressure appears; if more API work resumes, reassess `chat/completions` before auth or streaming.

- Date: 2026-04-08
- Focus: Pin the first bounded HTTP adapter slice so implementation stays narrow.
- Progress: Added `docs/dev/http-responses-adapter-plan.md` to define the first HTTP work as `responses` create/read/inspect only, with `chat/completions`, streaming, image routes, and MCP changes explicitly deferred. Linked that plan from the active execution plan so the next implementation step is scoped before any route code lands.
- Issues: This is still a planning checkpoint. No HTTP implementation started in this slice.
- Next: Implement the bounded `responses` HTTP adapter against the runtime control contract, without widening into `chat/completions`.

- Date: 2026-04-08
- Focus: Choose the first external adapter on purpose now that the runtime control contract is explicit.
- Progress: Reviewed the existing remote HTTP server and MCP server against the new runtime control contract and recorded the adapter decision in the plans: HTTP should be the first external adapter, anchored on the OpenAI-compatible `responses` surface. MCP remains important, but it should follow as a client of the same runtime contract instead of becoming the place where runtime semantics are invented first.
- Issues: No transport implementation started in this slice. The decision is recorded, but route handlers and MCP changes are still deferred.
- Next: Plan the first HTTP adapter slice around a bounded `responses` create/read/inspect surface, while keeping `chat/completions` as a later compatibility adapter.

- Date: 2026-04-08
- Focus: Align the new runtime control implementation with the transport-neutral contract before any adapter work begins.
- Progress: Added `src/runtime/contract.ts` to hold the transport-neutral runtime control interface and moved the shared control input/output types there. Updated `src/runtime/control.ts` to implement that contract explicitly and added `listRuns(...)` so the code seam now matches the documented control-surface plan more closely. Extended `tests/runtime.control.test.ts` to cover run listing through the contract.
- Issues: The code seam is now aligned with the contract, but it is still intentionally internal and transport-free. No external adapter choice has been made.
- Next: Review this checkpoint, then decide whether the first external adapter should be HTTP or MCP.

- Date: 2026-04-08
- Focus: Define the first transport-neutral control contract before any HTTP or MCP adapter lands.
- Progress: Added `docs/dev/runtime-control-surface-plan.md` to spell out the host-facing runtime operations that future adapters should call: create/read/inspect run, acquire/heartbeat/release/expire lease, and list runs. Linked that plan from the active execution plan so the next adapter choice stays downstream of one explicit control contract.
- Issues: The adapter choice is still intentionally open. The repo now has enough internal runtime core that the next risk is adapter drift, not missing primitives.
- Next: Decide whether HTTP or MCP should be the first external adapter after the transport-neutral control contract is accepted.

- Date: 2026-04-08
- Focus: Add one internal runtime control seam before any external surface work.
- Progress: Added `src/runtime/control.ts` as the first local composition layer over the runtime core. It creates persisted runs, inspects them through the dispatcher plan, and applies lease transitions through revisioned store writes. Added focused coverage in `tests/runtime.control.test.ts` and updated the runtime planning docs so this seam is explicitly internal and transport-free.
- Issues: This is intentionally not a public API. There is still no HTTP route, MCP tool, streaming layer, or background runner loop.
- Next: Pause and review the accumulated runtime core before deciding whether to expose it through a higher-level local service facade or stop at this checkpoint.

- Date: 2026-04-08
- Focus: Add optimistic mutation discipline to the JSON runtime store before any external control surface appears.
- Progress: Extended `src/runtime/store.ts` from bundle-only persistence to revisioned stored records via `record.json`, while keeping `bundle.json` as the readable payload mirror. Added `readRecord` / `writeRecord` helpers with optional `expectedRevision` compare-and-swap checks, and expanded `tests/runtime.store.test.ts` to prove revision bumps and mismatch failures.
- Issues: This is still single-host JSON discipline, not locking. There is no daemon or cross-process atomic lease owner yet; the explicit revision boundary just prevents the runtime layer from pretending writes are unconstrained.
- Next: Decide whether the next slice should expose this runtime core through one local control module or pause here and review the accumulated runtime foundation before any surface work.

- Date: 2026-04-07
- Focus: Add the first lease ownership contract without introducing a runner loop.
- Progress: Added `src/runtime/lease.ts` with pure bundle-level lease state transitions for acquire, heartbeat, release, and expire. The helper appends runtime lease events into both `events` and shared-state history and enforces the single-active-owner rule directly at the runtime model boundary. Added focused coverage in `tests/runtime.lease.test.ts` and updated the planning docs to keep this slice explicitly about ownership semantics, not background execution.
- Issues: This is still a mutation helper, not a worker system. There is no compare-and-swap persistence, no poller, and no stale-lease scavenger process yet.
- Next: Decide whether the next slice is storage-level mutation helpers/CAS semantics or the external control-surface contract, but still avoid HTTP execution handlers.

- Date: 2026-04-07
- Focus: Add the first runtime sequential-dispatch contract without crossing into worker behavior.
- Progress: Added `src/runtime/dispatcher.ts` as a pure planning helper over persisted execution bundles. The new dispatch plan classifies terminal, blocked, blocked-by-failure, waiting, deferred, running, and the single next runnable step allowed under sequential mode. Added focused coverage in `tests/runtime.dispatcher.test.ts` and updated the runtime planning docs to keep this slice explicitly classification-only.
- Issues: This still intentionally stops short of any mutation path, lease acquisition, retry policy, or execution loop. The API seam also remains frozen.
- Next: Decide whether the next runtime slice should be dispatch-plan persistence/index summaries or the first lease ownership model, but not worker execution yet.

- Date: 2026-04-07
- Focus: Land the first persistence boundary for runtime execution records without widening into dispatcher or API work.
- Progress: Added a minimal JSON-first runtime store under `src/runtime/store.ts` with explicit AuraCall-home path helpers plus read/write/list operations for execution bundles under `~/.auracall/runtime/runs/<id>/bundle.json`. Added focused coverage in `tests/runtime.store.test.ts` using the existing AuraCall-home test override hook. Updated the execution plan docs so persistence is now the active next seam after vocabulary/projection.
- Issues: This is intentionally storage-only. There is still no dispatcher, lease ownership behavior, or HTTP transport, and the route-neutral API seam remains frozen.
- Next: Keep the store boundary narrow and only then decide whether the next slice is metadata/indexing polish or the first sequential dispatcher contract.

- Date: 2026-04-07
- Focus: Reconcile the new runtime/API scaffolding with the intended roadmap boundary before more implementation accumulates.
- Progress: Audited the new `src/runtime/*` and `src/runtime/api*` seams against the service/runtime and API planning docs. Confirmed that the runtime execution vocabulary and team-run projection are on-plan, but marked the route-neutral API seam as provisional scaffolding only. Updated the planning docs so the stop line is explicit: no HTTP handlers, `responses` route, `chat/completions` adapter, or transport work yet; the next active implementation target is the execution-record persistence boundary.
- Issues: We went one bounded slice past “planning only” on the API line. The current API scaffolding is still small and neutral, but it would become drift if we keep expanding it before persistence/runtime ownership is settled.
- Next: Keep the API seam frozen and take the runtime persistence boundary as the next real code slice.

- Date: 2026-03-31
- Focus: Finish the last pure declarative Grok route cleanup and stop the route-manifest slice at the right boundary.
- Progress: Replaced the remaining hardcoded Grok root conversation URL fallbacks embedded in browser-evaluated scripts with helper-backed injected values in [src/browser/providers/grokAdapter.ts](/home/ecochran76/workspace.local/oracle/src/browser/providers/grokAdapter.ts). A final grep now shows only manifest defaults/templates themselves, not duplicated runtime route literals. Focused Grok/registry tests and `pnpm run check` passed.
- Issues: The remaining Grok-specific strings now mostly sit inside workflow/scrape code paths or the manifest defaults themselves, so continuing this slice further would start mixing declarative extraction with behavior work.
- Next: Stop the Grok manifest-route work here and switch back to the next real gate: a guarded ChatGPT live acceptance window.

- Date: 2026-03-31
- Focus: Continue low-risk Grok route extraction after the central manifest/defaults cutover.
- Progress: Replaced the remaining obvious declarative Grok route strings in [src/browser/providers/grokAdapter.ts](/home/ecochran76/workspace.local/oracle/src/browser/providers/grokAdapter.ts), [src/browser/index.ts](/home/ecochran76/workspace.local/oracle/src/browser/index.ts), and [src/browser/llmService/llmService.ts](/home/ecochran76/workspace.local/oracle/src/browser/llmService/llmService.ts) with manifest-backed helpers/constants. Added `projectConversations` to the Grok route manifest and extended focused coverage in [tests/browser/grokAdapter.test.ts](/home/ecochran76/workspace.local/oracle/tests/browser/grokAdapter.test.ts) and [tests/services/registry.test.ts](/home/ecochran76/workspace.local/oracle/tests/services/registry.test.ts). Focused Vitest suites and `pnpm run check` passed.
- Issues: This still intentionally stops short of deeper provider-local workflow paths where URL handling is tangled with scraping/state recovery logic.
- Next: Re-inventory the remaining Grok hardcoded strings and stop the manifest slice once the leftovers stop being purely declarative.

- Date: 2026-03-31
- Focus: Restore repo-wide green checks and continue low-risk manifest extraction outside ChatGPT live flows.
- Progress: Fixed the `ResolvedBrowserConfig.target` typing mismatch by overriding `getConfig()` in [src/browser/service/browserService.ts](/home/ecochran76/workspace.local/oracle/src/browser/service/browserService.ts), which cleared the repo-wide `pnpm run check` blocker. Then extended `configs/auracall.services.json` with Grok and Gemini route templates/cookie origins, cut central consumers over in [src/browser/constants.ts](/home/ecochran76/workspace.local/oracle/src/browser/constants.ts), [src/browser/login.ts](/home/ecochran76/workspace.local/oracle/src/browser/login.ts), [src/config.ts](/home/ecochran76/workspace.local/oracle/src/config.ts), [src/browser/providers/grokAdapter.ts](/home/ecochran76/workspace.local/oracle/src/browser/providers/grokAdapter.ts), and [src/browser/providers/index.ts](/home/ecochran76/workspace.local/oracle/src/browser/providers/index.ts), and added focused coverage in [tests/services/registry.test.ts](/home/ecochran76/workspace.local/oracle/tests/services/registry.test.ts) and [tests/browser/grokAdapter.test.ts](/home/ecochran76/workspace.local/oracle/tests/browser/grokAdapter.test.ts). Focused Vitest suites and `pnpm run check` now pass.
- Issues: Live ChatGPT `root-base` acceptance still remains a separate timing/rate-limit problem; this slice deliberately avoided spending more writes there.
- Next: Keep manifest extraction on low-risk declarative surfaces only, then return to a single guarded ChatGPT live acceptance window once the remaining non-live slice is exhausted.

- Date: 2026-03-31
- Focus: Unblock repeated `chatgpt-acceptance.ts` command-timeout failures during guarded root-base reruns.
- Progress: Hardened `scripts/chatgpt-acceptance.ts` with a configurable `--command-timeout-ms` used for all auracall/probe invocations and made mutation commands respect that timeout when it is larger than the prior 6-minute default. Updated help text accordingly.
- Issues: Live `--phase root-base --resume ...` reruns still intermittently timeout in this environment even after timeout tuning, so full live completion still needs a stable window; one in-progress root-base run was manually terminated after prolonged `rename` wait.
- Next: Re-run guarded root-base in a calmer rate-limit window, then proceed directly to `root-followups` and `cleanup` slices from the same state file.

- Date: 2026-03-31
- Focus: Establish a consolidated execution plan and align docs for the remaining work.
- Progress: Created `docs/dev/next-execution-plan.md` as a prioritized, slice-based plan and linked it into `ROADMAP.md` as the active execution board for service-volatility completion, profile-family hardening, and final reliability polish.
- Issues: Several earlier edits are uncommitted across implementation and planning docs, and live work remains constrained by account rate-limit windows and open-browser session hygiene; these constraints are now part of the execution plan, not blockers to documentation organization.
- Next: Execute the plan slices in order (manifest hardening, profile-family determinism, reusable helper boundary decisions, production reliability gates) and keep journal entries per slice with explicit verification outcomes.

- Date: 2026-03-31
- Focus: Complete targeted ChatGPT project-sources upload smoke.
- Progress: Relaxed source-surface readiness in `buildProjectSourcesReadyExpression`, added route-only short-circuit in `openProjectSourcesTab`, and added a pre-check + broader click strategy in `openProjectSourcesUploadDialog`.
- Issues: Existing unit tests did not cover the specific empty-source `Sources` tab ready path in live DOM; relied on live diagnostics to expose this mismatch.
- Next: Keep this smoke passing and move to cleanup assertions: verify that route-only fallback does not allow false positives if query/path lands on `/project` without source-context before running broader source lifecycle smoke.

- Date: 2026-03-31
- Focus: Run smoke for ChatGPT project lifecycle after modal-cleanup and service-target fixes.
- Progress: Executed `pnpm tsx scripts/chatgpt-acceptance.ts` with the current `default` profile and captured a live result.
- Issues: `projects rename` still failed with `ChatGPT project surface did not hydrate for g-p-69cbf209362c8191b7fe15f5e531e955` at the project rename phase, same stack path through `openProjectSettingsPanel`. Cleanup removal still ran afterward.
- Next: Harden `openProjectSettingsPanel` readiness/opening behavior (or project surface detection) and re-run this smoke path in `project` flow before attempting broad platform-level smoke passes.

- Date: 2026-03-31
- Focus: Resolve cross-provider ChatGPT tab contamination and stale modal state across multiple browser windows.
- Progress: `BrowserService` stopped mutating a matched instance’s service affinity list when resolving by ChatGPT tabs, avoiding cross-provider `services` bleed when multiple profiles are open. Added a guarded ChatGPT startup recovery step that dismisses an existing create-project dialog immediately after browser connect, so tests start from a clean surface even when a second browser has an old modal open.
- Issues: Modal recovery is currently scoped to the create-project surface only; broader dialog-stale recovery is still handled by existing method-local checks.
- Next: Run a guarded live smoke on the Pro testing browser and confirm the stale-create-dialog state no longer blocks `auracall` chat operations before moving to broader session orchestration tasks.

- Date: 2026-03-31
- Focus: Add Grok file-management UI diagnostics on account and project file flows.
- Progress: Wrapped Grok account and project file-management public methods with scoped `withUiDiagnostics(...)` context for list/upload/delete paths, including source/modal roots, action candidates, and explicit flow intent metadata.
- Issues: `pnpm run check` still fails in `tests/browser/browserService.test.ts` on `ResolvedBrowserConfig.target` typechecking (`TS2339`), unrelated to this slice.
- Next: Validate with guarded live Grok smoke commands once the authenticated profile is available; keep an eye on diagnostics payload quality if any file-flow failures persist.

- Date: 2026-03-31
- Focus: Finalize Rename Verification Hardening for Root Conversations.
- Progress: Added strict rename persistence checking so root conversations verify against the reordered top-of-list state before continuing, with jittered settle delays between mutate and verify and a longer pause before list-refresh verification. This prevents early success when the renamed conversation is not yet promoted in the root list.
- Issues: No unit-level regressions so far, but this remains live-timing sensitive and should be exercised with a guarded real run.
- Next: run a guarded live root rename test and, if needed, tune the post-submit settle + list-refresh windows rather than relaxing the top-row contract.

- Date: 2026-03-31
- Focus: Align WSL-Chrome profile-family naming for secondary ChatGPT logins.
- Progress: Added explicit docs and docs-test alignment for `wsl-chrome-2` as the secondary WSL profile-family name, with `profiles.default` as the primary WSL Chrome family. Updated `docs/configuration.md` to show `default` + `wsl-chrome-2` with separate managed profile dirs and documented that `wsl-chrome-2` is for an additional account set (for example, Pro testing). Updated `docs/wsl-chatgpt-runbook.md` with the second-profile setup/login flow so operators can onboard and run `--profile wsl-chrome-2`.
- Issues: No runtime behavior changes were required for this step; the work is documentation and test alignment only.
- Next: Verify `--profile wsl-chrome-2` flows in a live smoke once the secondary account is available and keep any onboarding examples aligned with that naming.

- Date: 2026-03-31
- Focus: Harden ChatGPT rate-limit retry spacing and add safer rename row-retry sequencing.
- Progress: Completed the pending ChatGPT retry hardening pass by fixing `LlmService` retry delay selection and wiring it into the retry loop via provider-aware adaptive backoff (`getRetryDelayMs`) plus deterministic jitter. Fixed a method-name regression (`isProviderRateLimitError` → `isProviderRateLimitedError`) and moved conversation-row tagging in `renameChatgptConversationWithClient` to clustered attempts with short/long spacing: primary conversation row, two list-page open attempts, and a final list refresh attempt with a longer pause. The rename flow now records each failed row-tag attempt in `tagFailures` and keeps diagnostics attached to the final UI context.
- Issues: No compile or test failures now, but long-lived live behavior still depends on account-level rate-limit pace and may still trip occasional cooldowns if non-PRO automation is run with dense write sequences.
- Next: Use the now-stable clustered rename timings in the next guarded live root-conversation pass; if any new failure appears, escalate to package-level UI diagnostics for the rename action surfaces before changing fallback strategy again.

- Date: 2026-03-30
- Focus: Tighten ChatGPT rename row-tag diagnostics payloads and recovery context.
- Progress: Updated `tagChatgptConversationRow(...)` to emit a stable diagnostics object when no row can be tagged, including stable candidate counts, scoped-count visibility, selected best-candidate summary, and whether fallback matching was used. The rename flow now records each failed tagging attempt through `tagFailures` and includes that context in UI diagnostics, so live failures can confirm whether the failure came before or after project-list fallback/retry.
- Issues: No functional regression observed in focused unit coverage, but the live rename stall gate is still not fully closed until a fresh guarded `scripts/chatgpt-acceptance.ts --phase root-base` run confirms the corrected diagnostics path on a real throttling-sensitive environment.
- Next: Execute the next guarded live root-conversation rename pass and, if rename still stalls, extend the inline-editor assertion around `submitInlineRename(...)` using the structured `tagFailures` evidence.

- Date: 2026-03-30
- Focus: Finish the ChatGPT root-conversation rename repair by debugging the remaining live-only row-action failure instead of broadening the workflow slice further.
- Progress: Tightened the rename path in `src/browser/providers/chatgptAdapter.ts` in several steps: root title verification now accepts a matching row anywhere or the current page title signal instead of requiring the renamed row to also be the top row; root rename no longer falls back to the ChatGPT header menu (which exposes delete/archive but not rename); root rename now starts on the conversation page/sidebar instead of `https://chatgpt.com/`; row-tagging waits longer and scores row-action-button ancestry more flexibly; and the flow now short-circuits when ChatGPT has already auto-titled the conversation to the requested name. Repeated focused regression runs stayed green: `pnpm vitest run tests/browser/chatgptAdapter.test.ts tests/browser/chatgptProvider.test.ts tests/browser/chatgptComposerTool.test.ts tests/browser-service/ui.test.ts tests/cli/browserConfig.test.ts tests/services/registry.test.ts --maxWorkers 1` and `pnpm run check`. The most useful live debugging result came from a direct Puppeteer/js_repl probe against the failing conversation page: the DOM exposes multiple visible `Open conversation options for ChatGPT Accept Base` buttons and the current heuristic can resolve a concrete `LI.list-none` row candidate with the expected title when evaluated against the settled page.
- Issues: Live `scripts/chatgpt-acceptance.ts --phase root-base` still fails at the rename step with `ChatGPT conversation row action surface unavailable`, even though the settled conversation page visibly contains matching row-action buttons. The diagnostics helper only samples the first few `button[aria-label]` nodes, so the failure bundle does not yet show those matching row buttons. One live run also showed the page title already equal to the requested rename target by the time the rename command failed, which means ChatGPT can auto-title the conversation into the desired state before the row-action path completes.
- Next: Stop iterating blind on rename. Add a targeted diagnostic wrapper around `tagChatgptConversationRow(...)` / the row-action readiness wait so the live error reports the actual matching-button count, chosen row candidate, and the exact reason the tagger returned `ok: false`; then rerun `root-base`. If the auto-title short-circuit proves sufficient on that rerun, clean up the disposable conversations and move on to `root-followups`.

- Date: 2026-03-30
- Focus: Take the first behavior-aware ChatGPT workflow slice by extracting one reusable action-surface fallback helper into browser-service and adopting it in ChatGPT conversation flows.
- Progress: Added `openAndSelectMenuItemFromTriggers(...)` to `packages/browser-service/src/service/ui.ts` plus focused coverage in `tests/browser-service/ui.test.ts`. Adopted that helper in `src/browser/providers/chatgptAdapter.ts` for conversation delete and conversation rename so both flows now model their menu surfaces explicitly as `sidebar-row -> conversation-header` instead of hand-rolled retry glue. Reran `pnpm vitest run tests/browser-service/ui.test.ts tests/browser/chatgptAdapter.test.ts tests/browser/chatgptProvider.test.ts tests/browser/chatgptComposerTool.test.ts tests/cli/browserConfig.test.ts tests/services/registry.test.ts --maxWorkers 1` and `pnpm run check`; both passed. Live signal: `auracall.ts delete 69cb3741-2f58-832f-a6ae-f28779f30741 --target chatgpt --yes --verbose` and `auracall.ts delete 69cb35dd-13fc-832f-9d6b-bc0f88125838 --target chatgpt --yes --verbose` both passed, which cleaned up the disposable conversations from two stalled acceptance runs.
- Issues: The first `root-base` live rerun failed before this patch with `ChatGPT conversation row not found`, which confirmed the rename gap. After the patch, the same `root-base` rerun no longer failed fast on the missing-row path, but the `auracall.ts rename ...` subprocess still stalled during the rename phase and had to be terminated manually. That points to a remaining post-trigger issue in inline-editor discovery and/or title-persistence verification rather than the menu-surface fallback itself.
- Next: Debug the root-conversation rename stall specifically: instrument `submitInlineRename(...)` / `waitForChatgptConversationTitleApplied(...)`, verify where the header-initiated rename editor actually appears, and only then rerun the `root-base -> root-followups` acceptance path.

- Date: 2026-03-30
- Focus: Stop the narrow ChatGPT manifest pilot at the right boundary and write the follow-on workflow/behavior plan.
- Progress: After landing the artifact-taxonomy slice and re-inventorying `chatgptAdapter.ts`, the remaining ChatGPT drift is now mostly behavioral: adapter-local selector/fallback order, artifact payload parsing/merge/materialization, and rate-limit policy. I wrote `docs/dev/service-volatility-chatgpt-workflow-plan.md` to define that next phase explicitly, then linked it from `docs/dev/service-volatility-chatgpt-plan.md` and `docs/dev/service-volatility-refactor-plan.md` so the repo-wide plan now distinguishes the finished narrow pilot from the upcoming behavior-aware phase.
- Issues: The main risk now is overextending the manifest concept into workflow logic. The next phase should prefer ownership classification and browser-service extraction over another round of opportunistic config moves.
- Next: Start the first behavior-aware slice from the new workflow plan, most likely a bounded adapter-local selector/fallback audit or a browser-service extraction candidate that already appears in more than one provider.

- Date: 2026-03-30
- Focus: Extend the ChatGPT manifest pilot into artifact taxonomy without moving payload parsing or download/materialization logic out of `chatgptAdapter.ts`.
- Progress: Added an `artifacts` section to `configs/auracall.services.json` for ChatGPT download-kind extensions, content-type-to-extension mappings, extension-to-MIME mappings, default artifact titles, and low-risk payload marker sets. Extended `src/services/registry.ts` with typed artifact helpers, updated `src/browser/providers/chatgptAdapter.ts` so download kind inference, MIME/extension lookup, default image/spreadsheet/canvas titles, and image/table payload marker checks now read from the manifest, and expanded `tests/services/registry.test.ts` plus `tests/browser/chatgptAdapter.test.ts` to cover the new taxonomy. `pnpm vitest run tests/services/registry.test.ts tests/browser/chatgptAdapter.test.ts tests/browser/chatgptProvider.test.ts tests/browser/chatgptComposerTool.test.ts tests/cli/browserConfig.test.ts --maxWorkers 1` and `pnpm run check` both passed.
- Issues: This is intentionally limited to declarative taxonomy. Payload recursion, artifact merge semantics, canvas enrichment, button-tagging, estuary/image fetch, and binary materialization remain code-owned because they are behavioral rather than configuration data.
- Next: Re-inventory what still remains in ChatGPT artifact handling; if the rest is mostly parsing/materialization logic, stop the narrow pilot and write the dedicated next-phase plan instead of continuing to externalize code-shaped behavior.

- Date: 2026-03-30
- Focus: Extend the ChatGPT manifest pilot from provider selectors into selected static DOM anchors inside `chatgptAdapter.ts`.
- Progress: Added a ChatGPT `dom` section to `configs/auracall.services.json`, extended `src/services/registry.ts` with DOM selector/selector-set helpers, and cut a bounded set of repeated adapter anchors over in `src/browser/providers/chatgptAdapter.ts`: project dialog roots, project-source row/tab selectors, conversation-turn/message-role selectors, artifact/textdoc selectors, and the conversation options/delete-confirm buttons. Expanded `tests/services/registry.test.ts`, then reran `pnpm vitest run tests/services/registry.test.ts tests/browser/chatgptProvider.test.ts tests/browser/chatgptAdapter.test.ts tests/browser/chatgptComposerTool.test.ts tests/cli/browserConfig.test.ts --maxWorkers 1` and `pnpm run check`; both passed. Updated `docs/dev/service-volatility-chatgpt-plan.md` and `docs/dev/service-volatility-inventory.md` to record the new ownership boundary.
- Issues: This is intentionally limited to named static anchors. Traversal order, post-condition checks, row-tagging strategy, and dialog/menu recovery still remain in code.
- Next: Re-inventory what remains in `chatgptAdapter.ts`; if the rest is mostly procedural fallback logic rather than static anchors, stop the manifest pilot there and spin up the dedicated adapter-selector/workflow plan instead of forcing more config.

- Date: 2026-03-30
- Focus: Move ChatGPT provider selector families out of `src/browser/providers/chatgpt.ts` and into the service manifest while keeping adapter-local selector logic in code.
- Progress: Added a `selectors` section for ChatGPT to `configs/auracall.services.json`, extended `src/services/registry.ts` with selector-family resolution, and updated `src/browser/providers/chatgpt.ts` to build its provider config from the bundled manifest plus compatible-host login hints. Added focused selector coverage in `tests/services/registry.test.ts` and a new provider-level regression in `tests/browser/chatgptProvider.test.ts`. `pnpm vitest run tests/services/registry.test.ts tests/browser/chatgptProvider.test.ts tests/browser/chatgptAdapter.test.ts tests/browser/chatgptComposerTool.test.ts tests/cli/browserConfig.test.ts --maxWorkers 1` and `pnpm run check` both passed. I also updated `docs/dev/service-volatility-chatgpt-plan.md` and `docs/dev/service-volatility-inventory.md` so the docs match the current ownership boundary.
- Issues: This only moves provider-level static selector families. The adapter-local selector layer in `chatgptAdapter.ts` is still intentionally in code because it is bound up with DOM strategy and fallback sequencing.
- Next: Re-inventory the remaining adapter-local ChatGPT selectors and decide whether there is another safe declarative sub-slice or whether the manifest pilot should stop here and hand off to a dedicated selector/workflow plan.

- Date: 2026-03-30
- Focus: Extend the ChatGPT composer manifest cut from visible tool labels into menu/chip heuristic labels without moving the selection workflow itself.
- Progress: Added composer-owned `moreLabels`, top-menu signal labels/substrings, and chip-ignore tokens to `configs/auracall.services.json`; extended `src/services/registry.ts` with helpers for those arrays; and updated `src/browser/actions/chatgptComposerTool.ts` so top-menu scoring, More-submenu opening, and chip filtering read those values from the manifest instead of embedding them in code. Expanded `tests/services/registry.test.ts`, then reran `pnpm vitest run tests/services/registry.test.ts tests/browser/chatgptComposerTool.test.ts tests/browser/chatgptAdapter.test.ts tests/cli/browserConfig.test.ts --maxWorkers 1` and `pnpm run check`; both passed.
- Issues: The scoring weights and traversal order are still behavioral logic and remain in code. Only the service-specific menu/chip vocabulary moved.
- Next: Re-inventory the remaining ChatGPT hard-coded drift and stop once the rest is clearly selector-family or workflow territory instead of declarative taxonomy.

- Date: 2026-03-30
- Focus: Continue the narrow ChatGPT service-volatility pilot by moving declarative project/conversation UI labels out of `chatgptAdapter.ts`.
- Progress: Added a `ui` section to `configs/auracall.services.json` for ChatGPT project/settings/conversation labels and label sets, extended `src/services/registry.ts` with bundled UI-label helpers, and finished cutting the remaining low-risk call sites in `src/browser/providers/chatgptAdapter.ts` over to manifest-backed labels. This slice now covers project settings buttons, project name/instructions field labels, the project-title edit prefix, project tab labels, add-sources/upload markers, source-actions button labels, the composer prompt label, the sidebar row-action prefix (`open conversation options for …`), conversation rename/delete menu items, project-source remove, and delete-confirmation dialog labels. Added focused registry coverage in `tests/services/registry.test.ts`; `pnpm vitest run tests/services/registry.test.ts tests/browser/chatgptAdapter.test.ts tests/browser/chatgptComposerTool.test.ts tests/cli/browserConfig.test.ts --maxWorkers 1` and `pnpm run check` both passed.
- Issues: This still stops at declarative UI text and selector-bearing label tokens. Selector families, DOM structure assumptions, menu ordering, and the action workflows themselves remain in code by design.
- Next: Decide whether the next ChatGPT manifest slice should cover additional low-risk taxonomy surfaces or pause the refactor and return to broader browser-service/platform work.

- Date: 2026-03-30
- Focus: Move ChatGPT composer/add-on taxonomy out of provider code and into the service manifest without touching the activation flow.
- Progress: Extended `configs/auracall.services.json` and `src/services/registry.ts` with a `composer` section for aliases, known labels, top-level sentinels, and file-request labels. Updated `src/browser/actions/chatgptComposerTool.ts` to resolve that taxonomy from the manifest while leaving the menu traversal, submenu opening, and selected-state verification in code. Added/updated focused coverage in `tests/services/registry.test.ts` and `tests/browser/chatgptComposerTool.test.ts`; focused Vitest runs and `pnpm run check` passed.
- Issues: This slice deliberately does not move selector families or menu interaction order into config. Those remain behavioral code, not declarative volatility.
- Next: Decide whether the next ChatGPT slice should externalize more UI text dictionaries or stop service-volatility work for now and return to broader browser-service extraction.

- Date: 2026-03-30
- Focus: Start the narrow service-volatility pilot by extending the existing Aura-Call service registry instead of adding a second manifest path.
- Progress: Renamed the checked-in manifest to `configs/auracall.services.json`, expanded `src/services/registry.ts` with typed routes/features sections plus synchronous bundled-manifest helpers, and cut the first low-risk ChatGPT consumers over: browser label mapping, ChatGPT base URL/cookie origins, compatible-host families, browser-service target matching, ChatGPT route builders, and feature/app probe token dictionaries. Added focused coverage in `tests/services/registry.test.ts` and extended the existing browser/adapter tests. Focused regression suites and `pnpm run check` both passed. Live acceptance also passed with `scripts/chatgpt-acceptance.ts --phase project`, `--phase root-base --resume ...`, and a final `--phase cleanup --resume ...`. During the project phase, the project-source delete step hit a 47-second ChatGPT cooldown and the existing guard paused automatically instead of re-triggering writes.
- Issues: This is still the narrow pilot, not the whole refactor. Selector families, artifact classification, and rate-limit policy remain in code by design, but the required minimum live gate for this slice is now green.
- Next: Decide whether the next extraction step should be more route/config fields or the separate selector diagnostics plan, then write the next service-specific implementation slice before expanding scope.

- Date: 2026-03-30
- Focus: Turn the service-volatility refactor from a generic roadmap item into executable planning artifacts.
- Progress: Added `docs/dev/service-volatility-inventory.md` with a real inventory of hard-coded volatility across ChatGPT, Grok, Gemini, and the cross-cutting resolver/browser layers. Added the first concrete service plan in `docs/dev/service-volatility-chatgpt-plan.md`, intentionally scoped to low-risk ChatGPT manifest fields only: models, routes, compatible hosts, and feature/app token dictionaries. Linked both docs back into `ROADMAP.md` and the repo-wide plan.
- Issues: The inventory makes it clear that ChatGPT selectors, artifact classification, and rate-limit tuning are too coupled to workflow code for the first slice. Those need later service plans, not opportunistic extraction during the pilot.
- Next: Design the manifest schema/loader around the inventory and existing `configs/auracall.services.json` foothold, then only start the ChatGPT pilot once that schema is reviewed.

- Date: 2026-03-30
- Focus: Plan the service-volatility externalization refactor before implementation starts.
- Progress: Added a top-level `ROADMAP.md` entry for the initiative, wrote the repo-wide execution guide in `docs/dev/service-volatility-refactor-plan.md`, added `docs/dev/service-volatility-service-plan-template.md` so each service migration must declare scope/tests/acceptance before work starts, and updated `docs/testing.md` to make regression discipline explicit for this refactor family.
- Issues: This is intentionally a planning-only step. No service code is being migrated yet, because the next safe move is inventory plus manifest-schema design, not immediate extraction.
- Next: Build the hard-coded volatility inventory and then write the first service-specific plan before touching ChatGPT/Grok/Gemini runtime code.

- Date: 2026-03-30
- Focus: Reduce ChatGPT/OpenAI Pro model pinning and make provider cache identity sensitive to real feature/app drift.
- Progress: Replaced several hard-coded `gpt-5.2-pro` generic/default fallbacks with the stable current-Pro alias path in `src/oracle/config.ts`, `src/cli/options.ts`, `src/cli/browserConfig.ts`, `src/schema/resolver.ts`, and scaffolded config defaults. Added cache-level `featureSignature` plumbing so provider caches can invalidate when service capabilities change. ChatGPT now exposes an optional feature probe signature built from visible UI/storage/script evidence for `web_search`, `deep_research`, `company_knowledge`, and a bounded known-apps set, and that signature is merged with configured `services.chatgpt.features` before cache identity is written/read.
- Issues: The ChatGPT feature probe is intentionally heuristic, not authoritative. It is good enough for cache warming/invalidation and drift detection, but not yet a product-grade “full connected apps inventory” API.
- Next: Run the focused resolver/browser/cache tests, then decide whether the feature probe should graduate into a first-class operator-facing diagnostics command instead of staying cache-only for now.

- Date: 2026-03-30
- Focus: Document and verify second ChatGPT browser profile for workspace-scoped runs.
- Progress: Confirmed profile-level service URL overrides already resolve in the config resolver and added regression coverage for `profiles.<name>.services.chatgpt.url` in `tests/schema/resolver.test.ts` (`work` profile uses `https://chatgpt.com/g/p-...`). Updated operator docs to show both URL-based and `projectId` profile-based workspace scoping in `docs/configuration.md`, and added direct `--profile` examples in `README.md` for `--project-id`, `--project-name`, and URL-based workspace selection.
- Issues: No functional issues surfaced; this change is primarily a config-path docs/productization pass after resolving that the resolver precedence was already in place.
- Next: Keep an eye out for any existing users expecting `browser.chatgptUrl` in profile-local service blocks to continue through legacy aliases; expand docs or migration notes if that drift appears.

- Date: 2026-03-30
- Focus: Harden ChatGPT project source deletion against stale/missing source rows and rate-limit retries.
- Progress: Added a robust preflight in `deleteProjectFile` to re-check project source rows before menu interaction, then treat already-absent rows as success. If the target is still present after a refresh, the row name is re-resolved from the live source probe before proceeding. This avoids brittle assumptions about row visibility after earlier retry attempts.
- Issues: During a retry cycle the row can be gone because the first deletion succeeded while the command was retried, producing `ChatGPT project source action button not found` before the prior check ran.
- Next: Re-run the acceptance runner with the fix, keep the post-write cooldown parser in mind, and verify `projects files remove` is stable under repeat retry scenarios on fresh runs.

- Date: 2026-03-30
- Focus: Centralize ChatGPT artifact download capture in browser-service helpers.
- Progress: Added shared download-capture primitives (`armDownloadCapture`, `readDownloadCapture`, `waitForDownloadCapture`) in `packages/browser-service/src/service/ui.ts` so artifact downloads can be captured by any provider. Refactored ChatGPT materialization to use `armWait + waitFor + fetch remote` around the tagged button click instead of local helper versions, and added coverage in `tests/browser-service/ui.test.ts`. The helper contract is now tested for polling and non-target behavior.
- Issues: No user-facing issues observed; this is a refactor to reduce duplicate provider-local hooking logic and make future download-backed providers less brittle.
- Next: Finish wiring any remaining provider-specific materializers that still reimplement anchor-click capture and standardize the same helper pattern.

- Date: 2026-03-30
- Focus: Reclassify spreadsheet-like markdown downloads so ChatGPT `.xlsx` / `.csv` outputs are not flattened into generic download artifacts.
- Progress: The user provided a logged-in spreadsheet chat (`69ca9d71-1a04-8332-abe1-830d327b2a65`) that the current extractor was already preserving, but only as a generic `download` because ChatGPT exposed it as a markdown `sandbox:/mnt/data/parabola_trendline_demo.xlsx` link rather than an `ada_visualizations` table. That is still a spreadsheet artifact from the user's point of view, so I added `inferChatgptDownloadArtifactKind(...)` in `src/browser/providers/chatgptAdapter.ts` and now classify markdown `sandbox:/...` links ending in `.csv`, `.tsv`, `.xls`, `.xlsx`, or `.ods` as `spreadsheet` instead of `download`. Added focused regression coverage in `tests/browser/chatgptAdapter.test.ts`; `pnpm vitest run tests/browser/chatgptAdapter.test.ts --maxWorkers 1` and `pnpm run check` both passed. Live read-only verification on the same chat now returns one artifact, `parabola_trendline_demo.xlsx`, with `kind = spreadsheet` and `uri = sandbox:/mnt/data/parabola_trendline_demo.xlsx`.
- Issues: Spreadsheet artifacts now come from two distinct ChatGPT shapes: `ada_visualizations` table outputs and spreadsheet-like markdown downloads. If a future table output uses a nonstandard extension or richer file metadata, the classifier may need another pass.
- Next: Keep extending artifact normalization by concrete observed payload shapes instead of by product-name guesses.

- Date: 2026-03-30
- Focus: Extend ChatGPT conversation artifact extraction from downloads/images/canvas to spreadsheet-like table outputs.
- Progress: The user provided a logged-in CSV/table chat (`bc626d18-8b2e-4121-9c4a-93abb9daed4b`) that the current extractor returned as `artifactCount = 0`. Raw payload inspection on the managed ChatGPT browser session showed the missing shape clearly: these artifacts are not markdown `sandbox:/...` links, but `metadata.ada_visualizations` entries with `type: "table"`, a backing `file_id`, and a human title like `New Patents with ISURF Numbers`. I updated `extractChatgptConversationArtifactsFromPayload(...)` in `src/browser/providers/chatgptAdapter.ts` to normalize those `ada_visualizations` table entries into first-class `spreadsheet` artifacts, using `chatgpt://file/<file_id>` as the durable URI and carrying forward `visualizationType` plus `fileId` in metadata. Added focused regression coverage in `tests/browser/chatgptAdapter.test.ts`; `pnpm vitest run tests/browser/chatgptAdapter.test.ts --maxWorkers 1` and `pnpm run check` both passed. Live read-only verification then succeeded on the same chat: `auracall conversations context get bc626d18-8b2e-4121-9c4a-93abb9daed4b --target chatgpt --json-only` now returns two `spreadsheet` artifacts, `Patents with ISURF Numbers` and `New Patents with ISURF Numbers`, each backed by a ChatGPT file id.
- Issues: The public spreadsheet share surface is still visually download-first, so the spreadsheet normalization should stay anchored to the logged-in `ada_visualizations` payload shape rather than any brittle share-page DOM assumptions.
- Next: If another table-like ChatGPT artifact shows up with a different visualization type or richer per-sheet metadata, extend the spreadsheet extractor from there instead of assuming all tabular outputs use the exact same payload.

- Date: 2026-03-30
- Focus: Extend ChatGPT conversation artifact extraction to generated images without overcommitting to a spreadsheet-specific class yet.
- Progress: Re-read the current ChatGPT context/artifact extractor and the live payload findings from the logged-in image conversation `69bc77cf-be28-8326-8f07-88521224abeb`. The key payload shape is a `tool` message with `content_type: "multimodal_text"` whose parts contain JSON objects with `content_type: "image_asset_pointer"`, `asset_pointer: "sediment://file_..."`, `size_bytes`, `width`, `height`, and nested generation metadata. I updated `src/browser/providers/domain.ts` so `ConversationArtifact.kind` now accepts `image` (and reserves `spreadsheet` for later richer payloads), widened `src/browser/llmService/llmService.ts` normalization accordingly, and extended `extractChatgptConversationArtifactsFromPayload(...)` in `src/browser/providers/chatgptAdapter.ts` to normalize those tool parts into first-class image artifacts. The extractor now preserves the `sediment://...` asset pointer as `uri`, captures size/dimensions, and carries forward nested `generation` / `dalle` metadata. Added focused unit coverage in `tests/browser/chatgptAdapter.test.ts`, and both `pnpm vitest run tests/browser/chatgptAdapter.test.ts --maxWorkers 1` and `pnpm run check` passed. Live read-only verification also passed: `auracall conversations context get 69bc77cf-be28-8326-8f07-88521224abeb --target chatgpt --json-only` now returns four `image` artifacts, including `Harvest Roads logo design`, with `sediment://...` URIs, 1024x1024 dimensions, and generation metadata. I also checked the public spreadsheet share example again in the browser context; at least on the share page it still looks download-first (`Updated bundle ZIP`, `Implementation summary`, etc.) rather than an obviously richer spreadsheet artifact surface, so I documented that we should not normalize a special spreadsheet artifact class until we see a concrete logged-in payload shape beyond downloads/textdocs.
- Issues: Spreadsheet artifacts are still only a requirement signal, not an implemented extraction path. The current public share surface does not yet justify special spreadsheet normalization beyond existing download/textdoc handling.
- Next: Keep ChatGPT artifact work focused on proven payload shapes. If we get a logged-in spreadsheet/chat payload with a distinct table/textdoc subtype, add a true `spreadsheet` extractor then instead of guessing from share-page buttons.

- Date: 2026-03-29
- Focus: Make ChatGPT project-scoped conversation operations explicitly trust the project page `Chats` panel instead of generic `/c/...` scraping.
- Progress: Live DOM probing on project `g-p-69c9a938ade0819199bee2c3e354a53b` showed the exact surface split the user described: the left sidebar still shows root `Recents`, while the real project-chat catalog lives in the main project page under the `Chats` tab as `role="tabpanel" -> SECTION -> OL -> LI`, with the row-local `Open conversation options for ...` button anchored there. I updated `src/browser/providers/chatgptAdapter.ts` so project-scoped conversation list/rename/delete verification prefers that visible `tabpanel` surface and only falls back to generic anchor scraping if the panel is absent. I also broadened `scripts/chatgpt-acceptance.ts` so it now has a real disposable project-conversation create/read/rename/delete slice using `--project-id`. Focused tests passed (`tests/browser/chatgptAdapter.test.ts`) and `pnpm run check` passed. Targeted live proof passed on project conversation `69c9ceb0-a060-8326-9e94-a9972d567e19`: the project-scoped list returned it, rename to `AC GPT Project Row Probe` succeeded, project-scoped refresh showed the renamed title, delete succeeded, and a fresh `conversations --project-id ... --refresh` returned `[]`.
- Issues: I have not yet spent the writes on one full guarded `scripts/chatgpt-acceptance.ts` rerun with the new project-chat slice folded in. The product behavior is live-proven, but the expanded runner itself still needs one end-to-end pass.
- Next: Run one guarded full ChatGPT acceptance pass once write budget/rate-limit conditions look comfortable again, then close the remaining ChatGPT conversation-surface plan items from there.

- Date: 2026-03-29
- Focus: Re-anchor ChatGPT root-conversation rename verification to the real list-reorder postcondition.
- Progress: A fresh live disposable root-chat probe confirmed the user-observed behavior exactly: after `Enter`, ChatGPT waits about 1-2 seconds and then the renamed conversation bubbles to the top of the root conversation list. I updated `src/browser/providers/chatgptAdapter.ts` so `waitForChatgptConversationTitleApplied(...)` now succeeds only when the same conversation id is the top visible conversation row with the expected title, instead of accepting any matching title anywhere in the DOM or `document.title`. I also updated `scripts/chatgpt-acceptance.ts` so the rename wait keys off that same refreshed top-row reorder. Focused tests passed (`tests/browser/chatgptAdapter.test.ts`) and `pnpm run check` passed. Live proof succeeded on disposable root conversation `69c9c950-4544-8333-8cbf-492bc1bd7c1c`, which renamed to `AC GPT Top 3wesd8`, refreshed as the first root-list row, and then deleted cleanly.
- Issues: This postcondition is specific to root conversations. For project-scoped conversations, the authoritative list is still the project page conversation list, not the abbreviated sidebar subset shown while a project is selected.
- Next: Keep that root-vs-project authority split explicit in future ChatGPT conversation verification and acceptance work.

- Date: 2026-03-29
- Focus: Finish ChatGPT existing-conversation tool/add-on state as an inspected, persisted browser surface instead of a blind menu click.
- Progress: Implemented explicit current-tool inspection in `src/browser/actions/chatgptComposerTool.ts` via `readCurrentChatgptComposerTool(...)`, using the live composer chip first and then the reopened top-level / `More` menu selected-state when the chip is absent. Browser-mode ChatGPT runs now persist the actual selected composer tool plus the final normalized `conversationId` into browser runtime metadata through `src/browser/index.ts`, `src/browser/sessionRunner.ts`, `src/browser/types.ts`, `src/sessionManager.ts`, and `packages/browser-service/src/types.ts`, so session metadata can prove what tool was really active on an existing-conversation run. Also upgraded `scripts/chatgpt-acceptance.ts` to poll for the matching browser session by prompt and assert the persisted tool state for `web-search` / `canvas` instead of trusting only the later conversation text. Focused tests passed (`tests/browser/chatgptComposerTool.test.ts`, `tests/browser/chatgptAdapter.test.ts`) and `pnpm run check` passed. Live proof succeeded for session `reply-exactly-with-chatgpt-accept-64`: the existing-conversation `--browser-composer-tool web-search` run completed and `~/.auracall/sessions/reply-exactly-with-chatgpt-accept-64/meta.json` now records `browser.runtime.composerTool = "web search"`.
- Issues: The full guarded ChatGPT acceptance bar is not re-green yet. The first rerun exposed a harness gap because base/web session lookup needed a persisted final `conversationId`, which is now fixed. The next rerun advanced farther but re-exposed an older acceptance-tail lag around conversation rename title verification before the tool-state steps. That appears to be a separate harness/product timing issue, not a failure of the new tool-state persistence path.
- Next: Revisit the ChatGPT acceptance rename-title wait as its own lag problem, then rerun the full guarded bar once the account has cooled down again.

- Date: 2026-03-29
- Focus: Re-green the full scripted ChatGPT acceptance bar after the last delete/project-remove tail failures.
- Progress: Finished the remaining ChatGPT browser acceptance work. First, the guarded `scripts/chatgpt-acceptance.ts` run proved the earlier timeout was a harness issue, not another rename selector miss: the ChatGPT write-budget guard could legitimately keep a mutating CLI step alive longer than the runner's old `spawnSync(... timeout: 120_000)` ceiling. Upgraded the runner so mutating ChatGPT commands use a longer timeout budget and so guard-aware retries also understand `ChatGPT write budget active until ...`, not just visible `Too many requests` cooldown text. The next live acceptance pass then exposed a real product bug with structured diagnostics: root conversation delete had the correct `Delete chat?` dialog and `delete-conversation-confirm-button` on screen, but the adapter still threw `ChatGPT conversation delete confirmation did not open` because it insisted the dialog text match the earlier page title. Relaxed that detector so the native confirm button inside the real delete dialog is authoritative even when the page-title text has drifted. After that, the acceptance run got one step farther and exposed the last blocker: project removal could fail with `Button not found` because ChatGPT was simultaneously showing the project settings dialog and a separate `Too many requests` dialog, and `selectRemoveProjectItem(...)` was searching generic `DEFAULT_DIALOG_SELECTORS` instead of the tagged settings sheet. Scoped `Delete project` lookup to the tagged project-settings dialog, added UI diagnostics around that path, re-proved both exact leftovers live (`delete 69c9abe2-72c0-8333-b906-63fc027eddba --target chatgpt --yes --verbose` and `projects remove g-p-69c9b039bfd88191af13a04f82b5cf04 --target chatgpt --verbose`), and then reran the full guarded acceptance script to completion. Final clean transcript: `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx scripts/chatgpt-acceptance.ts` returned `PASS` on suffix `lyveco` with disposable project `g-p-69c9b2d3940c8191beca8032978bd981` and conversation `69c9b37a-3c94-832d-be89-5ceaf91bd748`, including two real cooldown sleeps during rename/delete and successful final cleanup.
- Issues: The ChatGPT browser acceptance bar is now green, but the product is still materially rate-limited on this account during dense live write sequences. That is now an environment constraint the runner survives rather than a remaining CRUD correctness bug.
- Next: Move to Phase 4 existing-conversation tool/add-on state, with the full ChatGPT acceptance runner now treated as the canonical browser bar.

- Date: 2026-03-29
- Focus: Close the remaining ChatGPT root delete gap after the rename fix and guarded acceptance rerun.
- Progress: The next guarded ChatGPT acceptance pass proved the rename fix was real by clearing the old root rename timeout and advancing all the way through tool state + attachment checks. The next blocker turned out to be narrower than expected: standalone `auracall delete <conversationId> --target chatgpt` still depended on the refreshed conversation catalog, so a freshly created root conversation id could fail with `No conversations matched "<id>"` even though the browser route and provider delete path were valid. Added provider-native conversation-id passthrough for ChatGPT (`normalizeChatgptConversationId(...)`) in `src/browser/providers/chatgptAdapter.ts`, advertised it through `src/browser/providers/index.ts`, taught `src/browser/llmService/llmService.ts` to treat a provider-native conversation id as authoritative inside `resolveConversationSelector(...)`, and most importantly updated the delete command in `bin/auracall.ts` so an exact provider-native id bypasses list matching entirely. Focused ChatGPT adapter tests passed, `pnpm run check` passed, and the direct live proof succeeded: `delete 69c9a282-91a4-832e-b8c0-21fa595a24a9 --target chatgpt --yes --verbose` now deletes a just-created root conversation by id without needing a prior `conversations --refresh`.
- Issues: After that product fix, the next full guarded acceptance rerun got all the way to the final root delete and then correctly tripped the ChatGPT rate-limit guard, not a DOM bug: `ChatGPT rate limit detected while deleteConversation; cooling down until ...`. That is a real environment constraint rather than a broken delete surface.
- Next: Let the current cooldown clear, then rerun the guarded ChatGPT acceptance script with the new runner backoff in place to confirm the full end-to-end pass goes green again.

- Date: 2026-03-29
- Focus: Finish the remaining ChatGPT root-conversation acceptance blocker after the rate-limit guard upgrade.
- Progress: Re-ran the guarded ChatGPT acceptance flow and finally got a precise live failure instead of another rate-limit event: root conversation rename timed out on `rename <conversationId> ...`. Probed the live DOM directly and found the key surface distinction the adapter was getting wrong: the open-conversation header `Open conversation options` menu does not expose `Rename` at all on the current root conversation page; it only shows `View files in chat`, `Move to project`, `Pin chat`, `Archive`, and `Delete`. The real rename surface is the sidebar-row `Open conversation options for ...` menu on the ChatGPT home/list page, and once `Rename` is chosen there, the editable field is just a plain visible `input[type="text"]` holding the current title value. Moved `submitInlineRename(...)` in `packages/browser-service/src/service/ui.ts` onto a stronger browser-service contract by adding optional native-CDP Enter submission (`native-enter` / `native-then-synthetic`) so ChatGPT rename no longer depends only on synthetic DOM key events. Then rewired `src/browser/providers/chatgptAdapter.ts` so root conversation rename always uses the sidebar-row menu from the list surface, falls back from the synthetic tagged-row selector to the real visible rename `input[type="text"]` when React rerenders the row into edit mode, and no longer tries the invalid header-menu rename fallback. Focused tests stayed green (`tests/browser/chatgptAdapter.test.ts`), `pnpm run check` passed, and the exact previously failing live rename path succeeded for disposable root conversation `69c99df4-aaf0-8332-8714-d104d751f75d`, which refreshed as `AC GPT C rsnyfq`.
- Issues: The next guarded end-to-end acceptance rerun got past root rename and exposed the next actual blocker: root conversation delete was still starting from the conversation page and immediately failing with `ChatGPT conversation row not found for <id>`. I mirrored the rename strategy and moved delete onto the list-first sidebar-row path with header delete kept only as a fallback because the header menu really does expose `Delete`. That code is in place, but the smallest standalone live delete proof immediately ran into a separate resolution nuance: a freshly created root conversation id is not always immediately discoverable through `auracall delete <conversationId> --target chatgpt` unless the conversation has already materialized through the refreshed conversation catalog. That is a different problem from the browser delete surface itself and needs a follow-up service-resolution pass or another guarded acceptance rerun.
- Next: Re-run the guarded ChatGPT acceptance flow starting from the new list-first delete path, and if delete still blocks, treat the remaining problem as conversation-id resolution/catalog freshness rather than another DOM/menu issue.

- Date: 2026-03-29
- Focus: Close the remaining ChatGPT rate-limit hole before resuming live acceptance work.
- Progress: Upgraded the shared ChatGPT guard from simple min-spacing plus post-failure cooldown into a real rolling write-budget gate. `src/browser/chatgptRateLimitGuard.ts` now persists `recentMutationAts[]` alongside the existing cooldown metadata and exposes shared helpers to prune mutation history, append a new write, and calculate the next allowed write time for a profile. Then wired both `src/browser/llmService/llmService.ts` and `src/browser/index.ts` to honor that rolling budget before another ChatGPT mutation/browser send is attempted, while still preserving the existing `Too many requests` cooldown path. Focused rate-limit/browser identity tests passed, and `pnpm run check` passed, all without touching the live ChatGPT account again.
- Issues: The earlier guard only remembered the last write timestamp, which was enough to space adjacent operations but not enough to catch a full acceptance run that stacked many separate CLI mutations into the same short window. That is why the account could still be rate-limited even though no single command looked especially aggressive in isolation.
- Next: Resume ChatGPT live work with the rolling budget guard in place, and treat any remaining acceptance failure as a DOM/list-state issue rather than a write-cadence issue.

- Date: 2026-03-29
- Focus: Finish the package-owned menu-verification pass before returning to ChatGPT conversation CRUD.
- Progress: Added the shared select-and-reopen verification layer to `packages/browser-service/src/service/ui.ts` via `inspectNestedMenuPathSelection(...)` and `selectAndVerifyNestedMenuPathOption(...)`. The helper reopens a menu path up to the containing menu for the target option, inspects the current selected-state from live menu markup, and returns scoped available-label hints when verification fails. Then rewired `src/browser/actions/chatgptComposerTool.ts` to use that package-owned verification path instead of provider-local reopen logic. Focused browser-service + ChatGPT tests passed, `pnpm run check` passed, and a live non-Pro WSL ChatGPT browser run with `--browser-composer-tool canvas` returned `AURACALL CHATGPT CANVAS VERIFY HELPER PROBE 1.` while logging `Composer tool: canvas`.
- Issues: The helper is intentionally menu-mechanics-only. It does not decide whether a row is a tool, source, or file; ChatGPT still owns that semantic classification in the adapter, which is the right boundary for this surface.
- Next: Return to the ChatGPT conversation CRUD plan and only reopen browser-service extraction if the new conversation surfaces expose another clearly reusable failure mode.

- Date: 2026-03-29
- Focus: Finish the browser-service submenu extraction by making visible-menu handles stable enough for real top-level-menu -> submenu -> verify flows.
- Progress: Completed the next browser-service package pass instead of adding more ChatGPT-local menu glue. `packages/browser-service/src/service/ui.ts` now keeps synthetic visible-menu selectors stable across repeated `collectVisibleMenuInventory(...)` passes, which closed the real bug we hit while adopting nested submenu support: browser-service was returning `[data-oracle-visible-menu-index="..."]` handles, but a second inventory read silently reindexed those handles and left callers holding dead selectors. With that fixed, `openSubmenu(...)` / `selectNestedMenuPath(...)` are now genuinely reusable for ChatGPT's `Add files and more -> More -> Canvas` path, and `src/browser/actions/chatgptComposerTool.ts` was simplified to rely on the shared nested-path helper for activation while using menu inventory only for verification/error hints. Focused tests passed (`tests/browser-service/ui.test.ts`, `tests/browser/chatgptComposerTool.test.ts`, `tests/browser/chatgptAdapter.test.ts`), `pnpm run check` passed, and a live non-Pro WSL browser run with `--browser-composer-tool canvas` returned `AURACALL CHATGPT CANVAS BROWSER SERVICE PROBE 5.` after logging `Composer tool: canvas`.
- Issues: The original failure turned out to be a subtle package-level handle-lifetime bug, not a bad ChatGPT selector: opening a top-level menu, reading inventory, then trying to open `More` or reopen for verification was enough to invalidate the old tagged selector before the next step. The fix belongs in browser-service because any provider using menu inventory + submenu traversal would have hit the same issue.
- Next: Treat select-and-reopen verification as the next browser-service extraction, then go back to the ChatGPT conversation CRUD plan with stable menu-family + submenu primitives as the default tools.

- Date: 2026-03-28
- Focus: Freeze the next ChatGPT browser plan after project CRUD and capture the reusable browser-service techniques that fell out of the composer/add-on work.
- Progress: Wrote `docs/dev/chatgpt-conversation-surface-plan.md` as the next active ChatGPT browser plan: conversation DOM recon, conversation CRUD, conversation attachments/files, existing-conversation tool state, then a scripted ChatGPT acceptance runner. Updated `docs/dev/chatgpt-project-surface-plan.md` to mark project management effectively closed except for a future native clone action, and linked the new conversation plan from `docs/dev/smoke-tests.md` and `docs/testing.md` so the runbook no longer implies project work is the active ChatGPT front. Also expanded `docs/dev/browser-service-upgrade-backlog.md` with the concrete reusable lessons from the composer/add-on mapping work: trigger-anchored menu-family selection, nested submenu-path selection, menu inventory helpers, and reopen-to-verify option selection. The main new conclusion is that browser-service should own the mechanics of menu-family picking and submenu traversal, while adapters still own semantic classification like “tool vs source vs file”.
- Issues: The same ChatGPT menu can mix true tools, source rows, and file/upload rows. That is exactly why the extraction boundary matters: pushing classification into browser-service would be a mistake even though the menu mechanics belong there.
- Next: Start the live ChatGPT conversation DOM recon from the managed WSL sidebar/header surfaces and use the new browser-service backlog items as the default extraction targets whenever conversation work hits menu drift.

- Date: 2026-03-28
- Focus: Turn the current ChatGPT composer add-on inventory into a stable selection catalog instead of a one-off `web-search` proof.
- Progress: Probed the live signed-in WSL ChatGPT composer again and captured the current add-on surface explicitly. The top-level `Add files and more` menu now exposes `Add photos & files`, `Recent files`, `Company knowledge`, `Create image`, `Deep research`, `Web search`, and `More`. The current `More` submenu exposes `Study and learn`, `Agent mode`, `Canvas`, `Adobe Acrobat`, `Adobe Photoshop`, `Canva`, `GitHub`, `Gmail`, `Google Calendar`, `Google Drive`, `Intuit QuickBooks`, and `Quizzes`. Expanded `src/browser/actions/chatgptComposerTool.ts` alias coverage so browser-mode can reach the live labels through stable shorthand inputs like `research -> Deep research`, `image -> Create image`, `knowledge -> Company knowledge`, `study -> Study and learn`, `agent -> Agent mode`, `quiz -> Quizzes`, and `gh -> GitHub`, while keeping the existing `calendar`, `drive`, `quickbooks`, `acrobat`, and `photoshop` mappings. Focused tests stayed green, `pnpm run check` passed, and a live non-Pro browser run with `--browser-composer-tool canvas` returned `AURACALL CHATGPT CANVAS PROBE 1.` so the `More` submenu path is now proven in addition to the earlier top-level `Web search` proof.
- Issues: Some rows in the top-level menu are not really "tools" in the same sense as the connectors and mode add-ons. `Add photos & files` stays on the normal attachment flow, not `--browser-composer-tool`, and `Recent files` / `Company knowledge` are better thought of as attachment/source surfaces than reasoning tools even though they live in the same menu.
- Next: Decide whether to expose the live ChatGPT add-on catalog as an explicit CLI help/reference surface, then continue mapping any future menu drift against this concrete top-level + submenu inventory.

- Date: 2026-03-28
- Focus: Map the current ChatGPT composer add-on surface and live thinking-depth picker so browser-mode can reliably apply the same dialog options a human sees.
- Progress: Probed the signed-in WSL ChatGPT composer directly and confirmed two current DOM contracts. The thinking-depth menu now uses `Standard` / `Extended` instead of the older `light` / `heavy` wording, so `src/browser/actions/thinkingTime.ts` now treats `light -> standard` and `heavy -> extended` as legacy aliases while targeting the current labels directly. The `Add files and more` control is also a real add-on surface rather than a single flat menu: it exposes direct rows like `Web search`, `Canvas`, and a `More` submenu with additional tools, while the file uploader stays on the normal attachment path instead of belonging to tool selection. Added `src/browser/actions/chatgptComposerTool.ts`, wired `--browser-composer-tool <tool>` through the CLI/schema/config/session stack, taught browser-service menu helpers to recognize `menuitemradio` / `option` roles and dismiss stale open menus between selector steps, and live-verified a non-Pro browser run with `--model gpt-5.2-thinking --browser-thinking-time extended --browser-composer-tool web-search` returning the expected exact reply on the managed ChatGPT session.
- Issues: Reusing an already-open ChatGPT tab can leave the wrong menu visible. The first composer-tool implementation accidentally trusted the open Thinking menu (`Standard` / `Extended`) because it was simply the first visible menu in the DOM. Fixing that required both a shared `Escape`-based stale-menu dismiss step in browser-service and tighter composer-menu scoring so the add-on selector only trusts menus that actually contain add-on markers like `More`, `Add photos/files`, `Recent files`, or the requested tool label.
- Next: Continue mapping the remaining ChatGPT add-on variants under `Add files and more` / `More` and keep using the file attachment flow separately from composer-tool selection.

- Date: 2026-03-28
- Focus: Rebase ChatGPT browser model discovery/selection onto the live semantic picker instead of the stale versioned `GPT-5.2 ...` assumptions.
- Progress: Probed the authenticated WSL ChatGPT model menu directly and confirmed the current top-level picker is now semantic `Instant` / `Thinking` / `Pro` with a generic `ChatGPT` button label, so the active model has to be discovered from the open menu rather than from the button text. Updated `src/browser/constants.ts` and `src/cli/browserConfig.ts` so browser-mode defaults now resolve to `Instant`, `gpt-5.2` / `gpt-5.1` normalize to the non-Pro `Instant` path, and explicit Pro variants still map to `Pro`. Reworked `src/browser/actions/modelSelection.ts` so ChatGPT model selection scores semantic menu rows instead of hardcoding `GPT-5.2` labels, logs the actual selected menu label, and treats the checked menu row as authoritative. The live DOM recon also exposed one more drift: ChatGPT no longer marks the active row with `aria-*` or a named check icon. The real selected-state signal is a trailing slot (`<div class="trailing" data-trailing-style="default"><svg ...></svg></div>`), so the selector now treats that trailing indicator as selected too. Focused test coverage stayed green for model/config paths, and live non-Pro DOM probes on port `45011` confirmed the menu exposes and accepts `Instant` plus `Thinking` without touching `Pro`; after each click the selected row text resolved to `instant for everyday chats` and `thinking for complex questions`.
- Issues: Two unrelated `tests/browser/pageActions.test.ts` attachment tests timed out intermittently while rerunning broader suites under host load. The model-selection/config suites themselves stayed green, and the flake did not reproduce consistently on isolated reruns of the model-specific paths.
- Next: Move from project CRUD into broader ChatGPT conversation/model surfaces with the new semantic picker contract as the default assumption, and keep the live account on non-Pro tiers unless explicitly asked otherwise.

- Date: 2026-03-28
- Focus: Finish the remaining ChatGPT project-management CRUD slice by implementing project instructions on the live settings surface.
- Progress: Added `getProjectInstructions(...)` and `updateProjectInstructions(...)` to `src/browser/providers/chatgptAdapter.ts` and advertised ChatGPT instructions support through the adapter capabilities. The implementation reuses the existing project settings sheet (`input[aria-label="Project name"]` plus `textarea[aria-label="Instructions"]`), writes instructions through the same settings path used at create time, then reopens the settings sheet until the textarea value matches the expected multiline text before returning success. Live verification on the authenticated WSL Chrome session used a disposable project `AC GPT Instr 1774749141`: `projects instructions set ... --file` persisted `Keep answers concise.` plus `Always surface risks before suggestions.`, `projects instructions get ... --target chatgpt` returned that exact two-line value, and the project list no longer shows the disposable id afterward. That live pass also exposed one more cleanup nuance: ChatGPT can successfully delete a project while leaving the selected tab on the stale project route. Tightened `pushProjectRemoveConfirmation(...)` so it now accepts deletion as success when a fresh post-delete sidebar scrape no longer contains the deleted `g-p-...` id, instead of requiring an immediate route change away from the project page.
- Issues: The first disposable create attempt failed for a valid reason rather than UI drift: ChatGPT's current create modal rejects project names longer than 50 characters and leaves the `Create project` button disabled. Aura-Call surfaced that through the existing `button-disabled` path; the successful live verification used a shorter disposable project name.
- Next: Reassess whether the current ChatGPT UI exposes a native project-clone action. If it does not, document that explicitly and close out the remaining ChatGPT project-surface plan.

- Date: 2026-03-28
- Focus: Freeze the remaining ChatGPT project-management plan in the dev docs before starting live `Sources`-tab work.
- Progress: Wrote `docs/dev/chatgpt-project-surface-plan.md` to capture the next ordered ChatGPT scope after lifecycle CRUD stabilized: live `Sources` DOM recon, project sources/files CRUD, project instructions get/set, clone only if the native UI exposes it, then one disposable live acceptance pass. Linked that plan from `docs/dev/smoke-tests.md` and `docs/testing.md` so the runbook reflects that ChatGPT lifecycle CRUD is already green on the managed WSL Chrome path and the remaining work is broader project management, not basic project existence.
- Issues: The plan is intentionally specific about native UI boundaries. ChatGPT clone may not exist as a real browser surface, and file/source rows may only expose labels rather than stable ids, so the implementation needs to confirm those live constraints before adding adapter behavior.
- Next: Commit/push the checkpoint with the ChatGPT identity/canonical-route/browser-service improvements plus this new plan, then start live `Sources` DOM recon on the authenticated managed ChatGPT project page.

- Date: 2026-03-28
- Focus: Remove the remaining ChatGPT cache-identity prompt by making the managed browser session itself authoritative for account identity.
- Progress: Traced the prompt to two separate gaps. First, `LlmService.resolveCacheIdentity(...)` only attempted live browser identity detection when `browser.cache.useDetectedIdentity` was explicitly enabled, so the default path fell straight through to the interactive prompt. Second, ChatGPT did not implement `getUserIdentity(...)` at all. Probed the live signed-in WSL ChatGPT session directly and confirmed the current same-origin `/api/auth/session` payload is stable enough for this purpose: it returned `user-PVyuqYSOU4adOEf6UCUK3eiK` plus `ecochran76@gmail.com` on the managed browser session. Wired `src/browser/providers/chatgptAdapter.ts` to read that payload first, fall back to storage/profile-menu hints if necessary, and normalize it into `ProviderUserIdentity`. Then changed `src/browser/llmService/llmService.ts` so cache identity resolution now prefers detected browser identity by default unless `browser.cache.useDetectedIdentity === false`. While doing the live write verification, also fixed `bin/auracall.ts` so `projects create --target chatgpt ...` actually respects the parent `projects` target flag instead of silently falling back to the configured provider. The follow-up live write smoke then flushed out one more real ChatGPT issue: the adapter still treated any `/g/<segment>/project` route as a project id, so a transient malformed `/g/<url-encoded project name>/project` tab could poison current-project reads and cache writes. Tightened `src/browser/providers/chatgptAdapter.ts` so only canonical `g-p-...` segments count as ChatGPT project ids in URL extraction, route-settle checks, current-project reads, and project scraping. Verified with focused ChatGPT tests, `pnpm run check`, and a clean disposable create/remove cycle (`AuraCall Canonical Route Probe 1774744698`) where the selected tab stayed on `https://chatgpt.com/g/g-p-69c87496161c8191b14903d793282d9c/project`, the refreshed project list reported the canonical id, and name-based removal cleaned it up without manual tab cleanup.
- Issues: The canonical-id fix closes the transient malformed-route poisoning path, but ChatGPT project creation still depends on the live sidebar/home surfaces being present quickly enough to discover the new project after create. That is much safer now, but it is still worth keeping an eye on if ChatGPT changes its post-create navigation again.
- Next: Fold ChatGPT identity detection into any browser-account doctor/setup output we want later, then move on to the next ChatGPT project surface now that create/list/remove use stable canonical ids again.

- Date: 2026-03-27
- Focus: Clear the last scripted WSL Grok acceptance failures so the new live runner and the actual product behavior agree.
- Progress: The first runs of `scripts/grok-acceptance.ts` were valuable because they flushed out two remaining real gaps that the earlier manual smokes missed. First, `projects clone <id> <new-name>` still treated clone rename as best-effort: the command exited 0 even when the refreshed project list stayed at `(...clone)`. Tightened `bin/auracall.ts` so clone-with-name now waits for the requested name to reappear in the refreshed project list and throws if the rename does not persist. Second, project-scoped conversation refresh could still fail right after a browser prompt with `Project conversations list did not load`. The live failure was that the current project page sometimes would not materialize the Conversations tab from an in-page click alone after the prompt run. Updated `openConversationList(...)` in `src/browser/providers/grokAdapter.ts` so project-scoped flows can fall back to direct `?tab=conversations` navigation before giving up. Also fixed the acceptance runner itself to handle the current top-level `conversations context get` JSON shape and to accept the real assistant context payload, which currently includes the configured project instructions text before the expected assistant reply. After those fixes, `DISPLAY=:0.0 pnpm tsx scripts/grok-acceptance.ts --json` completed cleanly with `ok: true` for disposable suffix `cfiagk` (project `0c7b28e2-610a-4878-8dfa-c3d34c5a970f`, clone `23fb88ea-76bc-41ca-bb23-f21388299423`, conversation `aa3ee50d-cc65-4f9b-85a2-9473d115d727`), and the cleanup removed both disposable projects successfully.
- Issues: The live Grok context payload for project conversations still prepends the project instructions text to the assistant message content. The acceptance bar is no longer blocked by that, but it is still worth deciding later whether that is intended context semantics or a normalization issue.
- Next: Treat `DISPLAY=:0.0 pnpm test:grok-acceptance` as the real WSL Grok browser definition-of-done path, and only keep polishing if a later run exposes new UI drift.

- Date: 2026-03-27
- Focus: Turn the WSL Grok acceptance runbook into a first-class scripted runner so the definition of done is reproducible instead of living only in manual notes.
- Progress: Added `scripts/grok-acceptance.ts`, a live WSL-primary acceptance harness that shells through the real `auracall` CLI in non-TTY mode so list/context steps stay machine-readable. The runner now executes the canonical Grok checklist from `docs/dev/smoke-tests.md`: project create/rename/clone, instructions set/get, unique-file add/list/remove, the explicit medium-file guard, project conversation create/context/rename/delete, Markdown-preserving browser prompt capture, and cleanup. It resolves project and conversation ids from refreshed JSON output instead of trusting the human-only `projects create`/`clone` lines, added `pnpm test:grok-acceptance`, and updated the testing/manual/runbook docs to point at the scripted path first. Live verification on the authenticated WSL Chrome Grok profile completed cleanly end to end; the runner returned `ok: true` with disposable project `430fd142-382b-4ebc-939d-f40e33b0e31b`, clone `2bc78431-0825-4cb9-af6c-1cf3dd59783b`, and conversation `e7ccc288-7a26-4af1-84ab-8eea308ae806`, then removed the disposable projects successfully.
- Issues: The runner is intentionally WSL-primary and assumes the authenticated default Aura-Call Grok profile unless `--profile <name>` is passed. It does not yet emit junit/tap artifacts or run as part of the normal unit test suite because it is a real live browser acceptance pass.
- Next: With one clean scripted pass now working, the next refinement is packaging: decide whether to keep this as an explicit live acceptance tool only or add CI-friendly wrappers/reporting around it later.

- Date: 2026-03-27
- Focus: Finish the remaining WSL Grok acceptance gaps after the Bastion cache merge by fixing Markdown response capture and project delete on the live Grok UI.
- Progress: Completed the WSL acceptance pass against disposable projects `f3e51b2a-1023-439a-8a67-a62134792f35` and `a65ef98d-e67c-4dd8-b157-343d916d6f60`. Fixed `projects instructions set --file ...` so it reads merged CLI options instead of missing the documented `--file` value when Commander lifts it into the top-level option bag. Fixed project-scoped conversation rename false-success by making project conversation rename re-open the project conversation list and verify the renamed title there before returning success. The remaining Markdown blocker turned out not to be the shared ChatGPT response capture path at all: Grok browser runs were still using `waitForGrokAssistantResponse(...)` from `src/browser/actions/grok.ts`, which only returned flattened text and leaked `txtCopybeta` from the code-block toolbar. Replaced that with a richer Grok assistant snapshot that separates plain text, Markdown, and HTML, strips sticky copy chrome, and serializes current Grok list/code-block markup back into Markdown fences. Wired the Grok browser run path in `src/browser/index.ts` to use the Markdown field for `answerMarkdown`, added focused tests in `tests/browser/grokActions.test.ts`, and re-ran the live prompt on the clean clone project; the CLI now returns exactly `- alpha` plus the fenced `txt` block. Cleanup then exposed one more drift: project delete was still assuming the old `Open menu` affordance. Updated `openProjectMenuButton(...)` / `openProjectMenuAndSelect(...)` in `src/browser/providers/grokAdapter.ts` to target the current hidden sidebar-row `Options` button, hover-reveal it, require a real open menu container, and scope menu-item selection to that open menu. Live delete then removed both disposable projects cleanly, and a fresh `projects --refresh` confirmed they were gone.
- Issues: The browser-service tab census on the live WSL profile still showed one spare `about:blank` tab plus duplicate hidden `Projects - Grok` pages after the CRUD pass. That is within the current conservative tab-cap policy, but it is still worth tightening later if Grok keeps opening redundant project tabs during long acceptance runs.
- Next: With the WSL CRUD/Markdown/delete acceptance bar now passing, shift from Grok browser bring-up back to the remaining Grok finish-up list: stress file/uploads a bit harder, then decide whether the remaining residual risk is low enough to call the WSL Grok browser path fully functional.

- Date: 2026-03-27
- Focus: Merge Bastion SQL cache work onto the current Aura-Call browser/Grok branch without regressing newer browser behavior.
- Progress: Cherry-picked `origin/bastion/cache-mirror-2026-03-27` onto `sync/upstream-browser-reliability`, resolved the conflicts in favor of current Aura-Call browser/Grok behavior, and kept the new SQL cache/catalog/search/export surfaces under current `auracall` naming. Normalized the merged CLI/docs to `auracall`/`~/.auracall`, kept the newer Grok instructions-card fallback instead of the older sidebar click fallback, and aligned cache debug logging to accept both `AURACALL_DEBUG_CACHE` and legacy `ORACLE_DEBUG_CACHE`.
- Issues: The merged cache docs still mention the legacy `ORACLE_NO_BANNER` env var for bannerless `jq` pipelines because the runtime still honors that compatibility flag. That should be cleaned up in a separate naming pass instead of being changed speculatively during this merge.
- Next: Finish the cherry-pick, run focused cache/CLI/type checks, and then resume the Grok acceptance bar from the updated runbook.

- Date: 2026-03-27
- Focus: Re-baseline WSL Chrome as the real primary Aura-Call browser profile instead of carrying it under a mismatched named profile.
- Progress: Confirmed the remaining `wsl-chrome -> ~/.auracall/browser-profiles/wsl-chrome/grok` drift was not a resolver merge bug. `resolveManagedProfileDir(...)` was intentionally discarding `/home/ecochran76/.auracall/browser-profiles/default/grok` when the selected Aura-Call profile name was `wsl-chrome`, because that exact guard exists to prevent stale inherited cross-profile paths. The practical fix was to make the real primary WSL setup `profiles.default` again, keep the known-good managed profile at `~/.auracall/browser-profiles/default/grok`, preserve Windows as a separate `windows-chrome-test` profile, and update the wizard so WSL Chrome now suggests `default` instead of `wsl-chrome`. Verified with `pnpm vitest run tests/cli/browserWizard.test.ts --maxWorkers 1`, `pnpm tsx bin/auracall.ts doctor --target grok --local-only --json`, and `pnpm tsx bin/auracall.ts --profile windows-chrome-test doctor --target grok --local-only --json`.
- Issues: The managed-profile safety rule is still correct: if a named Aura-Call profile points at another managed profile tree under the same root, Aura-Call will treat that as drift and ignore it. The fix here is to align profile naming/config shape with the real managed-profile layout, not to weaken that protection globally.
- Next: Keep WSL Chrome as the documented/default onboarding path, and only revisit Windows Chrome once the human-login/debug split is clearer.

- Date: 2026-03-26
- Focus: Chrome-account persistence checks without repeatedly hitting Grok auth.
- Progress: Added Chrome-level Google-account detection to `src/browser/profileDoctor.ts` by reading the managed profile `Local State` and `Default/Preferences`. `auracall doctor --local-only --json` now reports whether the managed Chromium profile looks `signed-in`, `signed-out`, or only carries copied active-account markers without a real primary account identity. Verified on the real machine state: the WSL-managed Grok profile reports `signed-in` via merged `Local State` + `Preferences`, and the Windows `windows-chrome-test` profile initially looked `inconclusive` from `Local State` alone but flipped to `signed-in` once the detector merged `Preferences.account_info`, `google.services.last_gaia_id`, and `signin.explicit_browser_signin`.
- Issues: This is a Chrome-account persistence signal, not a service-auth signal. It is useful for low-risk onboarding checks and quickly shows when Windows profile copies did not preserve Google browser sign-in, but Grok/ChatGPT still need their own positive auth checks for CRUD-capable setup.
- Next: Use the merged Chrome-account signal as the preferred preflight persistence check before provider auth, and stop using repeated Grok logins just to answer “did the browser-level sign-in survive?”.

- Date: 2026-03-26
- Focus: Fix the last integrated WSL -> Windows Chrome cleanup bug so successful Grok runs do not leave the managed Windows browser alive.
- Progress: Traced the leftover-browser problem to a double-launch architecture bug, not just PID reuse. `runBrowserMode(...)` was prelaunching local Chrome before delegating to `runGrokBrowserMode(...)`, so Grok ended up re-adopting the same Windows-managed profile as a reused instance and skipped the final kill. Fixed this in two layers: browser-service now preserves shutdown ownership when the current run re-adopts a Chrome it launched (by PID or DevTools port), and the top-level browser runner now routes Grok directly into `runGrokBrowserMode(...)` so the generic path no longer launches Chrome first. Focused browser-service tests plus `pnpm run check` stayed clean. A fresh live Windows proof using `/mnt/c/Users/ecoch/AppData/Local/AuraCall/browser-profiles/windows-cleanup-proof-3/grok` returned `windows cleanup proof 3`, logged a single launch path, and the follow-up Windows process probe for that profile returned `[]`.
- Issues: The ad hoc PowerShell verification wrappers from zsh are still fiddly because `$status` is reserved in zsh and inline `$_`/`$null` PowerShell fragments are easy to mangle without a temp script. That is an operator-shell nuisance, not an Aura-Call runtime bug.
- Next: Decide whether to add one more unit regression around “Grok local browser path launches only once,” and whether the CLI should surface the effective elevated Windows debug port more explicitly when `45877` becomes `45891`.

- Date: 2026-03-26
- Focus: Remove the remaining WSL/Windows Chromium path footguns so users can point Aura-Call at Windows Chrome/Brave from WSL without manually translating paths.
- Progress: Added a shared browser-service path utility layer in `packages/browser-service/src/platformPaths.ts` and routed config resolution, managed-profile root/directory handling, cookie-source inference, process matching, and Windows Chrome launch through it. WSL now normalizes `/mnt/c/...`, `C:\...`, and `\\wsl.localhost\...` consistently instead of depending on which codepath sees the value first. Also updated Windows profile discovery to prefer the browser family implied by the configured executable hint, so a Windows Brave launch no longer tends to rediscover Chrome state first. Focused browser-service/config/profile-store tests plus `pnpm run check` stayed clean.
- Issues: This hardens path translation and profile discovery, but it still does not surface the chosen Windows profile source very explicitly in normal user output. Users may still want `doctor` / `setup` to say “using Windows Brave default profile” or similar without enabling verbose logs.
- Next: Decide whether the next slice should be user-facing source attribution in `doctor` / `setup`, or whether the higher-value browser-service follow-up is post-run cleanup for adopted Windows Chrome processes.

- Date: 2026-03-25
- Focus: Make integrated WSL -> Windows Chrome launches actually work with a fresh Aura-Call managed profile seeded from the Windows Chrome default profile.
- Progress: Fixed the WSL Windows-profile matcher so it inspects Windows `chrome.exe` command lines and extracts the exact `--user-data-dir` + `--remote-debugging-port` instead of returning the first `chrome.exe` PID from `tasklist.exe`. Tightened the launch path to probe Windows-local `127.0.0.1:<port>/json/version` before waiting on the WSL relay, and stopped starting integrated launches inside the low dead-port band by elevating low requested ports to `45891+`. Focused tests plus `pnpm run check` stayed clean. A fresh end-to-end live run using `AURACALL_WSL_CHROME=windows`, a fresh managed profile under `/mnt/c/Users/ecoch/AppData/Local/AuraCall/browser-profiles/windows-proof-8/grok`, and the Windows Chrome default profile as the bootstrap source completed successfully and returned `windows chrome just works`.
- Issues: The successful run still re-adopted the launched Windows profile instance later in the flow and skipped the final process kill, so the managed Windows Chrome can remain alive after the run. The preflight banner also still prints the raw configured `debugPort` even when the runtime launcher elevates it to the working high-port floor.
- Next: Decide whether to fix the post-run Windows Chrome cleanup immediately, and whether the CLI should surface the effective elevated Windows debug port more clearly in the user-facing logs.

- Date: 2026-03-25
- Focus: Check whether switching the runtime browser from WSL Chrome to WSL Brave fixes the Brave bootstrap auth gap.
- Progress: Verified that `/usr/bin/brave-browser` is installed and usable as the Aura-Call runtime browser. Launched a fresh managed Grok profile under `~/.auracall/browser-profiles/brave-wsl-runtime-20260325/grok` with `auracall login --target grok --browser-chrome-path /usr/bin/brave-browser --browser-bootstrap-cookie-path /mnt/c/.../Brave-Browser/.../Network/Cookies`. The selective managed-profile bootstrap completed quickly and Brave launched cleanly on DevTools port `45001`.
- Issues: WSL Brave runtime does not fix the underlying auth gap. The live Grok tab still showed visible `Sign in` / `Sign up` CTAs even though copied local/session state markers were present (`AF_SESSION` in localStorage, `afUserId` visible in `document.cookie`). So the missing piece is still the unreadable Windows Brave cookie DB, not the choice of WSL Chrome vs WSL Brave binary.
- Next: If we want this path to be truly turnkey, Aura-Call needs to surface “state copied but cookie DB unreadable; manual sign-in still required” explicitly. Operationally, the practical next move is to sign into Grok once in the Aura-Call-managed Brave profile and reuse that profile going forward.

- Date: 2026-03-25
- Focus: Make alternate-source managed-profile bootstrap fast enough for real onboarding and verify the Windows Brave outcome.
- Progress: Switched `src/browser/profileStore.ts` from a broad profile clone to a selective Chromium auth-state copy (preferences, network state, local storage, IndexedDB, web/account DBs), and made copy failures on locked/unreadable files recoverable instead of fatal. Focused tests plus typecheck stayed clean. A direct Brave-source bootstrap into a throwaway managed path now finishes in about 8 seconds instead of getting stuck copying a huge full profile. Live Brave login with the seeded throwaway managed profile launched successfully and the profile was clearly sourced from `/mnt/c/Users/ecoch/AppData/Local/BraveSoftware/Brave-Browser/User Data`.
- Issues: The Windows Brave `Network/Cookies` DB is still unreadable from WSL on this machine. Direct copy and Sweet Cookie both fail with `EACCES`, so the seeded Grok session still comes up guest-only even though local storage / profile state copied across. I also hit an unrelated `browser-tools doctor` regression (`__name is not defined`) while probing the live Brave-seeded tab, so I fell back to direct `eval`.
- Next: Decide whether to harden `browser-tools doctor` immediately, and whether Aura-Call should explicitly report “seeded non-cookie state only; manual login still required” when `bootstrapCookiePath` is readable as a path but the cookie DB itself is locked/unreadable.

- Date: 2026-03-25
- Focus: Split runtime browser selection from managed-profile bootstrap source so WSL Chrome can seed from other Chromium profiles like Windows Brave.
- Progress: Added `bootstrapCookiePath` through the browser config/schema/CLI stack, including `--browser-bootstrap-cookie-path`, and updated browser bootstrap/login/doctor paths to prefer that field while leaving `chromeCookiePath` under the existing WSL runtime-selection rules. Focused tests passed (`tests/browser/config.test.ts`, `tests/browser/profileDoctor.test.ts`, `tests/cli/browserConfig.test.ts`) and `pnpm run check` stayed clean. Live Brave-source probing confirmed the new source attribution path: Aura-Call resolved `/mnt/c/Users/ecoch/AppData/Local/BraveSoftware/Brave-Browser/User Data/Default/Network/Cookies` as the bootstrap source and began cloning it into a throwaway managed profile under `~/.auracall/browser-profiles/...`.
- Issues: Full-profile clone from the Windows Brave user-data tree is slow enough that `setup`/`login` can look hung while `cp(...)` is still copying a large profile across `/mnt/c`. This is a UX/perf follow-up, not a source-resolution bug.
- Next: Decide whether managed-profile bootstrap should stay as a full profile clone or become more selective/progress-aware for large Windows Chromium profiles.

- Date: 2026-03-25
- Focus: Give `auracall setup` the same machine-readable contract treatment as `doctor`.
- Progress: Added `createAuracallBrowserSetupContract(...)` in `src/cli/browserSetup.ts` and wired `auracall setup --json` in `bin/auracall.ts`. The new `auracall.browser-setup` contract embeds the initial/final `auracall.browser-doctor` reports and explicit login/verification step status, including the verification session id when a real prompt runs. To keep stdout clean, JSON-mode setup temporarily redirects stdout chatter from login/verification to stderr and only emits the final contract on stdout. Verified with `pnpm tsx bin/auracall.ts setup --target grok --skip-login --skip-verify --json`, plus focused contract tests and full typecheck.
- Issues: The setup JSON path currently carries the stable before/after doctor reports, but it does not yet embed live browser-service runtime probes the way full non-`--local-only` doctor can. That is probably fine for now because setup’s job is orchestration/status, not deep runtime diagnosis.
- Next: Decide whether provider-specific evidence capture should hang off the setup contract next, or whether the higher-value next slice is CRUD-capable verification instead of `ping`.

- Date: 2026-03-25
- Focus: Consume the stable browser-service doctor contract from Aura-Call instead of keeping doctor output human-only.
- Progress: Added `auracall doctor --json` as a versioned `auracall.browser-doctor` envelope built in `src/browser/profileDoctor.ts`. The JSON report includes the existing managed-profile/local-auth state plus an embedded `browser-tools.doctor-report` contract when a live managed browser instance is reachable, and an optional selector-diagnosis payload/error without mixing it into human-readable text. Also suppressed the CLI intro banner for explicit `--json` runs so machine-readable output is clean, added a contract regression in `tests/browser/profileDoctor.test.ts`, and verified the real local command with `pnpm tsx bin/auracall.ts doctor --target grok --local-only --json`.
- Issues: `setup` still only has the human-readable report path, so doctor has stable JSON parity before setup does. The embedded browser-tools report still assumes a loopback DevTools host, which is fine for current managed-profile runs but not yet general remote-DevTools plumbing.
- Next: Decide whether `auracall setup` also needs a versioned JSON surface, or whether the next higher-value Aura-Call slice is provider-specific evidence capture on top of the new doctor contract.

- Date: 2026-03-25
- Focus: Put a stable versioned contract around browser-service doctor/probe JSON output.
- Progress: Added explicit contract builders in `packages/browser-service/src/browserTools.ts` so `probe --json` now emits `contract: "browser-tools.page-probe", version: 1` and `doctor --json` emits `contract: "browser-tools.doctor-report", version: 1`. Added pure tests in `tests/browser/browserTools.test.ts` to lock the envelope shape itself, not just the inner report content.
- Issues: The contract is intentionally small and additive for now. It is stable enough to consume, but future fields still need to be added conservatively so we do not force version churn too early.
- Next: Either keep hardening browser-service around that contract, or switch back to Aura-Call and start consuming the contract instead of raw page-probe internals.

- Date: 2026-03-25
- Focus: Extend browser-service doctor/probe with generic cookie and storage presence checks.
- Progress: Added cookie-name and storage-key presence probing to `packages/browser-service/src/browserTools.ts`, including exact-match checks for `--cookie-any`, `--cookie-all`, `--storage-any`, and `--storage-all`. The selected-page probe report now includes sample cookie names/domains plus local/session storage counts and sample keys. Expanded `tests/browser/browserTools.test.ts` with a direct `collectBrowserToolsPageProbe(...)` test to lock in the merged page/cookie/storage result shape.
- Issues: The matching is intentionally exact-name based for now. That keeps the semantics predictable, but it may be too strict if future agents want prefix or substring probes.
- Next: Decide whether browser-service needs more generic probe operators or whether this is enough to switch back to consuming the package surface from Aura-Call.

- Date: 2026-03-25
- Focus: Finish the first package-owned browser-service diagnosis surface with doctor/report and structured probes.
- Progress: Added structured page probes in `packages/browser-service/src/browserTools.ts` for document state, visible selector matches, and script-text token presence, then exposed them through new package-owned `browser-tools probe` and `browser-tools doctor` commands. `doctor` now layers the existing tab census/selection explanation on top of the selected-page probes, while `probe` emits just the structured selected-page data. Added pure summary coverage in `tests/browser/browserTools.test.ts`.
- Issues: The current doctor is instance-centric and selected-tab-centric; it does not yet know about host-app registry mismatches because that state lives outside the generic package.
- Next: If we keep iterating on browser-service before switching back to Aura-Call, the next highest-value addition is likely storage/cookie presence probes plus deciding whether the doctor JSON shape should be treated as a stable contract.

- Date: 2026-03-25
- Focus: Surface browser-service target-choice reasoning in runtime debug paths, not just tests and CLI tools.
- Progress: Added `summarizeTabResolution(...)` to `packages/browser-service/src/service/instanceScanner.ts` and used it from `src/browser/service/browserService.ts` when a logger is provided. `resolveServiceTarget(...)` now carries `tabSelection` and can emit a compact summary of the chosen tab plus the nearest losing candidates. Added coverage in `tests/browser-service/stateRegistry.test.ts` and `tests/browser/browserService.test.ts`.
- Issues: The summary currently comes through Aura-Call's wrapper logger rather than a package-owned doctor/report path, so it is still one integration hop away from being a first-class browser-service diagnosis surface.
- Next: Decide whether the next generic browser-service slice should be a package-owned doctor/report command or more structured generic probes built on the new wait primitives.

- Date: 2026-03-25
- Focus: Extend the new browser-service readiness layer with visible-selector and script-text waits.
- Progress: Added `waitForVisibleSelector(...)` and `waitForScriptText(...)` to `packages/browser-service/src/service/ui.ts`, both built on `waitForPredicate(...)`. Updated `pressButton(...)` so selector-driven clicks now wait for a visible target when `requireVisible` is enabled instead of settling for mere DOM presence. Expanded `tests/browser-service/ui.test.ts` to cover the new waits plus the `pressButton(...)` integration path.
- Issues: The helper surface is now good enough for many hydration/debug cases, but we still mostly collapse these structured results back to booleans in higher-level code. That keeps compatibility, but it means debug output is not yet taking full advantage of the richer metadata.
- Next: Surface the richer readiness results in targeted debug paths and decide whether the older boolean wait helpers should eventually grow an options/result overload or stay as thin compatibility wrappers.

- Date: 2026-03-25
- Focus: Start the generic readiness/hydration helper track in browser-service.
- Progress: Added `waitForPredicate(...)` and `waitForDocumentReady(...)` to `packages/browser-service/src/service/ui.ts`, then rewired `waitForDialog`, `waitForSelector`, and `waitForNotSelector` to use the shared predicate polling primitive instead of duplicating their own sleep loops. Added focused coverage in `tests/browser-service/ui.test.ts` and updated the browser-service docs/backlog so readiness work is now a concrete package track instead of just a plan item.
- Issues: The new helpers return structured wait results, but current call sites still mostly collapse them back to booleans. That is fine for compatibility, but it means the richer timing context is not surfaced yet.
- Next: Add another generic readiness helper on top of `waitForPredicate(...)`, then start using the richer result in targeted debug paths where hydration races still cost time.

- Date: 2026-03-25
- Focus: Reuse browser-service tab-selection diagnostics in the runtime path, not just the CLI.
- Progress: Added `explainTabResolution(...)` to `packages/browser-service/src/service/instanceScanner.ts`, which now returns the winning tab plus scored candidate reasons (`match-url`, `match-title`, `preferred-type`) while preserving `resolveTab(...)` as a thin compatibility wrapper. Updated Aura-Call's browser wrapper in `src/browser/service/browserService.ts` to return `tabSelection` from `resolveServiceTarget(...)`, so runtime callers can inspect why a service tab was chosen without dropping into `browser-tools`. Added focused coverage in `tests/browser-service/stateRegistry.test.ts` and `tests/browser/browserService.test.ts`.
- Issues: The runtime now carries selection explanations, but higher-level callers still mostly ignore them. We still need a compact way to surface losing candidates in logs/doctor output without spamming normal command output.
- Next: Thread `tabSelection` into targeted debug paths, then move on to the next generic browser-service item: reusable readiness/hydration probes.

- Date: 2026-03-25
- Focus: Start the generic browser-service upgrade track before more Aura-Call-specific browser work.
- Progress: Added a package-owned tab census + selection explanation surface in `packages/browser-service/src/browserTools.ts`. The new `browser-tools tabs` command now shows every tab in a DevTools-enabled browser instance, the tab the tooling would actually select, and why (`url-contains`, `focused`, `non-internal-page`, `last-page`). Exported the selection explanation so callers/tests can reuse it directly, added focused coverage in `tests/browser/browserTools.test.ts`, and documented the split upgrade backlogs in `docs/dev/browser-service-upgrade-backlog.md` and `docs/dev/auracall-browser-onboarding-backlog.md`.
- Issues: This is only the first generic browser-service slice; BrowserService itself still has some open-coded target resolution and the package still lacks a richer generic doctor/probe surface.
- Next: Reuse the same explainable target-selection model inside browser-service proper (`instanceScanner` / `BrowserService`), then add generic readiness/probe helpers before taking the next Aura-Call-specific onboarding step.

- Date: 2026-03-25
- Focus: Make managed browser profiles refreshable so source-profile re-login can repair stale Aura-Call browser auth.
- Progress: Added deterministic managed-profile reseed logic in `src/browser/profileStore.ts`, wired `auracall login` / `auracall setup` to use it by default when the source Chrome cookie DB is newer, and added `--force-reseed-managed-profile` for a destructive rebuild on demand. The reseed path now refuses to overwrite a profile that is actively in use, and `auracall doctor --local-only` warns when the source profile is newer than the managed one. Verified with focused tests and a live Grok repair: after closing the stale managed guest window, `auracall login --target grok` logged `Refreshed managed profile from /home/ecochran76/.config/google-chrome (Default)`, rebuilt `~/.auracall/browser-profiles/default/grok`, and reopened Grok without visible `Sign in` / `Sign up` CTAs.
- Issues: Grok account-name detection is still separate and still returns `null` even in the refreshed authenticated session, so account labeling remains unresolved. A follow-up provider-path conversation list attempt also hit the unrelated Grok UI flake `Main sidebar did not open`.
- Next: Keep the reseed behavior, then return to positive Grok account identity detection and the sidebar/history automation reliability issue as separate fixes.

- Date: 2026-03-25
- Focus: Verify whether re-logging the WSL source profile propagates into Aura-Call's existing managed Grok profile.
- Progress: Re-ran `auracall doctor --target grok --prune-browser-state`, launched a fresh managed Grok browser with `auracall login --target grok`, and inspected the live managed session directly on `127.0.0.1:45000`. The managed profile came up alive at `/home/ecochran76/.auracall/browser-profiles/default/grok`, but the actual Grok page still showed visible `Sign in` / `Sign up` CTAs and `BrowserAutomationClient.getUserIdentity()` returned `null`. So re-logging the WSL source profile did not propagate into the already-existing Aura-Call-managed Grok profile.
- Issues: This is the expected consequence of the current managed-profile model: once `~/.auracall/browser-profiles/default/grok` exists, Aura-Call reuses it unchanged instead of re-cloning or re-syncing auth state from `/home/ecochran76/.config/google-chrome`. That makes onboarding deterministic, but it also means source-profile re-login does not repair a stale managed service profile.
- Next: Decide whether to add an explicit managed-profile reseed/sync command, or instruct users to log in directly in the managed Aura-Call Grok profile when CRUD/authenticated features are needed.

- Date: 2026-03-25
- Focus: Correct Grok guest-vs-auth identity handling instead of treating generic page controls as user identity.
- Progress: Re-ran the live probes after fixing `browser-tools` URL scoping and found the actual Grok conversation tab still shows visible `Sign in` / `Sign up` CTAs. That invalidated the earlier assumption that `afUserId` / `AF_SESSION` implied auth; those look like AppsFlyer/session analytics state, not account identity. Updated `src/browser/providers/grokAdapter.ts` so `getUserIdentity()` now tracks visible guest auth CTAs, refuses low-signal labels like `Settings`, and returns `null` for guest-like pages instead of fabricating a user. Also tightened `src/browser/actions/grok.ts` login probing to consider only visible auth CTAs, and added focused tests in `tests/browser/grokActions.test.ts` and `tests/browser/grokIdentity.test.ts`.
- Issues: This likely means the current managed Grok browser profile is not truly signed in, even though public/guest prompting still works. The remaining work is to verify that explicit login/setup flows now surface that correctly and to find a durable positive auth signal once a real signed-in Grok session is present.
- Next: Run the focused test set plus a live `BrowserAutomationClient.getUserIdentity()` check against the current tab; it should now return `null` instead of `Settings`. Then decide whether the next step is better signed-in-state detection or an explicit login/setup prompt for Grok CRUD features.

- Date: 2026-03-25
- Focus: Fix `browser-tools` tab selection so explicit URL scoping is trustworthy.
- Progress: While probing the live Grok identity flow, found that `browser-tools eval --url-contains ...` still preferred the focused tab before the explicit URL match, which meant an unrelated `accounts.x.ai` sign-in tab could silently hijack a supposedly scoped Grok probe. Fixed the page-selection order in `packages/browser-service/src/browserTools.ts` so `urlContains` wins when provided, and added `tests/browser/browserTools.test.ts` to lock in the regression.
- Issues: This was affecting live debugging accuracy, not browser-run behavior directly, but it made identity inspection much noisier and explains several earlier confusing probe results.
- Next: Re-run the Grok identity probes now that the scoped tooling actually targets the requested tab, then update `grokAdapter` with the current durable identity signal.

- Date: 2026-03-25
- Focus: Move the DevTools browser discovery helper into the browser-service package.
- Progress: Moved the full `browser-tools` CLI implementation out of `scripts/browser-tools.ts` into `packages/browser-service/src/browserTools.ts`, exported it from the package index, and reduced the top-level script to a thin Aura-Call wrapper that only resolves local config, port launch, and profile-copy defaults. Updated the browser-service tooling doc so the package owns the implementation and the app wrapper is explicitly just compatibility glue.
- Issues: The wrapper still carries Aura-Call-specific defaults and profile copy behavior, which is intentional; the package module itself now owns the reusable DevTools commands (`eval`, `pick`, `cookies`, `inspect`, `kill`, `nav`, `screenshot`, `start`).
- Next: Re-run `browser-tools --help` and typecheck to confirm the wrapper behavior is unchanged, then use the package-owned `pick`/`eval` path for the Grok identity repair work.

- Date: 2026-03-25
- Focus: Confirm live managed-profile Grok auth state and inspect account identity exposure.
- Progress: Rechecked the live managed Grok profile with `auracall doctor --target grok --local-only` and confirmed the active managed instance is `/home/ecochran76/.auracall/browser-profiles/default/grok` on `127.0.0.1:45000`. Verified the open tab is a real Grok conversation and that the managed session carries authenticated state signals (`afUserId` cookie plus `AF_SESSION` localStorage) and can answer prompts successfully. Also inspected the current Grok UI/bootstrap data and Aura-Call's own `BrowserAutomationClient.getUserIdentity()` path against the live DevTools port.
- Issues: The current Grok identity heuristics are not trustworthy for account-name confirmation. Aura-Call's live `getUserIdentity()` call returned `{ "name": "Settings", "source": "dom-label" }`, because the provider fallback still assumes an older account/settings affordance that no longer matches the current conversation layout. The separate `accounts.x.ai` surface also redirected to `sign-in`, so it is not a usable fallback for naming the live Grok session even though Grok itself is operationally authenticated.
- Next: Treat Grok auth-state confirmation and Grok account-identity extraction as two separate checks. Keep the managed-profile auth confirmation, then update the Grok identity-detection path to use a current, durable signal before relying on account-name reporting in doctor/setup flows.

- Date: 2026-03-25
- Focus: Clean Grok browser answer extraction so setup/smoke outputs only contain assistant text.
- Progress: Inspected a live managed-profile Grok turn via `scripts/browser-tools.ts` and confirmed the assistant wrapper currently contains three separate regions: the real `.response-content-markdown`, an `.action-buttons` row with the elapsed-time chip, and a follow-up suggestion stack rendered as buttons. Updated `src/browser/actions/grok.ts` so snapshots now prefer the markdown root and only fall back to clone/prune mode when markdown is absent; the fallback now strips thinking containers, action rows, suggestion markers, and button-only UI. Added focused coverage in `tests/browser/grokActions.test.ts` and reran the live setup verification with `Reply exactly with: live dom marker`, which now returns only `live dom marker` with no appended timing/suggestion text.
- Issues: While verifying this I found a separate false-positive in browser-state inspection: the legacy detector treated the new managed path `~/.auracall/browser-profiles/...` as legacy because it matched the old `browser-profile` prefix inside `browser-profiles`.
- Next: Keep the response extraction fix, land the browser-state legacy-classification cleanup, and then move on to the next onboarding rough edge instead of reopening the Grok setup path.

- Date: 2026-03-25
- Focus: Fix false legacy warnings for managed `browser-profiles` paths in doctor/setup output.
- Progress: Tightened `src/browser/profileDoctor.ts` so legacy detection now checks path segments for the old single-profile directory name (`.auracall/browser-profile`) instead of substring-matching `browser-profile`, which incorrectly marked the new managed store `browser-profiles` as legacy. Added a regression in `tests/browser/profileDoctor.test.ts` and reverified `auracall setup --target grok --skip-login --skip-verify --prune-browser-state`; the command now reports zero legacy entries for the real managed Grok profile.
- Issues: None in the inspected local path after the classification fix; setup output is now materially cleaner and matches the actual managed-profile state.
- Next: With setup output and Grok response capture cleaned up, revisit the next onboarding/debug target rather than more patch-by-patch cleanup in this area.

- Date: 2026-03-25
- Focus: Add a guided browser setup command on top of managed-profile doctor/login flows.
- Progress: Added `auracall setup --target <chatgpt|gemini|grok>` so onboarding is now one guided flow instead of separate config inspection, login, and smoke commands. The command prints managed-profile/source-profile state, can prune stale `browser-state.json` entries, opens the managed login profile when needed, pauses for sign-in, then runs a real browser verification session against that same Aura-Call-managed profile. Extracted the target/model policy into `src/cli/browserSetup.ts`, added focused tests, and verified the command live with `pnpm tsx bin/auracall.ts setup --target grok --skip-login --verify-prompt ping --prune-browser-state`, which returned a real Grok answer from the managed profile.
- Issues: The setup verification still inherits the current Grok response-capture cleanup issue, so the answer can include adjacent UI text (`310msAsk about AI capabilities`) even though the browser run succeeds. Windows-first onboarding is also still rough; this command makes the WSL/local managed-profile path clearer, but it does not eliminate the Windows DevTools routing complexity yet.
- Next: Tighten Grok response extraction so setup/smoke outputs are cleaner, then revisit Windows Chrome onboarding on top of the now-working managed-profile + setup flow.

- Date: 2026-03-25
- Focus: Add a real onboarding/debug surface for managed browser profiles and stale browser-state hygiene.
- Progress: Extended `auracall doctor` with `--local-only` and `--prune-browser-state` so it now reports the resolved managed profile dir, inferred source Chrome profile, managed cookie/bootstrap files, and current `~/.auracall/browser-state.json` entries before any live selector diagnosis. Added `src/browser/profileDoctor.ts`, tightened cookie-path profile inference for direct `.../Default/Cookies` paths, and verified the command live against the local WSL Grok setup; the stale legacy browser-state entries were pruned and the command now reports the real source profile as `/home/ecochran76/.config/google-chrome (Default)`.
- Issues: This is the doctor/inspection half of onboarding, not the full guided setup flow yet. We still do not have a one-command `setup` path that launches login, verifies a real prompt, and persists the working choice automatically.
- Next: Build the guided `setup` layer on top of the new doctor/profile inspection so first-time onboarding stops being a manual config/log-reading exercise.

- Date: 2026-03-25
- Focus: Validate managed Grok profile reuse live and fix the remaining Grok composer drift.
- Progress: Ran the first real managed-profile Grok smoke against `~/.auracall/browser-profiles/default/grok`. Confirmed the first run created the managed profile and subsequent runs reused it. Live DOM inspection showed the current Grok homepage exposes a hidden autosize `<textarea>` alongside the real visible composer, so I tightened Grok input resolution to ignore hidden/disabled editors, kept explicit textarea support for the newer UI variant, and reran the live smoke successfully: `pnpm tsx bin/auracall.ts --engine browser --browser-target grok --model grok --prompt "ping" --wait --verbose --force` returned a real Grok reply from the reused managed profile. Added focused regression coverage in `tests/browser/grokActions.test.ts`.
- Issues: `~/.auracall/browser-state.json` still contains stale legacy entries/host snapshots from earlier bring-up attempts, so browser-state hygiene still needs a cleanup pass. Source-profile validation is also currently behavioral rather than cookie-row-based because the source WSL cookie DB does not expose obvious Grok rows via a simple sqlite query.
- Next: Clean stale browser-state/doc references, then build the explicit onboarding/inspection layer (`doctor` / `setup` / managed-profile inspection) on top of the now-working managed profile flow.

- Date: 2026-03-19
- Focus: Replace disposable browser profiles with deterministic Aura-Call-managed profile storage and first-run bootstrap.
- Progress: Added `src/browser/profileStore.ts` to derive managed profile locations under `~/.auracall/browser-profiles/<auracallProfile>/<service>`, switched local browser runs, reattach, login, browser-service lookups, and `serve` to use persistent managed profiles by default, and removed the main `/tmp` automation-profile path from ChatGPT/Grok local runs. First-run managed profiles now bootstrap from the configured source Chrome profile by cloning the source profile directory (plus top-level `Local State`) into the managed store, skipping lock/cache artifacts, with cookie seeding retained as a fallback. Updated the local config to use `managedProfileRoot` instead of pinning the legacy single-profile path.
- Issues: Docs still contain some older `browser-profile` wording and the broader onboarding workflow is still CLI/config-driven rather than a guided `doctor/setup` flow. Cookie sync is still only cookies; the new profile bootstrap reduces reliance on it, but Windows/WSL source-profile detection and copy behavior still need more live validation.
- Next: Run a real managed-profile Grok smoke from the new `~/.auracall/browser-profiles/default/grok` path, then build the deterministic onboarding/tooling layer (`doctor` / `setup` / profile bootstrap inspection) on top of the new store.

- Date: 2026-03-18
- Focus: Lock in WSL Chrome as a first-class fallback before revisiting Windows Chrome bring-up.
- Progress: Fixed the WSL fallback path in three places: `resolveBrowserConfig` now lets `AURACALL_WSL_CHROME` / `AURACALL_BROWSER_PROFILE_DIR` override config and prefers WSL-discovered Chrome/cookie paths when WSL Chrome is requested; `auracall login` now uses resolved browser config instead of raw persisted Windows paths; and browser launch now keeps WSL Chrome on `127.0.0.1` with Linux temp profiles instead of forcing Windows-host routing and `/mnt/c/.../Temp` user-data dirs. Verified with targeted tests plus a live non-remote Grok run that launched `/usr/bin/google-chrome`, connected to local DevTools on `127.0.0.1:45001`, passed login, and reached the Grok prompt-readiness stage.
- Issues: Two follow-ups remain, but they are no longer setup-path blockers: the top-level verbose/session metadata still print the pre-resolved config snapshot (so runs can log Windows defaults even when runtime flips to WSL), and one live WSL Grok run still timed out at `ensureGrokPromptReady` after login. A stray second temp-profile log line (`undefined:/Users/undefined/...`) also appeared during cookie-sync/setup and should be traced separately.
- Next: Clean up the pre-resolve config logging/session snapshot, then debug the remaining Grok prompt-readiness issue under the now-working local WSL launch path.

- Date: 2026-03-25
- Focus: Positive Grok account detection on the Aura-Call-managed profile.
- Progress: Fixed two identity-path bugs in the managed Grok browser flow. First, DevTools tab scans now normalize CDP `id` to `targetId`, so `buildListOptions()` can carry a real Grok tab id instead of dropping it. Second, Grok identity lookup now reads the serialized Next flight payload with a short retry window, which covers the hydration lag that made authenticated tabs look empty on the first probe. Live `BrowserAutomationClient.getUserIdentity()` now returns the signed-in account (`Eric C`, `@SwantonDoug`, `ez86944@gmail.com`) from `~/.auracall/browser-profiles/default/grok`. Wired that identity into the CLI doctor/setup path, so non-`--local-only` `auracall doctor` and `auracall setup` now print the detected managed-profile account inline.
- Issues: The full `auracall doctor --target grok` command still has a separate flaky selector-diagnosis tail (`socket hang up` on one live run) after the local/identity report prints. The managed Grok session also still accumulates many duplicate root tabs over time, so tab selection should keep preferring explicit ids over raw URL matches.
- Next: Decide whether to make `doctor` degrade more gracefully when the selector-diagnosis tail flakes, then resume the remaining Grok CRUD/sidebar hardening with the now-verified authenticated managed profile.

- Date: 2026-03-18
- Focus: Move Grok browser model labels out of hard-coded selector logic and into the service registry.
- Progress: Replaced the embedded Grok browser alias map with service-registry-driven label resolution. `configs/auracall.services.json` now carries the current Grok browser picker labels plus legacy aliases (`grok-4.1*` -> `Expert`, `grok` / `grok-4.20` -> `Heavy`), while the code keeps only DOM text normalization. Updated the Grok browser config path, runtime mode selection, and project-instructions modal selection to resolve through the registry.
- Issues: CLI model canonicalization still maps `grok` to `grok-4.1` before browser config runs, so the current default browser path still resolves to `Expert` unless the higher-level model registry is updated separately.
- Next: Finish the Grok smoke/CRUD pass with the WSL Chrome remote session, then decide whether the model canonicalization layer should stop collapsing `grok` to the old `grok-4.1` name.

- Date: 2026-03-25
- Focus: Make Windows Chrome usable from WSL without depending on raw WSL->Windows CDP TCP.
- Progress: Implemented a first-class remote-browser workaround instead of more network guessing. `packages/browser-service/src/windowsLoopbackRelay.ts` now starts a local WSL TCP relay; each relay connection spawns a Windows PowerShell helper that talks to Windows Chrome on Windows `127.0.0.1:<port>` and pumps bytes over stdio. `connectToRemoteChrome(...)` recognizes the WSL-only `windows-loopback:<port>` host alias, rewrites the remote session to the local relay endpoint, and the remote ChatGPT/Grok run paths now use the relay’s actual host/port for runtime hints and tab cleanup. The transport-only probe succeeded repeatedly against Windows Chrome `127.0.0.1:45871`, and a live Grok smoke via `--remote-chrome windows-loopback:45871` completed end-to-end with a real answer.
- Issues: This is a remote-mode bridge, not yet the full integrated Windows-launch/manual-login path. The broader product gap is still there: the integrated WSL+Windows Chrome path needs its own local relay/external-port model instead of the current single `debugPort` assumption.
- Next: Decide whether to extend the same relay into integrated Windows login/launch flows, or keep Windows Chrome as an explicit remote-mode-only route while WSL Chrome remains the default managed-browser path.

- Date: 2026-03-25
- Focus: Revisit WSL -> Windows Chrome DevTools connectivity.
- Progress: Re-read the browser/docs history, re-tested the existing Windows setup, and separated the remaining failure into network facts instead of guesses. The host still has the earlier Windows rules in place (`Chrome DevTools 45871/45872` firewall rules plus `portproxy 192.168.50.108:45872 -> 127.0.0.1:45871`). I launched dedicated Windows Chrome probe profiles successfully, confirmed Windows Chrome only listened on loopback (`127.0.0.1:45871` / `45873`) even with `--remote-debugging-address=0.0.0.0` or `::`, and proved the current `portproxy` works from Windows itself (`Invoke-WebRequest http://192.168.50.108:45872/json/version`) but not from WSL (`curl http://192.168.50.108:45872/json/version` fails immediately). I then tested the stronger IPv6 theory directly: added an elevated Windows `v6tov4` proxy on `fd7a:115c:a1e0::1101:b830:45874 -> 127.0.0.1:45871`, confirmed Windows itself could reach it, but WSL still could not. The reason is that the obvious IPv4 and IPv6 candidates are all shared between Windows and WSL in this mirrored/Tailscale setup, so they are not reliable Windows-only ingress addresses.
- Issues: Two separate problems remain. First, the environment problem: under this mirrored/Tailscale setup, neither the shared LAN IPv4 nor the shared Tailscale/link-local IPv6 addresses give WSL a distinct TCP path into Windows Chrome DevTools. Second, the product gap: Aura-Call's integrated Windows launch/login path only has one `debugPort`, but safe `portproxy` usage needs two ports (`chromePort` on Windows loopback and a distinct `connectPort` for WSL). Without that split, the integrated launch path cannot model the known-good `45871 -> 45872` proxy arrangement even on machines where the network side is solvable.
- Next: Stop treating this as just a firewall tweak. If the goal is Windows Chrome from WSL, either find a truly Windows-only relay/tunnel path (or change WSL networking mode) and use manual `--remote-chrome`, or add a code-level external/connect-port concept before revisiting the integrated Windows launch path.

- Date: 2026-03-18
- Focus: Grok browser smoke bring-up under `~/.auracall` on WSL + Windows Chrome.
- Progress: Reviewed the current smoke docs/scripts, pinned the browser path to the dedicated `pnpm test:grok-smoke` DOM check, corrected the local `~/.auracall/config.json` nuance so `chromeProfile` is `Default` instead of a full profile path, and traced the bring-up failure down to the Windows networking layer rather than the Grok selectors. Aura-Call previously launched a dedicated Windows Chrome automation profile at `\\wsl.localhost\Ubuntu\home\ecochran76\.auracall\browser-profile` with `--remote-debugging-port=45871 --remote-debugging-address=0.0.0.0`, but WSL could not reach the DevTools endpoint through the host chosen by `resolveWslHost()`.
- Issues: On this machine `/etc/resolv.conf` pointed at `100.100.100.100` (Tailscale-style nameserver), while the reachable Windows host was `192.168.50.108`; an inbound firewall rule alone was not enough. We then confirmed a second pitfall: binding a Windows `portproxy` on the same port Chrome needs (`192.168.50.108:45871 -> 127.0.0.1:45871`) prevents Chrome from opening `--remote-debugging-port=45871` at all.
- Next: Recreate the Windows portproxy on a different external port (e.g. `45872 -> 127.0.0.1:45871`), then run Aura-Call against `--remote-chrome 192.168.50.108:45872` and continue the Grok CRUD smoke checklist.

- Date: 2026-03-18
- Focus: Fork identity rename from Oracle to Aura-Call.
- Progress: Renamed the package/bin/runtime namespace to `auracall` / `auracall-mcp` / `~/.auracall`, updated the main CLI/session/MCP strings, moved config discovery to `/etc/auracall` and `%ProgramData%\\auracall%`, switched MCP resource URIs to `auracall-session://`, and refreshed the rename-sensitive tests/docs.
- Issues: The repo still has broad historical/documentation references to Oracle plus internal `src/oracle/*` implementation names; those are now mostly compatibility/history concerns rather than public-runtime collisions.
- Next: Finish the remaining doc/branding cleanup opportunistically, then rerun the Grok CRUD/manual smoke path under the Aura-Call name.

- Date: 2026-03-18
- Focus: Final pass on upstream reattach/manual-login hardening.
- Progress: Restored upstream-hardened prompt commit detection by re-reading baseline turns when absent and requiring a new turn before treating composer-cleared fallback signals as committed. Added dedicated `promptComposer` tests and reverified the surrounding browser/session paths.
- Issues: The remaining upstream diff in browser/session files now looks mostly structural or product-shape-related rather than obviously missing reliability fixes.
- Next: Treat Batch 1 browser reliability as effectively complete and move to the smaller non-browser imports (Gemini MIME upload or API/model routing) unless new browser bugs appear.

- Date: 2026-03-18
- Focus: Batch 1.2 upstream browser reliability import.
- Progress: Ported Cloudflare challenge preservation into local browser flows by turning `ensureNotBlocked` into a structured `BrowserAutomationError(stage=cloudflare-challenge)`, preserving the browser/profile for ChatGPT and Grok, and keeping runtime metadata on session errors. Verified with targeted browser/session tests and typecheck.
- Issues: The remaining reattach/manual-login delta is now smaller and mostly about nuanced behavior differences rather than missing core plumbing.
- Next: Compare the remaining upstream reattach/manual-login commits against local behavior and decide whether any targeted port is still worth the churn.

- Date: 2026-03-18
- Focus: Batch 1.1 upstream browser reliability import.
- Progress: Ported the remaining assistant-response watchdog delta from upstream: abort the poller when the observer path wins and keep longer stability windows for medium/long streamed answers. Verified with targeted browser tests and typecheck.
- Issues: Full upstream browser sync is still not a cherry-pick exercise; most remaining value is in small reliability deltas, not wholesale file adoption.
- Next: Inspect Batch 1.2 reattach/manual-login/cloudflare diffs and import only the behavior gaps that are still missing locally.

- Date: 2026-03-18
- Focus: Assess divergence from `upstream/main` and define a realistic sync strategy.
- Progress: Compared local `main` against `upstream/main` from merge-base `2408811f` (`88` upstream commits vs `209` local), reviewed overlapping file surfaces, and grouped divergence into upstream-friendly improvements vs Oracle-specific product fork areas.
- Issues: Both branches heavily modify `bin/auracall.ts`, browser core/config/session plumbing, and docs, so a full linear rebase would be conflict-heavy and likely re-litigate product decisions rather than just code mechanics.
- Next: Prefer selective upstream merges/cherry-picks for shared infrastructure and API/browser reliability fixes; avoid trying to rebase away Oracle’s provider/CRUD/cache architecture.

- Date: 2026-03-18
- Focus: Turn upstream divergence analysis into an executable sync plan.
- Progress: Added `docs/dev/upstream-sync-plan.md` with phased import batches, commit shortlist, conflict hotspots, and a recommended order: browser response capture, reattach/manual-login/cloudflare, Gemini MIME upload, then small CLI/API correctness fixes.
- Issues: The highest-value upstream fixes land in files that Oracle also heavily changed, so most imports should be manual ports or topic batches rather than blind cherry-picks.
- Next: Start `sync/upstream-browser-reliability` and port the assistant-response/reattach fixes first.
- Date: 2026-02-24
- Focus: Mirror-first cache defaults (history depth + project-only hydration + cleanup retention).
- Progress: Added config/schema support for `cache.includeProjectOnlyConversations` and `cache.cleanupDays`; wired profile cache override propagation; switched CLI/browser fallback defaults to generous mirror-oriented values (`historyLimit=2000`, cleanup default `days=365`); made `cache --refresh` default `includeProjectOnlyConversations` resolve from cache config instead of hard-coded false; aligned Grok/llmService history fallback limits to `2000`; updated configuration/browser docs accordingly.
- Issues: Existing user configs with explicit conservative cache values will continue using those values until updated (expected precedence behavior).
- Next: Run cache refresh + cleanup smoke on a real account fixture to confirm defaults behave as expected under non-CLI override paths.

- Date: 2026-02-23
- Focus: Cache hardening wave (refresh regression smoke, maintenance contention, parity repair, WS4 bootstrap).
- Progress: Added `scripts/verify-cache-refresh-modes.ts` to assert refresh-mode behavior (default excludes project-only IDs; `--include-project-only-conversations` increases project-only coverage). Hardened cache maintenance with SQLite busy retry handling on doctor/clear/compact/repair SQL operations. Extended `cache doctor` with parity diagnostics (`cache_entries` vs `cache-index.json`) and orphan catalog counts; extended `cache repair` with targeted parity actions (`prune-orphan-source-links`, `prune-orphan-file-bindings`). Started WS4 by staging local file refs into deterministic cache blobs (`blobs/<sha256>/<filename>`) in SQL store sync, updating file-asset pointers/metadata, and pruning detached stale blobs during cleanup.
- Issues: Runtime CLI smoke commands (`pnpm tsx ...`) are blocked in this sandbox (`EPERM` tsx IPC socket), so command-level execution must be validated in your normal terminal.
- Next: Add dedicated doctor checks for migration marker/catalog parity and validate blob retention safety thresholds (`maxBytes` / `maxAgeDays`) before enabling aggressive cleanup policies.

- Date: 2026-02-23
- Focus: Opt-in project-only conversation ID hydration during `cache --refresh`.
- Progress: Added `--include-project-only-conversations` to `oracle cache --refresh`. Default refresh behavior is unchanged (backfill project linkage only for global conversation IDs). With the new flag, refresh also inserts project-scoped conversation IDs discovered via per-project `listConversations(projectId)` and writes via cache-store APIs.
- Issues: Enabling the flag can increase cached conversation volume for large project sets; operators should pair it with sensible history bounds when needed.
- Next: Add a dedicated refresh smoke that compares baseline vs opt-in ID counts for a known project fixture.

- Date: 2026-02-23
- Focus: Project-linked conversation ID enrichment during cache refresh.
- Progress: Updated `refreshProviderCache` to enrich global conversations with project associations by querying each project’s scoped conversation list and only backfilling `projectId`/project URL for conversation IDs that already exist in the global list. Also switched refresh writes to cache-store APIs (`json|sqlite|dual`) so SQL + JSON stay consistent for exports/search.
- Issues: Backfill depends on global list coverage; if a project conversation ID is not present in the global snapshot (for example low history limit), it is intentionally not inserted.
- Next: Consider adding an opt-in mode to include project-only IDs when users explicitly request full project-link hydration.

- Date: 2026-02-23
- Focus: Cache export `--project-id` regression fix.
- Progress: Fixed export planner/renderer so project filtering works for `scope=projects` and is applied deterministically at payload level (not only index-entry selection). Added conversation project-id fallback extraction from URL to improve `scope=conversations --project-id` filtering when explicit `projectId` is missing. Verified with CLI exports and parity smoke.
- Issues: Current Grok cached `conversations.json` for `ez86944@gmail.com` contains no project-associated conversation rows for SoyLei (`projectId` absent and URLs are `/c/...`), so `scope=conversations --project-id ...` legitimately yields an empty conversations payload in this identity.
- Next: Decide whether to enrich cached conversation metadata with project linkage during scrape/refresh so project-scoped conversation exports can include project chats reliably.

- Date: 2026-02-23
- Focus: Cache validation sweep (Grok, SQL-backed identity).
- Progress: Ran strict cache checks and export parity for `grok/ez86944@gmail.com`: `cache doctor --strict` clean, `cache repair --actions all` dry-run clean, context source parity confirmed (`37` live vs `37` cache for `d9845a8e-f357-4969-8b1b-960e73af8989`), SQL catalog smoke clean, and conversation export parity (`6707a57d-4bfe-4859-82a5-968b19c052f8`) including no-index path clean. Also ran `cache clear` and `cache cleanup` dry-runs for safety checks.
- Issues: `cache export` filtering by `--project-id` appears ineffective for both `--scope projects` and `--scope conversations` (returns all or zero unexpectedly despite project existing in cached `projects.json`).
- Next: Fix export planner filtering semantics for project-scoped exports and add regression coverage for `--project-id` across scopes.

- Date: 2026-02-23
- Focus: Grok project CRUD regression check after sidebar/instructions UI updates.
- Progress: Patched `pushProjectInstructionsEditButton` to fall back from label-based button press to clicking the visible instructions side-panel card (`group/side-panel-section`). Re-ran Grok project smokes: instructions edit + modal read pass, project menu open/rename/remove entry points pass (remove pass confirmed after exiting rename-edit mode), create modal steps 1–3 pass, and CLI `projects instructions get` now succeeds for SoyLei project `8d2b61a7-6bcd-496f-ae3a-c20b3bd09e62`.
- Issues: Sequential menu smokes can leave the UI in "Editing project name" state; subsequent menu open checks can fail until edit mode is exited (Save/Escape).
- Next: Add state-reset guard in project menu smoke scripts (or helper) so rename-mode side effects do not contaminate subsequent checks.

- Date: 2026-02-23
- Focus: SoyLei cache scrape + export parity validation.
- Progress: Resolved SoyLei project (`8d2b61a7-6bcd-496f-ae3a-c20b3bd09e62`), refreshed project/conversation caches, scraped context payloads for all SoyLei conversations (`6707a57d-4bfe-4859-82a5-968b19c052f8`, `38469740-1cd0-42db-86b8-347ba07516f7`, `054f8198-6505-47a5-a7f4-42e23359fdd8`, `093151a7-2ab8-4383-9ea2-f05451a86a93`), and ran export parity smoke successfully per conversation.
- Issues: `projects instructions get` still fails in Grok with `ensureProjectSidebarOpen` selector miss (`Button not found (candidates: home page, search, history, ec, toggle sidebar)`), so project-instructions dataset was not hydrated during this pass.
- Next: Stabilize Grok project-sidebar opener for instructions modal path, then rerun SoyLei project-level scrape to populate/verify project-scope export entries.

- Date: 2026-02-23
- Focus: WS3 validation automation.
- Progress: Added `scripts/verify-cache-export-parity.ts` to run a cache export matrix (`conversation` json/csv/md/html/zip + json broader scopes) and verify no-index SQL-first behavior automatically. Live smoke passed for Grok conversation `d9845a8e-f357-4969-8b1b-960e73af8989`.
- Issues: Node 25 still emits `node:sqlite` experimental warning unless `NODE_NO_WARNINGS=1` is set.
- Next: Extend parity script with project-scope checks once reliable project fixture IDs are available in cache.

- Date: 2026-02-23
- Focus: WS3 cache export hardening (SQL-first discovery/materialization).
- Progress: Reworked `cache export` planning to use SQL (`cache.sqlite`) entries first, then `cache-index.json`, then filesystem fallback. Added store-backed JSON materialization so exports succeed when JSON mirror files are missing (sqlite-first/dual paths). Verified conversation exports across `json|csv|md|html|zip` and verified export still works when `cache-index.json` is temporarily absent.
- Issues: `cache export --conversation-id` initially ignored dashed option parsing and exported full scope; fixed by normalizing nested command options and reading dashed/camel keys consistently.
- Next: Extend SQL-first discovery/materialization checks to project scopes with heavy project-knowledge/project-instructions coverage.

- Date: 2026-02-23
- Focus: Cache catalog CLI option parsing (`cache sources/files list|resolve`).
- Progress: Fixed hyphenated filter flags (`--conversation-id`, `--project-id`) being silently ignored in catalog commands. Actions now normalize options via command+parent+program merges, and filter extraction reads both camelCase and dashed keys.
- Issues: Commander option resolution differs across nested commands and global flags; relying on a single callback arg object is fragile.
- Next: Apply the same normalized option extraction pattern to any remaining nested cache commands that accept dashed flags.

- Date: 2026-02-23
- Focus: Grok context source completeness (`conversations context get` + cache parity).
- Progress: Hardened Grok source extraction to detect/click the real `N sources` chip controls (not only `[role="button"][aria-label]`), wait for sidebar accordion render, expand `Searched ...` sections, and persist full citations into `context.sources`. Verified live + cache parity for `d9845a8e-f357-4969-8b1b-960e73af8989` (`37` sources in both flows).
- Issues: Source-chip DOM shape differs across Grok layouts; selector logic must stay text/visibility-based rather than strict role+aria assumptions.
- Next: Keep `cache context` machine-friendly for pipelines (`jq`) and continue WS3 SQL-first export/discovery hardening.

- Date: 2026-02-22
- Focus: Cache operations workstream (WS1): clear/compact/cleanup.
- Progress: Added `oracle cache clear`, `oracle cache compact`, and `oracle cache cleanup` with provider/identity scoping, dry-run-first behavior for destructive paths (`clear`/`cleanup` require `--yes`), dataset/cutoff filtering, and JSON reports. Cleanup now also prunes stale cache-index entries and old backups by cutoff.
- Issues: SQLite commands should be run sequentially per identity; parallel cache operations can hit transient `database is locked`.
- Next: Add a dedicated `cache lock`/retry strategy or serialized operation wrapper for batched cache maintenance.

- Date: 2026-02-22
- Focus: Cache repair tooling (`cache repair`).
- Progress: Added `oracle cache repair` with default dry-run and explicit mutation guard (`--apply --yes`), plus action selection (`sync-sql`, `rebuild-index`, `prune-orphan-assets`, `mark-missing-local`, `all`). Repair now creates per-identity backups of `cache.sqlite`/`cache-index.json` before mutating.
- Issues: Repair currently focuses on structural/cache-pointer cleanup only; no high-level conflict resolution for provider-specific semantic drift yet.
- Next: Add targeted `cache repair` sub-actions for catalog re-backfill and index/sql parity validation.

- Date: 2026-02-22
- Focus: Cache integrity tooling (`cache doctor`).
- Progress: Added `oracle cache doctor` with provider/identity filters, JSON output, `--strict` fail mode, SQLite checks (`cache.sqlite` presence, `PRAGMA quick_check`, required table presence), and missing-local file pointer detection via `resolveCachedFiles`.
- Issues: Legacy JSON-only identities still show warning findings (`cache.sqlite not found`), which is expected until those identities are migrated/written via SQL-capable flows.
- Next: Add `cache repair` with safe dry-run actions (index rebuild, catalog backfill rerun, orphan pruning).

- Date: 2026-02-22
- Focus: Cache file-pointer diagnostics.
- Progress: Added `oracle cache files resolve` command and `resolveCachedFiles(...)` in `cache/catalog.ts` to classify file bindings as `local_exists`, `missing_local`, `external_path`, `remote_only`, or `unknown`, with summary counts and `--missing-only` filtering.
- Issues: Current Grok identity cache used for smoke has zero file-binding rows, so resolve output is empty in this environment despite command correctness.
- Next: Add `cache doctor` checks that fail on `missing_local`/orphan bindings and optionally emit repair suggestions.

- Date: 2026-02-22
- Focus: SQL-first cache catalog query commands (sources/files).
- Progress: Added `oracle cache sources list` and `oracle cache files list` backed by new `cache/catalog.ts` (SQL-first reads from `source_links`/`file_bindings` with JSON fallback in `json|dual` modes). Added filter support (conversation/project/domain/dataset/query/limit) and optional `--resolve-paths` for file path expansion.
- Issues: `cache files list` can legitimately return `count: 0` for identities without file-binding writes yet; this is expected until file datasets are cached for that identity.
- Next: Add `cache files resolve`/orphan checks plus cache maintenance commands (`clear`, `compact`, `doctor`) from WS1/WS5.

- Date: 2026-02-22
- Focus: Cache context retrieval/query ergonomics (keyword + semantic search).
- Progress: Added `oracle cache context search <query>` and `oracle cache context semantic-search <query>` backed by SQL-first cache context loading (with JSON fallback), role/conversation filters, and embedding caching in `semantic_embeddings` table. Added docs/testing command examples.
- Issues: Semantic search requires `OPENAI_API_KEY`; Node 25 emits `node:sqlite` experimental warning noise that can break `jq` pipelines unless warnings are suppressed.
- Next: Add cache catalog query commands (`cache sources/files list`) and cache maintenance commands (`clear/compact/doctor`) from the remaining TODO plan.

- Date: 2026-02-22
- Focus: Cache backlog planning (post SQL migration).
- Progress: Added `docs/dev/cache-remaining-todos-plan.md` with prioritized workstreams: cache ops (`clear/compact/cleanup`), SQL-first catalog queries, export hardening, downloadable file lifecycle, and integrity/repair tooling.
- Issues: Current cache operations are still minimal (`refresh`, context list/get, export); no dedicated clear/repair commands yet.
- Next: Implement WS1 (cache clear/compact/cleanup) and WS5 (doctor/repair) first.

- Date: 2026-02-22
- Focus: SQL-first cache context access in CLI.
- Progress: Moved `oracle cache context list/get` to llmService cache APIs that use the active cache store abstraction (SQLite primary in dual mode, JSON fallback), instead of directly reading `cache-index.json`/`contexts/*.json` from CLI code.
- Issues: Sandbox here blocks `tsx` runtime commands (`EPERM` on IPC pipes), so runtime CLI smoke must be re-run in your normal environment.
- Next: Add SQL-first catalog query commands (sources/files tables) so agent workflows can avoid raw DB inspection.

- Date: 2026-02-22
- Focus: SQL cache catalog hardening (sources/files metadata).
- Progress: Added catalog migration/backfill pass (`backfill_catalog_v2`) so existing cache DBs populate `source_links`/`file_bindings`; added file-asset pointer write-through (`file_assets`) with cache-relative path support when available; added `verify-cache-sql-catalog.ts` smoke script.
- Issues: Existing DBs that never hit llmService cache paths can still look v1-only until a cache read/write initializes/backsfills SQL.
- Next: Add SQL-first `cache context`/catalog read commands so verification does not depend on JSON-index pathways.

- Date: 2026-01-24
- Focus: Context cache persistence correctness (SQLite + JSON mirror).
- Progress: Fixed nested-path cache writes so `contexts/<id>.json` is created; verified `conversations context get` now persists both SQLite (`conversation-context`) and JSON mirror with `sources[]`.
- Issues: CLI piping still needs `--json-only` + `NODE_NO_WARNINGS=1` for clean `jq` output due Node SQLite warning noise.
- Next: Add a first-class quiet/json output mode for machine pipelines across CLI commands.

- Date: 2026-01-24
- Focus: Conversation context completeness (include consulted sources).
- Progress: Extended `ConversationContext` with optional `sources[]`; updated Grok context scraper to collect citation links from both inline assistant content and the dedicated `N sources` sidebar (`Searched web` / `Searched 𝕏` accordions), then flow them through llmService normalization/cache output.
- Issues: Live verification still depends on a conversation that includes source links in the current Grok UI.
- Next: Run live `oracle conversations context get <id> --target grok` against a cited conversation and confirm source list quality.

- Date: 2026-01-24
- Focus: Cache DB migration (json/sqlite/dual) with safe rollout.
- Progress: Added `docs/dev/cache-db-migration-plan.md`; wired `browser.cache.store` through schema/profile defaults and `LlmService`; hardened dual-store behavior so SQLite primary failures fall back to JSON mirror; fixed SQLite cache-dir resolution to use provider cache path.
- Issues: Need dedicated integrity/repair tooling for SQLite (`doctor` follow-up).
- Next: Add cache integrity command(s) and broader dual-mode smoke coverage.

- Date: 2026-01-24
- Focus: Cached context accessibility for agents + user exports.
- Progress: Added `oracle cache context list/get` to read cached contexts without live browser calls; extended cache export scope to `contexts` for json/md/html/csv/zip outputs.
- Issues: None so far; relies on existing cache identity resolution.
- Next: Smoke `cache context` and `cache export --scope contexts` against populated Grok cache.

- Date: 2026-01-24
- Focus: Conversation context retrieval plumbing (provider + llmService + CLI).
- Progress: Added Grok `readConversationContext` scraping, `LlmService.getConversationContext` with cache write-through + cached fallback, and `auracall conversations context get <id>` plus `scripts/verify-grok-context-get.ts`.
- Issues: Context retrieval needs resilient scraping for both `/c/<id>` and `/project/<id>?chat=<id>` routes; added explicit invalid-URL checks and message-presence validation to fail clearly.
- Next: Run live Grok context smoke from CLI and confirm cache entries under `contexts/<conversationId>.json`.

- Date: 2026-01-24
- Focus: Grok project file flows after Personal Files UX change.
- Progress: Migrated add/remove/list flows to Personal Files modal interactions; added pending-remove verification (line-through/Undo/opacity) before Save; validated CLI add/remove stability.
- Issues: File listing semantics were briefly inconsistent during transition between old Sources-root and new modal-root selectors.
- Next: Keep CLI file flows stable and continue Phase 7 project/conversation CRUD tasks.

- Date: 2026-01-24
- Focus: Grok Sources tab CRUD smoke + helper exports.
- Progress: Exported Sources helpers for direct smoke scripts; added `verify-grok-project-sources-steps.ts` for per-step testing; made Sources file expansion tolerant when the list is empty.
- Issues: Step runner originally chained steps unintentionally; fixed to run only the requested step.
- Next: Commit Sources smoke + helper exports, then finish UI helper upgrade integration and smoke in CLI.

- Date: 2026-01-24
- Focus: UI helper upgrades + Grok menu/hover reliability.
- Progress: Added `waitForMenuOpen`, `pressMenuButtonByAriaLabel`, `hoverAndReveal`, and `pressButton` diagnostics; scoped menu selection with `menuRootSelectors`; adopted helpers in Grok project menu + history rename/delete; added fallback navigation when create-project hover fails; added `scripts/start-devtools-session.ts` to launch/resolve a DevTools port.
- Issues: Local smoke scripts require a live DevTools port; no active port caused verify scripts to fail.
- Next: Resume Phase 7 CRUD (project sources knowledge + conversations).

- Date: 2026-03-26
- Focus: Windows Chrome Default-profile bootstrap + Grok auth verification.
- Progress: Hardened managed-profile bootstrap for live Windows Chromium sources by adding a Windows shared-read file-copy fallback for locked profile files, sanitizing copied crash/session state (`Preferences` / `Local State`, session artifacts), and always launching Chrome with `--hide-crash-restore-bubble`. Also fixed the Grok provider’s `windows-loopback` attach path so remote identity probes no longer fail with DNS resolution errors.
- Issues: A fresh Windows-managed profile seeded from `C:\\Users\\ecoch\\AppData\\Local\\Google\\Chrome\\User Data\\Default` now launches stably enough to complete a browser Grok run, but the live imported Grok tab is still guest-only on this machine. Direct proof: the imported Windows session on `windows-loopback:45891` returns `identity: null`, the live page shows visible `Sign in` / `Sign up` CTAs, and `ensureGrokLoggedIn(...)` still passed because its check is only a negative CTA/not-found probe and can miss the later guest UI state.
- Next: tighten Grok login verification to require a positive signed-in signal for CRUD-capable setups, and determine whether the remaining guest state comes from missing live Windows cookie transfer versus the source Windows Chrome profile simply not being signed into Grok.

- Date: 2026-03-26
- Focus: Positive Grok auth verification + persistent Windows Grok profile handling.
- Progress: Tightened `ensureGrokLoggedIn(...)` so Grok browser runs only pass after a positive signed-in identity is detected; guest CTA visibility now correctly keeps setup/login in the “not authenticated” state. Also fixed a dangerous Windows retry-policy bug: explicit managed profile paths are now preserved across DevTools port retries instead of being deleted/reseeded. Updated `~/.auracall/config.json` so Windows Chrome is the default browser again, the Windows Aura-Call profile root is the managed root, and Grok is pinned per-service to `/mnt/c/Users/ecoch/AppData/Local/AuraCall/browser-profiles/windows-default-import-4/grok`.
- Issues: The previous verification run against `windows-default-import-4/grok` happened before the retry-policy fix and did force-reseed that profile from the WSL Chrome source during port retries. After the fix, a safe remote attach against the exact pinned profile on `windows-loopback:45910` still showed visible `Sign in` / `Sign up` controls, so I cannot honestly claim Grok auth is present on that profile right now. `auracall doctor` also still has a registry attribution bug where a live `windows-loopback` port can be associated with the old WSL profile path instead of the Windows-managed one.
- Next: Either log into Grok once more in the pinned Windows-managed profile now that retries are non-destructive, or fix the `windows-loopback` registry attribution so doctor/setup can probe the active Windows-managed session cleanly and report the account without manual state repair.

- Date: 2026-03-26
- Focus: Separate Aura-Call profiles for WSL Chrome vs Windows Chrome while onboarding stabilizes.
- Progress: Split `~/.auracall/config.json` into distinct selected profiles. Default `wsl-chrome` now resolves to the WSL-managed Grok profile at `/home/ecochran76/.auracall/browser-profiles/default/grok`, while `--profile windows-chrome` resolves to the Windows-managed Grok profile at `/mnt/c/Users/ecoch/AppData/Local/AuraCall/browser-profiles/windows-default-import-4/grok`. Verified both with `auracall doctor --target grok --local-only --json`.
- Issues: The profile split is working, but neither profile should be assumed authenticated. The WSL-managed profile launches cleanly under WSL Chrome and is structurally intact, but Aura-Call still sees visible `Sign in` / `Sign up` controls when attached to Grok. The Windows profile remains isolated under `--profile windows-chrome` so future tests will not trample the WSL profile again.
- Next: Re-login whichever profile is being tested, then rerun the positive Grok auth probe without mixing browser systems or managed profile roots.

- Date: 2026-01-15
- Focus: Grok project sources file management + UI helper extraction.
- Progress: Added project file add/list/remove CLI; hardened Sources tab attach/upload/remove flows; extracted reusable helpers (`ensureCollapsibleExpanded`, `hoverRowAndClickAction`, `queryRowsByText`, `openRadixMenu`) and updated docs.
- Issues: Grok sources collapse state + hover-only controls required coordinate hover; Radix menus required pointer event sequence.
- Next: Continue Phase 7 project CRUD (knowledge files + clone fix), then revisit conversation flows.
- 2026-03-26
  - Progress: Traced the Windows `windows-chrome-test` launch confusion to two separate issues. First, `--profile windows-chrome-test` was not actually applying the selected profile's browser overrides because `resolveConfig()` merged `browserDefaults` into `browser` before profile application, and the profile overlay only filled missing fields. Fixed resolver precedence to `CLI > selected profile > browserDefaults`, taught profile-browser parsing to accept modern `chromeCookiePath` / `chromeProfile` keys, and added resolver coverage. Verified with `tests/schema/resolver.test.ts` and a live `resolveConfig({ profile: 'windows-chrome-test' })` probe that Windows Chrome path/cookie path/managed root/manual profile dir now resolve correctly.
  - Progress: Fixed `packages/browser-service/src/login.ts` to register and print the actual launched DevTools endpoint (`chrome.port` / `chrome.host`) instead of the originally requested port. This was masking the real Windows session by printing `windows-loopback:9222` even though the live managed profile was on `45920`. Added `tests/browser/browserLoginCore.test.ts`.
  - Finding: The stray `file:///C:/Users/ecoch/AppData/Local/AuraCall/browser-profiles/windows-chrome-test/grok/` window was not reproduced by the current product launcher. The live bad process had command line `--user-data-dir= C:\Users\ecoch\...windows-chrome-test\grok --remote-debugging-port=45920 https://grok.com/`, while the good product-owned process had `--user-data-dir=C:\Users\ecoch\...windows-chrome-test\grok --remote-debugging-port=45920 about:blank`. Windows `netstat -ano` showed PID `213888` as the actual `45920` listener; after killing the broken sibling PID `205220`, the remaining live `json/list` tabs for `45920` showed only Grok pages and `about:blank`, with no file URL.
  - Progress: Fixed `packages/browser-service/src/manualLogin.ts` so manual/login reuse no longer always calls `CDP.New(...)`. It now reuses an existing matching login tab first, then reuses an existing `about:blank` page by navigating it, and only opens a new tab when nothing reusable exists. Added `tests/browser/manualLogin.test.ts` and verified live on the Windows managed profile: the Grok page count on `127.0.0.1:45920/json/list` stayed at `4` before and after `auracall --profile windows-chrome-test login --target grok`, instead of growing to `5`.
  - Progress: Cleaned up the live Windows session after the tab-reuse fix. The apparent "three Chrome windows" state turned out to be one real managed `windows-chrome-test/grok` browser root on `45920` plus two stale repro browser roots (`launch-repro-a` on `45931`, `launch-repro-b` on `45932`). Killed only the repro roots, leaving PID `213888` on `45920` intact. Then pruned the remaining managed window from four duplicate `https://grok.com/` tabs plus `about:blank` down to one Grok tab via the DevTools `json/close` endpoint.
  - Finding: `auracall doctor --profile windows-chrome-test --local-only --json` now correctly reports Chrome-account persistence for the managed Windows profile (`Eric Cochran <ecochran76@gmail.com>`), but the registry still marks the live `windows-loopback` entry as stale/alive=false even while selector diagnosis can reach the page on port `45920`. That is a remaining Windows registry liveness bug, not a profile-loss bug.

- Date: 2026-03-26
- Focus: Windows managed-profile DevTools rediscovery after manual sign-in/reopen.
- Progress: Added Windows profile-scoped DevTools discovery helpers. `packages/browser-service/src/processCheck.ts` now has `probeWindowsLocalDevToolsPort(...)` and `findResponsiveWindowsDevToolsPortForUserDataDir(...)`, and `packages/browser-service/src/chromeLifecycle.ts` now uses `discoverWindowsChromeDevToolsPort(...)` during Windows-from-WSL reuse/launch. That lets Aura-Call recover when the actual responsive Windows DevTools endpoint differs from the requested port or when the old registry port is stale.
- Verification: `pnpm vitest run tests/browser-service/processCheck.test.ts tests/browser-service/windowsChromeDiscovery.test.ts tests/browser-service/chromeLifecycle.test.ts tests/browser/manualLogin.test.ts tests/browser/browserLoginCore.test.ts tests/schema/resolver.test.ts` and `pnpm run check` both passed.
- Finding: The current live `windows-chrome-test/grok` browser root (PID `228740`, command line `--remote-debugging-port=45894`) still returned `null` from the new discovery helper: no responsive DevTools port was found for that managed profile, and Windows reported no listening TCP ports for any Chrome process in that profile group. So the active failure mode is now clearly "Chrome window exists but is not exposing CDP", not just "WSL cannot reach the right port".
- Next: Solve Windows managed-profile launch ownership so the signed-in Aura-Call Chrome root keeps or regains a live DevTools endpoint after manual sign-in/reopen. Options are a Windows-side broker/helper that owns the launch and reports the real endpoint, or a stricter "close all conflicting Chrome roots and relaunch isolated managed profile" path when Windows CDP disappears.

- Date: 2026-03-26
- Focus: Prove whether Windows CDP failure is quoting or fixed-port selection.
- Progress: Ran a Windows-side A/B launch check. A literal PowerShell launch of stock Chrome with a managed Aura-Call profile and `--remote-debugging-port=45941` exposed `/json/version`, but a nearby fixed port (`45942`) timed out. A literal PowerShell launch with `--remote-debugging-port=0` worked immediately, wrote `DevToolsActivePort`, and exposed a live endpoint. Patched `packages/browser-service/src/chromeLifecycle.ts` so WSL -> Windows launches now request `--remote-debugging-port=0` and then adopt the real port from the managed profile via `discoverWindowsChromeDevToolsPort(...)` instead of pre-picking a Linux-local free port. Verified live with `/tmp/auracall-launch-ab-product-auto.mts`: product launch on the scratch Windows-managed profile `ab-product-auto/grok` adopted `windows-loopback:53868` and succeeded on the first try.
- Issues: Existing already-open Windows Chrome roots that were launched earlier with dead fixed ports can still have no CDP to recover, because there is no live endpoint to discover. The new auto-port flow fixes fresh launches and relaunches; it does not magically resurrect a browser root that never exposed CDP.
- Next: Re-test the real `windows-chrome-test` managed profile via the product launcher/relauncher path now that fresh Windows launches use auto-assigned DevTools ports.

- Date: 2026-03-26
- Focus: Reopen the real `windows-chrome-test` profile and confirm persistence under the new auto-port path.
- Progress: Killed the stale fixed-port Windows root for `windows-chrome-test/grok` (PID `228740`, `--remote-debugging-port=45894`), then relaunched the exact managed profile through the browser-service launcher. The clean relaunch adopted `windows-loopback:49926` from `DevToolsActivePort` and left a live managed Chrome root at PID `239008` with `--remote-debugging-port=0`. The stored profile still reports `Eric Cochran <ecochran76@gmail.com>` as the signed-in Chrome account. Also fixed `packages/browser-service/src/processCheck.ts` so Windows-managed profile liveness treats a responsive Windows-local DevTools endpoint as authoritative even if the root PID path is unreliable; `auracall doctor --profile windows-chrome-test --target grok --local-only --json` now reports the registry entry as `alive: true`.
- Verification:
  - `pnpm tsx /tmp/auracall-reopen-windows-chrome-test.mts`
  - `pnpm tsx /tmp/auracall-check-49926.mts`
  - `pnpm vitest run tests/browser-service/processCheck.test.ts tests/browser-service/windowsChromeDiscovery.test.ts tests/browser-service/chromeLifecycle.test.ts`
  - `pnpm tsx bin/auracall.ts --profile windows-chrome-test doctor --target grok --local-only --json`
- Next: Refactor the browser-service DevTools-port contract so Windows launches stop pretending there is a meaningful requested fixed port. The right shape is “requested strategy/host” plus “actual discovered endpoint,” not a single authoritative `debugPort`.

- Date: 2026-03-26
- Focus: Harmonize the Windows DevTools-port contract across runtime, config, and docs.
- Progress: Added `debugPortStrategy` (`fixed` | `auto`) to the browser-service/browser/session config surface, threaded it through login/manual-login/runtime resolution, and made the Windows discovery loop prefer the current `DevToolsActivePort` over stale advertised command-line ports. Focused validation passed (`tests/browser/config.test.ts`, `tests/cli/browserConfig.test.ts`, `tests/schema/resolver.test.ts`, `tests/browser-service/chromeLifecycle.test.ts`, `tests/browser-service/processCheck.test.ts`, `tests/browser-service/windowsChromeDiscovery.test.ts`, `tests/browser/browserLoginCore.test.ts`) plus `pnpm run check`.
- Progress: Rewrote the user-facing docs so the Windows happy path is now described consistently as managed profile + `--remote-debugging-port=0` + `DevToolsActivePort` discovery + `windows-loopback` relay. Fixed-port/firewall guidance is now explicitly demoted to advanced manual direct-CDP debugging instead of the normal setup story.
- Issues: The code now supports config/env-level `debugPortStrategy`, but there is not yet a first-class CLI flag for it. That is acceptable for now because the intended user path is automatic; explicit fixed-port pinning still exists through `--browser-port`.
- Next: Consume the same “actual discovered endpoint is authoritative” model in any remaining browser-service/reporting surfaces that still describe `debugPort` as if it were always the live endpoint.

- Date: 2026-03-26
- Focus: Add a real first-run onboarding wizard instead of making users hand-assemble profile-scoped browser config.
- Progress: Added `auracall wizard` in `bin/auracall.ts` as the interactive happy path for browser onboarding. The wizard detects candidate local/WSL/Windows Chromium profiles via `src/cli/browserWizard.ts`, asks the user which service/browser/runtime/profile name to use, writes or updates the corresponding `profiles.<name>` entry in `~/.auracall/config.json`, and then reuses the existing `auracall setup` flow so login, managed-profile bootstrap, doctor output, and live verification stay in one code path. The helper module now covers choice discovery, profile-name suggestion/validation, and config patch/merge behavior.
- Verification:
  - `pnpm vitest run tests/cli/browserWizard.test.ts tests/cli/browserSetup.test.ts`
  - `pnpm tsx bin/auracall.ts wizard --help`
  - `pnpm run check`
- Next: Use the wizard during the live Windows/WSL onboarding passes and tighten any rough edges in the question flow once we see real user behavior.

- Date: 2026-03-26
- Focus: Make the live wizard prefer the freshest Chrome source and report the profile it actually opened.
- Progress: Tightened `src/cli/browserWizard.ts` so the default browser-source choice now prefers the most recently updated Chrome profile between Windows Chrome and WSL Chrome, instead of blindly following older config preference. A live probe on this machine now ranks Windows Chrome Default ahead of WSL Chrome Default because the Windows cookie DB is newer. The first interactive run also exposed two real bugs: the Inquirer browser-source prompt crashed when its choice value was a number, and post-run `doctor` output could still inspect `default/grok` if a stale top-level `browser.manualLoginProfileDir` leaked in from another profile. Fixed the prompt by switching to label-backed choice values, then fixed the resolver path bleed in `src/browser/profileStore.ts` / `src/browser/profileDoctor.ts` so stale inherited managed-profile dirs under the same managed root are ignored when they do not match the selected Aura-Call profile name + target.
- Verification:
  - `pnpm vitest run --maxWorkers 1 tests/browser/profileStore.test.ts tests/browser/profileDoctor.test.ts tests/cli/browserWizard.test.ts tests/cli/browserSetup.test.ts`
  - `pnpm run check`
  - `pnpm tsx -e "import { discoverBrowserWizardChoices, pickPreferredBrowserWizardChoiceIndex } from './src/cli/browserWizard.ts'; ..."`
  - live wizard run: `pnpm tsx bin/auracall.ts wizard --grok --profile-name wizard-grok-test`
  - post-run probe: `pnpm tsx bin/auracall.ts --profile wizard-grok-test doctor --target grok --local-only --json`
- Outcome: the wizard created `wizard-grok-test`, selected Windows Chrome by freshness, opened a managed Windows Grok browser on `windows-loopback:52729`, and `doctor --profile wizard-grok-test` now correctly reports `/mnt/c/Users/ecoch/AppData/Local/AuraCall/browser-profiles/wizard-grok-test/grok` as the active managed profile.

- Date: 2026-03-26
- Focus: Check whether Windows managed profiles are being flagged as bots because of a custom user-agent.
- Progress: Probed the live `windows-chrome-test/grok` page via `scripts/browser-tools.ts eval --port 62265 --url-contains grok.com`. The browser reports a normal stock Windows Chrome UA (`Mozilla/5.0 ... Chrome/146.0.0.0 Safari/537.36`) and `platform: Win32`; there is no Aura-Call user-agent override in the launch path. The stronger signal is `navigator.webdriver === true` on the live page. Current Windows manual-login launches use the minimal flag set plus `--remote-debugging-port=0`, `--remote-allow-origins=*`, and the managed profile dir. So the likely bot trigger is the WebDriver signal from the debug launch, not an odd UA string.
- Next: decide whether onboarding and/or steady-state Windows automation should avoid the current `webdriver=true` path, likely by separating plain human login launches from debug-attached launches or by re-evaluating fixed nonzero ports now that the endpoint-discovery path is better understood.

- Date: 2026-03-26
- Focus: Verify browser-service is emitting the same quoted Windows `--user-data-dir` token that worked in manual PowerShell launches.
- Progress: Confirmed the previous WSL -> Windows launcher was building `--user-data-dir=C:\...` instead of the manually proven `--user-data-dir="C:\..."` form. Patched `packages/browser-service/src/chromeLifecycle.ts` so `resolveUserDataDirFlag(...)` now wraps Windows `user-data-dir` values in inner double quotes before the PowerShell literal quoting layer. Added a focused regression in `tests/browser-service/chromeLifecycle.test.ts` and re-ran that plus `tests/browser-service/windowsChromeDiscovery.test.ts` successfully.
- Next: use the fixed launcher form in the next live WSL -> Windows Chrome debug reopen and compare behavior against the previous unquoted-token launches.

- Date: 2026-03-27
- Focus: Move the product default back to the known-good WSL Chrome path.
- Progress: Changed `src/cli/browserWizard.ts` so the wizard now prefers WSL Chrome over Windows Chrome on WSL unless the user explicitly chooses Windows via config/path preference. Updated the local `~/.auracall/config.json` so `wsl-chrome` is pinned back to `/home/ecochran76/.auracall/browser-profiles/default/grok`, which is the old managed WSL profile that the user successfully used for ChatGPT/Grok login. Updated `README.md`, `docs/browser-mode.md`, and `docs/testing.md` so the documented first-choice path on WSL is now WSL Chrome first, Windows Chrome second.
- Verification:
  - `pnpm vitest run tests/cli/browserWizard.test.ts --maxWorkers 1`
  - explicit WSL reopen still works: `pnpm tsx bin/auracall.ts login --target grok --browser-wsl-chrome wsl --browser-chrome-path '/usr/bin/google-chrome' --browser-manual-login-profile-dir '/home/ecochran76/.auracall/browser-profiles/default/grok'`
- Issues: there is still a resolver/local-doctor mismatch for the named `wsl-chrome` profile. `doctor --profile wsl-chrome` still reconstructs `/home/ecochran76/.auracall/browser-profiles/wsl-chrome/grok` even though the live, working managed profile is `/home/ecochran76/.auracall/browser-profiles/default/grok`. That needs a deeper resolver follow-up; for now the stable path is to pin the old WSL profile dir explicitly.

- Date: 2026-03-27
- Focus: Start real Grok project CRUD against the live authenticated WSL Chrome profile.
- Progress: Reproduced the first live failure on `projects create` (`Main sidebar did not open`) and traced it to Aura-Call attaching to a hidden background Grok tab. Added `ensureGrokTabVisible(...)` in `src/browser/providers/grokAdapter.ts` and used it before main-sidebar/project-sidebar/project-page interactions so Grok CRUD operates on a visible tab instead of a hidden one.
- Progress: While continuing the live pass, found several current Grok UI drifts and patched them in the same adapter:
  - create-project now prefers the visible `New Project` row instead of assuming a hidden action on the `Projects` row
  - upload completion no longer treats `50 B` as `0 B`
  - project instructions open from the visible `Instructions` card when the older `Edit instructions` button is absent
  - project sidebar open detection now keys off the real `Collapse side panel` / `Expand side panel` buttons
  - project remove no longer tries to reopen the main chat sidebar before using the project-header menu
  - project header menu open now first tries the direct visible `button[aria-label="Open menu"]`
- Progress: Added/expanded focused unit coverage in `tests/browser/grokAdapter.test.ts` for the new visible-tab helper and concrete project-URL parsing.
- Progress: Added the default Grok cache identity to the local WSL Aura-Call profile config so project cache-backed CLI flows like `projects clone` stop failing on `Cache identity for grok is required` while the browser is already signed in.
- Verification:
  - `pnpm vitest run tests/browser/grokAdapter.test.ts --maxWorkers 1`
  - `pnpm run check`
  - live WSL Grok project CRUD on disposable project `979cff9d-4440-4cb9-a183-9e54eaaf36c7`:
    - clone existing disposable project
    - rename
    - instructions get/set/get
    - files list/add/list/remove/list
    - remove
- Issues:
  - `projects create` is improved enough to get through the current modal flow, but it is still not fully proven end-to-end by list/read surfaces; the live pass used a disposable cloned project for the rest of CRUD.
  - `projects list`/project tab selection still show stale-name behavior when Grok leaves multiple tabs open for the same project id; the live rename succeeded on the project page, but the sidebar/list scrape could still show the older title from another matching tab.

- Date: 2026-03-27
- Focus: Finish Grok `projects create` on the authenticated WSL Chrome profile.
- Progress:
  - Tightened Grok tab reuse for create flows so `openCreateProjectModal`, the create-step helpers, and `createProject(...)` all target the `/project` index instead of a random existing `grok.com` tab.
  - Added a stricter CLI contract in `bin/auracall.ts`: when the provider-backed `createProject(...)` path cannot prove a new `/project/<id>` URL, Aura-Call now exits with an error instead of printing a false `Created project ...` success line.
  - Live repro showed the remaining failure was not navigation drift anymore. Grok was sending a real `POST https://grok.com/rest/workspaces`, but the backend rejected timestamp-style disposable names like `AuraCall Create Probe 20260327-1033` with `name: Value contains phone number. [WKE=form-invalid:contains-phone-number:name]`.
  - Added backend error surfacing in `src/browser/providers/grokAdapter.ts` by watching `/rest/workspaces` responses during project creation and parsing the response body when Grok returns a non-2xx validation failure.
- Verification:
  - `pnpm vitest run tests/browser/grokAdapter.test.ts tests/browser/browserService.test.ts --maxWorkers 1`
  - `pnpm run check`
  - Negative live case: `DISPLAY=:0.0 pnpm tsx bin/auracall.ts projects create 'AuraCall Create Probe 20260327-1033' --target grok`
    - now fails honestly with `Create project failed: name: Value contains phone number. [WKE=form-invalid:contains-phone-number:name]`
  - Positive live case: `DISPLAY=:0.0 pnpm tsx bin/auracall.ts projects create 'AuraCall Cedar Atlas' --target grok`
    - created project `a3418590-843c-4edb-8976-e67f91667f9b`
    - `DISPLAY=:0.0 pnpm tsx bin/auracall.ts projects --target grok` listed the new project
    - `DISPLAY=:0.0 pnpm tsx bin/auracall.ts projects remove a3418590-843c-4edb-8976-e67f91667f9b --target grok` removed it cleanly and refreshed the cache
- Issues:
  - Grok project names that look like phone numbers are rejected server-side, so timestamp-heavy disposable names are a bad live smoke naming pattern for `projects create`.
  - `projects list`/project tab selection can still show stale names when Grok leaves many tabs open for the same project id; create itself is now working again, but list/title deduping still needs a follow-up.

- Date: 2026-03-27
- Focus: Re-check the old Grok stale-name/list follow-up after the exact `/project` targeting changes.
- Progress:
  - Reproduced the old risky shape with a disposable clone/rename/remove cycle on the live authenticated WSL Chrome profile:
    - cloned `0f0d2dda-cbe1-4f4f-89eb-d4948d4c8545` to `AuraCall Juniper Atlas`
    - listed projects
    - renamed the clone to `AuraCall Juniper Harbor`
    - listed projects again
    - removed the clone and refreshed the cache
  - Even though Grok still keeps extra project tabs around, the list surface stayed correct through the whole flow. The renamed clone showed up with the new name immediately, and the removed clone disappeared after `projects remove` refreshed the cache.
  - Current read: the earlier stale-name symptom was most likely a downstream effect of broad Grok tab selection. After forcing create/list flows through the `/project` index and scoring exact Grok project-index matches in `BrowserService`, I could not reproduce the stale-name bug.
- Verification:
  - `DISPLAY=:0.0 pnpm tsx bin/auracall.ts projects clone 0f0d2dda-cbe1-4f4f-89eb-d4948d4c8545 'AuraCall Juniper Atlas' --target grok`
  - `DISPLAY=:0.0 pnpm tsx bin/auracall.ts projects --target grok`
  - `DISPLAY=:0.0 pnpm tsx bin/auracall.ts projects rename c9500fed-c316-4b9d-9769-819c6d94546b 'AuraCall Juniper Harbor' --target grok`
  - `DISPLAY=:0.0 pnpm tsx bin/auracall.ts projects --target grok`
  - `DISPLAY=:0.0 pnpm tsx bin/auracall.ts projects remove c9500fed-c316-4b9d-9769-819c6d94546b --target grok`
- Issues:
  - Grok still leaves duplicate tabs around, but that is no longer causing a visible list-name regression in the current WSL flow.
  - The next Grok CRUD area worth testing is conversation CRUD, not another round of project list deduping.

- Date: 2026-03-27
- Focus: Centralize tab/window reuse so Aura-Call stops stockpiling service tabs during repeated login, remote attach, and Grok project flows.
- Progress:
  - Added a shared browser-service primitive in `packages/browser-service/src/chromeLifecycle.ts`: `openOrReuseChromeTarget(...)`.
  - The new default tab policy is explicit and ordered:
    1. reuse the most recent exact URL match
    2. reuse an existing blank/new-tab page
    3. reuse an existing same-origin service tab by navigating it
    4. reuse an explicitly compatible host-family tab (currently ChatGPT `chatgpt.com` <-> `chat.openai.com`)
    5. only then create a fresh tab
  - Wired `packages/browser-service/src/manualLogin.ts` through that helper so repeated `auracall login --target ...` runs now reuse same-service tabs instead of steadily adding more login pages.
  - Wired `connectToRemoteChrome(...)` through the same helper so remote attach paths stop opening a dedicated fresh tab on every run when an existing reusable page is already present.
  - Replaced the Grok adapter’s last-resort `CDP.New(...)` calls with the shared helper, so project/home attach falls back to reusing an existing Grok page before creating yet another tab.
  - Extended the shared helper with `compatibleHosts` so the opener can treat host-migrated services as one family when the caller knows they are interchangeable. Wired that through the login and remote ChatGPT paths so `chatgpt.com` and `chat.openai.com` now reuse each other instead of creating sibling tabs.
  - Added conservative stockpile cleanup inside the same helper: after selecting a tab, Aura-Call now trims matching-family tabs down to 3 total and trims blank/new-tab pages down to 1 spare page, always preserving the selected tab.
  - Extended the same cleanup pass with window awareness via `Browser.getWindowForTarget`. Cleanup remains profile-scoped and conservative: Aura-Call now collapses extra windows only when every tab in that extra window is disposable for the current service family (matching-family tabs and/or blank tabs). Windows with any unrelated tab are left alone.
- Verification:
  - `pnpm vitest run tests/browser-service/chromeTargetReuse.test.ts tests/browser/manualLogin.test.ts tests/browser/browserService.test.ts tests/browser/grokAdapter.test.ts --maxWorkers 1`
  - `pnpm run check`
- Issues:
  - Compatible-host families are still opt-in at the call site. ChatGPT is wired; if Gemini or other browser targets ever grow multiple interchangeable hosts, they will need the same explicit host-family mapping.
  - Window cleanup is intentionally one-way and conservative. We are not trying to merge windows or move tabs; we only collapse obviously disposable extra windows for the same profile.

- Date: 2026-03-27
- Focus: Make the new tab/window cleanup policy configurable per Aura-Call profile instead of hardcoded inside browser-service.
- Progress:
  - Added three profile-scoped browser config fields and threaded them through the full runtime path:
    - `browser.serviceTabLimit`
    - `browser.blankTabLimit`
    - `browser.collapseDisposableWindows`
  - Extended the shared browser-service config/types layer, Aura-Call schema layer, and `resolveBrowserConfig(...)` defaults/validation so these values now survive config parsing and profile selection instead of being discarded.
  - Wired the knobs through all of the actual tab-opening paths that mattered:
    - `connectToRemoteChrome(...)`
    - manual login/session launch
    - Grok provider fallback `openOrReuseChromeTarget(...)` calls
  - Kept the old behavior as the default (`3` matching-family tabs, `1` blank tab, collapse disposable extra windows), so existing profiles do not change behavior unless they opt in.
- Verification:
  - focused config/resolver/reuse tests plus `pnpm run check` (see current command list in the turn)
- Issues:
  - These are config-file/profile knobs only for now. I did not add new CLI flags because the intended use is durable per-profile policy, not one-off command-line tweaking.

- Date: 2026-03-27
- Focus: Continue live Grok conversation CRUD on the authenticated WSL Chrome profile and tighten the failure modes around rename/list/context.
- Progress:
  - Fixed nested provider-cache writes in `src/browser/providers/cache.ts` by creating the parent directory for the concrete cache file instead of only the provider root. Live `conversations context get` now works for Grok again and returned the expected prompt/response pair for conversation `e21addd2-1413-408a-b700-b78e2dbadaf8`.
  - Added Grok conversation-title quality/merge helpers in `src/browser/providers/grokAdapter.ts` so project conversation lists stop letting generic placeholders like `Chat` or `New conversation` permanently override a better title from another source.
  - Simplified conversation rename toward the shared root/sidebar flow and added positive post-submit verification in `renameConversationInHistoryDialog(...)` so a rename only counts as successful if the expected title appears back in the UI.
  - Live Grok result after the merge fix: project conversation list for project `593cf86c-4147-4885-9520-eda29e5e6cf4` now resolves `e21addd2-1413-408a-b700-b78e2dbadaf8` as `AuraCall Maple Ledger` instead of the stale generic `Chat`.
  - DOM discovery on the live root/project pages showed why rename/delete remain unstable:
    - the project-page `History` control is just an expanded header (`role="button"`, `aria-expanded="true"`), not a dialog launcher
    - the old history-dialog path is therefore no longer the reliable action surface
    - the real root sidebar row for the conversation now contains a hidden `Options` button and the correct renamed title, so the next repair should target that sidebar-row action menu directly
- Verification:
  - `pnpm vitest run tests/browser/grokAdapter.test.ts tests/browser/providerCache.test.ts --maxWorkers 1`
  - `pnpm vitest run tests/browser/browserService.test.ts tests/browser/manualLogin.test.ts --maxWorkers 1`
  - live: `DISPLAY=:0.0 pnpm tsx bin/auracall.ts conversations context get e21addd2-1413-408a-b700-b78e2dbadaf8 --target grok --project-id 593cf86c-4147-4885-9520-eda29e5e6cf4`
  - live: `DISPLAY=:0.0 pnpm tsx bin/auracall.ts conversations --target grok --project-id 593cf86c-4147-4885-9520-eda29e5e6cf4 --refresh --include-history`
- Issues:
  - `rename` and `delete` still exit through the stale history-dialog workflow. Rename appears to have taken effect in the live root sidebar/list state, but the command still reports `History dialog did not open`, so the action surface and status reporting are still out of sync.
  - The next concrete fix is to drive conversation rename/delete from the root sidebar row `Options` button instead of trying to open the old history dialog.

- Date: 2026-03-27
- Focus: Finish the Grok conversation CRUD repair by moving rename/delete off the stale history dialog and onto the live root-sidebar row menu.
- Progress:
  - Added a root-sidebar row path in `src/browser/providers/grokAdapter.ts`:
    - tag the target conversation row and hidden `Options` button
    - hover the row to reveal the button
    - open the Radix menu with a full pointer sequence
    - drive `Rename` / `Delete` from that menu first, with the old history-dialog code retained only as fallback
  - Added sidebar-specific waits so Grok rename/delete now verify the row title change or row disappearance directly in the root sidebar instead of assuming the old dialog remains authoritative.
  - Live result: the disposable conversation `e21addd2-1413-408a-b700-b78e2dbadaf8` was renamed from `AuraCall Maple Ledger` to `AuraCall Maple Harbor`, then deleted successfully from project `593cf86c-4147-4885-9520-eda29e5e6cf4`.
- Verification:
  - live: `DISPLAY=:0.0 pnpm tsx bin/auracall.ts rename e21addd2-1413-408a-b700-b78e2dbadaf8 'AuraCall Maple Harbor' --target grok --project-id 593cf86c-4147-4885-9520-eda29e5e6cf4`
  - live: `DISPLAY=:0.0 pnpm tsx bin/auracall.ts delete e21addd2-1413-408a-b700-b78e2dbadaf8 --target grok --project-id 593cf86c-4147-4885-9520-eda29e5e6cf4 --yes`
  - live: `DISPLAY=:0.0 pnpm tsx bin/auracall.ts conversations --target grok --project-id 593cf86c-4147-4885-9520-eda29e5e6cf4 --refresh --include-history`
- Issues:
  - The old history-dialog helpers still exist as fallback because Grok may surface that dialog in other layouts, but the primary supported path is now the root-sidebar row `Options` menu.

- Date: 2026-03-27
- Focus: Turn the current live Grok work into an explicit acceptance plan/runbook instead of continuing ad hoc CRUD passes.
- Progress:
  - Added a new `Grok Acceptance (WSL Chrome Primary)` section to `docs/dev/smoke-tests.md`.
  - The checklist now defines the concrete WSL done bar for Grok browser support:
    - project create/list/rename/clone
    - project instructions get/set
    - project files add/list/remove
    - conversation create/list/context/rename/delete
    - markdown-preserving prompt capture
    - cache freshness plus cleanup of disposable projects
  - Recorded the naming constraint learned from the live `projects create` work: timestamp-like names are a bad smoke pattern because Grok can reject them as `contains-phone-number`.
  - Wired the same checklist into `docs/manual-tests.md` and `docs/testing.md` so the manual runbook points to one canonical Grok acceptance path instead of a vague smoke reference.
  - Updated `docs/dev/llmservice-phase-7.md` so the Phase 7 test/smoke section now points at the same WSL-primary acceptance bar and treats Windows Chrome as secondary/manual-debug coverage.
- Verification:
  - doc-only change; no code/runtime verification required
- Issues:
  - The checklist currently assumes the WSL Chrome `default` managed profile remains the primary supported Grok path. If Windows Chrome later becomes equally robust, the runbook should explicitly add a second Windows acceptance variant instead of overloading the current WSL one.

- Date: 2026-03-27
- Focus: Continue the WSL Grok acceptance pass on the project-files surface, especially multi-file upload/list/remove and unsupported-file behavior.
- Progress:
  - Reproduced a live first-open flake in `projects files list`: the first attempt failed with `Personal files modal not found`, while the immediate retry succeeded and listed the saved files. I hardened `ensurePersonalFilesModalOpen(...)` in `src/browser/providers/grokAdapter.ts` with a retry loop plus a broader wait condition that accepts the current delayed `Personal files` dialog surface instead of only the old immediate search-input appearance.
  - Added `parseGrokPersonalFilesRowTexts(...)` and `readVisiblePersonalFilesWithClient(...)` so Grok project-file extraction now runs through one parser instead of duplicating row-text parsing logic inline in the list path.
  - Reproduced a more important live bug: uploading `/tmp/auracall-grok-stress/medium.jsonl` returned `Uploaded 1 file(s)...`, but a fresh `projects files list` never showed `medium.jsonl`. The file was being accepted transiently in the modal but silently dropped by Grok after `Save`.
  - Fixed that false-success path by adding `waitForProjectFilesPersisted(...)` after `clickPersonalFilesSaveWithClient(...)`. Aura-Call now reopens the project file surface after Save and verifies that the requested file names actually persisted before it reports success.
  - Live result after the fix: the same `medium.jsonl` upload now fails honestly with `Uploaded file(s) did not persist after save: medium.jsonl` instead of printing a false success.
  - Finished a real disposable file CRUD pass on project `e130b1b0-10b9-410b-97cd-e4f62c8a349e`:
    - created project `AuraCall Cedar Harbor`
    - uploaded and listed `notes.txt`, `spec.md`, and later `dup.txt`
    - removed unique files successfully
    - emptied the file list
    - deleted the disposable project cleanly
  - Updated `docs/dev/smoke-tests.md` so the acceptance runbook now includes a file-stress extension and explicitly treats same-name duplicate uploads as exploratory rather than the primary correctness bar.
- Verification:
  - `pnpm vitest run tests/browser/grokAdapter.test.ts tests/browser/grokActions.test.ts --maxWorkers 1`
  - live: `DISPLAY=:0.0 pnpm tsx bin/auracall.ts projects create 'AuraCall Cedar Harbor' --target grok`
  - live: `DISPLAY=:0.0 pnpm tsx bin/auracall.ts projects files add e130b1b0-10b9-410b-97cd-e4f62c8a349e --target grok -f /tmp/auracall-grok-stress/notes.txt /tmp/auracall-grok-stress/spec.md /tmp/auracall-grok-stress/medium.jsonl`
  - live: `DISPLAY=:0.0 pnpm tsx bin/auracall.ts projects files list e130b1b0-10b9-410b-97cd-e4f62c8a349e --target grok`
  - live: `DISPLAY=:0.0 pnpm tsx bin/auracall.ts projects files add e130b1b0-10b9-410b-97cd-e4f62c8a349e --target grok -f /tmp/auracall-grok-stress/medium.jsonl`
  - live: `DISPLAY=:0.0 pnpm tsx bin/auracall.ts projects files remove e130b1b0-10b9-410b-97cd-e4f62c8a349e notes.txt --target grok`
  - live: `DISPLAY=:0.0 pnpm tsx bin/auracall.ts projects files remove e130b1b0-10b9-410b-97cd-e4f62c8a349e spec.md --target grok`
  - live: `DISPLAY=:0.0 pnpm tsx bin/auracall.ts projects files remove e130b1b0-10b9-410b-97cd-e4f62c8a349e dup.txt --target grok`
  - live: `DISPLAY=:0.0 pnpm tsx bin/auracall.ts projects remove e130b1b0-10b9-410b-97cd-e4f62c8a349e --target grok`
- Issues:
  - Same-name duplicate uploads are still ambiguous as a product surface. Grok appears willing to accept a second `dup.txt`, but the list/remove paths are name-based, so that duplicate-name case is not yet a clean correctness guarantee. The acceptance runbook now treats unique filenames as the primary bar and duplicate-name handling as follow-up stress only.

- Date: 2026-03-27
- Focus: Run the full WSL Grok acceptance checklist end-to-end and see what still blocks calling the path "fully functional."
- Progress:
  - The disposable WSL acceptance run got through the first four sections cleanly on a new project pair:
    - created `AuraCall Granite nzlqec`
    - renamed it to `AuraCall Harbor nzlqec` (`628cae8a-8918-4567-912f-e44fde3ee3e0`)
    - cloned it to `AuraCall Orbit nzlqec` (`17e57d61-ce6c-4e41-b13c-3f64582daaa2`)
    - `projects instructions set/get` passed
    - project files add/list/remove passed for unique files
    - the medium-file guard behaved correctly and failed with `Uploaded file(s) did not persist after save: grok-medium.jsonl`
    - the project-scoped browser prompt itself succeeded and produced a real Grok session meta record with:
      - project id `628cae8a-8918-4567-912f-e44fde3ee3e0`
      - tab URL `https://grok.com/project/628cae8a-8918-4567-912f-e44fde3ee3e0?chat=f3241435-0667-437d-b6ae-246f7815b1ec&rid=...`
      - conversation id `f3241435-0667-437d-b6ae-246f7815b1ec`
  - The acceptance run then exposed the remaining blocker: `conversations --target grok --project-id 628cae8a-8918-4567-912f-e44fde3ee3e0 --refresh --include-history` did not return the newly created project conversation in a usable way.
  - I tightened `src/browser/providers/grokAdapter.ts` so project-scoped conversation refresh no longer blindly merges global root-history/open-tab results into the project scope:
    - project-scoped raw scraping now ignores nodes inside the main sidebar wrapper
    - project-scoped history stays on the current project tab instead of forcibly switching to root `https://grok.com/`
    - open-tab fallback now only keeps Grok tabs whose URL actually belongs to the requested `/project/<id>`
  - Even after those corrections, the current project-scoped conversation list still comes back empty for `628cae8a-8918-4567-912f-e44fde3ee3e0`, despite the browser session metadata proving the conversation exists.
  - A related cleanup regression surfaced in the same state: `projects remove` for the disposable ids can land on a menu whose visible items are just `Conversations`, not the project action menu, so the acceptance cleanup did not fully complete.
- Verification:
  - `pnpm vitest run tests/browser/grokAdapter.test.ts --maxWorkers 1`
  - `pnpm run check`
  - live acceptance partial:
    - project create/rename/clone
    - project instructions set/get
    - project files add/list/remove
    - medium-file rejection
    - browser prompt run inside project
  - live blocker repro:
    - `DISPLAY=:0.0 timeout 45s pnpm tsx bin/auracall.ts conversations --target grok --project-id 628cae8a-8918-4567-912f-e44fde3ee3e0 --refresh --include-history`
    - result: `[]`
- Issues:
  - WSL Grok is still not ready to call "fully functional." The blocking issue is project-scoped conversation enumeration after a real project-scoped prompt run.
  - Two disposable acceptance projects remain because cleanup drifted into the wrong menu surface:
    - `628cae8a-8918-4567-912f-e44fde3ee3e0` / `AuraCall Harbor nzlqec`
    - `17e57d61-ce6c-4e41-b13c-3f64582daaa2` / `AuraCall Orbit nzlqec`

- Date: 2026-03-27
- Focus: Clear the remaining WSL Grok acceptance blocker around project-scoped conversation refresh and finish cleanup of the disposable acceptance projects.
- Progress:
  - Confirmed the live project page itself already had the right data: on `https://grok.com/project/628cae8a-8918-4567-912f-e44fde3ee3e0?tab=conversations`, `main` exposed the current project conversation row and the correct chat id `f3241435-0667-437d-b6ae-246f7815b1ec` for `AuraCall Maple Ledger`.
  - Reworked `src/browser/providers/grokAdapter.ts` so project-scoped `listConversations(...)` now reads the project conversations tab directly instead of trying to reuse the broader mixed conversation scrape. The project path now:
    - waits for the project conversations tab to become ready,
    - reads rows only from the current project tabpanel/main surface,
    - falls back to project history only if that focused surface is empty,
    - still merges matching live open tabs for the same `/project/<id>` scope.
  - Added project-aware conversation cache scoping:
    - `BrowserProviderListOptions` now carries `projectId`
    - project-scoped conversation lists now write to `project-conversations/<projectId>.json` instead of overwriting the shared global `conversations.json`
    - the dual cache store now uses the same project scope for both JSON and SQLite conversation-list entries
    - the CLI conversation list/delete paths and the LLM service name/selector resolution path now propagate that scope consistently
  - Live verification on the original disposable project now works:
    - `auracall conversations --target grok --project-id 628cae8a-8918-4567-912f-e44fde3ee3e0 --refresh --include-history`
      - returns `f3241435-0667-437d-b6ae-246f7815b1ec` / `AuraCall Maple Ledger`
    - `auracall conversations context get f3241435-0667-437d-b6ae-246f7815b1ec --target grok --project-id 628cae8a-8918-4567-912f-e44fde3ee3e0 --json-only`
      - returns the expected prompt/response pair
    - the project-scoped cache now lands at:
      - `~/.auracall/cache/providers/grok/ez86944@gmail.com/project-conversations/628cae8a-8918-4567-912f-e44fde3ee3e0.json`
  - Also relaxed the tagged project-row menu path in `openProjectMenuButton(...)` so transient sidebar-row lookup failures no longer abort the whole project-menu flow before broader fallback strategies run.
  - Cleanup completed:
    - removed clone `17e57d61-ce6c-4e41-b13c-3f64582daaa2`
    - removed source project `628cae8a-8918-4567-912f-e44fde3ee3e0`
    - fresh `projects --target grok --refresh` no longer lists either disposable acceptance project
- Verification:
  - `pnpm vitest run tests/browser/grokAdapter.test.ts tests/browser/providerCache.test.ts --maxWorkers 1`
  - `pnpm run check`
  - live: `DISPLAY=:0.0 timeout 45s pnpm tsx bin/auracall.ts conversations --target grok --project-id 628cae8a-8918-4567-912f-e44fde3ee3e0 --refresh --include-history`
  - live: `DISPLAY=:0.0 timeout 45s pnpm tsx bin/auracall.ts conversations context get f3241435-0667-437d-b6ae-246f7815b1ec --target grok --project-id 628cae8a-8918-4567-912f-e44fde3ee3e0 --json-only`
  - live: `DISPLAY=:0.0 timeout 45s pnpm tsx bin/auracall.ts projects remove 17e57d61-ce6c-4e41-b13c-3f64582daaa2 --target grok`
  - live: `DISPLAY=:0.0 timeout 45s pnpm tsx bin/auracall.ts projects remove 628cae8a-8918-4567-912f-e44fde3ee3e0 --target grok`
  - live: `DISPLAY=:0.0 timeout 45s pnpm tsx bin/auracall.ts projects --target grok --refresh`
- Issues:
  - The project-scoped path is now correct. The next remaining Grok polish item is title quality more generally, not the specific project-scoped blocker we were chasing.

- Date: 2026-03-27
- Focus: Finish the Grok metadata-quality follow-up so the global non-project conversation list reuses the stronger project-scoped title instead of regressing to generic `Chat`.
- Progress:
  - Added a read-time conversation metadata overlay in `src/browser/llmService/cache/store.ts`:
    - global conversation reads now merge the global list with any project-scoped conversation caches for the same identity
    - Grok entries reuse the existing `choosePreferredGrokConversation(...)` quality rules so specific project titles beat generic placeholders like `Chat`
    - the merged result preserves stronger metadata such as `projectId`, `url`, and `updatedAt`
  - Extended that same behavior to both cache backends:
    - JSON cache store reads now scan `project-conversations/*.json` when reading the global conversation list
    - SQLite cache store reads now merge all `conversations` datasets (global + project-scoped entity ids) when reading the global conversation list
  - Wired the user-facing CLI path through the same reconciliation:
    - `bin/auracall.ts conversations ...` now uses `llmService.listConversations(...)` instead of calling the provider directly
    - `GrokService.listConversations(...)` now overlays the live global list through the cache reconciliation path before returning it
  - Live result:
    - the global WSL Grok list now shows `AuraCall Maple Ledger` for `f3241435-0667-437d-b6ae-246f7815b1ec` instead of generic `Chat`
    - the persisted global cache entry in `~/.auracall/cache/providers/grok/ez86944@gmail.com/conversations.json` now also carries the stronger title for that id
- Verification:
  - `pnpm vitest run tests/browser/providerCache.test.ts tests/browser/grokAdapter.test.ts --maxWorkers 1`
  - `pnpm run check`
  - live: `DISPLAY=:0.0 timeout 45s pnpm tsx bin/auracall.ts conversations --target grok --refresh --include-history`
  - verified persisted cache entry for `f3241435-0667-437d-b6ae-246f7815b1ec` in `~/.auracall/cache/providers/grok/ez86944@gmail.com/conversations.json`
- Issues:
  - This fixes the concrete `Chat` vs project-title regression we saw. Future title-quality work should focus on broader ranking/normalization, not on project-scoped cache separation, which is now working.

- Date: 2026-03-27
- Focus: Clear the last WSL Grok acceptance blockers in the disposable-project run: project-conversation empty-state detection, project remove confirmation, project-menu targeting, and clone rename stability.
- Progress:
  - Fixed project-scoped conversation empty-state handling in `src/browser/providers/grokAdapter.ts`:
    - `waitForProjectConversationList(...)` now treats `No conversations yet` as a valid loaded state instead of throwing `Project conversations list did not load` after the last conversation is deleted.
  - Fixed project-scoped conversation delete targeting in `src/browser/providers/grokAdapter.ts`:
    - `deleteConversation(...)` now mirrors `renameConversation(...)` and attaches to the actual project page + project conversation list when `--project-id` is present instead of always starting from the generic projects index.
  - Hardened project-menu selection in `src/browser/providers/grokAdapter.ts`:
    - `openProjectMenuButton(...)` now prefers the page-level `Open menu` button inside `main` before sidebar-row `Options`, which stopped clone/project cleanup from opening a conversation row menu by mistake.
    - `selectRemoveProjectItem(...)` now selects either `Remove` or `Delete` from a single opened project menu instead of reopening the menu with brittle label-specific retries.
  - Hardened project remove confirmation in `src/browser/providers/grokAdapter.ts`:
    - `pushProjectRemoveConfirmation(...)` now first confirms an already-open remove dialog and treats an invalid/deleted project page after confirmation as success instead of retrying into a dead page and throwing.
  - Hardened project rename completion in `src/browser/providers/grokAdapter.ts`:
    - project rename now waits for the new title to actually land, then retries one more submit/blur cycle before failing, which fixed the intermittent `Clone rename failed: Project rename stayed in edit mode` path during `projects clone <id> <new-name>`.
  - Live acceptance state:
    - first, the fixes above cleared the last cleanup blockers in a focused live create/clone/remove/remove repro:
      - created `AuraCall Cedar Atlas qpwlyc`
      - cloned + renamed to `AuraCall Cedar Orbit qpwlyc`
      - removed clone `c0a97011-5a88-4298-a512-5d68927d2d1a`
      - removed source `4188013b-78f2-43b1-9102-0378581ed047`
      - refreshed project list no longer showed either disposable project
    - final state: one full disposable WSL Grok acceptance pass completed cleanly end to end:
      - project `430fd142-382b-4ebc-939d-f40e33b0e31b`
      - clone `2bc78431-0825-4cb9-af6c-1cf3dd59783b`
      - conversation `e7ccc288-7a26-4af1-84ab-8eea308ae806`
      - create / rename / clone all succeeded
      - instructions get/set succeeded
      - unique-file add/list/remove succeeded
      - medium-file guard failed explicitly as intended with `Uploaded file(s) did not persist after save: grok-medium.jsonl`
      - project conversation create / context / rename / delete succeeded
      - markdown-preserving browser prompt capture succeeded
      - clone cleanup + source cleanup both returned success
      - final `projects --target grok --refresh` no longer listed either disposable project
  - Cleanup:
    - removed stale disposable projects left by earlier failing repros:
      - `2d2de3bb-50fc-4f85-afdd-f92becadc6d4`
      - `dbc17846-4d11-4af1-9cbe-a5dbd936c56a`
- Verification:
  - `pnpm vitest run tests/browser/grokAdapter.test.ts tests/browser/grokActions.test.ts tests/browser/providerCache.test.ts --maxWorkers 1`
  - `pnpm run check`
  - live full acceptance repros:
    - disposable WSL run reached green through markdown and isolated the final cleanup blockers
  - live focused repro after the final fixes:
    - `DISPLAY=:0.0 pnpm tsx bin/auracall.ts projects create "AuraCall Cedar Atlas qpwlyc" --target grok`
    - `DISPLAY=:0.0 pnpm tsx bin/auracall.ts projects clone 4188013b-78f2-43b1-9102-0378581ed047 "AuraCall Cedar Orbit qpwlyc" --target grok`
    - `DISPLAY=:0.0 pnpm tsx bin/auracall.ts projects remove c0a97011-5a88-4298-a512-5d68927d2d1a --target grok`
    - `DISPLAY=:0.0 pnpm tsx bin/auracall.ts projects remove 4188013b-78f2-43b1-9102-0378581ed047 --target grok`
    - `DISPLAY=:0.0 pnpm tsx bin/auracall.ts projects --target grok --refresh`
  - live final full-pass repro:
    - disposable full run with suffix `rbqkwi`
    - project `430fd142-382b-4ebc-939d-f40e33b0e31b`
    - clone `2bc78431-0825-4cb9-af6c-1cf3dd59783b`
    - conversation `e7ccc288-7a26-4af1-84ab-8eea308ae806`
    - final result JSON: `ok: true`
- Issues:
  - The strongest remaining Grok risk is no longer CRUD correctness on WSL. The next step should be converting the runbook into a first-class scripted acceptance runner so these regressions are caught without manual shell glue.

- Date: 2026-03-27
- Focus: Normalize project-scoped Grok conversation context so cached/live `conversations context get` results do not prepend the project instructions block into the first assistant message.
- Progress:
  - Added a shared context-normalization helper in `src/browser/llmService/llmService.ts`:
    - `stripProjectInstructionsPrefixFromConversationContext(...)` now removes an exact project-instructions prefix from the first assistant message when the remainder still contains real assistant content
    - the helper only runs for project-scoped context reads, and only after live provider output has been normalized into Aura-Call conversation messages
  - Persisted project instructions into the cache-backed llmService path:
    - `createProject(...)` now writes initial instructions to the cache store when present
    - `updateProjectInstructions(...)` and `getProjectInstructions(...)` now keep the cache store authoritative for the latest project instructions text
  - Applied the normalization during project-scoped context reads:
    - `getConversationContext(...)` now reads cached project instructions for `--project-id ...`
    - when present, it strips the duplicated instructions prefix before writing conversation context back to cache and returning it to the CLI
  - Added focused regression coverage in `tests/browser/llmServiceContext.test.ts`:
    - strips an exact prefixed project-instructions block from the first assistant message
    - does not strip when the instructions text appears later in the assistant message instead of as a true prefix
  - Live probe:
    - created disposable project `f9bd98f3-ffbd-4158-b40c-f95231111216`
    - set multiline instructions:
      - `Context probe instructions`
      - `Line two`
    - created project conversation `6bfb2942-a443-4cf5-8bf4-23a82e3f264d`
    - `conversations context get ... --project-id f9bd98f3-ffbd-4158-b40c-f95231111216 --json-only` returned a clean assistant payload (`Context Probe Inspect`) with no prepended instructions text
    - DOM inspection on the live WSL Grok tab matched the clean payload, so the explicit normalization now acts as a safeguard against the earlier leaked case rather than papering over an active repro
- Verification:
  - `pnpm vitest run tests/browser/llmServiceContext.test.ts tests/browser/providerCache.test.ts tests/browser/grokActions.test.ts --maxWorkers 1`
  - `pnpm run check`
  - live:
    - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts conversations context get 6bfb2942-a443-4cf5-8bf4-23a82e3f264d --target grok --project-id f9bd98f3-ffbd-4158-b40c-f95231111216 --json-only`
- Issues:
  - The old leaked project-instructions prefix did not reproduce on the fresh probe conversation after the recent Grok fixes, so this change should be treated as a defensive normalization layer that protects cache/export consumers from stale duplicated-instructions payloads if Grok regresses again.

- Date: 2026-03-27
- Focus: Make Grok file CRUD a real cache-backed resource by writing project file list/add/remove through to the `project-knowledge` dataset and proving it in the live WSL acceptance run.
- Progress:
  - Wired project file CRUD through the llmService cache path in `src/browser/llmService/llmService.ts`:
    - `listProjectFiles(...)` now writes the live file list into `cacheStore.writeProjectKnowledge(...)`
    - `uploadProjectFiles(...)` now refreshes the live project file list after upload and writes the persisted result into `project-knowledge`
    - `deleteProjectFile(...)` now refreshes the live project file list after removal and writes the post-delete state into `project-knowledge`
    - `createProject(...)` now also refreshes/writes project knowledge when the project was created with initial files attached
  - Added focused regression coverage in `tests/browser/llmServiceFiles.test.ts`:
    - list writes project files into `project-knowledge`
    - upload refreshes/writes the live persisted file list
    - delete refreshes/writes the post-remove file list
  - Extended the scripted WSL Grok acceptance runner in `scripts/grok-acceptance.ts`:
    - after single-file upload, assert `cache files list --provider grok --project-id <id> --dataset project-knowledge` contains `grok-file.txt`
    - after single-file removal, assert the same cache view no longer contains `grok-file.txt`
    - after multi-file upload, assert the cache view contains both `grok-file-a.txt` and `grok-file-b.md`
  - Updated the runbook in `docs/dev/smoke-tests.md` and `docs/testing.md` so the Grok acceptance bar now explicitly includes project-knowledge cache freshness for file CRUD, not just the visible project files list
  - Live result:
    - full WSL Grok acceptance run passed with the new cache assertions
    - disposable project `aa02d27a-8a0c-4c7d-b006-92906f10e11b`
    - disposable clone `bd23e825-a28a-43ee-948c-63a16605eef7`
    - disposable conversation `d6352fd9-34c2-4056-8697-ae670ae90e7e`
    - medium-file guard still failed explicitly as intended with `Uploaded file(s) did not persist after save: grok-medium.jsonl`
- Verification:
  - `pnpm vitest run tests/browser/llmServiceFiles.test.ts tests/browser/providerCache.test.ts tests/browser/grokActions.test.ts tests/browser/llmServiceContext.test.ts --maxWorkers 1`
  - `pnpm run check`
  - live:
    - `DISPLAY=:0.0 pnpm tsx scripts/grok-acceptance.ts --json`
- Issues:
  - This closes the main product gap for Grok file CRUD on WSL: the visible UI mutation and the cache/catalog view now agree. The next file-related work should only be broader file-surface expansion (for example conversation files/attachments), not more project-file persistence plumbing.

- Date: 2026-03-27
- Focus: Add Grok account-wide `/files` CRUD and cache coverage so Aura-Call can manage the master file list behind the avatar menu, not just project knowledge files.
- Progress:
  - Confirmed the live WSL Grok UI surface:
    - the avatar popup exposes a `Files` menu item
    - it navigates to `https://grok.com/files`
    - file rows are anchors like `/files?file=<uuid>`
  - Added account-file provider/cache support:
    - `src/browser/providers/types.ts`
      - added `listAccountFiles(...)`, `uploadAccountFiles(...)`, and `deleteAccountFile(...)`
    - `src/browser/providers/domain.ts`
      - widened file sources to include `account`
    - `src/browser/providers/cache.ts`
      - added `account-files.json` read/write helpers
    - `src/browser/llmService/cache/store.ts`, `cache/catalog.ts`, `cache/export.ts`, `cache/index.ts`
      - added the `account-files` dataset across JSON + SQLite cache storage, export, and catalog queries
    - `src/browser/llmService/llmService.ts`
      - added live account-file list/add/remove methods that refresh the cache after every mutation
    - `bin/auracall.ts`
      - added `auracall files add`, `auracall files list`, and `auracall files remove`
  - Implemented the live Grok `/files` adapter in `src/browser/providers/grokAdapter.ts`:
    - navigate/read the account-wide `Files - Grok` page
    - upload through the page header file input
    - parse row ids from `?file=<uuid>`
    - delete through Grok's current two-step inline row flow:
      - `Delete file`
      - row-local `Delete`
  - Wired the new surface into the scripted acceptance runner in `scripts/grok-acceptance.ts`:
    - upload a disposable account file
    - verify it in live `files list`
    - verify it in `cache files list --dataset account-files`
    - remove it by file id
    - verify it disappears from both the live list and the cache catalog
  - Updated the runbook/docs in `docs/dev/smoke-tests.md`, `docs/testing.md`, and `docs/manual-tests.md` so the quota-sensitive account-wide file list is now part of the Grok completion bar
  - Live proof:
    - uploaded disposable account file `auracall-account-files-smoke-1774669753.txt`
    - listed it as Grok file id `3849f21d-c354-4ee0-a8b6-47258d41fd46`
    - removed it successfully with `auracall files remove ...`
    - refreshed `auracall files list` no longer showed the id or filename
    - refreshed `cache files list --provider grok --dataset account-files --query auracall-account-files-smoke-1774669753` returned `count: 0`
- Verification:
  - `pnpm vitest run tests/browser/grokAdapter.test.ts tests/browser/llmServiceFiles.test.ts --maxWorkers 1`
  - `pnpm run check`
  - live:
    - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts files add --target grok --file /tmp/auracall-account-files-smoke-1774669753.txt`
    - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts files list --target grok`
    - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts files remove 3849f21d-c354-4ee0-a8b6-47258d41fd46 --target grok`
    - `ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts cache files list --provider grok --dataset account-files --query auracall-account-files-smoke-1774669753`
- Issues:
  - Grok account-file delete uses inline staged controls, not the project Personal Files modal save flow. The adapter now handles that current UI, but it is another drift-prone Grok surface and should stay in the acceptance runner.

- Date: 2026-03-28
- Focus: Commit the remaining Grok CRUD plan into the repo and start the next implementation slice on conversation-scoped files.
- Progress:
  - Added `docs/dev/grok-remaining-crud-plan.md` to track the remaining Grok breadth work after the WSL acceptance bar:
    - conversation files
    - conversation attachments / asset manifests
    - account file quota-management quality
    - cross-surface reconciliation
  - Wired that plan into `docs/dev/smoke-tests.md`, `docs/testing.md`, and `docs/manual-tests.md` so the runbook points to the post-acceptance backlog instead of leaving it implicit
  - Began the first concrete slice: conversation file listing/cache parity
    - `src/browser/providers/types.ts`
      - widened `listConversationFiles(...)` to accept `BrowserProviderListOptions`
    - `src/browser/llmService/llmService.ts`
      - added `listConversationFiles(...)`
      - added `refreshConversationFilesCache(...)`
      - behavior:
        - prefer provider `listConversationFiles(...)` when available
        - otherwise fall back to `readConversationContext(...)` and persist `context.files` into the `conversation-files` cache dataset
    - `bin/auracall.ts`
      - added `auracall conversations files list <conversationId> [--project-id <id>]`
    - `tests/browser/llmServiceFiles.test.ts`
      - added coverage for direct provider-backed conversation-file cache writes
      - added coverage for the context-files fallback path
- Verification:
  - pending focused tests + typecheck after the first slice landed
- Issues:
  - This does not make Grok conversation file CRUD complete yet. It only establishes the service/CLI/cache landing zone for the next live adapter work.

- Date: 2026-03-28
- Focus: Turn the new conversation-files landing zone into a real live Grok surface instead of a cache-only abstraction.
- Progress:
  - Probed the authenticated WSL Grok profile live on `127.0.0.1:45011`
  - Created a disposable non-project conversation with a real uploaded file:
    - conversation id: `07adb712-2304-4746-adfd-2c87c888cec0`
    - file: `auracall-conversation-file-probe-Hm3k.txt`
  - Confirmed the current sent-turn DOM shape:
    - Grok renders conversation files as user-row chips above the message bubble
    - the chip currently exposes filename text plus an icon `aria-label` like `Text File`
    - there is no visible provider file id or remote link on the conversation row
  - Implemented live conversation-file extraction in `src/browser/providers/grokAdapter.ts`
    - added `listConversationFiles(...)` for Grok
    - added live sent-turn chip extraction off the current conversation page
    - added `mapGrokConversationFileProbes(...)` to synthesize stable file ids from the conversation id + response row id + chip index
    - updated `readConversationContext(...)` to include `files[]`
    - added a short polling window so context reads do not miss chips rendered a beat after the message rows
  - Added focused regression coverage in `tests/browser/grokAdapter.test.ts`
- Verification:
  - `pnpm vitest run tests/browser/grokAdapter.test.ts tests/browser/llmServiceFiles.test.ts --maxWorkers 1`
  - live:
    - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts conversations files list 07adb712-2304-4746-adfd-2c87c888cec0 --target grok`
    - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts conversations context get 07adb712-2304-4746-adfd-2c87c888cec0 --target grok --json-only`
    - verified cache write at `~/.auracall/cache/providers/grok/ez86944@gmail.com/conversation-files/07adb712-2304-4746-adfd-2c87c888cec0.json`
- Issues:
  - Conversation file read parity is now live, but mutation support is still open. The next slice should determine whether the current Grok UI supports add/remove on an already-created conversation, or whether those operations are effectively creation-time-only attachments.
  - Follow-up live probe on the disposable conversation showed:
    - the existing conversation composer still exposes `Attach` for the next turn
    - clicking a sent file chip opens a read-only preview aside with only `Close`
    - no delete/remove/download action is currently visible on the sent file surface
  - Working assumption for the next slice: conversation-file mutation is likely append-only unless Grok exposes a deeper row/menu surface elsewhere.

- Date: 2026-03-28
- Focus: Close the remaining WSL Grok acceptance gaps and re-prove the full scripted acceptance run end to end.
- Progress:
  - Extended `scripts/grok-acceptance.ts` so the canonical WSL runner now verifies disposable root/non-project conversation-file parity:
    - create a disposable root Grok run with `--browser-attachments always`
    - detect the new root conversation id
    - assert `auracall conversations files list <conversationId> --target grok`
    - assert `auracall conversations context get <conversationId> --target grok --json-only`
    - assert `cache files list --provider grok --conversation-id <conversationId> --dataset conversation-files`
    - delete the disposable root conversation during cleanup
  - Hardened live Grok project creation in `src/browser/providers/grokAdapter.ts`:
    - added exact-name recovery against the current visible project index/list surfaces when Grok creates the project but does not immediately navigate to the new project URL
    - this fixed the live false-negative where `projects create` failed even though the project existed in the refreshed list
  - Hardened Grok browser send behavior in `src/browser/actions/grok.ts` and `src/browser/index.ts`:
    - `setGrokPrompt(...)` now focuses the live composer more defensively, preserves multiline `ProseMirror` content, and falls back to DOM/event injection if CDP text insertion does not stick
    - `submitGrokPrompt(...)` now waits for a real enabled submit control, verifies turn commit, and falls back to Enter when a click does not commit the turn
    - this fixed the live root-conversation attachment path where Grok staged the prompt/file but did not actually submit the turn
  - Hardened the Grok project-name input setters in `src/browser/providers/grokAdapter.ts` so the create dialog retries until the entered name actually sticks instead of failing on the first transient React/input wobble
  - Broadened the `/files` readiness gate in `src/browser/providers/grokAdapter.ts` so post-delete refreshes accept the current usable search/upload/empty-state surfaces instead of falsely failing with `Grok files page did not load`
  - Follow-up live cleanup exposed one more `/files` issue:
    - the ready predicate itself was fine on the live page
    - but `auracall files list --target grok` could still attach on a project tab, call `Page.navigate(...)`, and fail before the `/files` surface settled
    - added a second-chance in-page `location.assign(...)` fallback in `navigateToGrokFiles(...)` before giving up
    - after that patch, focused Grok adapter tests still passed and live `auracall files list --target grok` recovered on the same WSL session
  - Live proof:
    - targeted root file send returned `AuraCall Root Submit Probe` with `files=1`
    - targeted multiline markdown prompt preserved the bullet plus fenced `txt` block on the live WSL Grok path
    - final `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx scripts/grok-acceptance.ts --json` returned `ok: true`
    - follow-up cleanup succeeded:
      - removed all stale `AuraCall ...` Grok projects from failed intermediate runs
      - removed the disposable Grok account-file artifacts named like:
        - `grok-file*`
        - `grok-conversation-file*`
        - `grok-root-file*`
        - `grok-acceptance-*`
        - `auracall-conversation-file-probe-*`
      - refreshed `cache files list --provider grok --dataset account-files --query grok-file` returned `count: 0`
      - refreshed `cache files list --provider grok --dataset account-files --query grok-conversation-file` returned `count: 0`
  - Final green acceptance summary:
    - project `7f96ddee-31d1-439c-b18a-3e889b9729f1`
    - clone `b24b7738-f8bb-4836-88e4-a1fa4dcd9cc3`
    - project conversation `dbb5b2bc-7048-423b-b8a1-4546b1469a1f`
    - root conversation `a68f6e9b-b045-40f1-a959-22a6ea6deffa`
    - account file `ad439018-4b77-40af-89bf-2aea64b8a5ae`
    - conversation file `grok-conversation-file-kynhkx.txt`
    - medium-file guard still failed explicitly as intended with `Uploaded file(s) did not persist after save: grok-medium.jsonl`
- Verification:
  - `pnpm vitest run tests/browser/grokActions.test.ts tests/browser/grokAdapter.test.ts --maxWorkers 1`
  - `pnpm run check`
  - live:
    - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx scripts/grok-acceptance.ts --json`
- Issues:
  - Remaining Grok work is now breadth/polish work, not core WSL CRUD acceptance:
    - conversation-file mutation discovery
    - conversation attachment manifests/export quality
    - account-file quota hygiene/orphan cleanup

- 2026-03-28 (later): Landed append-only conversation-file mutation and fixed post-delete cache cleanup on the WSL Grok path.
  - Focus: turn conversation-file mutation from a planning note into a real supported CLI surface without regressing browser/session cleanup.
  - Changes:
    - added `auracall conversations files add <conversationId> --target grok --prompt <text> -f <path>` in `bin/auracall.ts`
    - made that command keep the just-used Grok browser alive long enough to refresh `conversation-files` from the same runtime endpoint instead of rediscovering Chrome after the send
    - updated `src/browser/llmService/llmService.ts` so explicit runtime `host` / `port` overrides are treated as authoritative and do not bounce back through browser-service target rediscovery
    - cleared `conversation-files` and `conversation-attachments` cache rows during conversation delete in `bin/auracall.ts` so dead file rows do not survive after cleanup
  - Live proof:
    - fresh non-project conversation `c7188321-f0e4-4c39-ba1f-75e6511dcd14`
    - first-run `auracall conversations files add ...` returned success on the first invocation with no fatal post-send debugger error
    - `conversations files list`, `conversations context get --json-only`, and `cache files list --dataset conversation-files` all agreed on one attached file: `grok-conversation-append-fix-22376b.txt`
    - the attached file did not appear in `account-files` cache (`query 22376b => count 0`)
    - follow-up disposable conversation `740f3cbe-6790-4729-9952-5ea899053edb` proved delete cleanup now zeroes `conversation-files` cache rows after conversation removal
  - Verification:
    - `pnpm vitest run tests/browser/llmServiceFiles.test.ts tests/browser/grokAdapter.test.ts --maxWorkers 1`
    - live:
      - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts conversations files add c7188321-f0e4-4c39-ba1f-75e6511dcd14 --target grok --prompt "Reply exactly with: AuraCall Conversation File Fix 22376b" -f /tmp/grok-conversation-append-fix-22376b.txt`
      - `pnpm tsx bin/auracall.ts conversations files list c7188321-f0e4-4c39-ba1f-75e6511dcd14 --target grok`
      - `pnpm tsx bin/auracall.ts cache files list --provider grok --conversation-id 740f3cbe-6790-4729-9952-5ea899053edb --dataset conversation-files`
  - Remaining limitation:
    - Grok still exposes already-sent conversation files as read-only chips/previews. Aura-Call supports append-only add, not delete of already-sent conversation files.

- 2026-03-28 (later): Wrote down the browser-service DOM-drift follow-on plan and wired it into the normal repair docs.
  - Focus: capture the repeated lessons from the Grok stabilization work in one place so future DOM drift gets extracted into browser-service instead of accumulating in provider adapters.
  - Changes:
    - expanded `docs/dev/browser-service-upgrade-backlog.md` with the current DOM-drift repair plan:
      - `navigateAndSettle(...)`
      - anchored row/menu action helpers
      - structured UI diagnostics wrappers
      - canonical action-surface fallback helpers
      - explicit per-client focus policy
      - optional failure snapshots
    - updated `AGENTS.md` to point repair work at that backlog before adding provider-local browser hacks
    - linked the same plan from `docs/dev/browser-automation-playbook.md`, `docs/dev/browser-service-tools.md`, and `docs/dev/smoke-tests.md`
  - Result:
    - the extraction plan is now part of both the agent instructions and the browser runbook, so reusable DOM-repair work has an explicit home before the next drift fix starts

- 2026-03-28 (later): Started the first browser-service DOM-drift extraction by landing `navigateAndSettle(...)`.
  - Focus: replace one concrete class of provider-local drift repair, SPA route settling, with a package-owned helper.
  - Changes:
    - added `navigateAndSettle(...)` to `packages/browser-service/src/service/ui.ts`
    - added focused package tests in `tests/browser-service/ui.test.ts`
    - moved Grok `/files` and generic Grok URL/project navigation over to the shared helper in `src/browser/providers/grokAdapter.ts`
    - updated the package/browser runbook docs to reference the new helper and marked the backlog item as started
  - Verification:
    - `pnpm vitest run tests/browser-service/ui.test.ts tests/browser/grokAdapter.test.ts --maxWorkers 1`
    - `pnpm run check`
  - Next:
    - apply the same helper to the remaining ad hoc Grok conversation/tab route settles
    - then move on to the next backlog item: anchored row/menu action helpers

- 2026-03-28 (later): Started the anchored row/menu helper extraction and moved the first Grok rename/delete flows onto it.
  - Focus: stop repeating the same row-hover + hidden-action/menu wiring in provider code.
  - Changes:
    - added `clickRevealedRowAction(...)` and `openRevealedRowMenu(...)` to `packages/browser-service/src/service/ui.ts`
    - added focused helper coverage in `tests/browser-service/ui.test.ts`
    - updated `src/browser/providers/grokAdapter.ts` to use:
      - `openRevealedRowMenu(...)` for the root/sidebar conversation `Options` menu
      - `clickRevealedRowAction(...)` for history-dialog conversation rename/delete row actions
    - marked the anchored row/menu backlog item as started and updated the browser-service docs/playbook to prefer the new helpers
  - Verification:
    - `pnpm vitest run tests/browser-service/ui.test.ts tests/browser/grokAdapter.test.ts --maxWorkers 1`
    - `pnpm run check`
    - live:
      - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx scripts/grok-acceptance.ts --json`
      - returned `ok: true`
      - disposable ids exercised during the run:
        - project `b17cc322-18bd-48d9-9ccb-4f004ae5bc00`
        - clone `1100c1d3-24f8-4a30-9e54-9136c88efe17`
        - project conversation `fdaf9395-4821-409a-a499-166607f01ec8`
        - root conversation `7d2f6d48-e161-4fa6-ba86-9781e4ab45c9`
  - Next:
    - move the project-row `Options` path onto the same shared helper shape once the link-navigation suppression can be generalized cleanly

- 2026-03-28 (later): Finished the next anchored row/menu extraction step by moving Grok project-row menu opening onto the shared helper shape.
  - Focus: eliminate the last big provider-local project-row menu-open block and keep only the truly Grok-specific scoring/tagging logic in the adapter.
  - Changes:
    - expanded `openRevealedRowMenu(...)` in `packages/browser-service/src/service/ui.ts` with:
      - optional trigger preparation before open attempts
      - optional direct trigger-click fallback after the generic menu open misses
    - added a focused regression for that path in `tests/browser-service/ui.test.ts`
    - updated `src/browser/providers/grokAdapter.ts` so `openProjectMenuButton(...)` now:
      - still tags the best visible project-row `Options` button via Grok-specific scoring
      - then hands the actual hover/open/fallback work to `openRevealedRowMenu(...)`
      - no longer owns the old direct button click + manual CDP pointer-click fallback block itself
    - updated the browser-service backlog/tools/playbook docs to record that the project-row path now sits on the shared helper shape
  - Verification:
    - `pnpm vitest run tests/browser-service/ui.test.ts tests/browser/grokAdapter.test.ts --maxWorkers 1`
    - `pnpm run check`
    - live:
      - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx scripts/grok-acceptance.ts --json`
      - returned `ok: true`
      - disposable ids exercised during the run:
        - project `26965675-c5fe-4bc0-8cbb-90f811dc2ff1`
        - clone `52a900b5-3440-4907-8acb-8776d288cf8f`
        - project conversation `1c6074e6-9f71-49ee-b5d4-57f8b0d89578`
        - root conversation `34f0aec1-dfc4-4c8e-8d09-9ecc183b5a19`
  - Remaining follow-up:
    - the provider still owns “which button in this row is the right menu trigger?” scoring for Grok project rows
    - the next extraction question is whether that scoring pattern is generic enough to move into browser-service or should stay adapter-specific

- 2026-03-28 (later): Wrote down the next browser-service plan and made it the active guidance in AGENTS/runbook docs.
  - Focus: turn the trigger-scoring decision into an explicit policy and make structured UI diagnostics the next concrete browser-service implementation target.
  - Changes:
    - expanded `docs/dev/browser-service-upgrade-backlog.md` with the detailed structured-diagnostics plan:
      - `collectUiDiagnostics(...)`
      - `withUiDiagnostics(...)`
      - first adoption targets in fragile Grok flows
      - test and live-acceptance requirements
      - explicit “do not extract trigger scoring until it repeats” rule
    - updated `AGENTS.md` so the current browser-service plan is part of the standing agent guidance
    - updated `docs/dev/browser-automation-playbook.md` and `docs/dev/browser-service-tools.md` so the runbook points future DOM-drift work at the same plan
  - Result:
    - the active plan is now explicit:
      - keep row/button scoring provider-local for now
      - make structured UI diagnostics wrappers the next package-owned extraction
      - use later evidence, not instinct, to decide whether trigger scoring should move into browser-service

- 2026-03-28 (later): Made `browser.hideWindow` profile-scoped and focus-safe for WSL/Linux launches.
  - Focus: stop Aura-Call browser runs from stealing focus while keeping the behavior profile-scoped instead of process-global.
  - Changes:
    - `packages/browser-service/src/chromeLifecycle.ts`
      - `buildChromeFlags(...)` now adds `--start-minimized` for headful `hideWindow` launches
      - `openOrReuseChromeTarget(...)` / `connectToRemoteChrome(...)` already honor `suppressFocus`; added regression coverage for the no-`bringToFront()` path
      - fresh Chrome handles now carry `launchedByAuracall: true`; adopted/reused handles carry `false`
    - `packages/browser-service/src/manualLogin.ts`, `src/browser/index.ts`, `src/browser/reattach.ts`, `src/browser/reattachCore.ts`
      - only auto-hide windows Aura-Call just launched itself
      - do not re-minimize an existing profile window the user has already raised
      - manual-login launch now re-applies hide after opening the initial login tab so the post-open target selection does not steal focus
    - `src/browser/providers/grokAdapter.ts`
      - replaced the temporary process-wide `AURACALL_BROWSER_SUPPRESS_FOCUS` approach with per-client focus policy metadata, so hide/minimize behavior stays scoped to the current browser/profile session
    - `~/.auracall/config.json`
      - enabled `hideWindow: true` for the active WSL default profile and the retained `windows-chrome-test` profile, plus matching browser defaults
  - Verification:
    - `pnpm vitest run tests/browser-service/chromeLifecycle.test.ts tests/browser-service/chromeTargetReuse.test.ts tests/browser/manualLogin.test.ts tests/browser/grokAdapter.test.ts tests/browser/config.test.ts tests/cli/browserConfig.test.ts --maxWorkers 1`
    - `pnpm run check`
    - live disposable WSL smoke:
      - Chrome launched with `hideWindow: true`
      - `_NET_ACTIVE_WINDOW` stayed unchanged before vs after launch/open (`unchanged: true`)
      - DevTools `Browser.getWindowBounds(...)` still reported `windowState: "normal"` on this X11 stack
  - Current nuance:
    - On WSL/X11, the reliable guarantee is "Aura-Call does not steal focus" rather than "Chrome reports minimized through DevTools." The active-window check proved the user-visible focus behavior; Chrome's window-bounds API remains misleading here.

- 2026-03-28 (later): Started the structured UI diagnostics extraction and used it to drive the next live Grok fixes.
  - Focus: move the “what is the UI actually showing right now?” evidence into browser-service so future DOM drift is cheaper to localize, then use that evidence to repair the next round of Grok regressions instead of blind selector churn.
  - Browser-service changes:
    - `packages/browser-service/src/service/ui.ts`
      - added `collectUiDiagnostics(...)`
      - added `withUiDiagnostics(...)`
      - diagnostics currently capture:
        - URL/title/readyState
        - active element summary
        - visible dialogs
        - visible menus plus visible items
        - visible buttons in scope
        - scoped candidate census
    - `tests/browser-service/ui.test.ts`
      - added focused coverage for diagnostics collection and wrapped error enrichment
  - Grok adoption:
    - `src/browser/providers/grokAdapter.ts`
      - wrapped the highest-drift menu paths in `withUiDiagnostics(...)`:
        - project menu open
        - project menu item selection
        - conversation sidebar menu open
      - hardened root conversation navigation/readiness after append:
        - root `/c/...` reads now use route-settled navigation instead of raw `Page.navigate(...)`
        - conversation file-list readiness no longer requires an assistant-side surface before any file chips are allowed to exist
        - sent-turn conversation-file chip polling now waits longer after append
      - hardened root conversation delete/home-sidebar hydration:
        - sidebar row tagging now retries instead of assuming the first DOM snapshot is final
        - root sidebar row wait budget is now long enough to survive the observed post-append lag
      - hardened concrete-project clone rename:
        - `openProjectRenameEditor(...)` now waits for the project rename surface to hydrate before falling back to menu/header actions
      - added a root sidebar conversation collector so non-project conversation listing can merge the visible home/sidebar surface instead of depending only on history-dialog/open-tab discovery
  - Acceptance/runbook changes:
    - `scripts/grok-acceptance.ts`
      - root post-browser conversation discovery now allows a longer wait budget
      - if the root conversation list still lags, the runner can fall back to the fresh browser session’s recorded `conversationId` from `~/.auracall/sessions/*/meta.json`
      - this keeps the CRUD runner validating the conversation/file/delete path while still logging that the root list surface lagged
  - Live findings from the diagnostics payloads:
    - project clone failures were really “rename fired before the concrete project page hydrated,” not bad clone ids
    - root conversation append/list failures were really “conversation surface not settled yet,” not lost file state
    - root conversation delete failures were really “home/sidebar row not present yet,” not missing conversations
  - Verification:
    - repeated focused runs:
      - `pnpm vitest run tests/browser-service/ui.test.ts tests/browser/grokAdapter.test.ts --maxWorkers 1`
      - `pnpm run check`
    - live targeted proofs:
      - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts conversations context get db726922-f6a1-49c7-bdc3-f9c607c620a1 --target grok --json-only`
      - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts conversations files list db726922-f6a1-49c7-bdc3-f9c607c620a1 --target grok`
      - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts projects clone ff05cf94-c79d-4021-b66f-db19eb099c1e 'AuraCall Cedar Orbit hydratefix' --target grok`
      - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts delete d966a9e0-85e6-4beb-8461-1bf6e08c3b9e --target grok --yes`
      - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts conversations --target grok --refresh --include-history`
        - now surfaces root conversations like `d966a9e0-85e6-4beb-8461-1bf6e08c3b9e`
  - Current status:
    - the targeted live regressions that the new diagnostics exposed are fixed
    - the scripted WSL Grok acceptance runner now has a deliberate root-conversation session-meta fallback for list lag
    - the final clean end-to-end WSL Grok acceptance transcript is now captured again:
      - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx scripts/grok-acceptance.ts --json`
      - returned `ok: true`
      - disposable ids exercised during the clean run:
        - project `b3f7da94-9342-4194-84ac-34b3c51c480c`
        - clone `ca3d75e7-5cba-4f5c-b801-bcc949d88284`
        - project conversation `77bee9d5-9d28-4fd6-9bb0-0d2a706e321c`
        - root conversation `39ed172c-59c4-4813-a98f-874e5ec7ba33`
      - this pass discovered the root conversation directly from `conversations --refresh --include-history` and completed root append/delete cleanup without needing the session-meta fallback
    - cleanup is also complete for stale failed-run Grok projects:
      - removed 42 disposable `AuraCall Cedar (Atlas|Harbor|Orbit) ...` Grok projects from earlier failed acceptance runs
      - verified `projects --target grok --refresh` now leaves `leftoverCount: 0` for that disposable name family

## 2026-03-28 — ChatGPT project CRUD DOM recon + first live repair pass

- Goal:
  - move from the now-stable WSL Grok CRUD path onto ChatGPT project CRUD
  - start by switching the browser default model to Instant, then explore the live ChatGPT DOM before committing to adapter behavior
- Browser-model default:
  - changed the browser-mode default/fallback model from Pro to Instant
  - updated:
    - `src/browser/constants.ts`
    - `src/cli/runOptions.ts`
    - `src/schema/resolver.ts`
  - focused verification passed:
    - `pnpm vitest run tests/runOptions.test.ts tests/schema/resolver.test.ts tests/browser/config.test.ts tests/cli/browserConfig.test.ts --maxWorkers 1`
- Live ChatGPT DOM findings on the managed WSL Chrome session:
  - sidebar project rows expose stable row-menu triggers:
    - `button[aria-label="Open project options for <Project Name>"]`
  - the create-project flow is a real modal:
    - root selector: `[data-testid="modal-new-project-enhanced"]`
    - name field: `input[name="projectName"]`
    - confirm button text: `Create project`
  - project pages expose a stable page-level settings surface:
    - title edit trigger aria starts with `Edit the title of ...`
    - details/settings trigger: `Show project details`
    - tabs: `Chats`, `Sources`
    - settings dialog fields:
      - `input[aria-label="Project name"]`
      - `textarea[aria-label="Instructions"]`
      - dialog-local `Delete project`
  - delete is a two-dialog state:
    - the project settings sheet remains open
    - the destructive confirmation dialog overlays it with:
      - text beginning `Delete project?`
      - buttons `Delete` and `Cancel`
  - important id-shape finding:
    - current project routes use bare ids such as `g-p-69c8539d58e08191914b82731ecb32be`
    - sidebar hrefs append a slug suffix such as `g-p-69c8539d58e08191914b82731ecb32be-auracall-harbor-vector`
    - Aura-Call should treat the bare `g-p-...` prefix as canonical
- Implementation:
  - added `src/browser/providers/chatgptAdapter.ts` and wired it through `src/browser/providers/index.ts`
  - current ChatGPT adapter surface now covers:
    - `listProjects`
    - `createProject`
    - `renameProject`
    - `selectRemoveProjectItem`
    - `pushProjectRemoveConfirmation`
  - the adapter now:
    - canonicalizes ChatGPT project ids to bare `g-p-...`
    - treats a confirmed route change to a new project id as authoritative for creation
    - waits for the ChatGPT project surface to hydrate before using title/settings controls
    - recognizes the broader project-settings dialog instead of keying only on one input selector
    - targets the real destructive confirmation dialog instead of whichever dialog happens to be first in the DOM
    - retries `listProjects` once with a fresh tab resolution when the initial CDP attachment dies with `WebSocket connection closed`
- Why the first create attempts looked contradictory:
  - the earlier manual DOM inspection was happening on a stale manual `9222` ChatGPT tab
  - the real managed Aura-Call ChatGPT session was on the active service target/port resolved by `browserService`
  - once inspected on that managed target, project create was genuinely working; the main defect was post-create verification being too strict while the new page title/settings controls were still hydrating
- Focused tests:
  - added `tests/browser/chatgptAdapter.test.ts`
  - coverage currently locks down:
    - project id extraction/normalization from bare + slugged ChatGPT URLs
    - normalized exact-name matching for project lookup
  - verification:
    - `pnpm vitest run tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
    - `pnpm run check`
- Live verification:
  - disposable create/rename/delete passed end to end on the managed ChatGPT session:
    - created `AuraCall Harbor Vector`
    - renamed to `AuraCall Harbor Ledger`
    - deleted the project successfully
  - direct rename/delete also passed on a separately created disposable project:
    - `g-p-69c852c00f7c8191a935698b7b6df07b`
    - `AuraCall Maple Orbit` -> `AuraCall Maple Harbor` -> deleted
  - user-facing read path recovered too:
    - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts projects --target chatgpt`
    - now lists projects instead of dying immediately on a stale CDP websocket
- Cleanup:
  - removed the disposable ChatGPT probe projects created during recon/validation:
    - `AuraCall Probe Signal`
    - `AuraCall Cedar Vector Manual`
    - `AuraCall Elm Echo`
    - `AuraCall Alder Signal`
    - `AuraCall Maple Harbor`
    - `AuraCall Harbor Ledger`
  - current live ChatGPT projects list is back to the user’s real set:
    - `Support Letters`
    - `Reviewer`
    - `SoyLei`
    - `SABER Company`
    - `HARVEST Roads`
- Remaining note:
  - ChatGPT project list/cache writes still prompt for a cache identity unless `browser.cache.identityKey` (or `browser.cache.identity`) is configured; this is not blocking project CRUD, but it is still noisy on CLI list/write paths
- Follow-up:
  - added ChatGPT project-create memory-mode support:
    - `auracall projects create ... --target chatgpt --memory-mode global|project`
    - `global` maps to ChatGPT `Default`
    - `project` maps to ChatGPT `Project-only`
  - important live DOM finding:
    - the create-modal `Project settings` gear does not reliably open on a plain synthetic `click`
    - it does open on a real pointer sequence
    - keyboard `Space` / `ArrowDown` also open it
    - Aura-Call now uses the shared pointer-driven menu opener first, then keyboard fallback
  - fixed a second ChatGPT project CRUD edge during cleanup:
    - `projects remove g-p-...` now accepts bare ChatGPT project ids directly instead of forcing a cache-name lookup
    - project delete no longer depends on the page-level settings trigger living under `main`; it now retries the visible `Edit the title of ...` control at document scope and falls back through `Show project details`
  - live verification:
    - created disposable memory-mode projects:
      - `AuraCall Harbor Memory Global`
      - `AuraCall Harbor Memory Project`
    - `--memory-mode project` now succeeds end to end on the managed WSL Chrome session
    - both disposable projects were removed successfully afterward
- Browser-service extraction follow-up:
  - moved the ChatGPT/Grok DOM-drift learnings one layer down into `packages/browser-service/src/service/ui.ts`
  - new package-owned behavior:
    - `pressButton(...)` now accepts ordered interaction strategies for surfaces that distinguish plain click from pointer or keyboard activation
    - `openMenu(...)` now retries ordered interaction strategies and reports which strategy opened the menu
    - `openSurface(...)` now provides a shared “try these triggers until the ready state appears” primitive
    - `collectUiDiagnostics(...)` / `withUiDiagnostics(...)` now accept caller `context` so failures can record intended trigger labels, scopes, and interaction modes
  - generalized project-id handling in `llmService`:
    - provider-native project-id passthrough is now driven by provider hooks instead of a hardcoded ChatGPT special case
    - `extractProjectId(configuredUrl)` now asks the provider first
  - ChatGPT adoption:
    - project-create memory mode now uses `openMenu(...)` with ordered interaction strategies instead of provider-local pointer/keyboard fallback snippets
    - project settings open now uses `openSurface(...)` instead of provider-local trigger retry glue
  - focused/browser-service verification:
    - `pnpm vitest run tests/browser-service/ui.test.ts tests/browser/chatgptAdapter.test.ts tests/runOptions.test.ts tests/schema/resolver.test.ts tests/browser/config.test.ts tests/cli/browserConfig.test.ts --maxWorkers 1`
    - `pnpm run check`
  - live verification:
    - created disposable ChatGPT project `AuraCall BrowserService Surface Probe` with `--memory-mode project`
    - removed it successfully by bare id `g-p-69c86caa0c308191bb2af23d234cf23f`
- ChatGPT project sources/files follow-up:
  - completed the remaining ChatGPT project sources/files CRUD slice on the managed WSL Chrome profile
  - live DOM lesson:
    - the first source row that appears immediately after selecting a file is not strong enough evidence of persistence
    - ChatGPT can close the picker and show the row before a fresh `Sources` reload will reliably reproduce it
    - the durable verification bar is now: row appears, then a hard reload of `?tab=sources` still shows it
  - code changes:
    - `src/browser/providers/chatgptAdapter.ts`
      - added reload-backed source verification helpers for project source add/remove
      - `listProjectFiles(...)` now does one hard-reload retry before returning an empty list
      - `uploadProjectFiles(...)` now waits for the uploaded source names to survive a fresh `Sources` reload
      - `deleteProjectFile(...)` now waits for the removed source name to stay gone after a fresh reload
    - `bin/auracall.ts`
      - nested `projects files ...` and `projects instructions ...` commands now inherit `--target` from the parent/root CLI the same way `projects create|rename|remove` already do
  - live CLI verification:
    - created disposable project `AuraCall ChatGPT Sources Acceptance 1774747901`
    - `projects files add g-p-69c8810c65ac8191b2906da27ea5132f --target chatgpt --file /tmp/chatgpt-project-source-gQ3f.md`
    - `projects files list ...` returned `chatgpt-project-source-gQ3f.md`
    - `projects files remove ... chatgpt-project-source-gQ3f.md --target chatgpt`
    - follow-up `projects files list ...` returned `No files found`
    - removed the disposable project successfully afterward
  - remaining ChatGPT project work:
    - project instructions get/set
    - clone only if the current native UI exposes it

## 2026-03-29 — Browser-service menu-family selection is now package-owned

- Goal:
  - keep working the browser-service upgrade before returning to more ChatGPT
    CRUD surfaces
  - move "pick the right visible menu when several menus are open" out of
    provider code and into `packages/browser-service`
- Implemented:
  - `packages/browser-service/src/service/ui.ts`
    - added `collectVisibleMenuInventory(...)`
      - returns a bounded visible-menu census
      - tags visible menus with a specific selector so the chosen menu can be
        addressed directly instead of via a generic `[role="menu"]`
      - reports item labels, geometry, and optional anchor distance
    - extended `waitForMenuOpen(...)`
      - can now select the best visible menu by:
        - expected item labels
        - whether the menu is newly opened vs already visible
        - optional anchor proximity
    - extended `openMenu(...)`
      - captures pre-open menu signatures when menu-family selection is in play
      - passes expected-item context through to `waitForMenuOpen(...)`
    - `openAndSelectMenuItem(...)` / `selectFromListbox(...)`
      - now pass their intended option label down to the shared menu opener
  - `src/browser/providers/chatgptAdapter.ts`
    - ChatGPT project-create memory mode now passes the expected memory-option
      label (`Default` / `Project-only`) into the shared menu opener so the
      settings gear no longer depends on "first visible menu" behavior
- Why this matters:
  - it fixes the exact class of drift we saw on ChatGPT composer/project menus:
    multiple unrelated visible menus, same generic `[role="menu"]` selector,
    and the need to pick the right family based on intended content instead of
    DOM order
- Verification:
  - focused:
    - `pnpm vitest run tests/browser-service/ui.test.ts tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
    - `pnpm run check`
  - added coverage:
    - visible-menu inventory returns specific tagged selectors
    - menu-open waits can prefer the correct menu by expected item labels plus
      novelty instead of grabbing the wrong visible menu
  - live:
    - created disposable ChatGPT project `AC BS Menu Probe 329` with
      `--memory-mode project`
    - removed it successfully afterward
- Follow-up still open in the browser-service backlog:
  - nested submenu-path helpers
  - select-and-reopen verification helpers
  - deciding whether anchor-near-trigger scoring is still app-specific enough
    to keep in adapters

## 2026-03-29 — ChatGPT root conversation CRUD is live on WSL Chrome

- Goal:
  - return from browser-service upgrades to the active ChatGPT conversation surface plan
  - finish root conversation list/read/rename/delete on the managed WSL ChatGPT profile before touching attachment breadth
- Live DOM findings that mattered:
  - root/sidebar conversation rows still use the row-local `Open conversation options for ...` button as the authoritative rename surface
  - the open-conversation header menu still exposes `Delete`, but it was less reliable than the sidebar row menu in the current live layout
  - ChatGPT can truncate long sidebar conversation titles, so filtering by the full prompt text is not a safe live acceptance pattern
  - route readiness is not the same as message readiness; context reads sometimes needed a short poll window and one reload before the turn DOM stabilized
- Implemented:
  - `src/browser/providers/chatgptAdapter.ts`
    - added ChatGPT conversation helpers for:
      - canonical root/project conversation URL resolution
      - sidebar conversation scraping + normalization
      - root/project conversation navigation + ready-state waits
      - sidebar row tagging for row-local action buttons
      - context extraction from the current ChatGPT turn DOM
      - rename/delete post-condition waits
    - added provider support for:
      - `listConversations(...)`
      - `readConversationContext(...)`
      - `renameConversation(...)`
      - `deleteConversation(...)`
    - made conversation list reads tolerate sidebar hydration lag instead of returning empty immediately
    - made context reads poll the turn DOM and do one reload/retry before failing
    - made delete prefer the proven sidebar row action surface, with header-menu fallback only if needed
    - made row tagging poll for sidebar hydration instead of using a one-shot lookup
  - `src/browser/providers/index.ts`
    - ChatGPT `resolveConversationUrl(...)` is now project-aware and reuses the canonical conversation URL helper
  - `tests/browser/chatgptAdapter.test.ts`
    - added coverage for:
      - `extractChatgptConversationIdFromUrl(...)`
      - `normalizeChatgptConversationLinkProbes(...)`
      - `resolveChatgptConversationUrl(...)`
      - ChatGPT capabilities now advertising conversations support
- Verification:
  - focused:
    - `pnpm vitest run tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
    - `pnpm run check`
  - live non-Pro WSL ChatGPT pass:
    - created disposable root conversation via:
      - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts "Reply exactly with AURACALL CHATGPT CONVO CRUD PROBE 20260329-3." --chatgpt --verbose`
    - listed it via:
      - `... pnpm tsx bin/auracall.ts conversations --target chatgpt --refresh --filter "AURACALL CHATGPT CONVO CRUD"`
    - read context via:
      - `... pnpm tsx bin/auracall.ts conversations context get 69c9410c-5678-8331-b6b3-d302ad9b922a --target chatgpt --json-only`
    - renamed it via:
      - `... pnpm tsx bin/auracall.ts rename 69c9410c-5678-8331-b6b3-d302ad9b922a "AuraCall ChatGPT CRUD Renamed" --target chatgpt`
    - verified refreshed list/title via:
      - `... pnpm tsx bin/auracall.ts conversations --target chatgpt --refresh --filter "69c9410c-5678-8331-b6b3-d302ad9b922a"`
    - deleted it via:
      - `... pnpm tsx bin/auracall.ts delete 69c9410c-5678-8331-b6b3-d302ad9b922a --target chatgpt --yes`
    - verified cleanup via:
      - `... pnpm tsx bin/auracall.ts conversations --target chatgpt --refresh --filter "69c9410c-5678-8331-b6b3-d302ad9b922a"`
- Next:
  - move to ChatGPT conversation attachments/files
  - only after that, add a broader scripted ChatGPT acceptance runner

## 2026-03-29 — ChatGPT conversation-file read parity is live from sent-turn tiles

- Goal:
  - start Phase 3 of the ChatGPT conversation surface plan on the managed WSL profile
  - make ChatGPT conversation files observable through real CLI surfaces before deciding whether delete/removal is even possible in the native UI
- Live DOM findings that mattered:
  - small text files are a false attachment smoke under the default `--browser-attachments auto` behavior because ChatGPT can inline the file contents into the prompt instead of creating a real upload artifact
  - forcing `--browser-attachments always` produced the real upload path and a stable live conversation:
    - `69c95f14-2ca0-8329-9d3a-be5d1a1967ab`
  - the authoritative current read surface is the sent user-turn tile:
    - `section[data-testid^="conversation-turn-"]`
    - nested user message node with `data-message-author-role="user"` and `data-message-id`
    - file tile group with `role="group"` and `aria-label=<filename>`
  - the current header menu still advertises `View files in chat`, but synthetic click recon did not yield a stronger or more reliable dialog surface than the sent-turn tile itself
- Implemented:
  - `src/browser/providers/chatgptAdapter.ts`
    - added `ChatgptConversationFileProbe`
    - added `normalizeChatgptConversationFileProbes(...)`
    - added `readVisibleChatgptConversationFilesWithClient(...)`
    - added provider support for `listConversationFiles(...)`
    - `readConversationContext(...)` now includes `files[]` populated from the sent user-turn file tiles
  - `tests/browser/chatgptAdapter.test.ts`
    - added coverage for `normalizeChatgptConversationFileProbes(...)`
- Verification:
  - focused:
    - `pnpm vitest run tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
    - `pnpm run check`
  - live non-Pro WSL ChatGPT pass:
    - forced a real upload with:
      - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts "Reply exactly with CHATGPT REAL UPLOAD PROBE 20260329-B." --chatgpt -f /tmp/chatgpt-real-upload-vmuk.txt --browser-attachments always --verbose`
    - verified list parity via:
      - `... pnpm tsx bin/auracall.ts conversations files list 69c95f14-2ca0-8329-9d3a-be5d1a1967ab --target chatgpt`
      - returned `chatgpt-real-upload-vmuk.txt`
    - verified context parity via:
      - `... pnpm tsx bin/auracall.ts conversations context get 69c95f14-2ca0-8329-9d3a-be5d1a1967ab --target chatgpt --json-only`
      - returned the same file in `files[]` with synthetic id:
        - `69c95f14-2ca0-8329-9d3a-be5d1a1967ab:1411ca60-9384-407a-a39a-ce9b772c737a:0:chatgpt-real-upload-vmuk.txt`
      - metadata included:
        - `label: Document`
        - `turnId: 1411ca60-9384-407a-a39a-ce9b772c737a`
        - `messageId: 1411ca60-9384-407a-a39a-ce9b772c737a`
- Cleanup follow-up:
  - deleting the first disposable upload conversation exposed a stale-postcondition bug: the destructive action had succeeded, but the verifier was still seeing stale conversation anchors on the current page and falsely reported failure
  - `waitForChatgptConversationDeleted(...)` now rechecks from the authoritative list surface (`https://chatgpt.com/` or the project page) before calling delete a failure
  - live reproof:
    - created disposable upload conversation `69c96223-2708-8329-b563-00e171e22b39`
    - deleted it successfully via:
      - `... pnpm tsx bin/auracall.ts delete 69c96223-2708-8329-b563-00e171e22b39 --target chatgpt --yes`
- Product clarification captured:
  - users can remove files from the ChatGPT composer before sending a prompt
  - users cannot delete an already-sent file from a chat
  - ChatGPT may expire retained files independently later
  - on ChatGPT, project `Sources` is the only durable file-delete surface Aura-Call should automate
- Next:
  - move to existing-conversation tool/add-on state
  - then add the broader ChatGPT acceptance runner

## 2026-03-29 — Paused ChatGPT surface expansion to harden rate-limit handling

- Trigger:
  - the acceptance work started surfacing a real ChatGPT dialog:
    - `Too many requests`
    - `You're making requests too quickly`
  - the important lesson was that the limit came from aggregate write cadence across separate `auracall` processes, not from one bad DOM selector
- Analysis:
  - the write-heavy sequence was enough to provoke the account-level throttle:
    - project create/rename
    - project source add/remove
    - project instructions set
    - later conversation rename/delete
  - each CLI call was starting fresh, so in-memory retry logic could not protect the next command
- Implemented:
  - `src/browser/llmService/llmService.ts`
    - added a profile-scoped persisted ChatGPT guard file at:
      - `~/.auracall/cache/providers/chatgpt/__runtime__/rate-limit-<profile>.json`
    - ChatGPT mutating llmservice operations now wait for a minimum inter-write gap before touching the live browser
    - when a ChatGPT live failure contains the real rate-limit UI text, llmservice now records a cooldown and subsequent ChatGPT live llmservice calls fail fast (or briefly auto-wait if the cooldown is nearly expired)
  - `src/browser/llmService/providers/chatgptService.ts`
    - routed ChatGPT list + rename/delete entry points through the guarded llmservice retry path so the persisted cooldown applies to real CRUD calls instead of only helper methods
  - `src/browser/chatgptRateLimitGuard.ts`
    - extracted the shared ChatGPT guard path/profile/message helpers so CRUD and browser-mode can use the same persisted cooldown contract
  - `src/browser/index.ts`
    - ChatGPT browser-mode prompt runs now check the same persisted cooldown before they touch the live browser
    - successful ChatGPT prompt runs now update `lastMutationAt` in the same guard file
    - prompt-run failures now inspect the visible page for the real ChatGPT rate-limit dialog text and persist cooldown state before surfacing the error
  - `tests/browser/llmServiceRateLimit.test.ts`
    - added persistence + cross-instance spacing coverage
  - `tests/browser/chatgptRateLimitGuard.test.ts`
    - added path/profile/message coverage for the shared guard helper
- Verification:
  - `pnpm vitest run tests/browser/chatgptRateLimitGuard.test.ts tests/browser/llmServiceRateLimit.test.ts tests/browser/llmServiceIdentity.test.ts tests/browser/browserModeExports.test.ts tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
  - `pnpm run check`
- Current reading of the fix:
  - this does not change ChatGPT's native quota/rate rules
  - it does stop Aura-Call from rediscovering the same live limit on every fresh CLI process
  - both ChatGPT CRUD and ChatGPT browser-mode prompt runs now honor the same persisted cooldown file

## 2026-03-29 — Stopped long acceptance auto-resume and hardened ChatGPT project-chat rename verification

- Trigger:
  - the guarded ChatGPT acceptance runner kept a stale process alive during a long cooldown and was prepared to resume later with the old code
  - the concrete product failure just before that was project-scoped conversation rename:
    - `ChatGPT conversation rename did not persist for 69c9db96-9250-8326-b75a-55a4844fc974`
- Root cause:
  - `scripts/chatgpt-acceptance.ts` treated any cooldown up to 6 minutes as acceptable wait-and-retry time, which is too aggressive for an interactive debugging loop
  - `buildConversationTitleAppliedExpression(...)` preferred anchor text before the row menu label, but on ChatGPT project pages the row menu label is often the stronger title signal during rename propagation
- Implemented:
  - `scripts/chatgpt-acceptance.ts`
    - added a short acceptance-only cooldown ceiling (`30s`)
    - preflight checks now abort before any new mutation if the persisted ChatGPT cooldown is still materially active
    - post-failure rate-limit handling now aborts instead of sleeping for minutes and resuming later
  - `src/browser/providers/chatgptAdapter.ts`
    - project/root conversation rename verification now prefers the row action label (`Open conversation options for ...`) over anchor text when inferring the live title
    - rename verification now does one list refresh fallback before failing
- Verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
  - `pnpm run check`
- Current state:
  - the stale acceptance process was terminated
  - the local ChatGPT cooldown file remains the authority for when the next safe live rerun should happen

## 2026-03-29 — Split ChatGPT acceptance into resumable phases for this account's throttle budget

- Trigger:
  - even with the improved persisted write-budget guard and the no-long-sleep retry policy, the single-pass ChatGPT acceptance run still hit the account's native throttle during the later root/tool portion
  - the important lesson is that the product guard prevents hammering, but it cannot expand the account's real allowance for one dense end-to-end acceptance burst
- Implemented:
  - `scripts/chatgpt-acceptance.ts`
    - added `--phase full|project|project-chat|root-base|root-followups|cleanup`
    - added `--project-id` and `--conversation-id` so later phases can resume from earlier disposable entities instead of recreating everything
    - partial phases now preserve their created entities; only `full` still auto-cleans in `finally`
    - the help text now documents the phased workflow explicitly
- Verification:
  - `pnpm tsx scripts/chatgpt-acceptance.ts --help`
  - `pnpm run check`
- Operational consequence:
  - on this ChatGPT account, the safe validation path is now:
    - `--phase project`
    - `--phase project-chat --project-id ...`
    - `--phase root-base`
    - `--phase root-followups --conversation-id ...`
    - `--phase cleanup --project-id ... [--conversation-id ...]`

## 2026-03-29 — Finished ChatGPT context sources/artifacts/canvas extraction

- Trigger:
  - the remaining ChatGPT context gap was real: `files[]` existed, but `sources[]` and in-chat artifacts were still missing even on conversations that clearly showed both in the live UI
  - concrete repros:
    - `69c3e6d0-3550-8325-b10e-79d946e31562` with downloadable outputs like `updated skill.zip`, `combined JSON extraction`, and `combined BibTeX extraction`
    - `69c8a0fc-c960-8333-8006-c4d6e6704e6e` with a real canvas/textdoc block
- Root cause:
  - the service/domain/cache layers already had room for `sources[]`, and I added `artifacts[]`, but the ChatGPT adapter still only scraped visible message text + sent user-turn file tiles
  - a naive in-page `fetch('/backend-api/conversation/<id>')` looked promising but turned out to return a JSON `conversation_not_found` response even when the live ChatGPT page clearly hydrated that conversation
  - the first CDP-network fallback attempt also missed because it matched any `/backend-api/conversation/<id>*` response (`stream_status`, `textdocs`, interpreter downloads) and then tried `getResponseBody(...)` too early
  - llmService then quietly fell back to previously cached context, which hid the provider failure until I called the provider directly
- Implemented:
  - `src/browser/providers/domain.ts`
    - added `ConversationArtifact`
    - extended `ConversationContext` with `artifacts?: ConversationArtifact[]`
  - `src/browser/llmService/llmService.ts`
    - normalize/preserve `artifacts[]` beside `sources[]`
  - `src/browser/llmService/cache/export.ts`
    - render `ARTIFACTS` and `SOURCES` sections in Markdown/HTML exports
  - `src/browser/providers/chatgptAdapter.ts`
    - added pure payload extractors for:
      - `extractChatgptConversationSourcesFromPayload(...)`
      - `extractChatgptConversationArtifactsFromPayload(...)`
    - file citations now normalize to synthetic `chatgpt://file/<id>` URLs with `sourceGroup`
    - downloadable assistant outputs now normalize from markdown `sandbox:/...` links
    - canvas/textdoc tool messages now normalize into `canvas` artifacts with `textdocId`, title, and captured code-preview content
    - `readConversationContext(...)` now enriches the visible DOM scrape with backend payload data
    - the reliable payload path is now:
      - try direct fetch only if it returns a successful body with real `mapping`
      - otherwise arm CDP `Network.responseReceived`
      - wait for the exact conversation route response
      - wait for `Network.loadingFinished`
      - then call `getResponseBody(...)`
      - then re-wait for the conversation surface before DOM message scraping, because the payload capture reloads the page
- Verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
  - `pnpm run check`
  - direct provider proof on `69c3e6d0-3550-8325-b10e-79d946e31562`:
    - `sourceCount = 6`
    - `artifactCount = 30`
  - live CLI proof on `69c3e6d0-3550-8325-b10e-79d946e31562`:
    - `sourceCount = 6`
    - `artifactCount = 30`
    - includes `updated skill.zip`, `combined JSON extraction`, `combined BibTeX extraction`
  - live CLI proof on `69c8a0fc-c960-8333-8006-c4d6e6704e6e`:
    - `artifactCount = 1`
    - includes canvas artifact `Probe` with `textdocId = 69c8a1018ea08191b3e3cbdb038221e4`
- Current reading of the fix:
  - ChatGPT context history is no longer just message text + sent upload tiles
  - read-only artifact/source/canvas parity is now live on the managed WSL ChatGPT path
  - the next missing ChatGPT context breadth is only whatever richer non-text artifact classes ChatGPT might surface beyond downloadable links + textdocs

## 2026-03-30 — Added first ChatGPT artifact materialization path and tightened live validation boundaries

- Trigger:
  - context classification for ChatGPT artifacts was in good shape, but the artifacts were still mostly metadata-only
  - the first useful next step was to make at least some artifact families actionable in cache/export instead of stopping at `uri` + metadata
- Implemented:
  - `src/browser/providers/types.ts`
    - added provider hook `materializeConversationArtifact(...)`
  - `src/browser/llmService/llmService.ts`
    - added `materializeConversationArtifacts(...)`
    - stores resolved files under the existing `conversation-attachments/<conversationId>/files/...` cache tree and updates the manifest through the normal cache store
  - `bin/auracall.ts`
    - added `auracall conversations artifacts fetch <conversationId> --target chatgpt`
  - `src/browser/providers/chatgptAdapter.ts`
    - added the first ChatGPT materializers:
      - `image` artifacts -> fetch live `backend-api/estuary/content?id=file_...` bytes into `.png`
      - inline `ada_visualizations` table artifacts -> scrape rendered grid rows into CSV
      - `canvas` artifacts -> write `contentText` to a local text file when that artifact is actually present in context
    - added artifact-specific readiness waits because conversation-shell readiness is not enough for image/table rendering
    - tightened image resolution so duplicate-titled images only accept an exact file-id match; title fallback is now reserved for artifacts that truly lack a file id
- Verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
  - `pnpm run check`
  - live serialized image proof:
    - `auracall conversations artifacts fetch 69bc77cf-be28-8326-8f07-88521224abeb --target chatgpt`
    - `artifactCount = 4`
    - `materializedCount = 4`
  - live serialized table proof:
    - `auracall conversations artifacts fetch bc626d18-8b2e-4121-9c4a-93abb9daed4b --target chatgpt`
    - `artifactCount = 2`
    - `materializedCount = 2`
  - live serialized markdown-download boundary proof:
    - `auracall conversations artifacts fetch 69ca9d71-1a04-8332-abe1-830d327b2a65 --target chatgpt`
    - `artifactCount = 1`
    - `materializedCount = 0`
- Important operational notes:
  - do not run multiple live ChatGPT artifact fetches in parallel against the same managed browser session; they share one active signed-in tab and interfere with each other's navigation/state
  - the previously used canvas sample `69c8a0fc-c960-8333-8006-c4d6e6704e6e` no longer reproduces a live canvas artifact on this account, so it is no longer a reliable smoke id for that path
  - the first artifact materializer slice is intentionally narrow: inline tables and image assets are real files now, but markdown-only `sandbox:/...` downloads are still metadata-only until a stable resolver exists

## 2026-03-30 — ChatGPT assistant-turn `behavior-btn` artifacts now surface in context; button-backed binary downloads are narrowed to one remaining materialization gap

- Trigger:
  - two new real chats exposed the next missing ChatGPT artifact surfaces:
    - `69caa22d-1e2c-8329-904f-808fb33a4a56` has a DOCX download button plus a live textdoc/canvas block
    - `69bded7e-4a88-8332-910f-cab6be0daf9b` has many ZIP/JSON/MD-style artifact buttons that were not present in payload extraction at all
- Implemented:
  - `src/browser/providers/chatgptAdapter.ts`
    - added DOM-side assistant-turn artifact discovery for visible `button.behavior-btn` controls, scoped to the whole assistant turn `section[data-testid^="conversation-turn-"]` rather than only the `[data-message-author-role]` node
    - added `normalizeChatgptConversationDownloadArtifactProbes(...)` plus `mergeChatgptConversationArtifacts(...)`
    - added DOM canvas/textdoc enrichment from `div[id^="textdoc-message-"]`, so canvas artifacts now fill missing `metadata.contentText` from the visible textdoc block even when backend payload metadata omits it
    - widened artifact-kind inference so DOM-side spreadsheet-ish button titles can still normalize as `spreadsheet`
    - identified the real transport for ChatGPT's inline binary download buttons: a native button click creates an `<a>` click to a signed `https://chatgpt.com/backend-api/estuary/content?id=file_...` URL
- Verification:
  - local:
    - `pnpm vitest run tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
    - `pnpm run check`
  - live context proof:
    - `auracall conversations context get 69caa22d-1e2c-8329-904f-808fb33a4a56 --target chatgpt --json-only`
      - still returns `Download the DOCX`
      - canvas `Short Document With Comments` now carries full `metadata.contentText`
    - `auracall conversations context get 69bded7e-4a88-8332-910f-cab6be0daf9b --target chatgpt --json-only`
      - now returns `artifactCount = 86`
      - includes DOM-only download artifacts like `Codebase status report`, `Machine-readable handoff JSON`, `Fresh investigation bundle`, `Turn report`, etc.
  - live transport proof:
    - direct browser probe on the DOCX chat confirmed that native clicking `Download the DOCX` produces an anchor click to:
      - `https://chatgpt.com/backend-api/estuary/content?id=file_00000000222071f5a05523dec4ce4de7...`
    - direct in-page fetch of that signed URL returned:
      - `content-type = application/vnd.openxmlformats-officedocument.wordprocessingml.document`
      - `content-disposition = attachment; filename="comment_demo.docx"`
      - bytes successfully downloaded in-page
- Current blocker:
  - resolved for the DOCX sample after one more repair:
    - the product path now waits for the delayed button, then performs the native click and signed-anchor capture in one evaluation instead of assuming capture state survives across separate CDP evals
  - current live state:
    - `auracall conversations artifacts fetch 69caa22d-1e2c-8329-904f-808fb33a4a56 --target chatgpt`
      - `artifactCount = 2`
      - `materializedCount = 2`
      - materializes both `comment_demo.docx` and `Short Document With Comments.txt`
    - DOM-only artifact discovery works on the vibe-coding chat (`artifactCount = 86`)
    - broader bundle-heavy smoke on the vibe-coding chat is still optional follow-up, not a blocker for the underlying button-backed download transport

## 2026-03-30 — Confirmed the large ChatGPT bundle chat is a poor primary smoke, but partial binary materialization now works there too

- Trigger:
  - after the DOCX + canvas path was green, I spent one serialized live pass on the large “vibe coding” chat (`69bded7e-4a88-8332-910f-cab6be0daf9b`) to check whether the same button-backed download materializer held up on a chat with many ZIP/JSON/MD outputs
- Observed:
  - the full `auracall conversations artifacts fetch ... --target chatgpt` run did not finish promptly enough to be a good routine smoke for that chat
  - however, the cache tree under `~/.auracall/cache/providers/chatgpt/ecochran76@gmail.com/conversation-attachments/69bded7e-4a88-8332-910f-cab6be0daf9b/files/` did materialize real binary/text files before I stopped the long run
  - concrete materialized examples:
    - `codebase-status-report-2026-03-20.md`
    - `codebase-status-handoff-2026-03-20.json`
    - `09-phased-development-plan.md`
- Conclusion:
  - the signed-anchor button-backed binary transport is not just a one-off DOCX fix; it also works on the larger ZIP/JSON/MD-style artifact family
  - the remaining issue on that bundle-heavy chat is smoke-test cost/noise, not absence of a working materialization path

## 2026-03-30 — Fixed noisy project-chat titles in the ChatGPT project-page conversation list

- Trigger:
  - the phased ChatGPT acceptance rerun got through project-chat create/read/rename, but failed the project-chat rename verifier because the project-page conversation list returned the row title plus preview text as one concatenated string:
    - `AC GPT PC bqeekfReply exactly with CHATGPT ACCEPT PROJECT CHAT bqeekf.`
- Root cause:
  - `scrapeChatgptConversations(...)` in `src/browser/providers/chatgptAdapter.ts` was using raw anchor text on the project page
  - for project chats, the row-menu aria label (`Open conversation options for ...`) is the cleaner title surface; the anchor text can include both title and preview snippet
- Implemented:
  - project-page conversation scraping now prefers the row-menu label over raw anchor text when deriving titles
  - `normalizeChatgptConversationLinkProbes(...)` now also prefers a shorter authoritative title when the competing title is just that same title with preview text appended
  - added a focused regression in `tests/browser/chatgptAdapter.test.ts`
- Verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
- Current live state:
  - I started a live project-chat retry and it reached the rename step cleanly, but I stopped short of spending more ChatGPT writes after the user flagged rate-limit risk
  - no active ChatGPT acceptance process is left running now

## 2026-03-30 — Tightened the ChatGPT rolling write budget again after root-base still tripped a live cooldown

- Trigger:
  - after the phased rerun got `project` and `project-chat` green, `root-base` still tripped a real ChatGPT cooldown during `renameConversation`
  - the persisted guard file showed the account had room under the old policy, so the guard was still too permissive for this account's current threshold
- Implemented:
  - lowered `CHATGPT_MUTATION_MAX_WRITES` in `src/browser/chatgptRateLimitGuard.ts` from `4` to `3` while keeping the same 2-minute rolling window
  - the intent is to force a pause before stacking `project-chat` straight into `root-base`, which is where the account hit the cooldown again
- Verification:
  - `pnpm vitest run tests/browser/chatgptRateLimitGuard.test.ts tests/browser/llmServiceRateLimit.test.ts --maxWorkers 1`
- Current live state:
  - the current persisted cooldown is still active until `2026-03-30T19:20:29Z`
  - the root-base conversation itself exists and context read is fine (`69cacafc-6d18-8326-9a4f-754d5638dbe1`), but the rename step is what hit the live cooldown

## 2026-03-30 — Fixed stale assistant reuse on existing ChatGPT conversations and re-greened the phased acceptance sweep

- Trigger:
  - after the stricter rolling write budget got `root-base` green, the first `root-followups` retry still failed on the very first `web-search` turn
  - the browser session log for `reply-exactly-with-chatgpt-accept-75` showed the run reported success with `composerTool = "web search"`, but the conversation itself never got a new turn
  - a live `browser-tools` probe on the conversation showed the blocking ChatGPT modal:
    - `Too many requests`
    - `You’re making requests too quickly. We’ve temporarily limited access to your conversations...`
  - the browser runner had incorrectly reused the old assistant answer from the previous turn (`CHATGPT ACCEPT BASE ttpopv`) as if it were the new response
- Root cause:
  - existing-conversation browser runs already carried a baseline assistant snapshot, but stale-response detection only compared the final answer text to the previous answer text in a weak way
  - if the reused stale assistant turn came back with extra prelude text like `Thought for a few seconds ...`, the detector could miss that it was still the same underlying assistant turn
  - when that happened alongside a visible ChatGPT rate-limit modal, browser mode could return a false-success answer instead of surfacing the real rate-limit failure
- Implemented:
  - `src/browser/index.ts`
    - added `shouldTreatChatgptAssistantResponseAsStale(...)`
    - existing-conversation browser runs now carry baseline assistant `messageId` / `turnId` as well as baseline text
    - stale detection now treats a reused assistant `messageId`, reused `turnId`, or a response that simply ends with the old answer text as stale
    - when a stale response is detected and no fresh turn appears, browser mode now checks for a visible ChatGPT rate-limit modal and throws that failure instead of returning the previous answer
  - `tests/browser/browserModeExports.test.ts`
    - added focused regressions for same-message-id stale reuse and “old answer with extra prelude text” reuse
- Verification:
  - local:
    - `pnpm vitest run tests/browser/browserModeExports.test.ts tests/browser/chatgptRateLimitGuard.test.ts tests/browser/llmServiceRateLimit.test.ts tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
    - `pnpm run check`
  - live phased acceptance:
    - `project` -> green on `g-p-69cac42e3728819197f969fb4afa0e84`
    - `project-chat` -> green on the same disposable project after the project-page title parser fix
    - `root-base` -> green on `69cacd3f-381c-832c-87e5-06979303a03d`
    - `root-followups` -> green on `69cacd3f-381c-832c-87e5-06979303a03d`
    - `cleanup` -> green, removing leftover root conversation `69cacafc-6d18-8326-9a4f-754d5638dbe1` and disposable project `g-p-69cac42e3728819197f969fb4afa0e84`
- Conclusion:
  - the ChatGPT browser MVP now has a clean phased non-Pro live acceptance sweep again
  - the two final fixes that mattered were:
    - project-page conversation titles must come from the row action label, not raw anchor text
    - existing-conversation browser runs must never accept the previous assistant turn as the “new” answer when ChatGPT throws a blocking rate-limit modal

## 2026-03-30 — Shifted ChatGPT into post-MVP polish mode and documented resumable acceptance

- Trigger:
  - after the phased live sweep went green, the next useful work was no longer new provider surface coverage; it was making the passing bar easier to rerun safely on a throttled account
- Implemented:
  - added `docs/dev/chatgpt-polish-plan.md` as the dedicated post-MVP checklist
  - updated `docs/testing.md` and `docs/dev/smoke-tests.md` to treat ChatGPT as MVP-complete and to recommend the resumable state-file workflow instead of manual id copy/paste between phases
  - updated `docs/dev/chatgpt-conversation-surface-plan.md` so it now serves as the historical MVP closure record, with current polish work tracked separately
  - fixed `scripts/chatgpt-acceptance.ts` state-file writes by importing `mkdir`
  - made resumed ChatGPT acceptance phases reuse the prior suffix/naming and log the previous recorded failure so the operator sees one coherent disposable run instead of a fresh suffix each time
  - removed the stray repo-root scratch artifact `undefined:/`
- Verification:
  - `pnpm tsx scripts/chatgpt-acceptance.ts --help`
  - `pnpm run check`

## 2026-03-30 — Closed the ChatGPT workbook artifact gap and added per-run artifact fetch manifests

- Trigger:
  - the remaining ChatGPT artifact-materialization hole was the workbook chat `69ca9d71-1a04-8332-abe1-830d327b2a65`
  - the artifact already classified correctly as `kind = "spreadsheet"`, but `auracall conversations artifacts fetch ... --target chatgpt` still returned `materializedCount = 0`
- Root cause:
  - the current resolver only knew how to click filename-matching assistant `button.behavior-btn` surfaces or scrape inline `ada_visualizations` tables
  - this workbook is exposed through the embedded spreadsheet card instead
  - the actual download affordance is the card's first unlabeled header button, which emits a signed `backend-api/estuary/content?id=file_...` anchor URL when clicked
- Implemented:
  - `src/browser/providers/chatgptAdapter.ts`
    - added a `sandbox:/...xlsx` spreadsheet fallback that scopes to the assistant turn containing the artifact title, finds the embedded spreadsheet card, tags its first header button, captures the signed `estuary` URL, and fetches the workbook directly
  - `src/browser/llmService/llmService.ts`
    - artifact fetches now write a sidecar `conversation-attachments/<conversationId>/artifact-fetch-manifest.json`
    - the existing `conversation-attachments/<conversationId>/manifest.json` schema stays unchanged as `FileRef[]`
    - per-artifact materialization errors now land in the sidecar manifest instead of aborting the whole fetch on the first failure
  - `bin/auracall.ts`
    - `conversations artifacts fetch` now returns/prints the sidecar manifest path
  - `tests/browser/llmServiceFiles.test.ts`
    - added coverage for the sidecar manifest path and per-artifact status recording
- Verification:
  - local:
    - `pnpm vitest run tests/browser/llmServiceFiles.test.ts tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
    - `pnpm run check`
  - live:
    - `ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts conversations artifacts fetch 69ca9d71-1a04-8332-abe1-830d327b2a65 --target chatgpt`
    - result:
      - `artifactCount = 1`
      - `materializedCount = 1`
      - materialized file `parabola_trendline_demo.xlsx`
      - manifest path `/home/ecochran76/.auracall/cache/providers/chatgpt/ecochran76@gmail.com/conversation-attachments/69ca9d71-1a04-8332-abe1-830d327b2a65/artifact-fetch-manifest.json`

## 2026-03-30 — Replaced the flat ChatGPT write guard with a weighted post-commit pacing model

- Trigger:
  - the flat persisted ChatGPT guard (`15s` minimum spacing plus `3 writes / 2 minutes`) was safer than nothing, but it still did not match the actual UI behavior well
  - the user correctly called out that short clustered actions like `... -> Rename -> Enter` are usually fine, while the bigger risk is the next refresh-heavy or mutating step after the commit lands
- Implemented:
  - `src/browser/chatgptRateLimitGuard.ts`
    - added persisted weighted mutation records (`recentMutations`) alongside the legacy timestamp array
    - added action weights so lighter commits like rename/instructions count less than create/upload/browser-send
    - added `getChatgptPostCommitQuietWaitMs(...)` so every successful write opens a post-commit quiet period before the next action
    - that quiet period now starts from the action class (`~12s` for rename/update, `~15s` for create/delete/upload, `~18s` for browser sends), adds deterministic jitter, and grows as more weighted activity accumulates in the rolling window
    - changed the rolling budget from flat write-count based to weighted-budget based
  - `src/browser/llmService/llmService.ts`
    - provider guard now applies the post-commit quiet period before follow-up actions and uses the weighted budget before the next mutation
    - added small scale/jitter override hooks so unit tests can exercise the policy without waiting real 12-18 second windows
  - `src/browser/index.ts`
    - browser-mode prompt sends now enforce the same weighted budget + post-commit quiet period and persist weighted mutation records on success/failure
- Verification:
  - `pnpm vitest run tests/browser/chatgptRateLimitGuard.test.ts tests/browser/llmServiceRateLimit.test.ts tests/browser/browserModeExports.test.ts --maxWorkers 1`
  - `pnpm run check`
- Current note:
  - I did not spend live ChatGPT writes on this guard-only refinement because it is specifically intended to reduce further throttling risk

## 2026-03-30 — Added adapter-level rate-limit dialog recovery for ChatGPT context/artifact ingestion

- Trigger:
  - the user asked for live full-context ingestion checks that include artifact retrieval and explicitly wanted Aura-Call to watch for the ChatGPT rate-limit dialog, dismiss it, then pause if detected
  - the persisted ChatGPT guard already covered browser sends and CRUD/browser-mode mutations, but the provider-level read/materialization paths for `conversations context get` and `conversations artifacts fetch` did not yet have their own visible-dialog recovery
- Implemented:
  - `src/browser/providers/chatgptAdapter.ts`
    - added visible rate-limit dialog detection across common dialog/alert/live-region roots
    - added local dialog dismissal via close-like buttons, `Escape`, and shared `closeDialog(...)`
    - wrapped `readChatgptConversationContextWithClient(...)` and `materializeChatgptConversationArtifactWithClient(...)` in one-shot recovery that:
      - dismisses a visible ChatGPT rate-limit modal when found
      - pauses about 15 seconds
      - retries once
      - then rethrows a real rate-limit failure so the persisted higher-level guard can still take over on later runs
- Verification:
  - local:
    - `pnpm vitest run tests/browser/chatgptAdapter.test.ts tests/browser/llmServiceFiles.test.ts --maxWorkers 1`
    - `pnpm run check`
  - live serialized full-context ingestion:
    - image chat `69bc77cf-be28-8326-8f07-88521224abeb`
      - context: `messages = 4`, `files = 1`, `sources = 0`, `artifacts = 4`
      - artifact fetch: `materializedCount = 4`
    - DOCX + canvas chat `69caa22d-1e2c-8329-904f-808fb33a4a56`
      - context: `messages = 4`, `files = 0`, `sources = 0`, `artifacts = 2`, `canvasArtifacts = 1`
      - artifact fetch: `materializedCount = 2`
    - workbook chat `69ca9d71-1a04-8332-abe1-830d327b2a65`
      - context: `messages = 4`, `files = 0`, `sources = 0`, `artifacts = 1`, `spreadsheetArtifacts = 1`
      - artifact fetch: `materializedCount = 1`
- Current note:
  - this serialized smoke set stayed under the ChatGPT throttle threshold, so the new adapter-level recovery path was present but did not have to fire live during these three proofs

## 2026-03-30 — Wrote the next browser-service lessons review from the ChatGPT cycle

- Trigger:
  - after the ChatGPT MVP/polish work, the user asked for a full lessons-learned review aimed at further browser-service enhancements for future browser automation tasks
- Implemented:
  - added `docs/dev/browser-service-lessons-review-2026-03-30.md`
    - split the findings into:
      - confirmed reusable mechanics that should move into `packages/browser-service/`
      - semantics that should stay provider-local
      - a concrete next extraction order
  - linked that review from:
    - `docs/dev/browser-service-upgrade-backlog.md`
    - `docs/dev/browser-service-tools.md`
    - `docs/dev/browser-automation-playbook.md`
- Main conclusions:
  - next generic extractions should focus on:
    - dialog/overlay inventory + stable scoped handles
    - blocking-surface recovery
    - native download-target capture
    - network-response capture on reload/navigation
    - profile-scoped browser operation leasing
    - row/list post-condition helpers
    - generic action-phase instrumentation
  - provider-local semantics should still own:
    - id/url normalization
    - artifact classification
    - authoritative surface choice
    - rate-limit copy/weights
    - stale-response semantics
- Verification:
  - docs review only; no code or test changes

## 2026-03-30 — Baked the first ChatGPT lessons into browser-service

- Trigger:
  - after the lessons review, the user asked to actually bake those lessons into
    the shared browser-service layer
- Implemented:
  - `packages/browser-service/src/service/ui.ts`
    - added `collectVisibleOverlayInventory(...)` so overlays/dialogs/alerts
      now have the same kind of stable tagged-handle inventory that menus
      already had
    - added `dismissOverlayRoot(...)` so shared code can dismiss one specific
      overlay root instead of closing the first visible dialog generically
    - added `withBlockingSurfaceRecovery(...)` so providers can plug in
      classifier/dismiss policy while reusing the generic
      detect/dismiss/pause/retry loop
  - `src/browser/providers/chatgptAdapter.ts`
    - moved ChatGPT context/artifact rate-limit modal recovery onto the new
      package-owned overlay inventory + blocking-surface recovery helpers
  - updated the browser-service docs/backlog/review to mark those extractions as
    completed and to keep the next follow-on order explicit
- Verification:
  - `pnpm vitest run tests/browser-service/ui.test.ts tests/browser/chatgptAdapter.test.ts tests/browser/llmServiceFiles.test.ts --maxWorkers 1`
  - `pnpm run check`

## 2026-03-31 — Fixed explicit provider target plumbing for managed browser profiles

- Trigger:
  - while preparing multi-account browser profile work, explicit ChatGPT/Grok
    operations were still vulnerable to silently reusing whatever
    `userConfig.browser.target` happened to be
- Implemented:
  - `src/browser/service/browserService.ts`
    - `BrowserService.fromConfig(...)` now accepts an explicit provider target
      and resolves its browser config/profile path against that target
    - DevTools target discovery now reuses the explicit target instead of
      falling back to the config-default service
  - `src/browser/service/portResolution.ts`
    - browser-state / managed-profile lookup now accepts an explicit service
      target so target-specific sessions do not attach to the wrong profile
  - `src/browser/client.ts`
  - `src/browser/llmService/providers/chatgptService.ts`
  - `src/browser/llmService/providers/grokService.ts`
    - all factory paths now thread the explicit provider target into
      `BrowserService.fromConfig(...)`
  - `tests/browser/browserService.test.ts`
    - added a regression test covering mixed-profile target override behavior
- Verification:
  - pending focused vitest run after code edits

## 2026-03-31 — Made WSL Linux Chrome launch resolution deterministic

- Trigger:
  - while opening the `wsl-chrome-2` managed profile for live login, launch
    behavior still depended on the shell's current `DISPLAY`, which made Linux
    Chrome look unavailable unless `DISPLAY` had already been exported
- Implemented:
  - `src/browser/config.ts`
    - added deterministic display resolution so WSL + Linux-hosted Chrome now
      resolves `display=':0.0'` by default unless `browser.display` or
      `AURACALL_BROWSER_DISPLAY` explicitly overrides it
  - `src/browser/index.ts`
    - launch logging now prints the resolved `display` and `chromePath`
      directly from config instead of reporting the shell's pre-launch
      environment
  - `tests/browser/config.test.ts`
    - added coverage for the new WSL Linux-Chrome `:0.0` default and explicit
      display override behavior
- Verification:
  - `pnpm vitest run tests/browser/config.test.ts tests/browser/browserService.test.ts tests/schema/resolver.test.ts --maxWorkers 1`

## 2026-03-31 — Wrote the browser-profile family refactor handoff plan

- Trigger:
  - after reviewing the current profile/config architecture, the next step was
    to write a clean handoff plan for a follow-on implementation agent
- Implemented:
  - added `docs/dev/browser-profile-family-refactor-plan.md`
  - added a matching roadmap entry in `ROADMAP.md`
  - captured the main architectural issues explicitly:
    - mutable cross-scope browser/service merges
    - overloaded `manualLoginProfileDir`
    - split launch defaults
    - ambiguous profile terminology in docs/config
- Verification:
  - docs-only for this step

## 2026-03-31 — ChatGPT root rename remains blocked after row-menu and commit fallback probes

- Trigger:
  - the guarded ChatGPT acceptance `root-base` phase still hung on root
    conversation rename, so I switched to direct live probing against
    conversation `69cc287c-2f0c-832b-99db-3760fa254e7a`
- Implemented:
  - updated the default local AuraCall profile to keep Chrome open for easier
    live DOM inspection (`~/.auracall/config.json`)
  - patched `src/browser/providers/chatgptAdapter.ts` so tagged sidebar-row
    rename/delete now route through `openRevealedRowMenu(...)` with
    trigger-prep plus direct-click fallback instead of the simpler
    `openAndSelectMenuItemFromTriggers(...)` row trigger
  - extended `packages/browser-service/src/service/ui.ts` with a reusable
    `submitInlineRename(..., submitStrategy: 'blur-body-click')` mode
  - taught ChatGPT rename to retry one alternate blur/click-away commit if the
    normal inline submit closes the editor without immediately applying the new
    title
- Findings:
  - direct live DOM inspection still shows the authoritative root row title as
    `CHATGPT ACCEPT BASE najfie`
  - when the inline rename editor is open, Enter-style submission can close the
    editor without changing the title
  - after the helper changes, the direct `auracall rename ... --target chatgpt`
    repro still does not return promptly and the root row title remains
    unchanged, so the issue is not solved by row-menu trigger prep alone or by
    a simple blur fallback
  - the remaining likely gap is that the edit session/commit semantics on the
    current ChatGPT root sidebar need one more level of instrumentation:
    concrete selected row/button identity, actual menu-open confirmation, and
    a post-submit proof of whether ChatGPT ever accepted the new value before
    the editor disappeared
- Verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts tests/browser-service/ui.test.ts --maxWorkers 1`
  - `pnpm run check`
  - live repro still blocked:
    - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts rename 69cc287c-2f0c-832b-99db-3760fa254e7a "AC GPT C najfie" --target chatgpt --verbose`

## 2026-03-31 — Live ChatGPT rename repro confirmed the reusable row-hover/native-enter pattern

- Trigger:
  - after direct live probing against the still-open ChatGPT tab, I retried the
    rename flow manually from the sidebar `...` row menu instead of through the
    slower full acceptance harness
- Findings:
  - the inline ChatGPT rename editor is a real text input:
    - `input[name="title-editor"]`
  - native typing into that input worked once the field was truly focused
  - one native `Enter` then committed the rename successfully
  - the full live sequence also worked when driven as:
    - hover the conversation row so the hidden row action button is present
    - click the row `...` trigger
    - click `Rename`
    - wait for `input[name="title-editor"]`
    - type natively
    - send one native `Enter`
    - verify the row text changed
  - this matches an earlier Grok lesson: hidden row controls and inline rename
    editors need a "real surface" interaction path, not just synthetic
    click/set-value assumptions
- Follow-up:
  - preserve this as a browser-service-level technique and prefer it on future
    row-local rename/delete surfaces before inventing another provider-local
    workaround

## 2026-03-31 — Implemented native inline rename entry support, but ChatGPT provider integration still has a live gap

- Implemented:
  - `packages/browser-service/src/service/ui.ts`
    - added `entryStrategy: 'native-input'` to `submitInlineRename(...)`
    - native entry now:
      - resolves the real editable input and its geometry
      - clicks/focuses it via CDP mouse events
      - selects existing text
      - clears it with native `Backspace`
      - types replacement text with `Input.insertText(...)`
      - then allows native `Enter` submit handling
  - `src/browser/providers/chatgptAdapter.ts`
    - ChatGPT root rename now targets the authoritative inline selector
      `input[name="title-editor"]`
    - switched ChatGPT rename submits onto native input + native Enter instead
      of the older setter/synthetic path
  - `tests/browser-service/ui.test.ts`
    - added coverage for native inline typing before native Enter submit
- Verification:
  - `pnpm vitest run tests/browser-service/ui.test.ts tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
- Live status:
  - direct manual/scripted browser repro still succeeds with the known good
    sequence
  - but repeated live `pnpm tsx bin/auracall.ts rename ... --target chatgpt`
    repros still do not apply the requested new title, and the CLI remains
    stuck longer than expected after starting the rename
  - so the remaining issue is now specifically provider-path orchestration or
    verification around that live helper sequence, not the basic DOM mechanics

## 2026-03-31 — ChatGPT root rename now succeeds live through the provider path, but the command still hangs after success

- Implemented:
  - added an exact conversation-link row resolver for ChatGPT root rename so
    the provider no longer depends on the older score/document-title-based row
    tagger on this path
  - replaced the root rename interaction with the live-proven direct sequence:
    - resolve the exact row by conversation id
    - hover the row
    - pointer-click the row `...`
    - pointer-click `Rename`
    - wait for edit mode
    - type natively and press `Enter`
- Verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts tests/browser-service/ui.test.ts --maxWorkers 1`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - live DOM verification after provider rename:
    - conversation `69cc287c-2f0c-832b-99db-3760fa254e7a`
    - requested title `AC GPT C najfie provider-7`
    - sidebar row text updated successfully to `AC GPT C najfie provider-7`
- Remaining issue:
  - the top-level `auracall rename ... --target chatgpt` command still did not
    return promptly after the rename had already succeeded in the UI
  - that is now a separate post-success lifecycle/cleanup bug, not a rename
    interaction bug

## 2026-03-31 — ChatGPT project conversation rename/delete now use the exact-row path too

- Focus: carry the root-chat exact-row repair over to project-scoped
  conversations without reintroducing the older score-based row picker
- Implemented:
  - updated `src/browser/providers/chatgptAdapter.ts` so
    `tagChatgptConversationRowExact(...)` accepts an optional `projectId`
  - when `projectId` is present, the exact resolver now scopes itself to the
    visible project `Chats` `tabpanel` first and only matches anchors whose
    parsed route project id equals the normalized project id
  - switched ChatGPT project rename/delete callers onto that exact resolver, so
    project row actions now follow the same interaction model as root:
    exact conversation anchor -> row hover -> pointer menu -> rename/delete
- Verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts tests/browser-service/ui.test.ts --maxWorkers 1`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - live project smoke on disposable project
    `g-p-69cc275fdfac8191be921387165ca803`
    - created project conversation `69cc7121-eca0-832c-ab8a-9dde700e87d7`
    - `auracall rename ... --project-id ... --target chatgpt` returned
      `Renamed successfully.`
    - `auracall delete ... --project-id ... --target chatgpt --yes` returned
      `Deleted successfully.` and `Conversation cache refreshed.`
    - fresh `auracall conversations --project-id ... --target chatgpt --refresh`
      returned `[]`
- Remaining note:
  - project-conversation rename verification is still noisier than the root
    path: an immediate follow-up project conversation list read briefly returned
    the row title as `ChatGPT`, and another refresh returned `[]` while the live
    tab was still on the project conversation URL
  - the row-action CRUD path itself appears healthy now; the next likely cleanup
    target is project conversation list/read consistency on the project `Chats`
    panel

## 2026-03-31 — ChatGPT project conversation list/read now trusts the real project Chats panel

- Focus: repair project-scoped conversation listing after rename/delete so it
  reflects the real project `Chats` panel instead of oscillating between `[]`
  and placeholder titles
- Findings:
  - live project page DOM on
    `https://chatgpt.com/g/g-p-69cc275fdfac8191be921387165ca803/project`
    showed the authoritative shape:
    - `[role="tab"]` entries `Chats` and `Sources`
    - one `[role="tabpanel"]`
    - one project conversation row as `li.group/project-item`
    - a relative conversation anchor whose raw text concatenated title + preview
      (`AC GPT PC title fixedReply exactly with: ...`)
    - the clean title lived in the shortest leaf text inside that row
  - the list/read bug had two causes:
    - browser-evaluated expressions still referenced package constants like
      `CHATGPT_PROJECT_TAB_CHATS_LABEL` and
      `CHATGPT_CONVERSATION_OPTIONS_PREFIX` directly instead of interpolating
      literals, so the page-side predicates silently failed
    - the project conversation title extractor trusted generic or concatenated
      anchor/button text instead of the concrete shortest row leaf title
- Implemented:
  - fixed `buildProjectChatsReadyExpression(...)` to interpolate the expected
    `Chats` label into the page expression
  - fixed the project conversation scraper expression to interpolate the
    conversation-options prefix instead of referencing the TS constant directly
  - added a project `Chats` surface-open step before scraping project
    conversations
  - tightened project row title extraction so the scraper prefers the shortest
    concrete leaf text from the row and ignores generic placeholders like
    `ChatGPT` / `New chat`
  - hardened `normalizeChatgptConversationLinkProbes(...)` so generic
    placeholder titles do not overwrite real titles
- Verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts tests/browser-service/ui.test.ts --maxWorkers 1`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - live project list/read proof on project
    `g-p-69cc275fdfac8191be921387165ca803`
    - project conversation `69cc7d43-acc0-832f-b1c2-5486459b4825` renamed to
      `AC GPT PC title fixed`
    - fresh `auracall conversations --project-id ... --target chatgpt --refresh`
      returned that exact titled row
    - deleting that conversation succeeded, and a fresh project conversation
      list returned `[]`

## 2026-03-31 — ChatGPT phased acceptance is green again after project-delete cleanup recovery

- Focus: close the last acceptance blocker after `project-chat`, `root-base`,
  and `root-followups` were already green
- Findings:
  - the only remaining failing phase was `cleanup`
  - `projects remove ... --target chatgpt` is split across two provider calls:
    `selectRemoveProjectItem(...)` then `pushProjectRemoveConfirmation(...)`
  - the project delete confirmation dialog did not survive across those two
    separate provider sessions, so `pushProjectRemoveConfirmation(...)` could
    reconnect onto the project page with no confirmation dialog present
  - `buildProjectDeleteConfirmationExpression()` also had the same
    browser-expression constant interpolation bug as the earlier project `Chats`
    fixes
- Implemented:
  - fixed `buildProjectDeleteConfirmationExpression()` to interpolate the
    expected delete-dialog label into the browser-evaluated expression
  - updated `pushProjectRemoveConfirmation(...)` so if the confirmation dialog
    is missing after reconnect, it reopens project settings, presses
    `Delete project`, waits for the confirmation dialog again, then confirms
- Verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts tests/browser-service/ui.test.ts --maxWorkers 1`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - phased live acceptance rerun:
    - `project-chat` PASS
    - `root-base` PASS
    - `root-followups` PASS
    - `cleanup` PASS

## 2026-04-01 — ChatGPT row-action/menu and project-delete confirmation now have tighter local structure

- Focus: reduce the chance that the recent ChatGPT repairs drift apart again
  before the next browser-service extraction pass
- Implemented:
  - extracted the repeated exact-row hover -> trigger -> menu-item pointer-click
    sequence into one local helper,
    `openChatgptTaggedConversationMenuItem(...)`, and rewired both the root/project
    rename and delete openers to use it
  - added a pure matcher,
    `matchesChatgptProjectDeleteConfirmationProbe(...)`, and focused tests for
    the project delete confirmation shape so the split remove-confirm cleanup
    bug has direct unit coverage in addition to the live acceptance proof
- Verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts tests/browser-service/ui.test.ts --maxWorkers 1`
  - `pnpm exec tsc -p tsconfig.json --noEmit`

## 2026-04-01 — Fresh-state ChatGPT acceptance sweep is green

- Focus: confirm the repaired ChatGPT browser path does not depend on warm
  browser/session state from earlier phased runs
- Implemented:
  - ran `scripts/chatgpt-acceptance.ts` from a new state file:
    `docs/dev/tmp/chatgpt-fresh-state.json`
  - let the sweep execute end to end from a cold acceptance state across:
    project CRUD, project conversation CRUD, root conversation CRUD, root
    followups/files, and final cleanup/project removal
- Verification:
  - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx scripts/chatgpt-acceptance.ts --state-file docs/dev/tmp/chatgpt-fresh-state.json --command-timeout-ms 900000`
  - result: `PASS (full)`

## 2026-04-01 — Browser-service now owns revealed row-menu item selection

- Focus: move the now-stable ChatGPT row-action mechanics down into
  `packages/browser-service/` without moving provider-specific row resolution
- Implemented:
  - added package-owned `openAndSelectRevealedRowMenuItem(...)` to combine:
    hover-reveal row, open the row menu from a specific trigger, and pointer-
    select a specific menu item
  - rewired the ChatGPT exact-row rename/delete opener to use that helper while
    keeping the exact conversation-row resolver and post-condition waits inside
    the adapter
- Verification:
  - `pnpm vitest run tests/browser-service/ui.test.ts tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
  - `pnpm exec tsc -p tsconfig.json --noEmit`

## 2026-04-01 — Browser-service now owns anchored row-action diagnostics

- Focus: replace repeated provider-local row/menu/editor/dialog state collectors
  with one package-owned diagnostic shape
- Implemented:
  - added `collectAnchoredActionDiagnostics(...)` to
    `packages/browser-service/src/service/ui.ts`
  - rewired the ChatGPT exact-row rename/delete diagnostics collectors to use
    the new helper instead of three local `Runtime.evaluate(...)` snapshots
    plus ad hoc menu/overlay inventory stitching
- Verification:
  - `pnpm vitest run tests/browser-service/ui.test.ts tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
  - `pnpm exec tsc -p tsconfig.json --noEmit`

## 2026-04-01 — Browser-service now owns anchored action-phase failure wrapping

- Focus: stop making adapters manually stitch anchored diagnostics onto every
  `{ ok: false }` branch in row/menu/editor flows
- Implemented:
  - added `withAnchoredActionDiagnostics(...)` to
    `packages/browser-service/src/service/ui.ts`
  - the helper now attaches `collectAnchoredActionDiagnostics(...)` output to
    false-result objects and to thrown errors for anchored row-action phases
  - rewired the ChatGPT exact-row menu / rename-editor / delete-confirmation
    helpers to use the wrapper instead of provider-local `collectDiagnostics`
    callbacks
- Verification:
  - `pnpm vitest run tests/browser-service/ui.test.ts tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
  - `pnpm exec tsc -p tsconfig.json --noEmit`

## 2026-04-01 — ChatGPT hardening plan started with transient/blocking-state classification

- Focus: shift from happy-path ChatGPT CRUD/history work to hostile-state
  recovery for bad chat state, connection failures, retry affordances, and
  transient error surfaces
- Implemented:
  - wrote `docs/dev/chatgpt-hardening-plan.md` as the dedicated reliability
    plan for post-MVP ChatGPT bad-state handling
  - added pure ChatGPT blocking-surface classification helpers in
    `chatgptAdapter.ts` for:
    - rate limit
    - connection failure
    - retry affordance
    - generic transient error
  - expanded the existing ChatGPT read/materialization recovery hook so it now
    inspects visible overlays and retry-affordance buttons, not only the
    rate-limit modal
  - broadened retryability classification in the llmservice ChatGPT path to
    treat known transient connection/error strings as retryable
- Verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
  - `pnpm exec tsc -p tsconfig.json --noEmit`

- Follow-up implementation:
  - generalized the old rate-limit-only read/materialization wrapper into
    `withChatgptBlockingSurfaceRecovery(...)`
  - visible `connection-failed`, `retry-affordance`, and generic transient
    blocking surfaces now trigger a reload-based recovery attempt for the
    wrapped read/materialization path instead of a no-op dismiss
  - kept visible rate-limit dialogs on the existing dismiss-and-pause path
- Additional verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts tests/browser/llmServiceRateLimit.test.ts --maxWorkers 1`
  - `pnpm exec tsc -p tsconfig.json --noEmit`

- Next hardening slice:
  - `scrapeChatgptConversations(...)` now also runs under
    `withChatgptBlockingSurfaceRecovery(...)`, so root/project conversation
    list reads get the same reload-based recovery treatment as context/artifact
    reads when ChatGPT is visibly in a transient bad state
  - browser-mode stale-assistant rejection in `src/browser/index.ts` now checks
    for any classified visible ChatGPT blocking surface, not only the rate-limit
    modal, before surfacing the stale-response failure
- Additional verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts tests/browser/llmServiceRateLimit.test.ts tests/browser/browserModeExports.test.ts --maxWorkers 1`
  - `pnpm exec tsc -p tsconfig.json --noEmit`

- Policy correction:
  - browser-mode stale-response handling now distinguishes visible ChatGPT
    `retry-affordance`, `connection-failed`, and `transient-error` states from
    true `rate-limit`
  - only `rate-limit` is allowed to feed the persisted cooldown guard path
  - other visible broken-chat states now surface operation-specific stale-send
    errors instead of being misinterpreted as cooldowns

## 2026-04-01 — ChatGPT send-path hardening now logs unexpected states for post-mortems

- Focus: make stale-send and broken-turn failures easier to diagnose in
  development mode without weakening the current "never auto-click retry" rule
- Implemented:
  - added `logStructuredDebugEvent(...)` to `src/browser/domDebug.ts` so
    verbose/dev browser runs can emit structured JSON-style failure context to
    both the live logger and session log
  - extended browser-mode visible ChatGPT bad-state probes to preserve extra
    source/probe details alongside `kind + summary`
  - updated stale-send handling in `src/browser/index.ts` so visible
    `retry-affordance` states now log:
    - classified bad-state details
    - explicit `fail-fast-no-auto-retry-click` policy
    - baseline/answer message ids and turn ids when available
    - a recent conversation snapshot
  - added equivalent structured logging when stale-send failure occurs without a
    visible classified surface, so post-mortems still have route-turn context
  - made the operator-facing retry/regenerate error explicit that auto-click is
    intentionally disabled
- Verification:
  - `pnpm vitest run tests/browser/domDebug.test.ts tests/browser/browserModeExports.test.ts tests/browser/chatgptAdapter.test.ts tests/browser/llmServiceRateLimit.test.ts --maxWorkers 1`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
- Next:
  - extend the same structured logging to read/list recovery paths so classified
    reload/reopen recoveries are visible in dev-mode post-mortems too
  - the dev-mode snapshot is now richer than the earlier simple turn-only log:
    it captures route/title/readiness, active element, visible overlays,
    retry buttons, and recent turns in one machine-readable `Browser
    postmortem (...)` record in the session log

## 2026-04-01 — ChatGPT read/recovery paths now persist bounded post-mortem bundles

- Focus: make non-send ChatGPT recoveries leave the same kind of durable
  post-mortem evidence as send-path failures
- Implemented:
  - added reusable browser-postmortem capture/persist helpers in
    `src/browser/domDebug.ts`
  - ChatGPT `withChatgptBlockingSurfaceRecovery(...)` now writes bounded JSON
    post-mortem bundles under `~/.auracall/postmortems/browser/` when debug is
    enabled
  - wired that persistence into:
    - conversation list recovery
    - conversation context reads
    - conversation file reads
    - artifact materialization
  - the persisted payload includes the classified blocking surface, current
    browser snapshot, action label, phase (`pre` / `post` / `error` /
    `final-error`), and relevant ids such as conversation/project/artifact
- Verification:
  - `pnpm vitest run tests/browser/domDebug.test.ts tests/browser/chatgptAdapter.test.ts tests/browser/browserModeExports.test.ts tests/browser/llmServiceRateLimit.test.ts --maxWorkers 1`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
- Next:
  - capture the specific recovery action/outcome in the same persisted bundle so
    later clustering can distinguish reload-vs-dismiss-vs-reopen recoveries
  - the persisted bundle now includes the currently implemented recovery action
    and outcome (`reload-page`, `dismiss-overlay`, `close-dialog`); the next
    missing piece is a true conversation re-open recovery path where warranted

## 2026-04-01 — ChatGPT read recovery now re-anchors once to authoritative surfaces

- Focus: stop relying on reload/dismiss alone when a ChatGPT read surface is in
  a classified bad state
- Implemented:
  - extended `withChatgptBlockingSurfaceRecovery(...)` to support one bounded
    re-anchor callback after the current dismiss/reload step
  - wired read surfaces to use authoritative reopen steps:
    - `reopen-list` for conversation list refresh
    - `reopen-conversation` for context reads, conversation file reads, and
      artifact materialization
  - persisted post-mortem bundles now capture the full recovery sequence rather
    than a single action
- Verification:
  - `pnpm vitest run tests/browser/domDebug.test.ts tests/browser/chatgptAdapter.test.ts tests/browser/browserModeExports.test.ts tests/browser/llmServiceRateLimit.test.ts --maxWorkers 1`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
- Next:
  - exercise these hostile-state recoveries live so the new reopen steps are
    proven against real ChatGPT failure surfaces, not only unit/regression code

## 2026-04-01 — Live hostile-state validation for ChatGPT read recovery is green

- Focus: prove the new bounded recovery path against a real signed-in ChatGPT
  browser, not just unit coverage
- Implemented:
  - injected a visible transient-error `[role="alert"]` overlay into the live
    managed ChatGPT tab on port `45011`
  - validated root conversation list recovery with:
    - `CHATGPT_DEVTOOLS_TRACE=1 ... auracall conversations --target chatgpt --refresh`
    - persisted post-mortem:
      - `transient-error`
      - `reload-page`
      - `reopen-list`
    - command still returned the refreshed conversation list successfully
  - validated conversation context recovery with:
    - `CHATGPT_DEVTOOLS_TRACE=1 ... auracall conversations context get 69bc77cf-be28-8326-8f07-88521224abeb --target chatgpt --json-only`
    - persisted post-mortem:
      - `transient-error`
      - `reload-page`
      - `reopen-conversation`
    - command still returned a valid context payload (`messages = 4`)
- Verification:
  - live only; the post-mortem artifacts written under
    `~/.auracall/postmortems/browser/` were:
    - `2026-04-01T15-52-55-478Z-chatgpt-list-conversations-pre.json`
    - `2026-04-01T15-54-04-699Z-chatgpt-read-conversation-context-pre.json`
- Next:
  - extend live hostile-state validation to at least one more read surface
    (`conversations files list` or `artifacts fetch`) and then shift to real
    retry-affordance / connection-failed cases when available

## 2026-04-01 — Live ChatGPT retry-affordance and connection-failed recovery are green

- Focus: prove the remaining classified read-side bad states, not just generic
  transient overlays
- Implemented:
  - synthetic-on-real retry-affordance validation on live conversation
    `69bc77cf-be28-8326-8f07-88521224abeb`
    - injected visible `Retry` control with nearby `Server connection failed`
      text
    - ran
      `CHATGPT_DEVTOOLS_TRACE=1 ... auracall conversations context get 69bc77cf-be28-8326-8f07-88521224abeb --target chatgpt --json-only`
    - persisted post-mortem:
      - `kind = retry-affordance`
      - `reload-page`
      - `reopen-conversation`
    - command still returned a valid payload (`messages = 4`)
  - synthetic-on-real connection-failed validation on the same live
    conversation
    - injected visible `Server connection failed...` alert without retry button
    - ran
      `CHATGPT_DEVTOOLS_TRACE=1 ... auracall conversations files list 69bc77cf-be28-8326-8f07-88521224abeb --target chatgpt`
    - persisted post-mortem:
      - `kind = connection-failed`
      - `reload-page`
      - `reopen-conversation`
    - command still returned the expected conversation file list
- Verification:
  - live post-mortem artifacts:
    - `2026-04-01T15-58-22-987Z-chatgpt-read-conversation-context-pre.json`
    - `2026-04-01T15-59-11-069Z-chatgpt-list-conversation-files-pre.json`
- Next:
  - the remaining meaningful live target is a real organically occurring broken
    turn or connection-failed state, but the classified recovery matrix itself
    is now exercised across the main read surfaces

## 2026-04-01 — ChatGPT send-side bad states now persist bounded post-mortems too

- Focus: align stale-send failure handling with the newer read-side
  post-mortem store
- Implemented:
  - `logChatgptUnexpectedState(...)` in `src/browser/index.ts` now persists a
    bounded JSON post-mortem bundle under `~/.auracall/postmortems/browser/`
    when debug/verbose mode is active
  - send-side bundles include:
    - `mode = send`
    - classified surface details
    - browser snapshot
    - send-policy metadata such as `fail-fast-no-auto-retry-click`
  - added focused unit coverage in
    `tests/browser/browserModeExports.test.ts`
- Verification:
  - `pnpm vitest run tests/browser/browserModeExports.test.ts tests/browser/domDebug.test.ts tests/browser/chatgptAdapter.test.ts tests/browser/llmServiceRateLimit.test.ts --maxWorkers 1`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
- Next:
  - if we want a final live proof on the send path, we need a controlled stale
    send repro on a disposable conversation so the persisted send post-mortem
    can be inspected the same way as the read-side cases

## 2026-04-01 — Pivoted back to the roadmap with manifest-core hardening

- Focus: resume the next roadmap item from `docs/dev/next-execution-plan.md`
  instead of continuing ChatGPT-specific hardening past the current green bar
- Decision:
  - the highest-confidence next item remains Slice 1,
    service-volatility extraction completion
  - the first bounded follow-up is manifest-core hardening, not the
    browser-profile-family refactor yet
- Implemented:
  - tightened `src/services/manifest.ts` so the checked-in services manifest is
    no longer "typed plus passthrough"
  - added explicit route keys already in real use but previously accepted only
    through permissive parsing:
    - `app`
    - `files`
    - `projectIndex`
    - `projectConversations`
  - switched the manifest section schemas and the top-level manifest schema to
    strict validation so unexpected route keys/sections now fail fast
  - added focused regression coverage in `tests/services/registry.test.ts` for:
    - unexpected route keys
    - unexpected service sections
- Verification:
  - `pnpm vitest run tests/services/registry.test.ts tests/browser/chatgptProvider.test.ts tests/browser/chatgptAdapter.test.ts tests/browser/chatgptComposerTool.test.ts --maxWorkers 1`
  - `pnpm run check`
- Next:
  - continue the same Slice 1 track by identifying the remaining low-risk
    ChatGPT manifest-owned static fields that are still only implicitly typed or
    still duplicated in code
  - keep the browser-profile-family refactor as the next major planned item
    after the service-volatility pilot is in a cleaner finished state

## 2026-04-01 — Bundled route/host ownership now reads directly from the manifest

- Focus: remove duplicated fallback literals from the main route/host consumers
  for manifest-owned static service data
- Implemented:
  - added required bundled registry helpers in `src/services/registry.ts` for:
    - `requireBundledServiceBaseUrl(...)`
    - `requireBundledServiceCompatibleHosts(...)`
    - `requireBundledServiceCookieOrigins(...)`
    - `requireBundledServiceRouteTemplate(...)`
  - cut the main static route/host consumers over to those helpers:
    - `src/browser/constants.ts`
    - `src/browser/urlFamilies.ts`
    - `src/browser/providers/chatgpt.ts`
    - `src/browser/providers/chatgptAdapter.ts`
    - `src/browser/providers/grokAdapter.ts`
  - added focused registry coverage proving the bundled manifest now acts as the
    authoritative source for those required fields
- Verification:
  - `pnpm vitest run tests/services/registry.test.ts tests/browser/chatgptProvider.test.ts tests/browser/chatgptAdapter.test.ts tests/browser/chatgptComposerTool.test.ts tests/browser/grokAdapter.test.ts --maxWorkers 1`
  - `pnpm run check`
- Next:
  - inspect the remaining ChatGPT low-risk manifest pilot fields for any other
    duplicated static defaults, especially model-label/browser-normalization
    ownership and any still-implicit config compatibility shims
  - once that surface is materially clean, move on to the browser-profile-family
    refactor as the next roadmap initiative


## 2026-04-01 — Browser model labels now resolve from the bundled manifest

- Focus: remove the remaining duplicated browser-label table from
  `src/cli/browserConfig.ts` where the bundled services manifest already owns
  the ChatGPT/Gemini/Grok picker labels
- Implemented:
  - added `requireBundledServiceModelLabel(...)` in
    `src/services/registry.ts`
  - rewired `mapModelToBrowserLabel(...)` in
    `src/cli/browserConfig.ts` to use required bundled manifest labels for all
    inferred browser services
  - removed the local fallback browser-label table for manifest-owned service
    models while keeping the existing model-normalization behavior in code
  - added focused coverage in:
    - `tests/services/registry.test.ts`
    - `tests/cli/browserConfig.test.ts`
- Verification:
  - `pnpm vitest run tests/services/registry.test.ts tests/cli/browserConfig.test.ts tests/browser/chatgptProvider.test.ts tests/browser/chatgptAdapter.test.ts tests/browser/chatgptComposerTool.test.ts tests/browser/grokAdapter.test.ts --maxWorkers 1`
  - `pnpm run check`
- Next:
  - do one more pass for any remaining duplicated low-risk static defaults in
    the ChatGPT manifest pilot surface
  - if that pass is thin, stop the pilot there and pivot to the browser-profile-family refactor

## 2026-04-01 — ChatGPT composer tool labels now read directly from the manifest

- Focus: remove the last worthwhile duplicated static ChatGPT composer-label
  defaults from the low-risk manifest pilot surface
- Implemented:
  - rewired `src/browser/actions/chatgptComposerTool.ts` to consume the
    manifest-owned composer aliases and label sets directly with empty
    fallbacks instead of repeating a local static dictionary/list bundle
  - this keeps workflow behavior unchanged while making the checked-in
    manifest the clear owner of the current ChatGPT composer vocabulary
- Verification:
  - `pnpm vitest run tests/services/registry.test.ts tests/cli/browserConfig.test.ts tests/browser/chatgptComposerTool.test.ts tests/browser/chatgptProvider.test.ts tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
  - `pnpm run check`
- Assessment:
  - the remaining ChatGPT manifest-pilot cleanup now looks thin enough that
    the low-risk pilot can reasonably stop here
  - the next main roadmap item should be the browser-profile-family refactor

## 2026-04-01 — Browser-profile-family refactor Slice 1 started with typed resolved objects

- Focus: begin the refactor with a non-breaking seam instead of rewiring the
  current mutable browser merge flow in one step
- Implemented:
  - added `src/browser/service/profileResolution.ts`
  - introduced typed resolved objects for:
    - profile family
    - browser family
    - service binding
    - browser launch profile
  - added `resolveBrowserProfileResolution(...)` as a pure helper over the
    current merge shape so later slices can replace generic record mutation
    incrementally
  - added focused coverage in `tests/browser/profileResolution.test.ts`
- Verification:
  - `pnpm vitest run tests/browser/profileResolution.test.ts tests/schema/resolver.test.ts tests/cli/browserConfig.test.ts --maxWorkers 1`
  - `pnpm run check`
- Next:
  - wire one light runtime integration point to consume the new typed
    resolved-object seam
  - then move on to extracting the browser-family resolver out of the current
    `applyBrowserProfileOverrides(...)` path

## 2026-04-01 — Profile-family Slice 1 now feeds one real runtime path

- Focus: move beyond a pure seam and prove the typed resolution objects can
  drive a real part of the current config flow without behavior drift
- Implemented:
  - rewired `src/browser/service/profileConfig.ts` to use
    `resolveBrowserProfileResolution(...)` for:
    - selected/default service resolution
    - service URL layering
    - service-scoped browser defaults such as project/conversation ids,
      model strategy, thinking time, composer tool, and manual-login fields
  - added focused runtime coverage in
    `tests/browser/profileConfig.test.ts`
  - corrected the typed resolution seam so explicit CLI/browser target
    selection wins over the profile default service
- Verification:
  - `pnpm vitest run tests/browser/profileResolution.test.ts tests/browser/profileConfig.test.ts tests/schema/resolver.test.ts tests/cli/browserConfig.test.ts --maxWorkers 1`
  - `pnpm run check`
- Next:
  - extract browser-family resolution out of the current
    `applyBrowserProfileOverrides(...)` path
  - keep launch-plan consumption for a later slice once browser-family and
    service-binding resolution are both explicit

## 2026-04-01 — Profile-family Slice 2 starts extracting browser-family defaults

- Focus: move browser-family-owned defaults out of ad hoc profile-browser
  mutation and onto the typed resolution seam
- Implemented:
  - rewired `src/browser/service/profileConfig.ts` so
    `applyBrowserProfileDefaults(...)` now uses the typed
    `ResolvedBrowserFamily` layer for:
    - chrome path
    - display
    - managed profile root
    - blocking profile action
    - source profile name
    - source/bootstrap cookie paths
    - debug port
    - debug port strategy
    - WSL Chrome preference
    - service/blank tab limits
    - disposable-window collapsing
  - kept service-owned manual-login selection in the service-binding phase
    instead of letting browser-family fallback claim it too early
  - pinned the runtime precedence in `tests/browser/profileConfig.test.ts`
    so explicit browser target still beats profile default service while
    browser-family defaults still override generic browser defaults
- Verification:
  - `pnpm vitest run tests/browser/profileResolution.test.ts tests/browser/profileConfig.test.ts tests/schema/resolver.test.ts tests/cli/browserConfig.test.ts --maxWorkers 1`
  - `pnpm run check`
- Next:
  - continue Slice 2 by making browser-family resolution more explicit inside
    the surrounding config flow, then decide whether the launch-profile seam is
    ready for a first real consumer

## 2026-04-01 — Profile-family Slice 2 now also owns debug-port-range and cache defaults

- Focus: remove two remaining raw profile reads from `profileConfig.ts` so
  the typed seam covers more of the current layering behavior
- Implemented:
  - rewired `applyBrowserProfileOverrides(...)` to source
    `debugPortRange` from `ResolvedBrowserFamily`
  - rewired cache default application to use
    `ResolvedProfileFamily.cacheDefaults` instead of reading raw
    `profile.cache`
  - extended `tests/browser/profileConfig.test.ts` to pin the
    debug-port-range and cache-default behavior
- Verification:
  - `pnpm vitest run tests/browser/profileResolution.test.ts tests/browser/profileConfig.test.ts tests/schema/resolver.test.ts tests/cli/browserConfig.test.ts --maxWorkers 1`
  - `pnpm run check`
- Next:
  - decide whether the next slice should start first real launch-profile
    consumption or continue pulling residual browser/profile layering out of
    the legacy mutable config path

## 2026-04-01 — Profile-family Slice 3 adds first real launch-profile consumers

- Focus: move one real runtime path from ad hoc browser/profile reconstruction to
  the typed launch-profile seam before attempting a larger launch/config refactor
- Implemented:
  - added `resolveBrowserProfileResolutionFromResolvedConfig(...)` in
    `src/browser/service/profileResolution.ts` for the already-resolved
    config/runtime path
  - taught that helper to derive a target-scoped managed profile dir from
    `managedProfileRoot + auracallProfile + target` when a flattened config
    does not carry a raw `manualLoginProfileDir`
  - rewired:
    - `src/browser/service/portResolution.ts`
    - `src/browser/service/browserService.ts`
    so the DevTools attach/list target path now reads launch-owned fields from
    the typed launch profile instead of rebuilding them locally
  - added regression coverage proving:
    - flattened launch-profile derivation keeps target-scoped managed profile
      paths
    - `BrowserService.resolveServiceTarget(...)` uses the requested service
      launch profile when scanning fallback tabs
- Verification:
  - `pnpm vitest run tests/browser/profileResolution.test.ts tests/browser/profileConfig.test.ts tests/browser/browserService.test.ts tests/schema/resolver.test.ts tests/cli/browserConfig.test.ts --maxWorkers 1`
  - `pnpm run check`
- Next:
  - decide whether the next consumer should be `resolveBrowserConfig(...)`
    itself or the surrounding browser doctor/login bootstrap paths
  - bias toward the smallest path that removes another round of local
    launch-profile reconstruction

## 2026-04-01 — Profile-family Slice 3 now feeds resolveBrowserConfig too

- Focus: make the typed launch-profile seam influence the final resolved browser
  config, not just attach/list-target paths
- Implemented:
  - rewired `src/browser/config.ts` so launch-owned output fields are now
    projected through `resolveBrowserProfileResolutionFromResolvedConfig(...)`
    after environment/discovery normalization
  - current launch-owned fields now read from the typed launch profile in the
    final resolved config path:
    - chrome path
    - display
    - chrome profile
    - runtime/bootstrap cookie paths
    - managed profile root
    - debug port
    - debug-port strategy
    - remote Chrome target
    - keep/headless/hide-window toggles
    - manual-login flag/profile dir
    - WSL Chrome preference
    - service/blank tab limits
    - disposable-window collapsing
    - blocking profile action
  - added a regression in `tests/browser/config.test.ts` proving
    `manualLogin: false` still keeps `manualLoginProfileDir = null`
- Verification:
  - `pnpm vitest run tests/browser/config.test.ts tests/browser/profileResolution.test.ts tests/browser/profileConfig.test.ts tests/browser/browserService.test.ts tests/schema/resolver.test.ts tests/cli/browserConfig.test.ts --maxWorkers 1`
  - `pnpm run check`
- Next:
  - the remaining local ownership in `resolveBrowserConfig(...)` is mostly
    environment/discovery normalization, URL/model semantics, and platform
    heuristics
  - the next clean target is either the browser doctor/login bootstrap path or
    a tighter type cleanup in `profileResolution.ts` so launch/browser fields
    stop flowing around as generic strings

## 2026-04-01 — Profile-family type cleanup removes the remaining launch-profile casts

- Focus: tighten the typed seam so launch/browser consumers no longer need to
  cast generic strings back into browser config unions
- Implemented:
  - `src/browser/service/profileResolution.ts` now models:
    - `debugPortStrategy` as `DebugPortStrategy`
    - `blockingProfileAction` as the real resolved browser-config union
  - added explicit parsers for those fields instead of treating them as generic
    strings
  - removed the remaining runtime consumer casts in:
    - `src/browser/config.ts`
    - `src/browser/service/portResolution.ts`
  - corrected a stale invalid test fixture in
    `tests/browser/profileConfig.test.ts`:
    `blockingProfileAction: 'reuse'` was never part of the schema and is now
    pinned to a real supported value
- Verification:
  - `pnpm vitest run tests/browser/config.test.ts tests/browser/profileResolution.test.ts tests/browser/profileConfig.test.ts tests/browser/browserService.test.ts tests/schema/resolver.test.ts tests/cli/browserConfig.test.ts --maxWorkers 1`
  - `pnpm run check`
- Next:
  - the remaining worthwhile refactor work is less about typing and more about
    ownership boundaries:
    - either move browser doctor/login bootstrap to the same resolved launch
      profile
    - or cut a checkpoint and reassess the next roadmap slice

## 2026-04-01 — Profile-family bootstrap seam now covers doctor and login prep

- Focus: move the remaining browser-profile bootstrap/readiness prep off local
  ad hoc reconstruction and onto the same resolved launch/profile boundary
- Implemented:
  - rewired `src/browser/profileDoctor.ts` so doctor state now derives:
    - managed profile root
    - managed profile dir
    - chrome profile
    - preferred bootstrap/source cookie path
    from the resolved launch profile, while still running the final
    `resolveManagedProfileDir(...)` guard to ignore stale inherited managed
    profile dirs from another Aura-Call profile
  - added `resolveBrowserLoginOptionsFromUserConfig(...)` in
    `src/browser/login.ts`
  - the new login-prep helper now derives launch/login inputs from the same
    resolved launch profile and also applies the same stale-inherited-profile
    guard before handing back `manualLoginProfileDir`
  - added focused coverage in `tests/browser/login.test.ts`
- Verification:
  - `pnpm vitest run tests/browser/profileDoctor.test.ts tests/browser/login.test.ts tests/browser/config.test.ts tests/browser/profileResolution.test.ts tests/browser/profileConfig.test.ts tests/browser/browserService.test.ts tests/schema/resolver.test.ts tests/cli/browserConfig.test.ts --maxWorkers 1`
  - `pnpm run check`
- Next:
  - the largest remaining local ownership is now the deeper runtime/browser
    execution path in `src/browser/index.ts` and related setup flows
  - before pushing further, it may be worth cutting another checkpoint because
    the main profile-family boundary is now materially cleaner end to end

## 2026-04-01 — Browser runtime now shares one managed launch-context helper

- Focus: remove the last obvious duplicate managed-profile/bootstrap derivation
  inside the browser runtime path before going deeper into `index.ts`
- Implemented:
  - added `resolveManagedBrowserLaunchContext(...)` in
    `src/browser/index.ts`
  - both ChatGPT and Grok browser runtime flows now use that helper for:
    - managed profile dir
    - default managed profile dir
    - chrome profile
    - preferred bootstrap cookie path
  - added `resolveManagedBrowserLaunchContextForTest(...)` and direct
    regression coverage in `tests/browser/browserModeExports.test.ts`
- Verification:
  - `pnpm vitest run tests/browser/browserModeExports.test.ts tests/browser/config.test.ts tests/browser/profileDoctor.test.ts tests/browser/login.test.ts tests/browser/profileResolution.test.ts tests/browser/profileConfig.test.ts tests/browser/browserService.test.ts tests/schema/resolver.test.ts tests/cli/browserConfig.test.ts --maxWorkers 1`
  - `pnpm run check`
- Next:
  - the remaining runtime work in `index.ts` is now less about profile
    derivation and more about broader execution/lifecycle policy
  - this is a reasonable place either to cut another checkpoint or to step back
    and reassess the next roadmap item

## 2026-04-01 — Browser-profile-family refactor marked Phase 1 complete enough

- Focus: record the current checkpoint and stop treating the refactor as open-ended runtime cleanup
- Implemented:
  - confirmed the runtime launch-context checkpoint landed as commit `196aad27`
  - updated `docs/dev/browser-profile-family-refactor-plan.md` with a status
    section describing what Phase 1 now covers in practice
  - updated `docs/dev/next-execution-plan.md` so the next slice is explicit
    Phase 2 cleanup around secondary WSL browser-family clarity rather than
    deeper `index.ts` lifecycle work
  - updated `ROADMAP.md` to mark the browser-profile-family refactor as in
    progress with the current Phase 1 note
- Next:
  - run the Phase 2 cleanup slice for explicit `wsl-chrome-2` browser-family
    configuration, naming clarity, and live/manual smoke
  - then pivot back to the next user-facing reliability/polish target instead
    of extending profile derivation work further

## 2026-04-01 — Browser-family registry added for secondary WSL profile cleanup

- Focus: make `wsl-chrome-2` a first-class browser family instead of teaching it primarily as a raw path recipe
- Implemented:
  - added top-level `browserFamilies` config support and
    `profiles.<name>.browserFamily` selection in the schema
  - taught `resolveBrowserProfileResolution(...)` to merge named
    browser-family defaults before profile-local browser overrides
  - fixed the v1->v2 normalization bridge so `profile.browserFamily` survives
    promotion into `auracallProfiles`
  - added focused regression coverage in:
    - `tests/browser/profileResolution.test.ts`
    - `tests/browser/profileConfig.test.ts`
    - `tests/schema/resolver.test.ts`
  - updated `docs/configuration.md` and `docs/wsl-chatgpt-runbook.md` to
    show `browserFamilies.wsl-chrome-2` + `profiles.wsl-chrome-2.browserFamily`
    as the preferred configuration shape
- Verification:
  - `pnpm vitest run tests/browser/profileResolution.test.ts tests/browser/profileConfig.test.ts tests/browser/config.test.ts tests/browser/browserService.test.ts tests/browser/login.test.ts tests/browser/profileDoctor.test.ts tests/schema/resolver.test.ts tests/cli/browserConfig.test.ts --maxWorkers 1`
  - `pnpm run check`
- Next:
  - run live/manual smokes for the default WSL family and `wsl-chrome-2`
    once convenient
  - decide whether wizard/scaffold output should emit named browser families in
    a follow-up slice or remain compatibility-first for now

## 2026-04-01 — Locked terminology for browser profiles vs runtime profiles

- Focus: stop overloading the word `profile` and align repo docs with the new
  layering model
- Implemented:
  - updated `README.md`, `docs/configuration.md`,
    `docs/wsl-chatgpt-runbook.md`, and
    `docs/dev/browser-profile-family-refactor-plan.md` to define and use:
    - browser profile
    - source browser profile
    - managed browser profile
    - AuraCall runtime profile
  - rewrote `AGENTS.md` to match current Aura-Call architecture and removed
    stale inherited guidance from the ancestral project
- Next:
  - keep applying the same terminology in future config/schema work
  - treat remaining code-level names like `browserFamily` as acceptable
    transitional implementation detail until a larger rename is justified

## 2026-04-01 — Sequenced config-model refactor ahead of agents and teams

- Focus: place the next bigger semantic/config refactor correctly in the roadmap
- Implemented:
  - added `docs/dev/config-model-refactor-plan.md`
  - updated `ROADMAP.md` and `docs/dev/next-execution-plan.md` so the
    config-model refactor is explicitly sequenced before future agent/team work
  - updated `docs/dev/browser-profile-family-refactor-plan.md` to mark it as
    a bounded precursor rather than the whole future config story
- Next:
  - commit this planning pass
  - then return to the next bounded execution slice instead of expanding the
    planning work indefinitely

## 2026-04-01 — Wizard and scaffold now emit browser-profile-backed config

- Focus: make the config entry points reinforce the browser-profile bridge instead
  of writing the older profile-local browser shape
- Implemented:
  - updated `src/cli/browserWizard.ts` so wizard-created profiles now emit:
    - `browserFamilies.<name>`
    - `profiles.<name>.browserFamily`
    - an empty per-profile `browser` override block unless local overrides are needed
  - updated `src/config.ts` so missing-config scaffolding now creates:
    - `browserFamilies.default`
    - `profiles.default.browserFamily = "default"`
  - updated onboarding/config docs and regression tests
- Next:
  - verify the onboarding tests stay green
  - then decide whether a later compatibility slice should rename
    `browserFamilies` externally, or keep that decision deferred to the larger
    config-model refactor

## 2026-04-01 — Product terminology now matches browser-profile semantics

- Focus: align user-visible CLI and runtime wording with the documented split
  between source browser profile, managed browser profile, and AuraCall runtime profile
- Implemented:
  - updated doctor warnings to say `managed browser profile` and
    `source browser cookies`
  - updated login/runtime/bootstrap logs to distinguish source browser profile
    from managed browser profile
  - updated TUI prompt text and dry-run cookie-plan wording away from the old
    generic `Chrome profile` phrasing
- Next:
  - verify the focused CLI/browser tests still pass
  - then decide whether any machine-readable report aliases are worth adding in
    a later compatibility-neutral cleanup

## 2026-04-01 — Added reserved schema landing zone for agents and teams

- Focus: create an explicit non-executable seam for the next config-model layer
- Implemented:
  - added reserved top-level `agents` and `teams` config schema blocks
  - documented that they are parsed today but inert at runtime
  - updated config-model planning docs and config examples accordingly
- Next:
  - keep agent/team behavior out of scope until the broader config-model refactor
    actually starts

## 2026-04-01 — Defined the first agent inheritance/override boundary

- Focus: document the agent layer before any behavior or orchestration work lands
- Implemented:
  - added `docs/dev/agent-config-boundary-plan.md`
  - documented what agents inherit from AuraCall runtime profiles
  - documented what agents may override directly
  - documented what remains owned by browser profiles or future teams
  - linked that boundary from the config-model plan, roadmap, and execution plan
- Next:
  - keep agent behavior out of scope until the broader config-model refactor
    starts for real


## 2026-04-01 — Moved ChatGPT project-settings commit labels into the service manifest

- Focus: continue the narrow ChatGPT service-volatility pilot with one remaining
  low-risk declarative label set in `chatgptAdapter.ts`
- Implemented:
  - added `ui.labelSets.project_settings_commit_buttons` to the checked-in
    ChatGPT service manifest
  - rewired the project-settings commit button matcher to use the manifest-owned
    label set instead of hard-coded `save/save changes/done/apply` literals
  - added focused registry and adapter regression coverage
- Next:
  - look for the next similarly low-risk declarative ChatGPT label set or stop
    the manifest slice again if the remaining adapter strings are too
    workflow-coupled


## 2026-04-01 — Moved ChatGPT project-source upload action labels into the service manifest

- Focus: take one more bounded ChatGPT service-volatility slice while the
  remaining adapter strings were re-evaluated
- Implemented:
  - added `ui.labelSets.project_source_upload_actions` to the checked-in
    ChatGPT service manifest
  - rewired the project-sources upload dialog readiness probe to use the
    manifest-owned upload-action label set instead of hard-coded
    `upload/browse/upload file` literals
  - added focused registry and adapter regression coverage
- Next:
  - stop the ChatGPT manifest pilot again unless another equally low-risk
    declarative label set is identified; most remaining adapter strings are now
    entangled with state heuristics or fallback order


## 2026-04-01 — Started browser-service registry and reattach reliability planning

- Focus: pivot from narrow ChatGPT manifest extraction back to a shared
  browser-service reliability target
- Implemented:
  - wrote `docs/dev/browser-service-reattach-reliability-plan.md`
  - updated roadmap/execution docs to make stale registry cleanup and
    reattach-boundary reliability the next browser-service slice
  - started Slice 1 by introducing explicit registry liveness classification in
    browser-service and consuming it in browser doctor reporting
- Next:
  - finish the focused package + doctor regression set
  - then decide whether Slice 2 should add pruning diagnostics immediately or
    stop after the first classification seam lands


## 2026-04-01 — Added stale-entry prune diagnostics to browser doctor

- Focus: continue the browser-service registry/reattach reliability track with
  safer stale-entry pruning diagnostics
- Implemented:
  - added package-owned `pruneRegistryDetailed(...)` so browser-service can
    return exactly which registry entries were pruned and why
  - updated browser doctor reporting to expose `prunedRegistryEntryReasons`
    alongside the count
  - updated setup/doctor contract fixtures and focused tests to pin the new
    reporting shape
- Next:
  - tighten attach candidate diagnostics next, so attach paths can explain why
    stale or mismatched entries were discarded before target resolution


## 2026-04-01 — Attach resolution now reports discarded stale registry candidates

- Focus: continue the browser-service registry/reattach reliability track with
  clearer attach-side diagnostics
- Implemented:
  - updated `resolveServiceTarget(...)` to collect discarded stale registry
    candidates tied to the selected DevTools port or the expected browser
    profile identity
  - added focused browser-service tests for discarded-candidate reporting
  - kept behavior bounded to diagnostics only; tab-selection policy itself was
    not changed in this slice
- Next:
  - broaden the same evidence into reattach/session flows so failed session
    reattachment can distinguish stale target loss from wrong-browser drift


## 2026-04-01 — Reattach/session flows now print classified failure reasons

- Focus: continue the browser-service registry/reattach reliability track by
  making reattach failures explain the class of browser drift instead of only a
  raw exception string
- Implemented:
  - added classified reattach failures for missing ChatGPT targets and
    wrong-browser/profile drift
  - updated session reattach output to print the classified failure summary
  - added focused tests for the browser reattach logger path and session CLI
    surface
- Next:
  - thread stale registry candidate evidence into reattach/session metadata so a
    failed reattach can correlate current browser drift with prior stale
    browser-state entries


## 2026-04-01 — Reattach failures now persist stale registry evidence in session metadata

- Focus: bridge attach-side stale registry diagnostics into failed session
  reattach postmortems
- Implemented:
  - extracted the stale registry candidate collector into a shared helper for
    attach and reattach flows
  - failed `auracall session <id>` reattach now persists
    `browser.runtime.reattachDiagnostics` with the classified failure and any
    discarded stale registry candidates
  - added focused tests for the new helper and the session metadata update path
- Next:
  - use the persisted `reattachDiagnostics` in session/status output so operators
    can inspect the last stale-candidate set without reopening raw metadata


## 2026-04-02 — Session/status output now renders persisted reattach diagnostics

- Focus: expose stored reattach postmortem evidence directly in operator-facing
  session surfaces
- Implemented:
  - added a shared `formatReattachDiagnostics(...)` formatter
  - `auracall session <id>` now prints `Reattach diagnostics: ...` when present
  - `auracall status` now prints an indented `reattach: ...` line under affected
    sessions
- Next:
  - consider surfacing the full stale-candidate detail set in `--json` status
    output if operators need richer machine-readable inspection


## 2026-04-02 — Session/status JSON now includes persisted reattach diagnostics

- Focus: expose stored reattach postmortem evidence in machine-readable CLI output
- Implemented:
  - added `--json` to `auracall session` and `auracall status`
  - list JSON now emits `{ entries, truncated, total }` using stored session metadata
  - single-session JSON now emits the raw stored session metadata, including
    `browser.runtime.reattachDiagnostics` when present
  - added focused tests for filtered list JSON and single-session JSON output
- Next:
  - consider whether `--json-only` should be added to these session surfaces too,
    or whether plain `--json` is enough for operator automation


## 2026-04-02 — Session/status now advertise `--json-only` for machine consumers

- Focus: make the new session/status JSON surface discoverable and non-noisy in
  attach flows
- Implemented:
  - added explicit `--json-only` option definitions to `auracall session` and
    `auracall status`
  - whitelisted `json` and `jsonOnly` in ignored-flag detection so attach flows
    do not emit misleading `Ignoring flags...` messages for machine-readable use
  - added focused coverage for the attach/ignored-flags case
- Next:
  - if we keep expanding machine-readable session tooling, consider extracting a
    shared session JSON payload helper instead of duplicating the list wrapper in
    both command entrypoints


## 2026-04-02 — Session/status JSON now includes normalized reattach summaries

- Focus: make machine-readable session diagnostics easier to consume without
  custom post-processing of nested metadata
- Implemented:
  - added a normalized `reattachSummary` sibling object to both single-session
    and session-list JSON payloads
  - `reattachSummary` includes:
    - `capturedAt`
    - `failureKind` / `failureMessage`
    - `discardedCandidateCount`
    - normalized `discardedCandidateCounts[]` grouped by `reason + liveness`
    - the human-readable summary string used in text output
  - aligned both `auracall session --json` and `auracall status --json` on the
    same helper-backed payload contract
- Next:
  - if postmortem tooling needs even richer state, consider adding a dedicated
    exported CLI/session JSON schema doc instead of continuing to evolve it only
    through tests


## 2026-04-02 — Session JSON contract is now explicitly typed and documented

- Focus: stop making downstream tooling infer the session JSON contract only
  from tests
- Implemented:
  - exported explicit session JSON payload types from `sessionCommand.ts`
  - documented the contract in `docs/dev/session-json-contract.md`
  - kept the normalized `reattachSummary` payload shape aligned with those
    exported types
- Next:
  - if other tools start consuming this payload heavily, consider moving these
    JSON contract types into a dedicated shared module instead of leaving them
    next to the CLI command handler


## 2026-04-02 — Reattach now classifies ambiguous same-profile browser targets

- Focus: stop silent fallback to an arbitrary page when the prior exact target is
  gone but multiple same-origin pages remain in the selected browser profile
- Implemented:
  - added `ambiguous` as a first-class reattach failure kind
  - reattach now classifies the case where no exact prior target matches, but
    multiple same-origin page targets remain visible in the same Chrome session
  - kept recovery behavior unchanged: classify/log clearly, then fall back to the
    existing recovery path instead of guessing a page
- Next:
  - run a live multi-tab ChatGPT reattach smoke if we want end-to-end proof of
    the new classification on a real browser session


## 2026-04-02 — Live ambiguous reattach smoke exposed and fixed a root-URL false match

- Focus: prove the new `ambiguous` reattach classification on a real ChatGPT
  browser session and tighten it where the live DOM disagreed with the test-only
  assumptions
- Implemented:
  - reproduced a real same-profile multi-tab ChatGPT state on port `45011`
    using the managed browser profile for
    `reply-exactly-with-reattach-ambig`
  - found that `classifyAmbiguousReattachTarget(...)` incorrectly treated
    `https://chatgpt.com/` as an exact-enough URL match for a prior
    `/c/<conversation>` page because of a broad prefix comparison
  - tightened the URL comparison so only genuinely specific prior-page matches
    suppress ambiguity; generic root/origin tabs no longer do
  - added a focused regression proving that root-plus-other same-origin tabs now
    classify as `ambiguous`
- Verification:
  - focused:
    - `pnpm vitest run tests/browser/reattach.test.ts tests/cli/sessionDisplay.coverage.test.ts tests/cli/sessionDisplay.test.ts --maxWorkers 1`
    - `pnpm exec tsc -p tsconfig.json --noEmit`
  - live:
    - direct `resumeBrowserSessionCore(...)` probe against the real browser on
      port `45011` now logs:
      - `ambiguous: Existing Chrome exposes multiple possible ChatGPT pages for the prior browser profile; refusing to guess.`
- Next:
  - decide whether to add a first-class live vitest for this exact ambiguous
    multi-tab scenario, or leave it as a manual/live operator smoke because it
    depends on deliberately staging conflicting ChatGPT pages


## 2026-04-02 — browser-tools must resolve AuraCall runtime profiles before launching or attaching

- Focus: explain why `wsl-chrome-2` looked unstable when opened through
  `scripts/browser-tools.ts` even though the real managed WSL Chrome launch path
  was viable
- Progress:
  - traced the drift to the thin Aura-Call wrapper in
    `scripts/browser-tools.ts`, which still loaded raw user config and resolved
    only the flattened browser block instead of resolving the selected AuraCall
    runtime profile plus browser target first
  - updated the package-owned CLI to accept `--auracall-profile` and
    `--browser-target`, then forwarded those options through the wrapper to
    `resolveConfig(...)` and `BrowserService.fromConfig(...)`
  - browser-tools now launches/attaches against the same managed browser
    profile that Aura-Call itself would use, instead of silently falling back to
    the default flattened browser config
  - added a focused regression in `tests/browser/browserTools.test.ts` to prove
    `start` forwards the selected AuraCall runtime profile and browser target to
    the port resolver
- Verification:
  - `pnpm vitest run tests/browser/browserTools.test.ts tests/browser/profileResolution.test.ts tests/browser/profileConfig.test.ts tests/browser/browserService.test.ts --maxWorkers 1`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
- Notes:
  - the real product-style WSL Chrome launch contract for
    `~/.auracall/browser-profiles/wsl-chrome-2/chatgpt` is viable; the earlier
    confusion came from browser-tools bypassing AuraCall runtime profile
    resolution, plus ad hoc debug launches that did not match the real contract
- Next:
  - rerun the full repo checks, document the new browser-tools flags, and use
    the fixed wrapper for future `wsl-chrome-2` inspection instead of ad hoc
    launches


## 2026-04-02 — Managed browser profiles must honor active signed-in subprofiles

- Focus: stop treating `Default` as the only valid subprofile inside a managed
  browser profile after Chrome sign-in created `Profile 1`
- Progress:
  - confirmed the `wsl-chrome-2/chatgpt` managed browser profile now contains:
    - `Default`, which is effectively unsigned
    - `Profile 1`, which holds the signed-in Chrome account
      `consult@polymerconsultinggroup.com`
  - added `resolveManagedProfileName(...)` so managed browser profile consumers
    prefer `Local State.profile.last_used` when it has a signed-in account and
    the configured `Default` profile does not
  - wired that into the typed launch-profile seam, Aura-Call browser-service
    wrapper, and local browser doctor
  - local doctor now reports `chromeProfile: "Profile 1"` and a signed-in
    managed Chrome account for `wsl-chrome-2`
- Verification:
  - `pnpm vitest run tests/browser/profileStore.test.ts tests/browser/profileResolution.test.ts tests/browser/browserService.test.ts tests/browser/profileDoctor.test.ts tests/browser/browserTools.test.ts --maxWorkers 1`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - live:
    - `pnpm tsx bin/auracall.ts doctor --profile wsl-chrome-2 --target chatgpt --local-only --json`
      now reports:
      - `chromeProfile: "Profile 1"`
      - `email: "consult@polymerconsultinggroup.com"`
- Issues:
  - the detached `browser-tools start` path still is not leaving a stable live
    DevTools endpoint after the wrapper exits, even though the managed profile
    and subprofile selection are now correct
- Next:
  - debug the remaining detached-launch persistence bug separately from profile
    selection, since the profile-selection model is now behaving correctly


## 2026-04-02 — browser-tools start must preserve the selected managed browser profile

- Focus: stop `scripts/browser-tools.ts start` from drifting back to the
  `default` managed browser profile or `~/.cache/scraping` after the runtime
  profile and signed-in subprofile fixes landed
- Progress:
  - confirmed two independent bugs in the browser-tools launch stack:
    - the package CLI was always injecting its own default `--profile-dir`,
      which silently overrode Aura-Call-managed browser profile resolution
    - `resolveBrowserConfig(...)` lacked AuraCall runtime profile context, so an
      explicit managed browser profile like
      `~/.auracall/browser-profiles/wsl-chrome-2/chatgpt` could be rewritten
      back to `.../default/chatgpt`
  - removed the package default leak so unset `--profile-dir` / `--chrome-path`
    stay unset unless the operator explicitly passes them
  - fixed profile-merge precedence so selected-service defaults win over stale
    top-level browser fields left by another AuraCall runtime profile
  - threaded `auracallProfileName` through `resolveBrowserConfig(...)` where
    userConfig-backed callers actually know that context:
    - `scripts/browser-tools.ts`
    - `BrowserService`
    - browser doctor
    - browser login
    - browser-login launch resolution in `bin/auracall.ts`
- Verification:
  - `pnpm vitest run tests/browser/config.test.ts tests/browser/profileConfig.test.ts tests/browser/profileResolution.test.ts tests/browser/browserTools.test.ts tests/browser/browserService.test.ts tests/browser/profileStore.test.ts tests/browser/profileDoctor.test.ts tests/browser/login.test.ts --maxWorkers 1`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - live:
    - `DISPLAY=:0.0 pnpm tsx scripts/browser-tools.ts --auracall-profile wsl-chrome-2 --browser-target chatgpt start`
      now reports:
      - `Using Chrome profile directory "Profile 1" in /home/ecochran76/.auracall/browser-profiles/wsl-chrome-2/chatgpt.`
      - `Launched Chrome (pid ...) on port 45013`
      - stable DevTools on `http://127.0.0.1:45013/json/version`
- Issues:
  - none on the wrapper/profile-selection side; the live start path now uses
    the intended managed browser profile and active signed-in subprofile
- Next:
  - proceed with the planned real `wrong-browser-profile` live reattach proof
    using `default` vs `wsl-chrome-2`


## 2026-04-02 — top-level browser runs must preserve the selected AuraCall runtime profile too

- Focus: fix the last live path where `auracall --profile wsl-chrome-2 --engine browser`
  still launched `default/chatgpt`
- Progress:
  - confirmed the helper/wrapper path was green but the real browser-run path
    still drifted during `runBrowserMode(...)`
  - root cause was the same missing runtime-profile context showing up in two
    deeper places:
    - browser session config did not persist `auracallProfileName`
    - `resolveManagedBrowserLaunchContext(...)` recomputed managed browser
      profile dirs without the selected AuraCall runtime profile name
  - fixed that by:
    - carrying `auracallProfileName` in browser session config
    - threading it into `runBrowserMode(...)`, reattach config resolution, and
      the managed launch-context helper
- Verification:
  - `pnpm vitest run tests/browser/browserModeExports.test.ts tests/cli/browserConfig.test.ts tests/browser/config.test.ts tests/browser/profileConfig.test.ts tests/browser/browserTools.test.ts tests/browser/browserService.test.ts tests/browser/profileDoctor.test.ts tests/browser/login.test.ts tests/browser/reattach.test.ts --maxWorkers 1`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - live:
    - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts --profile wsl-chrome-2 --engine browser --model gpt-5.2 --prompt "Reply exactly with: WSL CHROME 2 SESSION OK 3" --verbose --force`
    - now reuses:
      - `/home/ecochran76/.auracall/browser-profiles/wsl-chrome-2/chatgpt`
      - `Profile 1`
      - DevTools port `45013`
    - and returns `WSL CHROME 2 SESSION OK 3`
- Notes:
  - current backup of the signed-in managed browser profile:
    - `/home/ecochran76/.auracall/browser-profiles/wsl-chrome-2/chatgpt.backup-20260402-113725`


## 2026-04-02 — same-origin reattach must use browser-profile identity, not just URL shape

- Focus: finish the live `wrong-browser-profile` proof between the `default`
  and `wsl-chrome-2` browser profiles
- Progress:
  - wired a pre-target reattach classifier so `resumeBrowserSession(...)` can
    fail fast on browser-profile mismatch before it tries to choose among
    same-origin page targets
  - initially keyed that off fully `live` selected-port owners only
  - the live `default -> 45013` reattach probe exposed the real edge case:
    the selected `wsl-chrome-2` port was represented in `browser-state.json`
    only as `profile-mismatch` because Chrome had respawned under the same
    managed browser profile with a new PID
  - broadened selected-port evidence to include both:
    - `live`
    - `profile-mismatch`
    when deciding whether the existing DevTools port belongs to the wrong
    managed browser profile
- Verification:
  - `pnpm vitest run tests/browser/registryDiagnostics.test.ts tests/browser/reattach.test.ts tests/cli/sessionDisplay.coverage.test.ts --maxWorkers 1`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - live proof:
    - replayed the stored `default` ChatGPT session metadata from
      `reply-exactly-with-reattach-ambig`
    - forced `chromePort = 45013` to point at the live `wsl-chrome-2`
      browser profile
    - confirmed the reattach path now classifies that as
      `wrong-browser-profile` instead of attaching across browser profiles or
      collapsing into generic ambiguity


## 2026-04-02 — reattach recovery needs one bounded fresh-port attach retry

- Focus: finish the live reattach smoke after pruning stale browser-state
  entries
- Progress:
  - pruned the live registry with:
    - `auracall doctor --target chatgpt --local-only --prune-browser-state`
    - `auracall doctor --profile wsl-chrome-2 --target chatgpt --local-only --prune-browser-state`
  - built fresh ChatGPT browser sessions on both browser profiles
  - confirmed `default` reattach now completes from the `chrome-disconnected`
    state even when the existing DevTools endpoint is gone and the recovery
    path has to launch a fresh managed browser
  - the `wsl-chrome-2` smoke exposed a narrower race:
    - `resumeBrowserSessionViaNewChrome(...)` could hit `ECONNREFUSED` on a
      just-launched DevTools port
    - fixed that by probing the fresh port once and retrying the attach once
- Verification:
  - `pnpm vitest run tests/browser/reattach.test.ts tests/browser/registryDiagnostics.test.ts tests/cli/sessionDisplay.coverage.test.ts --maxWorkers 1`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
- Live status:
  - `default` browser profile: reattach smoke green after stale-registry prune
  - `wsl-chrome-2` browser profile: still not green, but for a different
    reason now
    - once reattach falls back to launching a fresh managed browser, ChatGPT
      presents a visible login CTA in that new browser even though the
      already-open managed `wsl-chrome-2` browser is signed in
    - that is no longer a port-race or browser-profile drift problem; it is a
      managed-browser session persistence problem on fresh launch

## 2026-04-02 13:06 CDT

- Focus:
  - fix `browser-tools start` manual-login launch isolation so separate managed
    browser profiles do not collapse onto the same DevTools port
- Findings:
  - the live `default` AuraCall runtime profile still carried stale top-level
    browser fields from Grok:
    - `manualLoginProfileDir = ~/.auracall/browser-profiles/default/grok`
    - `debugPort = 45011`
  - `scripts/browser-tools.ts` was trusting those stale fields:
    - reusing the already-open Grok DevTools target instead of launching
      `default/chatgpt`
    - or forcing fresh launches back onto `45011`
  - the tool was also bypassing the new stable per-managed-browser-profile
    fixed-port derivation in `packages/browser-service/src/manualLogin.ts`
- Fix:
  - `packages/browser-service/src/manualLogin.ts`
    - derive a stable preferred fixed DevTools port from
      `userDataDir + profileName` before probing for an available port
  - `scripts/browser-tools.ts`
    - resolve the managed browser profile dir directly from the selected
      AuraCall runtime profile + target
    - ignore config-derived fixed-port reuse unless the user explicitly passes
      `--port`
    - reuse only an existing registry entry for the exact managed browser
      profile
- Verification:
  - `pnpm vitest run tests/browser/browserTools.test.ts tests/browser-service/manualLogin.test.ts tests/browser/profileConfig.test.ts --maxWorkers 1`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - live:
    - left `default/grok` open on `45011`
    - launched `default/chatgpt` with
      `DISPLAY=:0.0 pnpm tsx scripts/browser-tools.ts --browser-target chatgpt start`
    - confirmed `default/chatgpt` launched separately on `45065`
    - confirmed `http://127.0.0.1:45065/json/list` shows `https://chatgpt.com/`
      while `45011` still shows only Grok

## 2026-04-02 13:15 CDT

- Focus:
  - live cross-browser-profile reattach validation after the managed-launch
    isolation fix
- Progress:
  - used the stored `reattach-smoke-default` ChatGPT session metadata from the
    `default` browser profile
  - left `wsl-chrome-2/chatgpt` live on `45013`
  - left `default/grok` live on `45011`
  - terminated the live `default/chatgpt` browser so the session had to go
    through the real reattach/recovery path
- Live proof:
  - direct `resumeBrowserSession(...)` against the stored `default` session
    logged:
    - `Existing Chrome reattach failed (wrong-browser-profile: Existing Chrome no longer exposes the expected ChatGPT browser profile. (port=45011)); reopening browser to locate the session.`
  - it then reopened only the matching managed browser profile:
    - `/home/ecochran76/.auracall/browser-profiles/default/chatgpt`
  - and recovered the stored response successfully
- Conclusion:
  - the cross-browser-profile boundary is behaving correctly in the real
    reattach path:
    - a `default/chatgpt` session no longer drifts onto either
      `default/grok` or `wsl-chrome-2/chatgpt`

## 2026-04-02 13:18 CDT

- Focus:
  - fix the remaining `wsl-chrome-2` fresh-launch reattach gap
- Root cause:
  - fresh reattach launch resolved the session config correctly:
    - `chromeProfile = "Profile 1"`
    - `manualLoginProfileDir = ~/.auracall/browser-profiles/wsl-chrome-2/chatgpt`
  - but `resumeBrowserSessionViaNewChrome(...)` then rebuilt the managed
    browser profile path with `resolveManagedProfileDir(...)` without passing
    the AuraCall runtime profile name
  - that silently fell back to:
    - `~/.auracall/browser-profiles/default/chatgpt`
  - so `wsl-chrome-2` recovery could reopen the wrong managed browser profile
    and show a ChatGPT login CTA even though the real `wsl-chrome-2` managed
    browser profile was signed in
- Fix:
  - `src/browser/reattachCore.ts`
    - pass `config.auracallProfileName` into `resolveManagedProfileDir(...)`
      during fresh reattach launch
  - `tests/browser/reattach.test.ts`
    - added a regression proving fresh reattach launch keeps the selected
      AuraCall runtime profile's managed browser directory
- Verification:
  - `pnpm vitest run tests/browser/reattach.test.ts tests/browser/registryDiagnostics.test.ts tests/cli/sessionDisplay.coverage.test.ts --maxWorkers 1`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - live:
    - killed the live `wsl-chrome-2/chatgpt` browser
    - replayed `reattach-smoke-wsl`
    - observed:
      - `Using Chrome profile directory "Profile 1" in /home/ecochran76/.auracall/browser-profiles/wsl-chrome-2/chatgpt.`
      - `Login check passed (status=200, domLoginCta=false)`
      - recovered `WSL REATTACH OK 20260402`

## 2026-04-02 13:21 CDT

- Focus:
  - short end-to-end reattach/doctor smoke across both browser profiles after
    the fresh-launch runtime-profile fix
- Results:
  - local-only doctor:
    - `default/chatgpt` signed in as `ecochran76@gmail.com`
    - `wsl-chrome-2/chatgpt` signed in as
      `consult@polymerconsultinggroup.com`
    - `default/grok` still live and healthy
  - pruned one stale registry `profile-mismatch` entry for the old
    `default/chatgpt::default` process
  - direct reattach replay:
    - `reattach-smoke-default` green
      - rejected live `45011` as `wrong-browser-profile`
      - reopened `default/chatgpt`
      - recovered `DEFAULT REATTACH OK 20260402`
    - `reattach-smoke-wsl` green
      - reused/reopened `wsl-chrome-2/chatgpt`
      - kept `Profile 1`
      - passed ChatGPT login check
      - recovered `WSL REATTACH OK 20260402`
- Follow-up:
  - `doctor --target chatgpt --prune-browser-state --json` still let its
    runtime probe attach to the live Grok page on `45011`
  - that is a separate browser-tools/doctor target-selection bug, not a
    reattach or managed-browser-profile bug

## 2026-04-02 13:28 CDT

- Focus:
  - fix the remaining browser-tools / doctor target-selection contamination
- Root cause:
  - the shared attach-resolution helper still trusted config-derived fixed
    ports during doctor/client attach discovery
  - with the live config still carrying stale top-level browser fields from
    Grok, `doctor --target chatgpt` could route:
    - runtime probe
    - selector diagnosis
    into the live Grok page on `45011`
  - the package-owned browser-tools page probe also still had a separate
    serialization bug:
    - page-side evaluation could throw `ReferenceError: __name is not defined`
- Fix:
  - `src/browser/service/portResolution.ts`
    - stop reusing config-derived fixed ports during attach discovery
    - keep discovery on:
      - explicit env override, or
      - exact managed browser profile registry match
  - `src/browser/service/registryDiagnostics.ts`
    - keep expected-profile diagnostics anchored to the AuraCall runtime
      profile when rebuilding managed browser profile paths
  - `packages/browser-service/src/browserTools.ts`
    - rewrote the page probe to use a raw expression string, avoiding
      transpiler helper leakage into the browser context
- Verification:
  - `pnpm vitest run tests/browser/browserTools.test.ts tests/browser/portResolution.test.ts tests/browser/profileDoctor.test.ts tests/browser/browserService.test.ts tests/browser/registryDiagnostics.test.ts --maxWorkers 1`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - live:
    - `pnpm tsx bin/auracall.ts doctor --target chatgpt --prune-browser-state --json`
    - runtime doctor now attaches to the real ChatGPT managed browser profile
      on `38155`
    - `browserToolsError` is now `null`

## 2026-04-02 13:58 CDT

- Focus:
  - pivot the active execution track from browser reliability back to the
    larger config-model refactor
- What changed:
  - promoted the config-model refactor to the active architecture track in
    [ROADMAP.md](/home/ecochran76/workspace.local/oracle/ROADMAP.md)
  - replaced the execution board in
    [next-execution-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/next-execution-plan.md)
    so it now centers:
    - target config shape
    - one non-breaking schema/runtime seam
    - browser reliability in maintenance mode
  - added a new target-shape doc:
    [config-model-target-shape.md](/home/ecochran76/workspace.local/oracle/docs/dev/config-model-target-shape.md)
    with the intended public layering:
    - `browserProfiles`
    - `runtimeProfiles`
    - `agents`
    - `teams`
  - updated
    [config-model-refactor-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/config-model-refactor-plan.md)
    and
    [configuration.md](/home/ecochran76/workspace.local/oracle/docs/configuration.md)
    so the current bridge keys are explicitly documented as transitional
- Notes:
  - no runtime behavior changed in this slice
  - the immediate next implementation work should be one small non-breaking
    seam that makes runtime-profile-to-browser-profile ownership more explicit

## 2026-04-02 13:52 CDT

- Focus:
  - land the first non-breaking config/runtime seam after activating the
    config-model track
- What changed:
  - updated
    [profileResolution.ts](/home/ecochran76/workspace.local/oracle/src/browser/service/profileResolution.ts)
    so the typed resolved seam now speaks in browser-profile terms internally:
    - `profileFamily.browserProfileId`
    - `browserProfile`
  - kept the current public bridge key unchanged:
    - `profiles.<name>.browserFamily`
  - updated
    [profileConfig.ts](/home/ecochran76/workspace.local/oracle/src/browser/service/profileConfig.ts)
    to consume the renamed internal seam
  - expanded
    [profileResolution.test.ts](/home/ecochran76/workspace.local/oracle/tests/browser/profileResolution.test.ts)
    with a regression that proves the public `browserFamily` config key still
    bridges into the new internal `browserProfileId`
- Verification:
  - `pnpm vitest run tests/browser/profileResolution.test.ts tests/browser/profileConfig.test.ts tests/schema/resolver.test.ts tests/config.test.ts --maxWorkers 1`
  - `pnpm run check`
- Notes:
  - this slice is intentionally internal-only naming cleanup
  - no public config behavior changed

## 2026-04-02 13:46 CDT

- Focus:
  - push the same ownership seam outward into schema/types without changing
    the current public bridge keys
- What changed:
  - added schema-level bridge/ownership names in
    [types.ts](/home/ecochran76/workspace.local/oracle/src/schema/types.ts):
    - `RuntimeProfileBrowserReferenceSchema`
    - `BrowserProfilesConfigSchema`
    - `RuntimeProfilesConfigSchema`
  - rewired
    [config/schema.ts](/home/ecochran76/workspace.local/oracle/src/config/schema.ts)
    to compose through those names instead of repeating the raw record shapes
  - added a direct schema-level regression in
    [tests/config.test.ts](/home/ecochran76/workspace.local/oracle/tests/config.test.ts)
    proving the current bridge still parses:
    - `browserFamilies.<name>`
    - `profiles.<name>.browserFamily`
- Verification:
  - `pnpm vitest run tests/config.test.ts tests/browser/profileResolution.test.ts tests/browser/profileConfig.test.ts tests/schema/resolver.test.ts --maxWorkers 1`
  - `pnpm run check`
- Notes:
  - still no public config behavior change
  - this gives the schema layer the same “runtime profile references browser
    profile” framing that the typed resolution layer now has

## 2026-04-02 14:02 CDT

- Focus:
  - add the first bridge-aware config helper layer so config-producing code can
    speak in browser-profile versus runtime-profile terms without duplicating
    raw key knowledge inline
- What changed:
  - added
    [config/model.ts](/home/ecochran76/workspace.local/oracle/src/config/model.ts)
    with narrow bridge-aware helpers for:
    - browser profiles
    - AuraCall runtime profiles
    - the runtime-profile -> browser-profile bridge reference
  - rewired
    [config.ts](/home/ecochran76/workspace.local/oracle/src/config.ts)
    default scaffolding through those helpers
  - rewired
    [browserWizard.ts](/home/ecochran76/workspace.local/oracle/src/cli/browserWizard.ts)
    patch generation through those helpers
  - added direct helper coverage in
    [configModel.test.ts](/home/ecochran76/workspace.local/oracle/tests/configModel.test.ts)
- Verification:
  - `pnpm vitest run tests/configModel.test.ts tests/config.test.ts tests/cli/browserWizard.test.ts tests/browser/profileResolution.test.ts tests/browser/profileConfig.test.ts tests/schema/resolver.test.ts --maxWorkers 1`
  - `pnpm run check`
- Notes:
  - still no public config behavior change
  - the public bridge keys remain:
    - `browserFamilies`
    - `profiles`
    - `profiles.<name>.browserFamily`

## 2026-04-02 14:16 CDT

- Focus:
  - push the same bridge-aware config seam into migration/normalization so the
    compatibility path stops open-coding browser-profile reference handling
- What changed:
  - updated
    [migrate.ts](/home/ecochran76/workspace.local/oracle/src/config/migrate.ts)
    to use the bridge-aware helpers when:
    - reading a runtime profile's browser-profile bridge
    - copying `auracallProfiles` back into `profiles`
  - added direct migration coverage in
    [configMigrate.test.ts](/home/ecochran76/workspace.local/oracle/tests/configMigrate.test.ts)
    for:
    - `normalizeConfigV1toV2(...)`
    - `materializeConfigV2(...)`
- Verification:
  - `pnpm vitest run tests/configMigrate.test.ts tests/configModel.test.ts tests/config.test.ts tests/cli/browserWizard.test.ts tests/schema/resolver.test.ts tests/browser/profileResolution.test.ts tests/browser/profileConfig.test.ts --maxWorkers 1`
  - `pnpm run check`
- Notes:
  - still no public config behavior change
  - the bridge-aware seam now covers:
    - schema/types
    - typed resolution
    - config-producing helpers
    - config migration/normalization

## 2026-04-02 14:27 CDT

- Focus:
  - move resolver/load-path consumers onto the bridge-aware runtime-profile
    helpers so config resolution stops open-coding `profiles` versus
    `auracallProfiles`
- What changed:
  - expanded
    [config/model.ts](/home/ecochran76/workspace.local/oracle/src/config/model.ts)
    with active/bridge runtime-profile helpers:
    - `getCurrentRuntimeProfiles(...)`
    - `getLegacyRuntimeProfiles(...)`
    - `getBridgeRuntimeProfiles(...)`
    - `getActiveRuntimeProfileName(...)`
    - `getActiveRuntimeProfile(...)`
  - updated
    [schema/resolver.ts](/home/ecochran76/workspace.local/oracle/src/schema/resolver.ts)
    to use those helpers for active runtime-profile selection and application
  - updated
    [llmService.ts](/home/ecochran76/workspace.local/oracle/src/browser/llmService/llmService.ts)
    so profile-scoped identity/features now resolve through the same bridge
    helpers instead of reading only `auracallProfiles`
  - expanded
    [configModel.test.ts](/home/ecochran76/workspace.local/oracle/tests/configModel.test.ts)
    and
    [llmServiceIdentity.test.ts](/home/ecochran76/workspace.local/oracle/tests/browser/llmServiceIdentity.test.ts)
    to cover:
    - active runtime-profile bridge selection
    - current `profiles` bridge usage when legacy `auracallProfiles` is absent
- Verification:
  - `pnpm vitest run tests/configModel.test.ts tests/configMigrate.test.ts tests/config.test.ts tests/schema/resolver.test.ts tests/browser/llmServiceIdentity.test.ts tests/browser/profileResolution.test.ts tests/browser/profileConfig.test.ts --maxWorkers 1`
  - `pnpm run check`
- Notes:
  - still no public config behavior change
  - this is the first behavior-facing runtime slice that reduces dependence on
    the legacy `auracallProfiles` shape at call sites

## 2026-04-02 14:31 CDT

- Focus:
  - clean up CLI/operator wording so config-facing commands speak in terms of
    browser profiles and AuraCall runtime profiles instead of generic
    ambiguous "profiles"
- What changed:
  - updated
    [auracall.ts](/home/ecochran76/workspace.local/oracle/bin/auracall.ts)
    command descriptions/options/prompts for:
    - `--profile`
    - `doctor`
    - `wizard`
    - `setup`
    - `login`
    - `profile`
    - `config migrate`
    - `profile scaffold`
  - updated
    [browserWizard.ts](/home/ecochran76/workspace.local/oracle/src/cli/browserWizard.ts)
    validation text so it explicitly says `AuraCall runtime profile name`
- Verification:
  - `pnpm vitest run tests/cli/browserWizard.test.ts tests/config.test.ts tests/configModel.test.ts tests/browser/profileDoctor.test.ts --maxWorkers 1`
  - `pnpm run check`
- Notes:
  - still no public config behavior change
  - this is operator-language cleanup only

## 2026-04-02 14:35 CDT

- Focus:
  - add a read-only config inspection surface that reports the active
    AuraCall runtime profile and browser-profile bridge in the target-model
    terms without changing the stored bridge-key layout
- What changed:
  - added
    [configCommand.ts](/home/ecochran76/workspace.local/oracle/src/cli/configCommand.ts)
    with:
    - `buildConfigShowReport(...)`
    - `formatConfigShowReport(...)`
  - updated
    [auracall.ts](/home/ecochran76/workspace.local/oracle/bin/auracall.ts)
    to add:
    - `auracall config show`
    - `auracall config show --json`
  - added focused coverage in
    [configCommand.test.ts](/home/ecochran76/workspace.local/oracle/tests/cli/configCommand.test.ts)
  - updated
    [configuration.md](/home/ecochran76/workspace.local/oracle/docs/configuration.md)
    to document the new read-only inspection command
- Verification:
  - `pnpm vitest run tests/cli/configCommand.test.ts tests/configModel.test.ts tests/config.test.ts tests/cli/browserWizard.test.ts --maxWorkers 1`
  - `pnpm run check`
  - `pnpm tsx bin/auracall.ts config show`
  - `pnpm tsx bin/auracall.ts config show --json-only --json`
- Notes:
  - this keeps the public stored keys unchanged
  - the command is inspection-only and intentionally reports in terms of:
    - AuraCall runtime profile
    - browser profile
    - bridge-key presence

## 2026-04-02 14:40 CDT

- Focus:
  - tighten onboarding/migration operator output so config-writing commands
    report both the AuraCall runtime profile and browser-profile bridge they
    just wrote or preserved
- What changed:
  - expanded
    [configCommand.ts](/home/ecochran76/workspace.local/oracle/src/cli/configCommand.ts)
    with:
    - `buildRuntimeProfileBridgeSummary(...)`
    - `formatRuntimeProfileBridgeSummary(...)`
  - updated
    [auracall.ts](/home/ecochran76/workspace.local/oracle/bin/auracall.ts)
    so:
    - `auracall wizard` confirmation/output now mentions the browser profile
      bridge explicitly
    - `auracall config migrate` prints the active runtime-profile/browser-profile
      bridge after writing
    - `auracall profile scaffold` prints the scaffolded runtime-profile/browser-profile
      bridge after writing
  - expanded
    [configCommand.test.ts](/home/ecochran76/workspace.local/oracle/tests/cli/configCommand.test.ts)
    with direct compact-summary coverage
  - updated
    [configuration.md](/home/ecochran76/workspace.local/oracle/docs/configuration.md)
    to note that `config migrate` and `profile scaffold` now print a bridge
    summary in target-model terms
- Verification:
  - `pnpm vitest run tests/cli/configCommand.test.ts tests/configModel.test.ts tests/config.test.ts tests/cli/browserWizard.test.ts --maxWorkers 1`
  - `pnpm run check`
  - isolated migrate smoke:
    - `AURACALL_CONFIG_PATH=<tmp>/config.json pnpm tsx bin/auracall.ts config migrate --in-place --force`
  - isolated scaffold smoke:
    - `AURACALL_HOME_DIR=<tmp> pnpm tsx bin/auracall.ts profile scaffold --force`
- Notes:
  - this is operator-surface cleanup only
  - stored config keys remain unchanged

## 2026-04-02 14:45 CDT

- Focus:
  - add a read-only inventory surface for AuraCall runtime profiles and their
    browser-profile bridges so operators can inspect the whole config model, not
    just the currently active profile
- What changed:
  - expanded
    [configCommand.ts](/home/ecochran76/workspace.local/oracle/src/cli/configCommand.ts)
    with:
    - `buildProfileListReport(...)`
    - `formatProfileListReport(...)`
  - updated
    [auracall.ts](/home/ecochran76/workspace.local/oracle/bin/auracall.ts)
    to add:
    - `auracall profile list`
    - `auracall profile list --json`
  - expanded
    [configCommand.test.ts](/home/ecochran76/workspace.local/oracle/tests/cli/configCommand.test.ts)
    with inventory-report coverage
  - updated
    [configuration.md](/home/ecochran76/workspace.local/oracle/docs/configuration.md)
    to document the new inventory command
- Verification:
  - `pnpm vitest run tests/cli/configCommand.test.ts tests/configModel.test.ts tests/config.test.ts tests/cli/browserWizard.test.ts --maxWorkers 1`
  - `pnpm run check`
  - `pnpm tsx bin/auracall.ts profile list`
  - `pnpm tsx bin/auracall.ts profile list --json-only --json`
- Notes:
  - `config show` remains the active resolved-state view
  - `profile list` is the broader inventory view
  - live output also usefully surfaces runtime profiles that still have no
    explicit browser-profile bridge, instead of inferring one silently

## 2026-04-02 14:50 CDT

- Focus:
  - add a read-only config doctor so bridge-health problems become explicit
    diagnostics instead of only being discoverable through manual inspection of
    `config show` / `profile list`
- What changed:
  - expanded
    [configCommand.ts](/home/ecochran76/workspace.local/oracle/src/cli/configCommand.ts)
    with:
    - `buildConfigDoctorReport(...)`
    - `formatConfigDoctorReport(...)`
  - updated
    [auracall.ts](/home/ecochran76/workspace.local/oracle/bin/auracall.ts)
    to add:
    - `auracall config doctor`
    - `auracall config doctor --json`
  - expanded
    [configCommand.test.ts](/home/ecochran76/workspace.local/oracle/tests/cli/configCommand.test.ts)
    with bridge-health coverage for:
    - missing browser-profile references
    - dangling browser-profile references
    - unused browser profiles
    - legacy runtime profiles
  - updated
    [configuration.md](/home/ecochran76/workspace.local/oracle/docs/configuration.md)
    to document the new doctor command
- Verification:
  - `pnpm vitest run tests/cli/configCommand.test.ts tests/configModel.test.ts tests/config.test.ts tests/cli/browserWizard.test.ts --maxWorkers 1`
  - `pnpm run check`
  - `pnpm tsx bin/auracall.ts config doctor`
  - `pnpm tsx bin/auracall.ts config doctor --json-only --json`
- Notes:
  - this is still read-only/operator-facing work
  - it does not rewrite or normalize config automatically
  - live output now explicitly flags the current missing browser-profile bridges
    on:
    - `default`
    - `windows-chrome-test`

## 2026-04-02 14:58 CDT

- Focus:
  - make `config doctor` usable in scripts/CI by giving it an explicit strict
    exit-code mode instead of leaving it as a human-only warning surface
- What changed:
  - expanded
    [configCommand.ts](/home/ecochran76/workspace.local/oracle/src/cli/configCommand.ts)
    with:
    - `resolveConfigDoctorExitCode(...)`
  - updated
    [auracall.ts](/home/ecochran76/workspace.local/oracle/bin/auracall.ts)
    so `auracall config doctor --strict` exits nonzero when warnings are
    present
  - expanded
    [configCommand.test.ts](/home/ecochran76/workspace.local/oracle/tests/cli/configCommand.test.ts)
    with strict exit-code coverage
  - updated
    [configuration.md](/home/ecochran76/workspace.local/oracle/docs/configuration.md)
    to document `--strict`
- Verification:
  - `pnpm vitest run tests/cli/configCommand.test.ts tests/configModel.test.ts tests/config.test.ts tests/cli/browserWizard.test.ts --maxWorkers 1`
  - `pnpm run check`
  - healthy-config smoke:
    - `pnpm tsx bin/auracall.ts config doctor --strict --json-only --json`
- Notes:
  - default `config doctor` remains non-failing and human-friendly
  - `--strict` is the automation/CI path

## 2026-04-02 17:03 CDT

- Focus:
  - start the first post-inspection behavior-facing config-model seam by making
    runtime profile resolution consume bridge-aware browser-profile helpers
    instead of reading raw bridge-key fields directly
- What changed:
  - expanded
    [config/model.ts](/home/ecochran76/workspace.local/oracle/src/config/model.ts)
    with:
    - `getBrowserProfile(...)`
    - `getRuntimeProfileBrowserProfile(...)`
  - updated
    [profileResolution.ts](/home/ecochran76/workspace.local/oracle/src/browser/service/profileResolution.ts)
    so browser-profile selection now uses the config-model helper seam instead
    of directly reading:
    - `merged.browserFamilies`
    - `profile.browserFamily`
  - expanded
    [configModel.test.ts](/home/ecochran76/workspace.local/oracle/tests/configModel.test.ts)
    with direct browser-profile lookup coverage
- Verification:
  - `pnpm vitest run tests/configModel.test.ts tests/browser/profileResolution.test.ts tests/browser/profileConfig.test.ts tests/config.test.ts tests/schema/resolver.test.ts --maxWorkers 1`
  - `pnpm run check`
- Notes:
  - public config behavior is unchanged
  - this is the first runtime consumer in the browser-resolution path that now
    follows the bridge-aware helper seam for browser-profile lookup

## 2026-04-02 17:07 CDT

- Focus:
  - move the "prefer explicit current runtime profile before legacy
    `auracallProfiles`" rule into the shared config-model helper layer instead
    of re-implementing that preference ad hoc in CLI-only code
- What changed:
  - expanded
    [config/model.ts](/home/ecochran76/workspace.local/oracle/src/config/model.ts)
    with:
    - `getPreferredRuntimeProfileName(...)`
    - `getPreferredRuntimeProfile(...)`
  - updated runtime consumers to use that shared precedence rule:
    - [schema/resolver.ts](/home/ecochran76/workspace.local/oracle/src/schema/resolver.ts)
    - [llmService.ts](/home/ecochran76/workspace.local/oracle/src/browser/llmService/llmService.ts)
    - [configCommand.ts](/home/ecochran76/workspace.local/oracle/src/cli/configCommand.ts)
  - expanded
    [configModel.test.ts](/home/ecochran76/workspace.local/oracle/tests/configModel.test.ts)
    with explicit current-vs-legacy precedence coverage
- Verification:
  - `pnpm vitest run tests/configModel.test.ts tests/schema/resolver.test.ts tests/browser/llmServiceIdentity.test.ts tests/browser/profileResolution.test.ts tests/browser/profileConfig.test.ts tests/config.test.ts --maxWorkers 1`
  - `pnpm run check`
- Notes:
  - this is a real behavior-facing change:
    - when an explicit runtime profile name exists in the current `profiles`
      bridge, runtime consumers now use that current entry instead of letting a
      legacy `auracallProfiles` map win by mere presence

## 2026-04-02 18:56 CDT

- Focus:
  - consolidate managed browser profile identity derivation for already-resolved
    browser config so runtime flows stop rebuilding:
    - managed browser profile dir
    - managed/default profile fallback dirs
    - effective source browser profile name
    - bootstrap cookie source path
- What changed:
  - expanded
    [profileResolution.ts](/home/ecochran76/workspace.local/oracle/src/browser/service/profileResolution.ts)
    with:
    - `resolveManagedBrowserLaunchContextFromResolvedConfig(...)`
  - rewired runtime consumers to use that shared seam:
    - [index.ts](/home/ecochran76/workspace.local/oracle/src/browser/index.ts)
    - [login.ts](/home/ecochran76/workspace.local/oracle/src/browser/login.ts)
    - [profileDoctor.ts](/home/ecochran76/workspace.local/oracle/src/browser/profileDoctor.ts)
    - [browserService.ts](/home/ecochran76/workspace.local/oracle/src/browser/service/browserService.ts)
    - [portResolution.ts](/home/ecochran76/workspace.local/oracle/src/browser/service/portResolution.ts)
    - [registryDiagnostics.ts](/home/ecochran76/workspace.local/oracle/src/browser/service/registryDiagnostics.ts)
    - [reattachCore.ts](/home/ecochran76/workspace.local/oracle/src/browser/reattachCore.ts)
  - expanded tests:
    - [profileResolution.test.ts](/home/ecochran76/workspace.local/oracle/tests/browser/profileResolution.test.ts)
    - [browserModeExports.test.ts](/home/ecochran76/workspace.local/oracle/tests/browser/browserModeExports.test.ts)
- Verification:
  - `pnpm vitest run tests/configModel.test.ts tests/schema/resolver.test.ts tests/browser/llmServiceIdentity.test.ts tests/browser/profileResolution.test.ts tests/browser/profileConfig.test.ts tests/browser/login.test.ts tests/browser/profileDoctor.test.ts tests/browser/portResolution.test.ts tests/browser/browserService.test.ts tests/browser/reattach.test.ts tests/browser/registryDiagnostics.test.ts tests/browser/browserModeExports.test.ts tests/cli/sessionDisplay.coverage.test.ts --maxWorkers 1`
  - `pnpm run check`
- Notes:
  - the first attempt exposed a residual browser-service call site still
    referencing the older local resolver; fixing that restored the regression
    set and confirmed the consolidated seam was sound

## 2026-04-02 19:04 CDT

- Focus:
  - collapse the remaining reattach-side browser-config reconstruction so
    session replay stops resolving browser config twice for:
    - fresh relaunch
    - registry diagnostics / wrong-browser-profile classification
- What changed:
  - expanded
    [profileResolution.ts](/home/ecochran76/workspace.local/oracle/src/browser/service/profileResolution.ts)
    with:
    - `resolveSessionBrowserLaunchContext(...)`
  - updated
    [reattach.ts](/home/ecochran76/workspace.local/oracle/src/browser/reattach.ts)
    to resolve session browser config once and reuse it for:
    - `runtimeDeps.resolveBrowserConfig(...)`
    - `classifyRuntimeBrowserProfileFailure(...)`
  - updated
    [registryDiagnostics.ts](/home/ecochran76/workspace.local/oracle/src/browser/service/registryDiagnostics.ts)
    so reattach diagnostics can accept a pre-resolved session launch context
    instead of always rebuilding one internally
  - expanded
    [profileResolution.test.ts](/home/ecochran76/workspace.local/oracle/tests/browser/profileResolution.test.ts)
    with direct session-launch-context coverage
- Verification:
  - `pnpm vitest run tests/browser/reattach.test.ts tests/browser/registryDiagnostics.test.ts tests/browser/profileResolution.test.ts tests/cli/sessionDisplay.coverage.test.ts tests/browser/browserModeExports.test.ts --maxWorkers 1`
  - `pnpm run check`
- Notes:
  - this keeps reattach at the same behavior boundary while reducing the number
    of places that know how to rebuild session-scoped browser launch state

## 2026-04-02 19:14 CDT

- Focus:
  - extract the duplicated managed-browser-profile launch preparation from the
    browser runtime entry paths so ChatGPT and Grok stop repeating the same:
    - managed profile dir resolution
    - bootstrap/logging
    - destructive-retry eligibility check
- What changed:
  - added a local runtime-entry helper in
    [index.ts](/home/ecochran76/workspace.local/oracle/src/browser/index.ts):
    - `prepareManagedBrowserProfileLaunch(...)`
  - updated both browser entry paths to consume it:
    - [runBrowserMode(...)](/home/ecochran76/workspace.local/oracle/src/browser/index.ts)
    - [runGrokBrowserMode(...)](/home/ecochran76/workspace.local/oracle/src/browser/index.ts)
- Verification:
  - `pnpm vitest run tests/browser/browserModeExports.test.ts tests/browser/reattach.test.ts tests/browser/registryDiagnostics.test.ts tests/browser/profileResolution.test.ts tests/browser/profileDoctor.test.ts tests/browser/login.test.ts --maxWorkers 1`
  - `pnpm run check`
- Notes:
  - this is intentionally a local runtime-entry seam inside `index.ts`, not a
    broader browser-service extraction
  - provider execution behavior is unchanged; only the shared launch-prep path
    is less duplicated

## 2026-04-02 19:24 CDT

- Focus:
  - extract the remaining top-level browser runtime entry seam for:
    - config resolution
    - logger normalization
    - fixed DevTools port assignment when strategy is not `auto`
- What changed:
  - added
    [resolveBrowserRuntimeEntryContext(...)](/home/ecochran76/workspace.local/oracle/src/browser/index.ts)
    plus a test export wrapper in
    [index.ts](/home/ecochran76/workspace.local/oracle/src/browser/index.ts)
  - updated
    [runBrowserMode(...)](/home/ecochran76/workspace.local/oracle/src/browser/index.ts)
    to consume that helper instead of open-coding the same entry logic inline
  - expanded
    [browserModeExports.test.ts](/home/ecochran76/workspace.local/oracle/tests/browser/browserModeExports.test.ts)
    with deterministic fixed-port injection coverage
- Verification:
  - `pnpm vitest run tests/browser/browserModeExports.test.ts tests/browser/reattach.test.ts tests/browser/registryDiagnostics.test.ts tests/browser/profileResolution.test.ts tests/browser/profileDoctor.test.ts tests/browser/login.test.ts --maxWorkers 1`
  - `pnpm run check`
- Notes:
  - this keeps the real runtime boundary explicit without broadening the seam
    into provider execution or browser-service package code

## 2026-04-02 19:32 CDT

- Focus:
  - add a read-only target-shape projection layer so config inspection JSON can
    expose:
    - browser profiles
    - AuraCall runtime profiles
    - active runtime/browser selections
    without accepting new public input keys yet
- What changed:
  - expanded
    [config/model.ts](/home/ecochran76/workspace.local/oracle/src/config/model.ts)
    with:
    - `projectConfigModel(...)`
    - projected browser/runtime profile types
  - updated JSON-oriented config inspection reports in
    [configCommand.ts](/home/ecochran76/workspace.local/oracle/src/cli/configCommand.ts):
    - `buildConfigShowReport(...)`
    - `buildProfileListReport(...)`
    to include a read-only `projectedModel`
  - expanded tests:
    - [configModel.test.ts](/home/ecochran76/workspace.local/oracle/tests/configModel.test.ts)
    - [configCommand.test.ts](/home/ecochran76/workspace.local/oracle/tests/cli/configCommand.test.ts)
  - documented the new inspection-only projection in
    [configuration.md](/home/ecochran76/workspace.local/oracle/docs/configuration.md)
- Verification:
  - `pnpm vitest run tests/configModel.test.ts tests/cli/configCommand.test.ts tests/config.test.ts tests/cli/browserWizard.test.ts tests/schema/resolver.test.ts --maxWorkers 1`
  - `pnpm run check`
- Notes:
  - this is intentionally read-only
  - the bridge keys remain the only accepted public input shape for now

## 2026-04-02 19:39 CDT

- Focus:
  - document the target-shape input alias policy before any parser/schema work
    begins for:
    - `browserProfiles`
    - `runtimeProfiles`
- What changed:
  - added
    [config-model-input-alias-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/config-model-input-alias-plan.md)
    to define:
    - dual-read phases
    - precedence rules
    - write-back policy
    - diagnostics expectations
  - linked that policy from:
    - [config-model-refactor-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/config-model-refactor-plan.md)
    - [config-model-target-shape.md](/home/ecochran76/workspace.local/oracle/docs/dev/config-model-target-shape.md)
    - [next-execution-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/next-execution-plan.md)
    - [ROADMAP.md](/home/ecochran76/workspace.local/oracle/ROADMAP.md)
- Notes:
  - no behavior changed in this slice
  - this locks the rule that target-shape input aliases should not be accepted
    until precedence and write-back policy are explicit

## 2026-04-02 19:53 CDT

- Focus:
  - move bridge-health analysis onto the shared config-model seam instead of
    leaving it as CLI-local logic
- What changed:
  - added
    `analyzeConfigModelBridgeHealth(...)` plus shared doctor issue/report types
    in [src/config/model.ts](/home/ecochran76/workspace.local/oracle/src/config/model.ts)
  - rewired
    [src/cli/configCommand.ts](/home/ecochran76/workspace.local/oracle/src/cli/configCommand.ts)
    so `buildConfigDoctorReport(...)` now delegates to the shared model-layer
    analyzer
  - expanded
    [tests/configModel.test.ts](/home/ecochran76/workspace.local/oracle/tests/configModel.test.ts)
    with direct bridge-health coverage
- Verification:
  - `pnpm vitest run tests/configModel.test.ts tests/cli/configCommand.test.ts tests/config.test.ts tests/cli/browserWizard.test.ts tests/schema/resolver.test.ts --maxWorkers 1`
  - `pnpm run check`
- Notes:
  - this keeps target-model projection and bridge-health diagnostics in one
    place without starting input alias support

## 2026-04-02 20:00 CDT

- Focus:
  - move overlapping read-only config inspection assembly onto one shared
    model-layer view
- What changed:
  - added `inspectConfigModel(...)` in
    [src/config/model.ts](/home/ecochran76/workspace.local/oracle/src/config/model.ts)
    to centralize:
    - active AuraCall runtime profile
    - active browser profile
    - active default service
    - browser-profile inventory
    - runtime-profile inventory
    - legacy runtime-profile inventory
    - bridge-key presence state
    - projected target model
  - rewired
    [src/cli/configCommand.ts](/home/ecochran76/workspace.local/oracle/src/cli/configCommand.ts)
    so `buildConfigShowReport(...)` and `buildProfileListReport(...)` consume
    that shared inspection helper instead of rebuilding overlapping state
  - expanded
    [tests/configModel.test.ts](/home/ecochran76/workspace.local/oracle/tests/configModel.test.ts)
    with direct inspection-view coverage
- Verification:
  - `pnpm vitest run tests/configModel.test.ts tests/cli/configCommand.test.ts tests/config.test.ts tests/cli/browserWizard.test.ts tests/schema/resolver.test.ts --maxWorkers 1`
  - `pnpm run check`
- Notes:
  - this is still read-only target-model work
  - no target-shape input aliases were added

## 2026-04-02 20:07 CDT

- Focus:
  - move bridge-key metadata itself onto the shared config-model seam
- What changed:
  - added `ConfigModelBridgeKeys` and `CONFIG_MODEL_BRIDGE_KEYS` in
    [src/config/model.ts](/home/ecochran76/workspace.local/oracle/src/config/model.ts)
  - extended `inspectConfigModel(...)` to return shared `bridgeKeys`
  - rewired
    [src/cli/configCommand.ts](/home/ecochran76/workspace.local/oracle/src/cli/configCommand.ts)
    so `config show` / `profile list` no longer hardcode bridge-key names
  - expanded
    [tests/configModel.test.ts](/home/ecochran76/workspace.local/oracle/tests/configModel.test.ts)
    to pin the shared bridge-key contract
- Verification:
  - `pnpm vitest run tests/configModel.test.ts tests/cli/configCommand.test.ts tests/config.test.ts tests/cli/browserWizard.test.ts tests/schema/resolver.test.ts --maxWorkers 1`
  - `pnpm run check`
- Notes:
  - this keeps the bridge contract explicit and centralized without starting
    dual-read or target-shape input support

## 2026-04-02 20:18 CDT

- Focus:
  - land the first bounded target-shape dual-read slice without changing write
    behavior
- What changed:
  - schema/config loading now accepts:
    - `browserProfiles`
    - `runtimeProfiles`
    - `runtimeProfiles.<name>.browserProfile`
  - shared model helpers in
    [src/config/model.ts](/home/ecochran76/workspace.local/oracle/src/config/model.ts)
    now give target keys precedence over bridge keys
  - shared doctor analysis now reports mixed/conflicting bridge vs target
    config state, including conflicting nested browser-profile references
  - normalization in
    [src/config/migrate.ts](/home/ecochran76/workspace.local/oracle/src/config/migrate.ts)
    now applies current alias/compatibility handling to `runtimeProfiles.*`
    paths too
  - updated user-facing docs in
    [docs/configuration.md](/home/ecochran76/workspace.local/oracle/docs/configuration.md)
    to say dual-read is supported while writes remain bridge-key-first
- Verification:
  - `pnpm vitest run tests/configModel.test.ts tests/configMigrate.test.ts tests/config.test.ts tests/schema/resolver.test.ts tests/cli/configCommand.test.ts tests/cli/browserWizard.test.ts --maxWorkers 1`
  - `pnpm run check`
- Notes:
  - this is phase-1 dual-read only
  - scaffolding/migration/wizard still emit bridge keys

## 2026-04-02 20:31 CDT

- Focus:
  - make operator/config inspection surfaces expose target-key presence and
    precedence explicitly now that dual-read is live
- What changed:
  - extended shared doctor/inspection data in
    [src/config/model.ts](/home/ecochran76/workspace.local/oracle/src/config/model.ts)
    with:
    - target-key presence
    - read precedence summaries
  - updated
    [src/cli/configCommand.ts](/home/ecochran76/workspace.local/oracle/src/cli/configCommand.ts)
    so:
    - `config show` reports target-key presence alongside bridge-key presence
    - `config doctor` reports whether target keys are present and which side
      currently wins for browser-profile/runtime-profile reads
  - expanded
    [tests/cli/configCommand.test.ts](/home/ecochran76/workspace.local/oracle/tests/cli/configCommand.test.ts)
    and
    [tests/configModel.test.ts](/home/ecochran76/workspace.local/oracle/tests/configModel.test.ts)
    to pin the new JSON and text output
- Verification:
  - `pnpm vitest run tests/configModel.test.ts tests/cli/configCommand.test.ts tests/config.test.ts tests/configMigrate.test.ts tests/schema/resolver.test.ts tests/cli/browserWizard.test.ts --maxWorkers 1`
  - `pnpm run check`
- Notes:
  - this is still read/reporting work only
  - no write-path behavior changed

## 2026-04-02 20:43 CDT

- Focus:
  - add the first explicit target-shape write mode without changing default
    write behavior
- What changed:
  - added `targetShape` support to
    [materializeConfigV2(...)](/home/ecochran76/workspace.local/oracle/src/config/migrate.ts)
    so migrated output can emit:
    - `browserProfiles`
    - `runtimeProfiles`
    - `runtimeProfiles.<name>.browserProfile`
  - updated
    [bin/auracall.ts](/home/ecochran76/workspace.local/oracle/bin/auracall.ts)
    to support:
    - `auracall config migrate --target-shape`
    - explicit write-mode messaging after write
  - expanded
    [tests/configMigrate.test.ts](/home/ecochran76/workspace.local/oracle/tests/configMigrate.test.ts)
    to pin target-shape migrated output
  - updated user/docs planning references in:
    - [docs/configuration.md](/home/ecochran76/workspace.local/oracle/docs/configuration.md)
    - [docs/dev/config-model-input-alias-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/config-model-input-alias-plan.md)
    - [docs/dev/next-execution-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/next-execution-plan.md)
- Verification:
  - `pnpm vitest run tests/configMigrate.test.ts tests/configModel.test.ts tests/config.test.ts tests/schema/resolver.test.ts tests/cli/configCommand.test.ts tests/cli/browserWizard.test.ts --maxWorkers 1`
  - `pnpm run check`
- Notes:
  - default writes are still bridge-key-first
  - only `config migrate` gained an explicit target-shape write mode

## 2026-04-02 20:52 CDT

- Focus:
  - extend the explicit target-shape write mode to `profile scaffold` without
    changing scaffold defaults
- What changed:
  - updated
    [src/config.ts](/home/ecochran76/workspace.local/oracle/src/config.ts)
    so `scaffoldDefaultConfigFile(...)` can write either:
    - bridge-key output by default
    - target-shape output when `targetShape: true`
  - updated
    [bin/auracall.ts](/home/ecochran76/workspace.local/oracle/bin/auracall.ts)
    to support:
    - `auracall profile scaffold --target-shape`
    - explicit write-mode messaging after scaffold
  - expanded
    [tests/config.test.ts](/home/ecochran76/workspace.local/oracle/tests/config.test.ts)
    with direct target-shape scaffold coverage
  - updated docs/plans in:
    - [docs/configuration.md](/home/ecochran76/workspace.local/oracle/docs/configuration.md)
    - [docs/dev/config-model-input-alias-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/config-model-input-alias-plan.md)
    - [docs/dev/next-execution-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/next-execution-plan.md)
- Verification:
  - `pnpm vitest run tests/config.test.ts tests/configMigrate.test.ts tests/configModel.test.ts tests/schema/resolver.test.ts tests/cli/configCommand.test.ts tests/cli/browserWizard.test.ts --maxWorkers 1`
  - `pnpm run check`
- Notes:
  - default scaffold output is still bridge-key-first
  - `wizard` remains unchanged

## 2026-04-02 21:00 CDT

- Focus:
  - add future-troubleshooting docs for the dual-shape config era
- What changed:
  - added
    [config-shape-troubleshooting.md](/home/ecochran76/workspace.local/oracle/docs/dev/config-shape-troubleshooting.md)
    covering:
    - bridge-shape vs target-shape vs mixed-shape
    - read precedence
    - common `config doctor` findings
    - when to use explicit target-shape write commands
  - linked it from:
    - [docs/configuration.md](/home/ecochran76/workspace.local/oracle/docs/configuration.md)
    - [config-model-input-alias-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/config-model-input-alias-plan.md)
    - [next-execution-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/next-execution-plan.md)
    - [ROADMAP.md](/home/ecochran76/workspace.local/oracle/ROADMAP.md)
- Notes:
  - docs only
  - intended for future troubleshooting, not end-user onboarding

## 2026-04-02 21:12 CDT

- Focus:
  - extend explicit target-shape writes to the guided `wizard` path without
    flipping the default bridge-key onboarding output
- What changed:
  - updated [bin/auracall.ts](/home/ecochran76/workspace.local/oracle/bin/auracall.ts)
    so `auracall wizard` now accepts:
    - `--target-shape`
    - explicit write-mode reporting after the config write
  - kept
    [src/cli/browserWizard.ts](/home/ecochran76/workspace.local/oracle/src/cli/browserWizard.ts)
    bridge-oriented so the command still materializes target-shape output at
    the write boundary instead of changing patch semantics
  - expanded
    [tests/cli/browserWizard.test.ts](/home/ecochran76/workspace.local/oracle/tests/cli/browserWizard.test.ts)
    with direct wizard merge/materialize coverage for target-shape output
  - updated docs/plans in:
    - [docs/configuration.md](/home/ecochran76/workspace.local/oracle/docs/configuration.md)
    - [docs/dev/config-model-input-alias-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/config-model-input-alias-plan.md)
    - [docs/dev/next-execution-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/next-execution-plan.md)
- Verification:
  - `pnpm vitest run tests/config.test.ts tests/configMigrate.test.ts tests/configModel.test.ts tests/schema/resolver.test.ts tests/cli/configCommand.test.ts tests/cli/browserWizard.test.ts --maxWorkers 1`
  - `pnpm run check`
- Notes:
  - default wizard output remains bridge-key-first
  - all three write surfaces can now opt into target-shape output explicitly:
    - `config migrate`
    - `profile scaffold`
    - `wizard`

## 2026-04-02 21:24 CDT

- Focus:
  - make the target-shape config model the primary documented public shape
- What changed:
  - updated [docs/configuration.md](/home/ecochran76/workspace.local/oracle/docs/configuration.md)
    so:
    - `browserProfiles` / `runtimeProfiles` are the primary documented keys
    - the main config example is target-shaped
    - bridge keys are framed as compatibility/troubleshooting keys
  - updated planning/troubleshooting docs in:
    - [docs/dev/config-model-refactor-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/config-model-refactor-plan.md)
    - [docs/dev/config-model-input-alias-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/config-model-input-alias-plan.md)
    - [docs/dev/config-shape-troubleshooting.md](/home/ecochran76/workspace.local/oracle/docs/dev/config-shape-troubleshooting.md)
    - [docs/dev/next-execution-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/next-execution-plan.md)
    - [ROADMAP.md](/home/ecochran76/workspace.local/oracle/ROADMAP.md)
- Notes:
  - docs only
  - bridge keys remain supported for compatibility and troubleshooting

## 2026-04-02 21:39 CDT

- Focus:
  - make target-shape the default write output across config-writing commands
- What changed:
  - updated [src/config.ts](/home/ecochran76/workspace.local/oracle/src/config.ts)
    so default scaffolding now writes target-shape unless compatibility bridge
    output is explicitly requested
  - updated [bin/auracall.ts](/home/ecochran76/workspace.local/oracle/bin/auracall.ts)
    so:
    - `wizard`
    - `config migrate`
    - `profile scaffold`
    now default to target-shape output
  - added explicit `--bridge-shape` compatibility mode for those commands
  - kept `--target-shape` accepted explicitly so scripts can still state the
    intended write mode directly
  - expanded [tests/config.test.ts](/home/ecochran76/workspace.local/oracle/tests/config.test.ts)
    so default scaffold output is target-shaped and compatibility bridge output
    is still covered explicitly
  - updated docs/plans in:
    - [docs/configuration.md](/home/ecochran76/workspace.local/oracle/docs/configuration.md)
    - [docs/dev/config-model-input-alias-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/config-model-input-alias-plan.md)
    - [docs/dev/config-shape-troubleshooting.md](/home/ecochran76/workspace.local/oracle/docs/dev/config-shape-troubleshooting.md)
    - [docs/dev/next-execution-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/next-execution-plan.md)
    - [ROADMAP.md](/home/ecochran76/workspace.local/oracle/ROADMAP.md)
- Verification:
  - `pnpm vitest run tests/config.test.ts tests/configMigrate.test.ts tests/configModel.test.ts tests/schema/resolver.test.ts tests/cli/configCommand.test.ts tests/cli/browserWizard.test.ts --maxWorkers 1`
  - `pnpm run check`
- Notes:
  - bridge-shape is now an explicit compatibility mode, not the default write path

## 2026-04-02 21:49 CDT

- Focus:
  - define `version: 3` as the target-shape config era and make write-version semantics explicit
- What changed:
  - updated [src/config/migrate.ts](/home/ecochran76/workspace.local/oracle/src/config/migrate.ts)
    so materialized target-shape output now writes:
    - `version: 3`
    and compatibility bridge output writes:
    - `version: 2`
  - expanded:
    - [tests/config.test.ts](/home/ecochran76/workspace.local/oracle/tests/config.test.ts)
    - [tests/configMigrate.test.ts](/home/ecochran76/workspace.local/oracle/tests/configMigrate.test.ts)
    to pin:
    - target-shape default scaffold => `version: 3`
    - bridge-shape scaffold => `version: 2`
    - target-shape migrate output => `version: 3`
    - compatibility bridge materialization => `version: 2`
  - updated version-policy docs in:
    - [docs/configuration.md](/home/ecochran76/workspace.local/oracle/docs/configuration.md)
    - [docs/dev/config-model-target-shape.md](/home/ecochran76/workspace.local/oracle/docs/dev/config-model-target-shape.md)
    - [docs/dev/config-model-input-alias-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/config-model-input-alias-plan.md)
    - [docs/dev/next-execution-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/next-execution-plan.md)
- Verification:
  - `pnpm vitest run tests/config.test.ts tests/configMigrate.test.ts tests/configModel.test.ts tests/schema/resolver.test.ts tests/cli/configCommand.test.ts tests/cli/browserWizard.test.ts --maxWorkers 1`
  - `pnpm run check`
- Notes:
  - config loading remains permissive during the transition
  - `version` is now a write-time signal for target-shape vs compatibility bridge output

## 2026-04-02 21:58 CDT

- Focus:
  - remove leftover `v2` wording from operator surfaces now that target-shape
    and `version: 3` are the primary write policy
- What changed:
  - updated [bin/auracall.ts](/home/ecochran76/workspace.local/oracle/bin/auracall.ts)
    so `config migrate` now:
    - describes itself as the current config layout with version-3 target-shape
      default output
    - defaults its output suffix to `.v3` instead of `.v2`
  - updated [docs/configuration.md](/home/ecochran76/workspace.local/oracle/docs/configuration.md)
    examples to match the new default output suffix
- Verification:
  - `pnpm run check`
- Notes:
  - bounded operator/help cleanup only

## 2026-04-03 05:29 CDT

- Focus:
  - make `defaultRuntimeProfile` the primary top-level selector key for
    target-shape configs while keeping `auracallProfile` as compatibility input
- What changed:
  - updated:
    - [src/schema/types.ts](/home/ecochran76/workspace.local/oracle/src/schema/types.ts)
    - [src/config/model.ts](/home/ecochran76/workspace.local/oracle/src/config/model.ts)
    - [src/config/migrate.ts](/home/ecochran76/workspace.local/oracle/src/config/migrate.ts)
    - [src/schema/resolver.ts](/home/ecochran76/workspace.local/oracle/src/schema/resolver.ts)
    so target-shape config reads/writes now center:
    - `defaultRuntimeProfile`
    while normalization/resolution still populates:
    - `auracallProfile`
    for compatibility consumers in the runtime stack
  - expanded:
    - [tests/config.test.ts](/home/ecochran76/workspace.local/oracle/tests/config.test.ts)
    - [tests/configMigrate.test.ts](/home/ecochran76/workspace.local/oracle/tests/configMigrate.test.ts)
    - [tests/configModel.test.ts](/home/ecochran76/workspace.local/oracle/tests/configModel.test.ts)
    - [tests/schema/resolver.test.ts](/home/ecochran76/workspace.local/oracle/tests/schema/resolver.test.ts)
    to pin:
    - target-shape schema acceptance
    - target-shape writes emitting `defaultRuntimeProfile`
    - compatibility bridge writes remapping back to `auracallProfile`
    - selector precedence preferring `defaultRuntimeProfile`
  - updated user-facing docs:
    - [README.md](/home/ecochran76/workspace.local/oracle/README.md)
    - [docs/configuration.md](/home/ecochran76/workspace.local/oracle/docs/configuration.md)
- Verification:
  - `pnpm vitest run tests/config.test.ts tests/configMigrate.test.ts tests/configModel.test.ts tests/schema/resolver.test.ts tests/cli/configCommand.test.ts tests/cli/browserWizard.test.ts --maxWorkers 1`
  - `pnpm run check`
- Notes:
  - this does not rename the internal resolved field yet
  - runtime/browser code still consumes `auracallProfile` after normalization

## 2026-04-03 06:02 CDT

- Focus:
  - surface `defaultRuntimeProfile` versus compatibility `auracallProfile`
    presence in config inspection output
- What changed:
  - updated [src/cli/configCommand.ts](/home/ecochran76/workspace.local/oracle/src/cli/configCommand.ts)
    so:
    - `config show` reports both selector keys and whether each is present
    - `config doctor` reports the same selector-key presence alongside its
      bridge-health analysis
    - `profile list` stays unchanged for this slice
  - expanded [tests/cli/configCommand.test.ts](/home/ecochran76/workspace.local/oracle/tests/cli/configCommand.test.ts)
    to pin:
    - bridge-shape selector reporting
    - target-shape selector reporting
    - formatted text output for both `config show` and `config doctor`
  - updated [docs/configuration.md](/home/ecochran76/workspace.local/oracle/docs/configuration.md)
    to note that config inspection now surfaces selector-key presence too
- Verification:
  - `pnpm vitest run tests/cli/configCommand.test.ts tests/configModel.test.ts tests/config.test.ts tests/schema/resolver.test.ts --maxWorkers 1`
  - `pnpm run check`
- Notes:
  - this keeps `auracallProfile` visible as a compatibility selector without
    making it look primary again

## 2026-04-03 06:18 CDT

- Focus:
  - treat the public config transition as complete enough and move the active
    architecture track up to agent/team-ready layering
- What changed:
  - updated [ROADMAP.md](/home/ecochran76/workspace.local/oracle/ROADMAP.md)
    to mark the config-model transition checkpoint as complete enough through:
    - target-shaped reads
    - target-shaped default writes
    - target-vs-bridge inspection/doctor visibility
    - `defaultRuntimeProfile` as the primary selector
  - updated [docs/dev/next-execution-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/next-execution-plan.md)
    so the next active slice is now:
    - agent/team-ready config layering
    - one small runtime/schema seam for future `agent -> runtimeProfile`
      composition
    instead of more config-shape migration polish
  - updated [docs/dev/config-model-refactor-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/config-model-refactor-plan.md)
    to reflect that the bridge/target public-shape transition is now a
    checkpoint, not the main remaining refactor question
  - updated [docs/dev/config-model-input-alias-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/config-model-input-alias-plan.md)
    to mark target-first read/write behavior as implemented and alias mechanics
    as no longer the active pressure
- Verification:
  - docs/planning only
- Notes:
  - the canonical target-shaped example already includes reserved `agents` and
    `teams`, so the next meaningful work is layering semantics, not more key
    migration

## 2026-04-03 06:34 CDT

- Focus:
  - add the first shared read-only `agent -> runtimeProfile -> browserProfile`
    projection seam
- What changed:
  - updated [src/config/model.ts](/home/ecochran76/workspace.local/oracle/src/config/model.ts)
    to project reserved future layers through the shared target model:
    - `agents[]`
    - `teams[]`
    - agent inheritance of runtime-profile browser/default-service context
  - expanded:
    - [tests/configModel.test.ts](/home/ecochran76/workspace.local/oracle/tests/configModel.test.ts)
    - [tests/cli/configCommand.test.ts](/home/ecochran76/workspace.local/oracle/tests/cli/configCommand.test.ts)
    to pin:
    - agent projection through runtime profiles
    - empty projected agent/team arrays in existing inspection/report paths
  - updated [docs/configuration.md](/home/ecochran76/workspace.local/oracle/docs/configuration.md)
    so the documented `projectedModel` JSON contract now includes:
    - `agents[]`
    - `teams[]`
- Verification:
  - `pnpm vitest run tests/configModel.test.ts tests/cli/configCommand.test.ts tests/config.test.ts tests/schema/resolver.test.ts --maxWorkers 1`
  - `pnpm run check`
- Notes:
  - this remains read-only and behaviorally inert
  - it prepares future agent work to inherit runtime/browser semantics from the
    shared config-model seam instead of reopening raw key logic

## 2026-04-03 08:08 CDT

- Focus:
  - surface projected agents/teams directly in config inspection reports
- What changed:
  - updated [src/cli/configCommand.ts](/home/ecochran76/workspace.local/oracle/src/cli/configCommand.ts)
    so:
    - `config show` now reports available `agents` and `teams`
    - `profile list` now reports projected:
      - agents with inherited runtime/browser/default-service context
      - teams with current agent membership
  - expanded [tests/cli/configCommand.test.ts](/home/ecochran76/workspace.local/oracle/tests/cli/configCommand.test.ts)
    to pin:
    - empty agent/team reporting in existing config-show/profile-list flows
    - non-empty projected agent/team inventory reporting
  - updated [docs/configuration.md](/home/ecochran76/workspace.local/oracle/docs/configuration.md)
    to describe the richer inspection surface
- Verification:
  - `pnpm vitest run tests/cli/configCommand.test.ts tests/configModel.test.ts tests/config.test.ts tests/schema/resolver.test.ts --maxWorkers 1`
  - `pnpm run check`
- Notes:
  - this keeps the slice read-only
  - it makes future troubleshooting of reserved agent/team config possible
    without opening raw projected JSON only

## 2026-04-03 08:17 CDT

- Focus:
  - add the first reserved-layer doctor warnings for agents and teams
- What changed:
  - updated [src/config/model.ts](/home/ecochran76/workspace.local/oracle/src/config/model.ts)
    so the shared config-model doctor now flags:
    - agents with no `runtimeProfile`
    - agents that reference missing AuraCall runtime profiles
    - teams that reference missing agents
  - expanded:
    - [tests/configModel.test.ts](/home/ecochran76/workspace.local/oracle/tests/configModel.test.ts)
    - [tests/cli/configCommand.test.ts](/home/ecochran76/workspace.local/oracle/tests/cli/configCommand.test.ts)
    to pin the new shared doctor issue codes and surfaced CLI doctor text
  - updated [docs/configuration.md](/home/ecochran76/workspace.local/oracle/docs/configuration.md)
    so config doctor coverage now includes reserved agent/team reference checks
- Verification:
  - `pnpm vitest run tests/configModel.test.ts tests/cli/configCommand.test.ts tests/config.test.ts tests/schema/resolver.test.ts --maxWorkers 1`
  - `pnpm run check`
- Notes:
  - still read-only and non-executing
  - this is the first real validation seam above AuraCall runtime profiles

## 2026-04-03 08:25 CDT

- Focus:
  - expose resolved versus missing team members directly in the projected model
    and inventory report
- What changed:
  - updated [src/config/model.ts](/home/ecochran76/workspace.local/oracle/src/config/model.ts)
    so projected teams now carry per-member resolution status plus inherited:
    - runtime profile
    - browser profile
    - default service
  - updated [src/cli/configCommand.ts](/home/ecochran76/workspace.local/oracle/src/cli/configCommand.ts)
    so `profile list` prints resolved versus missing team members explicitly
  - expanded:
    - [tests/configModel.test.ts](/home/ecochran76/workspace.local/oracle/tests/configModel.test.ts)
    - [tests/cli/configCommand.test.ts](/home/ecochran76/workspace.local/oracle/tests/cli/configCommand.test.ts)
    to pin:
    - resolved team-member projection
    - unresolved team-member projection
    - inventory text for both cases
  - updated [docs/configuration.md](/home/ecochran76/workspace.local/oracle/docs/configuration.md)
    to note unresolved team-member visibility in the inventory surface
- Verification:
  - `pnpm vitest run tests/configModel.test.ts tests/cli/configCommand.test.ts tests/config.test.ts tests/schema/resolver.test.ts --maxWorkers 1`
  - `pnpm run check`
- Notes:
  - this stays read-only
  - it makes the team projection symmetric with the earlier agent projection and
    team-side doctor warnings

## 2026-04-03 08:35 CDT

- Focus:
  - add the first shared agent-selection resolver for future non-CLI consumers
- What changed:
  - updated [src/config/model.ts](/home/ecochran76/workspace.local/oracle/src/config/model.ts)
    to add:
    - `getAgent(...)`
    - `resolveAgentSelection(...)`
  - the new shared resolver returns:
    - `agentId`
    - `runtimeProfileId`
    - `browserProfileId`
    - `defaultService`
    - `exists`
  - expanded [tests/configModel.test.ts](/home/ecochran76/workspace.local/oracle/tests/configModel.test.ts)
    to pin:
    - resolved agent selection
    - missing agent selection
- Verification:
  - `pnpm vitest run tests/configModel.test.ts tests/cli/configCommand.test.ts tests/config.test.ts tests/schema/resolver.test.ts --maxWorkers 1`
  - `pnpm run check`
- Notes:
  - this remains read-only and behaviorless
  - it is intended as the future seam for `agent -> runtimeProfile ->
    browserProfile` composition outside the CLI/report layer

## 2026-04-03 08:44 CDT

- Focus:
  - use the shared agent-selection resolver in one real read-only consumer
- What changed:
  - updated [src/cli/configCommand.ts](/home/ecochran76/workspace.local/oracle/src/cli/configCommand.ts)
    so `config show` now exposes `resolvedAgents[]` built from:
    - `resolveAgentSelection(...)`
  - expanded [tests/cli/configCommand.test.ts](/home/ecochran76/workspace.local/oracle/tests/cli/configCommand.test.ts)
    to pin:
    - empty resolved-agent reporting
    - non-empty resolved-agent reporting
    - formatted text output for resolved agents
  - updated [docs/configuration.md](/home/ecochran76/workspace.local/oracle/docs/configuration.md)
    to describe the new read-only `config show` resolved-agent view
- Verification:
  - `pnpm vitest run tests/configModel.test.ts tests/cli/configCommand.test.ts tests/config.test.ts tests/schema/resolver.test.ts --maxWorkers 1`
  - `pnpm run check`
- Notes:
  - this is the first non-CLI consumer of the shared agent-selection resolver
  - still no agent execution behavior

## 2026-04-03 08:52 CDT

- Focus:
  - checkpoint the roadmap state before the first execution-adjacent
    agent-selection seam
- What changed:
  - updated:
    - [ROADMAP.md](/home/ecochran76/workspace.local/oracle/ROADMAP.md)
    - [docs/dev/next-execution-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/next-execution-plan.md)
    - [docs/dev/config-model-refactor-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/config-model-refactor-plan.md)
    to record that reserved `agents` / `teams` are now:
    - parsed
    - projected
    - inspected
    - validated
    and that one shared read-only:
    - `agent -> runtimeProfile -> browserProfile`
    resolver now exists
- Verification:
  - docs/planning only
- Notes:
  - next recommended slice is the first execution-adjacent agent-selection
    plumbing without behavior changes

## 2026-04-03 09:02 CDT

- Focus:
  - thread one optional agent selection into a real execution-adjacent
    resolution path without adding agent execution behavior
- What changed:
  - updated [src/config/model.ts](/home/ecochran76/workspace.local/oracle/src/config/model.ts)
    so shared runtime-profile selection now accepts:
    - `explicitAgentId`
    and resolves it through:
    - `agent -> runtimeProfile -> browserProfile`
  - updated [src/schema/resolver.ts](/home/ecochran76/workspace.local/oracle/src/schema/resolver.ts)
    so `resolveConfig(...)` now threads optional CLI agent selection into the
    shared resolver path before runtime/browser overrides are applied
  - updated [bin/auracall.ts](/home/ecochran76/workspace.local/oracle/bin/auracall.ts)
    to add:
    - `--agent <name>`
    as a selection-only seam
  - expanded:
    - [tests/configModel.test.ts](/home/ecochran76/workspace.local/oracle/tests/configModel.test.ts)
    - [tests/schema/resolver.test.ts](/home/ecochran76/workspace.local/oracle/tests/schema/resolver.test.ts)
    to pin:
    - explicit agent -> runtime profile resolution
    - explicit `--profile` precedence above `--agent`
  - updated [docs/configuration.md](/home/ecochran76/workspace.local/oracle/docs/configuration.md)
    to describe the new selection semantics and their limits
- Verification:
  - `pnpm vitest run tests/configModel.test.ts tests/schema/resolver.test.ts tests/config.test.ts tests/cli/configCommand.test.ts --maxWorkers 1`
  - `pnpm run check`
- Notes:
  - this is still not agent execution
  - it is the first execution-adjacent consumer of the shared
    `agent -> runtimeProfile -> browserProfile` seam

## 2026-04-03 09:14 CDT

- Focus:
  - make the new `--agent` selection seam visible in the main troubleshooting
    reports
- What changed:
  - updated [src/cli/configCommand.ts](/home/ecochran76/workspace.local/oracle/src/cli/configCommand.ts)
    so:
    - `config show` now surfaces the currently selected agent resolution
    - `config doctor` now surfaces the currently selected agent resolution
  - updated [bin/auracall.ts](/home/ecochran76/workspace.local/oracle/bin/auracall.ts)
    to pass the optional CLI `--agent` selection through to those report
    builders
  - expanded [tests/cli/configCommand.test.ts](/home/ecochran76/workspace.local/oracle/tests/cli/configCommand.test.ts)
    to pin:
    - selected-agent text output
    - selected-agent JSON contract fields
  - updated [docs/configuration.md](/home/ecochran76/workspace.local/oracle/docs/configuration.md)
    to describe the new troubleshooting visibility
- Verification:
  - `pnpm vitest run tests/cli/configCommand.test.ts tests/configModel.test.ts tests/schema/resolver.test.ts tests/config.test.ts --maxWorkers 1`
  - `pnpm run check`
- Notes:
  - this remains selection/reporting only
  - it does not add separate agent runtime behavior

## 2026-04-03 09:24 CDT

- Focus:
  - preserve selected-agent provenance in stored session metadata
- What changed:
  - updated [src/sessionManager.ts](/home/ecochran76/workspace.local/oracle/src/sessionManager.ts)
    so stored run options now persist:
    - `selectedAgentId`
  - updated [bin/auracall.ts](/home/ecochran76/workspace.local/oracle/bin/auracall.ts)
    so both:
    - normal session creation
    - managed browser verification session creation
    pass through the optional selected agent id
  - expanded [tests/sessionManager.test.ts](/home/ecochran76/workspace.local/oracle/tests/sessionManager.test.ts)
    to pin stored metadata persistence for selected-agent provenance
  - updated [docs/configuration.md](/home/ecochran76/workspace.local/oracle/docs/configuration.md)
    to note that detached runs and postmortems now preserve the agent
    selection source
- Verification:
  - `pnpm vitest run tests/sessionManager.test.ts tests/cli/configCommand.test.ts tests/schema/resolver.test.ts tests/configModel.test.ts --maxWorkers 1`
  - `pnpm run check`
- Notes:
  - this still does not add agent execution behavior
  - it closes the provenance gap between runtime selection and stored session
    metadata

## 2026-04-03 09:12 CDT

- Focus:
  - surface stored selected-agent provenance in session/status output
- What changed:
  - updated [src/cli/sessionCommand.ts](/home/ecochran76/workspace.local/oracle/src/cli/sessionCommand.ts)
    so session/status JSON now includes:
    - `selectedAgentId`
    as a normalized top-level field beside the raw stored options
  - updated [src/cli/sessionDisplay.ts](/home/ecochran76/workspace.local/oracle/src/cli/sessionDisplay.ts)
    so human-readable:
    - `auracall status`
    - `auracall session <id>`
    now print selected-agent provenance when present
  - expanded:
    - [tests/cli/sessionCommand.test.ts](/home/ecochran76/workspace.local/oracle/tests/cli/sessionCommand.test.ts)
    - [tests/cli/sessionDisplay.coverage.test.ts](/home/ecochran76/workspace.local/oracle/tests/cli/sessionDisplay.coverage.test.ts)
    to pin both JSON and human-readable provenance output
  - updated [docs/configuration.md](/home/ecochran76/workspace.local/oracle/docs/configuration.md)
    to document the new session/status visibility
- Verification:
  - `pnpm vitest run tests/cli/sessionCommand.test.ts tests/cli/sessionDisplay.coverage.test.ts tests/sessionManager.test.ts --maxWorkers 1`
  - `pnpm run check`
- Notes:
  - this remains provenance/reporting only
  - it does not change session replay or agent execution semantics

## 2026-04-03 09:18 CDT

- Focus:
  - pause to audit the current agent-selection work against the roadmap before
    opening another seam by inertia
- What changed:
  - updated planning docs to record that the current agent-selection/provenance
    checkpoint is complete enough:
    - real config/runtime resolution now accepts `--agent`
    - explicit `--profile` still wins
    - config/session/status surfaces now expose the selected-agent chain
    - session metadata now preserves `selectedAgentId`
  - updated:
    - [ROADMAP.md](/home/ecochran76/workspace.local/oracle/ROADMAP.md)
    - [next-execution-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/next-execution-plan.md)
    - [config-model-refactor-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/config-model-refactor-plan.md)
    to recommend the next methodical choice:
    - first shared agent-aware runtime helper
    before
    - team-side selection/readiness seams
- Verification:
  - docs/planning only
- Notes:
  - this keeps the execution board aligned with the code before starting the
    next helper slice

## 2026-04-03 10:07 CDT

- Focus:
  - land the first shared agent-aware runtime helper without introducing agent
    execution behavior
- What changed:
  - added `resolveRuntimeSelection(...)` in
    [src/config/model.ts](/home/ecochran76/workspace.local/oracle/src/config/model.ts)
    as the first shared bundle for:
    - selected agent
    - resolved AuraCall runtime profile
    - resolved browser profile
    - inherited default service
  - rewired real config/runtime resolution in
    [src/schema/resolver.ts](/home/ecochran76/workspace.local/oracle/src/schema/resolver.ts)
    so `applyOracleProfile(...)` now consumes that shared selection bundle
    instead of reconstructing runtime-profile selection ad hoc
  - rewired config inspection/report assembly in
    [src/cli/configCommand.ts](/home/ecochran76/workspace.local/oracle/src/cli/configCommand.ts)
    so `config show`, `config doctor`, and bridge summaries consume the same
    runtime-selection helper
  - expanded
    [tests/configModel.test.ts](/home/ecochran76/workspace.local/oracle/tests/configModel.test.ts)
    with direct coverage for:
    - explicit `--agent`
    - explicit `--profile` winning over `--agent`
- Verification:
  - `pnpm vitest run tests/configModel.test.ts tests/schema/resolver.test.ts tests/config.test.ts tests/cli/configCommand.test.ts --maxWorkers 1`
  - `pnpm run check`
- Notes:
  - this is still selection/runtime plumbing only
  - it does not add agent execution mode

## 2026-04-03 10:32 CDT

- Focus:
  - carry the shared runtime-selection seam into the browser-facing
    profile-resolution layer
- What changed:
  - added `resolveSelectedBrowserProfileResolution(...)` in
    [src/browser/service/profileResolution.ts](/home/ecochran76/workspace.local/oracle/src/browser/service/profileResolution.ts)
    as the first browser-facing helper that combines:
    - shared runtime selection
    - resolved browser-profile layering
    - explicit runtime-profile override support for call sites that already
      hold a selected AuraCall runtime profile object
  - rewired
    [src/browser/service/profileConfig.ts](/home/ecochran76/workspace.local/oracle/src/browser/service/profileConfig.ts)
    to consume that helper instead of rebuilding browser-profile resolution
    directly
  - expanded
    [tests/browser/profileResolution.test.ts](/home/ecochran76/workspace.local/oracle/tests/browser/profileResolution.test.ts)
    with direct coverage for:
    - explicit `--agent` browser-profile resolution
    - explicit `--profile` winning over `--agent` in browser-profile
      resolution
- Verification:
  - `pnpm vitest run tests/browser/profileResolution.test.ts tests/browser/profileConfig.test.ts tests/configModel.test.ts tests/schema/resolver.test.ts tests/config.test.ts tests/cli/configCommand.test.ts --maxWorkers 1`
  - `pnpm run check`
- Notes:
  - the first draft dropped the explicit runtime-profile object that
    `profileConfig.ts` already receives
  - the final helper keeps that override while still centralizing agent-aware
    selection identity

## 2026-04-03 10:42 CDT

- Focus:
  - preserve selected-agent provenance in the browser run/session config seam
    itself, not only in outer session metadata
- What changed:
  - added `selectedAgentId` to the browser config/session types in:
    - [src/browser/types.ts](/home/ecochran76/workspace.local/oracle/src/browser/types.ts)
    - [src/sessionManager.ts](/home/ecochran76/workspace.local/oracle/src/sessionManager.ts)
  - updated
    [src/cli/browserConfig.ts](/home/ecochran76/workspace.local/oracle/src/cli/browserConfig.ts)
    so `buildBrowserConfig(...)` carries `selectedAgentId` into the actual
    browser session config object
  - updated the real browser-config call sites in
    [bin/auracall.ts](/home/ecochran76/workspace.local/oracle/bin/auracall.ts)
    so:
    - normal browser runs
    - setup verification runs
    - Grok conversation/browser helper runs
    all preserve selected-agent provenance in the browser config object itself
  - expanded tests in:
    - [tests/cli/browserConfig.test.ts](/home/ecochran76/workspace.local/oracle/tests/cli/browserConfig.test.ts)
    - [tests/browser/config.test.ts](/home/ecochran76/workspace.local/oracle/tests/browser/config.test.ts)
- Verification:
  - `pnpm vitest run tests/cli/browserConfig.test.ts tests/browser/config.test.ts tests/configModel.test.ts tests/schema/resolver.test.ts tests/sessionManager.test.ts --maxWorkers 1`
  - `pnpm run check`
- Notes:
  - this still does not add agent execution behavior
  - it makes the browser-runtime config contract agent-aware for future runtime
    seams without relying only on outer session metadata

## 2026-04-03 10:45 CDT

- Focus:
  - expose selected-agent provenance in browser-local runtime metadata so
    execution diagnostics can consume it without leaving the browser seam
- What changed:
  - added `selectedAgentId` to browser runtime metadata in:
    - [src/browser/types.ts](/home/ecochran76/workspace.local/oracle/src/browser/types.ts)
    - [src/sessionManager.ts](/home/ecochran76/workspace.local/oracle/src/sessionManager.ts)
  - updated browser runtime hint emission in
    [src/browser/index.ts](/home/ecochran76/workspace.local/oracle/src/browser/index.ts)
    across:
    - managed ChatGPT browser runs
    - remote ChatGPT browser runs
    - remote Grok browser runs
    - managed Grok browser runs
    so runtime hints now include `selectedAgentId` from the browser config
  - expanded tests in:
    - [tests/browser/sessionRunner.test.ts](/home/ecochran76/workspace.local/oracle/tests/browser/sessionRunner.test.ts)
    - [tests/cli/sessionRunner.test.ts](/home/ecochran76/workspace.local/oracle/tests/cli/sessionRunner.test.ts)
    to pin both runtime-hint persistence and browser-failure runtime metadata
    with selected-agent provenance
- Verification:
  - `pnpm vitest run tests/browser/sessionRunner.test.ts tests/cli/sessionRunner.test.ts tests/sessionManager.test.ts tests/cli/browserConfig.test.ts tests/browser/config.test.ts --maxWorkers 1`
  - `pnpm run check`
- Notes:
  - this keeps the agent-aware runtime seam local to browser execution
    diagnostics
  - it still does not introduce separate agent execution behavior

## 2026-04-03 10:50 CDT

- Focus:
  - surface browser-local selected-agent provenance in session/status
    troubleshooting output
- What changed:
  - added normalized `runtimeSelectedAgentId` to session/status JSON in
    [src/cli/sessionCommand.ts](/home/ecochran76/workspace.local/oracle/src/cli/sessionCommand.ts)
  - updated
    [src/cli/sessionDisplay.ts](/home/ecochran76/workspace.local/oracle/src/cli/sessionDisplay.ts)
    so human-readable output now prints browser-local selected-agent
    provenance only when it adds information beyond the original request
    options:
    - `runtime agent: ...` in status rows
    - `Runtime-selected agent: ...` in attached session metadata
  - expanded:
    - [tests/cli/sessionDisplay.coverage.test.ts](/home/ecochran76/workspace.local/oracle/tests/cli/sessionDisplay.coverage.test.ts)
    - [tests/cli/sessionCommand.test.ts](/home/ecochran76/workspace.local/oracle/tests/cli/sessionCommand.test.ts)
    to pin both the conditional text output and the normalized JSON field
- Verification:
  - `pnpm vitest run tests/cli/sessionDisplay.coverage.test.ts tests/cli/sessionCommand.test.ts tests/browser/sessionRunner.test.ts tests/cli/sessionRunner.test.ts --maxWorkers 1`
  - `pnpm run check`
- Notes:
  - this keeps postmortem output aligned with the new browser-local runtime
    provenance seam
  - it avoids duplicating the same agent line when runtime metadata does not
    add new information

## 2026-04-03 10:52 CDT

- Focus:
  - pause to audit the current agent-selection/runtime work against the roadmap
    before opening another seam by inertia
- What changed:
  - updated planning docs to record that the agent-selection/provenance track
    is now complete enough through the lower execution layers:
    - shared runtime selection helper
    - browser-facing runtime selection helper
    - browser config provenance
    - browser runtime metadata provenance
    - session/status postmortem visibility
  - updated:
    - [ROADMAP.md](/home/ecochran76/workspace.local/oracle/ROADMAP.md)
    - [docs/dev/next-execution-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/next-execution-plan.md)
    - [docs/dev/config-model-refactor-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/config-model-refactor-plan.md)
    to recommend the next bounded architecture slice:
    - first team-side readiness seam
    instead of
    - more agent-side provenance polishing
- Verification:
  - docs/planning only
- Notes:
  - this keeps the execution board aligned with the code now that agent-aware
    runtime/browser plumbing is established enough

## 2026-04-03 11:09 CDT

- Focus:
  - take the first bounded team-side readiness seam now that lower agent-side
    runtime provenance is in place
- What changed:
  - added shared team selection helpers in
    [src/config/model.ts](/home/ecochran76/workspace.local/oracle/src/config/model.ts):
    - `getTeam(...)`
    - `resolveTeamSelection(...)`
  - `resolveTeamSelection(...)` now gives one canonical read-only bundle for:
    - `teamId`
    - `agentIds`
    - per-member resolution through
      `agent -> AuraCall runtime profile -> browser profile`
    - `exists`
  - updated [src/cli/configCommand.ts](/home/ecochran76/workspace.local/oracle/src/cli/configCommand.ts)
    so `profile list` consumes that helper instead of rebuilding team-member
    resolution from projected arrays
  - added direct coverage in
    [tests/configModel.test.ts](/home/ecochran76/workspace.local/oracle/tests/configModel.test.ts)
- Verification:
  - `pnpm vitest run tests/configModel.test.ts tests/cli/configCommand.test.ts tests/config.test.ts tests/schema/resolver.test.ts --maxWorkers 1`
  - `pnpm run check`
- Notes:
  - this keeps the first team-side seam read-only and selection-oriented
  - it also makes the CLI/report layer depend on one canonical team resolver
    instead of the internal layout of `projectedModel.teams`

## 2026-04-03 11:16 CDT

- Focus:
  - mirror the new team-selection helper into `config show` so troubleshooting
    has the same normalized team contract that agents already have
- What changed:
  - updated [src/cli/configCommand.ts](/home/ecochran76/workspace.local/oracle/src/cli/configCommand.ts)
    so `buildConfigShowReport(...)` now includes `resolvedTeams[]` from
    `resolveTeamSelection(...)`
  - updated the human-readable `config show` formatter to print resolved team
    membership and per-member inherited runtime/browser/default-service context
  - expanded [tests/cli/configCommand.test.ts](/home/ecochran76/workspace.local/oracle/tests/cli/configCommand.test.ts)
    to pin both the JSON report shape and text output
  - updated [docs/configuration.md](/home/ecochran76/workspace.local/oracle/docs/configuration.md)
    to document the new read-only resolved-team inspection surface
- Verification:
  - `pnpm vitest run tests/cli/configCommand.test.ts tests/configModel.test.ts tests/config.test.ts tests/schema/resolver.test.ts --maxWorkers 1`
  - `pnpm run check`
- Notes:
  - this keeps `config show` symmetric with the earlier `resolvedAgents[]`
    surface
  - the change is still inspection-only; no team execution behavior was added

## 2026-04-03 11:42 CDT

- Focus:
  - add the first non-reporting team helper so future team execution/planning
    work can ask which runtime/browser contexts a team would activate
- What changed:
  - added `resolveTeamRuntimeSelections(...)` in
    [src/config/model.ts](/home/ecochran76/workspace.local/oracle/src/config/model.ts)
  - the helper now returns one read-only bundle for:
    - `teamId`
    - `agentIds`
    - per-member resolved runtime selection
    - `exists`
  - importantly, unresolved team members now stay unresolved in that helper
    instead of falling back to the active default runtime profile
  - added direct coverage in
    [tests/configModel.test.ts](/home/ecochran76/workspace.local/oracle/tests/configModel.test.ts)
- Verification:
  - `pnpm vitest run tests/configModel.test.ts tests/cli/configCommand.test.ts tests/config.test.ts tests/schema/resolver.test.ts --maxWorkers 1`
  - `pnpm run check`
- Notes:
  - this is still a pure model-layer seam; no CLI or runtime execution behavior
    changed in this slice

## 2026-04-03 11:49 CDT

- Focus:
  - audit the team-ready work against the roadmap and lock the next step before
    adding any `--team` runtime semantics
- What changed:
  - added
    [docs/dev/team-config-boundary-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/team-config-boundary-plan.md)
    as the source of truth for:
    - what teams own
    - what teams inherit through agents/runtime profiles
    - what must remain owned below the team layer
    - what must remain deferred to the future service/runners layer
  - updated:
    - [ROADMAP.md](/home/ecochran76/workspace.local/oracle/ROADMAP.md)
    - [docs/dev/next-execution-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/next-execution-plan.md)
    - [docs/dev/config-model-refactor-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/config-model-refactor-plan.md)
    to mark the first team-side readiness seam complete enough and to make the
    next recommendation explicit:
    - define team execution boundary first
    - only then add a bounded read-only `--team` resolution path
- Verification:
  - docs/planning only
- Notes:
  - this also incorporates the future service-mode note:
    runners and parallelism belong to a later orchestration layer, not today's
    team config semantics

## 2026-04-03 12:59 CDT

- Focus:
  - add the first bounded `--team` path, but keep it strictly in
    inspection/runtime-planning surfaces
- What changed:
  - added `--team <name>` as a read-only planning selector in
    [bin/auracall.ts](/home/ecochran76/workspace.local/oracle/bin/auracall.ts)
    for:
    - `config show`
    - `config doctor`
  - updated [src/cli/configCommand.ts](/home/ecochran76/workspace.local/oracle/src/cli/configCommand.ts)
    so both report builders now expose:
    - `selectedTeam`
    - per-member runtime planning state from
      `resolveTeamRuntimeSelections(...)`
  - kept active runtime selection unchanged:
    - `--team` does not choose a member
    - `--team` does not override `--profile`
    - `--team` does not override `--agent`
  - expanded [tests/cli/configCommand.test.ts](/home/ecochran76/workspace.local/oracle/tests/cli/configCommand.test.ts)
    to pin the planning-only semantics
  - updated [docs/configuration.md](/home/ecochran76/workspace.local/oracle/docs/configuration.md)
    to document `--team` as an inspection/planning surface only
- Verification:
  - `pnpm vitest run tests/cli/configCommand.test.ts tests/configModel.test.ts tests/config.test.ts tests/schema/resolver.test.ts --maxWorkers 1`
  - `pnpm run check`
- Notes:
  - this is the first public `--team` seam, but it is intentionally not a team
    execution feature

## 2026-04-03 13:15 CDT

- Focus:
  - harden the remaining ChatGPT root rename hotspot without widening the
    workflow surface
- What changed:
  - tightened the ChatGPT rename-editor readiness gate in
    [src/browser/providers/chatgptAdapter.ts](/home/ecochran76/workspace.local/oracle/src/browser/providers/chatgptAdapter.ts)
    so it only accepts the real inline rename input:
    - `input[name="title-editor"]`
    - removed the prior broad fallbacks that treated any active text input or
      selected text as rename-editor readiness
  - added `matchesChatgptRenameEditorProbe(...)` and focused coverage in
    [tests/browser/chatgptAdapter.test.ts](/home/ecochran76/workspace.local/oracle/tests/browser/chatgptAdapter.test.ts)
  - replaced the ad hoc rename-persistence probe with the existing canonical
    `matchesChatgptConversationTitleProbe(...)` semantics by adding one shared
    title-probe reader and reusing it in:
    - inline post-submit checks
    - authoritative rename persistence verification after list re-anchor
  - strengthened the authoritative root verification path so, after the
    list-page refresh, root renames require the matching conversation row to
    reappear at the top instead of trusting route/title fallback alone
- Verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - `pnpm run check`
- Notes:
  - this stays provider-local on purpose; the remaining fix is specific to
    ChatGPT's inline rename surface rather than a proven browser-service
    abstraction

## 2026-04-03 13:18 CDT

- Focus:
  - live-smoke the tightened ChatGPT root rename path on the managed WSL
    Chrome profile
- What changed:
  - ran the narrow phased ChatGPT acceptance root rename smoke:
    - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx scripts/chatgpt-acceptance.ts --phase root-base --state-file docs/dev/tmp/chatgpt-rename-smoke-state.json`
  - validated the exact hardened path against a disposable real root
    conversation:
    - created root conversation `69d00432-989c-8328-9127-a504798cd2bd`
    - renamed it to `AC GPT C vdaxvw`
    - acceptance phase passed cleanly
- Verification:
  - runner result: `PASS (root-base)`
  - persisted state file:
    [chatgpt-rename-smoke-state.json](/home/ecochran76/workspace.local/oracle/docs/dev/tmp/chatgpt-rename-smoke-state.json)
- Notes:
  - this proves the stricter `title-editor` gate and canonical title-persistence
    matcher work on the current live ChatGPT root rename surface, not just in
    unit coverage

## 2026-04-03 13:34 CDT

- Focus:
  - double-check the same ChatGPT root rename hardening on the second managed
    browser profile/account to confirm multi-window and multi-account handling
    stayed green
- What changed:
  - ran the same narrow root rename smoke on the explicit
    `wsl-chrome-2` AuraCall runtime profile:
    - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx scripts/chatgpt-acceptance.ts --profile wsl-chrome-2 --phase root-base --state-file docs/dev/tmp/chatgpt-rename-smoke-state-wsl-chrome-2.json`
  - validated the second managed browser profile/account path against a real
    disposable root conversation:
    - created root conversation `69d007dc-7fe0-8332-938f-de36ff253aca`
    - renamed it to `AC GPT C mxhbbw`
    - acceptance phase passed cleanly on `wsl-chrome-2`
- Verification:
  - runner result: `PASS (root-base)`
  - persisted state file:
    [chatgpt-rename-smoke-state-wsl-chrome-2.json](/home/ecochran76/workspace.local/oracle/docs/dev/tmp/chatgpt-rename-smoke-state-wsl-chrome-2.json)
- Notes:
  - this is the explicit multi-window/multi-account proof for the rename
    hardening slice:
    - `default` root rename still green
    - `wsl-chrome-2` root rename also green

## 2026-04-03 13:43 CDT

- Focus:
  - harden the adjacent ChatGPT root delete post-trigger path and prove it on
    the second managed browser profile/account
- What changed:
  - rewired ChatGPT root delete confirmation detection in
    [src/browser/providers/chatgptAdapter.ts](/home/ecochran76/workspace.local/oracle/src/browser/providers/chatgptAdapter.ts)
    to use one shared delete-confirmation probe reader plus the existing
    `matchesChatgptDeleteConfirmationProbe(...)` matcher
  - removed the old duplicate in-page delete-confirmation expression so the
    delete flow no longer has a separate confirmation semantic path from tests
  - kept the persisted-delete verification surface unchanged:
    - delete still must disappear from both the active route and the visible
      conversation list
  - live-smoked the hardened delete path by reusing the disposable
    `wsl-chrome-2` root conversation from the earlier rename smoke:
    - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx scripts/chatgpt-acceptance.ts --profile wsl-chrome-2 --phase cleanup --resume docs/dev/tmp/chatgpt-rename-smoke-state-wsl-chrome-2.json`
- Verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
  - `pnpm run check`
  - live runner result:
    - `PASS (cleanup)` on `wsl-chrome-2`
- Notes:
  - this keeps the ChatGPT delete hardening bounded:
    - confirmation readiness is now canonicalized
    - persisted-deletion post-condition stays on the existing list/route
      absence proof

## 2026-04-03 15:06 CDT

- Focus:
  - harden ChatGPT project-source persistence verification so add/remove share
    one canonical post-reload source-name truth
- What changed:
  - added `findChatgptProjectSourceName(...)` in
    [src/browser/providers/chatgptAdapter.ts](/home/ecochran76/workspace.local/oracle/src/browser/providers/chatgptAdapter.ts)
    as the normalized project-source matcher
  - rewired project-source persistence checks to use the normalized source list
    after a sources-tab reload instead of separate ad hoc persisted-present and
    persisted-removed DOM expression loops
  - kept the immediate in-surface preview/disappear checks unchanged:
    - upload still must show the source preview before persistence polling
    - remove still must disappear from the live source list before persistence
      polling
  - added focused matcher coverage in
    [tests/browser/chatgptAdapter.test.ts](/home/ecochran76/workspace.local/oracle/tests/browser/chatgptAdapter.test.ts)
  - live-smoked the changed surface on `wsl-chrome-2` with the disposable
    project acceptance phase:
    - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx scripts/chatgpt-acceptance.ts --profile wsl-chrome-2 --phase project --state-file docs/dev/tmp/chatgpt-project-sources-smoke-state-wsl-chrome-2.json`
- Verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
  - `pnpm run check`
  - live runner result:
    - `PASS (project)` on `wsl-chrome-2`
  - persisted state file:
    [chatgpt-project-sources-smoke-state-wsl-chrome-2.json](/home/ecochran76/workspace.local/oracle/docs/dev/tmp/chatgpt-project-sources-smoke-state-wsl-chrome-2.json)
- Notes:
  - the important live proof here is that the phase moved cleanly through:
    - project create/rename
    - project source add
    - project source remove
    - instructions set/get

## 2026-04-03 15:10 CDT

- Focus:
  - pause implementation and audit the remaining ChatGPT hardening hotspots
    against the actual adapter state
- What changed:
  - reviewed the current ChatGPT hardening plan and the remaining high-signal
    recovery/persistence call sites in
    [src/browser/providers/chatgptAdapter.ts](/home/ecochran76/workspace.local/oracle/src/browser/providers/chatgptAdapter.ts)
  - confirmed that the recently landed canonical seams now cover:
    - root rename editor readiness
    - root rename persistence
    - root delete confirmation
    - project-source persisted presence/absence after sources-tab reload
  - updated
    [chatgpt-hardening-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/chatgpt-hardening-plan.md)
    with the current live-proof status and the ranked next candidates
- Audit result:
  - strongest remaining bounded mutation candidate:
    - project settings / instructions persistence and reopen-to-verify flow
  - broader but riskier follow-on candidate:
    - context/artifact read recovery consistency
  - lower-priority maintenance:
    - richer operator-visible recovery-action diagnostics only if a concrete gap
      appears while touching the above
- Verification:
  - docs/audit only
- Notes:
  - recommendation stays methodical:
    take project settings / instructions persistence next instead of jumping
    straight back into the broader read/artifact recovery surfaces

## 2026-04-03 16:24 CDT

- Focus:
  - harden ChatGPT project settings persistence so project rename and
    instructions writes share one authoritative reopen-to-verify contract
- What changed:
  - added `matchesChatgptProjectSettingsSnapshot(...)` in
    [src/browser/providers/chatgptAdapter.ts](/home/ecochran76/workspace.local/oracle/src/browser/providers/chatgptAdapter.ts)
    as the canonical persisted-settings matcher
  - replaced the split field-specific persistence helpers with one shared
    `waitForProjectSettingsApplied(...)` path built on:
    - reopen project settings
    - read one settings snapshot
    - compare name and/or instructions through the same matcher
  - rewired:
    - project rename persistence
    - project instructions persistence
    - project creation follow-on instructions persistence
    to use that shared snapshot verifier
  - during live validation, the earlier project-source normalization-only
    persistence check regressed on `wsl-chrome-2`, so the shared
    project-source persistence helper now uses:
    - normalized source list as primary truth
    - the old DOM expression as bounded fallback
    to preserve the already-green project phase while keeping one shared helper
  - added focused matcher coverage in
    [tests/browser/chatgptAdapter.test.ts](/home/ecochran76/workspace.local/oracle/tests/browser/chatgptAdapter.test.ts)
  - live-smoked the full bounded project phase on `wsl-chrome-2` after the
    repair:
    - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx scripts/chatgpt-acceptance.ts --profile wsl-chrome-2 --phase project --state-file docs/dev/tmp/chatgpt-project-settings-smoke-state-wsl-chrome-2.json`
- Verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
  - `pnpm run check`
  - live runner result:
    - `PASS (project)` on `wsl-chrome-2`
  - persisted state file:
    [chatgpt-project-settings-smoke-state-wsl-chrome-2.json](/home/ecochran76/workspace.local/oracle/docs/dev/tmp/chatgpt-project-settings-smoke-state-wsl-chrome-2.json)
- Notes:
  - this live proof covered the exact settings-slice surfaces plus incidental
    regression coverage for project sources:
    - project rename
    - project source add/remove
    - instructions set/get

## 2026-04-03 16:28 CDT

- Focus:
  - re-audit the remaining ChatGPT hardening line after the latest bounded
    mutation slices
- What changed:
  - reviewed the current hardening plan against the current adapter state in
    [src/browser/providers/chatgptAdapter.ts](/home/ecochran76/workspace.local/oracle/src/browser/providers/chatgptAdapter.ts)
  - confirmed the mutation-oriented persistence surfaces are now substantially
    better covered by canonical seams:
    - root rename readiness + persistence
    - root delete confirmation
    - project-source persisted presence/absence after reload
    - project settings / instructions persisted snapshot verification
  - updated
    [chatgpt-hardening-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/chatgpt-hardening-plan.md)
    to re-rank the remaining work
- Audit result:
  - next highest-value slice is now the broader read-path recovery consistency
    line, especially:
    - `readChatgptConversationContextWithClient(...)`
    - artifact materialization paths under
      `withChatgptBlockingSurfaceRecovery(...)`
  - lower-priority follow-on remains:
    - richer operator-visible recovery-action diagnostics only if a concrete
      gap appears while touching those read paths
- Verification:
  - docs/audit only
- Notes:
  - recommendation now shifts from mutation hardening to read-side recovery
    consistency before any broader hostile-state smoke campaign

## 2026-04-03 17:10 CDT

- Focus:
  - land the first bounded ChatGPT read-side recovery consistency slice
- What changed:
  - added a shared read-surface helper in
    [src/browser/providers/chatgptAdapter.ts](/home/ecochran76/workspace.local/oracle/src/browser/providers/chatgptAdapter.ts)
    for conversation-scoped read paths
  - the helper now owns the common fallback order:
    - navigate to the conversation route
    - wait for the conversation surface
    - reload once if needed
    - reopen the conversation route once if needed
  - rewired the shared helper into:
    - `readChatgptConversationContextWithClient(...)`
    - `materializeChatgptConversationArtifactWithClient(...)`
    - `listConversationFiles(...)`
- Verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
  - `pnpm run check`
  - live smoke on `wsl-chrome-2`:
    - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx scripts/chatgpt-acceptance.ts --profile wsl-chrome-2 --phase root-base --state-file docs/dev/tmp/chatgpt-read-surface-smoke-state-wsl-chrome-2.json`
    - result: `PASS (root-base)`
  - persisted state file:
    [chatgpt-read-surface-smoke-state-wsl-chrome-2.json](/home/ecochran76/workspace.local/oracle/docs/dev/tmp/chatgpt-read-surface-smoke-state-wsl-chrome-2.json)
- Notes:
  - this live proof covered the exact read-side surface touched by the slice:
    `conversations context get` on the `wsl-chrome-2` managed browser profile

## 2026-04-03 17:18 CDT

- Focus:
  - re-audit the remaining ChatGPT read-side hardening line after the shared
    conversation-surface readiness slice
- What changed:
  - reviewed the remaining read-path hotspots in
    [src/browser/providers/chatgptAdapter.ts](/home/ecochran76/workspace.local/oracle/src/browser/providers/chatgptAdapter.ts)
    after `refactor: share chatgpt read-surface readiness`
  - updated
    [chatgpt-hardening-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/chatgpt-hardening-plan.md)
    to reflect the narrower remaining gap
- Audit result:
  - route/surface recovery is now centralized for:
    - context reads
    - file listing
    - artifact materialization entry
  - the strongest remaining read-side drift is now artifact-specific, not
    conversation-route readiness
  - next bounded slice should focus on:
    - image artifact readiness/src resolution
    - spreadsheet/download button tagging/readiness
    - canvas enrichment fallback consistency
- Verification:
  - docs/audit only
- Notes:
  - recommendation is to keep the next slice inside artifact materialization
    semantics and avoid reopening route-level recovery unless a new live
    failure proves the shared read-surface seam insufficient

## 2026-04-03 17:29 CDT

- Focus:
  - take the first artifact-local ChatGPT hardening slice
- What changed:
  - added a canonical image artifact matcher in
    [src/browser/providers/chatgptAdapter.ts](/home/ecochran76/workspace.local/oracle/src/browser/providers/chatgptAdapter.ts)
    so image readiness and image `src` resolution now share the same identity
    contract
  - rewired:
    - `waitForChatgptImageArtifactWithClient(...)`
    - `readChatgptImageArtifactSrcWithClient(...)`
    to use the same matcher instead of duplicating separate file-id/title
    matching logic
  - added focused coverage in
    [tests/browser/chatgptAdapter.test.ts](/home/ecochran76/workspace.local/oracle/tests/browser/chatgptAdapter.test.ts)
- Verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
  - `pnpm run check`
- Notes:
  - this slice is code-level verified only
  - there is not yet a narrow existing live smoke that reliably exercises image
    artifact materialization without reopening a broader acceptance surface

## 2026-04-03 17:40 CDT

- Focus:
  - take the adjacent artifact-local download/spreadsheet button identity slice
- What changed:
  - added a canonical download-button matcher in
    [src/browser/providers/chatgptAdapter.ts](/home/ecochran76/workspace.local/oracle/src/browser/providers/chatgptAdapter.ts)
    for assistant artifact buttons
  - rewired the regular download-button tagger and the spreadsheet-card tagger
    through one shared button-tagging path so they now share:
    - assistant-turn scoping
    - message/turn identity matching
    - optional button-index matching
  - added focused coverage in
    [tests/browser/chatgptAdapter.test.ts](/home/ecochran76/workspace.local/oracle/tests/browser/chatgptAdapter.test.ts)
- Verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
  - `pnpm run check`
- Notes:
  - this slice is also code-level verified only
  - there is still no narrow existing live smoke for isolated download-button
    artifact materialization without reopening a broader acceptance surface

## 2026-04-03 17:46 CDT

- Focus:
  - take the remaining artifact-local canvas enrichment consistency slice
- What changed:
  - added a shared canvas content resolver in
    [src/browser/providers/chatgptAdapter.ts](/home/ecochran76/workspace.local/oracle/src/browser/providers/chatgptAdapter.ts)
    so canvas materialization now reads through the same enrichment path as the
    broader payload+probe merge logic
  - rewired canvas artifact materialization to use that resolver instead of
    partially reimplementing the metadata-vs-probe fallback locally
  - added focused coverage in
    [tests/browser/chatgptAdapter.test.ts](/home/ecochran76/workspace.local/oracle/tests/browser/chatgptAdapter.test.ts)
    for:
    - existing content winning over probes
    - title-only fallback when no textdoc id is present
- Verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
  - `pnpm run check`
- Notes:
  - this slice is also code-level verified only
  - there is still no narrow existing live smoke for isolated canvas artifact
    materialization without reopening a broader acceptance surface

## 2026-04-03 18:27 CDT

- Focus:
  - convert the next ChatGPT hardening step into a live DOCX artifact proof on
    the `wsl-chrome-2` managed browser profile
- What changed:
  - ran a disposable root ChatGPT conversation on `wsl-chrome-2` asking for a
    short memo surfaced as a downloadable DOCX
  - live conversation:
    `69d04b50-3c88-8325-8240-0d838d47ee50`
  - observed a real transient read-path inconsistency:
    - first standalone `conversations context get` failed with
      `messages not found`
    - `conversations artifacts fetch` on the same conversation succeeded and
      materialized the DOCX
    - immediate standalone `context get` retry then succeeded
  - hardened the ChatGPT retry layer in
    [src/browser/llmService/llmService.ts](/home/ecochran76/workspace.local/oracle/src/browser/llmService/llmService.ts)
    so transient conversation read misses (`content not found` /
    `messages not found`) are treated as retryable ChatGPT read failures
  - added focused retry coverage in
    [tests/browser/llmServiceRateLimit.test.ts](/home/ecochran76/workspace.local/oracle/tests/browser/llmServiceRateLimit.test.ts)
- Verification:
  - `pnpm vitest run tests/browser/llmServiceRateLimit.test.ts tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
  - `pnpm run check`
  - live artifact proof on `wsl-chrome-2`:
    - `conversations artifacts fetch 69d04b50-3c88-8325-8240-0d838d47ee50 --target chatgpt`
    - result: `artifactCount = 2`, `materializedCount = 1`
    - materialized:
      `auracall-artifact-smoke-oxmhrl.docx`
  - follow-up live context proof on the same conversation:
    - `conversations context get 69d04b50-3c88-8325-8240-0d838d47ee50 --target chatgpt --json-only`
    - returned the expected `messages[]` plus both download artifacts
- Notes:
  - the live run also exposed a separate prompt-commit false negative on a
    follow-up turn: ChatGPT had already emitted `DOCX READY oxmhrl`, but the
    prompt commit verifier still rejected the follow-up send
  - that prompt-commit issue is adjacent but separate from the read-side retry
    slice landed here

## 2026-04-03 19:06 CDT

- Focus:
  - harden hot-conversation follow-up sends after the live DOCX proof exposed a
    prompt-commit failure
- What changed:
  - added a pre-submit readiness gate in
    [src/browser/actions/promptComposer.ts](/home/ecochran76/workspace.local/oracle/src/browser/actions/promptComposer.ts)
    so prompt submission now waits for the composer/send surface to settle
    before attempting the send path
  - this specifically avoids falling through to a premature Enter-key fallback
    while the previous turn is still hot or the send surface has not fully
    become ready again
  - added focused coverage in
    [tests/browser/promptComposer.test.ts](/home/ecochran76/workspace.local/oracle/tests/browser/promptComposer.test.ts)
    for:
    - waiting until hot-conversation submit readiness clears
    - accepting immediate readiness when the conversation is already settled
- Verification:
  - `pnpm vitest run tests/browser/promptComposer.test.ts tests/browser/llmServiceRateLimit.test.ts tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
  - `pnpm run check`
  - live hot-conversation follow-up smoke on `wsl-chrome-2`:
    - reused conversation:
      `69d04b50-3c88-8325-8240-0d838d47ee50`
    - prompt:
      `Reply exactly with HOT FOLLOWUP <suffix>.`
    - result:
      submit path succeeded without the earlier prompt-commit failure and
      produced a fresh assistant response on the same thread
- Notes:
  - the returned assistant text in this smoke reused the thread’s existing DOCX
    context rather than following the exact short prompt literally
  - that is a model/conversation-behavior issue, not the prompt-commit failure
    that this slice targeted

## 2026-04-03 19:22 CDT

- Focus:
  - extend the live ChatGPT artifact proof set without opening a new refactor
    track
- What changed:
  - ran a fresh disposable root conversation on `wsl-chrome-2` for a workbook
    artifact:
    - conversation:
      `69d061ea-5098-8326-a2e4-70e38d845190`
    - prompt asked for a 5x5 identity matrix surfaced as
      `auracall-identity-matrix-qmrqpe.xlsx`
  - verified:
    - `conversations context get ... --json-only` surfaced one `spreadsheet`
      artifact
    - `conversations artifacts fetch ...` materialized the workbook
  - ran a fresh disposable root conversation on `wsl-chrome-2` for a generated
    image artifact:
    - conversation:
      `69d06243-62f8-832f-8fc7-cba9e0148044`
    - prompt asked for an image of a kitten ice skating
  - verified:
    - `conversations context get ... --json-only` surfaced one `image`
      artifact with generation metadata
    - `conversations artifacts fetch ...` materialized
      `Kitten enjoying ice skating fun.png`
- Verification:
  - live only
  - `.xlsx` proof:
    - context surfaced:
      `auracall-identity-matrix-qmrqpe.xlsx`
    - artifact fetch materialized:
      [auracall-identity-matrix-qmrqpe.xlsx](/home/ecochran76/.auracall/cache/providers/chatgpt/consult@polymerconsultingroup.com/conversation-attachments/69d061ea-5098-8326-a2e4-70e38d845190/files/3eed3bac-3f0e-459e-8283-2457ede4a6b8-download-sandbox-mnt-data-auracall-identity-matrix-qmrqpe.xlsx/auracall-identity-matrix-qmrqpe.xlsx)
  - image proof:
    - context surfaced one `image` artifact
    - artifact fetch materialized:
      [Kitten enjoying ice skating fun.png](/home/ecochran76/.auracall/cache/providers/chatgpt/consult@polymerconsultingroup.com/conversation-attachments/69d06243-62f8-832f-8fc7-cba9e0148044/files/9973a59b-03ca-44a8-a84a-da184c10e09d-image-sediment-file_00000000276471fba191c8c244886f77/Kitten%20enjoying%20ice%20skating%20fun.png)
- Notes:
  - side finding only:
    - the original browser-mode wrapper for the image-generation prompt
      appeared to linger after the image artifact was already visible and
      fetchable through the direct conversation commands
    - note this for later operator follow-up, but do not make it the next
      default slice

## 2026-04-03 - make team selector precedence explicit without changing runtime behavior

- Current focus:
  - agent/team layering checkpoint
- What changed:
  - added a shared config-model selector policy that makes the current rule
    explicit:
    - runtime selection uses `--profile`, then `--agent`, then config default
    - `--team` remains planning-only
  - wired that policy into `config show` and `config doctor`
  - updated user docs so operator-facing config behavior matches the report
    output
- Verification:
  - `pnpm vitest run tests/configModel.test.ts tests/cli/configCommand.test.ts tests/config.test.ts tests/schema/resolver.test.ts --maxWorkers 1`
  - `pnpm run check`

## 2026-04-03 - record future team orchestration intent

- Current focus:
  - team/service boundary planning
- What changed:
  - updated the team boundary and roadmap docs to make the intended future use
    of teams explicit:
    - divide-and-conquer task decomposition
    - multi-turn automation across agents
    - explicit data handoff between agents
  - kept the execution split explicit:
    - teams express orchestration intent
    - future service mode, runners, and parallelism execute that intent
- Verification:
  - docs only

## 2026-04-03 - define the first team service-execution contract

- Current focus:
  - team/service planning
- What changed:
  - added a new planning doc for future team execution under service mode:
    - sequential-first execution
    - explicit handoff payloads
    - shared run state
    - fail-fast default behavior
    - runner assignment and parallelism kept in the service layer
  - linked that plan from the roadmap and next execution plan so future team
    implementation has a concrete boundary before coding starts
- Verification:
  - docs only

## 2026-04-03 - define the first team-run data model

- Current focus:
  - team/service planning
- What changed:
  - added a code-facing planning doc for the first future team-run data model:
    - `teamRun`
    - `step`
    - `handoff`
    - `sharedState`
  - pinned minimum fields, ownership boundaries, and serialization guidance so
    later service implementation can start from stable entity names instead of
    ad hoc runtime objects
  - linked the new plan from the roadmap and next execution plan
- Verification:
  - docs only

## 2026-04-03 - land the first code-facing team-run types seam

- Current focus:
  - team/service planning
- What changed:
  - added a read-only TypeScript module at
    [src/teams/types.ts](/home/ecochran76/workspace.local/oracle/src/teams/types.ts)
    that mirrors the planned future entity vocabulary:
    - `TeamRun`
    - `TeamRunStep`
    - `TeamRunHandoff`
    - `TeamRunSharedState`
  - added conservative default execution policy constants without attaching
    any runner or service behavior
  - added focused coverage in
    [tests/teams.types.test.ts](/home/ecochran76/workspace.local/oracle/tests/teams.types.test.ts)
- Verification:
  - `pnpm vitest run tests/teams.types.test.ts --maxWorkers 1`
  - `pnpm run check`

## 2026-04-03 - land the matching team-run schema seam

- Current focus:
  - team/service planning
- What changed:
  - added a read-only Zod schema module at
    [src/teams/schema.ts](/home/ecochran76/workspace.local/oracle/src/teams/schema.ts)
    that mirrors the team-run types seam for:
    - `TeamRun`
    - `TeamRunStep`
    - `TeamRunHandoff`
    - `TeamRunSharedState`
  - kept the schema seam local to the team module instead of mixing it into the
    main config schema surface
  - added focused coverage in
    [tests/teams.schema.test.ts](/home/ecochran76/workspace.local/oracle/tests/teams.schema.test.ts)
- Verification:
  - `pnpm vitest run tests/teams.types.test.ts tests/teams.schema.test.ts --maxWorkers 1`
  - `pnpm run check`

## 2026-04-03 - add the first team-run model helper seam

- Current focus:
  - team/service planning
- What changed:
  - added a read-only model helper module at
    [src/teams/model.ts](/home/ecochran76/workspace.local/oracle/src/teams/model.ts)
    with small validated builders for:
    - `createTeamRunStep(...)`
    - `createTeamRunSharedState(...)`
    - `createTeamRunBundle(...)`
  - the bundle factory now turns ordered step inputs into a stable planned
    `teamRun + steps + sharedState` shape using the existing team-run schemas
  - added focused coverage in
    [tests/teams.model.test.ts](/home/ecochran76/workspace.local/oracle/tests/teams.model.test.ts)
- Verification:
  - `pnpm vitest run tests/teams.types.test.ts tests/teams.schema.test.ts tests/teams.model.test.ts --maxWorkers 1`
  - `pnpm run check`

## 2026-04-03 - bridge resolved team selection into planned team runs

- Current focus:
  - team/service planning
- What changed:
  - extended
    [src/teams/model.ts](/home/ecochran76/workspace.local/oracle/src/teams/model.ts)
    with read-only planners that bridge existing config-model team resolution
    into the new team-run model:
    - `createTeamRunBundleFromResolvedTeam(...)`
    - `createTeamRunBundleFromConfig(...)`
  - planned steps now preserve:
    - resolved agent id
    - AuraCall runtime profile
    - browser profile
    - default service
  - unresolved team members are preserved as `blocked` planned steps instead of
    being silently dropped
  - expanded
    [tests/teams.model.test.ts](/home/ecochran76/workspace.local/oracle/tests/teams.model.test.ts)
- Verification:
  - `pnpm vitest run tests/teams.types.test.ts tests/teams.schema.test.ts tests/teams.model.test.ts --maxWorkers 1`
  - `pnpm run check`

## 2026-04-03 - surface planned team runs in config inspection

- Current focus:
  - team/service planning
- What changed:
  - extended
    [src/cli/configCommand.ts](/home/ecochran76/workspace.local/oracle/src/cli/configCommand.ts)
    so `config show --team <name>` now exposes a read-only `plannedTeamRun`
    block built from the new team-run model helpers
  - the report now shows:
    - planned run id
    - ordered steps
    - per-step resolved runtime/browser/service identity
    - blocked unresolved members
  - expanded
    [tests/cli/configCommand.test.ts](/home/ecochran76/workspace.local/oracle/tests/cli/configCommand.test.ts)
- Verification:
  - `pnpm vitest run tests/cli/configCommand.test.ts tests/teams.types.test.ts tests/teams.schema.test.ts tests/teams.model.test.ts --maxWorkers 1`
  - `pnpm run check`

## 2026-04-03 - keep config doctor aligned with planned team-run inspection

- Current focus:
  - team/service planning
- What changed:
  - extended
    [src/cli/configCommand.ts](/home/ecochran76/workspace.local/oracle/src/cli/configCommand.ts)
    so `config doctor --team <name>` now exposes the same read-only
    `plannedTeamRun` bundle already used by `config show --team <name>`
  - factored the inspection-only planner construction into one local helper so
    show/doctor share the same deterministic bundle shape
  - expanded
    [tests/cli/configCommand.test.ts](/home/ecochran76/workspace.local/oracle/tests/cli/configCommand.test.ts)
    to pin:
    - no planned run for non-team doctor reports
    - full planned run parity for selected-team doctor reports
- Verification:
  - `pnpm vitest run tests/cli/configCommand.test.ts tests/teams.types.test.ts tests/teams.schema.test.ts tests/teams.model.test.ts --maxWorkers 1`
  - `pnpm run check`

## 2026-04-03 - add the first service-ready team-run plan seam

- Current focus:
  - team/service planning
- What changed:
  - added a new read-only service-facing helper module at
    [src/teams/service.ts](/home/ecochran76/workspace.local/oracle/src/teams/service.ts)
  - it turns the validated `teamRun + steps + sharedState` bundle into one
    canonical service-ready plan with:
    - ordered `steps`
    - `stepsById`
    - `runnableStepIds`
    - `waitingStepIds`
    - `blockedStepIds`
    - `terminalStepIds`
    - `missingDependencyStepIds`
  - kept the seam non-executing:
    - no runners
    - no queueing
    - no retries
    - no service mode behavior
  - added focused coverage in
    [tests/teams.service.test.ts](/home/ecochran76/workspace.local/oracle/tests/teams.service.test.ts)
- Verification:
  - `pnpm vitest run tests/teams.types.test.ts tests/teams.schema.test.ts tests/teams.model.test.ts tests/teams.service.test.ts --maxWorkers 1`
  - `pnpm run check`

## 2026-04-03 - fold broader platform ideas into the roadmap before more service code

- Current focus:
  - roadmap / sequencing
- What changed:
  - updated [ROADMAP.md](/home/ecochran76/workspace.local/oracle/ROADMAP.md)
    to add explicit future platform tracks for:
    - service mode and runner orchestration
    - durable state and account mirroring
    - external control surfaces (`API`, `MCP`)
    - retrieval and search
    - provider expansion
    - agent orchestration and local actions
  - updated
    [docs/dev/next-execution-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/next-execution-plan.md)
    with:
    - the new platform-priority rationale
    - `Now / Soon / Later` buckets
    - a service/runtime foundation planning slice above further team-service code
- Verification:
  - docs/planning only

## 2026-04-03 - define Gemini as the first bounded provider side track

- Current focus:
  - provider expansion planning
- What changed:
  - added
    [docs/dev/gemini-completion-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/gemini-completion-plan.md)
    to pin a bounded Gemini completion approach
  - the plan records:
    - what already exists in Gemini API and Gemini web/browser paths
    - the likely main risk: architectural drift, not raw missing capability
    - a recommended slice order:
      - feature/proof matrix
      - operator/runtime alignment
      - live proof refresh
      - one bounded implementation gap
  - aligned:
    - [ROADMAP.md](/home/ecochran76/workspace.local/oracle/ROADMAP.md)
    - [docs/dev/next-execution-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/next-execution-plan.md)
- Verification:
  - docs/planning only

## 2026-04-03 - make the Gemini support/proof matrix explicit

- Current focus:
  - Gemini planning / docs
- What changed:
  - updated [docs/gemini.md](/home/ecochran76/workspace.local/oracle/docs/gemini.md)
    with a concrete Gemini feature matrix covering:
    - API vs Gemini web/browser
    - text
    - streaming
    - attachments
    - YouTube
    - generate-image
    - edit-image
    - search/tooling
    - Gem URL targeting
    - cookie/login flow
  - updated [docs/testing.md](/home/ecochran76/workspace.local/oracle/docs/testing.md)
    to pin the current Gemini support/proof baseline and the intended live-proof
    target surfaces
  - updated
    [docs/dev/gemini-completion-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/gemini-completion-plan.md)
    to mark Slice 1 complete enough and point the next Gemini work at
    operator/runtime alignment
- Verification:
  - docs/planning only

## 2026-04-03 - align Gemini browser doctor with current operator semantics

- Current focus:
  - Gemini operator/runtime alignment
- What changed:
  - updated [bin/auracall.ts](/home/ecochran76/workspace.local/oracle/bin/auracall.ts)
    so `auracall doctor --target gemini` is now explicitly supported only in
    `--local-only` mode
  - updated [src/browser/profileDoctor.ts](/home/ecochran76/workspace.local/oracle/src/browser/profileDoctor.ts)
    so Gemini doctor identity status now carries an explicit reason instead of
    a bare unsupported flag
  - updated [docs/gemini.md](/home/ecochran76/workspace.local/oracle/docs/gemini.md)
    and [docs/testing.md](/home/ecochran76/workspace.local/oracle/docs/testing.md)
    to document that boundary directly
  - expanded
    [tests/browser/profileDoctor.test.ts](/home/ecochran76/workspace.local/oracle/tests/browser/profileDoctor.test.ts)
    for the new Gemini doctor identity semantics
- Verification:
  - `pnpm vitest run tests/browser/profileDoctor.test.ts --maxWorkers 1`
  - `pnpm run check`

## 2026-04-03 - align Gemini docs with runtime-profile semantics

- Current focus:
  - Gemini operator/runtime alignment
- What changed:
  - updated [docs/gemini.md](/home/ecochran76/workspace.local/oracle/docs/gemini.md)
    so Gemini web targeting is documented primarily in terms of:
    - AuraCall runtime profiles
    - service-scoped `services.gemini.url`
    - browser profile selection
  - updated
    [docs/wsl-gemini-runbook.md](/home/ecochran76/workspace.local/oracle/docs/wsl-gemini-runbook.md)
    to replace old `oracle` examples with current `auracall` usage and a
    target-shape config example
  - updated [bin/auracall.ts](/home/ecochran76/workspace.local/oracle/bin/auracall.ts)
    help text so `--gemini-url` is described consistently as a Gemini web URL
    override
- Verification:
  - docs/help text only

## 2026-04-03 - checkpoint Gemini operator/runtime alignment and move to proof refresh

- Current focus:
  - Gemini completion planning
- What changed:
  - updated
    [docs/dev/gemini-completion-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/gemini-completion-plan.md)
    to mark Slice 2 complete enough and make Slice 3 the next active Gemini
    step
  - updated [docs/testing.md](/home/ecochran76/workspace.local/oracle/docs/testing.md)
    to pin the intended Gemini live-proof execution order
  - updated
    [docs/dev/next-execution-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/next-execution-plan.md)
    so the broader execution board reflects that Gemini should move to proof
    refresh instead of more operator alignment cleanup
- Verification:
  - docs/planning only

## 2026-04-03 - start Gemini live-proof refresh and fix target URL drift

- Current focus:
  - Gemini live-proof refresh
- What changed:
  - fixed [src/browser/config.ts](/home/ecochran76/workspace.local/oracle/src/browser/config.ts)
    so Gemini browser targets resolve the generic browser `url` field from
    Gemini inputs instead of inheriting ChatGPT defaults
  - expanded [tests/browser/config.test.ts](/home/ecochran76/workspace.local/oracle/tests/browser/config.test.ts)
    to pin:
    - Gemini target URL resolution
    - Gemini default managed browser profile derivation
  - updated [docs/testing.md](/home/ecochran76/workspace.local/oracle/docs/testing.md)
    and
    [docs/dev/gemini-completion-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/gemini-completion-plan.md)
    with the first fresh Gemini web proof results
- Live proof:
  - pairing: `default` AuraCall runtime profile -> `default` browser profile
  - local Gemini doctor first exposed an uninitialized managed browser profile
  - pre-fix setup/verify then exposed the config bug by opening `chatgpt.com`
    for a Gemini run
  - after the fix:
    - Gemini text run: green
    - Gemini attachment run: green
  - this host required:
    - `auracall login --target gemini --export-cookies`
    - `AURACALL_BROWSER_COOKIES_FILE=~/.auracall/cookies.json`
    because direct Linux keyring-backed cookie reads returned zero Gemini auth
    cookies
- Verification:
  - `pnpm vitest run tests/browser/config.test.ts tests/browser/profileConfig.test.ts --maxWorkers 1`
  - `pnpm run check`
  - live Gemini text proof on `default -> default`
  - live Gemini attachment proof on `default -> default`

## 2026-04-03 - scope Gemini exported cookies to the managed runtime profile

- Current focus:
  - Gemini live-proof / cookie-path alignment
- What changed:
  - added a managed-profile cookie export helper in
    [src/browser/profileStore.ts](/home/ecochran76/workspace.local/oracle/src/browser/profileStore.ts)
  - updated [src/browser/login.ts](/home/ecochran76/workspace.local/oracle/src/browser/login.ts)
    so `auracall login --target gemini --export-cookies` now writes:
    - the primary runtime-profile-scoped cookie file under the managed Gemini
      browser profile
    - the old `~/.auracall/cookies.json` compatibility file
  - updated [src/cli/browserConfig.ts](/home/ecochran76/workspace.local/oracle/src/cli/browserConfig.ts)
    so Gemini browser runs prefer the scoped exported-cookie file before the
    legacy global fallback
  - expanded
    [tests/cli/browserConfig.inlineCookies.test.ts](/home/ecochran76/workspace.local/oracle/tests/cli/browserConfig.inlineCookies.test.ts)
    for the scoped Gemini fallback order
- Verification:
  - focused inline-cookie/browser-config tests

## 2026-04-03 - extend Gemini live-proof refresh through YouTube input

- Current focus:
  - Gemini live-proof refresh
- What changed:
  - re-ran Gemini web proof on the same explicit pairing:
    - AuraCall runtime profile `default`
    - browser profile `default`
  - kept the host on the runtime-profile-scoped exported-cookie fallback:
    - `/home/ecochran76/.auracall/browser-profiles/default/gemini/cookies.json`
  - updated [docs/testing.md](/home/ecochran76/workspace.local/oracle/docs/testing.md)
    and
    [docs/dev/gemini-completion-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/gemini-completion-plan.md)
    with the new proof result
- Live proof:
  - Gemini YouTube run: green
  - prompt:
    - `Give one short sentence about the video.`
  - input:
    - `https://www.youtube.com/watch?v=dQw4w9WgXcQ`
- Verification:
  - live Gemini YouTube proof on `default -> default`

## 2026-04-04 - classify Gemini generate-image as a proof/capability result on default

- Current focus:
  - Gemini live-proof refresh
- What changed:
  - ran the next single Gemini proof cell on the same explicit pairing:
    - AuraCall runtime profile `default`
    - browser profile `default`
  - kept the host on the runtime-profile-scoped exported-cookie fallback:
    - `/home/ecochran76/.auracall/browser-profiles/default/gemini/cookies.json`
  - updated [docs/testing.md](/home/ecochran76/workspace.local/oracle/docs/testing.md)
    and
    [docs/dev/gemini-completion-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/gemini-completion-plan.md)
    to record the result as a proof/capability outcome rather than a code
    regression
- Live proof:
  - Gemini generate-image: not green on `default -> default`
  - provider response:
    - `Are you signed in? I can search for images, but can't seem to create any for you right now. It's also possible that image creation isn't available in your location yet.`
- Classification:
  - not a shared browser/runtime routing failure
  - not a cookie-path regression
  - treat first as:
    - account capability gap
    - or provider availability/location gating on this pairing
- Verification:
  - live Gemini generate-image proof attempt on `default -> default`

## 2026-04-04 - classify Gemini edit-image as a proof/capability result on default

- Current focus:
  - Gemini live-proof refresh
- What changed:
  - ran the final planned Gemini proof cell on the same explicit pairing:
    - AuraCall runtime profile `default`
    - browser profile `default`
  - used a disposable local PNG input with the same runtime-profile-scoped
    exported-cookie fallback:
    - `/home/ecochran76/.auracall/browser-profiles/default/gemini/cookies.json`
  - updated [docs/testing.md](/home/ecochran76/workspace.local/oracle/docs/testing.md)
    and
    [docs/dev/gemini-completion-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/gemini-completion-plan.md)
    to record the result as a proof/capability outcome rather than a code
    regression
- Live proof:
  - Gemini edit-image: not green on `default -> default`
  - provider response:
    - `I can try to find an image like that for you, but can't create it right now. It's possible you're signed out or image creation isn't available in your location.`
- Classification:
  - not a shared browser/runtime routing failure
  - not a cookie-path regression
  - treat first as:
    - account capability gap
    - or provider availability/location gating on this pairing
- Verification:
  - live Gemini edit-image proof attempt on `default -> default`

## 2026-04-04 - checkpoint Gemini proof refresh on the default pairing

- Current focus:
  - Gemini proof/status planning
- What changed:
  - updated [docs/dev/gemini-completion-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/gemini-completion-plan.md)
    to mark the live-proof refresh complete enough for one explicit pairing
  - updated [docs/dev/next-execution-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/next-execution-plan.md)
    so Gemini now points at a deliberate next decision instead of continued
    probing on the same account
- Outcome:
  - `default -> default` now has a full explicit proof picture:
    - text: green
    - attachment: green
    - YouTube: green
    - generate-image: not green
    - edit-image: not green
  - non-green image cells remain classified as provider/account capability
    results on this pairing, not shared browser/runtime regressions
- Verification:
  - docs/planning only

## 2026-04-04 - audit second Gemini proof pairing availability

- Current focus:
  - Gemini proof/status planning
- What changed:
  - audited local Gemini readiness for the other AuraCall runtime profiles via:
    - `auracall --profile default doctor --target gemini --local-only --json`
    - `auracall --profile wsl-chrome-2 doctor --target gemini --local-only --json`
    - `auracall --profile windows-chrome-test doctor --target gemini --local-only --json`
  - updated [docs/dev/gemini-completion-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/gemini-completion-plan.md)
    and [docs/dev/next-execution-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/next-execution-plan.md)
    so the next Gemini step is framed honestly
- Outcome:
  - `default -> gemini` is currently the only Gemini-ready pairing on this host
  - `wsl-chrome-2 -> gemini` is not initialized
  - `windows-chrome-test -> gemini` is not initialized
  - the next Gemini proof move, if chosen, must start with setup/login for a
    second pairing rather than another proof attempt
- Verification:
  - local Gemini doctor audit only

## 2026-04-04 - initialize wsl-chrome-2 Gemini and record the first second-pairing probe

- Current focus:
  - Gemini second-pairing readiness
- What changed:
  - ran:
    - `auracall --profile wsl-chrome-2 login --target gemini --export-cookies`
  - that seeded the managed Gemini browser profile under:
    - `/home/ecochran76/.auracall/browser-profiles/wsl-chrome-2/gemini`
  - local Gemini doctor now reports that pairing as initialized and live
  - ran one narrow text probe on the same pairing
  - updated [docs/testing.md](/home/ecochran76/workspace.local/oracle/docs/testing.md)
    and
    [docs/dev/gemini-completion-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/gemini-completion-plan.md)
    to record the result honestly
- Outcome:
  - `wsl-chrome-2 -> gemini` is now initialized
  - the first text probe is not yet green:
    - the browser run completed with `(no text output)`
    - the run still used the global compatibility cookie source
      (`home:cookies.json`)
    - there is still no pairing-scoped exported cookie file at:
      `/home/ecochran76/.auracall/browser-profiles/wsl-chrome-2/gemini/cookies.json`
- Verification:
  - `auracall --profile wsl-chrome-2 doctor --target gemini --local-only --json`
  - live Gemini text probe on `wsl-chrome-2 -> gemini`

## 2026-04-04 - detect visible Gemini sign-in state during cookie export

- Current focus:
  - Gemini login/export hardening
- What changed:
  - updated
    [packages/browser-service/src/loginHelpers.ts](/home/ecochran76/workspace.local/oracle/packages/browser-service/src/loginHelpers.ts)
    so the shared cookie-export wait loop can run a signed-out DOM probe and
    fail early instead of waiting indefinitely for required cookies
  - updated [src/browser/login.ts](/home/ecochran76/workspace.local/oracle/src/browser/login.ts)
    so Gemini export-cookies now uses a target-specific visible `Sign in`
    probe against the opened login page
  - added focused coverage in:
    - [tests/browser-service/loginHelpers.test.ts](/home/ecochran76/workspace.local/oracle/tests/browser-service/loginHelpers.test.ts)
    - [tests/browser/geminiLogin.test.ts](/home/ecochran76/workspace.local/oracle/tests/browser/geminiLogin.test.ts)
  - updated [docs/gemini.md](/home/ecochran76/workspace.local/oracle/docs/gemini.md)
    and [docs/testing.md](/home/ecochran76/workspace.local/oracle/docs/testing.md)
    for the new operator-visible behavior
- Verification:
  - `pnpm vitest run tests/browser-service/loginHelpers.test.ts tests/browser/geminiLogin.test.ts tests/browser/login.test.ts tests/browser/browserLoginCore.test.ts --maxWorkers 1`
  - `pnpm run check`

## 2026-04-04 - live-validate Gemini signed-out detection on wsl-chrome-2

- Current focus:
  - Gemini second-pairing truthfulness
- What changed:
  - reran:
    - `auracall --profile wsl-chrome-2 login --target gemini --export-cookies`
  - the new signed-out detection fired live on the opened Gemini page instead
    of leaving the pairing in an ambiguous "waiting for cookies" state
  - updated
    [docs/testing.md](/home/ecochran76/workspace.local/oracle/docs/testing.md)
    and
    [docs/dev/gemini-completion-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/gemini-completion-plan.md)
    to stop describing `wsl-chrome-2 -> gemini` as merely "initialized and
    live"
- Outcome:
  - the live rerun failed explicitly with:
    - `Gemini login required; the opened Gemini page still shows a visible Sign in state.`
  - `wsl-chrome-2 -> gemini` should now be treated as:
    - managed-profile-seeded
    - but currently signed out on the Gemini surface
    - not yet a valid second proof pairing
- Verification:
  - live:
    - `pnpm tsx bin/auracall.ts --profile wsl-chrome-2 login --target gemini --export-cookies`

## 2026-04-04 - auto-click Gemini Sign in once on wsl-chrome-2

- Current focus:
  - Gemini login/export recovery
- What changed:
  - updated
    [packages/browser-service/src/loginHelpers.ts](/home/ecochran76/workspace.local/oracle/packages/browser-service/src/loginHelpers.ts)
    so signed-out cookie export flows can attempt one bounded recovery action
    and wait through a short post-click grace window before failing
  - updated [src/browser/login.ts](/home/ecochran76/workspace.local/oracle/src/browser/login.ts)
    so Gemini uses that seam to click a visible `Sign in` CTA once on the
    Gemini surface
  - updated Gemini docs/testing notes to distinguish:
    - login/export green
    - browser proof still pending
- Outcome:
  - live rerun on `wsl-chrome-2` succeeded:
    - `auracall --profile wsl-chrome-2 login --target gemini --export-cookies`
  - cookies were exported to:
    - `/home/ecochran76/.auracall/browser-profiles/wsl-chrome-2/gemini/cookies.json`
  - this confirms the visible `Sign in` click was sufficient on that managed
    Gemini browser profile
  - this still does not promote the pairing to fully browser-proven; a narrow
    Gemini text run remains the next proof step
- Verification:
  - `pnpm vitest run tests/browser-service/loginHelpers.test.ts tests/browser/geminiLogin.test.ts tests/browser/login.test.ts tests/browser/browserLoginCore.test.ts --maxWorkers 1`
  - `pnpm run check`
  - live:
    - `pnpm tsx bin/auracall.ts --profile wsl-chrome-2 login --target gemini --export-cookies`

## 2026-04-04 - prove Gemini text on wsl-chrome-2 after login recovery

- Current focus:
  - Gemini second-pairing proof
- What changed:
  - ran one narrow Gemini browser text proof on the same pairing using the
    runtime-profile-scoped cookie export:
    - `AURACALL_BROWSER_COOKIES_FILE=/home/ecochran76/.auracall/browser-profiles/wsl-chrome-2/gemini/cookies.json pnpm tsx bin/auracall.ts --profile wsl-chrome-2 --engine browser --model gemini-3-pro --prompt 'Reply exactly with: WSL2 GEMINI TEXT GREEN 2' --wait --verbose --force`
  - updated
    [docs/testing.md](/home/ecochran76/workspace.local/oracle/docs/testing.md)
    and
    [docs/dev/gemini-completion-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/gemini-completion-plan.md)
    to promote this pairing from login-ready to text-green
- Outcome:
  - Gemini returned exactly:
    - `WSL2 GEMINI TEXT GREEN 2`
  - `wsl-chrome-2 -> gemini` is now a real second text-green browser proof
    pairing
- Verification:
  - live:
    - `AURACALL_BROWSER_COOKIES_FILE=/home/ecochran76/.auracall/browser-profiles/wsl-chrome-2/gemini/cookies.json pnpm tsx bin/auracall.ts --profile wsl-chrome-2 --engine browser --model gemini-3-pro --prompt 'Reply exactly with: WSL2 GEMINI TEXT GREEN 2' --wait --verbose --force`

## 2026-04-04 - prove Gemini file input on wsl-chrome-2

- Current focus:
  - Gemini second-pairing breadth
- What changed:
  - created a tiny local proof file:
    - `/tmp/gemini-wsl2-attachment-proof.txt`
  - ran a narrow Gemini browser file-input proof on the same pairing:
    - `AURACALL_BROWSER_COOKIES_FILE=/home/ecochran76/.auracall/browser-profiles/wsl-chrome-2/gemini/cookies.json pnpm tsx bin/auracall.ts --profile wsl-chrome-2 --engine browser --model gemini-3-pro --prompt 'Read the attached file and reply exactly with its full contents, with no extra words.' --file /tmp/gemini-wsl2-attachment-proof.txt --wait --verbose --force`
  - updated Gemini docs to record the important scope boundary:
    - this proof is green for Aura-Call file input
    - verbose output showed `Browser will paste file contents inline (no uploads).`
- Outcome:
  - Gemini returned exactly:
    - `WSL2 Gemini attachment proof 2026-04-04`
  - `wsl-chrome-2 -> gemini` now has:
    - text-green proof
    - file-input-green proof through the current Aura-Call inline bundling path
- Verification:
  - live:
    - `AURACALL_BROWSER_COOKIES_FILE=/home/ecochran76/.auracall/browser-profiles/wsl-chrome-2/gemini/cookies.json pnpm tsx bin/auracall.ts --profile wsl-chrome-2 --engine browser --model gemini-3-pro --prompt 'Read the attached file and reply exactly with its full contents, with no extra words.' --file /tmp/gemini-wsl2-attachment-proof.txt --wait --verbose --force`

## 2026-04-04 - classify Gemini real attachment mode as the next implementation gap

- Current focus:
  - Gemini upload transport truthfulness
- What changed:
  - inspected the current browser attachment policy and confirmed there is an
    explicit real-attachment path via:
    - `--browser-attachments always`
  - ran two narrow `wsl-chrome-2` proofs on that forced path using the
    pairing-scoped Gemini cookies:
    - uploaded text file
    - uploaded PNG image
  - updated Gemini docs/planning notes to stop conflating:
    - inline Aura-Call file input
    - real Gemini attachment transport
- Outcome:
  - the real Gemini attachment path is not yet green on `wsl-chrome-2`
  - text-file upload returned:
    - `[NO CONTENT FOUND]`
  - image upload returned:
    - `It looks like the image didn't come through on my end. Please try uploading it again, and I will gladly describe it for you!`
  - this is now the clearest concrete Gemini implementation gap, stronger than
    doing more generic proof churn
- Verification:
  - live:
    - `AURACALL_BROWSER_COOKIES_FILE=/home/ecochran76/.auracall/browser-profiles/wsl-chrome-2/gemini/cookies.json pnpm tsx bin/auracall.ts --profile wsl-chrome-2 --engine browser --model gemini-3-pro --browser-attachments always --prompt 'Read the uploaded file and reply exactly with its full contents, with no extra words.' --file /tmp/gemini-wsl2-attachment-proof.txt --wait --verbose --force`
    - `AURACALL_BROWSER_COOKIES_FILE=/home/ecochran76/.auracall/browser-profiles/wsl-chrome-2/gemini/cookies.json pnpm tsx bin/auracall.ts --profile wsl-chrome-2 --engine browser --model gemini-3-pro --browser-attachments always --prompt 'Describe the uploaded image in one short sentence.' --file /tmp/gemini-wsl2-upload-proof.png --wait --verbose --force`

## 2026-04-04 - add MIME types to Gemini uploads and recheck live image attach

- Current focus:
  - Gemini real attachment transport
- What changed:
  - updated [src/gemini-web/client.ts](/home/ecochran76/workspace.local/oracle/src/gemini-web/client.ts)
    so Gemini uploads now send a MIME-typed blob instead of an untyped file
  - added focused coverage in
    [upload.test.ts](/home/ecochran76/workspace.local/oracle/tests/gemini-web/upload.test.ts)
    to prove a `.png` upload is posted as `image/png`
- Outcome:
  - focused Gemini tests are green
  - live `wsl-chrome-2` forced-upload image proof still is not green:
    - `It looks like the image didn't upload properly, so I can't see anything to describe! Please try attaching it again.`
  - so the upstream MIME fix was worth landing, but it did not fully close the
    live attachment gap on this pairing
- Verification:
  - `pnpm vitest run tests/gemini-web/upload.test.ts tests/gemini-web/executor.test.ts tests/gemini-web/parse.test.ts tests/gemini-web/image-download.test.ts tests/gemini-web/save-image-fallback.test.ts --maxWorkers 1`
  - `pnpm run check`
  - live:
    - `AURACALL_BROWSER_COOKIES_FILE=/home/ecochran76/.auracall/browser-profiles/wsl-chrome-2/gemini/cookies.json pnpm tsx bin/auracall.ts --profile wsl-chrome-2 --engine browser --model gemini-3-pro --browser-attachments always --prompt 'Describe the uploaded image in one short sentence.' --file /tmp/gemini-wsl2-upload-proof.png --wait --verbose --force`

## 2026-04-04 - include Gemini attachment metadata in f.req and recheck forced upload

- Current focus:
  - Gemini real attachment transport
- What changed:
  - updated [src/gemini-web/client.ts](/home/ecochran76/workspace.local/oracle/src/gemini-web/client.ts)
    so uploaded Gemini attachments now carry filename and MIME metadata in the
    `f.req` payload tuple, not just the upload id
  - expanded [upload.test.ts](/home/ecochran76/workspace.local/oracle/tests/gemini-web/upload.test.ts)
    to prove the generated `f.req` payload now includes:
    - `[[fileId, 1, null, mimeType], fileName]`
- Outcome:
  - focused Gemini upload tests are green
  - the request shape now matches the observed upstream payload more closely
  - live `wsl-chrome-2` forced-upload image proof is still not green
  - latest result completed with:
    - `(no text output)`
  - so request-shape correctness improved again, but the real Gemini upload
    contract is still not healthy enough to call attachment mode green
- Verification:
  - `pnpm vitest run tests/gemini-web/upload.test.ts tests/gemini-web/executor.test.ts tests/gemini-web/parse.test.ts tests/gemini-web/image-download.test.ts tests/gemini-web/save-image-fallback.test.ts --maxWorkers 1`
  - `pnpm run check`
  - live:
    - `AURACALL_BROWSER_COOKIES_FILE=/home/ecochran76/.auracall/browser-profiles/wsl-chrome-2/gemini/cookies.json pnpm tsx bin/auracall.ts --profile wsl-chrome-2 --engine browser --model gemini-3-pro --browser-attachments always --prompt 'Describe the uploaded image in one short sentence.' --file /tmp/gemini-wsl2-upload-proof.png --wait --verbose --force`

## 2026-04-04 - fail explicit on Gemini control-only attachment responses

- Current focus:
  - Gemini real attachment transport diagnostics
- What changed:
  - added control-frame-only Gemini response detection in
    [src/gemini-web/client.ts](/home/ecochran76/workspace.local/oracle/src/gemini-web/client.ts)
  - updated [src/gemini-web/executor.ts](/home/ecochran76/workspace.local/oracle/src/gemini-web/executor.ts)
    so attachment/text runs no longer treat that shape as a clean empty success
  - added focused coverage in:
    - [parse.test.ts](/home/ecochran76/workspace.local/oracle/tests/gemini-web/parse.test.ts)
    - [executor.test.ts](/home/ecochran76/workspace.local/oracle/tests/gemini-web/executor.test.ts)
- Outcome:
  - the underlying Gemini upload gap is still not fixed
  - but the current forced-upload image path now fails explicitly with:
    - `Gemini accepted the attachment request but returned control frames only and never materialized a response body.`
  - that is materially better than returning `(no text output)` and hiding the
    real failure shape
- Verification:
  - `pnpm vitest run tests/gemini-web/parse.test.ts tests/gemini-web/upload.test.ts tests/gemini-web/executor.test.ts --maxWorkers 1`
  - `pnpm run check`
  - live:
    - `AURACALL_BROWSER_COOKIES_FILE=/home/ecochran76/.auracall/browser-profiles/wsl-chrome-2/gemini/cookies.json pnpm tsx bin/auracall.ts --profile wsl-chrome-2 --engine browser --model gemini-3-pro --browser-attachments always --prompt 'Describe the uploaded image in one short sentence.' --file /tmp/gemini-wsl2-upload-proof.png --wait --verbose --force`

## 2026-04-04 - confirm Gemini attachment control-only responses do not self-heal on simple retry

- Current focus:
  - Gemini real attachment transport diagnostics
- What changed:
  - tightened the control-only Gemini error text so attachment-backed runs
    explicitly report that Gemini accepted the attachment request but never
    produced a response body
- Outcome:
  - direct retry experiments on the same `wsl-chrome-2` image upload did not
    self-heal:
    - attempt 1: control-only
    - attempt 2: control-only
    - attempt 3: control-only
  - that means a naive retry loop is not the next fix for this provider gap
- Verification:
  - `pnpm vitest run tests/gemini-web/parse.test.ts tests/gemini-web/upload.test.ts tests/gemini-web/executor.test.ts --maxWorkers 1`
  - live:
    - repeated `runGeminiWebOnce(...)` direct image-upload probes against
      `wsl-chrome-2 -> gemini`

## 2026-04-04 - capture Gemini native upload UI anchors for the next protocol comparison

- Current focus:
  - Gemini native attachment transport investigation
- What changed:
  - added [gemini-native-upload-investigation.md](/home/ecochran76/workspace.local/oracle/docs/dev/gemini-native-upload-investigation.md)
    to pin the current live Gemini upload UI anchors supplied during
    investigation:
    - upload menu item:
      - `[data-test-id="local-images-files-uploader-button"]`
    - preview chip:
      - `[data-test-id="file-preview"]`
      - `[data-test-id="file-name"]`
      - `[data-test-id="cancel-button"]`
- Outcome:
  - the next upload-protocol slice can start from the known browser-native UI
    surface instead of rediscovering selectors
  - this keeps the next step narrow:
    - compare native browser upload request flow against Aura-Call's raw client
    - do not jump straight to a DOM upload rewrite

## 2026-04-04 - first Gemini native-upload protocol comparison shows envelope drift, not just tuple drift

- Current focus:
  - Gemini native attachment transport investigation
- What changed:
  - drove the live Gemini upload UI on `wsl-chrome-2 -> gemini` through the
    native menu-item path:
    - `[data-test-id="local-images-files-uploader-button"]`
  - captured the resulting browser-native `StreamGenerate` request/response via
    Puppeteer + CDP network listeners
- Outcome:
  - the native upload trigger path is real and usable from the page
  - the browser-native send path still returned control frames only on this
    capture
  - but the most important finding is structural:
    - the native `f.req` envelope is materially richer than Aura-Call's current
      raw client envelope
    - the attachment tuple itself also contains trailing fields beyond:
      - upload token
      - marker
      - MIME type
      - file name
  - this shifts the next likely fix from:
    - another tiny attachment tuple tweak
    to:
    - minimum viable `f.req` envelope parity work

## 2026-04-04 - Gemini native upload uses a broader request sequence than upload plus StreamGenerate

- Current focus:
  - Gemini native attachment transport investigation
- What changed:
  - ran a broader live Puppeteer + CDP capture on `wsl-chrome-2 -> gemini`
    after native file selection and send
  - captured the post-send request sequence instead of only the first
    `StreamGenerate`
- Outcome:
  - the native Gemini path does not stop at:
    - upload
    - `StreamGenerate`
  - the observed native sequence was:
    - `batchexecute?rpcids=ESY5D`
    - attachment-backed `StreamGenerate`
    - `batchexecute?rpcids=PCck7e`
  - the first `StreamGenerate` response still mostly carried control frames and
    one message-id payload, not a materialized answer body
  - the follow-up `PCck7e` request also returned only control frames in this
    capture
  - a reused live tab also emitted:
    - `You already uploaded a file named gemini-wsl2-upload-proof.png`
    so duplicate attachment state is now an explicit investigation footgun to
    avoid in later native-upload captures
- Next step:
  - decode the native `PCck7e` payload and decide whether the real gap is:
    - broader native request-sequence parity
    - or a point where Aura-Call should stop using the raw Gemini upload path

## 2026-04-04 - deeper Gemini body capture still only exposed ESY5D

- Current focus:
  - Gemini native attachment transport investigation
- What changed:
  - tried multiple deeper request-body capture paths against the live Gemini
    page after native upload and send:
    - Puppeteer page-level request capture
    - CDP `Network.getRequestPostData`
    - CDP `Fetch.requestPaused`
  - repeated those attempts on both:
    - a reused live Gemini tab
    - a fresh Gemini tab
- Outcome:
  - all body-oriented captures consistently exposed only the early:
    - `batchexecute?rpcids=ESY5D`
  - none of them surfaced decodable request bodies for the later native:
    - attachment-backed `StreamGenerate`
    - `batchexecute?rpcids=PCck7e`
  - that means the request-sequence finding is still real, but the later
    payloads are not reachable through the same page-target body capture
    techniques that work for `ESY5D`
- Next step:
  - stop treating the native-upload gap as another ordinary page-request parity
    problem
  - either:
    - capture the later Gemini requests at a broader browser target/session
      boundary
    - or treat this as evidence that native Gemini attachments need a
      browser-driven path instead of more raw-client emulation

## 2026-04-04 - Gemini browser uploads now work through the native page path

- Current focus:
  - Gemini browser-native attachment execution
- What changed:
  - threaded `attachmentMode` through the browser-service custom executor seam
    so Gemini can distinguish:
    - inline/bundled text paths
    - real upload-mode attachment paths
  - added a Gemini-native browser helper that:
    - opens the live upload menu
    - accepts files through the real chooser
    - waits for attachment preview state
    - submits through the live Gemini page
  - tightened submit readiness after the first live run showed the file and
    prompt were present but the send never actually fired
- Outcome:
  - `wsl-chrome-2 -> gemini` is now green for a real upload-mode text-file
    proof:
    - `WSL2 NATIVE GEMINI UPLOAD GREEN 2026-04-04`
  - ordinary Gemini browser upload-mode runs no longer depend on the earlier
    raw Gemini upload protocol path
  - the older raw-protocol investigation remains useful background, but it is
    no longer the primary implementation path for standard attachment-backed
    prompts
- Next step:
  - re-prove one higher-value native upload class, likely image, on the same
    pairing before widening Gemini work again

## 2026-04-04 - first native Gemini image re-proof is still not green

- Current focus:
  - Gemini browser-native upload proof refresh
- What changed:
  - ran the next narrow proof cell on `wsl-chrome-2 -> gemini`:
    - `--browser-attachments always`
    - PNG input
    - prompt: `Describe the uploaded image in one short sentence.`
- Outcome:
  - not green yet
  - the run stayed unresolved well past the earlier text-file proof window
  - live Gemini inspection showed the prompt still present without a stable
    attached-image preview or model answer
- Next step:
  - keep the next Gemini slice bounded to this browser-native image path
  - inspect why image attachment state is not stabilizing on the live page
    before taking any broader Gemini work

## 2026-04-04 - Gemini native image runs now fail more honestly

- Current focus:
  - Gemini browser-native image upload hardening
- What changed:
  - tightened native answer extraction so landing-page scaffolding like:
    - `Hi Eric`
    - `For you`
    can no longer count as a successful model answer
  - tightened attachment stabilization so the native helper no longer treats
    generic page text as proof that Gemini accepted the upload
- Outcome:
  - the image path is still not green
  - but the run no longer false-greens on hero text or on a missing attachment
    preview
- Next step:
  - inspect the live image-specific attachment state on the Gemini page
  - likely around image-specific upload/preview selectors rather than general
    answer extraction

## 2026-04-04 - Gemini image chooser is the current hard boundary

- Current focus:
  - Gemini browser-native image upload investigation
- What changed:
  - tried three increasingly explicit image-upload paths:
    - generic visible `Upload files`
    - image-specific hidden upload control
    - bounded fallback across all known upload triggers
- Outcome:
  - image uploads are still not green
  - the latest run now fails explicitly with:
    - `Waiting for Gemini file chooser failed across all known upload triggers.`
  - this is a better checkpoint than the earlier false-positive states because
    it identifies the current boundary as chooser triggering, not answer
    extraction or generic send behavior
- Next step:
  - inspect how the live Gemini image uploader actually opens its chooser on
    this surface, likely through a path Puppeteer `waitForFileChooser()` is not
    currently observing

## 2026-04-04 - Gemini native image runs now have owned-page boundaries

- Current focus:
  - Gemini browser-native image upload hardening on `wsl-chrome-2`
- What changed:
  - moved native Gemini upload-mode runs closer to the ChatGPT/Grok browser
    model by:
    - using one exact owned Chrome target instead of a floating page in an
      adopted multi-tab browser
    - trimming competing Gemini tabs for the owned run
    - treating visible `blob:` thumbnails as real staged image state
    - preferring keyboard `Enter` for Gemini submit
    - failing explicitly when Gemini reports:
      - `Image Upload Failed`
      - `Image Not Received, Please Re-upload`
      - or when the attachment vanishes before the prompt commits
- Outcome:
  - still not green
  - current live boundary is now specific:
    - fresh owned Gemini pages can still detach during prompt/menu readiness
    - and after the owned page stabilizes, the latest live failure is now
      explicit:
      - `Gemini prompt remained in the composer after the attachment vanished and no response materialized.`
  - this is a much narrower checkpoint than the earlier generic chooser/send
    uncertainty
- Next step:
  - keep Gemini native image work bounded to owned-page readiness and commit
    semantics around:
    - prompt textarea presence
    - upload-menu materialization
    - fresh-frame stability
    - post-upload attachment retention through prompt commit

## 2026-04-04 - Gemini native image submit now fails at the real pending boundary again

- Current focus:
  - Gemini browser-native image upload hardening on `wsl-chrome-2`
- What changed:
  - tried a narrower image-upload alignment by preferring Gemini's hidden
    file-style uploader before the image-only hidden uploader when dispatching
    synthetic `fileSelected`
  - tightened Gemini submit so it only treats the prompt as committed when the
    prompt actually appears in Gemini history, not when weaker states like an
    empty/disabled composer merely suggest progress
- Outcome:
  - the native image path is still not green
  - the hidden-uploader preference did not close the live gap
  - but the run no longer drifts into a generic answer timeout; the current
    live result is back to the more honest explicit failure:
    - `Gemini prompt remained in the composer after the attachment vanished and no response materialized.`
- Next step:
  - keep the next Gemini slice bounded to why image attachment state disappears
    before the prompt is durably committed on the owned page

## 2026-04-04 - Gemini kept-browser inspection moved the boundary back to preview readiness

- Current focus:
  - Gemini browser-native image upload hardening on `wsl-chrome-2`
- What changed:
  - fixed `--browser-keep-browser` for Gemini native runs so the helper no
    longer closes the only kept page in `finally`
  - made Gemini prompt clearing attachment-safe instead of using blanket
    select-all/backspace against the whole composer
  - tightened image preview detection to avoid weak global blob matches
  - then preserved a failed live page and inspected it directly with
    `browser-tools`
- Outcome:
  - the image path is still not green
  - but the preserved failed page showed the true current state:
    - a visible `blob:` image is staged
    - `Remove file gemini-native-upload-proof.png` is visible
    - the Gemini prompt box is still empty
  - that means the current failing phase is image preview readiness timing /
    detection, not post-submit disappearance
  - after raising the image preview budget, the latest explicit live failure is
    now:
    - `Waiting failed: 45000ms exceeded`
- Next step:
  - keep the next Gemini slice bounded to why `waitForAttachmentPreview(...)`
    still misses the staged image/remove-file state during the live wait window

## 2026-04-04 - Gemini image preview wait now preserves last-state diagnostics

- Current focus:
  - Gemini browser-native image upload hardening on `wsl-chrome-2`
- What changed:
  - replaced the opaque image preview `waitForFunction(...)` path with explicit
    polling that keeps the last observed:
    - prompt text
    - visible blob count
    - remove-file labels
    - preview names
    - matched attachment names
  - fixed two implementation bugs in that new path:
    - `__name is not defined`
    - an in-page expression syntax error from leftover TypeScript syntax
- Outcome:
  - the new diagnostic path is working and no longer hides the browser state
    behind a generic timeout
  - on the latest live rerun, the image path moved past the preview-timeout
    checkpoint and returned to the more meaningful explicit boundary:
    - `Gemini prompt remained in the composer after the attachment vanished and no response materialized.`
- Next step:
  - keep the next Gemini slice focused on why a genuinely staged image still
    disappears before prompt commit once preview detection is no longer the
    main blind spot

## 2026-04-04 - Gemini attachment runs now try the real send control first

- Current focus:
  - Gemini browser-native image upload hardening on `wsl-chrome-2`
- What changed:
  - changed Gemini attachment submits to follow the more mature ChatGPT/Grok
    pattern:
    - real send button / touch target first
    - `Enter` fallback second
    - in-page click fallback last
  - added last-state details to Gemini submit timeouts so submit-phase failures
    no longer hide their final composer/attachment state
- Outcome:
  - the native image path is still not green
  - but the click-first attachment submit path did not introduce a new blind
    failure; the live rerun still returns the same explicit boundary:
    - `Gemini prompt remained in the composer after the attachment vanished and no response materialized.`
- Next step:
  - keep the next Gemini slice focused on why Gemini clears the staged image
    without committing the prompt, even when the real send control is used

## 2026-04-04 - Gemini native image submit now commits once, but image context is still lost

- Current focus:
  - Gemini browser-native image upload hardening on `wsl-chrome-2`
- What changed:
  - added one bounded resend fallback when Gemini leaves the prompt in the
    composer after the attachment disappears
  - this follows the live manual recovery we already proved on a preserved page:
    one more real send click can commit the waiting prompt
- Outcome:
  - the latest fresh rerun launched cleanly after clearing the stale managed
    Gemini browser family
  - Gemini no longer died at the old composer-pending boundary
  - instead, it returned a real answer:
    - `Please upload the image you're referring to, and I'll describe it for you in a single sentence.`
  - that means submit/answer materialization improved, but the uploaded image
    still is not reaching Gemini as model-visible input
- Next step:
  - keep the next Gemini slice focused on attachment preservation from staged
    preview through model consumption, not prompt-commit heuristics

## 2026-04-04 - Gemini attachment audit points at workflow drift, not another selector gap

- Current focus:
  - compare Gemini native attachment handling against the already-proven
    ChatGPT/Grok browser workflow model
- What the audit confirmed:
  - Gemini still uses shared browser-service launch/session ownership and now
    shared target reuse
  - but native Gemini attachments are still implemented through a bespoke path:
    - `src/gemini-web/executor.ts`
    - `src/gemini-web/browserNative.ts`
  - ChatGPT/Grok instead sit behind the browser `LlmService` provider layer and
    the mature browser action helpers
- Outcome:
  - the current Gemini image gap should not be treated as another isolated
    selector issue
  - the stronger hypothesis is workflow drift:
    - attachment staged/ready semantics
    - submit commit semantics
    - post-submit attachment preservation
  - the latest live result still supports that narrower diagnosis:
    - Gemini now commits and answers
    - but the answer is attachment-blind
- Next step:
  - make the next Gemini slice a workflow-convergence slice
  - reuse ChatGPT/Grok attachment lifecycle patterns and existing browser
    action helpers where possible before adding more Gemini-local heuristics

## 2026-04-04 - Gemini stable staged-ready gate did not fix image preservation

- Current focus:
  - converge Gemini image attachment readiness toward the same multi-signal
    staged/ready model used by the shared browser attachment helpers
- What changed:
  - Gemini attachment preview readiness now requires:
    - matched attachment signals
    - send readiness
    - stable repeated polls before submit
  - image uploads also get a short post-ready settle window before prompt
    submit
- Outcome:
  - focused Gemini tests and typecheck stayed green
  - fresh live rerun on `wsl-chrome-2 -> gemini` still returned an
    attachment-blind answer:
    - `Please upload the image you're referring to, and I'll be happy to describe it for you in a single sentence.`
  - so tighter staged-ready gating alone is not enough; the image is still
    being lost between staged UI state and model-visible input
- Next step:
  - stop adjusting readiness thresholds locally
  - move down one layer and compare Gemini's staged image state against the
    exact attachment evidence ChatGPT/Grok preserve through submit

## 2026-04-04 - Gemini image runs now fail with explicit submit-phase attachment evidence

- Current focus:
  - classify Gemini attachment-blind image answers as real failures and capture
    the exact pre/post/final attachment evidence on the owned page
- What changed:
  - Gemini native image runs now log submit diagnostics:
    - pre-submit
    - post-submit
    - final
  - attachment-blind answers like:
    - `Please upload the image you're referring to...`
    are now treated as browser-automation failures, not success
- Outcome from fresh `wsl-chrome-2 -> gemini` live rerun:
  - pre-submit:
    - prompt still in composer
    - `visibleBlobCount = 1`
    - `Remove file gemini-native-upload-proof.png`
  - immediate post-submit:
    - prompt committed to history
    - blob still visible
    - remove-file affordance already gone
  - final:
    - prompt remained in history
    - blob disappeared entirely
    - Gemini produced an attachment-blind answer
- Next step:
  - stop treating this as generic attachment readiness
  - inspect the attachment association path specifically around submit, because
    the evidence now says the image is being detached during or right after the
    send transition

## 2026-04-04 - Gemini native image upload recovered by preferring the image uploader path

- Current focus:
  - fix the remaining Gemini image-association bug on `wsl-chrome-2`
- What changed:
  - kept the attachment-loss diagnostics in place
  - changed Gemini image-only synthetic upload dispatch to prefer:
    - hidden image uploader first
    - hidden file uploader second
  - kept the fallback that no longer requires the visible upload-menu item when
    the hidden uploader controls are already present
- Outcome:
  - fresh live rerun on `wsl-chrome-2 -> gemini` is now green for native image
    upload again
  - pre-submit diagnostics still showed the staged image:
    - `visibleBlobCount = 1`
    - `Remove file gemini-native-upload-proof.png`
  - post-submit diagnostics showed prompt commit with the blob still visible
  - Gemini answered with actual image understanding:
    - `An empty room features white walls, light wood flooring, and a large window overlooking a lush green landscape.`
- Lesson:
  - the image-association bug was in the uploader path, not in submit/commit or
    staged-ready timing

## 2026-04-04 - Gemini yielded new browser-service backlog items

- Current focus:
  - convert the reusable Gemini image-debugging lessons into package-level
    backlog guidance instead of leaving them provider-local
- What was recorded:
  - attachment-backed actions need phase-aware diagnostics:
    - `staged`
    - `post-submit`
    - `final`
  - attachment readiness should be modeled as multi-signal evidence, not one
    selector
  - ordered upload-surface fallback is the same kind of package-owned mechanic
    as menu/action-surface fallback
  - post-submit semantic false-success verification needs a first-class hook
- Where:
  - `docs/dev/browser-service-upgrade-backlog.md`
- Outcome:
  - the Gemini image slice now contributes concrete browser-service follow-up
    work instead of only a provider-local fix trail

## 2026-04-04 - First Gemini browser-service extraction landed

- Current focus:
  - extract the smallest proven reusable seam from Gemini native attachment
    debugging into `packages/browser-service`
- What changed:
  - added package-owned:
    - `captureActionPhaseDiagnostics(...)`
  - routed Gemini native attachment submit diagnostics through that helper
    instead of keeping the phase capture shape entirely provider-local
  - updated the browser-service backlog to mark that extraction as live
- Why this slice:
  - phase-aware diagnostics were the first Gemini lesson that was both:
    - clearly reusable
    - mechanical enough to extract without prematurely moving provider-specific
      attachment semantics into browser-service
- Next step:
  - keep the next browser-service extraction candidate narrower than full
    attachment semantics
  - likely next:
    - shared attachment-signal polling contract
    - or ordered upload-surface fallback mechanics

## 2026-04-04 - Second Gemini browser-service extraction landed

- Current focus:
  - extract the next clearly mechanical Gemini browser workflow seam into
    `packages/browser-service`
- What changed:
  - added package-owned:
    - `runOrderedSurfaceFallback(...)`
  - routed Gemini native chooser-trigger selection through that helper instead
    of a local ordered loop
  - updated the browser-service backlog/tools docs to mark that fallback seam
    as live
- Why this slice:
  - Gemini upload-trigger selection was already a pure ordered fallback shape
  - it matched the backlog item more directly than the still-provider-shaped
    attachment-signal readers
- Next step:
  - if browser-service reopens again soon, the next honest candidate is the
    attachment-signal polling contract, not more upload-trigger loop cleanup

## 2026-04-04 - Third Gemini browser-service extraction landed

- Current focus:
  - extract the shared polling/stability mechanics from Gemini attachment
    preview waits without forcing a fake cross-provider signal schema
- What changed:
  - added package-owned:
    - `waitForAttachmentSignals(...)`
  - routed Gemini attachment preview stabilization through that helper
  - updated the browser-service backlog/tools docs to mark the polling
    contract as live
- Why this slice:
  - the polling/stability logic was clearly reusable
  - the actual attachment signal payloads still differ enough that only the
    polling contract, not the full signal shape, should be package-owned yet
- Next step:
  - if browser-service reopens again, the remaining honest question is whether
    a provider-agnostic attachment signal shape should exist at all

## 2026-04-04 - Attachment signal shape comparison says stop at mechanics

- Current focus:
  - compare ChatGPT/Grok attachment signal payloads against Gemini before
    extracting any more browser-service attachment abstractions
- What I checked:
  - ChatGPT/Grok-style attachment waits in:
    - `src/browser/actions/attachments.ts`
  - Gemini attachment preview/submit state in:
    - `src/gemini-web/browserNative.ts`
- Result:
  - there is not yet a strong shared cross-provider attachment signal shape
  - the real overlap is only mechanical:
    - poll repeatedly
    - require stable ready evidence
    - report last state on timeout
  - the payload meanings still differ materially:
    - ChatGPT/Grok lean on `uploading`, `filesAttached`, `attachedNames`,
      `inputNames`, `fileCount`
    - Gemini leans on `sendReady`, `visibleBlobCount`, `removeLabels`,
      `previewNames`, `matchedNames`
- Outcome:
  - browser-service should stop at the extracted mechanics for now
  - keep attachment signal payloads provider-local until another provider
    proves a genuinely stable common shape

## 2026-04-04 - Planned Gemini conversation, Gem, and cache track

- Current focus:
  - define the next Gemini provider-expansion track after the browser upload
    and browser-service extraction line reached a good checkpoint
- What changed:
  - added:
    - [gemini-conversation-gem-cache-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/gemini-conversation-gem-cache-plan.md)
  - linked it from:
    - `gemini-completion-plan.md`
    - `next-execution-plan.md`
- Planning decision:
  - treat Gemini `Gems` as the provider-local equivalent of the generic
    `Project` domain
  - reuse the existing generic cache datasets instead of inventing Gemini-only
    cache families
  - start with DOM recon only before any CRUD implementation
- Planned slices:
  - Gem DOM recon
  - Gem CRUD
  - Gem instructions/knowledge if the native UI supports them
  - conversation CRUD
  - conversation file/attachment cache mirroring
  - disposable Gemini acceptance

## 2026-04-04 - Gemini Gem and conversation DOM recon is strong enough to proceed

- Current focus:
  - Slice 1 from the Gemini CRUD/cache plan:
    - live DOM recon only
- What I confirmed on managed `wsl-chrome-2 -> gemini`:
  - root conversation list is a real side-nav catalog:
    - container:
      - `data-test-id="all-conversations"`
    - rows:
      - `data-test-id="conversation"`
    - row actions:
      - `data-test-id="actions-menu-button"`
      - aria:
        - `More options for <title>`
    - routes:
      - `https://gemini.google.com/app/<conversationId>`
  - Gem catalog is a real first-class route:
    - `https://gemini.google.com/gems/view`
  - Gem manager exposes:
    - `New Gem`
    - premade Gem rows with `More options for "<name>" Gem`
    - at least one user Gem row with:
      - direct `Share`
      - direct `Edit Gem`
      - `More options for "Oracle" Gem`
    - user Gem route:
      - `https://gemini.google.com/gem/3bfcda98acf4`
- Outcome:
  - Gemini `Gems` are concrete enough to map onto the generic `Project` domain
  - Gemini conversation/Gem CRUD implementation can now begin from named
    surfaces instead of speculative planning

## 2026-04-04 - First Gemini project/conversation provider slice is live

- Current focus:
  - first bounded implementation slice from the Gemini Gem/conversation plan
- What changed:
  - added a real Gemini browser provider/service path instead of leaving Gemini
    outside the `BrowserProvider -> LlmService -> cache` stack
  - Gemini now participates in:
    - provider id typing
    - provider registry
    - llmService factory
    - browser automation client targeting
  - added a Gemini adapter/service with live list support for:
    - Gem-as-project listing
    - conversation listing
- Live proof on managed `wsl-chrome-2 -> gemini`:
  - `auracall --profile wsl-chrome-2 projects --target gemini`
    - now returns real Gem rows such as:
      - `chess-champ`
      - `storybook`
      - `brainstormer`
      - editable user Gem `3bfcda98acf4`
  - `auracall --profile wsl-chrome-2 conversations --target gemini`
    - now returns real Gemini chat rows with stable `/app/<conversationId>` ids
  - Gemini cache identity can now be detected from the live Google account
    label instead of failing write-through immediately
- Scope boundary:
  - this slice is list-only
  - Gem create/rename/delete and conversation rename/delete are still the next
    Gemini CRUD slices

## 2026-04-04 - First Gemini Gem create path is live

- Current focus:
  - first real Gemini Gem mutation through the generic `projects create`
    command
- What changed:
  - Gemini now supports `createProject(...)` through the real
    `https://gemini.google.com/gems/create` route
  - the Gemini adapter now treats the native Gemini success route correctly:
    - `/gems/edit/<id>`
  - Gemini project list scraping now navigates to the Gem manager surface
    before scraping instead of assuming the currently focused Gemini tab is
    already on the right route
  - the shared `projects create` CLI target gate now accepts:
    - `chatgpt`
    - `gemini`
    - `grok`
- Live proof on managed `wsl-chrome-2 -> gemini`:
  - `auracall --profile wsl-chrome-2 projects create 'AuraCall Gemini Gem CRUD Proof 2026-04-04 1854' --target gemini --instructions-text 'Reply helpfully about AuraCall Gemini CRUD proofs.'`
    - returned:
      - `Created project "AuraCall Gemini Gem CRUD Proof 2026-04-04 1854".`
  - `auracall --profile wsl-chrome-2 projects --target gemini`
    - now returns the new user Gem id:
      - `8206744c0568`
- Deferred side finding:
  - Gemini Gem list name extraction is still not fully faithful for every row
    shape on the Gem manager page
  - user Gems can still show abbreviated names like `AuraCall`, and some
    premade Gems still inherit the first visible row name
  - record that for the next Gemini Gem list-quality pass, but do not let it
    block the first create/mutation slice

## 2026-04-04 - Gemini Gem rename is live through the edit surface

- Current focus:
  - first Gemini Gem rename slice, kept separate from delete
- What changed:
  - Gemini now supports `renameProject(...)` through the native edit route:
    - `/gems/edit/<id>`
  - `projects rename --target gemini` is now enabled in the shared CLI surface
  - rename verification now waits for the persisted Gem name to hydrate on the
    edit page instead of assuming the first immediate reopen is authoritative
- Live proof on managed `wsl-chrome-2 -> gemini`:
  - `auracall --profile wsl-chrome-2 projects rename 8206744c0568 'AuraCall Gemini Gem CRUD Proof 2026-04-04 1914' --target gemini`
    - returned:
      - `Renamed project 8206744c0568 to "AuraCall Gemini Gem CRUD Proof 2026-04-04 1914".`
  - authoritative follow-up read on:
    - `https://gemini.google.com/gems/edit/8206744c0568`
    - showed the persisted name:
      - `AuraCall Gemini Gem CRUD Proof 2026-04-04 1914`
- Deferred side finding:
  - Gemini Gem delete still does not have an honest durable proof
  - the row menu and delete confirmation are real, but the full delete path
    still needs a dedicated persistence audit before landing

## 2026-04-04 - Gemini Gem delete is live through the manager row menu

- Current focus:
  - finish the first honest Gemini Gem CRUD pass with delete
- What changed:
  - Gemini now supports the shared two-step remove contract:
    - `selectRemoveProjectItem(...)`
    - `pushProjectRemoveConfirmation(...)`
  - `projects remove --target gemini` is now enabled in the shared CLI surface
  - delete now targets the authoritative Gem manager row action by:
    - resolving the persisted Gem name from `/gems/edit/<id>`
    - opening the exact `More options for "<name>" Gem` row menu on
      `/gems/view`
    - selecting `Delete`
    - clicking all visible `Delete` confirmation buttons when Gemini renders
      duplicate confirmation dialogs
- Live proof on managed `wsl-chrome-2 -> gemini`:
  - created disposable Gem:
    - `AuraCall Gemini Gem Delete Proof 2026-04-04 1935`
    - surfaced as id:
      - `525572997076`
  - deleted it with:
    - `auracall --profile wsl-chrome-2 projects remove 525572997076 --target gemini`
    - returned:
      - `Removed project 525572997076.`
  - refreshed Gem list no longer included:
    - `525572997076`
- Durable lesson:
  - Gemini manager rows can expose the full long-form Gem name even when the
    current Gem list scraper abbreviates the visible list entry
  - delete should key off the authoritative edit-page name plus the manager
    row `aria-label`, not the abbreviated list payload

## 2026-04-04 - Gemini conversation list and cache identity are live again

- Current focus:
  - start the Gemini conversation/cache slice from the list surface, not
    rename/delete yet
- What changed:
  - Gemini conversation listing no longer inherits a non-Gemini
    `browser.url` when the active AuraCall runtime profile defaults to another
    provider
  - Gemini cache identity now falls back to the managed browser profile's
    local Google-account state when the live Gemini page does not expose a
    usable account label
- Live proof on managed `wsl-chrome-2 -> gemini`:
  - `auracall --profile wsl-chrome-2 conversations --target gemini`
    - returned live `/app/<conversationId>` rows again
    - no longer emitted the earlier cache-identity warning
  - cache files now write under:
    - `~/.auracall/cache/providers/gemini/ecochran76@gmail.com/`
    - including:
      - `conversations.json`
      - `projects.json`
      - `cache-index.json`
      - `cache.sqlite`
- Durable lesson:
  - for Gemini list/read surfaces, provider-specific adapters must ignore
    incompatible inherited `configuredUrl` values from other browser providers
  - Gemini cache identity should not depend only on live page labels; the
    managed browser profile's Google-account metadata is a valid fallback

## 2026-04-05 - Gemini exact-tab selection now beats broad `/app` reuse

- Current focus:
  - harden Gemini browser tab ownership for exact conversation routes before
    returning to conversation delete
- What changed:
  - Gemini's browser adapter no longer falls back to the first same-origin
    Gemini tab when an exact route is requested
  - the adapter now prefers an exact requested Gemini URL over the broad
    service-resolved `/app` tab, then falls back to shared
    `openOrReuseChromeTarget(...)`
- Why this mattered:
  - live probing on `https://gemini.google.com/app/17ecd216fc87eacf` showed
    browser-service resolving the generic `/app` tab even when an exact
    conversation route was requested
  - that broad tab selection can bind Aura-Call to the wrong Gemini page
    instance when multiple Gemini tabs are open
- Verification:
  - `pnpm vitest run tests/browser/geminiAdapter.test.ts tests/browser/llmServiceIdentity.test.ts tests/browser/llmServiceFiles.test.ts tests/services/registry.test.ts tests/browser/config.test.ts --maxWorkers 1`
  - `pnpm run check`
- Durable lesson:
  - for Gemini exact-route work, broad service-level `/app` tab resolution is
    too weak by itself; provider adapters must prefer an exact requested URL
    match before accepting a generic service tab

## 2026-04-05 - Gemini browser service audit moved URL ownership into `LlmService`

- Current focus:
  - audit Gemini's legacy browser path against ChatGPT/Grok and move the
    generic ownership/config seams into the shared `LlmService` base without
    discarding the working Gem CRUD/list surfaces
- What changed:
  - `LlmService` no longer hardcodes a ChatGPT-vs-Grok URL split
  - Gemini now resolves its service URL from `browser.geminiUrl` at the same
    base-class seam where ChatGPT and Grok resolve theirs
  - `buildListOptions(...)` now falls back to the Gemini app launch URL for
    Gemini services instead of inheriting the ChatGPT home URL implicitly
- Why this mattered:
  - Gemini had already accumulated provider-local fixes for incompatible
    `configuredUrl` inheritance, but the shared `LlmService` base was still
    biased toward ChatGPT defaults
  - that meant Gemini mutation/list paths could still start from the wrong
    service URL before any adapter-local correction happened
- Verification:
  - `pnpm vitest run tests/browser/geminiAdapter.test.ts tests/browser/llmServiceIdentity.test.ts tests/browser/llmServiceFiles.test.ts tests/services/registry.test.ts tests/browser/config.test.ts --maxWorkers 1`
  - `pnpm run check`
- Current boundary:
  - Gemini conversation delete is still not ready to land
  - exact-route preflight exists now, but the conversation ownership check is
    still too weak to call root-chat delete trustworthy on its own
- Durable lesson:
  - Gemini should inherit service URL selection from the shared
    `LlmService`/browser-service seam, not repair ChatGPT-default drift only in
    the adapter
  - preserve working provider-local CRUD flows, but move target/account
    ownership into shared service-layer seams before trusting destructive
    mutations

## 2026-04-05 - Gemini conversation preflight now needs root-list ownership

- Current focus:
  - continue the Gemini `LlmService` audit without landing the still-unfinished
    root conversation delete flow prematurely
- What changed locally:
  - strengthened Gemini conversation preflight so it no longer trusts only:
    - exact `/app/<conversationId>` route shape
  - the local validator now requires:
    - exact route resolves
    - then the same conversation id is present in the authoritative Gemini
      root conversation list on `/app`
- Live proof on managed `wsl-chrome-2 -> gemini`:
  - direct preflight script now returns:
    - `17ecd216fc87eacf` -> invalid or missing
    - `f626d2f5da22efee` -> valid
  - authoritative root list check also matched that split:
    - `17ecd216fc87eacf` absent
    - `f626d2f5da22efee` present
- Why this mattered:
  - the earlier stronger check was still too permissive because an exact-route
    Gemini tab could exist without that conversation being present in the
    current managed browser profile's root list
  - that was still too weak to trust destructive mutation preflight
- Verification:
  - live:
    - `pnpm tsx /tmp/gemini-preflight-proof.mts`
    - `pnpm tsx /tmp/gemini-root-list-check.mts`
  - focused regressions:
    - `pnpm vitest run tests/browser/geminiAdapter.test.ts tests/browser/llmServiceIdentity.test.ts tests/browser/llmServiceFiles.test.ts tests/services/registry.test.ts tests/browser/config.test.ts --maxWorkers 1`
    - `pnpm run check`
- Current boundary:
  - this is the first honest Gemini ownership split for root-chat mutation
    preflight
  - Gemini conversation delete itself is still not ready to land as a durable
    supported feature

## 2026-04-05 - Gemini unusual-traffic interstitial classification

- What happened:
  - a fresh owned-row delete proof against `f626d2f5da22efee` did not even
    reach the Gemini delete trace on rerun because Google served the managed
    browser profile a `google.com/sorry` unusual-traffic interstitial instead
    of Gemini `/app`
- What changed:
  - added provider-local Gemini blocking-page classification so
    `navigateToGeminiConversationSurface(...)` now throws an explicit
    unusual-traffic/interstitial error instead of a generic route-settle
    failure when Gemini is blocked by the Google `sorry` page
  - added focused unit coverage for the classifier in
    `tests/browser/geminiAdapter.test.ts`
- Why this mattered:
  - the latest live blocker was not delete semantics or route ownership
  - it was Google anti-bot traffic gating, and the old error made that look
    like generic Gemini route instability
- Verification:
  - focused regressions:
    - `pnpm vitest run tests/browser/geminiAdapter.test.ts tests/browser/llmServiceIdentity.test.ts tests/browser/llmServiceFiles.test.ts tests/services/registry.test.ts tests/browser/config.test.ts --maxWorkers 1`
    - `pnpm run check`
- Current boundary:
  - Gemini root-chat delete is still not commit-ready
  - current live reruns are additionally constrained by Google unusual-traffic
    interstitials on the managed browser profile

## 2026-04-05 - Deferred captcha-aware browser roadmap item

- What changed:
  - recorded captcha / anti-bot awareness as an explicit deferred roadmap TODO
    instead of letting it hijack the current Gemini refactor/delete slice
  - updated:
    - `docs/dev/next-execution-plan.md`
    - `docs/dev/gemini-completion-plan.md`
    - `docs/dev/browser-service-upgrade-backlog.md`
- Scope of the deferred TODO:
  - explicit detection/classification for `google.com/sorry`, reCAPTCHA, and
    similar human-verification surfaces
  - optional bounded real-pointer assist for simple checkbox challenges
  - otherwise a clean manual-resume operator path
- Current boundary:
  - the captcha-aware work is now captured in roadmap docs
  - it is intentionally not promoted ahead of the active Gemini architecture
    and root-chat delete work

## 2026-04-05 - Start Gemini prompt execution on the shared llmService seam

- What changed:
  - added a shared prompt contract across:
    - `src/browser/providers/types.ts`
    - `src/browser/llmService/types.ts`
    - `src/browser/llmService/llmService.ts`
  - added `runPrompt(...)` to the `LlmService` abstract surface and wired
    `BrowserAutomationClient` through to it
  - implemented Gemini `runPrompt(...)` through the managed browser path instead
    of the older browserless shortcut:
    - resolve the Gemini tab from browser-service
    - focus and populate the live composer
    - send with a pointer click
    - poll the live Gemini DOM for the new assistant text and resulting
      conversation id/url
  - left ChatGPT/Grok prompt execution on their existing paths for now; they
    expose the new service method as intentionally unsupported in this layer
- Verification:
  - `pnpm vitest run tests/browser/geminiAdapter.test.ts tests/browser/llmServiceRateLimit.test.ts tests/browser/llmServiceIdentity.test.ts tests/browser/llmServiceFiles.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
- Current boundary:
  - Gemini now has the first real `llmService` prompt seam needed for the larger
    adapter inheritance cleanup
  - this is not yet a full Gemini parity pass for prompt artifacts, cached
    response metadata, or cross-provider prompt unification

## 2026-04-05 - Harden Gemini prompt-response detection against UI chrome

- What changed:
  - tightened the Gemini response reader so assistant extraction now prefers
    assistant-specific response containers before any broad fallback scan
  - added response-text sanitization for Gemini UI chrome that can be folded
    into the same visible node as the assistant answer, specifically:
    - `Show thinking`
    - `Gemini said`
    - trailing action labels such as `Copy prompt`, `Listen`, and
      `Show more options`
  - added a focused regression in `tests/browser/geminiAdapter.test.ts` for the
    exact live contamination shape
- Verification:
  - `pnpm vitest run tests/browser/geminiAdapter.test.ts`
  - live:
    - `BrowserAutomationClient.runPrompt(...)` on `default -> gemini`
    - prompt:
      - `Disposable CRUD smoke smoke-1775434245568: reply with exactly ACK smoke-1775434245568`
    - result:
      - text: `ACK smoke-1775434245568`
      - conversationId: `d426a807eaa1c09c`
- Current boundary:
  - the prompt path now returns the real assistant text on a live disposable
    Gemini chat
  - broader Gemini CRUD/cache parity work is still separate from this response
    reader repair

## 2026-04-05 - Live Gemini create/delete smoke is green on the managed path

- What changed:
  - ran one bounded end-to-end Gemini root-chat smoke on `default -> gemini`
    through the real managed-browser/service path:
    - create disposable conversation through `BrowserAutomationClient.runPrompt(...)`
    - delete the returned conversation id through the provider delete flow
    - verify absence from a fresh authoritative root list
- Verification:
  - live create:
    - prompt:
      - `Disposable CRUD smoke smoke-1775434245568: reply with exactly ACK smoke-1775434245568`
    - result:
      - text: `ACK smoke-1775434245568`
      - conversationId: `d426a807eaa1c09c`
  - live delete:
    - deleted:
      - `d426a807eaa1c09c`
    - fresh root-list verification:
      - `stillPresent: false`
- Current boundary:
  - the managed Gemini prompt/create/delete path is now live-proven in one
    bounded disposable smoke
  - larger Gemini parity still remains:
    - cache integration
    - broader CRUD coverage
    - deeper `LlmService` inheritance cleanup

## 2026-04-05 - Prefer detected service account identity for cache segregation

- What changed:
  - changed shared `LlmService.resolveCacheIdentity(...)` precedence so a
    provider-detected logged-in account now wins over configured/profile
    identity hints when `cache.useDetectedIdentity` is enabled
  - kept configured/profile identity as fallback only, so cache partitioning is
    driven by the real signed-in service account instead of stale config
- Verification:
  - `pnpm vitest run tests/browser/llmServiceIdentity.test.ts tests/browser/geminiAdapter.test.ts`
  - live on `default -> gemini`:
    - detected identity:
      - `Eric Cochran <ecochran76@gmail.com>`
    - resolved cache key:
      - `ecochran76@gmail.com`
- Current boundary:
  - cache segregation now follows the live service account by default
  - services still need robust provider-local identity probes so detection does
    not silently fall back to config on weaker surfaces

## 2026-04-05 - Align Gemini browser doctor identity with provider/cache reality

- What changed:
  - removed the stale Gemini-specific `unsupported` branch from
    `inspectBrowserDoctorIdentity(...)`
  - Gemini browser doctor now uses the same live provider identity path as the
    other browser targets when a managed session is alive
- Verification:
  - `pnpm vitest run tests/browser/profileDoctor.test.ts tests/browser/llmServiceIdentity.test.ts tests/browser/geminiAdapter.test.ts`
  - live on `default -> gemini`:
    - doctor identity:
      - `Eric Cochran <ecochran76@gmail.com>`
      - `supported: true`
      - `attempted: true`
- Current boundary:
  - Gemini account identity is now consistent across:
    - provider detection
    - shared cache identity resolution
    - browser doctor reporting
  - broader Gemini parity work still remains outside the identity seam

## 2026-04-05 - Tighten Gemini Gem edit-surface button targeting and map knowledge upload DOM

- What changed:
  - stopped relying only on the generic Gemini Gem `create-button` selector for
    save/update flows
  - added a Gem save-button helper that prefers visible labeled actions such as:
    - `Create`
    - `Update Chat`
    - `Update Gem`
    - `Save`
  - post-create verification now also waits for the edit-surface `Start chat`
    button so creation proof is anchored to the real Gem editor surface, not
    only to route change
  - fixed a separate Gemini project-selector bug:
    - arbitrary Gem names no longer normalize as ids
    - cache-backed Gem name resolution now has to consult the real project
      cache instead of accidentally short-circuiting through permissive id
      parsing
  - mapped the live knowledge-upload controls on the Gem edit page:
    - menu trigger:
      - `button[aria-label*="upload file menu for Gem knowledge"]`
    - upload item:
      - `data-test-id="local-images-files-uploader-button"`
    - hidden upload host:
      - `data-test-id="hidden-local-image-upload-button"`
- Verification:
  - `pnpm vitest run tests/browser/geminiAdapter.test.ts tests/browser/llmServiceFiles.test.ts tests/browser/llmServiceIdentity.test.ts tests/browser/profileDoctor.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - live:
    - corrected cache-backed Gem name resolution after create on:
      - `61f0e955b0ca`
- Current boundary:
  - Gem create/save/update targeting is less brittle on the edit surface
  - Gem knowledge file CRUD is still the next implementation slice, but the
    required live DOM controls are now identified

## 2026-04-05 - Gemini browser mutation guard before more live CRUD

- What changed:
  - added a shared `LlmService`-level Gemini browser guard so Gemini now gets
    real per-managed-browser-profile mutation pacing instead of only the
    generic one-retry `500ms` fallback
  - the new Gemini guard persists under the provider runtime cache and now:
    - spaces Gemini mutating actions across service instances
    - enforces a post-write quiet period before immediate follow-on reads
    - records a cooldown when Gemini hits anti-bot / captcha-style errors
  - kept the scope narrow:
    - no broad generic provider-guard refactor
    - no new live Gemini delete claims
- Verification:
  - `pnpm vitest run tests/browser/llmServiceRateLimit.test.ts tests/browser/geminiAdapter.test.ts tests/browser/llmServiceIdentity.test.ts tests/browser/llmServiceFiles.test.ts tests/services/registry.test.ts tests/browser/config.test.ts --maxWorkers 1`
  - `pnpm run check`
- Current boundary:
  - Gemini browser CRUD now has a real pacing/cooldown seam before more live
    testing
  - Gemini root-chat delete itself is still unresolved and remains separate
    from this guard checkpoint

## 2026-04-05 - Gemini Gem knowledge upload/list scaffolded, but live upload is still blocked on chooser activation

- What changed:
  - added Gemini provider support for:
    - `uploadProjectFiles(...)`
    - `listProjectFiles(...)`
  - wired `LlmService` project-file cache refresh through the Gemini Gem path
  - tightened the Gem edit surface around:
    - post-upload save via the real Gem update button
    - staged-file visibility checks that accept Gemini remove-file chips
  - investigated two upload transports on the live Gem edit page:
    - synthetic `fileSelected` dispatch on hidden upload hosts
    - intercepted native chooser via CDP `Page.setInterceptFileChooserDialog`
- Verification:
  - `pnpm vitest run tests/browser/geminiAdapter.test.ts tests/browser/llmServiceFiles.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - live on Gem:
    - `61f0e955b0ca`
- Current boundary:
  - compile/test state is green
  - live Gem knowledge upload is not green yet
  - current blocker:
    - Gemini Gem edit uses hidden `xapfileselectortrigger` buttons and neither
      the synthetic `fileSelected` event path nor the intercepted chooser path
      has yet produced a durable staged upload on the live Gem knowledge
      surface
  - next step:
    - inspect whether the knowledge upload trigger requires a stricter
      human-like activation chain or a different hidden control than the one
      currently exposed by `data-test-id`

## 2026-04-05 - Gemini root new-chat file upload restored with trusted clicks plus CDP chooser interception

- What changed:
  - repaired the Gemini root composer upload path in
    `src/gemini-web/browserNative.ts`
  - the chooser helper now:
    - prefers trusted mouse clicks on the visible upload surfaces
    - intercepts the native chooser through CDP `Page.fileChooserOpened`
    - sets files through `DOM.setFileInputFiles`
    - falls back to Puppeteer chooser handling only if interception does not
      fire
- Verification:
  - `pnpm vitest run tests/gemini.test.ts tests/gemini-web`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - live:
    - `AURACALL_BROWSER_COOKIES_FILE=~/.auracall/browser-profiles/default/gemini/cookies.json pnpm tsx bin/auracall.ts --profile default --engine browser --model gemini-3-pro --browser-attachments always --prompt 'Read the uploaded file and reply exactly with its full contents, with no extra words.' --file /tmp/gemini-new-chat-upload-smoke.txt --wait --force --verbose`
    - attachment staged and submitted:
      - `removeLabels:["Remove file gemini-new-chat-upload-smoke.txt"]`
      - `previewNames:["gemini-new-chat-upload-smoke.txt"]`
    - Gemini answer included the uploaded file contents:
      - `GEMINI NEW CHAT UPLOAD SMOKE 1775437518`
- Current boundary:
  - the root new-chat upload path is working again
  - Gem knowledge upload is still a separate live blocker on the Gem edit
    surface

## 2026-04-05 - Gemini Gem knowledge add/list is now green on the managed edit-page flow

- What changed:
  - tightened Gemini Gem save verification around the explicit live save-state
    indicator:
    - `div[role="status"].save-state`
    - `Gem saved`
  - kept the save-button helper focused on making a trusted click against the
    real visible `Save` / `Update` surface instead of trying to infer a route
    change immediately afterward
  - fixed a separate CLI mismatch:
    - `projects files add|list|remove` now accepts `--target gemini`
  - fixed the Gemini Gem knowledge readback path so fresh `listProjectFiles(...)`
    waits for knowledge-file hydration signals on the edit page before deciding
    the list is empty
- Verification:
  - `pnpm vitest run tests/browser/geminiAdapter.test.ts tests/browser/llmServiceFiles.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - live:
    - upload:
      - `AURACALL_BROWSER_COOKIES_FILE=~/.auracall/browser-profiles/default/gemini/cookies.json pnpm tsx bin/auracall.ts projects files add 61f0e955b0ca --file /home/ecochran76/workspace.local/oracle/AGENTS.md --target gemini --profile default --verbose`
      - returned:
        - `Uploaded 1 file(s) to project 61f0e955b0ca.`
    - fresh list:
      - `AURACALL_BROWSER_COOKIES_FILE=~/.auracall/browser-profiles/default/gemini/cookies.json pnpm tsx bin/auracall.ts projects files list 61f0e955b0ca --target gemini --profile default --verbose`
      - returned:
        - `AGENTS.md`
    - live DOM probe on:
      - `https://gemini.google.com/gems/edit/61f0e955b0ca`
      - showed:
        - `Remove file AGENTS.md`
- Current boundary:
  - Gemini Gem knowledge add/list is now live-proven on `default -> gemini`
  - the next Gemini file slice is deletion and broader file-type coverage, not
    whether persisted add/list basically works

## 2026-04-05 - Gemini Gem knowledge delete is now green on the managed edit-page flow

- What changed:
  - implemented Gemini `deleteProjectFile(...)` on the Gem edit surface using:
    - scoped `Remove file <name>` button targeting
    - trusted pointer click on the visible remove control
    - explicit save-state transitions:
      - `Gem not saved` after removal
      - `Gem saved` after `Update`
    - fresh edit-page readback after save
  - tightened the Gemini delete path to require the real status indicators
    instead of permissive fallbacks like “save button happens to be enabled”
- Verification:
  - `pnpm vitest run tests/browser/geminiAdapter.test.ts tests/browser/llmServiceFiles.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - live delete:
    - `AURACALL_BROWSER_COOKIES_FILE=~/.auracall/browser-profiles/default/gemini/cookies.json pnpm tsx bin/auracall.ts projects files remove 61f0e955b0ca AGENTS.md --target gemini --profile default --verbose`
    - returned:
      - `Removed "AGENTS.md" from project 61f0e955b0ca.`
  - fresh live list:
    - `AURACALL_BROWSER_COOKIES_FILE=~/.auracall/browser-profiles/default/gemini/cookies.json pnpm tsx bin/auracall.ts projects files list 61f0e955b0ca --target gemini --profile default --verbose`
    - returned:
      - `No files found for project 61f0e955b0ca.`
- Current boundary:
  - Gemini Gem knowledge add/list/remove is now live-proven on `default -> gemini`
  - the next Gemini file work is broader file-type coverage and additional Gem
    edit-surface hardening, not the basic CRUD seam

## 2026-04-05 - Gemini Gem delete is now green via direct `/gem/<id>` actions

- What changed:
  - stopped treating Gemini Gem delete as a manager-row-first action
  - rewired the destructive flow around the direct Gem page:
    - navigate to `https://gemini.google.com/gem/<id>`
    - open `button[data-test-id="conversation-actions-menu-icon-button"]`
    - click `button[data-test-id="delete-button"]`
    - confirm with `button[data-test-id="confirm-button"]`
  - kept the final proof on a fresh `gems/view` refresh, but only as a
    verification step after the direct page mutation succeeds
- Verification:
  - `pnpm vitest run tests/browser/geminiAdapter.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - live delete:
    - `AURACALL_BROWSER_COOKIES_FILE=~/.auracall/browser-profiles/default/gemini/cookies.json pnpm tsx bin/auracall.ts projects remove 72ce49fba4a6 --target gemini --profile default --verbose`
    - returned:
      - `Removed project 72ce49fba4a6.`
  - fresh live list:
    - `AURACALL_BROWSER_COOKIES_FILE=~/.auracall/browser-profiles/default/gemini/cookies.json pnpm tsx bin/auracall.ts projects --target gemini --profile default`
    - no longer included:
      - `72ce49fba4a6`
- Current boundary:
  - Gemini Gem create/rename/delete and Gem knowledge add/list/remove are now
    live-proven on `default -> gemini`
  - the remaining Gemini CRUD work is quality hardening and parity cleanup, not
    whether the basic Gem deletion seam works

## 2026-04-05 - Gemini conversation delete is now green via direct `/app/<id>` actions

- What changed:
  - stopped treating Gemini conversation delete as a list/sidebar-first action
  - rewired `deleteConversation(...)` around the direct conversation page:
    - navigate to `https://gemini.google.com/app/<id>`
    - open `button[data-test-id="conversation-actions-menu-icon-button"]`
    - click `button[data-test-id="delete-button"]`
    - confirm with `button[data-test-id="confirm-button"]`
  - widened the top-level CLI delete command to accept `--target gemini` so
    the real provider flow is reachable through `auracall delete <id>`
  - kept the final proof on a refreshed conversation list instead of trusting
    the immediate post-delete cache read
- Verification:
  - `pnpm vitest run tests/browser/geminiAdapter.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - live delete:
    - `AURACALL_BROWSER_COOKIES_FILE=~/.auracall/browser-profiles/default/gemini/cookies.json pnpm tsx bin/auracall.ts delete f7fb3a60d65dfe49 --target gemini --profile default --yes`
    - returned:
      - `Deleted successfully.`
  - fresh live list:
    - `AURACALL_BROWSER_COOKIES_FILE=~/.auracall/browser-profiles/default/gemini/cookies.json pnpm tsx bin/auracall.ts conversations --target gemini --profile default --refresh`
    - no longer included:
      - `f7fb3a60d65dfe49`
- Current boundary:
  - Gemini root conversation delete now matches the same direct-page action
    model as Gemini Gem delete
  - non-refresh list reads immediately after delete can still lag, so refreshed
    readback remains the authoritative verification surface

## 2026-04-05 - Gemini CLI parity audit reset the next roadmap around operational parity

- What changed:
  - audited the current Gemini CLI/browser surface against ChatGPT/Grok-style
    operational parity instead of treating Gemini as only a browser CRUD line
  - confirmed the main remaining gaps are now operational:
    - stale CLI target gating
    - missing Gemini cache operator support
    - thin Gemini CLI regression coverage
    - post-delete cache freshness hardening
  - updated planning docs so the next Gemini slices are explicitly:
    - CLI parity for already-green Gemini surfaces
    - cache/operator parity
    - Gemini CLI regression coverage
    - then explicit provider-surface backlog
- Key findings:
  - Gemini browser CRUD is no longer the main blocker:
    - Gem CRUD: green
    - Gem knowledge file CRUD: green
    - root conversation delete: green
  - one stale CLI exclusion was already fixed live today:
    - top-level `delete --target gemini`
  - the next obvious stale operator gap is cache tooling, which still excludes
    Gemini even though Gemini now writes real provider/account-scoped cache
- Current boundary:
  - the roadmap now treats Gemini parity as a productized CLI/cache consistency
    track, not more open-ended live DOM probing

## 2026-04-05 - Gemini cache CLI parity is now unblocked for provider-scoped cache operations

- What changed:
  - widened the cache/operator CLI provider gates from `chatgpt|grok` to
    `chatgpt|gemini|grok` across the cache inspection/export/maintenance
    surfaces that operate on provider cache directories
  - centralized cache-provider validation and provider-configured URL
    resolution in `bin/auracall.ts` so Gemini support is not patched command by
    command
  - hardened Gemini conversation delete cache refresh so a transient empty
    post-delete list does not immediately overwrite an otherwise healthy cache
    after a successful delete
  - added CLI integration coverage for Gemini cache provider acceptance
- Verification:
  - `pnpm vitest run tests/cli/cacheGeminiParity.test.ts tests/browser/geminiAdapter.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - local operator proof:
    - `pnpm tsx bin/auracall.ts cache --provider gemini`
    - returned live Gemini `projects` and `conversations` cache rows for:
      - `ecochran76@gmail.com`
- Current boundary:
  - Gemini cache/operator entry points are now reachable through the CLI
  - a separate cache-content parity audit still remains for deeper context/search
    and export/readback semantics beyond provider acceptance and base listing

## 2026-04-05 - Gemini cache context inspection now stays on the requested cache identity

- What changed:
  - cache context CLI commands now disable live identity detection when the
    operator explicitly targets a provider cache surface, so Gemini cache reads
    stay on the requested provider/account instead of drifting to the currently
    signed-in browser identity
  - `LlmService` cache context helpers now accept explicit cache-resolution
    options for deterministic operator flows
  - cached conversation-context lookup now accepts provider-native conversation
    IDs directly instead of assuming every non-UUID selector is a title
  - added CLI integration coverage for:
    - `cache context list --provider gemini`
    - `cache context get <id> --provider gemini`
- Verification:
  - `pnpm vitest run tests/cli/cacheGeminiParity.test.ts tests/browser/geminiAdapter.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
- Current boundary:
  - provider-scoped Gemini cache inspection is now deterministic for base
    listing/export/context read paths
  - semantic search and broader content-parity review still remain

## 2026-04-05 - Gemini cache search and catalog readbacks are now covered through the CLI

- What changed:
  - extended Gemini cache CLI regression coverage beyond provider acceptance to
    actual seeded readback behavior for:
    - `cache search --provider gemini`
    - `cache sources list --provider gemini`
    - `cache files list --provider gemini`
    - `cache files resolve --provider gemini`
  - the regression fixture now covers the JSON fallback paths Aura-Call uses
    when SQLite catalogs are absent:
    - cached conversation messages
    - cached source links
    - cached file bindings from conversation context
- Verification:
  - `pnpm vitest run tests/cli/cacheGeminiParity.test.ts tests/browser/geminiAdapter.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
- Current boundary:
  - Gemini cache listing/export/context read/search/source/file catalog paths
    now have deterministic CLI coverage
  - semantic search and cache maintenance/reporting depth are the next parity
    surfaces worth auditing

## 2026-04-05 - Cache centralization is now the next Gemini parity seam

- Audit result:
  - the cache model is only partially centralized today
  - `LlmService` owns core cache identity/context behavior, but `bin/auracall.ts`
    still rebuilds too much provider-cache policy locally:
    - cache search context resolution
    - maintenance context discovery
    - some manual cache context assembly
    - repeated provider URL ownership decisions
- Practical consequence:
  - Gemini parity work keeps surfacing as command-local CLI fixes instead of one
    shared provider-cache refactor
- Next plan:
  - add one shared cache operator context seam
  - add one shared cache maintenance discovery seam
  - reduce command-local cache policy in `bin/auracall.ts`

## 2026-04-05 - First shared cache operator seam is now in place

- What changed:
  - added [operatorContext.ts](/home/ecochran76/workspace.local/oracle/src/browser/llmService/cache/operatorContext.ts)
    as the first shared cache operator layer for:
    - provider validation
    - configured URL ownership
    - deterministic operator-mode cache context resolution
    - cache maintenance context discovery
  - moved Gemini cache CLI flows off command-local setup logic and onto that
    shared seam for:
    - `cache export`
    - `cache context list`
    - `cache context get`
    - cache search/catalog helpers
    - cache doctor/repair/clear/compact/cleanup discovery
  - removed one remaining manual cache context assembly path in
    `resolveBrowserNameHints(...)`
- Verification:
  - `pnpm vitest run tests/cli/cacheGeminiParity.test.ts tests/browser/geminiAdapter.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
- Current boundary:
  - the main cache command families now share one provider-cache setup seam
  - deeper cache maintenance internals still live in `bin/auracall.ts` and are
    the next centralization opportunity

## 2026-04-05 - Cache-system audit reset the next planning seam around model quality

- Audit focus:
  - robustness
  - maintainability
  - searchability
  - support for heterogeneous provider artifact surfaces
- Main conclusion:
  - the cache stack is already useful, but it is still too dataset-shaped and
    command-shaped in a few critical places
  - the next plan should treat cache as a first-class subsystem with:
    - a clearer canonical entity model
    - stronger schema/version ownership
    - cleaner separation between canonical cache state and derived search
      catalogs
    - explicit artifact/file/source semantics
- Immediate planning direction:
  - pause incremental Gemini-only cache patches
  - define a staged cache architecture plan before deeper maintenance/export
    work continues

## 2026-04-05 - Wrote the cache architecture anti-drift plan

- Added:
  - [cache-architecture-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/cache-architecture-plan.md)
- What it does:
  - defines the cache subsystem in four layers:
    - cache scope
    - canonical records
    - derived projections
    - operator views
  - makes canonical-vs-derived ownership explicit
  - calls out first-class artifact support as the next missing model seam
  - records anti-drift rules for future cache work
- Alignment:
  - linked the new architecture plan from:
    - [cache-schema.md](/home/ecochran76/workspace.local/oracle/docs/dev/cache-schema.md)
    - [cache-remaining-todos-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/cache-remaining-todos-plan.md)

## 2026-04-05 - Turned the cache architecture note into a concrete artifact/projection implementation plan

- Added:
  - [cache-artifact-projection-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/cache-artifact-projection-plan.md)
- What it does:
  - turns the architecture note into one bounded next slice
  - defines:
    - `artifact_bindings` as the next projection seam
    - projection-sync extraction as a named shared module boundary
    - a minimal `cache artifacts list` operator target
    - explicit anti-drift rules so export/provider code does not become the
      de facto artifact model
- Alignment:
  - linked the new plan from:
    - [cache-architecture-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/cache-architecture-plan.md)
    - [cache-remaining-todos-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/cache-remaining-todos-plan.md)

## 2026-04-05 - Reframed Gemini CLI parity as closed for now, with explicit backlog

- Planning update:
  - updated:
    - [gemini-completion-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/gemini-completion-plan.md)
    - [next-execution-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/next-execution-plan.md)
- Main conclusion:
  - Gemini CLI/operator parity for already-green surfaces is now largely in
    maintenance mode
  - remaining work should be tracked explicitly as:
    - shared cache architecture work
    - Gemini provider backlog
- Explicit Gemini backlog retained:
  - conversation rename
  - conversation context/files/artifacts parity
  - account-level files parity

## 2026-04-06 - Landed the first artifact projection cache slice

- What changed:
  - added:
    - [projectionSync.ts](/home/ecochran76/workspace.local/oracle/src/browser/llmService/cache/projectionSync.ts)
  - `SqliteCacheStore` now uses that shared projection seam for:
    - source links
    - file bindings
    - artifact bindings
  - added first-class SQLite artifact projection support:
    - `artifact_bindings`
  - added internal artifact catalog reads in:
    - [catalog.ts](/home/ecochran76/workspace.local/oracle/src/browser/llmService/cache/catalog.ts)
  - added focused regression coverage in:
    - [cacheCatalog.test.ts](/home/ecochran76/workspace.local/oracle/tests/browser/cacheCatalog.test.ts)
- Verification:
  - `pnpm vitest run tests/browser/cacheCatalog.test.ts tests/browser/providerCache.test.ts tests/cli/cacheGeminiParity.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
- Current boundary:
  - the cache model now has a real artifact projection seam
  - operator CLI exposure for artifact catalogs is still deferred
  - export still renders artifacts from canonical context, which is fine for
    now because the projection/query seam exists underneath it

## 2026-04-06 - Exposed artifact catalogs through the cache CLI

- What changed:
  - added:
    - `auracall cache artifacts list`
  - widened the Gemini cache fixture to include canonical artifact rows
  - added CLI regression coverage for:
    - `cache artifacts list --provider gemini`
- Docs updated:
  - [browser-mode.md](/home/ecochran76/workspace.local/oracle/docs/browser-mode.md)
  - [gemini.md](/home/ecochran76/workspace.local/oracle/docs/gemini.md)
  - [testing.md](/home/ecochran76/workspace.local/oracle/docs/testing.md)
- Verification:
  - `pnpm vitest run tests/cli/cacheGeminiParity.test.ts tests/browser/cacheCatalog.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
- Current boundary:
  - artifact catalog inspection is now a real operator surface
  - export/discovery still does not depend on artifact projections for counts
    or inventory planning yet

## 2026-04-06 - Export surfaces now distinguish conversation files from artifacts

- What changed:
  - conversation/context markdown + HTML exports now render:
    - `Files` for user/provider-supplied conversation files
    - `Artifacts` for provider/model outputs
  - conversation/context CSV exports now include:
    - `sourceCount`
    - `fileCount`
    - `artifactCount`
- Why:
  - artifact work should not accidentally erase the distinct role of uploaded or
    user-backed files
  - export/discovery views need to show both sides of the surface cleanly
- Verification:
  - `pnpm vitest run tests/browser/cacheExport.test.ts tests/browser/cacheCatalog.test.ts tests/cli/cacheGeminiParity.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
- Current boundary:
  - exports now cover both generated/provider artifacts and user/provider files
  - they still read canonical context for transcript fidelity rather than using
    projection tables for export planning

## 2026-04-06 - Cache doctor/repair now treats artifact projections as first-class parity data

- What changed:
  - extended `cache doctor` parity inspection to count orphan
    `artifact_bindings` rows
  - extended `cache repair` with:
    - `prune-orphan-artifact-bindings`
  - widened the Gemini cache CLI fixture to seed a real orphan
    `artifact_bindings` row in SQLite
  - added CLI regression coverage for:
    - `cache doctor --provider gemini --json`
    - `cache repair --provider gemini --actions prune-orphan-artifact-bindings`
- Why:
  - artifact projections had become first-class cache entities, but maintenance
    tooling still only understood source/file parity drift
  - that left cache integrity checks structurally incomplete
- Docs updated:
  - [browser-mode.md](/home/ecochran76/workspace.local/oracle/docs/browser-mode.md)
  - [testing.md](/home/ecochran76/workspace.local/oracle/docs/testing.md)
- Verification:
  - `pnpm vitest run tests/cli/cacheGeminiParity.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
- Current boundary:
  - doctor/repair now covers orphan artifact projection rows
  - export/discovery still has room to use projected artifact counts more
    directly for higher-level planning/reporting

## 2026-04-06 - Export CSV planning now uses one shared conversation inventory seam

- What changed:
  - added `listCachedConversationInventory(...)` in the cache catalog layer
  - that seam now centralizes per-conversation:
    - `messageCount`
    - `sourceCount`
    - `fileCount`
    - `artifactCount`
  - context/conversation CSV export now reads those counts from the shared
    inventory helper instead of recomputing them inline
  - conversation-list CSV export now includes the same inventory counts
- Why:
  - export/reporting was still too dataset-shaped and ad hoc
  - one centralized conversation inventory read path is a better foundation for
    broader reporting and discovery work
- Docs updated:
  - [browser-mode.md](/home/ecochran76/workspace.local/oracle/docs/browser-mode.md)
- Verification:
  - `pnpm vitest run tests/browser/cacheCatalog.test.ts tests/browser/cacheExport.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
- Current boundary:
  - CSV/reporting counts now come from a shared cache seam
  - richer cache doctor/report/export planning can still build further on that
    same inventory model

## 2026-04-06 - Top-level cache listings now expose aggregated conversation inventory

- What changed:
  - reused `listCachedConversationInventory(...)` in the top-level
    `auracall cache` command
  - `kind: "conversations"` rows now include `inventorySummary` with:
    - `conversationCount`
    - `messageCount`
    - `sourceCount`
    - `fileCount`
    - `artifactCount`
- Why:
  - the top-level operator cache view previously only showed freshness metadata
    for `conversations.json`
  - it did not expose what was actually present in the conversation cache
- Docs updated:
  - [browser-mode.md](/home/ecochran76/workspace.local/oracle/docs/browser-mode.md)
- Verification:
  - `pnpm vitest run tests/cli/cacheGeminiParity.test.ts tests/browser/cacheCatalog.test.ts tests/browser/cacheExport.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
- Current boundary:
  - top-level cache reporting now benefits from the shared inventory seam
  - cache doctor/report/export can still be brought onto the same model more
    completely in later slices

## 2026-04-06 - Cache doctor now carries aggregated conversation inventory too

- What changed:
  - reused the shared conversation inventory seam in `cache doctor`
  - doctor JSON entries now include `inventorySummary` with aggregate:
    - `conversationCount`
    - `messageCount`
    - `sourceCount`
    - `fileCount`
    - `artifactCount`
  - text-mode doctor output now shows conversation/message totals inline with
    the existing integrity summary
- Why:
  - maintenance reports should not require a second command just to understand
    what cache volume is being checked
- Docs updated:
  - [browser-mode.md](/home/ecochran76/workspace.local/oracle/docs/browser-mode.md)
  - [testing.md](/home/ecochran76/workspace.local/oracle/docs/testing.md)
- Verification:
  - `pnpm vitest run tests/cli/cacheGeminiParity.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
- Current boundary:
  - top-level cache listing and doctor now share the same aggregate model
  - repair/clear/cleanup summaries still mostly speak in lower-level dataset
    terms

## 2026-04-06 - Cache clear/cleanup now report shared inventory before and after mutation

- What changed:
  - reused the shared conversation inventory seam around `cache clear`
  - reused the same seam around `cache cleanup`
  - both JSON reports now include:
    - `inventoryBefore`
    - `inventoryAfter`
  - text-mode clear/cleanup summaries now show conversation/message totals as
    before/after transitions
- Why:
  - maintenance summaries were still too dataset-shaped and did not clearly say
    what conversational cache volume a mutation would affect
- Docs updated:
  - [browser-mode.md](/home/ecochran76/workspace.local/oracle/docs/browser-mode.md)
  - [testing.md](/home/ecochran76/workspace.local/oracle/docs/testing.md)
- Verification:
  - `pnpm vitest run tests/cli/cacheGeminiParity.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
- Current boundary:
  - `cache`, `cache doctor`, `cache clear`, `cache cleanup`, and export CSV now
    all share the same aggregate conversation inventory model
  - `cache compact` remains size-oriented, which is appropriate

## 2026-04-06 - Gemini conversation rename is now live through the direct chat page

- Focus:
  - close the next explicit Gemini provider backlog item after cache
    centralization: root conversation rename
- What changed:
  - implemented `renameConversation(...)` in
    `src/browser/providers/geminiAdapter.ts`
  - Gemini now renames from the direct `/app/<conversationId>` page via:
    - `conversation-actions-menu-icon-button`
    - `rename-button`
    - rename dialog `edit-title-input`
  - the flow now submits through the shared browser-service
    `submitInlineRename(...)` helper using native input entry and native/synthetic
    Enter fallback, then verifies the renamed row on a fresh root Gemini
    conversation list read
  - wired `GeminiService.renameConversation(...)` onto the real provider seam
    instead of the old unsupported stub
  - added focused provider-surface coverage in
    `tests/browser/geminiAdapter.test.ts`
- Docs updated:
  - [gemini.md](/home/ecochran76/workspace.local/oracle/docs/gemini.md)
  - [testing.md](/home/ecochran76/workspace.local/oracle/docs/testing.md)
  - [gemini-completion-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/gemini-completion-plan.md)
  - [next-execution-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/next-execution-plan.md)
- Verification:
  - `pnpm vitest run tests/browser/geminiAdapter.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - live:
    - `pnpm tsx bin/auracall.ts rename dc7b095922577de3 'AuraCall Gemini Rename Smoke 1775466602' --target gemini --profile default`
    - returned:
      - `Renamed successfully.`
- Current boundary:
  - Gemini conversation rename/delete are now green on the direct `/app/<id>`
    action-menu surface
  - the remaining explicit Gemini provider backlog is now:
    - conversation files/artifacts parity
    - account-level files

## 2026-04-06 - Gemini conversation context now reads canonical messages from the direct chat page

- Focus:
  - close the next explicit Gemini provider backlog item after rename:
    minimal conversation context parity
- What changed:
  - implemented Gemini `readConversationContext(...)` in
    `src/browser/providers/geminiAdapter.ts` and wired it through
    `src/browser/llmService/providers/geminiService.ts`
  - widened `auracall conversations context get` so `--target gemini` now uses
    the shared provider/cache contract instead of a stale ChatGPT/Grok-only gate
  - Gemini now reads ordered `user-query` / `model-response` turn containers
    from the direct `/app/<conversationId>` page and extracts text from the
    inner message nodes:
    - user turns from `user-query-content .query-text-line` / `.query-text`
    - assistant turns from
      `structured-content-container.model-response-text message-content` /
      `.markdown`
  - the extractor now sanitizes Gemini chrome wrappers instead of treating them
    as content:
    - strips `You said`
    - strips `Show thinking Gemini said`
  - added focused shared-contract coverage in:
    - `tests/browser/geminiAdapter.test.ts`
    - `tests/browser/llmServiceContext.test.ts`
- Docs updated:
  - [gemini.md](/home/ecochran76/workspace.local/oracle/docs/gemini.md)
  - [testing.md](/home/ecochran76/workspace.local/oracle/docs/testing.md)
  - [gemini-completion-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/gemini-completion-plan.md)
  - [next-execution-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/next-execution-plan.md)
- Verification:
  - `pnpm vitest run tests/browser/geminiAdapter.test.ts tests/browser/llmServiceContext.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - live:
    - `pnpm tsx bin/auracall.ts conversations context get 841b485bcb3819af --target gemini --profile default --json-only`
    - returned canonical `messages[]`:
      - user:
        - `Read the uploaded file and reply exactly with its full contents, with no extra words.`
      - assistant:
        - `GEMINI NEW CHAT UPLOAD SMOKE 1775437518`
- Current boundary:
  - Gemini now has minimal conversation context parity for `messages[]`
  - the remaining explicit Gemini provider backlog is now:
    - conversation artifacts parity
    - account-level files

## 2026-04-06 - Gemini conversation files now read from visible sent-upload chips

- Focus:
  - close the next narrow Gemini read-side gap after message-level context:
    conversation file parity for visible sent uploads
- What changed:
  - extended Gemini `readConversationContext(...)` in
    `src/browser/providers/geminiAdapter.ts` so user turns now collect visible
    upload chips from the direct `/app/<conversationId>` page
  - the extractor now reads file metadata from the live chip surface:
    - full filename from the inner button `aria-label`
    - visible fallback name from `.new-file-name`
    - visible fallback type from `.new-file-type` / `.file-type`
  - widened `auracall conversations files list` so `--target gemini` can use
    the shared `context.files[]` fallback path instead of a stale
    ChatGPT/Grok-only gate
  - Gemini now returns synthetic stable conversation file refs shaped like:
    - `gemini-conversation-file:<conversationId>:<ordinal>:<name>`
- Docs updated:
  - [gemini.md](/home/ecochran76/workspace.local/oracle/docs/gemini.md)
  - [testing.md](/home/ecochran76/workspace.local/oracle/docs/testing.md)
  - [gemini-completion-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/gemini-completion-plan.md)
  - [next-execution-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/next-execution-plan.md)
- Verification:
  - `pnpm vitest run tests/browser/geminiAdapter.test.ts tests/browser/llmServiceContext.test.ts tests/browser/llmServiceFiles.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - live:
    - `pnpm tsx bin/auracall.ts conversations files list 841b485bcb3819af --target gemini --profile default`
    - returned:
      - `gemini-new-chat-upload-smoke.txt`
- Current boundary:
  - Gemini conversation read parity now covers:
    - `messages[]`
    - visible sent `files[]`
  - the remaining explicit Gemini provider backlog is now:
    - broader conversation artifacts parity
    - account-level files

## 2026-04-06 - Gemini conversation context now returns visible generated-image artifacts

- Focus:
  - prove whether Gemini chat pages expose a real artifact surface worth
    normalizing in `conversations context get`
- What changed:
  - created a disposable managed-browser Gemini image chat:
    - `/app/3525c884edae4fa4`
  - live DOM inspection on the direct chat page proved a real assistant image
    surface:
    - rendered image node `img.image.loaded`
    - image tile button `button.image-button`
    - direct image action button
      `button[data-test-id="download-generated-image-button"]`
  - extended Gemini `readConversationContext(...)` so visible assistant image
    nodes now normalize into first-class `artifacts[]` entries with:
    - `kind: "image"`
    - blob `uri`
    - width / height metadata
  - changed the provider readback to serialize the page payload in-browser and
    parse it in Node, which avoided the earlier CDP by-value marshaling gap
    that was dropping `artifacts[]`
- Docs updated:
  - [gemini.md](/home/ecochran76/workspace.local/oracle/docs/gemini.md)
  - [testing.md](/home/ecochran76/workspace.local/oracle/docs/testing.md)
  - [gemini-completion-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/gemini-completion-plan.md)
  - [next-execution-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/next-execution-plan.md)
- Verification:
  - `pnpm vitest run tests/browser/geminiAdapter.test.ts tests/browser/llmServiceContext.test.ts tests/browser/llmServiceFiles.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - live:
    - `pnpm tsx bin/auracall.ts conversations context get 3525c884edae4fa4 --target gemini --profile default --json-only`
    - returned one `image` artifact with blob `uri` plus `width`/`height`
- Current boundary:
  - Gemini conversation read parity now covers:
    - `messages[]`
    - visible sent `files[]`
    - visible generated-image `artifacts[]`
  - the remaining explicit Gemini provider backlog is now:
    - broader conversation artifacts parity
    - account-level files

## 2026-04-06 - Gemini browser doctor now emits a live feature signature for drawer/composer drift detection

- Focus:
  - stop treating Gemini browser doctor as local-files-only and give Aura-Call a
    real live feature/discovery seam for Gemini’s evolving composer surfaces
- What changed:
  - extended the shared browser doctor contract with `featureStatus`
  - added `BrowserAutomationClient.getFeatureSignature()` and
    `inspectBrowserDoctorFeatures(...)`
  - implemented Gemini `getFeatureSignature()` in
    `src/browser/providers/geminiAdapter.ts`
  - Gemini now emits a normalized feature signature shaped around:
    - detector version
    - detected Gemini feature flags
    - discovered mode labels
    - discovered toggle state when visible
    - current active mode label when visible
  - widened `auracall doctor --target gemini` so it no longer hard-fails
    outside `--local-only`; it now reports:
    - local managed-profile state
    - live signed-in account identity
    - live `featureStatus`
    while still leaving selector diagnosis explicitly unsupported for Gemini
  - added manifest-backed Gemini feature/drawer tokens in
    `configs/auracall.services.json` so discovery can feed a durable drift
    signature instead of one-off ad hoc text probes
- Docs updated:
  - [gemini.md](/home/ecochran76/workspace.local/oracle/docs/gemini.md)
  - [testing.md](/home/ecochran76/workspace.local/oracle/docs/testing.md)
  - [gemini-completion-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/gemini-completion-plan.md)
  - [next-execution-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/next-execution-plan.md)
- Verification:
  - `pnpm vitest run tests/browser/geminiAdapter.test.ts tests/browser/profileDoctor.test.ts tests/cli/browserSetup.test.ts tests/services/registry.test.ts tests/browser/llmServiceIdentity.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - live:
    - `pnpm tsx bin/auracall.ts conversations --target gemini --profile default --refresh`
    - `pnpm tsx bin/auracall.ts doctor --target gemini --json`
- Current boundary:
  - the Gemini feature signature seam is now real and cache/doctor-compatible
  - the current probe still captures the model-picker + visible composer
    surfaces more reliably than the richer hidden creation drawer the user
    identified
  - the next Gemini discovery slice should explicitly find and normalize that
    richer composer drawer (`create music`, `create video`, `canvas`,
    `deep research`, `personal intelligence`, etc.) rather than broadening more
    unrelated Gemini CRUD

## 2026-04-06 - browser-tools search now gives browser-service a structured DOM-census primitive for volatile provider surfaces

- Focus:
  - stop relying on ad hoc provider-local `eval(...)` snippets for volatile DOM
    discovery, especially on Gemini's evolving `Tools` drawer surface
- What changed:
  - added a package-owned `browser-tools search` command in
    `packages/browser-service/src/browserTools.ts`
  - the new primitive supports bounded generic matching on:
    - text
    - `aria-label`
    - role
    - `data-test-id`
    - class substring
    - tag name
    - `aria-checked`
    - `aria-expanded`
    - visibility
  - each match now returns reusable structured metadata instead of raw HTML:
    - tag
    - role
    - text
    - `aria-label`
    - `data-test-id`
    - classes
    - href
    - checked / expanded state
  - added focused coverage in
    `tests/browser/browserTools.test.ts`
- Live proof:
  - `pnpm tsx scripts/browser-tools.ts --auracall-profile default --browser-target gemini search --class-includes toolbox-drawer-button --text Tools --limit 10 --json`
    found the real Gemini `Tools` opener on the managed `default` Gemini page
  - after opening the drawer, the same search surface found the richer Gemini
    drawer rows:
    - `Create image`
    - `Canvas`
    - `Deep research`
    - `Create video`
    - `Create music`
    - `Guided learning`
  - `search --aria-label "Personal Intelligence" --role switch --json`
    returned the live switch node with `checked: true`
- Docs updated:
  - [docs/dev/browser-service-tools.md](/home/ecochran76/workspace.local/oracle/docs/dev/browser-service-tools.md)
  - [docs/dev/browser-service-upgrade-backlog.md](/home/ecochran76/workspace.local/oracle/docs/dev/browser-service-upgrade-backlog.md)
  - [docs/testing.md](/home/ecochran76/workspace.local/oracle/docs/testing.md)
  - [docs/gemini.md](/home/ecochran76/workspace.local/oracle/docs/gemini.md)
- Durable lesson:
  - volatile provider DOM discovery belongs on one package-owned structured
    DOM-census seam; adapters should consume reusable facts from that seam
    before adding more one-off `evaluate(...)` census code
- Next:
  - refactor Gemini feature discovery to consume the same structured DOM-search
    semantics more directly instead of mixing drawer census and provider-local
    fallback heuristics

## 2026-04-06 - Gemini feature discovery now shares browser-service DOM-search semantics, but live doctor still needs a more reliable drawer-open transition

- Focus:
  - stop keeping a second provider-local Gemini drawer census model now that
    browser-service owns `browser-tools search`
- What changed:
  - extracted the generic DOM-search expression builder into
    `packages/browser-service/src/service/domSearch.ts`
  - cut `packages/browser-service/src/browserTools.ts` over to that shared
    expression builder instead of embedding its own separate matching logic
  - cut Gemini's `readGeminiToolsDrawerProbe(...)` over to the same shared
    DOM-search semantics in
    `src/browser/providers/geminiAdapter.ts`
  - added an explicit `ensureGeminiToolsDrawerOpen(...)` helper so Gemini
    feature discovery now has a single drawer-open seam before it falls back to
    the older model-picker/body probe
- Verification:
  - `pnpm vitest run tests/browser/geminiAdapter.test.ts tests/browser/browserTools.test.ts tests/browser/profileDoctor.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - live:
    - `pnpm tsx bin/auracall.ts doctor --target gemini --profile default --json`
- Issues:
  - the shared DOM-search model is now real, but the live `doctor` run still
    falls back to the older Gemini feature probe more often than it should
  - that means the remaining problem is not DOM matching drift anymore; it is
    the reliability of the live `Tools` drawer activation inside the doctor flow
- Next:
  - harden the doctor-side drawer-open transition itself before widening Gemini
    discovery further

## 2026-04-06 - browser-tools ls now gives browser-service a generic page census for discoverable UI controls

- Focus:
  - add the missing browser-service answer to “what important controls and UI
    surfaces are on this page right now?”
- What changed:
  - added package-owned `browser-tools ls` in
    `packages/browser-service/src/browserTools.ts`
  - the new listing groups visible UI into:
    - dialogs
    - menus
    - buttons
    - menu items
    - switches
    - inputs
    - links
  - each row includes structured facts instead of raw DOM:
    - tag
    - role
    - text
    - `aria-label`
    - `data-test-id`
    - class list
    - checked / expanded / disabled state
    - inferred widget type
    - path hint
    - interaction hints
  - `ls` now also looks for upload paths explicitly:
    - `fileInputs` includes native `input[type="file"]` paths even when hidden
    - `uploadCandidates` includes visible upload/attach triggers plus hidden
      chooser inputs that likely back them
  - added focused coverage in
    `tests/browser/browserTools.test.ts`
- Verification:
  - `pnpm vitest run tests/browser/browserTools.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
- Docs updated:
  - [docs/dev/browser-service-tools.md](/home/ecochran76/workspace.local/oracle/docs/dev/browser-service-tools.md)
  - [docs/dev/browser-service-upgrade-backlog.md](/home/ecochran76/workspace.local/oracle/docs/dev/browser-service-upgrade-backlog.md)
  - [docs/testing.md](/home/ecochran76/workspace.local/oracle/docs/testing.md)
- Next:
  - use `ls` plus `search` as the browser-service evidence surfaces before
    widening Gemini doctor/discovery semantics again
## 2026-04-06 - Gemini doctor now consumes browser-tools uiList evidence

- Focus: make `auracall doctor --target gemini --json` reflect what
  browser-service can actually prove on the live Gemini page
- Progress:
  - extended the browser-tools doctor report with optional `uiList` census data
  - changed the Gemini doctor JSON path to collect that `uiList` evidence on
    the active managed Gemini tab
  - added provider-owned helpers to derive and merge Gemini mode/toggle
    evidence from browser-tools `uiList`
  - changed browser doctor feature inspection to surface explicit evidence
    metadata under `featureStatus.detected.evidence`
- Notes:
  - the remaining issue is now drawer-open reliability, not loss of already
    collected browser-service evidence
  - follow-up: when live doctor still opened the Gemini model picker, changed
    the doctor path to skip the provider feature probe entirely whenever
    browser-tools `uiList` evidence is already present, so the proven
    browser-service drawer census becomes authoritative and side-effect free
  - follow-up: when live doctor still left overlapping overlays behind, added
    explicit Gemini browser-tools prep/cleanup so doctor dismisses stale
    overlays, opens only `Tools`, captures the `uiList`, then closes transient
    overlays before returning

## 2026-04-06 - browser feature discovery is now a first-class AuraCall surface

- Focus:
  - extract live provider feature discovery out of `doctor` so operators can
    inspect volatile provider tools/toggles without coupling that work to
    browser health diagnostics
- Progress:
  - added a versioned `auracall.browser-features` contract in
    `src/browser/profileDoctor.ts`
  - extracted shared browser-tools collection into a reusable browser feature
    runtime helper so `doctor` and `features` use the same Gemini `Tools`
    drawer prep/cleanup path
  - added top-level:
    - `auracall features --target <chatgpt|gemini|grok> [--json]`
  - live Gemini feature discovery now returns:
    - `canvas`
    - `create image`
    - `create music`
    - `create video`
    - `deep research`
    - `personal intelligence = true`
    - browser-tools `uiList` summary with `menus=1`, `menuItems=6`,
      `switches=1`, `uploadCandidates=3`
- Verification:
  - `pnpm vitest run tests/browser/profileDoctor.test.ts tests/browser/geminiAdapter.test.ts tests/browser/browserTools.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - live:
    - `pnpm tsx bin/auracall.ts features --target gemini --profile default --json`
    - `pnpm tsx bin/auracall.ts features --target gemini --profile default`
- Next:
  - add `features snapshot`
  - add `features diff`
  - keep those flows bound to the same `auracall.browser-features` contract

## 2026-04-06 - browser feature snapshot/diff now gives AuraCall an anti-drift workflow

- Focus:
  - turn live provider feature discovery into something operators can compare
    over time instead of a one-shot probe
- Progress:
  - added `src/browser/featureDiscovery.ts`
  - added:
    - `auracall features snapshot --target <provider> [--json]`
    - `auracall features diff --target <provider> [--json]`
  - snapshots now write under:
    - `~/.auracall/feature-snapshots/<auracallProfile>/<target>/`
  - `features diff` now compares:
    - detected modes
    - detected toggles
    - browser-tools `uiList` menu items
    - browser-tools `uiList` upload candidates
  - fixed a nested Commander-option bug in the new subcommands:
    - `--target`
    - `--json`
    now resolve correctly even when the parent `features` command also defines
    them
- Verification:
  - `pnpm vitest run tests/browser/featureDiscovery.test.ts tests/browser/profileDoctor.test.ts tests/browser/geminiAdapter.test.ts tests/browser/browserTools.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - live:
    - `pnpm tsx bin/auracall.ts features snapshot --target gemini --profile default --label smoke --json`
    - `pnpm tsx bin/auracall.ts features diff --target gemini --profile default --json`
  - current live `default` diff result:
    - `changed = false`
- Next:
  - decide whether to broaden diff beyond:
    - modes
    - toggles
    - menu items
    - upload candidates
  - otherwise return to Gemini provider backlog

## 2026-04-06 - Gemini conversation context now captures generated music/video artifacts, while Canvas remains unsupported

- Focus:
  - extend Gemini chat read parity beyond generated images without inventing a
    fake canvas/doc artifact model
- Progress:
  - probed three real Gemini chat surfaces on the active managed `default`
    pairing:
    - music chat `8e8e58b57ae544ea`
    - video chat `23340d1698de29b8`
    - canvas probe chat `c653ec3c84410829`
  - confirmed that both music and video responses materialize as assistant-turn
    `video` elements with nearby share/download controls inside
    `model-response`
  - extended `src/browser/providers/geminiAdapter.ts` so
    `readConversationContext(...)` now normalizes those assistant-turn media
    nodes into first-class `artifacts[]` with:
    - `kind = generated`
    - stable `uri`
    - `mediaType = music|video`
    - `fileName`
    - share/download/play/mute labels
  - added exported Gemini artifact-normalization helpers and focused coverage in
    `tests/browser/geminiAdapter.test.ts`
- Verification:
  - `pnpm vitest run tests/browser/geminiAdapter.test.ts tests/browser/llmServiceContext.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - live:
    - `pnpm tsx bin/auracall.ts conversations context get 8e8e58b57ae544ea --target gemini --profile default --json-only`
    - `pnpm tsx bin/auracall.ts conversations context get 23340d1698de29b8 --target gemini --profile default --json-only`
    - `pnpm tsx bin/auracall.ts conversations context get c653ec3c84410829 --target gemini --profile default --json-only`
- Notes:
  - current honest boundary:
    - Gemini `Canvas` selection is real
    - but the current live probe still rendered only ordinary assistant text on
      the `/app/<id>` page and no first-class canvas/doc artifact surface
  - next Gemini artifact work should therefore be:
    - canvas/doc artifact parity if a real surface appears
    - otherwise broader non-image artifact coverage beyond the now-proven
      image/music/video surfaces

## 2026-04-06 - Gemini Canvas artifacts are now live on the standard conversation route

- Focus:
  - turn the newly proven Gemini Canvas editor surface into a first-class
    `conversations context get` artifact instead of leaving it as a manual DOM
    curiosity
- Progress:
  - followed shared Gemini page `https://g.co/gemini/share/3ed147d51ed4`
    through `Try Gemini Canvas`
  - confirmed the dedicated `/canvas` route exposes a real document/editor
    surface with:
    - `div.ProseMirror[aria-label="Canvas editor"]`
    - `button[aria-label="Share and export canvas"]`
    - `button[data-test-id="print-button"]`
    - `button[data-test-id="canvas-create-task-menu"]`
  - proved the same document can reopen on the normal `/app/<conversationId>`
    route for conversation `59b6f9ac9e510adc`
  - extended `src/browser/providers/geminiAdapter.ts` so Gemini context reads:
    - wait for canvas-specific hydration when a canvas chip is present
    - normalize the visible immersive panel into a `kind = canvas` artifact
      with:
      - `uri = gemini://canvas/<conversationId>`
      - `metadata.contentText`
      - `metadata.createdAt`
      - share/print/create capability flags
- Verification:
  - `pnpm vitest run tests/browser/geminiAdapter.test.ts tests/browser/llmServiceContext.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - live:
    - `pnpm tsx bin/auracall.ts conversations context get 59b6f9ac9e510adc --target gemini --profile default --refresh --json-only`
- Notes:
  - earlier chat `c653ec3c84410829` still matters as a negative control:
    merely selecting the Canvas tool does not guarantee a durable canvas
    artifact on every Gemini conversation
  - current Gemini artifact baseline is now:
    - image
    - music
    - video
    - canvas

## 2026-04-06 - Gemini artifact materialization is now live for the proven conversation artifacts

- Focus:
  - move Gemini from artifact discovery only to real `conversations artifacts fetch`
    parity on the currently proven surfaces
- Progress:
  - added Gemini `materializeConversationArtifact(...)` support in
    `src/browser/providers/geminiAdapter.ts`
  - widened the CLI gate in `bin/auracall.ts` so:
    - `auracall conversations artifacts fetch --target gemini <id>`
      is actually reachable
  - implemented the first bounded Gemini materializers:
    - `canvas` -> `.txt` from `metadata.contentText`
    - generated music/video -> authenticated browser-context binary fetch
      written as `.mp4`
- Verification:
  - `pnpm vitest run tests/browser/geminiAdapter.test.ts tests/browser/llmServiceContext.test.ts tests/browser/llmServiceFiles.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - live:
    - `pnpm tsx bin/auracall.ts conversations artifacts fetch 59b6f9ac9e510adc --target gemini --profile default`
      - `materializedCount = 1`
      - `AuraCall Canvas Route Probe.txt`
    - `pnpm tsx bin/auracall.ts conversations artifacts fetch 8e8e58b57ae544ea --target gemini --profile default`
      - `materializedCount = 1`
      - `before_the_tide_returns.mp4`
    - `pnpm tsx bin/auracall.ts conversations artifacts fetch 23340d1698de29b8 --target gemini --profile default`
      - `materializedCount = 1`
      - `video.mp4`
- Notes:
  - this slice is intentionally bounded to the proven Gemini artifact families:
    - canvas
    - music
    - video
  - next Gemini artifact work should target breadth beyond the proven
    image/music/video/canvas surfaces, not re-litigate the now-green fetch path

## 2026-04-06 - Gemini conversation file fetch now has a shared CLI path, but live proof is still bounded by what the chat preview surface exposes

- Focus:
  - add a real `conversations files fetch` seam for Gemini chat uploads instead
    of stopping at list-only metadata
- Progress:
  - added shared `LlmService.materializeConversationFiles(...)` and
    `auracall conversations files fetch <conversationId>`
  - wired Gemini `downloadConversationFile(...)` in
    `src/browser/providers/geminiAdapter.ts`
  - Gemini now tries two bounded fetch paths for chat-uploaded files:
    - direct preview/download URL already exposed on the chat chip
    - text-preview recovery after trusted-clicking the visible file chip
- Verification:
  - `pnpm vitest run tests/browser/geminiAdapter.test.ts tests/browser/llmServiceContext.test.ts tests/browser/llmServiceFiles.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
- Notes:
  - this is intentionally not documented as fully green live parity yet
  - current honest boundary:
    - the shared CLI/service path is real
    - Gemini file fetch is only expected to work when the chat page or preview
      surface actually exposes:
      - a direct fetchable URL
      - or a recoverable text preview
  - the known text-upload smoke conversation is not a clean live fetch proof
    right now because direct `/app/<id>` route open on this account can hit
    Google’s `sorry` interstitial before the preview surface is reached

## 2026-04-07 - Anti-bot detection boundary is provider-green but browser-tools-red

- Focus:
  - clarify whether AuraCall actually detected Gemini anti-bot state during the
    recent `google.com/sorry` chat-file fetch probe
- Progress:
  - confirmed the Gemini provider/service path already does the right thing:
    - `classifyGeminiBlockingState(...)` detects `google.com/sorry` /
      unusual-traffic states
    - `LlmService` persists a Gemini anti-bot cooldown once such an error is
      raised through the guarded path
  - confirmed the remaining gap is outside the provider:
    - raw `browser-tools` navigation/eval and generic doctor output still do
      not classify `google.com/sorry` as a first-class blocking surface
- Notes:
  - added this explicitly to the planning docs so future browser-service work
    does not confuse:
    - missing provider anti-bot handling
    - missing browser-tools / generic doctor anti-bot reporting

## 2026-04-07 - Gemini anti-bot pages are manual-clear only until captcha automation exists

- Focus:
  - make the operator rule explicit in repo instructions and runbooks so Gemini
    debugging does not keep re-triggering blocked sessions
- Progress:
  - updated `AGENTS.md`
  - updated `docs/wsl-gemini-runbook.md`
  - updated `docs/manual-tests.md`
  - updated `docs/gemini.md`
- Notes:
  - the rule is now explicit:
    - if Gemini shows `google.com/sorry`, CAPTCHA, reCAPTCHA, or similar
      human-verification state, stop automated retries
    - require human interaction to clear the page before resuming automation on
      that managed browser profile
    - after clearance, prefer the lowest-churn resume path first

## 2026-04-07 - Gemini uploaded-image chat retrieval is still split between hydrated live tabs and fresh route reads

- Focus:
  - close the Gemini chat-upload parity gap for user-uploaded image chips on
    `/app/ab30a4a92e4b65a9`
- Progress:
  - confirmed the live managed Gemini tab exposes the exact uploaded-image
    surface inside the user turn:
    - `button.preview-image-button.large-preview-image`
    - `img[data-test-id="uploaded-img"]`
  - hardened Gemini tab reuse so `connectToGeminiTab(...)` no longer blindly
    trusts a stale `tabTargetId` or mismatched `tabUrl` for a different
    conversation route
  - hardened Gemini read/fetch paths so they do not forcibly reload an already
    hydrated exact conversation tab before scraping/materializing
  - added a bounded post-read helper for visible uploaded-image buttons to
    avoid relying only on the larger all-in-one context extractor
- Verification:
  - `pnpm vitest run tests/browser/geminiAdapter.test.ts tests/browser/llmServiceFiles.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - live DOM proof on the exact route:
    - `browser-tools search --url-contains ab30a4a92e4b65a9 --class-includes preview-image-button`
    - `browser-tools search --url-contains ab30a4a92e4b65a9 --data-testid uploaded-img`
    - `browser-tools eval --url-contains ab30a4a92e4b65a9 ...`
- Notes:
  - current honest boundary:
    - the live tab definitely contains the uploaded image on the user turn
    - the managed `conversations context get|files list|files fetch` path still
      returns no files for this conversation
  - strongest current hypothesis:
    - Gemini uploaded-image availability differs between:
      - the already-hydrated live tab surface
      - a fresh provider-driven read of the same `/app/<id>` route
    - or the live provider read is failing and `llmService` is serving cached
      context silently because messages already exist

## 2026-04-07 - Gemini upload chips are button-host widgets, and browser-tools should prefer visible route matches

- Focus:
  - stop treating Gemini chat uploads as unrelated leaf selectors and reduce
    browser drift back to `/app`
- Progress:
  - normalized Gemini conversation upload discovery around one shared host
    model:
    - `user-query` button widgets
    - `button.new-file-preview-file` for file-row chips
    - `button.preview-image-button` for uploaded-image chips
    - child metadata / preview nodes are now treated as button content, not as
      the primary host identity
  - widened the Gemini conversation-upload fallback reader to merge both text-
    file and uploaded-image button hosts through one abstraction
  - updated browser-tools tab selection so `--url-contains` prefers a visible
    route match over a focused hidden tab, which better matches the intended
    “stay on this exact conversation” workflow
- Verification:
  - `pnpm vitest run tests/browser/browserTools.test.ts tests/browser/geminiAdapter.test.ts tests/browser/llmServiceFiles.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
- Notes:
  - this reduces drift and makes the DOM model cleaner, but the exact live
    `ab30a4a92e4b65a9` uploaded-image file initially still was not
    materializing through `conversations files fetch`
  - follow-on fix:
    - deduped Gemini uploaded-image rows by physical `remoteUrl` instead of by
      DOM leaf occurrence
    - added a bounded browser-native image materialization fallback:
      - if direct fetch of the `lh3.googleusercontent.com` image URL fails
      - and Gemini already renders the uploaded image inline
      - capture the visible image surface instead of failing the fetch
  - current live state on `ab30a4a92e4b65a9`:
    - `conversations context get`: green
    - `conversations files list`: green
    - `conversations files fetch`: green
    - one normalized uploaded image:
      - `uploaded-image-1`
## 2026-04-07 - Gemini direct chat uploaded-image retrieval green

- Focus:
  - finish the Gemini direct `/app/<id>` uploaded-file retrieval slice without
    further route churn
  - reduce Gemini tab drift because it increases anti-bot risk and hides the
    real chat surface
- Progress:
  - changed Gemini conversation upload handling to treat user-turn upload chips
    as clickable button hosts under `user-query`
  - unified the text-file chip (`button.new-file-preview-file`) and uploaded
    image chip (`button.preview-image-button`) under one shared extraction
    model
  - hardened managed tab selection so browser-tools prefers a visible exact URL
    match over a hidden/focused generic Gemini root tab
  - proved live green on `default` for uploaded-image conversation
    `ab30a4a92e4b65a9`:
    - `conversations context get`
    - `conversations files list`
    - `conversations files fetch`
  - added a browser-native visible-image capture fallback for Gemini uploaded
    images because direct signed image URLs can return HTTP 403 outside the
    live page context
- Durable note:
  - for Gemini direct chat reads, prefer staying on an already-hydrated exact
    `/app/<id>` tab and avoid unnecessary route reloads; otherwise both drift
    and anti-bot risk go up

## 2026-04-07 - Gemini multi-upload chat dedupe repaired

- Focus:
  - verify that a Gemini chat containing both an uploaded image and a second
    uploaded file surfaces all real uploads exactly once
- Progress:
  - live rerun on `ab30a4a92e4b65a9` proved:
    - `conversations context get` returns exactly two files:
      - `uploaded-image-1`
      - `AGENTS.md`
    - `conversations files list` returns the same two files
    - `conversations files fetch` returns:
      - `fileCount = 2`
      - `materializedCount = 2`
  - fixed the duplicate-chip bug by deduping Gemini conversation uploads by
    chip host element during DOM collection and by stable file semantics during
    normalization
- Durable note:
  - Gemini upload chips can expose multiple nested nodes for the same logical
    file. The provider should dedupe by chip host first and semantic file
    identity second, not by raw leaf selector matches.
## 2026-04-07 - Browser-tools now classifies anti-bot pages first-class

- Focus:
  - close the browser-service visibility gap between Gemini provider anti-bot
    handling and generic manual/live probing
- Progress:
  - added a shared browser-tools blocking-state classifier covering:
    - Google `google.com/sorry`
    - CAPTCHA / reCAPTCHA
    - Cloudflare interstitials
    - generic human-verification pages
  - `browser-tools` page-probe/doctor output now carries
    `pageProbe.blockingState`
  - this makes the embedded `auracall doctor` runtime evidence more explicit
    even when the provider-specific path is not the one classifying the page
- Verification:
  - `pnpm vitest run tests/browser/browserTools.test.ts tests/browser/profileDoctor.test.ts tests/browser/geminiAdapter.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
- Notes:
  - this is a visibility/reporting seam, not full captcha automation
  - the next anti-bot step is broader operator behavior built on top of the new
    shared signal

## 2026-04-07 - Doctor/features now stop early on blocking pages and give a manual-resume path

- Focus:
  - turn the new shared browser-tools blocking-state signal into visible
    operator behavior instead of leaving it buried in JSON
- Progress:
  - `auracall doctor --target ...` now:
    - prints the blocking classification in text mode
    - skips extra selector diagnosis when the selected page already requires
      manual clearance
    - exits nonzero in JSON mode when a blocking page is present
  - `auracall features --target ...` now:
    - prints the same blocking/manual-clear guidance in text mode
    - exits nonzero in JSON mode when a blocking page is present
- Verification:
  - `pnpm vitest run tests/browser/browserTools.test.ts tests/browser/profileDoctor.test.ts tests/browser/geminiAdapter.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
- Notes:
  - this still does not automate CAPTCHA clearance
  - the value is that operator flows now stop earlier and more explicitly

## 2026-04-07 - Setup now checks blocking state before verification

- Focus:
  - stop `auracall setup --target ...` from immediately spending a verification
    run on a managed browser profile that is already sitting on a blocking page
- Progress:
  - after login and before verification, setup now collects the shared
    browser-tools runtime report and checks `pageProbe.blockingState`
  - if the selected page requires human clearance, setup now:
    - marks verification failed with the blocking summary
    - prints the manual-clear guidance
    - skips the live verification run
  - final setup doctor output now also embeds browser-tools evidence so the
    resulting setup contract carries the same blocking-page context
- Verification:
  - `pnpm vitest run tests/cli/browserSetup.test.ts tests/browser/profileDoctor.test.ts tests/browser/browserTools.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`

## 2026-04-07 - Browser-tools probe/doctor now fail fast on manual-clear blocking pages too

- Focus:
  - make the package-owned browser-service CLI behave like the higher AuraCall
    surfaces once a blocking page is already known
- Progress:
  - `browser-tools probe` now exits nonzero when
    `pageProbe.blockingState.requiresHuman` is true
  - `browser-tools doctor` now does the same
  - added a focused helper/test lock so this stays explicit in the package
    contract rather than depending on ad hoc CLI behavior
- Verification:
  - `pnpm vitest run tests/browser/browserTools.test.ts tests/browser/profileDoctor.test.ts tests/cli/browserSetup.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`

## 2026-04-07 - Features snapshot/diff and login now respect blocking pages too

- Focus:
  - close the remaining obvious CLI anti-bot inconsistencies after
    doctor/features/setup/browser-tools had already adopted the shared
    blocking-state seam
- Progress:
  - `auracall features snapshot --target ...` now stops early on manual-clear
    blocking pages instead of writing misleading feature snapshots
  - `auracall features diff --target ...` now does the same instead of
    comparing against a blocked live surface
  - `auracall login --target ...` now runs one shared post-launch runtime probe
    and exits nonzero with the same manual-clear guidance if the managed
    browser lands on a blocking page
- Verification:
  - `pnpm vitest run tests/browser/browserTools.test.ts tests/browser/profileDoctor.test.ts tests/cli/browserSetup.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
- Notes:
  - the remaining intended propagation target is shared browser execution
    itself, not more command-local anti-bot glue

## 2026-04-07 - Shared browser execution now preflights manual-clear blocking pages

- Focus:
  - stop the main browser-run path from pushing deeper into automation when the
    active page is already obviously blocked and requires human clearance
- Progress:
  - added one shared browser-runtime probe that classifies manual-clear
    blocking pages from live page URL/title/body text
  - local and remote ChatGPT/Grok browser runs now check that probe right after
    navigation settles and before login/prompt work ramps up
  - on headful local runs, those manual-clear blocking pages now preserve the
    browser session the same way Cloudflare already did
- Verification:
  - `pnpm vitest run tests/browser/browserModeExports.test.ts tests/browser/browserTools.test.ts tests/browser/profileDoctor.test.ts tests/cli/browserSetup.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
- Notes:
  - this is still not captcha automation
  - the value is earlier stop behavior with less page churn and a clearer
    manual-resume path

## 2026-04-07 - Roadmap/docs now match the real Gemini and anti-bot baseline

- Focus:
  - stop the planning docs from lagging behind the now-green code paths
- Progress:
  - refreshed the active roadmap docs to reflect that these are already real:
    - shared anti-bot propagation across main operator/browser-run surfaces
    - first-class Gemini feature discovery plus snapshot/diff
    - Gemini conversation context/files/artifact parity for the proven
      surfaces
  - reframed the Gemini provider backlog around the actual next gap:
    - account-level files parity
- Notes:
  - the next roadmap item should no longer be generic Gemini feature discovery
    or broad anti-bot propagation
  - the next honest provider-parity target is Gemini account-level files

## 2026-04-07 - User docs now match the real Gemini/browser operator surface

- Focus:
  - close the remaining user-facing doc drift after the roadmap refresh
- Progress:
  - updated user docs so they now explicitly reflect:
    - first-class Gemini feature discovery plus snapshot/diff
    - blocking-page stop behavior across doctor/features/setup/login/browser
      runs
    - Gemini account-level files as still unsupported
  - touched:
    - `README.md`
    - `docs/gemini.md`
    - `docs/browser-mode.md`
    - `docs/manual-tests.md`
- Notes:
  - this slice is documentation-only
  - the code baseline did not change

## 2026-04-07 - Browser-service package now has its own README

- Focus:
  - make the package boundary legible on its own before future independent
    launch work
- Progress:
  - added [`packages/browser-service/README.md`](/home/ecochran76/workspace.local/oracle/packages/browser-service/README.md)
  - the new package README now documents:
    - purpose
    - stable vs provisional exports
    - package-owned browser-tools surface
    - current anti-bot boundary
    - host-app non-goals
- Notes:
  - this is documentation-only
  - the package is still private today, but the README now matches the
    intended extraction boundary
## 2026-04-07 - Gemini Deep Research document artifact parity

- Added first-class Gemini `document` artifacts for Deep Research immersive
  panels on direct `/app/<id>` chat reads.
- `auracall conversations context get --target gemini 06ebd4699b387019 --profile default --refresh --json-only`
  now returns:
  - `kind: "document"`
  - `uri: "gemini://document/06ebd4699b387019"`
- `auracall conversations artifacts fetch --target gemini 06ebd4699b387019 --profile default --verbose`
  now materializes:
  - `Researching FreshRoof Soy Technology Claims.txt`
- Added shared artifact-kind support for `document` in the provider domain and
  `LlmService` normalization so the new Gemini surface persists through the
  standard cache/fetch contract.
- Current honest boundary:
  - the intended fetch path is the live `Share & Export -> Copy contents`
    surface on the Deep Research immersive panel
  - however, on the current live page that export menu item is still not
    reliably reachable through automation, so materialization falls back to the
    visible immersive-panel document text when copy capture does not succeed
- Verification:
  - `pnpm vitest run tests/browser/geminiAdapter.test.ts tests/browser/llmServiceContext.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`

## 2026-04-07 - Gemini My stuff should stay out of account-files semantics

- Focus:
  - correct the semantic mistake of treating Gemini `My stuff` as account-file
    parity
- Progress:
  - removed the local Gemini `account-files list` wiring before commit
  - kept the product boundary explicit:
    - Gemini `My stuff` is a link aggregator for conversation-scoped
      documents/media
    - it is not the Gemini equivalent of Grok `/files`
- Notes:
  - the live page still proves useful discovery value for future artifact/library
    work
  - it should not back `account-files` commands

## 2026-04-07 - Gemini artifact lane closed for now

- Focus:
  - mark the Gemini conversation-artifact lane complete at the currently
    proven surfaces
- Progress:
  - updated roadmap and user docs to treat Gemini artifact support as closed
    for now at:
    - image
    - music
    - video
    - canvas
    - Deep Research document
- Notes:
  - remaining Gemini work is now narrower:
    - account-level files only if Gemini exposes a real native CRUD surface
    - broader conversation files/artifacts only when the live DOM proves a new
      stable surface

## 2026-04-07 - Planned the next service/runtime track

- Focus:
  - turn the broad “service mode / runners / orchestration” direction into one
    bounded next implementation plan
- Progress:
  - added
    [service-runtime-execution-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/service-runtime-execution-plan.md)
  - anchored the next track around:
    - one durable execution vocabulary
    - sequential-first dispatch
    - lease/runner ownership
    - one shared execution core for CLI, API, and MCP
  - linked the active roadmap to that plan from
    [next-execution-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/next-execution-plan.md)
- Notes:
  - the repo already has useful planning/data seams in `src/teams/*`
  - the next goal is not broad service mode delivery; it is preventing future
    API/MCP/team execution drift before it starts

## 2026-04-07 - Slice 1 runtime execution vocabulary is live

- Focus:
  - land the first code seam from the service/runtime plan without adding real
    dispatcher or runner behavior
- Progress:
  - added `src/runtime/` with:
    - `types.ts`
    - `schema.ts`
    - `model.ts`
  - defined one shared execution-record vocabulary for:
    - `run`
    - `runStep`
    - `runEvent`
    - `runLease`
    - `sharedState`
  - added deterministic projection from the existing
    `teamRun + steps + sharedState` bundle into one runtime execution-record
    bundle
  - added focused regression coverage in:
    - `tests/runtime.types.test.ts`
    - `tests/runtime.schema.test.ts`
    - `tests/runtime.model.test.ts`
- Verification:
  - `pnpm vitest run tests/runtime.types.test.ts tests/runtime.schema.test.ts tests/runtime.model.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
- Notes:
  - this slice intentionally stops at vocabulary + projection
  - there is still no real dispatcher, lease ownership, or persistence layer

## 2026-04-07 - Planned the compatibility-first HTTP API shape

- Focus:
  - define the future API shape with OpenAI compatibility as the default
    contract
- Progress:
  - added
    [api-compatibility-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/api-compatibility-plan.md)
  - set the default API policy to:
    - standard `/v1/models`
    - standard `/v1/responses`
    - standard `/v1/chat/completions` as a compatibility adapter
    - standard image routes where they map cleanly
  - kept AuraCall-specific extensions bounded:
    - prefer optional `X-AuraCall-*` headers for runtime/agent/team hints
    - allow optional top-level `auracall` body object only for tolerant
      first-party clients
    - reserve `/auracall/...` for operational/admin surfaces that should not be
      forced into OpenAI compatibility
- Notes:
  - the next API-facing implementation anchor should be a route-neutral
    runtime-backed `responses` contract, not a bespoke AuraCall-only HTTP shape

## 2026-04-07 - Route-neutral runtime API contract is live

- Focus:
  - land the first code seam for a runtime-backed `responses` surface without
    adding real HTTP handlers
- Progress:
  - added runtime API vocabulary in:
    - `src/runtime/apiTypes.ts`
    - `src/runtime/apiSchema.ts`
    - `src/runtime/apiModel.ts`
  - defined one route-neutral execution request/response contract with:
    - optional AuraCall hints
    - compatibility-first response shape
    - ordered mixed output items
  - made mixed text + artifact responses explicit:
    - assistant text remains `message` output
    - durable non-text outputs are sibling `artifact` items in the same
      `output[]` timeline
  - added focused regression coverage in:
    - `tests/runtime.api.test.ts`
- Verification:
  - `pnpm vitest run tests/runtime.types.test.ts tests/runtime.schema.test.ts tests/runtime.model.test.ts tests/runtime.api.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
- Notes:
  - this slice still stops before HTTP route handlers
  - the next API-facing move should be an adapter from these runtime API types
    onto `POST /v1/responses`

## 2026-04-08 - Bounded HTTP responses adapter is live

- Focus:
  - add the first real external-adapter module while keeping the runtime stop
    line intact
- Progress:
  - added `src/http/responsesServer.ts`
  - implemented bounded HTTP routes for:
    - `POST /v1/responses`
    - `GET /v1/responses/{response_id}`
    - `GET /v1/models`
  - kept the adapter pointed at the runtime control seam instead of direct file
    access
  - mapped `response_id` directly onto the persisted runtime run id for this
    first slice
  - preserved ordered mixed output when runtime shared state exposes
    `structuredOutputs` keyed as `response.output`
  - added focused regression coverage in:
    - `tests/http.responsesServer.test.ts`
- Verification:
  - `pnpm vitest run tests/http.responsesServer.test.ts tests/runtime.control.test.ts tests/runtime.api.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
- Notes:
  - this is still a bounded internal module, not a public server command yet
  - there is still no runner/execution loop, streaming, auth, or
    `chat/completions` adapter

## 2026-04-08 - Local dev-only responses server exposure is live

- Focus:
  - expose the bounded `responses` adapter without widening protocol breadth
- Progress:
  - added `auracall api serve`
  - wired it to the bounded local HTTP server in
    `src/http/responsesServer.ts`
  - kept the exposure narrow:
    - `GET /status`
    - `GET /v1/models`
    - `POST /v1/responses`
    - `GET /v1/responses/{id}`
  - updated user-facing docs in:
    - `README.md`
    - `docs/openai-endpoints.md`
- Notes:
  - this is still local dev-only
  - there is still no auth, streaming, service-host integration, or
    `chat/completions` adapter

## 2026-04-08 - Responses adapter now honors bounded X-AuraCall headers

- Focus:
  - improve compatibility-preserving execution hints without widening route
    scope
- Progress:
  - `POST /v1/responses` now accepts:
    - `X-AuraCall-Runtime-Profile`
    - `X-AuraCall-Agent`
    - `X-AuraCall-Team`
    - `X-AuraCall-Service`
  - header hints merge into the existing optional body `auracall` object
  - headers take precedence when both are present
  - added focused coverage in:
    - `tests/http.responsesServer.test.ts`
- Verification:
  - `pnpm vitest run tests/http.responsesServer.test.ts tests/runtime.control.test.ts tests/runtime.api.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`

## 2026-04-08 - Responses server host posture is explicit

- Focus:
  - finish the service-host shaping slice without widening protocol breadth
- Progress:
  - `auracall api serve` now defaults to loopback-only posture in practice
  - non-loopback bind now requires explicit `--listen-public`
  - `/status` remains the explicit source of truth for:
    - development mode
    - unauthenticated posture
    - route surface
    - compatibility limits
  - added focused regression coverage for:
    - status payload
    - non-loopback bind refusal without explicit opt-in
- Verification:
  - `pnpm vitest run tests/http.responsesServer.test.ts tests/runtime.control.test.ts tests/runtime.api.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`

## 2026-04-08 - Local responses host posture is explicit

- Focus:
  - improve host lifecycle clarity without widening protocol breadth
- Progress:
  - `GET /status` now reports explicit development posture, route surface,
    compatibility limits, and execution-hint support
  - `auracall api serve` now warns when `--host` is non-loopback because the
    server remains intentionally unauthenticated
  - updated user-facing docs in:
    - `README.md`
    - `docs/openai-endpoints.md`
- Verification:
  - `pnpm vitest run tests/http.responsesServer.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
## 2026-04-08 - Responses host checkpoint is complete enough to pause

- Focus:
  - close the bounded local `responses` host checkpoint cleanly instead of
    inventing another internal seam by inertia
- Progress:
  - audited the current host/runtime split after the new
    `metadata.executionSummary` readback slice
  - confirmed the present separation is already the right one:
    - `responsesService.ts` owns direct-run creation, bounded local execution,
      and stored-response mapping
    - `responsesServer.ts` stays responsible for HTTP-native concerns such as
      parsing, status/models routes, bind posture, and error translation
  - removed a stray internal `X-AuraCall-Transport` header parse path from
    `responsesServer.ts` so the accepted header contract now matches `/status`,
    docs, and tests exactly:
    - `X-AuraCall-Runtime-Profile`
    - `X-AuraCall-Agent`
    - `X-AuraCall-Team`
    - `X-AuraCall-Service`
- Verification:
  - `pnpm vitest run tests/runtime.api.test.ts tests/runtime.responsesService.test.ts tests/http.responsesServer.test.ts tests/runtime.runner.test.ts tests/runtime.control.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
- Issues:
  - no blocking host/runtime defect remains in this bounded slice
  - the remaining work is broader service-host / runner orchestration, which
    should stay a distinct next lane rather than more adapter micro-refactors
## 2026-04-08 - Service-host / runner orchestration is the next lane

- Focus:
  - reset the runtime/API roadmap after the bounded local runner pass landed
- Progress:
  - audited the current runtime and host seams:
    - `responsesServer.ts`
    - `responsesService.ts`
    - `runner.ts`
    - `control.ts`
  - confirmed the current host is coherent enough to pause:
    - direct runs now execute through one bounded local sequential pass
    - terminal readback now carries bounded execution summary metadata
    - the remaining gap is not more adapter splitting; it is broader
      local service-host ownership of execution and recovery
  - added:
    - `docs/dev/runtime-service-host-plan.md`
  - updated the active plans so they no longer describe the runtime host as
    pre-runner
- Issues:
  - the current direct-run path is still request-scoped
  - restart recovery, stale-lease reclaim, and broader local drain ownership
    are still deferred into the new service-host lane
## 2026-04-08 - First bounded service-host seam is in

- Focus:
  - start the broader service-host / runner lane without widening transport
    breadth
- Progress:
  - added `src/runtime/serviceHost.ts` as the first local host-owned execution
    seam
  - the new seam now owns:
    - deterministic candidate selection
    - stale-lease expiry before reclaim
    - sequential bounded drain-once execution over persisted runs
    - explicit distinction between:
      - still-busy active-lease runs
      - stranded running-without-lease runs
    - one internal recovery summary over:
      - reclaimable runs
      - busy leased runs
      - stranded runs
      - idle runs
  - `src/runtime/responsesService.ts` now delegates direct-run execution
    through the service-host seam instead of calling the runner directly
  - added focused coverage in:
    - `tests/runtime.serviceHost.test.ts`
- Verification:
  - `pnpm vitest run tests/runtime.serviceHost.test.ts tests/runtime.responsesService.test.ts tests/http.responsesServer.test.ts tests/runtime.runner.test.ts tests/runtime.control.test.ts tests/runtime.api.test.ts`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
- Issues:
  - execution is still triggered from the request path
  - no broader background drain/recovery loop exists yet

## 2026-04-08 - Runtime roadmap reset after service-host checkpoint

- Focus:
  - align the top-level roadmap with the service-host work already on `main`
- Progress:
  - confirmed the repo is one slice ahead of the old top-level plan:
    - the bounded local service-host seam is already implemented
    - direct-run execution already delegates through it
  - updated `docs/dev/next-execution-plan.md` so it no longer describes
    adding the first service-host seam as the next coding slice
  - reframed the next decision as a pause line between:
    - broader background drain/restart behavior
    - operator inspection over current recovery state
    - or stopping the lane here until concrete pressure appears
- Issues:
  - the roadmap was slightly behind the code, but the mismatch is now limited
    to planning language rather than product behavior
## 2026-04-09 - Team execution bridge is the next active lane

- Focus:
  - move the active roadmap upward from runtime-host refinement to the first
    team-to-runtime execution bridge
- Progress:
  - audited the existing `src/teams/*` and `src/runtime/*` seams together
  - confirmed the current runtime/service substrate is now strong enough that
    more host micro-polish is lower leverage than the first real team bridge
  - added:
    - `docs/dev/team-runtime-bridge-plan.md`
  - updated the top-level roadmap so the next bounded slice is now:
    - one thin internal bridge from `teamRun` planning to one runtime run
    - sequential first
    - fail-fast
    - no new transport breadth
- Issues:
  - explicit handoff execution semantics remain deferred
  - no operator-facing team execution surface is required in the first bridge
    slice

## 2026-04-09 - Started the first thin team-runtime bridge slice

- Focus:
  - begin the first internal bridge from `src/teams/*` planning onto the
    current runtime/service substrate
- Progress:
  - identified the intended thin bridge shape:
    - `TeamRunServicePlan`
    - `createExecutionRunRecordBundleFromTeamRun(...)`
    - `ExecutionRuntimeControlContract.createRun(...)`
    - `ExecutionServiceHost.drainRunsOnce(...)`
  - started implementation under:
    - `src/teams/runtimeBridge.ts`
  - started focused proof coverage for:
    - sequential success
    - fail-fast first-step failure
    - blocked unresolved team members
- Issues:
  - richer explicit handoff execution remains deferred by design
