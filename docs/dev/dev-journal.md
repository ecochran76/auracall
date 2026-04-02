# Dev Journal

Log ongoing progress, current focus, and problems/solutions. Keep entries brief and ordered newest-first.

## Entry format

- Date:
- Focus:
- Progress:
- Issues:
- Next:

## Entries

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
