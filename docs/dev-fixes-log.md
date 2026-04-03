# Dev Fixes Log

This log captures notable fixes, what broke, why, and how we verified the repair. The goal is to preserve lessons learned and avoid repeating regressions.

## When to update

- After fixing a regression, production bug, or flaky behavior.
- After discovering a confusing failure mode or tricky debugging step.
- After landing a workaround that should be revisited.

## Entry format

- Date:
- Area:
- Symptom:
- Root cause:
- Fix:
- Verification:
- Follow-ups:

## Entries

- Date: 2026-03-31
- Area: Final pure-declarative Grok route cleanup
- Symptom:
  - After the previous Grok route-manifest slices, a few hardcoded Grok conversation URLs still remained inside browser-evaluated scripts in `grokAdapter.ts`.
- Root cause:
  - Those scripts synthesize fallback URLs from `conversation:<id>` row data, so they were easy to miss in earlier regex-based route cutovers.
- Fix:
  - Injected helper-backed Grok conversation URL prefixes into the browser-evaluated scripts in [src/browser/providers/grokAdapter.ts](/home/ecochran76/workspace.local/oracle/src/browser/providers/grokAdapter.ts), removing the last obvious duplicated runtime Grok route literals.
- Verification:
  - `pnpm vitest run tests/browser/grokAdapter.test.ts tests/services/registry.test.ts`
  - `pnpm run check`
- Follow-ups:
  - Stop the route-only Grok manifest slice here. The remaining Grok-specific strings are either manifest defaults or behavior-coupled workflow logic.

- Date: 2026-03-31
- Area: Grok manifest-backed route helper adoption
- Symptom:
  - Even after Grok/Gemini base route data was added to the services manifest, Grok still had many repeated route strings in provider/listing/navigation helpers and fallback launch paths.
- Root cause:
  - The first Grok route-manifest slice only covered central defaults and top-level provider URL builders; several adapter and browser-runtime call sites were still assembling the same routes inline.
- Fix:
  - Added manifest-backed `projectConversations` for Grok and reused Grok route helpers/constants across [src/browser/providers/grokAdapter.ts](/home/ecochran76/workspace.local/oracle/src/browser/providers/grokAdapter.ts), [src/browser/index.ts](/home/ecochran76/workspace.local/oracle/src/browser/index.ts), and [src/browser/llmService/llmService.ts](/home/ecochran76/workspace.local/oracle/src/browser/llmService/llmService.ts).
  - Kept the slice mechanical: only declarative route assembly was changed, not scrape/recovery behavior.
- Verification:
  - `pnpm vitest run tests/browser/grokAdapter.test.ts tests/services/registry.test.ts tests/browser/browserService.test.ts tests/schema/resolver.test.ts`
  - `pnpm run check`
- Follow-ups:
  - The remaining Grok URL literals should only move if they are still pure route construction. Anything mixed with UI workflow/recovery belongs in the later behavior-aware phase.

- Date: 2026-03-31
- Area: Browser-service typed config boundary and manifest-backed Grok/Gemini routes
- Symptom:
  - `pnpm run check` failed in `tests/browser/browserService.test.ts` because `service.getConfig()` was typed as the package-level browser-service config and did not expose Aura-Call's LLM-specific fields like `target`.
  - Grok and Gemini still had duplicated browser route strings outside the manifest boundary, especially in login/default-config and provider URL builders.
- Root cause:
  - The Aura-Call subclass of `BrowserService` inherited the base package `getConfig()` type without re-exposing the richer local `ResolvedBrowserConfig`.
  - The service manifest carried base URLs for Grok/Gemini, but not the central route templates used by Grok provider URL builders and Gemini login/default config.
- Fix:
  - Overrode `getConfig()` in [src/browser/service/browserService.ts](/home/ecochran76/workspace.local/oracle/src/browser/service/browserService.ts) to return Aura-Call's local `ResolvedBrowserConfig`.
  - Added manifest-owned Gemini/Grok route templates and Gemini cookie origins in [configs/auracall.services.json](/home/ecochran76/workspace.local/oracle/configs/auracall.services.json).
  - Cut central callers over to manifest-backed routes in [src/browser/constants.ts](/home/ecochran76/workspace.local/oracle/src/browser/constants.ts), [src/browser/login.ts](/home/ecochran76/workspace.local/oracle/src/browser/login.ts), [src/config.ts](/home/ecochran76/workspace.local/oracle/src/config.ts), [src/browser/providers/grokAdapter.ts](/home/ecochran76/workspace.local/oracle/src/browser/providers/grokAdapter.ts), and [src/browser/providers/index.ts](/home/ecochran76/workspace.local/oracle/src/browser/providers/index.ts).
- Verification:
  - `pnpm vitest run tests/services/registry.test.ts tests/browser/grokAdapter.test.ts tests/browser/browserService.test.ts tests/browser/config.test.ts tests/schema/resolver.test.ts`
  - `pnpm run check`
- Follow-ups:
  - The remaining Grok hardcoded routes inside deeper adapter workflows should move only in similarly bounded declarative slices, not mixed with workflow behavior changes.

- Date: 2026-03-31
- Area: ChatGPT acceptance runner harness timeout configuration
- Symptom:
  - `scripts/chatgpt-acceptance.ts --phase root-base` frequently failed with `spawnSync pnpm ETIMEDOUT`, even after command routing and rename logic updates had passed prior regressions.
- Root cause:
  - Non-mutating auracall/probe calls and long-running mutate commands were hard-pinned to fixed 120s/6m process-timeout behavior, which is too short for some real ChatGPT windows under active rate-limit pacing.
- Fix:
  - Added `commandTimeoutMs` to CLI args (`--command-timeout-ms`) and defaulted it to 180000ms.
  - Wired `runAuracall`, `probeAuracall`, and `runChatgptMutation` to use the configured timeout instead of hardcoded values.
  - Kept the rest of the mutation/backoff logic intact.
- Verification:
  - `pnpm vitest run tests/services/registry.test.ts tests/browser/chatgptAdapter.test.ts tests/browser/chatgptProvider.test.ts tests/browser/chatgptComposerTool.test.ts`
- Follow-ups:
  - Re-run `scripts/chatgpt-acceptance.ts --phase root-base` with a longer `--command-timeout-ms` during a cooler rate-limit window and verify completion through `root-followups`.

- Date: 2026-03-31
- Area: ChatGPT project sources readiness and upload open gate
- Symptom:
  - `auracall ... projects files add <project> --target chatgpt` failed at `chatgpt-open-project-sources` with:
    - `Surface did not become ready: ChatGPT project sources ready for <id>`
    - diagnostics still showed `/g/<id>/project?tab=sources` and tab labels `Chats`, `Sources`, but no file rows.
- Root cause:
  - The sources-ready predicate was brittle: it required stricter tab state than ChatGPT exposes in fresh empty-project states.
- Fix:
  - In `buildProjectSourcesReadyExpression`, broadened the readiness condition to accept valid source-route pages with source tabs/query even when source rows are still empty.
  - In `openProjectSourcesTab`, added a route-only fallback (`buildProjectRouteExpression`) so we proceed when we are on the correct routed project even if the stricter predicate is momentarily false.
  - In `openProjectSourcesUploadDialog`, added an existing-dialog pre-check and replaced the single generic open-surface wait with explicit click attempts plus upload-markers/global-file-input detection.
- Verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
  - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts projects files add g-p-69cbf9f685c08191b57b5a74253a1b53 --target chatgpt --file /tmp/chatgpt-source-smoke.txt --verbose --browser-keep-browser`
- Follow-ups:
  - add one negative/empty-project fixture assertion for upload pre-check (existing vs. opened dialog path) in unit coverage and decide whether to keep the route-only fallback long-term.

- Date: 2026-03-31
- Area: ChatGPT project rename/side-panel smoke stability
- Symptom:
  - Live smoke for project create->refresh->rename still fails at rename with `ChatGPT project surface did not hydrate for <id>` after the earlier create modal and service-target fixes.
- Root cause:
  - `openProjectSettingsPanel(...)` still depends on the existing `buildProjectSurfaceReadyExpression(...)` predicate before opening settings; that predicate can reject a routed project page when control labels/tabs are not yet hydrated or are in an unexpected state.
- Fix:
  - Logged and isolated the failure in project-flow smoke; no functional changes in this pass.
- Verification:
  - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx scripts/chatgpt-acceptance.ts`
- Follow-ups:
  - adjust project-surface readiness in `openProjectSettingsPanel(...)` to avoid early hard-fail when route is valid but control surface is temporarily inert, then rerun smoke end-to-end.

- Date: 2026-03-31
- Area: Cross-profile ChatGPT tab selection and stale create-project modal cleanup
- Symptom:
  - Running two Aura-Call Chrome windows at once exposed two regressions:
    - ChatGPT tab resolution could inherit a prior `services` list and appear to “remember” another provider in the same profile.
    - A stale “Create project” dialog could remain open in one tab, blocking subsequent smoke runs in that window.
- Root cause:
  - `resolveServiceTarget(...)` merged each resolved service into the stored instance metadata on every scan.
  - The ChatGPT connect path did not perform a dedicated startup cleanup for project dialog artifacts before method-specific actions.
- Fix:
  - In `src/browser/service/browserService.ts`, removed service-list mutation during scan and left `services` untouched unless a new instance is first registered.
  - In `src/browser/providers/chatgptAdapter.ts`, added `dismissCreateProjectDialogIfOpen(...)` and invoked it right after Chrome connect so a stale modal is dismissed via close/escape before continuing.
- Verification:
  - `pnpm vitest run tests/browser/browserService.test.ts --maxWorkers 1`
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
- Follow-ups:
  - run a guarded live ChatGPT smoke on the secondary WSL-Chrome profile after account setup to confirm the stale modal no longer blocks automation.

- Date: 2026-03-31
- Area: Grok file management diagnostics
- Symptom:
  - Grok file-management failures on account and project flows returned generic errors without scoped UI evidence, especially for row actions and save/delete modals.
- Root cause:
  - Several high-variance Grok file flows were still executed without package-level diagnostic context, so diagnostics snapshots did not include the relevant modal/tab roots or candidate action surfaces at failure.
- Fix:
  - wrapped Grok `listAccountFiles`, `uploadAccountFiles`, and `deleteAccountFile` in `withUiDiagnostics(...)` with account-file scoped roots/candidates/buttons.
  - wrapped Grok `listProjectFiles`, `uploadProjectFiles`, and `deleteProjectFile` in `withUiDiagnostics(...)` with project-sources/personal-files modal roots, row selectors, and button candidates.
  - kept behavior and waits unchanged so this is a strict diagnostics adoption slice.
- Verification:
  - `pnpm vitest run tests/browser/grokAdapter.test.ts tests/browser-service/ui.test.ts --maxWorkers 1`
- Follow-ups:
  - rerun guarded Grok live file flows when profile session is available.
  - resolve unrelated `ResolvedBrowserConfig.target` typecheck error in `tests/browser/browserService.test.ts` that currently blocks a full `pnpm run check`.

- Date: 2026-03-31
- Area: ChatGPT root rename persistence hardening
- Symptom:
  - rename verification sometimes passed before the renamed conversation became the top row in the root sidebar list, which matched early reports of inconsistent “rename appears to succeed then reverts” timing.
- Root cause:
  - the success predicate accepted any matching row in the visible list, so stale row snapshots or an unchanged top row could satisfy the check before the UI had completed reordering.
- Fix:
  - tightened `buildConversationTitleAppliedExpression(...)` with a `requireTopInRootList` option used by rename verification to require the expected conversation to be top when a root list surface is visible;
  - added progressive spacing in `waitForChatgptConversationTitleApplied(...)` (jittered short settle before first poll, and a longer pause before list-refresh verification) to align with observed ChatGPT write pacing.
  - added `requireTopForRootMatch` support in `matchesChatgptConversationTitleProbe(...)` and tests for strict root-top behavior.
- Verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts`
- Follow-ups:
  - rerun the guarded live root rename slice and confirm the stricter top-of-list check is sufficient under low-cooldown conditions.

- Date: 2026-03-31
- Area: WSL profile-family naming for multiple ChatGPT accounts
- Symptom:
  - Profile naming for the planned second WSL ChatGPT account was still ambiguous in onboarding docs, while runtime changes and tests had moved toward a `wsl-chrome-2` secondary profile name.
- Root cause:
  - Documentation examples and logs still mixed older naming conventions, so operators saw conflicting signals about whether secondary accounts should reuse the primary `default` profile or use a distinct managed profile namespace.
- Fix:
  - documented `default` as the primary WSL profile family and `wsl-chrome-2` as the explicit secondary family in `docs/configuration.md` and `docs/wsl-chatgpt-runbook.md`;
  - kept runtime behavior unchanged and aligned existing tests to pass with the `wsl-chrome-2` family name where applicable.
- Verification:
  - `pnpm vitest run tests/schema/resolver.test.ts tests/cli/browserWizard.test.ts --maxWorkers 1`
- Follow-ups:
  - no functional follow-up needed until the new Pro account is logged in; then validate live `--profile wsl-chrome-2 setup/login` for the full path.

- Date: 2026-03-31
- Area: ChatGPT rate-limit retry timing + rename retry cluster sequencing
- Symptom:
  - Live and simulated rate-limit paths were still too rigid: retry delays were not clearly separated between hard rate-limit throttles and generic retryable errors, and row-tagging for rename remained one-shot across a narrow path.
- Root cause:
  - `withRetry(...)` used a fixed short delay after failures and the rename flow had only a coarse single attempt shape.
- Fix:
  - Fixed `LlmService` retry delay policy to be attempt-aware and provider-aware:
    - long, jittered clusters for detected ChatGPT rate-limit messages,
    - shorter jittered delays for other retryable errors.
  - Fixed `isRetryableError` to include ChatGPT rate-limit matching and used provider guard-aware backoff decisions in `getRetryDelayMs`.
  - Updated ChatGPT rename tagging to cluster attempts:
    - conversation-row first,
    - two list-open fallbacks,
    - list refresh attempt with a longer pause,
    while preserving failure evidence in `tagFailures`.
- Verification:
  - `pnpm vitest run tests/browser/llmServiceRateLimit.test.ts`
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts`
  - `pnpm run check`
- Follow-ups:
  - Keep the guarded live root-conversation rename path in the browser with these timings and collect the next failure signature if any; adjust only if a deterministic live failure proves the current retry cluster still misses the active surface.

- Date: 2026-03-30
- Area: ChatGPT conversation rename diagnostics
- Symptom:
  - repeated `ChatGPT conversation row not found` failures in the rename path still lacked actionable details from the row-tagging stage, and diagnostic dumps were not stable enough to distinguish "no matching candidates" from fallback-path behavior.
- Root cause:
  - `tagChatgptConversationRow(...)` produced inconsistent payload shapes in failure/success paths: duplicate `candidateCount` fields, hardcoded `fallbackUsed`, and a brittle `bestCandidate` merge that did not preserve a normalized candidate summary.
- Fix:
  - normalized row-tag diagnostics in `src/browser/providers/chatgptAdapter.ts`:
    - removed duplicate fields from the failure payload,
    - propagated real `fallbackUsed` state,
    - stabilized `bestCandidate` shape for success and failure summaries,
    - surfaced scoped candidate count in structured summaries,
    - preserved structured recovery info via `tagFailures` so `renameConversation` can include retry context in `withUiDiagnostics`.
- Verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts tests/browser/chatgptProvider.test.ts`
- Follow-ups:
  - rerun live `ChatGPT root-base` acceptance after this cleanup with verbose diagnostics capture to confirm the row-tag failure reason is now decisive when the stall remains.

- Date: 2026-03-30
- Area: ChatGPT root conversation rename live debugging
- Symptom:
  - focused unit coverage stayed green, but live `scripts/chatgpt-acceptance.ts --phase root-base` kept failing at root-conversation rename with `ChatGPT conversation row action surface unavailable`.
  - the earlier header-menu fallback turned out to be invalid for rename because the header menu exposes `Share`, `View files in chat`, `Move to project`, `Pin chat`, `Archive`, and `Delete`, but not `Rename`.
  - later live failures still reported the row-action surface as unavailable even when the settled conversation page visibly showed multiple `Open conversation options for ChatGPT Accept Base` buttons for the current conversation.
- Root cause:
  - root rename mixed several overlapping issues: the old title-persistence predicate was too strict; the header menu was the wrong surface for rename; and the live page can auto-title the conversation before the row-action path completes. The remaining blocker is not button discovery in the settled DOM; a direct Puppeteer/js_repl probe showed the page had five matching row-action buttons for the current conversation title and a valid `LI.list-none` row candidate. The unresolved gap is earlier in the provider path: the live tagger/ready-state sequence still returns `ok: false` before that settled surface is reliably captured.
- Fix:
  - loosened root title verification so a matching root row anywhere in the visible list, or the current root conversation page title, can satisfy rename persistence.
  - removed the ChatGPT header-menu fallback from rename; rename is now row-menu only.
  - changed root rename to start on the conversation page/sidebar instead of the ChatGPT home page, increased row-tagging wait time, relaxed row-action-button ancestry scoring, added an explicit row-action readiness wait, and added a short-circuit for the case where ChatGPT has already auto-titled the conversation to the requested name.
- Verification:
  - repeated focused regressions:
    - `pnpm vitest run tests/browser/chatgptAdapter.test.ts tests/browser/chatgptProvider.test.ts tests/browser/chatgptComposerTool.test.ts tests/browser-service/ui.test.ts tests/cli/browserConfig.test.ts tests/services/registry.test.ts --maxWorkers 1`
    - `pnpm run check`
  - live repros still failing:
    - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx scripts/chatgpt-acceptance.ts --phase root-base --state-file docs/dev/tmp/chatgpt-workflow-state.json`
  - direct DOM probe via js_repl + Puppeteer confirmed the settled page exposes multiple matching row-action buttons and a valid row candidate for the current conversation title.
- Follow-ups:
  - add provider-local diagnostics around `tagChatgptConversationRow(...)` so failures report matching-button count, selected row candidate, and the precise reason `ok: false` was returned instead of only the generic UI snapshot.
  - once the tagger reports the settled DOM state directly, rerun `root-base`; if the auto-title short-circuit is enough, treat rename as already satisfied and proceed to `root-followups`.

- Date: 2026-03-30
- Area: Browser-service action-surface fallback + ChatGPT conversation menu adoption
- Symptom:
  - ChatGPT conversation actions were still split across real surfaces, but the provider had to hand-roll that fallback: try the sidebar row menu when present, then fall back to the conversation header menu. The first live `root-base` rerun exposed the concrete rename failure mode: `ChatGPT conversation row not found` on a root conversation whose sidebar row was absent from the current list surface.
- Root cause:
  - browser-service had good primitives for one trigger (`openMenu(...)`, `openAndSelectMenuItem(...)`) but no package-owned helper for the common `ordered menu triggers + per-attempt setup` pattern, so providers kept reimplementing the same row-menu/header-menu fallback glue.
- Fix:
  - added `openAndSelectMenuItemFromTriggers(...)` to `packages/browser-service/src/service/ui.ts`, with ordered trigger attempts, optional per-attempt setup hooks, inter-attempt menu dismissal, and structured attempt history.
  - added focused coverage in `tests/browser-service/ui.test.ts`.
  - updated `src/browser/providers/chatgptAdapter.ts` so conversation delete and conversation rename now treat `sidebar-row` and `conversation-header` as explicit action surfaces and route the fallback mechanics through the package helper.
- Verification:
  - `pnpm vitest run tests/browser-service/ui.test.ts tests/browser/chatgptAdapter.test.ts tests/browser/chatgptProvider.test.ts tests/browser/chatgptComposerTool.test.ts tests/cli/browserConfig.test.ts tests/services/registry.test.ts --maxWorkers 1`
  - `pnpm run check`
  - live: `pnpm tsx bin/auracall.ts delete 69cb3741-2f58-832f-a6ae-f28779f30741 --target chatgpt --yes --verbose`
  - live: `pnpm tsx bin/auracall.ts delete 69cb35dd-13fc-832f-9d6b-bc0f88125838 --target chatgpt --yes --verbose`
- Follow-ups:
  - this slice proved the delete path and removed the fast-fail missing-row rename case, but root conversation rename still has a separate post-trigger stall during live `root-base`; the next repair should focus on inline-editor discovery / title-persistence verification rather than on more menu-surface fallback glue.

- Date: 2026-03-30
- Area: ChatGPT artifact taxonomy externalization
- Symptom:
  - even after the route/feature/composer/UI/selector manifest cuts, `chatgptAdapter.ts` still hard-coded a second layer of service-specific artifact taxonomy: spreadsheet-vs-download extension rules, content-type-to-extension mappings, extension-to-MIME mappings, default artifact titles, and payload marker strings like `image_asset_pointer` / `table`.
- Root cause:
  - the original ChatGPT pilot treated all artifact logic as out of scope, but a bounded subset of that logic is still declarative taxonomy rather than parsing or download behavior.
- Fix:
  - added an `artifacts` section to the ChatGPT entry in `configs/auracall.services.json`.
  - extended `src/services/registry.ts` with typed helpers for artifact kind extensions, content-type extensions, name-to-MIME mappings, default titles, and payload-marker sets.
  - updated `src/browser/providers/chatgptAdapter.ts` so download kind inference, extension/MIME lookup, default image/spreadsheet/canvas titles, and image/table marker checks resolve from the manifest while leaving payload recursion, merge semantics, and materialization logic in code.
  - expanded `tests/services/registry.test.ts` and `tests/browser/chatgptAdapter.test.ts` with focused taxonomy coverage.
- Verification:
  - `pnpm vitest run tests/services/registry.test.ts tests/browser/chatgptAdapter.test.ts tests/browser/chatgptProvider.test.ts tests/browser/chatgptComposerTool.test.ts tests/cli/browserConfig.test.ts --maxWorkers 1`
  - `pnpm run check`
- Follow-ups:
  - this does not move payload parsing, DOM artifact probing, or binary materialization into config.
  - live browser acceptance was not rerun because the slice only changes declarative artifact taxonomy sources, not route or action ordering.

- Date: 2026-03-30
- Area: ChatGPT static DOM-anchor externalization
- Symptom:
  - after the provider selector-family cut, `chatgptAdapter.ts` still repeated a set of stable ChatGPT DOM anchors such as the project dialog roots, source-row selector, conversation-turn selector, artifact/textdoc selectors, and conversation options/delete-confirm buttons, so small DOM-anchor drift still required adapter edits.
- Root cause:
  - the prior selector slice stopped at `src/browser/providers/chatgpt.ts` and did not yet cover the small set of adapter-local anchors that are still declarative enough to live in config without dragging fallback logic into the manifest.
- Fix:
  - added a `dom` section to the ChatGPT entry in `configs/auracall.services.json`.
  - extended `src/services/registry.ts` with DOM selector and selector-set helpers.
  - updated `src/browser/providers/chatgptAdapter.ts` to resolve selected static anchors from the manifest while keeping traversal order, row-tagging, and recovery logic in code.
  - expanded `tests/services/registry.test.ts` so the new DOM keys are covered.
- Verification:
  - `pnpm vitest run tests/services/registry.test.ts tests/browser/chatgptProvider.test.ts tests/browser/chatgptAdapter.test.ts tests/browser/chatgptComposerTool.test.ts tests/cli/browserConfig.test.ts --maxWorkers 1`
  - `pnpm run check`
- Follow-ups:
  - this still does not move adapter-local fallback strategy or workflow sequencing into config.
  - live browser acceptance was not rerun because the slice only changes static selector sources, not route or action ordering.

- Date: 2026-03-30
- Area: ChatGPT provider selector-family externalization
- Symptom:
  - even after the earlier ChatGPT manifest cuts, the provider-level selector arrays in `src/browser/providers/chatgpt.ts` were still hard-coded, so stable surface drift in the prompt/send/model/menu/copy/file/attachment families still required code edits instead of manifest updates.
- Root cause:
  - the first pilot focused on models/routes/features and later composer/UI text, but stopped short of the static provider selector config even though that layer is declarative data rather than adapter workflow logic.
- Fix:
  - added a `selectors` section to the ChatGPT entry in `configs/auracall.services.json`.
  - extended `src/services/registry.ts` with selector-family resolution.
  - updated `src/browser/providers/chatgpt.ts` to build `CHATGPT_PROVIDER.selectors` from the bundled manifest and to align `loginUrlHints` with the configured compatible-host family.
  - added focused coverage in `tests/services/registry.test.ts` and a new provider-level regression in `tests/browser/chatgptProvider.test.ts`.
- Verification:
  - `pnpm vitest run tests/services/registry.test.ts tests/browser/chatgptProvider.test.ts tests/browser/chatgptAdapter.test.ts tests/browser/chatgptComposerTool.test.ts tests/cli/browserConfig.test.ts --maxWorkers 1`
  - `pnpm run check`
- Follow-ups:
  - this does not move adapter-local selector heuristics or fallback order into config.
  - live browser acceptance was not rerun because the slice only changes provider-level selector sources, not routes or runtime workflow order.

- Date: 2026-03-30
- Area: ChatGPT composer menu/chip heuristic vocabulary externalization
- Symptom:
  - after the first ChatGPT composer taxonomy cut, `chatgptComposerTool.ts` still embedded service-specific heuristic labels for recognizing the `More` submenu, identifying the correct top-level menu family, and ignoring non-tool composer chips like `add files and more` / `thinking`.
- Root cause:
  - the first composer slice stopped at aliases/known labels/file-request labels and left a second tier of declarative menu vocabulary inside the action module even though the mechanics of scoring and traversal were already separate.
- Fix:
  - added `moreLabels`, top-menu signal labels/substrings, and chip-ignore tokens to the ChatGPT `composer` section in `configs/auracall.services.json`.
  - extended `src/services/registry.ts` with helpers for those composer arrays.
  - updated `src/browser/actions/chatgptComposerTool.ts` so top-menu scoring, More-submenu selection, and chip filtering consume manifest-backed vocabulary while keeping weights and workflow ordering in code.
- Verification:
  - `pnpm vitest run tests/services/registry.test.ts tests/browser/chatgptComposerTool.test.ts tests/browser/chatgptAdapter.test.ts tests/cli/browserConfig.test.ts --maxWorkers 1`
  - `pnpm run check`
- Follow-ups:
  - the scoring weights and fallback order still belong in code unless another service proves they should become reusable policy.

- Date: 2026-03-30
- Area: ChatGPT project/conversation UI label externalization
- Symptom:
  - after the initial models/routes/features/composer cuts, `chatgptAdapter.ts` still embedded a tail of low-risk ChatGPT UI strings for project settings, memory modes, sources upload markers, row-menu items, and delete confirmations, so simple label drift would still look like adapter code churn.
- Root cause:
  - the first volatility slices stopped before the remaining declarative UI label dictionaries were extracted, even though those strings were configuration-like data rather than workflow logic.
- Fix:
  - added a `ui` section to `configs/auracall.services.json` for ChatGPT labels and label sets.
  - extended `src/services/registry.ts` with bundled UI label/label-set helpers.
  - updated `src/browser/providers/chatgptAdapter.ts` to resolve project settings labels, project field labels, the project-title edit prefix, source-actions labels, the conversation prompt label, the sidebar row-action prefix, memory labels, sources upload markers, conversation rename/delete labels, project-source remove, and project delete confirmation text from the bundled manifest while keeping selectors and workflows in code.
  - added focused coverage in `tests/services/registry.test.ts`.
- Verification:
  - `pnpm vitest run tests/services/registry.test.ts tests/browser/chatgptAdapter.test.ts tests/browser/chatgptComposerTool.test.ts tests/cli/browserConfig.test.ts --maxWorkers 1`
  - `pnpm run check`
- Follow-ups:
  - this still does not move adapter-local selector families or action ordering into config.
  - live browser acceptance was not rerun for this UI-label-only slice because the covered behavior stayed under the existing adapter tests.

- Date: 2026-03-30
- Area: ChatGPT composer/add-on taxonomy
- Symptom:
  - ChatGPT composer tool aliases and menu label knowledge were still embedded in `chatgptComposerTool.ts`, so every add-on rename or app-label drift still looked like a code patch.
- Root cause:
  - the first service-volatility pilot stopped at models/routes/features, leaving the composer taxonomy in code even though it is declarative service data rather than workflow logic.
- Fix:
  - added a `composer` section to `configs/auracall.services.json` for aliases, known labels, top-level sentinels, and file-request labels.
  - extended `src/services/registry.ts` with helpers for reading that composer data from the bundled manifest.
  - updated `src/browser/actions/chatgptComposerTool.ts` to consume those manifest-backed dictionaries while keeping the actual menu traversal and verification logic in code.
- Verification:
  - `pnpm vitest run tests/services/registry.test.ts tests/browser/chatgptComposerTool.test.ts tests/cli/browserConfig.test.ts tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
  - `pnpm run check`
- Follow-ups:
  - this still does not externalize selector families or action ordering; those should only move if a later service-specific plan shows they are truly declarative.

- Date: 2026-03-30
- Area: Service registry / ChatGPT volatility pilot
- Symptom:
  - low-risk ChatGPT volatility such as browser picker labels, compatible hosts, route templates, and feature/app probe tokens was still embedded in TypeScript constants, so service drift still required code edits.
  - the checked-in service manifest still used the old `configs/oracle.services.json` name even though Aura-Call is the current product surface.
- Root cause:
  - the original service registry only covered Grok browser labels and only exposed async loading for the writable `~/.auracall/services.json` copy, which left synchronous browser constants and route helpers without a clean manifest path.
- Fix:
  - renamed the checked-in manifest to `configs/auracall.services.json` and updated the registry loader.
  - extended `src/services/registry.ts` with typed routes/features sections plus synchronous bundled-manifest helpers for model labels, base URLs, compatible hosts, cookie origins, route templates, and feature/app token dictionaries.
  - moved the narrow ChatGPT pilot surface onto that manifest in `src/cli/browserConfig.ts`, `src/browser/constants.ts`, `src/browser/urlFamilies.ts`, `src/browser/service/browserService.ts`, `src/browser/providers/chatgptAdapter.ts`, and `src/browser/providers/index.ts`, while keeping workflow selectors and mutation logic in code.
- Verification:
  - `pnpm vitest run tests/services/registry.test.ts tests/cli/browserConfig.test.ts tests/browser/chatgptAdapter.test.ts tests/browser/browserService.test.ts tests/browser/providerCache.test.ts tests/browser/llmServiceIdentity.test.ts tests/browser/grokModelMenu.test.ts tests/browser/chatgptComposerTool.test.ts tests/schema/resolver.test.ts --maxWorkers 1`
  - `pnpm run check`
  - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx scripts/chatgpt-acceptance.ts --phase project --state-file docs/dev/tmp/chatgpt-volatility-state.json`
  - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx scripts/chatgpt-acceptance.ts --phase root-base --resume docs/dev/tmp/chatgpt-volatility-state.json`
  - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx scripts/chatgpt-acceptance.ts --phase cleanup --resume docs/dev/tmp/chatgpt-volatility-state.json`
- Follow-ups:
  - selectors, artifacts, and rate-limit policy remain intentionally out of scope for this first manifest cut.
  - the live run confirmed the delete path can still encounter a real ChatGPT cooldown mid-phase; keep the guard-first pattern in place for later acceptance slices rather than optimizing for minimum elapsed time.

- Date: 2026-03-30
- Area: Model resolution / ChatGPT provider cache drift
- Symptom:
  - generic Pro selection paths were still hard-coding `gpt-5.2-pro` in several resolver/browser defaults even though that concrete version is time-sensitive and should not be Aura-Call's main operator-facing default.
  - ChatGPT account capabilities such as connected apps can drift outside config, but provider cache identity only keyed on account identity and URL, so cache refreshes could reuse stale capability assumptions.
- Root cause:
  - the stable “current Pro” alias existed only implicitly in docs/tests; several runtime code paths still directly returned the concrete pinned id.
  - provider cache identity had no feature/capability signature field, and ChatGPT had no adapter-level capability probe to feed one.
- Fix:
  - added `CURRENT_OPENAI_PRO_ALIAS` / `CURRENT_OPENAI_PRO_API_MODEL` plus `resolveCurrentOpenAiProModel(...)` in `src/oracle/config.ts`.
  - changed default/generic Pro resolution in CLI/config/browser mapping to use the stable alias instead of directly returning `gpt-5.2-pro`.
  - extended cache identity/payload types with `featureSignature`.
  - merged configured `services.<provider>.features` with a ChatGPT adapter feature probe and used that combined signature to invalidate provider caches when capabilities drift.
- Verification:
  - `pnpm vitest run tests/browser/llmServiceIdentity.test.ts tests/browser/providerCache.test.ts tests/cli/options.test.ts tests/cli/browserConfig.test.ts tests/schema/resolver.test.ts`
- Follow-ups:
  - if ChatGPT exposes a more authoritative connected-apps surface later, replace the current heuristic probe with that stronger source instead of expanding string matching indefinitely.

- Date: 2026-03-30
- Area: ChatGPT browser workspace/profile switching
- Symptom:
  - team wanted a second ChatGPT browser profile for workspace-scoped runs without mutating default chat target behavior.
- Root cause:
  - no visible operator-facing documentation and no regression test explicitly proving `profiles.<name>.services.chatgpt.url` flow for runtime profile selection.
  - confusion about whether a full `g/p-...` URL was required versus profile-level `projectId`/`projectName` scoping.
- Fix:
  - verified existing resolver precedence already supports profile service-url overrides in `resolveConfig`.
  - added a regression test in `tests/schema/resolver.test.ts` asserting profile `work` resolves `browser.chatgptUrl` from `profiles.work.services.chatgpt.url`.
  - added operator docs/examples in `docs/configuration.md` and `README.md` for both URL pinning and `projectId`/`projectName` based profile scoping.
  - added runtime examples for `--profile`, `--project-id`, and `--project-name` selection.
- Verification:
  - `pnpm vitest run tests/schema/resolver.test.ts`
- Follow-ups:
  - if users report remaining legacy key confusion, add migration/compatibility notes for specific field-level migration paths.

- Date: 2026-03-30
- Area: Browser/ChatGPT project source deletion should be idempotent across retry attempts
- Symptom:
  - `projects files remove <projectId> <file>` could fail during retry with `ChatGPT project source action button not found` after the first attempt already removed the file and the UI list changed.
  - `deleteProjectFile` proceeded to search for the action button using the passed filename even when the source row was absent after retries or re-renders.
- Root cause:
  - there was no row-presence re-check after the initial source snapshot; a successful first deletion could still be reattempted and treated as hard failure instead of success.
- Fix:
  - in `src/browser/providers/chatgptAdapter.ts`, added a `deleteProjectFile` flow that:
    - snapshots source rows,
    - resolves the target row by normalized filename match,
    - refreshes source rows when no direct match exists,
    - returns early when the file is already absent (idempotent success),
    - otherwise proceeds with action-menu removal using the refreshed/canonical filename.
  - this keeps existing removal semantics while preventing stale/false-negative action-button targeting.
- Verification:
  - `pnpm vitest run tests/browser/chatgptRateLimitGuard.test.ts tests/browser/llmServiceRateLimit.test.ts tests/browser/chatgptComposerTool.test.ts tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
  - `pnpm run check`
  - `pnpm tsx scripts/chatgpt-acceptance.ts --phase project --resume docs/dev/tmp/chatgpt-acceptance-state.json` (pass after re-run)
- Follow-ups:
  - If failures persist, verify the sources action row selector family and add a secondary scoped fallback before further retry tuning.

- Date: 2026-03-30
- Area: Browser/ChatGPT button-backed binary downloads require a delayed-button wait plus one-eval native-click capture
- Symptom:
  - after DOM-side artifact discovery was fixed, `auracall conversations artifacts fetch 69caa22d-1e2c-8329-904f-808fb33a4a56 --target chatgpt` still only materialized the canvas text file and missed the visible DOCX download button
- Root cause:
  - the conversation shell became ready before the `Download the DOCX` button itself existed, so a one-shot tag attempt could miss the button entirely
  - even after the transport was identified, the first production implementation assumed it could arm capture state in one CDP `Runtime.evaluate(...)` call and read it back after a later click; the direct browser probe showed the reliable path was to wrap the anchor-click hook and the native `button.click()` inside the same evaluation
  - ChatGPT's button did not go through fetch/XHR; it created a native anchor click to a signed `backend-api/estuary/content?id=file_...` URL, so browser-download-directory polling was the wrong primary mechanism
- Fix:
  - updated `tagChatgptDownloadButtonWithClient(...)` in `src/browser/providers/chatgptAdapter.ts` to retry for up to 10 seconds instead of assuming the button exists as soon as the conversation shell is ready
  - changed button-backed download materialization to:
    - tag the exact button
    - run one in-page native `button.click()` with a temporary anchor-click / `window.open` hook around it
    - capture the signed `backend-api/estuary/content?id=file_...` URL immediately
    - fetch the bytes directly via the authenticated browser session
  - use `content-disposition` / URI filename hints so DOCX downloads keep their real file name (`comment_demo.docx`) instead of a guessed generic name
- Verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
  - `pnpm run check`
  - live proof:
    - `auracall conversations artifacts fetch 69caa22d-1e2c-8329-904f-808fb33a4a56 --target chatgpt`
      - `artifactCount = 2`
      - `materializedCount = 2`
      - materialized:
        - `comment_demo.docx`
        - `Short Document With Comments.txt`
- Follow-ups:
  - run a broader smoke on the large bundle/report chat (`69bded7e-4a88-8332-910f-cab6be0daf9b`) when you want extra confidence across many ZIP/JSON/MD button artifacts, but the underlying transport path is now proven

- Date: 2026-03-30
- Area: Browser/ChatGPT assistant-turn artifact buttons live in the whole turn section, not necessarily inside the `[data-message-author-role]` node, and canvas fallback content can require DOM enrichment
- Symptom:
  - a “vibe coding” chat (`69bded7e-4a88-8332-910f-cab6be0daf9b`) visibly showed dozens of download-like buttons (`Codebase status report`, `Machine-readable handoff JSON`, `Fresh investigation bundle`, `Turn report`, etc.), but `auracall conversations context get ... --json-only` still returned `artifactCount = 0`
  - a DOCX + canvas chat (`69caa22d-1e2c-8329-904f-808fb33a4a56`) already exposed the download in payload metadata, but the canvas artifact lacked `contentText` unless the visible textdoc block was scraped from the DOM
- Root cause:
  - the first DOM-side artifact probe was scoped to the inner `[data-message-author-role]` node, but ChatGPT renders many artifact buttons as sibling content elsewhere in the assistant turn `section[data-testid^="conversation-turn-"]`
  - some canvas/textdoc artifacts carry enough identity in payload metadata (`textdocId`, title, type) but omit the actual body text until the DOM textdoc block is hydrated
  - ChatGPT's inline binary download buttons are neither normal links nor fetch/XHR requests; a native button click programmatically triggers an anchor click to a signed `backend-api/estuary/content?id=file_...` URL
- Fix:
  - moved DOM artifact discovery in `src/browser/providers/chatgptAdapter.ts` to search the whole assistant turn section for visible `button.behavior-btn` controls, excluding textdoc toolbar buttons
  - added normalization/merge helpers so DOM-only download buttons become synthetic `ConversationArtifact`s without clobbering payload-backed artifacts
  - added DOM canvas/textdoc enrichment from `div[id^="textdoc-message-"]` so missing `metadata.contentText` is filled from the live visible block when available
- Verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
  - `pnpm run check`
  - live proof:
    - `auracall conversations context get 69bded7e-4a88-8332-910f-cab6be0daf9b --target chatgpt --json-only`
      - now returns `artifactCount = 86`
    - `auracall conversations context get 69caa22d-1e2c-8329-904f-808fb33a4a56 --target chatgpt --json-only`
      - canvas `Short Document With Comments` now includes full `metadata.contentText`
    - direct browser probe confirmed native `Download the DOCX` click generates a signed anchor to `https://chatgpt.com/backend-api/estuary/content?id=file_...`
- Follow-ups:
  - run a broader smoke on the large bundle/report chat (`69bded7e-4a88-8332-910f-cab6be0daf9b`) when you want more confidence across many ZIP/JSON/MD button artifacts, but the core button-backed materializer is now live

- Date: 2026-03-30
- Area: Browser/ChatGPT conversation artifact materialization needs artifact-specific waits, exact file-id image binding, and serialized live probes
- Symptom: After adding the first `auracall conversations artifacts fetch <conversationId> --target chatgpt` path, the command initially behaved inconsistently in live validation:
  - image/materialization sometimes returned `materializedCount = 0` even though the same conversation already exposed four `image` artifacts in context
  - inline table/spreadsheet materialization could return only one CSV out of two visible tables
  - duplicate-titled image variants could bind the wrong rendered `<img>` when title fallback was allowed
  - running multiple live artifact fetches in parallel against the same managed ChatGPT browser produced contradictory results (`artifactCount = 0`, cache-identity failures, or partial materialization) because the runs were fighting over the same active signed-in tab
- Root cause:
  - the first materializer assumed "conversation surface ready" was enough, but ChatGPT can finish route/page hydration before specific artifacts render
  - inline tables need time for the actual `table[role=\"grid\"]` rows to appear
  - generated images need time for the `img[src*=\"backend-api/estuary/content?id=file_...\"]` elements to appear
  - title fallback for image selection is unsafe when multiple artifacts share the same title; only the file-backed `sediment://file_...` identity is authoritative
  - the managed ChatGPT browser session is effectively single-active-tab state from Aura-Call's perspective, so parallel live probes interfere with each other
- Fix:
  - Added `waitForChatgptTableArtifactRowsWithClient(...)` and `waitForChatgptImageArtifactWithClient(...)` in `src/browser/providers/chatgptAdapter.ts`.
  - `materializeConversationArtifact(...)` now waits for artifact-specific readiness instead of scraping immediately after generic conversation-shell readiness.
  - Tightened image resolution so artifacts with a file id only accept an exact `id=<fileId>` image match; title fallback is used only when no file id exists.
  - Kept the first materializer slice deliberately narrow:
    - `image` -> fetched binary file
    - inline `ada_visualizations` table -> CSV
    - `canvas` -> text file when the artifact is present
    - markdown-only `sandbox:/...` downloads remain metadata-only for now
- Verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
  - `pnpm run check`
  - Live serialized proof on image chat `69bc77cf-be28-8326-8f07-88521224abeb`:
    - `artifactCount = 4`
    - `materializedCount = 4`
    - exact file-id binding now fetches the correct duplicate-titled image variants
  - Live serialized proof on table chat `bc626d18-8b2e-4121-9c4a-93abb9daed4b`:
    - `artifactCount = 2`
    - `materializedCount = 2`
  - Live serialized proof on spreadsheet-download chat `69ca9d71-1a04-8332-abe1-830d327b2a65`:
    - `artifactCount = 1`
    - `materializedCount = 0`
- Follow-ups:
  - Add a real resolver for markdown-only `sandbox:/...` downloads once a stable binary path is known.
  - Keep live ChatGPT artifact validation serialized; do not parallelize against the shared managed browser tab.
  - Find a fresh logged-in canvas conversation for ongoing smoke validation, because the older `69c8a0fc-c960-8333-8006-c4d6e6704e6e` sample no longer reproduces a canvas artifact on this account.

- Date: 2026-03-30
- Area: Browser/ChatGPT spreadsheet-like markdown downloads should normalize as `spreadsheet`, not generic `download`
- Symptom: After adding `ada_visualizations` table extraction, a logged-in spreadsheet chat (`69ca9d71-1a04-8332-abe1-830d327b2a65`) still returned its `.xlsx` artifact as a generic `download`. The artifact was not missing, but the classification was wrong because ChatGPT exposed that spreadsheet as a markdown `sandbox:/...xlsx` link instead of an `ada_visualizations` table entry.
- Root cause:
  - The markdown-download extraction path in `src/browser/providers/chatgptAdapter.ts` treated every `sandbox:/...` link as `kind = download`.
  - Spreadsheet-like downloadable artifacts can arrive through the same markdown path as ordinary zip/json/text outputs, so relying only on `ada_visualizations` missed part of the spreadsheet surface.
- Fix:
  - Added `inferChatgptDownloadArtifactKind(...)` in `src/browser/providers/chatgptAdapter.ts`.
  - Markdown `sandbox:/...` artifacts ending in spreadsheet-like extensions (`.csv`, `.tsv`, `.xls`, `.xlsx`, `.ods`) now normalize as `kind = spreadsheet`.
  - Added focused regression coverage in `tests/browser/chatgptAdapter.test.ts`.
- Verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
  - `pnpm run check`
  - Live CLI proof on `69ca9d71-1a04-8332-abe1-830d327b2a65` now returns:
    - `artifactCount = 1`
    - `parabola_trendline_demo.xlsx`
    - `kind = "spreadsheet"`
    - `uri = sandbox:/mnt/data/parabola_trendline_demo.xlsx`
- Follow-ups:
  - Keep spreadsheet normalization anchored to concrete observed shapes: `ada_visualizations` tables plus spreadsheet-like download extensions. Do not invent broader spreadsheet semantics unless a richer payload actually exposes them.

- Date: 2026-03-30
- Area: Browser/ChatGPT conversation context now captures spreadsheet/table artifacts from `ada_visualizations`
- Symptom: Some ChatGPT chats with CSV/table outputs still returned `artifactCount = 0` even after downloads, images, and canvas/textdocs were implemented. A real logged-in CSV chat (`bc626d18-8b2e-4121-9c4a-93abb9daed4b`) visibly had downloadable/table artifacts, but `auracall conversations context get <id> --target chatgpt --json-only` returned none of them.
- Root cause:
  - These artifacts are not expressed as markdown `sandbox:/...` links, image asset pointers, or canvas metadata.
  - The authoritative payload shape is `message.metadata.ada_visualizations`, with entries like:
    - `type: "table"`
    - `file_id: "file-..."`
    - `title: "New Patents with ISURF Numbers"`
  - The existing extractor in `src/browser/providers/chatgptAdapter.ts` ignored `ada_visualizations`, so table outputs disappeared completely from cached/exported context.
- Fix:
  - Extended `extractChatgptConversationArtifactsFromPayload(...)` in `src/browser/providers/chatgptAdapter.ts` to normalize `ada_visualizations` entries with `type = table` into first-class `spreadsheet` artifacts.
  - Used `chatgpt://file/<file_id>` as the durable artifact URI and preserved `visualizationType` plus `fileId` in metadata.
  - Added focused regression coverage in `tests/browser/chatgptAdapter.test.ts`.
- Verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
  - `pnpm run check`
  - Live CLI proof on `bc626d18-8b2e-4121-9c4a-93abb9daed4b` now returns:
    - `artifactCount = 2`
    - `Patents with ISURF Numbers`
    - `New Patents with ISURF Numbers`
    - both with `kind = "spreadsheet"` and `chatgpt://file/<file_id>` URIs
- Follow-ups:
  - If ChatGPT exposes richer table metadata later (sheet names, column schemas, downloadable CSV names, preview text), extend `spreadsheet` metadata from the logged-in payload shape rather than scraping public share-page button text.

- Date: 2026-03-30
- Area: Browser/ChatGPT conversation context now captures generated image artifacts from tool payloads
- Symptom: ChatGPT conversation context already exposed downloadable `sandbox:/...` artifacts and canvas/textdoc blocks, but image-generation chats still flattened the interesting outputs away. On a real logged-in image conversation this meant `auracall conversations context get <id> --target chatgpt --json-only` returned messages and maybe ordinary downloads, but no first-class record of the generated images themselves, their `sediment://...` asset pointers, or the size/dimension/generation metadata needed to persist them sanely in cache/export.
- Root cause:
  - ChatGPT's image outputs do not currently arrive as markdown download links or canvas metadata.
  - The authoritative payload shape is a `tool` message whose `content_type` is `multimodal_text` and whose parts contain JSON objects with `content_type: "image_asset_pointer"`.
  - The existing artifact extractor in `src/browser/providers/chatgptAdapter.ts` only looked for markdown `sandbox:/...` links and `metadata.canvas`, so these tool-image payloads were ignored entirely.
- Fix:
  - Extended `ConversationArtifact.kind` in `src/browser/providers/domain.ts` to include `image` (and reserved `spreadsheet` for future richer table/textdoc payloads).
  - Widened artifact normalization in `src/browser/llmService/llmService.ts` so cached/exported contexts preserve `image` artifacts instead of dropping them as unknown kinds.
  - Added structured-part parsing in `src/browser/providers/chatgptAdapter.ts` and taught `extractChatgptConversationArtifactsFromPayload(...)` to normalize `image_asset_pointer` tool parts into first-class artifacts with:
    - `kind: "image"`
    - `uri = sediment://file_...`
    - `sizeBytes`, `width`, `height`
    - nested `generation` / `dalle` metadata when present
  - Added focused regression coverage in `tests/browser/chatgptAdapter.test.ts`.
- Verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
  - `pnpm run check`
  - Live CLI proof on logged-in image chat `69bc77cf-be28-8326-8f07-88521224abeb`:
    - `artifactCount = 4`
    - all four generated images now appear in `artifacts[]` with `kind = "image"`
    - metadata includes 1024x1024 dimensions plus generation ids and other DALL-E metadata
- Follow-ups:
  - The public spreadsheet share example still looks download-first on the share page (`Updated bundle ZIP`, `Implementation summary`, etc.). Do not add a special spreadsheet extractor until a richer logged-in payload shape than plain downloads/textdocs is confirmed.

- Date: 2026-03-29
- Area: Browser/ChatGPT conversation context now captures assistant sources plus in-chat artifacts/canvas blocks
- Symptom: ChatGPT conversation CRUD and sent-file read parity were already live, but `auracall conversations context get <id> --target chatgpt --json-only` still flattened the interesting assistant-side context away. On real chats this meant:
  - no `sources[]` even when a turn clearly cited uploaded files through the visible `Sources` UI
  - no durable artifact records for downloadable outputs like `updated skill.zip`, `combined JSON extraction`, or `combined BibTeX extraction`
  - no first-class record of canvas/textdoc content in canvas chats
- Root cause:
  - the adapter only scraped visible DOM message text plus sent user-turn upload tiles
  - the actual authoritative data lived in ChatGPT's backend conversation payload, not only the visible DOM
  - a naive in-page `fetch('/backend-api/conversation/<id>')` was misleading because it could return a JSON `conversation_not_found` error body even on a page that visibly hydrated correctly
  - the first CDP fallback also failed because it matched any `/backend-api/conversation/<id>*` response (`stream_status`, `textdocs`, interpreter download endpoints) and tried `getResponseBody(...)` before `loadingFinished`
  - llmService then masked the adapter failure by falling back to previously cached context with messages but no sources/artifacts
- Fix:
  - Extended `src/browser/providers/domain.ts` with `ConversationArtifact` and `ConversationContext.artifacts`.
  - Extended `src/browser/llmService/llmService.ts` normalization and `src/browser/llmService/cache/export.ts` Markdown/HTML export so `artifacts[]` survive caching/export alongside `sources[]`.
  - Added pure payload extraction in `src/browser/providers/chatgptAdapter.ts`:
    - `extractChatgptConversationSourcesFromPayload(...)`
    - `extractChatgptConversationArtifactsFromPayload(...)`
  - File citations now normalize to synthetic `chatgpt://file/<id>` URLs with `sourceGroup`, downloadable assistant outputs normalize from markdown `sandbox:/...` links, and canvas/textdoc tool messages normalize into `canvas` artifacts with `textdocId`, title, and captured content text from the adjacent code preview.
  - Reworked the payload capture path in `readConversationContext(...)`:
    - only trust the direct fetch path when it is successful and returns a real `mapping`
    - otherwise fall back to CDP network capture on a reload of the already-open conversation route
    - match only the exact `/backend-api/conversation/<id>` response, not sibling endpoints
    - wait for `Network.loadingFinished` before `getResponseBody(...)`
    - re-wait for the visible conversation surface before scraping DOM messages because the payload capture reloads the page
- Verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
  - `pnpm run check`
  - Direct provider proof on artifact chat `69c3e6d0-3550-8325-b10e-79d946e31562`:
    - `sourceCount = 6`
    - `artifactCount = 30`
  - Live CLI proof on the same artifact chat:
    - includes file-backed sources like `proof.pdf`
    - includes downloadable artifacts like `updated skill.zip`, `combined JSON extraction`, and `combined BibTeX extraction`
  - Live CLI proof on canvas chat `69c8a0fc-c960-8333-8006-c4d6e6704e6e`:
    - `artifactCount = 1`
    - includes canvas artifact `Probe` with `textdocId = 69c8a1018ea08191b3e3cbdb038221e4`
- Follow-ups:
  - If ChatGPT exposes richer non-text artifact classes beyond downloadable `sandbox:/...` links and textdocs, add a second artifact normalization pass instead of flattening them into plain assistant text.
  - The `browser-tools doctor` `__name is not defined` issue observed during DOM recon is separate and still needs its own fix.

- Date: 2026-03-29
- Area: Browser/ChatGPT project-scoped conversation CRUD must anchor to the project page `Chats` tab, not generic `/c/...` anchors
- Symptom: ChatGPT project conversations were conceptually supported by `--project-id`, but the adapter was still treating all visible `/c/...` anchors as one pool. On a project page that is unsafe, because the sidebar still shows root `Recents` and only a limited selected-project subset, while the authoritative project-chat catalog is the main `Chats` panel.
- Root cause:
  - `scrapeChatgptConversations(...)` and project-scoped rename/delete verification relied on generic anchor discovery plus `projectId` matching instead of explicitly preferring the project page conversation panel.
  - Live DOM inspection on the real project page showed the authoritative project-chat rows live under `role="tabpanel" -> SECTION -> OL -> LI`, with their own row-local `Open conversation options for ...` button in the main content area.
  - Without making that surface explicit, project-scoped operations were only “working by luck” as long as ChatGPT happened not to duplicate or reorder those project-chat anchors elsewhere on the page.
- Fix:
  - Updated `src/browser/providers/chatgptAdapter.ts` so project-scoped conversation list reads prefer visible `role="tabpanel"` conversation anchors first, and project-scoped rename/delete verification now also prefers project-panel rows over any sidebar subset row if both render.
  - Scoped the project delete verifier to the project-page conversation panel when a `projectId` is present.
  - Expanded `scripts/chatgpt-acceptance.ts` so it now creates, reads, renames, and deletes a disposable project-scoped conversation using `--project-id`, instead of covering only root conversations.
- Verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
  - `pnpm run check`
  - Live targeted proof on project `g-p-69c9a938ade0819199bee2c3e354a53b`:
    - created project conversation `69c9ceb0-a060-8326-9e94-a9972d567e19`
    - `conversations --project-id ... --refresh` returned that project conversation cleanly
    - renamed it to `AC GPT Project Row Probe`
    - project-scoped refresh returned the renamed title
    - deleted it successfully
    - final `conversations --project-id ... --refresh` returned `[]`
- Follow-ups:
  - Run one guarded full `scripts/chatgpt-acceptance.ts` pass to prove the expanded project-conversation slice under the live ChatGPT write-budget guard.

- Date: 2026-03-29
- Area: Browser/ChatGPT root conversation rename must verify the top-row reorder, not just a matching title somewhere
- Symptom: ChatGPT root-conversation rename could still look flaky after the sidebar-row menu + inline input path was fixed. The rename itself often succeeded, but verification could still timeout because the old success check accepted any matching title surface (`document.title`, any matching anchor text, any matching row-menu aria-label) instead of the specific list behavior ChatGPT actually uses after a successful rename.
- Root cause:
  - The provider-level rename verifier in `src/browser/providers/chatgptAdapter.ts` was blind to the strongest ChatGPT-specific signal: after pressing `Enter`, there is a short lag and then the renamed root conversation moves to the top of the root list.
  - The acceptance harness in `scripts/chatgpt-acceptance.ts` only waited for the conversation id to have the expected title somewhere in the refreshed catalog, not for that id to become the new top list entry.
- Fix:
  - Tightened `buildConversationTitleAppliedExpression(...)` / `waitForChatgptConversationTitleApplied(...)` so rename success now requires the same conversation id to be the top visible conversation row with the expected title.
  - Updated `scripts/chatgpt-acceptance.ts` so the rename wait now keys off the refreshed list's first entry: the same conversation id must bubble to the top with the new title.
  - Preserved the authority split explicitly: root-chat rename verification uses the root conversation list, while project-chat verification should continue to use the project page conversation list rather than the abbreviated sidebar subset.
- Verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
  - `pnpm run check`
  - Live proof:
    - created disposable root conversation `69c9c950-4544-8333-8cbf-492bc1bd7c1c`
    - renamed it to `AC GPT Top 3wesd8`
    - `conversations --target chatgpt --refresh` returned that same id as the first row with the new title
    - deleted the disposable conversation successfully afterward
- Follow-ups:
  - For project-scoped conversations, keep the project page conversation list as the authoritative postcondition surface; the selected-project sidebar subset is not a complete catalog.

- Date: 2026-03-29
- Area: Browser/ChatGPT existing-conversation composer tool state should be inspected and persisted, not inferred from a successful send
- Symptom: ChatGPT existing-conversation runs could switch add-ons like `web-search`, but there was no durable proof in session metadata about which tool actually ended up selected, and the acceptance harness had to infer success indirectly from later conversation text. When the harness was upgraded to look for the matching browser session by prompt, it also exposed that final ChatGPT browser session metadata still lacked a normalized `conversationId`, so prompt-matched session lookup could race or fail even after a completed browser run.
- Root cause:
  - `ensureChatgptComposerTool(...)` knew how to click the live `Add files and more` surface, but there was no explicit `read current state` helper for existing conversations when the real truth lived in a selected chip or in reopened menu markup.
  - ChatGPT browser-mode result objects were not persisting either the actual selected composer tool or the final normalized `conversationId` into browser runtime metadata, so acceptance/debugging code had to fall back to output scraping.
  - The acceptance harness was reading session metadata immediately after a browser run without polling for the newly completed matching session record.
- Fix:
  - Added `readCurrentChatgptComposerTool(...)` in `src/browser/actions/chatgptComposerTool.ts`, which prefers a visible composer tool chip and otherwise reopens the top-level / `More` menu path to read selected-state from live menu markup.
  - Kept the pure menu/chip resolution logic testable through `resolveCurrentComposerToolSelectionForTest(...)` and added focused coverage in `tests/browser/chatgptComposerTool.test.ts`.
  - Persisted both `composerTool` and normalized `conversationId` in ChatGPT browser results and session runtime metadata through `src/browser/index.ts`, `src/browser/sessionRunner.ts`, `src/browser/types.ts`, `src/sessionManager.ts`, and `packages/browser-service/src/types.ts`.
  - Upgraded `scripts/chatgpt-acceptance.ts` to poll for the matching recent browser session by prompt before asserting persisted tool state.
- Verification:
  - `pnpm vitest run tests/browser/chatgptComposerTool.test.ts tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
  - `pnpm run check`
  - Live proof:
    - `~/.auracall/sessions/reply-exactly-with-chatgpt-accept-64/meta.json` now records `browser.runtime.composerTool = "web search"` for an existing-conversation `--browser-composer-tool web-search` run on ChatGPT.
- Follow-ups:
  - The broader guarded ChatGPT acceptance rerun is still blocked by a separate rename-title wait lag. Do not treat that as evidence that the new tool-state persistence path failed.

- Date: 2026-03-29
- Area: Browser/ChatGPT acceptance tail must trust the real delete dialog and the tagged project-settings dialog
- Symptom: After the earlier root rename and raw-id delete fixes, the guarded full ChatGPT acceptance run still failed in its final cleanup tail. First it could throw `ChatGPT conversation delete confirmation did not open ...` even though the live `Delete chat?` dialog and `delete-conversation-confirm-button` were visibly on screen. After that was fixed, the same acceptance run advanced one step farther and then failed at project cleanup with `Button not found` from `selectRemoveProjectItem(...)`, even though the live page clearly still had a `Delete project` button in the settings sheet.
- Root cause:
  - Root conversation delete was still keying the confirmation check off the pre-delete page title, so if ChatGPT's real confirm dialog title text no longer matched that older page title exactly, the adapter rejected a perfectly valid visible confirm dialog.
  - Project removal was scoping its `Delete project` search to generic `DEFAULT_DIALOG_SELECTORS`. On the real ChatGPT page, the project settings dialog can coexist with a separate `Too many requests` dialog, so the search could bind to the wrong dialog and never see the actual `Delete project` button.
  - The acceptance harness itself was also too aggressive for this account until its mutating-command timeout budget matched the new rolling write guard behavior; a guarded ChatGPT mutation could be alive but just waiting its turn longer than the runner's old 120s `spawnSync` timeout.
- Fix:
  - Upgraded `scripts/chatgpt-acceptance.ts` so mutating ChatGPT commands get a longer timeout budget and the guard-aware retry path also understands `ChatGPT write budget active until ...`, not only visible cooldown messages.
  - Relaxed `buildConversationDeleteConfirmationExpression(...)` in `src/browser/providers/chatgptAdapter.ts` so the real `delete-conversation-confirm-button` inside a visible `Delete chat?` dialog is authoritative even when the page-title text has drifted.
  - Added a small regression helper/test around that dialog-matching rule in `tests/browser/chatgptAdapter.test.ts`.
  - Scoped `selectRemoveProjectItem(...)` in `src/browser/providers/chatgptAdapter.ts` to the tagged project-settings dialog returned by `tagProjectSettingsDialog(...)` and wrapped the path in `withUiDiagnostics(...)` so overlapping dialogs stop poisoning project removal.
- Verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
  - `pnpm run check`
  - Live targeted proofs:
    - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts delete 69c9abe2-72c0-8333-b906-63fc027eddba --target chatgpt --yes --verbose`
    - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts projects remove g-p-69c9b039bfd88191af13a04f82b5cf04 --target chatgpt --verbose`
  - Full guarded acceptance proof:
    - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx scripts/chatgpt-acceptance.ts`
    - returned `PASS` on suffix `lyveco`
- Follow-ups:
  - Treat `scripts/chatgpt-acceptance.ts` as the canonical ChatGPT browser bar now that it has survived real account cooldowns and overlapping-dialog cleanup states.
  - The next ChatGPT browser work should move to existing-conversation tool/add-on state, not more CRUD tail repair.

- Date: 2026-03-29
- Area: Browser/ChatGPT raw root conversation ids must bypass catalog resolution for delete
- Symptom: After the root rename fix landed, a standalone `auracall delete <conversationId> --target chatgpt` could still fail for a freshly created root conversation with `No conversations matched "<id>"`, even though the provider knew how to build the correct `/c/<id>` route and the conversation was still live in the browser.
- Root cause:
  - The delete command in `bin/auracall.ts` always listed conversations first and matched by refreshed catalog entries before it ever called the provider delete path.
  - ChatGPT root conversation creation can outpace refreshed catalog hydration, so a just-created `69c9...` id can be authoritative before the visible list/cache catches up.
  - That meant the product failed before it even reached the real browser delete code.
- Fix:
  - Added `normalizeChatgptConversationId(...)` to `src/browser/providers/chatgptAdapter.ts` so bare ChatGPT root ids and ChatGPT conversation URLs can be normalized into canonical conversation ids.
  - Advertised that hook through `src/browser/providers/index.ts` / `src/browser/providers/types.ts`.
  - Taught `src/browser/llmService/llmService.ts` to treat provider-native conversation ids as authoritative selectors inside `resolveConversationSelector(...)`.
  - Updated the delete command in `bin/auracall.ts` so an exact provider-native conversation id bypasses conversation-list matching and goes straight to the delete path.
  - Hardened `scripts/chatgpt-acceptance.ts` so the late destructive cleanup steps (`delete` / `projects remove`) will wait once across a known ChatGPT guard cooldown and retry instead of immediately reporting a false runner failure at the tail end of an otherwise-good run.
- Verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
  - `pnpm run check`
  - `pnpm tsx scripts/chatgpt-acceptance.ts --help`
  - Live proof:
    - created fresh root conversation `69c9a282-91a4-832e-b8c0-21fa595a24a9`
    - `ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts delete 69c9a282-91a4-832e-b8c0-21fa595a24a9 --target chatgpt --yes --verbose`
    - command deleted successfully without a prior `conversations --refresh`
- Follow-ups:
  - Re-run the full guarded ChatGPT acceptance script after the current cooldown clears; the last full rerun reached the final delete and then hit the guard itself, not a remaining DOM/catalog mismatch.
  - If the acceptance runner still flakes after the one-shot cooldown retry, capture whether the remaining issue is another cleanup retry policy gap or a genuinely new ChatGPT browser behavior.

- Date: 2026-03-29
- Area: Browser/ChatGPT root conversation rename uses the sidebar-row menu, not the header menu
- Symptom: Guarded ChatGPT acceptance stopped failing from rate limits and finally exposed the real root-conversation rename bug: `auracall rename <conversationId> --target chatgpt` timed out on a fresh root conversation even though the conversation itself existed and context reads were already working.
- Root cause:
  - The adapter still had a header-menu fallback for rename on the open conversation route.
  - Live DOM probing showed that the current header `Open conversation options` menu does not expose `Rename` at all for root conversations; it only exposes `View files in chat`, `Move to project`, `Pin chat`, `Archive`, and `Delete`.
  - The real rename surface is the sidebar-row `Open conversation options for ...` menu on the ChatGPT home/list page. After choosing `Rename`, the row rerenders into a plain visible `input[type="text"]` with the current title as its value, so the old synthetic row tag is not stable enough to be the only selector for the edit field.
  - `submitInlineRename(...)` also only had Runtime-level synthetic Enter submission, which is exactly the sort of synthetic keyboard path ChatGPT can ignore on drifted UI surfaces.
- Fix:
  - Extended `packages/browser-service/src/service/ui.ts` so `submitInlineRename(...)` can submit with a real CDP Enter key via `Input.dispatchKeyEvent`, using `native-enter` or `native-then-synthetic` strategies instead of assuming DOM-dispatched keyboard events are equivalent.
  - Rewired `src/browser/providers/chatgptAdapter.ts` so root conversation rename always starts from the list/sidebar row menu, removes the invalid header-menu rename fallback, and falls back from the synthetic tagged-row selector to the real visible `input[type="text"]` once the row enters edit mode.
- Verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
  - `pnpm run check`
  - Live WSL non-Pro proof:
    - `ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts rename 69c99df4-aaf0-8332-8714-d104d751f75d "AC GPT C rsnyfq" --target chatgpt --verbose`
    - fresh list verification:
      - `ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts conversations --target chatgpt --refresh`
      - confirmed id `69c99df4-aaf0-8332-8714-d104d751f75d` refreshed as title `AC GPT C rsnyfq`
- Follow-ups:
  - ChatGPT root delete should use the same list-first sidebar-row surface for the initial menu open, with the header menu kept only as a delete fallback because that menu really does expose `Delete`.
  - Freshly created root conversation ids can still outrun conversation-catalog resolution for a standalone `delete <conversationId>` call; treat that as a separate resolution/caching issue, not more rename DOM drift.

- Date: 2026-03-29
- Area: Browser-service select-and-reopen verification for menu options
- Symptom: Even after menu-family selection, stable visible-menu handles, and nested submenu traversal were fixed, adapters still needed provider-local reopen logic whenever the authoritative selected-state only existed in menu markup rather than in a visible chip/pill. ChatGPT composer tools like `Canvas` were the concrete case: activation worked, but verification still lived in adapter code.
- Root cause:
  - Browser-service owned menu opening and submenu traversal, but not the final "reopen the same menu family and inspect selected state" pattern.
  - That left adapters rebuilding the same mechanics whenever a surface only exposed authoritative state inside the reopened menu.
- Fix:
  - Added `inspectNestedMenuPathSelection(...)` to `packages/browser-service/src/service/ui.ts` so browser-service can reopen a menu path up to the containing menu and read the selected-state of the target option from the live menu markup.
  - Added `selectAndVerifyNestedMenuPathOption(...)` on top of that, so browser-service can activate an option, reopen the same path, and confirm the option stayed selected before returning success.
  - Rewired `src/browser/actions/chatgptComposerTool.ts` to use the shared select-and-reopen helper instead of its own provider-local reopen/verify path.
- Verification:
  - `pnpm vitest run tests/browser-service/ui.test.ts tests/browser/chatgptComposerTool.test.ts tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
  - `pnpm run check`
  - Live non-Pro proof:
    - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts "Reply exactly with AURACALL CHATGPT CANVAS VERIFY HELPER PROBE 1." --engine browser --browser-target chatgpt --model gpt-5.2 --browser-composer-tool canvas --verbose`
    - confirmed `Composer tool: canvas`
    - returned `AURACALL CHATGPT CANVAS VERIFY HELPER PROBE 1.`
- Follow-ups:
  - Return to ChatGPT conversation CRUD and only pull more selection logic into browser-service if the conversation surfaces expose another reusable pattern beyond the current menu stack.

- Date: 2026-03-29
- Area: Browser-service visible-menu handles and ChatGPT nested composer menus
- Symptom: The shared nested menu-path helper worked in direct probes, but ChatGPT browser runs still failed on `--browser-composer-tool canvas` with `menu-not-found`, `option-not-found`, or `did not stay selected after activation` once the adapter tried to read the open top-level menu and then open `More` or reopen the menu for verification.
- Root cause:
  - `collectVisibleMenuInventory(...)` returned specific tagged selectors like `[data-oracle-visible-menu-index="1"]`, but it also cleared and reassigned those tags on every inventory pass.
  - Any caller that opened a menu, kept the returned selector, and then performed another inventory read was holding a stale menu handle.
  - The ChatGPT composer path hit that exact pattern twice:
    - open top-level `Add files and more`, read inventory, then try to open `More`
    - reopen menus after activation to verify selected state for submenu tools like `Canvas`
- Fix:
  - Changed `packages/browser-service/src/service/ui.ts` so synthetic visible-menu selectors stay stable across repeated inventory passes while the underlying menu node remains alive instead of being reindexed on every read.
  - Kept the package-owned nested-menu primitives (`openSubmenu(...)`, `selectNestedMenuPath(...)`) and simplified `src/browser/actions/chatgptComposerTool.ts` so normal activation runs through the shared nested-path helper first, with menu inspection reserved for verification and error hints.
  - Refreshed ChatGPT composer menu handles from the current inventory entry selector when reading the top-level or `More` submenu, so the adapter stays aligned with the current browser-service menu handle.
- Verification:
  - `pnpm vitest run tests/browser-service/ui.test.ts tests/browser/chatgptComposerTool.test.ts tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
  - `pnpm run check`
  - Live non-Pro proof:
    - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts "Reply exactly with AURACALL CHATGPT CANVAS BROWSER SERVICE PROBE 5." --engine browser --browser-target chatgpt --model gpt-5.2 --browser-composer-tool canvas --verbose`
    - confirmed `Composer tool: canvas`
    - returned `AURACALL CHATGPT CANVAS BROWSER SERVICE PROBE 5.`
- Follow-ups:
  - The next package-owned menu extraction should be select-and-reopen verification, since some tools only expose authoritative selected state inside the reopened menu rather than via a composer chip or pill.

- Date: 2026-03-28
- Area: Browser-service backlog shaping from ChatGPT composer/add-on drift
- Symptom: The ChatGPT composer/add-on work surfaced a class of failures that were broader than ChatGPT itself: multiple unrelated visible menus at once, identical trigger labels like `More` on different surfaces, nested submenu paths, and the need to reopen menus to verify selected state when chips/pills were not the whole truth. Without writing those down as package-level learnings, the next adapter would likely reimplement them locally again.
- Root cause:
  - browser-service already owned generic interaction strategies and some diagnostics, but it still lacked package-owned primitives for trigger-anchored menu-family selection, nested submenu traversal, and menu inventory/census
  - the live ChatGPT composer made the gap obvious because it mixed top-level rows, a `More` submenu, and file/source/tool rows in one shared surface
- Fix:
  - Wrote the next active ChatGPT browser plan in `docs/dev/chatgpt-conversation-surface-plan.md` so the project CRUD milestone is no longer conflated with the next conversation/attachment work
  - Marked the project-only plan as effectively closed in `docs/dev/chatgpt-project-surface-plan.md` unless the native UI later exposes clone
  - Expanded `docs/dev/browser-service-upgrade-backlog.md` with the reusable follow-on techniques:
    - trigger-anchored menu-family selection
    - nested menu-path selection
    - menu inventory / census helpers
    - reopen-to-verify option selection
  - Kept the extraction boundary explicit: browser-service should own menu mechanics and diagnostics, while provider adapters still own semantic classification like tool vs source vs file
- Verification:
  - documentation-only update; no code tests were needed
- Follow-ups:
  - When ChatGPT conversation work starts, prefer extracting trigger-anchored menu-family selection or nested submenu helpers into `packages/browser-service/` before adding more provider-local menu glue
  - if a future surface proves those patterns outside ChatGPT too, raise them from backlog guidance into active implementation work
- Date: 2026-03-28
- Area: Browser/ChatGPT composer add-on catalog coverage
- Symptom: Browser-mode could already select `web-search`, but the rest of ChatGPT's current `Add files and more` surface was still effectively undocumented and only partially mapped. That left a real risk that valid human-visible add-ons under the top-level menu and `More` submenu would work only if the operator guessed the exact current label.
- Root cause:
  - The first pass only proved one top-level row (`Web search`) and a narrow alias set (`quickbooks`, `acrobat`, `photoshop`, `calendar`, `drive`).
  - ChatGPT's current add-on surface is no longer flat. The live managed WSL session exposes both top-level rows and a separate `More` submenu, so a reliable mapping has to be based on the real catalog, not on a short guessed list.
- Fix:
  - Probed the live signed-in WSL ChatGPT session and recorded the current visible catalog:
    - top level: `Add photos & files`, `Recent files`, `Company knowledge`, `Create image`, `Deep research`, `Web search`, `More`
    - `More`: `Study and learn`, `Agent mode`, `Canvas`, `Adobe Acrobat`, `Adobe Photoshop`, `Canva`, `GitHub`, `Gmail`, `Google Calendar`, `Google Drive`, `Intuit QuickBooks`, `Quizzes`
  - Expanded `src/browser/actions/chatgptComposerTool.ts` alias coverage so shorthand requests normalize onto the live labels:
    - `research -> deep research`
    - `image|images -> create image`
    - `knowledge -> company knowledge`
    - `study|learn|study mode -> study and learn`
    - `agent -> agent mode`
    - `quiz -> quizzes`
    - `gh|git hub -> github`
    - existing `calendar`, `drive`, `quickbooks`, `acrobat`, `photoshop` mappings remain
  - Kept `Add photos & files` on the normal attachment path and continued rejecting file-upload-style `--browser-composer-tool` requests so file upload does not get conflated with add-on selection.
- Verification:
  - `pnpm vitest run tests/browser/chatgptComposerTool.test.ts tests/browser/thinkingTime.test.ts tests/browser-service/ui.test.ts --maxWorkers 1`
  - `pnpm run check`
  - Live non-Pro submenu proof:
    - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts "Reply exactly with AURACALL CHATGPT CANVAS PROBE 1." --engine browser --browser-target chatgpt --model gpt-5.2 --browser-composer-tool canvas --verbose`
    - confirmed `Composer tool: Canvas`
    - returned `AURACALL CHATGPT CANVAS PROBE 1.`
- Follow-ups:
  - If we want operators to discover the catalog without source/docs, add a user-facing reference/help surface for the current ChatGPT add-on inventory.
  - Keep treating file upload as the attachment flow (`--file`) even though file-related rows appear in the same ChatGPT menu as the add-ons.

- Date: 2026-03-28
- Area: Browser/ChatGPT composer tool selection and current thinking-depth labels
- Symptom: Browser-mode ChatGPT runs could reach the semantic `Thinking` model, but the live composer surface had drifted in two ways: the depth picker now exposed `Standard` / `Extended` instead of the older `light` / `heavy` labels, and the `Add files and more` button had become a real add-on picker with direct tools plus a `More` submenu. Reused tabs could also leave the wrong menu open, causing Aura-Call to confuse the Thinking menu for the add-ons menu.
- Root cause:
  - `src/browser/actions/thinkingTime.ts` still assumed the older `light` / `heavy` wording instead of ChatGPT's current `Standard` / `Extended` labels.
  - Aura-Call did not yet expose a first-class ChatGPT composer-tool selection path, so add-on tools behind `Add files and more` were unmapped in browser mode.
  - Shared browser-service menu helpers did not recognize some of ChatGPT's current menu row roles (`menuitemradio`, `option`) and did not proactively dismiss stale visible menus before the next selector flow.
  - The first composer-tool picker was too willing to trust any visible menu, including the already-open Thinking menu.
- Fix:
  - Updated `src/browser/actions/thinkingTime.ts` so current ChatGPT thinking-depth selection targets `Standard` / `Extended` directly while keeping `light` / `heavy` as legacy aliases.
  - Added `src/browser/actions/chatgptComposerTool.ts` and wired `--browser-composer-tool <tool>` through `bin/auracall.ts`, `src/cli/browserConfig.ts`, `src/browser/config.ts`, `src/sessionManager.ts`, `src/schema/types.ts`, `src/schema/cli-map.ts`, and `src/browser/service/profileConfig.ts`.
  - Kept the file uploader on the normal attachment flow instead of treating file upload as a composer-tool selection.
  - Hardened `packages/browser-service/src/service/ui.ts` so shared helpers recognize `menuitemradio` / `option` rows and can dismiss stale visible menus before model/thinking/tool selection.
  - Tightened top-level composer-menu scoring so tool selection only trusts menus that actually contain composer/add-on markers such as `More`, `Add photos/files`, `Recent files`, or the requested tool label.
- Verification:
  - `pnpm vitest run tests/browser-service/ui.test.ts tests/browser/chatgptComposerTool.test.ts tests/browser/thinkingTime.test.ts tests/cli/browserConfig.test.ts tests/browser/config.test.ts --maxWorkers 1`
  - `pnpm run check`
  - Live non-Pro managed ChatGPT run:
    - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts "Reply exactly with AURACALL CHATGPT TOOL PROBE 3." --engine browser --browser-target chatgpt --model gpt-5.2-thinking --browser-thinking-time extended --browser-composer-tool web-search --browser-keep-browser --verbose`
    - confirmed `Thinking time: Extended (already selected)`
    - confirmed `Composer tool: Web search`
    - returned `AURACALL CHATGPT TOOL PROBE 3`
- Follow-ups:
  - Keep Pro out of live validation on this account unless explicitly requested.
  - Continue mapping the remaining ChatGPT add-on rows under `Add files and more` / `More`; file upload should stay on the normal attachment path rather than moving under composer-tool selection.

- Date: 2026-03-28
- Area: Browser/ChatGPT semantic model discovery and selection
- Symptom: Browser-mode ChatGPT model selection was still built around versioned `GPT-5.2 ...` assumptions even though the live picker on the authenticated WSL Chrome session had drifted to semantic rows: `Instant`, `Thinking`, `Pro`, plus `Configure...`. The top button label had also drifted to a generic `ChatGPT`, so `Model picker: ...` logs and current-model detection were no longer meaningful.
- Root cause:
  - `src/browser/constants.ts` and `src/cli/browserConfig.ts` still treated `GPT-5.2 Instant` as the default browser target and mapped base `gpt-5.2` / `gpt-5.1` to stale versioned labels instead of the live semantic rows.
  - `src/browser/actions/modelSelection.ts` assumed the top button text reflected the active model and strongly weighted hardcoded `5.2`/`5.1` tokens during option scoring.
  - The live selected-state signal had drifted too: the active menu row no longer exposes `aria-*` or a named check icon. ChatGPT now marks the active model with a trailing slot (`<div class="trailing" data-trailing-style="default"><svg ...></svg></div>`), so the old selected-state detector could miss a real current selection.
- Fix:
  - Changed the browser default target to `Instant` in `src/browser/constants.ts`.
  - Updated `src/cli/browserConfig.ts` so ChatGPT browser labels now map to the live semantic picker contract:
    - `gpt-5.2` / `gpt-5.1` -> `Instant`
    - `gpt-5.2-thinking` -> `Thinking`
    - `gpt-5.2-pro` / `gpt-5.1-pro` / `gpt-5-pro` -> `Pro`
  - Reworked `src/browser/actions/modelSelection.ts` so option scoring is semantic-first (`instant` / `thinking` / `pro`), `current` mode discovers the checked menu row from the open menu instead of trusting the button caption, and success logs use the real selected row label.
  - Extended selected-state detection to treat the live trailing indicator slot (`.trailing` / `[data-trailing-style]` containing `svg` or `[role="img"]`) as selected alongside the older `aria-*` / named-check affordances.
  - Updated the focused unit/live test expectations in `tests/browser/modelSelection.test.ts`, `tests/browser/modelSelection.label.test.ts`, `tests/cli/browserConfig.test.ts`, `tests/browser/config.test.ts`, and `tests/live/browser-model-selection-live.test.ts` so they now reflect the semantic picker instead of versioned `GPT-5.2 ...` labels.
- Verification:
  - `pnpm vitest run tests/browser/modelSelection.test.ts tests/browser/modelSelection.label.test.ts tests/cli/browserConfig.test.ts tests/browser/config.test.ts --maxWorkers 1`
  - Live DOM probe on the signed-in ChatGPT WSL session at port `45011`:
    - confirmed the available rows are `Instant`, `Thinking`, `Pro`, `Configure...`
    - confirmed the selected-state markup lives in the trailing slot, not `aria-*`
    - confirmed non-Pro live switching by clicking `Instant` and then `Thinking`, with the selected row resolving to `instant for everyday chats` and then `thinking for complex questions`
- Follow-ups:
  - Keep ChatGPT live validation on `Instant` / `Thinking` for this account; do not probe `Pro` unless explicitly requested.
  - If ChatGPT changes the trailing selected-slot markup again, update `optionIsSelected(...)` in `src/browser/actions/modelSelection.ts` before changing the higher-level mapping logic.

- Date: 2026-03-28
- Area: Browser/ChatGPT cache identity auto-detection
- Symptom: Signed-in ChatGPT project list/write paths still interrupted with `Cache identity for chatgpt (username/email, leave blank to skip):`, and if the operator skipped the prompt Aura-Call followed up with `Failed to update project cache: Cache identity for chatgpt is required...`. That made managed-browser ChatGPT CRUD feel half-working even though the browser session itself was authenticated.
- Root cause:
  - `src/browser/llmService/llmService.ts` only attempted live browser identity detection when `browser.cache.useDetectedIdentity` was explicitly enabled, so the default path skipped directly to the interactive prompt.
  - ChatGPT did not implement `getUserIdentity(...)`, so even enabling that flag would still have produced `null`.
- Fix:
  - Probed the live signed-in ChatGPT WSL session and confirmed that same-origin `/api/auth/session` returns a stable browser-auth payload with the signed-in user id and email (`user-PVyuqYSOU4adOEf6UCUK3eiK`, `ecochran76@gmail.com`).
  - Added ChatGPT browser identity detection in `src/browser/providers/chatgptAdapter.ts` to read `/api/auth/session`, normalize the `user` / `account` payload into `ProviderUserIdentity`, and fall back to storage/profile-menu hints only if the auth-session read fails.
  - Changed `src/browser/llmService/llmService.ts` so cache identity resolution now prefers detected browser identity by default unless `browser.cache.useDetectedIdentity === false` explicitly disables it.
  - Fixed `bin/auracall.ts` so `projects create --target chatgpt ...` also honors the parent `projects` target flag; without that, the live write smoke could still fall back to the configured provider and throw unrelated Grok create errors.
  - Added focused tests in `tests/browser/chatgptAdapter.test.ts` and new service-level coverage in `tests/browser/llmServiceIdentity.test.ts`.
- Verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts tests/browser/llmServiceIdentity.test.ts tests/runOptions.test.ts tests/schema/resolver.test.ts tests/browser/config.test.ts tests/cli/browserConfig.test.ts --maxWorkers 1`
  - `pnpm run check`
  - Live signed-in read: `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts projects --target chatgpt`
    - returned the real project list
    - did not print any `Cache identity for chatgpt...` prompt
    - did not print `Failed to update project cache...`
  - Live disposable write smoke:
    - `DISPLAY=:0.0 ... pnpm tsx bin/auracall.ts projects create --target chatgpt "AuraCall Cache Identity Probe 1774743669" --memory-mode global`
    - `DISPLAY=:0.0 ... pnpm tsx bin/auracall.ts projects remove --target chatgpt g-p-69c87098913c81918e11d312ed7077eb`
    - both completed without the old cache-identity prompt
- Follow-ups:
  - If ChatGPT changes its post-create navigation again, keep treating the canonical `g-p-...` route or refreshed sidebar project list as the only authoritative project-id source; do not regress to trusting arbitrary `/g/<segment>/project` paths.

- Date: 2026-03-28
- Area: Browser/ChatGPT canonical project-id enforcement
- Symptom: After a successful ChatGPT project create/write smoke, the selected browser tab could transiently sit on a malformed route like `/g/AuraCall%20Cache%20Identity%20Probe%201774743669/project`. Because the adapter treated any `/g/<segment>/project` route as a valid project id, that malformed path polluted `readCurrentProject(...)`, `projects --refresh`, cache entries, and name-based cleanup.
- Root cause:
  - `normalizeChatgptProjectId(...)` returned the raw trimmed value when it did not find a `g-p-...` prefix.
  - The ChatGPT route-change, route-ready, current-project, and scrape helpers all accepted those noncanonical route segments as if they were real project ids.
- Fix:
  - Tightened `normalizeChatgptProjectId(...)` in `src/browser/providers/chatgptAdapter.ts` so only canonical `g-p-...` values are treated as project ids.
  - Updated ChatGPT route-settle expressions, `readCurrentProject(...)`, and `scrapeChatgptProjects(...)` so malformed `/g/<non-g-p>/project` routes are ignored instead of becoming authoritative.
  - Added focused regression coverage in `tests/browser/chatgptAdapter.test.ts` for malformed noncanonical project routes and ids.
- Verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts tests/browser/llmServiceIdentity.test.ts --maxWorkers 1`
  - `pnpm run check`
  - Live disposable smoke:
    - `DISPLAY=:0.0 ... pnpm tsx bin/auracall.ts projects create --target chatgpt "AuraCall Canonical Route Probe 1774744698" --memory-mode global`
    - selected tab landed on `https://chatgpt.com/g/g-p-69c87496161c8191b14903d793282d9c/project`
    - `DISPLAY=:0.0 ... pnpm tsx bin/auracall.ts projects --target chatgpt --refresh` reported the canonical `g-p-69c87496161c8191b14903d793282d9c` id
    - `DISPLAY=:0.0 ... pnpm tsx bin/auracall.ts projects remove --target chatgpt "AuraCall Canonical Route Probe 1774744698"` removed the project successfully
- Follow-ups:
  - Keep canonical `g-p-...` ids as the only acceptable ChatGPT project-id contract in future adapters/cache paths, even if ChatGPT briefly renders intermediary noncanonical routes during create or redirect transitions.

- Date: 2026-03-27
- Area: Browser/Grok WSL acceptance hardening (clone rename verification + project conversation tab fallback)
- Symptom: The new scripted WSL Grok acceptance runner immediately found two last real product problems that earlier manual spot checks had not forced consistently. `projects clone <id> <new-name>` could return success while the refreshed project list still showed `(<source name> clone)` instead of the requested clone name, and right after a successful project-scoped browser prompt the first `conversations --project-id ... --refresh --include-history` could still die with `Project conversations list did not load`.
- Root cause:
  - The CLI clone flow in `bin/auracall.ts` treated the post-clone rename as best-effort. It called `renameProject(...)`, but if the rename drifted or the refreshed list never reflected the requested name, the command only logged a warning and still exited successfully.
  - Project-scoped conversation refresh still relied on an in-page Conversations tab click from the current project page state. After a browser run, Grok sometimes stayed in a project-chat surface where the tab click did not actually materialize the project conversation list, even though the project page itself was valid.
- Fix:
  - Tightened `projects clone <id> <new-name>` in `bin/auracall.ts` so it now waits for the refreshed project list to show the requested clone name for the created id and throws if the rename does not persist.
  - Updated `openConversationList(...)` in `src/browser/providers/grokAdapter.ts` so project-scoped flows can fall back to direct `https://grok.com/project/<id>?tab=conversations` navigation before declaring the conversation list unloaded.
  - While stabilizing the scripted runner, also fixed `scripts/grok-acceptance.ts` to understand the current top-level `conversations context get` payload shape and to verify that the assistant context includes the expected reply even when Grok prepends project instructions text.
- Verification:
  - `pnpm run check`
  - `DISPLAY=:0.0 pnpm tsx scripts/grok-acceptance.ts --json`
    - final green run returned:
      - `ok: true`
      - project `0c7b28e2-610a-4878-8dfa-c3d34c5a970f`
      - clone `23fb88ea-76bc-41ca-bb23-f21388299423`
      - conversation `aa3ee50d-cc65-4f9b-85a2-9473d115d727`
    - cleanup removed the disposable clone and project successfully
- Follow-ups:
  - Decide later whether project instructions text should keep appearing inline in the assistant conversation-context payload or whether that should be normalized into a distinct system/instructions surface.
  - Treat the scripted acceptance runner as the primary regression tripwire for future Grok browser changes instead of relying on isolated manual CRUD spot checks.

- Date: 2026-03-27
- Area: Browser/Grok WSL acceptance automation
- Symptom: The Grok finish-up checklist had finally gone green on the authenticated WSL profile, but the proof still lived in a manual runbook plus ad hoc shell snippets. That made the definition of done easy to drift: the next refactor could quietly skip clone-rename verification, medium-file failure handling, or project-scoped conversation cleanup simply because the human operator forgot one of the steps.
- Root cause:
  - `docs/dev/smoke-tests.md` had the right acceptance bar, but it was prose plus command fragments, not an executable harness.
  - The real CLI is mixed: some commands return JSON in non-TTY mode, while create/rename/remove/browser-run paths are still human-text oriented. Without a dedicated harness, the live acceptance bar depended on one-off shell parsing and manual project/conversation id tracking.
- Fix:
  - Added `scripts/grok-acceptance.ts`, a scripted WSL-primary acceptance runner that drives the real `auracall` CLI in non-TTY mode, parses the refreshed JSON list/context surfaces, and hard-fails on drift.
  - The runner now covers:
    - project create/rename/clone
    - instructions set/get
    - unique-file add/list/remove
    - the explicit medium-file guard (`Uploaded file(s) did not persist after save: grok-medium.jsonl`)
    - project conversation create/list/context/rename/delete
    - Markdown-preserving browser prompt capture
    - disposable project cleanup
  - Added `pnpm test:grok-acceptance` and updated `docs/dev/smoke-tests.md`, `docs/manual-tests.md`, and `docs/testing.md` so the scripted runner is the primary Grok acceptance path.
- Verification:
  - `DISPLAY=:0.0 pnpm tsx scripts/grok-acceptance.ts`
    - returned `ok: true`
    - created disposable project `430fd142-382b-4ebc-939d-f40e33b0e31b`
    - created disposable clone `2bc78431-0825-4cb9-af6c-1cf3dd59783b`
    - created/discovered disposable conversation `e7ccc288-7a26-4af1-84ab-8eea308ae806`
    - removed both disposable projects at the end
  - `pnpm run check`
- Follow-ups:
  - Keep this runner opt-in/live for now; it should not be folded into the normal fast test suite.
  - If we later need CI-style reporting, add a thin junit/json wrapper around the live runner instead of duplicating the checklist in another script.

- Date: 2026-03-27
- Area: Browser/Grok WSL acceptance finish-up (Markdown response capture + project delete)
- Symptom: The WSL Grok acceptance pass was still not complete even after project and conversation CRUD mostly worked. The final Markdown-preservation smoke returned flattened output like `alpha` plus `txtCopybeta` instead of the original bullet and fenced code block, and project cleanup still failed with `Project menu button not found` or bogus menu items like `My Projects, Shared with me, Examples` when `projects remove ...` tried to use the current Grok sidebar.
- Root cause:
  - Grok browser runs were not using the richer shared ChatGPT copy-button capture path. `src/browser/actions/grok.ts` still exposed only `waitForGrokAssistantResponse(...)`, which flattened the current Grok assistant DOM via `textContent` and therefore pulled the code-block toolbar (`txt`, `Copy`) into the captured answer.
  - `src/browser/index.ts` then hardwired `answerMarkdown = answerText` for Grok runs, so even when the page contained real structured Markdown, Aura-Call threw it away.
  - Project delete had partially moved to the current sidebar row affordance, but `openProjectMenuButton(...)` was still anchored to the old `Open menu` assumption and accepted any Radix-like collection as a “menu,” which let unrelated project-index tabs (`My Projects`, `Shared with me`, `Examples`) masquerade as a successful row-menu open.
- Fix:
  - Added `waitForGrokAssistantResult(...)` in `src/browser/actions/grok.ts` and kept `waitForGrokAssistantResponse(...)` as a plain-text wrapper for compatibility.
  - Replaced the old Grok assistant snapshot with a richer DOM serializer that:
    - targets the current `response-content-markdown` root,
    - strips sticky copy/tool UI, buttons, thinking/follow-up chrome,
    - reads code from the real `data-testid="code-block"` subtree,
    - reconstructs current Grok lists and fenced code blocks into Markdown,
    - returns separate `text`, `markdown`, and `html`.
  - Wired both local and remote Grok browser run paths in `src/browser/index.ts` to use the richer result so `answerMarkdown` preserves Grok’s Markdown instead of mirroring flattened text.
  - Updated `openProjectMenuButton(...)` / `openProjectMenuAndSelect(...)` in `src/browser/providers/grokAdapter.ts` to:
    - target the current project row in the sidebar by project id / row link,
    - hover-reveal the hidden `button[aria-label="Options"]`,
    - require a real open menu container before proceeding,
    - scope menu-item selection to that menu instead of scanning the whole page.
  - While in this acceptance slice, also fixed `projects instructions set --file ...` in `bin/auracall.ts` so merged CLI/global options are read correctly when Commander promotes `--file` into an array-valued top-level option bag.
- Verification:
  - `pnpm vitest run tests/browser/grokAdapter.test.ts tests/browser/grokActions.test.ts --maxWorkers 1`
  - `pnpm run check`
  - Live Markdown smoke on the clean clone project:
    - `DISPLAY=:0.0 pnpm tsx bin/auracall.ts --engine browser --browser-target grok --project-id a65ef98d-e67c-4dd8-b157-343d916d6f60 --model grok-4.1-thinking --prompt $'Return exactly this Markdown:\n- alpha\n```txt\nbeta\n```' --wait --force --browser-keep-browser`
    - returned the bullet plus the fenced `txt` block intact
  - Live project cleanup:
    - `DISPLAY=:0.0 pnpm tsx bin/auracall.ts projects remove a65ef98d-e67c-4dd8-b157-343d916d6f60 --target grok`
    - `DISPLAY=:0.0 pnpm tsx bin/auracall.ts projects remove f3e51b2a-1023-439a-8a67-a62134792f35 --target grok`
    - fresh `DISPLAY=:0.0 pnpm tsx bin/auracall.ts projects --target grok --refresh`
      - no longer listed either disposable project
- Follow-ups:
  - The live WSL Grok profile still tends to keep one spare `about:blank` tab and duplicate hidden `Projects - Grok` tabs after longer CRUD runs. That is separate from correctness, but it is the next tab-hygiene refinement if we keep polishing the browser path.
  - If Grok’s Markdown surface grows more complex (tables, nested lists, richer inline formatting), the current serializer may need a broader grammar than the list/code-block cases covered in this repair.

- Date: 2026-03-27
- Area: Bastion SQL cache branch merge (`cache-mirror-2026-03-27`)
- Symptom: The SQL cache/catalog/search/export work landed on a separate Bastion branch based on an older pre-rename CLI/doc surface, so merging it directly onto the live Aura-Call browser/Grok branch risked reviving stale `oracle` naming and older Grok/UI logic.
- Root cause:
  - The Bastion branch predated the `oracle-cli` -> `auracall` rename and still referenced `bin/oracle-cli.ts`, `~/.oracle`, and older env-var/docs wording.
  - Both branches touched `bin/auracall.ts`, cache export/docs, and Grok adapter instructions handling, so a blind merge would have reintroduced older behavior on active browser surfaces.
- Fix:
  - Cherry-picked the Bastion cache commit onto the current branch and resolved conflicts in favor of the newer Aura-Call browser/Grok behavior.
  - Kept the new SQL cache store/catalog/search/export surfaces, but normalized merged CLI/docs paths and command examples to `auracall`/`~/.auracall`.
  - Kept the current Grok instructions-card fallback instead of the older side-panel click fallback.
  - Harmonized cache debug logging so both `AURACALL_DEBUG_CACHE` and `ORACLE_DEBUG_CACHE` work during the migration period.
- Verification:
  - Conflict-marker sweep over the touched files returned clean.
  - Stale-name sweep over the merged CLI/docs/export surfaces returned clean for `oracle-cli`, `~/.oracle`, and `getOracleHomeDir`.
- Follow-ups:
  - Run full cache/CLI/type validation after the cherry-pick completes.
  - Clean up remaining legacy compatibility env-var naming in a separate pass instead of mixing it into the merge itself.

- Date: 2026-03-27
- Area: Browser/tab stockpile cleanup policy configurability
- Symptom: After centralizing tab reuse and conservative cleanup in browser-service, the behavior was still effectively hardcoded for every Aura-Call profile: keep 3 matching-family tabs, keep 1 blank tab, and always collapse disposable extra windows. That was good as a default but not good enough once multiple long-lived profiles were expected to coexist with different browsing habits.
- Root cause:
  - The cleanup limits lived only inside `openOrReuseChromeTarget(...)`.
  - Aura-Call’s config/schema/profile-merge path did not have fields for the cleanup policy, so profile-specific overrides were impossible even though the runtime behavior was already centralized.
  - Some runtime call sites (remote attach, manual login, Grok fallback opens) would have ignored profile-level overrides even if the config layer knew about them.
- Fix:
  - Added profile-scoped browser config fields:
    - `browser.serviceTabLimit`
    - `browser.blankTabLimit`
    - `browser.collapseDisposableWindows`
  - Threaded them through the browser-service base types, Aura-Call schema/profile merge path, resolved browser config defaults/validation, remote attach, manual login, and Grok fallback opens.
  - Kept the existing cleanup behavior as the default so current profiles do not change unless they opt in.
- Verification:
  - `pnpm vitest run tests/browser/config.test.ts tests/schema/resolver.test.ts tests/browser-service/chromeTargetReuse.test.ts tests/browser/manualLogin.test.ts tests/browser/browserLoginCore.test.ts tests/browser/browserService.test.ts --maxWorkers 1`
  - `pnpm run check`
- Follow-ups:
  - If users actually need one-off experimentation, add explicit CLI flags later. For now these are intentionally profile/config-level knobs.

- Date: 2026-03-27
- Area: Browser/Grok `projects create` verification and backend validation on WSL Chrome
- Symptom: `auracall projects create ... --target grok` could still look broken even after the sidebar/modal drift fixes. Some live runs printed a generic “could not be verified” failure, and timestamp-style disposable project names made it look like project creation itself was still unreliable.
- Root cause:
  - The create flow was still selecting a generic `grok.com` tab in a browser with many old Grok project tabs open, so create steps could start from the wrong page unless `/project` was targeted explicitly.
  - The CLI still printed success too early when the provider-backed create path failed to resolve a new `/project/<id>` URL.
  - The remaining live “failure” turned out to be a real Grok backend validation rule: names like `AuraCall Create Probe 20260327-1033` are rejected by `POST /rest/workspaces` as phone-number-like input (`WKE=form-invalid:contains-phone-number:name`).
- Fix:
  - Routed Grok create-modal entry and create-step helpers through the `/project` index instead of a broad `https://grok.com/` match.
  - Tightened the CLI contract so provider-backed `projects create` now throws when Aura-Call cannot prove a newly created project page instead of printing a false `Created project ...` line.
  - Added `/rest/workspaces` response capture in `src/browser/providers/grokAdapter.ts` so non-2xx create responses surface the real backend validation error.
- Verification:
  - `pnpm vitest run tests/browser/grokAdapter.test.ts tests/browser/browserService.test.ts --maxWorkers 1`
  - `pnpm run check`
  - Negative live case: `DISPLAY=:0.0 pnpm tsx bin/auracall.ts projects create 'AuraCall Create Probe 20260327-1033' --target grok`
    - now fails with `Create project failed: name: Value contains phone number. [WKE=form-invalid:contains-phone-number:name]`
  - Positive live case: `DISPLAY=:0.0 pnpm tsx bin/auracall.ts projects create 'AuraCall Cedar Atlas' --target grok`
    - listed successfully in `DISPLAY=:0.0 pnpm tsx bin/auracall.ts projects --target grok`
    - removed successfully with `DISPLAY=:0.0 pnpm tsx bin/auracall.ts projects remove a3418590-843c-4edb-8976-e67f91667f9b --target grok`
- Follow-ups:
  - Avoid timestamp/phone-number-like names in live Grok create smokes.
  - Grok still leaves duplicate tabs around, but after the exact `/project` targeting changes I could not reproduce the old stale-name list regression in a fresh clone/rename/remove cycle. The next live follow-up should move to conversation CRUD instead of more project-list deduping.

- Date: 2026-03-27
- Area: Browser/Grok project CRUD on WSL Chrome
- Symptom: Live Grok project CRUD against the authenticated WSL Chrome profile broke repeatedly on current Grok UI drift: project create failed with `Main sidebar did not open`, upload completion timed out even when the file row showed `50 B`, instructions get/set could not find the old `Edit instructions` affordance, and project delete still tried to reopen the main chat sidebar before using the project-header menu.
- Root cause:
  - Aura-Call was attaching to an existing Grok tab but not bringing it to the front before sidebar-dependent interactions. On a hidden tab, Grok's layout/click state diverged enough that sidebar toggles were effectively no-ops.
  - Grok no longer relies on the older hidden create action inside the `Projects` row; the current UI exposes a direct `New Project` row in the sidebar.
  - Upload completion checks were using naive substring matching for `0 B`, so `50 B` falsely matched as a zero-byte file.
  - The project page no longer exposes an `Edit instructions` button in the old place; the live editor opens from a clickable `Instructions` card in the side panel.
  - Project remove was still carrying an old assumption that the main chat sidebar had to be reopened on a project page before using the project-header menu.
- Fix:
  - Added `ensureGrokTabVisible(...)` in `src/browser/providers/grokAdapter.ts` and invoked it before main-sidebar, generic sidebar, and project-page interactions so live CRUD runs operate on a visible Grok tab.
  - Updated create-project modal opening to prefer the direct `New Project` row and only fall back to the older hover/reveal path if needed.
  - Tightened upload completion checks to use real zero-byte regex matching instead of `includes('0 b')`, so `50 B` no longer trips the zero-byte guard.
  - Updated project instructions opening to click the visible `Instructions` card when the old edit button is absent.
  - Simplified project sidebar and project-menu opening to use the current visible buttons (`Collapse side panel`, `Expand side panel`, `Open menu`) instead of stale root-scoped heuristics.
  - Removed the unnecessary `ensureMainSidebarOpen(...)` dependency from project remove confirmation on project pages.
- Verification:
  - `pnpm vitest run tests/browser/grokAdapter.test.ts --maxWorkers 1`
  - `pnpm run check`
  - Live Grok project CRUD on WSL Chrome:
    - `projects clone`
    - `projects rename`
    - `projects instructions get`
    - `projects instructions set --text ...`
    - `projects files list/add/list/remove/list`
    - `projects remove`
- Follow-ups:
  - `projects create` is no longer blocked by the original sidebar/upload bugs, but it still needs a stricter end-to-end success proof. In the live pass, disposable project CRUD continued on a cloned project because create/list/read still show drift.
  - Project list/selection still need a better strategy when Grok leaves multiple tabs open for the same project id and one tab has stale title/sidebar state.

- Date: 2026-03-27
- Area: Browser/Wizard profile naming on WSL
- Symptom: After switching the preferred WSL runtime back to the old known-good managed profile, `auracall doctor --profile wsl-chrome --local-only` still resolved `~/.auracall/browser-profiles/wsl-chrome/grok` instead of the live `~/.auracall/browser-profiles/default/grok` store, so the CLI reported an uninitialized synthetic profile even though the real WSL Chrome profile was healthy and signed in.
- Root cause:
  - This was not a generic resolver merge bug. The merged config really did carry `manualLoginProfileDir: ~/.auracall/browser-profiles/default/grok`.
  - `resolveManagedProfileDir(...)` intentionally ignores a configured managed-profile dir under the same managed root when its `<auracallProfile>/<service>` segments do not match the selected Aura-Call profile name. That guard exists to stop stale inherited `browser.manualLoginProfileDir` values from silently pointing one profile at another profile's managed store.
  - We had accidentally made the primary WSL config profile name `wsl-chrome` while still pointing it at the old `default/grok` managed store, so the safety guard correctly treated that as drift.
- Fix:
  - Rebased the primary WSL setup back onto `profiles.default` / `auracallProfile: "default"` in `~/.auracall/config.json`, keeping the long-lived managed profile at `~/.auracall/browser-profiles/default/grok`.
  - Preserved Windows as a separate named profile (`windows-chrome-test`) instead of trying to make both runtimes share one managed-profile namespace.
  - Updated `src/cli/browserWizard.ts` so WSL Chrome now suggests `default` as the profile name on WSL, matching the managed-profile layout we actually want users to keep.
- Verification:
  - `pnpm vitest run tests/cli/browserWizard.test.ts --maxWorkers 1`
  - `pnpm tsx bin/auracall.ts doctor --target grok --local-only --json`
  - `pnpm tsx bin/auracall.ts --profile windows-chrome-test doctor --target grok --local-only --json`
  - Verified the default WSL report now resolves `/home/ecochran76/.auracall/browser-profiles/default/grok` and shows the managed registry/account state instead of a synthetic `wsl-chrome/grok` path.
- Follow-ups:
  - Keep the WSL-first docs and wizard copy aligned with this rule so we do not recreate the same cross-profile mismatch during onboarding.
  - If we ever want one named Aura-Call profile to intentionally point at another managed-profile subtree, that needs an explicit opt-in concept instead of weakening the current drift guard.

- Date: 2026-03-26
- Area: Browser/Windows DevTools endpoint model
- Symptom: The product path for WSL -> Windows Chrome had already moved to auto-discovered DevTools endpoints, but parts of the code and docs still described browser automation as if a single fixed `debugPort` were the authoritative connection target. That kept the fixed-port/firewall mental model alive even after the working path no longer depended on it.
- Root cause:
  - The new Windows behavior (`--remote-debugging-port=0` + `DevToolsActivePort` + `windows-loopback`) was proven in runtime code first, but the type/config surface still treated fixed ports as the default shape.
  - `discoverWindowsChromeDevToolsPort(...)` also kept older candidate ports around without explicitly prioritizing the current recorded `DevToolsActivePort`, which made the recovery contract less obvious than it should have been.
  - User docs still described `--browser-port` as the main Windows helper and kept firewall/`portproxy` guidance too close to the happy path.
- Fix:
  - Added `debugPortStrategy` (`fixed` | `auto`) to the browser-service/browser/session config surface and threaded it through config resolution, login/manual-login flows, runtime launch, and port resolution.
  - On WSL when the configured Chrome path points at Windows Chrome, Aura-Call now defaults that strategy to `auto`; explicit `--browser-port` / `browser.debugPort` continues to imply `fixed`.
  - Updated `discoverWindowsChromeDevToolsPort(...)` to prioritize the current recorded `DevToolsActivePort` before stale requested/advertised ports.
  - Rewrote the README/browser/testing/windows/config docs so the supported Windows path is now documented as managed profile + auto port + discovered endpoint + relay, with fixed-port/firewall notes demoted to advanced manual direct-CDP debugging.
- Verification:
  - `pnpm vitest run tests/browser/config.test.ts tests/cli/browserConfig.test.ts tests/schema/resolver.test.ts tests/browser-service/chromeLifecycle.test.ts tests/browser-service/processCheck.test.ts tests/browser-service/windowsChromeDiscovery.test.ts tests/browser/browserLoginCore.test.ts`
  - `pnpm run check`
- Follow-ups:
  - If we later expose a user-facing CLI flag for the strategy, it should be positioned as an advanced override, not a normal setup step.
  - Continue auditing reporting surfaces so they describe the actual discovered endpoint as authoritative instead of treating `debugPort` as if it always reflected the live connection.

- Date: 2026-03-26
- Area: Browser profile doctor / Chrome-account persistence
- Symptom: The only reliable onboarding/auth check was provider-specific live identity probing, which forced repeated Grok logins even when the user mainly needed to know whether the managed Chrome profile still carried the browser’s signed-in Google account.
- Root cause: `auracall doctor --local-only` only inspected managed profile paths/cookies/registry state; it never read Chromium account metadata. A first pass using only `Local State` still produced false negatives on a live Windows-managed profile because Chrome had real `account_info` in `Default/Preferences` while `Local State` still had blank `gaia_*` / `user_name` fields.
- Fix: Added Chrome-level Google-account inspection in `src/browser/profileDoctor.ts` by parsing both the managed profile `Local State` (`profile.info_cache[profileName]` + `signin.active_accounts`) and `Default/Preferences` (`account_info`, `google.services.last_gaia_id`, `signin.explicit_browser_signin`). Reports now classify the managed profile as `signed-in`, `signed-out`, or `inconclusive` (copied active-account markers without a primary account identity).
- Verification:
  - `pnpm vitest run tests/browser/profileDoctor.test.ts tests/cli/browserSetup.test.ts`
  - `pnpm run check`
  - `pnpm tsx bin/auracall.ts doctor --target grok --local-only --json`
  - `pnpm tsx bin/auracall.ts --profile windows-chrome-test doctor --target grok --local-only --json`

- Date: 2026-03-26
- Area: Grok auth verification + explicit Windows managed-profile preservation
- Symptom: Aura-Call could still treat Grok as “logged in” when guest chat was available, and integrated Windows launch retries could wipe an explicitly selected managed Windows profile if DevTools did not appear on the first requested port. That made first-time Windows Chrome validation misleading and could clobber a user-managed login session during verification.
- Root cause:
  - `ensureGrokLoggedIn(...)` only relied on negative signals (`loginUrlHints`, not-found copy, and missing early CTAs). Guest-capable Grok pages could still satisfy that check before the real `Sign in` / `Sign up` UI surfaced.
  - The Windows retry callback in `src/browser/index.ts` treated all managed profiles as disposable bootstrap targets and force-reseeded them on retry, even when the profile path had been explicitly selected for persistent reuse.
- Fix:
  - Added `src/browser/providers/grokIdentity.ts` and moved Grok auth probing to a positive-signal contract: visible guest CTAs count as guest state, and authenticated runs now require a real parsed identity before `ensureGrokLoggedIn(...)` passes.
  - Hardened the Grok identity helpers against undefined CDP eval responses and updated the focused Grok auth tests.
  - Changed the Windows retry policy so explicit managed profile paths are preserved across DevTools port retries instead of being deleted/reseeded.
  - Updated local config to use Windows Chrome defaults again and pinned Grok’s managed profile to `profiles.default.services.grok.manualLoginProfileDir = "/mnt/c/Users/ecoch/AppData/Local/AuraCall/browser-profiles/windows-default-import-4/grok"`, with the Windows Aura-Call profile root as the default managed root.
- Verification:
  - `pnpm vitest run tests/browser/grokActions.test.ts tests/browser/grokIdentity.test.ts tests/browser/profileStore.test.ts tests/browser-service/chromeLifecycle.test.ts tests/browser-service/processCheck.test.ts`
  - `pnpm run check`
  - `pnpm tsx bin/auracall.ts doctor --target grok --local-only --json`
  - Direct Windows process match for the pinned profile:
    - `findChromeProcessUsingUserDataDir('/mnt/c/Users/ecoch/AppData/Local/AuraCall/browser-profiles/windows-default-import-4/grok')`
    - returned `pid 203144`, `port 45910`
  - Safe remote attach against that exact profile on `windows-loopback:45910` now blocks on verified Grok auth and reported `visible Sign in/Sign up controls still present`, which is the correct behavior for a guest-only session.
- Follow-ups:
  - The exact pinned Windows-managed Grok profile is now persistent in config, but I could not honestly confirm a signed-in Grok identity on it after the retry-policy fix. The last safe remote attach still saw guest CTAs.
  - Doctor/runtime registration still has a split-brain issue when a live `windows-loopback` session is attached through the remote path: the active port can be credited to the old WSL profile path instead of the Windows-managed path. That should be fixed separately so `auracall doctor` can probe the live Windows-managed profile without manual registry repair.

- Date: 2026-03-26
- Area: Windows Chrome Default-profile bootstrap + crash/restore modal handling
- Symptom: Fresh Windows-managed profiles seeded from a live Windows Chrome Default profile could open with Chrome’s “restore pages / didn’t shut down correctly” UI, destabilize the imported browser session, and fail follow-up auth inspection. Separate Grok identity probes against `windows-loopback:<port>` also failed early with `getaddrinfo EAI_AGAIN windows-loopback`.
- Root cause:
  - Managed-profile bootstrap preserved auth-bearing Chromium state, but it did not scrub copied crash/session markers (`profile.exit_type`, `exited_cleanly`, `Sessions`, `Current Session`, `Last Tabs`, etc.).
  - Live Windows Chromium files such as `Network/Cookies` can be locked when the source profile is open; plain `copyFile(...)`/robocopy is not enough.
  - Grok’s provider attach path still handed the literal `windows-loopback` host directly to CDP in some target-attach branches instead of routing through the browser-service endpoint resolver.
- Fix:
  - Added a Windows shared-read file-copy fallback in `src/browser/profileStore.ts` so WSL bootstrap can copy locked Chromium files through Windows PowerShell when plain file copy fails.
  - Sanitized copied managed profiles for automation by pruning volatile session artifacts and rewriting `Preferences` / `Local State` to mark clean exit state.
  - Added `--hide-crash-restore-bubble` to browser-service Chrome launch flags.
  - Routed Grok provider target attaches through `connectToChromeTarget(...)`, which resolves `windows-loopback` via the browser-service relay before opening the target.
- Verification:
  - `pnpm vitest run tests/browser/profileStore.test.ts tests/browser-service/chromeLifecycle.test.ts`
  - `pnpm vitest run tests/browser/grokIdentity.test.ts tests/browser/profileStore.test.ts`
  - `pnpm run check`
  - Fresh integrated Windows Grok run with a new managed profile:
    - `AURACALL_WSL_CHROME=windows AURACALL_BROWSER_PROFILE_DIR='/mnt/c/Users/ecoch/AppData/Local/AuraCall/browser-profiles/windows-default-import-4/grok' pnpm tsx bin/auracall.ts --engine browser --browser-target grok --browser-port 45891 --browser-keep-browser ... --wait --verbose --force`
    - completed successfully and left Chrome running on `45891`
  - Remote identity probe against that live session no longer failed with DNS resolution and returned a concrete result (`identity: null`).
- Follow-ups:
  - A stable imported Windows-managed profile still came up guest-only on Grok in the live proof. The live page showed `Sign in` / `Sign up`, so bootstrap/import stability is improved, but first-run Windows Chrome bootstrap still does not guarantee Grok auth on this machine.
  - `ensureGrokLoggedIn(...)` needs a stronger positive-signal check for setup/doctor flows; absence of an early CTA is not enough.

- Date: 2026-03-26
- Area: Integrated WSL -> Windows Chrome cleanup after successful Grok runs
- Symptom: Integrated WSL -> Windows Chrome launches were working, but successful Grok runs could still leave the managed Windows Chrome process alive afterward. The logs showed `Requested Chrome shutdown via DevTools.` immediately followed by `Skipping shutdown of reused Chrome instance.`
- Root cause:
  - The shutdown bug was not just Windows PID churn. `runBrowserMode(...)` was launching local Chrome on the generic path before delegating to `runGrokBrowserMode(...)`.
  - The Grok-specific path then launched/attached again against the same managed Windows profile, which looked like a reused/adopted instance and therefore lost kill ownership.
  - Separately, Windows Chrome can pivot from the original launcher PID to another browser PID while keeping the same DevTools port, so “current-run ownership” could not rely on PID alone during re-adoption.
- Fix:
  - Routed local Grok runs directly into `runGrokBrowserMode(...)` before the generic local Chrome launch path in `src/browser/index.ts`, so Grok no longer double-launches/reattaches through two separate runners.
  - Updated `packages/browser-service/src/chromeLifecycle.ts` so current-run ownership survives re-adoption by either PID or DevTools port, and kill-capable adopted handles keep shutdown authority instead of degrading to `Skipping shutdown of reused Chrome instance.`
  - Added focused ownership regressions in `tests/browser-service/chromeLifecycleOwnership.test.ts`.
- Verification:
  - `pnpm vitest run tests/browser-service/chromeLifecycleOwnership.test.ts tests/browser-service/chromeLifecycle.test.ts tests/browser-service/processCheck.test.ts tests/browser/config.test.ts tests/cli/browserConfig.test.ts tests/browser/profileStore.test.ts`
  - `pnpm run check`
  - Live integrated Windows Chrome proof with a fresh managed profile:
    - `AURACALL_WSL_CHROME=windows ... --prompt "Reply exactly with: windows cleanup proof 3" --wait --verbose --force`
    - returned `windows cleanup proof 3`
    - logged a single launch path (no second generic prelaunch/re-adopt cycle)
    - Windows process probe for `windows-cleanup-proof-3` returned `[]`
- Follow-ups:
  - Consider one more unit regression that asserts local Grok runs only launch once from `runBrowserMode(...)`.
  - Surface the effective elevated Windows debug port more clearly in the CLI when a low requested port is auto-raised into `45891+`.

- Date: 2026-03-26
- Area: WSL Windows-profile discovery and path normalization in browser-service
- Symptom: WSL users still had to reason about three different path forms for the same Chromium profile store (`/mnt/c/...`, `C:\...`, and `\\wsl.localhost\...`), and some paths were normalized too late. In particular, explicit `manualLoginProfileDir` / bootstrap cookie paths could be `path.resolve(...)`'d before they were translated out of UNC or Windows-drive form, and Windows-hosted Chrome/Brave profile discovery still tended to default to the first Windows profile tree instead of the browser family the user actually selected.
- Root cause:
  - WSL/Windows path conversion logic was duplicated in `src/browser/config.ts`, `packages/browser-service/src/chromeLifecycle.ts`, `packages/browser-service/src/loginHelpers.ts`, and `packages/browser-service/src/processCheck.ts`, with slightly different rules in each place.
  - Managed-profile path handling in `src/browser/profileStore.ts` trusted `path.resolve(...)` too early, which turns `\\wsl.localhost\...` into a bogus local POSIX path when called from WSL before normalization.
  - Browser profile discovery knew about Windows Chrome/Brave locations in general, but it did not prioritize the matching browser family from the configured executable hint, so a Windows Brave run could still discover Chrome state first.
- Fix:
  - Added a shared `packages/browser-service/src/platformPaths.ts` helper layer for WSL detection, Windows/WSL path translation, comparable-path normalization, Chromium family detection, and Windows `LocalAppData` inference.
  - Routed browser config, managed-profile root/directory resolution, cookie-source inference, process matching, and Chrome launch through the shared translator instead of keeping separate ad hoc conversions.
  - Updated `packages/browser-service/src/service/profileDiscovery.ts` to accept browser/user-data hints, prioritize the matching browser family (`chrome` vs `brave` vs others), and honor direct `AURACALL_WINDOWS_LOCALAPPDATA` / `AURACALL_WINDOWS_USERS_ROOT` overrides when needed.
- Verification:
  - Focused tests:
    - `pnpm vitest run tests/browser-service/platformPaths.test.ts tests/browser-service/profileDiscovery.test.ts tests/browser-service/processCheck.test.ts tests/browser-service/chromeLifecycle.test.ts tests/browser/config.test.ts tests/cli/browserConfig.test.ts tests/browser/profileStore.test.ts`
    - `pnpm run check`
  - Added regressions for:
    - WSL UNC -> Linux managed-profile normalization in `tests/browser/config.test.ts`
    - Windows drive-path managed-profile-root inference in `tests/browser/config.test.ts`
    - browser-family-aware Windows profile discovery in `tests/browser-service/profileDiscovery.test.ts`
    - shared WSL/Windows path translation in `tests/browser-service/platformPaths.test.ts`
- Follow-ups:
  - The next likely UX improvement is surfacing the auto-discovered Windows browser/profile source more explicitly in `doctor` / `setup`, so users can see when Aura-Call chose Windows Chrome vs Windows Brave without reading verbose logs.

- Date: 2026-03-25
- Area: Integrated WSL -> Windows Chrome launch with seeded Aura-Call managed profiles
- Symptom: Aura-Call could already reuse Windows Chrome through `--remote-chrome windows-loopback:<port>`, but the fully integrated WSL -> Windows launch path still failed for first-run managed profiles seeded from the Windows Chrome default profile. The run launched real Windows Chrome processes, but DevTools never came up and the browser automation bailed after trying `45877-45884`.
- Root cause:
  - WSL Windows-profile process detection was wrong. `findChromePidUsingUserDataDir(...)` returned the first `chrome.exe` PID from `tasklist.exe`, not the Chrome instance for the requested managed profile, so Aura-Call could not reliably distinguish “my managed profile is already running” from “some Chrome exists on Windows.”
  - The launch path also spent a long time proving each bad port was bad through the relay, even when Windows itself was not serving DevTools on that port.
  - Most importantly, the seeded managed Windows Chrome profile on this machine simply did not expose DevTools on the low pinned band (`45877-45884`). The working ports for manual seeded/empty probes were higher (`45891+`).
- Fix:
  - Replaced the WSL Windows-profile PID shortcut with exact Windows `chrome.exe` command-line inspection in `packages/browser-service/src/processCheck.ts`, including remote-debugging-port extraction from the matched process.
  - Updated `packages/browser-service/src/chromeLifecycle.ts` to reuse the exact matched port when a managed Windows profile is already alive, and to probe Windows-local `127.0.0.1:<port>/json/version` before waiting on the WSL relay.
  - Added a Windows WSL debug-port floor (`45891`) for integrated launches so Aura-Call no longer starts inside the known-dead low band when the user/config still pins a low port such as `45877`.
- Verification:
  - Focused tests:
    - `pnpm vitest run tests/browser-service/processCheck.test.ts tests/browser-service/chromeLifecycle.test.ts tests/browser-service/portSelection.test.ts tests/browser-service/profileState.test.ts tests/browser/config.test.ts tests/cli/browserConfig.test.ts tests/browser/profileStore.test.ts`
    - `pnpm run check`
  - Direct Windows sanity probes:
    - empty Windows profile + `--remote-debugging-port=45891` answered `http://127.0.0.1:45891/json/version`
    - selectively seeded Aura-Call managed profile + `--remote-debugging-port=45892` also answered `http://127.0.0.1:45892/json/version`
  - End-to-end live smoke from WSL with a fresh Windows Aura-Call profile:
    - `AURACALL_WSL_CHROME=windows AURACALL_BROWSER_PROFILE_DIR='/mnt/c/Users/ecoch/AppData/Local/AuraCall/browser-profiles/windows-proof-8/grok' pnpm tsx bin/auracall.ts --engine browser --browser-target grok --browser-port 45877 --browser-chrome-path '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe' --browser-cookie-path '/mnt/c/Users/ecoch/AppData/Local/Google/Chrome/User Data/Default/Network/Cookies' --browser-bootstrap-cookie-path '/mnt/c/Users/ecoch/AppData/Local/Google/Chrome/User Data/Default/Network/Cookies' --model grok --prompt 'Reply exactly with: windows chrome just works' --wait --verbose --force`
    - run elevated the requested port to `45891`, attached successfully, passed Grok login/mode selection, and returned `windows chrome just works`
- Follow-ups:
  - Successful integrated runs can still leave the Windows Chrome managed profile process alive because the launch path later re-adopts the profile instance and skips the final kill.
  - The CLI preflight banner still echoes the raw configured `debugPort` even though the runtime launch may elevate it to `45891+`; that user-facing messaging should be aligned.

- Date: 2026-03-25
- Area: WSL remote Chrome relay for Windows loopback DevTools
- Symptom: Raw WSL->Windows CDP TCP remained unreliable in the current mirrored/Tailscale setup even after firewall and `portproxy` work. Windows Chrome could expose DevTools on Windows `127.0.0.1:<port>`, but WSL still could not reliably reach any Windows-hosted TCP ingress.
- Root cause:
  - The real need for the manual remote-browser case was not “make Windows expose CDP on the network,” but “let WSL talk to a Windows-local Chrome somehow.”
  - Aura-Call’s existing `--remote-chrome` path assumed a reachable host:port and had no transport layer for “Windows loopback only.”
- Fix:
  - Added a new WSL-only `--remote-chrome windows-loopback:<port>` path in `packages/browser-service/src/windowsLoopbackRelay.ts` and `packages/browser-service/src/chromeLifecycle.ts`.
  - Aura-Call now starts a local WSL TCP relay, and each relay connection spawns a Windows PowerShell helper that opens a TCP socket to Windows Chrome on Windows `127.0.0.1:<port>` and pumps raw bytes over stdio.
  - Updated remote browser runs to use the relay’s actual local host/port for runtime hints, target cleanup, and error reporting.
- Verification:
  - Focused tests:
    - `pnpm vitest run tests/browser-service/windowsLoopbackRelay.test.ts tests/browser-service/chromeLifecycle.test.ts`
    - `pnpm run check`
  - Transport-only live probe:
    - repeated `fetch('http://127.0.0.1:<relayPort>/json/version')` succeeded through the relay to Windows Chrome `127.0.0.1:45871`
  - End-to-end live smoke:
    - `pnpm tsx bin/auracall.ts --engine browser --browser-target grok --remote-chrome windows-loopback:45871 --model grok --prompt "ping" --wait --verbose --force`
    - run succeeded and returned a real Grok answer through the Windows Chrome session
- Follow-ups:
  - Extend the same relay idea into the integrated Windows-launch/manual-login path instead of keeping it remote-mode-only.
  - Add a dedicated `browser-tools` / `scripts/test-remote-chrome.ts` path for the `windows-loopback` alias so transport verification does not require a full Aura-Call run.

- Date: 2026-03-25
- Area: WSL -> Windows Chrome DevTools bridge
- Symptom: After revisiting the old Windows-browser path, it still looked like a generic firewall/host-resolution problem, but the actual failure was narrower and more structural. Aura-Call could launch a dedicated Windows Chrome profile with `--remote-debugging-port=45871`, Windows itself could reach `192.168.50.108:45872` through an existing `v4tov4` portproxy, yet WSL still could not connect to that same `192.168.50.108:45872` endpoint.
- Root cause:
  - On this machine WSL is using mirrored networking with Tailscale, and both Windows and WSL report the same LAN IPv4 (`192.168.50.108`).
  - The existing Windows `portproxy` (`192.168.50.108:45872 -> 127.0.0.1:45871`) is valid from Windows itself, but WSL cannot use that shared IPv4 as a reliable Windows-host ingress.
  - `resolveWslHost()` is still fundamentally too weak for this case because it falls back to `/etc/resolv.conf` (here `100.100.100.100`) or other guessed IPv4s instead of a deterministic Windows-reachable address.
  - Chrome also does not solve this by itself: even with `--remote-debugging-address=0.0.0.0` or `--remote-debugging-address=::`, Windows Chrome still listened only on `127.0.0.1`.
  - There is also a product-shape gap: Aura-Call's integrated Windows launch path has only one `debugPort`, but safe `portproxy` usage needs two ports (`chromePort` on loopback, `connectPort` for WSL).
- Fix:
  - No runtime code fix landed yet.
  - Captured the working/non-working matrix explicitly and narrowed the viable next path to an elevated Windows `v6tov4` portproxy bound on a Windows IPv6 address that WSL can actually reach.
  - Documented the product gap so future work does not keep trying to force `portproxy` through a single-port launch model.
- Verification:
  - WSL negative checks:
    - `curl http://192.168.50.108:45872/json/version`
    - `curl http://127.0.0.1:45871/json/version`
  - Windows positive checks:
    - `Invoke-WebRequest http://127.0.0.1:45871/json/version`
    - `Invoke-WebRequest http://192.168.50.108:45872/json/version`
    - `netstat -ano | findstr 45871` showed Chrome listening on `127.0.0.1:45871`
    - `netstat -ano | findstr 45872` showed `portproxy` listening on `192.168.50.108:45872`
  - WSL host reachability:
    - `ping -6 fd7a:115c:a1e0::1101:b830`
    - `ping -6 fe80::7400:d6c0:9bc:780d%eth1`
  - Windows-only success, WSL-only failure on shared IPv6:
    - elevated `netsh interface portproxy add v6tov4 listenport=45874 listenaddress=fd7a:115c:a1e0::1101:b830 connectport=45871 connectaddress=127.0.0.1`
    - Windows `Invoke-WebRequest http://[fd7a:115c:a1e0::1101:b830]:45874/json/version` succeeded
    - WSL `curl -g 'http://[fd7a:115c:a1e0::1101:b830]:45874/json/version'` and `nc -vz fd7a:115c:a1e0::1101:b830 45874` still failed
  - Chrome IPv6 bind attempt still failed to expose CDP externally:
    - launched with `--remote-debugging-address=:: --remote-debugging-port=45873`
    - `netstat` still showed only `127.0.0.1:45873`
- Follow-ups:
  - Add a Windows-aware external DevTools connect port concept to Aura-Call/browser-service so launch/login can model `chromePort != connectPort`.
  - Consider replacing `resolveWslHost()` heuristics with a Windows-interrogated host candidate list plus explicit diagnostics when the chosen host equals a local WSL address or `/etc/resolv.conf` nameserver.
  - Before assuming `v6tov4` solves the problem, verify that the chosen Windows IPv6 is not also assigned inside WSL. On this machine the obvious Tailscale/link-local IPv6 addresses were shared, so the proxy still was not usable from WSL.
  - The remaining likely fixes are outside simple firewall tweaking: either a Windows-only relay/tunnel path, or a change to the WSL networking mode so Windows has a distinct ingress address.

- Date: 2026-03-25
- Area: WSL Brave runtime with Windows Brave bootstrap source
- Symptom: It was unclear whether the remaining Brave bootstrap failure was caused by using WSL Chrome as the runtime browser instead of Brave itself.
- Root cause:
  - The real blocker is not the runtime browser binary.
  - The managed profile can inherit some Brave browser state (`AF_SESSION`, `afUserId`, preferences, IndexedDB/local storage) from the copied profile data, but the actual Windows Brave `Network/Cookies` DB remains unreadable from WSL.
  - Without that cookie DB, Grok still treats the session as guest-capable and shows visible `Sign in` / `Sign up` CTAs.
- Fix:
  - No code change needed for this specific check.
  - Verified the behavior explicitly by launching Aura-Call with `/usr/bin/brave-browser` against a fresh managed profile seeded from the Windows Brave source path.
- Verification:
  - `auracall login --target grok --browser-chrome-path /usr/bin/brave-browser --browser-bootstrap-cookie-path /mnt/c/.../Brave-Browser/.../Network/Cookies`
  - Live DOM probe on the Brave-backed session at port `45001`:
    - `signIn: true`
    - `signUp: true`
    - `AF_SESSION` present in localStorage
    - `afUserId` visible in `document.cookie`
- Follow-ups:
  - Surface this mixed state explicitly in `setup` / `doctor`: some auth-related state copied, but the source cookie DB was unreadable, so the managed session is still guest-only.
  - The practical workaround is still a one-time sign-in in the Aura-Call-managed Brave profile.

- Date: 2026-03-25
- Area: Selective managed-profile bootstrap for large Windows Chromium sources
- Symptom: After adding `--browser-bootstrap-cookie-path`, alternate-source bootstrap technically worked, but large Windows Chromium profiles still made `auracall setup` / `auracall login` look stuck because the first-run clone tried to copy too much unrelated browser state. On this machine the Windows Brave profile copy also hit `EACCES` on `Network/Cookies`, which aborted the bootstrap before the user got a clear answer.
- Root cause:
  - The initial managed-profile bootstrap still behaved like a broad profile clone with a small denylist.
  - That pulled in a lot of irrelevant Chromium profile state for onboarding and spent most of its time in large storage buckets.
  - A locked Windows-side cookie DB (`/mnt/c/.../Network/Cookies`) caused the whole copy to fail even though the rest of the auth-bearing profile state was still accessible.
- Fix:
  - Replaced the broad clone with a selective Chromium auth-state subset in `src/browser/profileStore.ts`:
    - top-level browser state like `Local State`
    - profile-level auth-bearing state like `Preferences`, `Network`, `Local Storage`, `IndexedDB`, `WebStorage`, and account/web DBs
  - Added per-entry progress logging so first-run bootstrap shows where time is going.
  - Made locked/unreadable files (`EACCES`, `EPERM`) recoverable during managed-profile copy instead of fatal, so Aura-Call can still seed non-cookie browser state and continue.
- Verification:
  - `pnpm vitest run tests/browser/profileStore.test.ts tests/browser/config.test.ts tests/browser/profileDoctor.test.ts tests/cli/browserConfig.test.ts`
  - `pnpm run check`
  - Direct Brave-source bootstrap into a throwaway managed profile completed in about 8 seconds instead of stalling on a near-full-profile clone.
  - Live Brave-seeded Grok login launched from the throwaway managed profile and showed the expected guest UI (`Sign in` / `Sign up`) instead of crashing the bootstrap path.
  - Sweet Cookie probe against the Windows Brave cookie DB returned zero cookies with a warning: `Failed to copy Chrome cookie DB ... EACCES`.
- Follow-ups:
  - If `bootstrapCookiePath` points at a locked/unreadable Windows cookie DB, surface that explicitly in `setup` / `doctor` instead of making users infer it from guest-mode behavior.
  - Decide whether `browser-tools doctor` should be fixed next, since it currently hits an unrelated `__name is not defined` regression on live page probes.

- Date: 2026-03-25
- Area: Managed browser-profile bootstrap from alternate Chromium sources
- Symptom: On WSL, Aura-Call could run the browser through WSL Chrome, but it could not reliably seed the managed Aura-Call profile from a different source profile like Windows Brave. Explicit Windows cookie paths were being treated as runtime browser inputs and silently rewritten back to the discovered WSL Chrome cookie DB whenever `wslChromePreference: "wsl"` was active.
- Root cause:
  - The config layer only had one cookie-path concept: `chromeCookiePath`.
  - That field was doing double duty as both the runtime cookie source and the managed-profile bootstrap source.
  - The WSL runtime preference logic intentionally prefers discovered WSL Chrome paths over explicit Windows paths, which is correct for runtime launching but wrong for first-run managed-profile seeding from another browser.
- Fix:
  - Added a separate `bootstrapCookiePath` field through the browser-service/Aura-Call types, config schema, CLI mapping, and CLI surface.
  - Added `--browser-bootstrap-cookie-path` so setup/login/browser runs can seed the managed Aura-Call profile from a different Chromium profile without changing the runtime browser selection.
  - Updated browser bootstrap, login reseed, and doctor inspection paths to prefer `bootstrapCookiePath` before `chromeCookiePath`.
  - Kept the existing WSL runtime selection behavior for `chromeCookiePath`, so WSL Chrome remains the runtime browser when requested.
- Verification:
  - `pnpm vitest run tests/browser/config.test.ts tests/browser/profileDoctor.test.ts tests/cli/browserConfig.test.ts`
  - `pnpm run check`
  - Live Brave-source probe: `auracall setup/login` and direct `bootstrapManagedProfile(...)` recognized `/mnt/c/Users/ecoch/AppData/Local/BraveSoftware/Brave-Browser/User Data/Default/Network/Cookies` as the bootstrap source and started cloning it into a throwaway managed profile under `~/.auracall/browser-profiles/...`
- Follow-ups:
  - Large Windows Chromium profiles can take long enough to clone that setup/login looks stalled. Add progress reporting or selective-copy bootstrap if that remains a practical onboarding problem.

- Date: 2026-03-25
- Area: Aura-Call browser setup machine-readable contract
- Symptom: `auracall setup` had the right onboarding behavior, but only through human-readable output. Agent tooling could not reliably consume the before/after managed-profile state or tell whether login and verification were actually attempted, skipped, or failed.
- Root cause:
  - The new stable JSON work stopped at `auracall doctor`.
  - `setup` reused the normal interactive login/verification path, which prints progress to stdout and therefore would have corrupted any naive JSON output.
- Fix:
  - Added `createAuracallBrowserSetupContract(...)` to `src/cli/browserSetup.ts`.
  - Added `auracall setup --json` in `bin/auracall.ts`.
  - The JSON report now emits `contract: "auracall.browser-setup", version: 1`.
  - The setup contract embeds the initial/final `auracall.browser-doctor` contracts and explicit login/verification step status, including verification model/prompt/session id.
  - During JSON-mode setup, stdout is temporarily redirected to stderr for the login/verification flow so the final contract remains the only stdout payload.
- Verification:
  - `pnpm vitest run tests/cli/browserSetup.test.ts tests/browser/profileDoctor.test.ts tests/browser/browserTools.test.ts tests/browser-service/ui.test.ts tests/browser-service/stateRegistry.test.ts tests/browser/browserService.test.ts`
  - `pnpm tsx bin/auracall.ts setup --target grok --skip-login --skip-verify --json`
  - `pnpm run check`
- Follow-ups:
  - Decide whether setup should later embed richer runtime/browser-service probe data, or stay focused on orchestration state.
  - Add a CRUD-capable verification mode so setup can prove more than “guest prompt works”.

- Date: 2026-03-25
- Area: Aura-Call browser doctor machine-readable contract
- Symptom: `auracall doctor` had useful managed-profile/auth output, but only as human-readable text. Agent tooling still had to scrape CLI lines or call lower-level browser-service helpers directly.
- Root cause:
  - The stable versioned JSON contract existed in browser-service, but Aura-Call had not consumed it yet.
  - `auracall doctor` printed local/auth state and selector diagnosis directly, with no versioned host-app envelope.
  - The normal CLI intro banner would also have corrupted any naive JSON stream.
- Fix:
  - Added `createAuracallBrowserDoctorContract(...)` to `src/browser/profileDoctor.ts`.
  - Added `auracall doctor --json` in `bin/auracall.ts`.
  - The JSON report now emits `contract: "auracall.browser-doctor", version: 1`.
  - When a managed browser instance is alive, the report embeds the stable browser-service contract `browser-tools.doctor-report`.
  - The JSON path also carries selector-diagnosis success/failure separately from the browser-service report, and suppresses the normal CLI intro banner so the stream stays machine-readable.
- Verification:
  - `pnpm vitest run tests/browser/profileDoctor.test.ts tests/browser/browserTools.test.ts tests/browser-service/ui.test.ts tests/browser-service/stateRegistry.test.ts tests/browser/browserService.test.ts`
  - `pnpm tsx bin/auracall.ts doctor --target grok --local-only --json`
  - `pnpm run check`
- Follow-ups:
  - Decide whether `auracall setup` should emit the same contract family.
  - If remote/non-loopback managed DevTools hosts become common, teach the embedded browser-tools report how to connect without assuming localhost.

- Date: 2026-03-25
- Area: Stable versioned JSON contracts for browser-service doctor/probe output
- Symptom: The package-owned `doctor` and `probe` commands had useful JSON output, but it was just a raw dump of internal objects. That made it hard for agent tooling to consume the output confidently over time.
- Root cause:
  - The first doctor/probe implementation focused on capability, not contract shape.
  - There was no explicit versioned envelope separating stable top-level fields from the evolving inner report structure.
- Fix:
  - Added explicit builders in `packages/browser-service/src/browserTools.ts`:
    - `createBrowserToolsProbeContract(...)`
    - `createBrowserToolsDoctorContract(...)`
  - `probe --json` now emits `contract: "browser-tools.page-probe", version: 1`
  - `doctor --json` now emits `contract: "browser-tools.doctor-report", version: 1`
  - Added envelope-shape tests in `tests/browser/browserTools.test.ts`.
- Verification:
  - `pnpm vitest run tests/browser/browserTools.test.ts tests/browser-service/ui.test.ts tests/browser-service/stateRegistry.test.ts tests/browser/browserService.test.ts`
  - `pnpm run check`
- Follow-ups:
  - Keep the contract additive where possible.
  - Only bump the version when the top-level JSON shape or semantics actually change.

- Date: 2026-03-25
- Area: Generic cookie/storage presence probes in browser-service
- Symptom: The new package-owned `doctor` / `probe` surfaces could report selected-page DOM and script state, but they still could not answer another common browser-debug question: “does this page actually carry the cookie/storage state I expect?”
- Root cause:
  - The first probe surface stopped at DOM/script facts.
  - Agents still would have needed ad hoc `page.cookies()` or storage `eval` snippets to inspect login/session state generically.
- Fix:
  - Extended `packages/browser-service/src/browserTools.ts` so selected-page probes now include:
    - cookie count, sample cookie names, and domains
    - local/session storage counts and sample keys
    - exact-name presence checks for `--cookie-any`, `--cookie-all`, `--storage-any`, and `--storage-all`
  - Added a direct `collectBrowserToolsPageProbe(...)` test in `tests/browser/browserTools.test.ts`.
- Verification:
  - `pnpm vitest run tests/browser/browserTools.test.ts tests/browser-service/ui.test.ts tests/browser-service/stateRegistry.test.ts tests/browser/browserService.test.ts`
  - `pnpm tsx scripts/browser-tools.ts doctor --help`
  - `pnpm tsx scripts/browser-tools.ts probe --help`
  - `pnpm run check`
- Follow-ups:
  - Consider whether the generic probe layer should support prefix/substring operators later.
  - Keep provider-specific interpretation of cookie/storage names out of browser-service itself.

- Date: 2026-03-25
- Area: Package-owned browser-service doctor/report and structured probe surface
- Symptom: Even after the earlier browser-service upgrades, agents still had to choose between low-level `eval` snippets and app-specific doctor commands. There was no package-owned “tell me what this selected page looks like” surface.
- Root cause:
  - `browser-tools` had tab census and basic page utilities, but no structured selected-page report.
  - The new generic probe ideas only existed as backlog notes until there was a package-owned command surface to carry them.
- Fix:
  - Added structured page probes to `packages/browser-service/src/browserTools.ts` for document state, visible selector matches, and script-text token presence.
  - Added `browser-tools probe` for selected-page probe output.
  - Added `browser-tools doctor` to combine the tab census/selection explanation with the selected-page probes.
  - Added summary coverage in `tests/browser/browserTools.test.ts`.
- Verification:
  - `pnpm vitest run tests/browser/browserTools.test.ts tests/browser-service/ui.test.ts tests/browser-service/stateRegistry.test.ts tests/browser/browserService.test.ts`
  - `pnpm tsx scripts/browser-tools.ts doctor --help`
  - `pnpm tsx scripts/browser-tools.ts probe --help`
  - `pnpm run check`
- Follow-ups:
  - Add storage/cookie presence probes without pulling provider semantics into the package.
  - Decide whether the doctor/probe JSON shapes should be treated as a stable agent-facing contract.

- Date: 2026-03-25
- Area: Runtime tab-selection summaries for browser-service callers
- Symptom: After adding explainable target resolution, the reasoning still mostly lived in tests and the `browser-tools tabs` CLI. Runtime callers could carry the explanation object, but they still lacked a compact summary for targeted debug logs.
- Root cause:
  - The package had structured target-selection data but no small formatter for “winner plus nearest losers”.
  - Aura-Call's browser wrapper accepted a logger, but there was no generic summary string to feed into it.
- Fix:
  - Added `summarizeTabResolution(...)` to `packages/browser-service/src/service/instanceScanner.ts`.
  - Updated `src/browser/service/browserService.ts` to log the summarized target choice when `resolveServiceTarget(...)` receives a logger.
  - Added focused coverage in `tests/browser-service/stateRegistry.test.ts` and `tests/browser/browserService.test.ts`.
- Verification:
  - `pnpm vitest run tests/browser-service/ui.test.ts tests/browser-service/stateRegistry.test.ts tests/browser/browserService.test.ts tests/browser/browserTools.test.ts`
  - `pnpm run check`
- Follow-ups:
  - Decide whether a package-owned doctor/report command should consume the same summary helper.
  - Keep the summary compact; detailed tab census remains the job of `browser-tools tabs`.

- Date: 2026-03-25
- Area: Visible-selector and script-text waits in browser-service
- Symptom: After adding the first generic predicate wait, package call sites still had to choose between “selector exists” and writing another custom loop. That was too weak for click readiness and too clumsy for script-payload hydration checks.
- Root cause:
  - `waitForSelector(...)` only answered DOM presence, not visibility/clickability.
  - There was still no generic helper for “wait until bootstrap script text contains X”.
  - Selector-based click helpers such as `pressButton(...)` therefore could still claim readiness before the target was actually visible.
- Fix:
  - Added `waitForVisibleSelector(...)` and `waitForScriptText(...)` to `packages/browser-service/src/service/ui.ts`.
  - Updated `pressButton(...)` to use the visible-selector wait when `requireVisible` is enabled.
  - Expanded `tests/browser-service/ui.test.ts` to cover both new helpers and the `pressButton(...)` integration path.
- Verification:
  - `pnpm vitest run tests/browser-service/ui.test.ts tests/browser-service/stateRegistry.test.ts tests/browser/browserService.test.ts tests/browser/browserTools.test.ts`
  - `pnpm run check`
- Follow-ups:
  - Surface richer readiness results in targeted debug output instead of collapsing them back to booleans everywhere.
  - Decide whether the legacy boolean wait helpers should keep their current shape permanently or gain overloads/options later.

- Date: 2026-03-25
- Area: Generic readiness / hydration waits in browser-service
- Symptom: The package already had several wait helpers, but they each carried their own polling loop. That made new readiness checks awkward to add and kept hydration waits from sharing one consistent primitive.
- Root cause:
  - Generic waits like `waitForSelector(...)` and `waitForDialog(...)` were implemented independently.
  - There was no package-owned way to poll an arbitrary page predicate or a normalized document-ready condition.
- Fix:
  - Added `waitForPredicate(...)` and `waitForDocumentReady(...)` to `packages/browser-service/src/service/ui.ts`.
  - Rewired `waitForDialog(...)`, `waitForSelector(...)`, and `waitForNotSelector(...)` to use the shared predicate helper.
  - Added focused tests in `tests/browser-service/ui.test.ts`.
- Verification:
  - `pnpm vitest run tests/browser-service/ui.test.ts tests/browser-service/stateRegistry.test.ts tests/browser/browserService.test.ts tests/browser/browserTools.test.ts`
  - `pnpm run check`
- Follow-ups:
  - Add generic script-text / visible-selector waits on top of the same primitive.
  - Surface the richer wait result in targeted debug paths instead of collapsing everything back to booleans.

- Date: 2026-03-25
- Area: Runtime tab selection diagnostics for browser-service callers
- Symptom: The package CLI could explain tab choice after the first browser-service upgrade, but runtime callers still only got the winning tab id. That meant higher-level automation paths could still silently pick the wrong tab without exposing why.
- Root cause:
  - `instanceScanner.resolveTab(...)` returned only the winner and dropped the scoring context.
  - Aura-Call's browser wrapper consumed that winner directly, so the explainable selection model stopped at the CLI boundary.
- Fix:
  - Added `explainTabResolution(...)` to `packages/browser-service/src/service/instanceScanner.ts`.
  - Kept `resolveTab(...)` as a compatibility wrapper over the new explanation API.
  - Updated `src/browser/service/browserService.ts` to return `tabSelection` from `resolveServiceTarget(...)`, so runtime consumers can inspect candidate scores and reasons.
- Verification:
  - `pnpm vitest run tests/browser-service/stateRegistry.test.ts tests/browser/browserService.test.ts tests/browser/browserTools.test.ts`
  - `pnpm run check`
- Follow-ups:
  - Surface the same `tabSelection` explanation in targeted debug output where wrong-tab errors are common.
  - Add generic readiness/hydration probes so the next class of ambiguity is “page not ready yet,” not “wrong tab.”

- Date: 2026-03-25
- Area: Browser-service DevTools tab census and selection explanation
- Symptom: The package had enough low-level capability to inspect Chrome sessions, but not enough deterministic structure to explain which tab `browser-tools eval` / `pick` / `screenshot` would actually target. That kept turning simple “wrong tab” debugging into repeated ad hoc probes.
- Root cause:
  - `browser-tools inspect` listed Chrome processes and URLs, but it did not expose the actual tab-selection rule used by active-page commands.
  - The selection heuristic itself lived as a small opaque helper, so tests could verify the chosen index but not the reasoning or candidate facts behind it.
- Fix:
  - Added exported selection-explanation helpers in `packages/browser-service/src/browserTools.ts`.
  - Added `browser-tools tabs`, which reports the live tab census for one DevTools browser instance and includes the selected tab plus the rule that chose it.
  - Extended the page candidate shape with generic facts (`title`, `readyState`, `visibilityState`, internal/blank flags) so debugging can stay structured instead of falling back to raw `eval`.
- Verification:
  - `pnpm vitest run tests/browser/browserTools.test.ts tests/browser-service/stateRegistry.test.ts`
  - `pnpm run check`
  - `pnpm tsx scripts/browser-tools.ts tabs --help`
- Follow-ups:
  - Reuse the same selection explanation model inside `BrowserService` / `instanceScanner` so non-CLI callers can surface why a tab was chosen.
  - Add generic structured probes on top of the tab census so agents need fewer one-off DOM snippets.

- Date: 2026-03-25
- Area: Grok authenticated account detection on managed browser profiles
- Symptom: Even after the managed Grok profile was genuinely signed in, `BrowserAutomationClient.getUserIdentity()` could still return `null`. That made setup/doctor-style verification look guest-like even when the browser session clearly belonged to a real account.
- Root cause:
  - DevTools target scans were storing the CDP page id under `id`, but Aura-Call expected `targetId`, so the resolved Grok tab id could be dropped before provider identity checks reused it.
  - Grok identity fallback probes were also too eager to sample the serialized Next flight payload immediately; on live tabs the first read could happen before the payload hydrated, producing an empty script list even though the account data appeared moments later.
- Fix:
  - Normalized scanned tabs so browser-service always exposes `targetId` even when CDP returns only `id`.
  - Updated the Grok adapter to use normalized target ids in both the generic tab connector and the project-tab connector, instead of passing raw target objects back into CRI.
  - Added a short retry window when reading Grok's serialized identity scripts so authenticated tabs have time to hydrate before Aura-Call concludes there is no account payload.
- Verification:
  - `pnpm vitest run tests/browser/grokAdapter.test.ts tests/browser/grokIdentity.test.ts tests/browser/grokActions.test.ts tests/browser/browserService.test.ts tests/browser-service/stateRegistry.test.ts`
  - `pnpm run check`
  - Live: `node --import tsx -e "... BrowserAutomationClient ... getUserIdentity() ..."` now returns:
    - `id: c4d43034-7f30-462b-918b-59779bcba208`
    - `name: Eric C`
    - `handle: @SwantonDoug`
    - `email: ez86944@gmail.com`
    - `source: next-flight`
  - Live: `pnpm tsx bin/auracall.ts setup --target grok --skip-login --skip-verify --prune-browser-state` now prints `accountIdentity: Eric C @SwantonDoug <ez86944@gmail.com> [next-flight]`
- Follow-ups:
  - Consider surfacing the same identity in `auracall doctor --local-only` without violating the "do not attach to Chrome" expectation, or keep that mode intentionally metadata-only.
  - Keep using explicit tab ids for Grok browser work; raw `https://grok.com/` URL matches are too ambiguous once many root tabs accumulate in the managed profile.

- Date: 2026-03-25
- Area: Managed browser profile reseed from a newer source Chrome profile
- Symptom: Once `~/.auracall/browser-profiles/<profile>/<service>` existed, re-logging the source Chrome profile did not repair a stale/guest Aura-Call-managed service profile. `auracall login --target grok` kept reopening the old managed profile unchanged.
- Root cause:
  - The original managed-profile design only cloned from the source Chrome profile on first run.
  - Later `login` / `setup` calls always reused the managed profile directory unchanged.
  - That meant source-profile auth repairs stayed trapped in `/home/ecochran76/.config/google-chrome/...` and never propagated into Aura-Call's own managed profile store.
- Fix:
  - Extended `src/browser/profileStore.ts` with managed-profile reseed logic.
  - `auracall login` / `auracall setup` now refresh the managed profile automatically when the configured source cookie DB is newer than the managed cookie DB.
  - Added `--force-reseed-managed-profile` for a destructive rebuild regardless of timestamps.
  - Added safety checks so reseed refuses to overwrite an actively running managed profile.
  - `auracall doctor --local-only` now warns when the source Chrome cookies are newer than the managed profile.
- Verification:
  - `pnpm vitest run tests/browser/profileStore.test.ts tests/browser/profileDoctor.test.ts tests/cli/browserSetup.test.ts`
  - `pnpm run check`
  - Live: closed the stale managed Grok browser, ran `pnpm tsx bin/auracall.ts login --target grok`, observed `[login] Refreshed managed profile from /home/ecochran76/.config/google-chrome (Default).`
  - Live DOM after reseed no longer showed visible `Sign in` / `Sign up` CTAs on `https://grok.com/`
  - Managed cookie DB timestamp advanced to match the refreshed profile state
- Follow-ups:
  - Improve positive account-name detection for authenticated Grok sessions so doctor/setup can report the actual account instead of only auth-state heuristics.
  - Fix the separate Grok sidebar/history automation flake (`Main sidebar did not open`) so authenticated provider-path checks are as reliable as the DOM/auth checks.

- Date: 2026-03-25
- Area: Managed Grok profile reseed expectations
- Symptom: Re-logging the WSL source Chrome `Default` profile did not make Aura-Call's existing managed Grok profile logged in again.
- Root cause:
  - Aura-Call now treats `~/.auracall/browser-profiles/<profile>/<service>` as the long-lived execution profile.
  - Once the managed Grok profile already exists, `auracall login --target grok` reuses that managed directory; it does not re-clone or re-sync auth state from the source profile automatically.
  - So changes to `/home/ecochran76/.config/google-chrome/Default` do not repair an already-existing managed Grok profile unless Aura-Call gets an explicit reseed/sync path.
- Fix:
  - No code fix landed in this step.
  - Confirmed the current behavior so onboarding docs and future sync tooling can reflect it accurately.
- Verification:
  - `pnpm tsx bin/auracall.ts doctor --target grok --prune-browser-state`
  - `pnpm tsx bin/auracall.ts login --target grok`
  - Live managed session on `127.0.0.1:45000` showed visible `Sign in` / `Sign up` CTAs
  - Live `BrowserAutomationClient.getUserIdentity()` returned `null`
- Follow-ups:
  - Add an explicit managed-profile reseed/sync command or destructive rebootstrap flow.
  - Be clear in onboarding docs that source-profile re-login alone does not refresh an already-created managed service profile.

- Date: 2026-03-25
- Area: Grok guest session vs identity detection
- Symptom: On the current Grok web UI, Aura-Call could treat a guest-capable conversation page as if it represented a signed-in user and return `Settings` as the account identity.
- Root cause:
  - After fixing `browser-tools` URL scoping, the real Grok conversation tab still showed visible `Sign in` / `Sign up` CTAs.
  - The prior identity path in `src/browser/providers/grokAdapter.ts` treated the generic top-right settings button as a fallback user label.
  - The earlier `afUserId` / `AF_SESSION` signals were not actual account identity; they look like analytics/session state.
- Fix:
  - Updated `getUserIdentity()` to detect visible guest auth CTAs, suppress low-signal labels like `Settings`, and return `null` for guest-like pages instead of fabricating a user.
  - Tightened `ensureGrokLoggedIn()` to key off visible auth CTAs rather than any matching text anywhere in the DOM.
  - Added focused regressions in `tests/browser/grokActions.test.ts` and `tests/browser/grokIdentity.test.ts`.
- Verification:
  - `pnpm vitest run tests/browser/grokActions.test.ts tests/browser/grokIdentity.test.ts`
  - Live `BrowserAutomationClient.getUserIdentity()` against the managed Grok tab should now return `null` instead of `Settings`.
- Follow-ups:
  - Find a durable positive auth signal for real signed-in Grok sessions so Aura-Call can distinguish guest chat capability from authenticated CRUD capability.
  - Update onboarding/doctor output once the positive signal is known, so Grok setup stops looking “good enough” when it is only guest-capable.

- Date: 2026-03-25
- Area: Browser-tools URL-scoped tab selection
- Symptom: `browser-tools eval --url-contains ...` could still inspect the wrong tab when a different page had focus. In the live Grok identity investigation, a focused `accounts.x.ai` tab could win over the explicitly requested Grok conversation tab, producing misleading DOM results.
- Root cause:
  - `packages/browser-service/src/browserTools.ts` selected the focused page before honoring `urlContains`.
  - That made explicit URL scoping advisory instead of authoritative.
- Fix:
  - Changed tab selection so an explicit `urlContains` match wins first.
  - Added `selectBrowserToolsPageIndex` and a focused regression test in `tests/browser/browserTools.test.ts`.
- Verification:
  - `pnpm vitest run tests/browser/browserTools.test.ts`
  - `pnpm tsx scripts/browser-tools.ts eval --port 45000 --url-contains '/c/' ...`
- Follow-ups:
  - Keep explicit tab targeting authoritative in other browser-debug helpers too; focused-tab fallback should only apply when the caller did not request a specific URL.

- Date: 2026-03-25
- Area: Browser-service tooling ownership
- Symptom: The `browser-tools` DevTools helper was still implemented as an Aura-Call app script even though its commands (`eval`, `pick`, `cookies`, `inspect`, `kill`, `nav`, `screenshot`, `start`) are generic browser-service functionality.
- Root cause:
  - The tool grew in `scripts/browser-tools.ts` before the browser-service split hardened.
  - That left package-owned browser automation relying on an app-owned CLI implementation, which was the wrong dependency direction.
- Fix:
  - Moved the reusable CLI implementation into `packages/browser-service/src/browserTools.ts`.
  - Exported it from `packages/browser-service/src/index.ts`.
  - Reduced `scripts/browser-tools.ts` to a thin Aura-Call wrapper that only supplies config-driven port resolution, launch defaults, and optional profile copying.
  - Updated `docs/dev/browser-service-tools.md` to document the new ownership split.
- Verification:
  - `pnpm tsx scripts/browser-tools.ts --help`
  - `node --import tsx -e "import { createBrowserToolsProgram } from './packages/browser-service/src/browserTools.ts'; const program = createBrowserToolsProgram({ resolvePortOrLaunch: async () => 9222 }); console.log(program.commands.map((cmd) => cmd.name()).join(','));"`
  - `pnpm run check`
- Follow-ups:
  - If other generic browser debug helpers still live under `scripts/`, move them into `packages/browser-service` or make their app-specific coupling explicit.

- Date: 2026-03-25
- Area: Grok browser auth confirmation vs account identity detection
- Symptom: A live Aura-Call-managed Grok profile could be clearly operational and authenticated, but account-name confirmation still failed. The managed browser session could answer prompts successfully and exposed authenticated state markers, while Aura-Call's identity lookup returned only `Settings`.
- Root cause:
  - The current Grok conversation UI still exposes enough auth state to run chats (`afUserId` cookie, `AF_SESSION` localStorage, successful authenticated conversation runs), but it no longer exposes a stable human-readable account affordance through the older DOM path Aura-Call expects.
  - `src/browser/providers/grokAdapter.ts` falls back to low-signal DOM labels and an older settings-menu path; against the current layout, that can resolve to the generic settings button instead of an account/profile control.
  - `accounts.x.ai` is a separate sign-in surface and did not inherit the live Grok session in the managed profile, so it is not a reliable account-name fallback.
- Fix:
  - No code fix landed yet in this step.
  - Confirmed that auth-state verification and account-identity extraction need to be treated as separate problems in the Grok browser path.
- Verification:
  - `pnpm tsx bin/auracall.ts doctor --target grok --local-only`
  - `node --import tsx` invoking `BrowserAutomationClient.fromConfig(...).getUserIdentity(...)` against `127.0.0.1:45000`
  - `pnpm tsx scripts/browser-tools.ts eval --port 45000 --url-contains grok.com ...`
  - Confirmed:
    - live managed instance: `/home/ecochran76/.auracall/browser-profiles/default/grok`
    - authenticated session markers: `afUserId` cookie and `AF_SESSION` localStorage
    - live Grok conversation still answers prompts
    - identity lookup currently returns `Settings`
    - `https://accounts.x.ai/` redirects to `sign-in`
- Follow-ups:
  - Update Grok identity detection to use a current, durable source for account naming instead of the older settings-menu DOM fallback.
  - Avoid treating stray `Sign in` / `Sign up` text on Grok pages as an auth failure signal; it is present in the current live conversation UI even when the session is authenticated.

- Date: 2026-03-25
- Area: Grok browser assistant response extraction
- Symptom: Managed-profile Grok runs and `auracall setup --target grok` could complete successfully but still return UI-adjacent text in the final answer, for example `live dom marker15.8sExplore DOM Mutation ObserversRelated Virtual DOM Concepts`.
- Root cause:
  - `src/browser/actions/grok.ts` captured the last Grok assistant wrapper via raw `textContent`.
  - The current Grok DOM places the real markdown answer, the `.action-buttons` row (elapsed-time chip), and follow-up suggestion buttons inside that same wrapper.
  - Because the snapshot logic treated the whole wrapper as answer text, the timing chip and suggested follow-ups leaked into `answerText`.
- Fix:
  - Updated Grok snapshot extraction to prefer the `.response-content-markdown` root when present.
  - Kept a fallback clone/prune path for non-markdown variants, but now strip `.thinking-container`, `.action-buttons`, suggestion markers, and button-only UI before reading `textContent`.
  - Added focused coverage in `tests/browser/grokActions.test.ts`.
- Verification:
  - `pnpm vitest run tests/browser/grokActions.test.ts tests/browser/grokModelMenu.test.ts tests/cli/browserConfig.test.ts`
  - `pnpm run check`
  - Live verification: `pnpm tsx bin/auracall.ts setup --target grok --skip-login --verify-prompt "Reply exactly with: live dom marker" --prune-browser-state`
  - The live answer now returns only `live dom marker`.
- Follow-ups:
  - If Grok introduces a non-markdown assistant renderer, keep the clone/prune fallback aligned with the new DOM rather than going back to whole-wrapper `textContent`.

- Date: 2026-03-25
- Area: Browser doctor / setup legacy-profile classification
- Symptom: `auracall doctor` / `auracall setup` could report a live Aura-Call-managed profile under `~/.auracall/browser-profiles/...` as both `managed` and `legacy`, which was misleading and made the new onboarding output look broken even when the profile path was correct.
- Root cause:
  - Legacy detection used substring matching on `browser-profile`.
  - The new managed profile root `browser-profiles` contains that prefix, so the detector falsely matched the new path family.
- Fix:
  - Changed legacy detection to match the old single-profile directory by exact path segment (`.auracall/browser-profile`) and to keep temp-profile detection separate via the basename `auracall-browser-*`.
  - Added a regression in `tests/browser/profileDoctor.test.ts`.
- Verification:
  - `pnpm vitest run tests/browser/profileDoctor.test.ts`
  - `pnpm tsx bin/auracall.ts setup --target grok --skip-login --skip-verify --prune-browser-state`
  - The real managed profile now reports `legacyBrowserStateEntries: 0`.
- Follow-ups:
  - None for the managed-profile path family; future legacy detection changes should use path segments instead of substring matching.

- Date: 2026-03-25
- Area: Browser onboarding / managed-profile guided setup
- Symptom: Even after adding managed profiles and local doctor inspection, first-time browser onboarding was still too manual: users had to inspect profile state separately, run `auracall login`, reason about which profile path was actually in use, and then remember to run a separate smoke to prove the managed profile worked.
- Root cause:
  - The CLI had a login command and a doctor command, but no orchestration layer that tied them together around the managed profile store.
  - Browser target/model selection for onboarding was implicit and could drift when the configured default model belonged to a different service than the requested setup target.
  - There was no user-facing pause point between opening the managed login browser and launching a real verification run.
- Fix:
  - Added `src/cli/browserSetup.ts` with explicit browser setup target resolution and service-aligned verification model selection.
  - Added `auracall setup --target <chatgpt|gemini|grok>` to inspect the managed profile, optionally open the managed login browser, wait for sign-in confirmation, and then run a real browser verification session against that same managed profile.
  - Reused the existing managed-profile doctor report in `setup`, so the command now prints the resolved Aura-Call profile dir, source profile, and browser-state registry before and after verification.
  - Refactored `auracall login` to share the same managed-profile launch resolution as `setup`.
- Verification:
  - `pnpm vitest run tests/cli/browserSetup.test.ts tests/cli/browserConfig.test.ts tests/browser/profileDoctor.test.ts`
  - `pnpm run check`
  - `pnpm tsx bin/auracall.ts setup --help`
  - `pnpm tsx bin/auracall.ts setup --target grok --skip-login --verify-prompt ping --prune-browser-state`
  - Live verification returned a real Grok response from the managed profile at `~/.auracall/browser-profiles/default/grok`.
- Follow-ups:
  - Extend the same guided flow with clearer Windows DevTools diagnostics once the Windows-hosted Chrome path is revisited.

- Date: 2026-03-25
- Area: Browser doctor / managed-profile inspection / browser-state hygiene
- Symptom: After the managed-profile work landed, there was still no direct CLI surface to answer the practical onboarding questions: which Aura-Call-managed profile is being used, which source Chrome profile will bootstrap it, and whether `~/.auracall/browser-state.json` still contained stale legacy entries from older bring-up attempts.
- Root cause:
  - The existing `auracall doctor` command only attached to live Chrome and checked UI selectors.
  - Managed-profile resolution, source-profile inference, and browser-state cleanup were spread across lower-level helpers with no user-facing inspection command.
  - Source-profile inference also missed the common Linux cookie path shape `.../Default/Cookies`, so doctor-style reporting could not name the real source profile even when the cookie file was configured correctly.
- Fix:
  - Added `src/browser/profileDoctor.ts` to inspect managed profile resolution, bootstrap/source-cookie inputs, and browser-state entries without attaching to Chrome.
  - Extended `auracall doctor` with `--local-only` and `--prune-browser-state`.
  - Added stale/legacy browser-state classification plus dead-entry pruning.
  - Fixed cookie-path profile inference for direct `.../Default/Cookies` paths.
  - Added focused coverage in `tests/browser/profileDoctor.test.ts` and expanded `tests/browser/profileStore.test.ts`.
- Verification:
  - `pnpm vitest run tests/browser/profileStore.test.ts tests/browser/profileDoctor.test.ts tests/browser/grokActions.test.ts tests/browser/grokModelMenu.test.ts tests/cli/browserConfig.test.ts`
  - `pnpm tsx bin/auracall.ts doctor --target grok --local-only --prune-browser-state`
  - Output now reports:
    - managed profile: `~/.auracall/browser-profiles/default/grok`
    - source profile: `/home/ecochran76/.config/google-chrome (Default)`
    - pruned stale browser-state entries when present
- Follow-ups:
  - Add a guided `setup` command that builds on this local inspection instead of making users piece together login/bootstrap steps manually.

- Date: 2026-03-25
- Area: Grok browser composer detection with managed-profile reuse
- Symptom: After switching Aura-Call to managed browser profiles, live Grok runs could still fail with `Grok prompt not ready before timeout`, or they could fill a hidden textarea while the visible submit button stayed disabled.
- Root cause:
  - The current Grok homepage exposes a hidden autosize `<textarea>` plus a visible Tiptap/contenteditable composer.
  - The first selector pass for the new UI matched the hidden textarea before the real editor, so readiness checks and prompt entry targeted the wrong node.
  - That made the composer look ready but left Grok's form state unchanged, so the submit button never enabled.
- Fix:
  - Tightened `src/browser/providers/grok.ts` so textarea selectors only match the explicit visible Grok composer variants.
  - Added visible-editor resolution in `src/browser/actions/grok.ts` that skips `aria-hidden`, hidden, disabled, and zero-size nodes before selecting an input target.
  - Kept the textarea/input setter + `input`/`change` event path for future Grok UI variants while preserving the contenteditable path for the current Tiptap editor.
  - Added focused coverage in `tests/browser/grokActions.test.ts`.
- Verification:
  - `pnpm vitest run tests/browser/grokActions.test.ts tests/browser/grokModelMenu.test.ts tests/cli/browserConfig.test.ts`
  - `pnpm run check`
  - Live managed-profile Grok smoke passed:
    `pnpm tsx bin/auracall.ts --engine browser --browser-target grok --model grok --prompt "ping" --wait --verbose --force`
  - Result came from the reused managed profile at `~/.auracall/browser-profiles/default/grok`.
- Follow-ups:
  - Clean stale entries in `~/.auracall/browser-state.json` so live diagnostics do not keep mixing legacy profile paths/hosts with the managed store.
  - Add guided onboarding/inspection commands so users can see which managed profile Aura-Call is bootstrapping/reusing without inspecting logs manually.

- Date: 2026-03-19
- Area: Browser profile persistence and first-run onboarding
- Symptom: Local WSL/browser runs could still launch throwaway `/tmp/auracall-browser-*` profiles, while login/manual-login flows and some service helpers still assumed a single legacy `~/.auracall/browser-profile` path. That made onboarding brittle, broke repeatability, and left Aura-Call without its own deterministic browser profile store.
- Root cause:
  - Local ChatGPT/Grok browser runs still created disposable Chrome user-data dirs and only copied cookies forward.
  - Grok login/browser paths had special-case cookie-source logic that could ignore the intended source profile and seed from the wrong directory.
  - Default/manual-login path selection was split across multiple layers (`config`, browser runtime, reattach, service resolution, remote serve), with stale fallbacks to the old single-profile path.
- Fix:
  - Added `src/browser/profileStore.ts` and switched Aura-Call to managed profiles under `~/.auracall/browser-profiles/<auracallProfile>/<service>` by default.
  - Local runs, reattach, login, browser-service resolution, and `serve` now all target persistent managed profiles instead of `/tmp` automation dirs.
  - Added first-run bootstrap that clones the configured source Chrome profile into the managed profile store, skipping lock files and cache-only artifacts, and kept cookie sync as a fallback when a managed profile still needs seeding.
  - Changed `auracall login` to open the managed Aura-Call profile directly (`preferCookieProfile: false`) so source profiles are bootstrap inputs, not long-term execution targets.
- Verification:
  - `pnpm vitest run tests/browser/config.test.ts tests/browser/profileStore.test.ts tests/browser-service/chromeLifecycle.test.ts tests/browser/browserService.test.ts tests/cli/browserConfig.test.ts`
  - `pnpm run check`
- Follow-ups:
  - Validate the new managed-profile bootstrap live against real WSL and Windows source profiles for Grok/ChatGPT.
  - Replace the remaining onboarding rough edges with explicit `doctor/setup` tooling so users do not need to reason about profile roots and cookie sources manually.

- Date: 2026-03-18
- Area: WSL Chrome fallback selection + local launch
- Symptom: On WSL, Aura-Call could keep honoring persisted Windows Chrome paths even when WSL Chrome was explicitly requested, and local WSL Chrome launches could still stall because they used Windows-only temp/profile and DevTools host assumptions.
- Root cause:
  - `resolveBrowserConfig` let config win over `AURACALL_WSL_CHROME` / `AURACALL_BROWSER_PROFILE_DIR`, and it always preferred configured `chromePath` / `chromeCookiePath` over the WSL-discovered profile.
  - `auracall login` consumed raw `userConfig.browser.*` values instead of the resolved browser config, so `--browser-wsl-chrome wsl` could still inherit Windows Chrome.
  - WSL launches always used Windows-backed temp roots and the WSL-to-Windows DevTools host resolver, even when the selected browser was Linux Chrome.
- Fix:
  - Flipped env override precedence for `AURACALL_WSL_CHROME` and `AURACALL_BROWSER_PROFILE_DIR`.
  - When WSL Chrome is explicitly preferred, resolve browser/cookie paths from the WSL-discovered profile instead of persisting Windows paths through to runtime.
  - Updated `auracall login` and the main browser-config builder to carry the resolved WSL preference forward.
  - Limited Windows host routing to Windows-hosted Chrome only; WSL Chrome now uses local `127.0.0.1` CDP.
- Verification:
  - `pnpm vitest run tests/browser/config.test.ts tests/browser-service/chromeLifecycle.test.ts tests/browser/browserService.test.ts tests/cli/browserConfig.test.ts`
  - `pnpm run check`
  - Live check at the time: `AURACALL_WSL_CHROME=wsl pnpm tsx bin/auracall.ts --engine browser --browser-target grok --model grok --prompt "ping" --wait --verbose --force` launched `/usr/bin/google-chrome`, connected to local DevTools, passed Grok login, and then failed later at prompt readiness rather than setup/attach. The disposable-profile portion of that path was removed on 2026-03-19.
- Follow-ups:
  - Pre-run/session config logging still captures the pre-resolved Windows snapshot even when runtime resolves to WSL Chrome.
  - Investigate the residual Grok prompt-readiness timeout and the stray `undefined:/Users/undefined/...` log line separately.

- Date: 2026-03-18
- Area: Grok browser model picker labels
- Symptom: Grok browser runs got stuck with the model menu open because Aura-Call still targeted the dead `Grok 4.1 Thinking` label while the live UI had moved to `Auto`, `Fast`, `Expert`, and `Heavy`.
- Root cause: Grok browser mode still hard-coded label resolution in `browserConfig`/`selectGrokMode`, so the selector drifted as soon as xAI renamed the picker entries.
- Fix:
  - Moved Grok browser label/alias resolution into `configs/auracall.services.json` via the service registry.
  - Kept only DOM text normalization in the Grok browser code so concatenated live menu text like `ExpertThinks hard - Grok 4.20` still matches the configured label.
  - Updated browser config, runtime selection, and project-instructions modal selection to resolve labels through the same registry.
- Verification:
  - `pnpm vitest run tests/browser/grokModelMenu.test.ts tests/cli/browserConfig.test.ts`
  - `pnpm run check`
- Follow-ups:
  - The higher-level CLI model canonicalization still collapses `grok` to `grok-4.1`; if Aura-Call should treat plain `grok` as the current flagship browser mode, that mapping should move into the same registry layer.

- Date: 2026-03-18
- Area: Prompt commit detection during browser submit / reattach
- Symptom: Prompt submission could be marked committed too early when the composer cleared and a stop button appeared without a new turn, while the “unknown baseline” path for prompt matching was also less robust than upstream.
- Root cause: Local `verifyPromptCommitted` had drifted from upstream’s hardened logic: it no longer re-read the turn baseline when absent, and its fallback commit condition allowed `composerCleared + stopVisible` without requiring a new turn.
- Fix:
  - Restored baseline turn-count fallback inside `verifyPromptCommitted`.
  - Tightened fallback commit detection so composer-cleared signals only count after a new turn appears.
  - Added the upstream-style `tests/browser/promptComposer.test.ts` coverage and exported the internal helper through a test-only surface.
- Verification:
  - `./node_modules/.bin/vitest run tests/browser/promptComposer.test.ts tests/browser/browserModeExports.test.ts tests/browser/pageActions.test.ts tests/cli/sessionRunner.test.ts`
  - `pnpm run check`

- Date: 2026-03-18
- Area: Browser Cloudflare challenge preservation (ChatGPT/Grok)
- Symptom: When ChatGPT or Grok hit a Cloudflare interstitial, Oracle could tear down the browser/profile on exit, even though the correct recovery path is to leave the browser open so the user can complete the challenge manually.
- Root cause: `ensureNotBlocked` threw a plain error instead of a structured browser-automation error, so browser cleanup had no way to distinguish Cloudflare challenges from ordinary failures. Session error updates also dropped runtime metadata for non-connection browser failures.
- Fix:
  - Changed `ensureNotBlocked` to throw `BrowserAutomationError` with `stage: cloudflare-challenge`.
  - Ported upstream-style preserve-on-cloudflare behavior into the ChatGPT run path and applied the same behavior to the Grok path: leave Chrome/profile alive, emit runtime hints, and surface a reuse-profile hint.
  - Preserved browser runtime metadata in session error updates for browser automation failures that include runtime details.
- Verification:
  - `./node_modules/.bin/vitest run tests/browser/pageActions.test.ts tests/browser/browserModeExports.test.ts tests/cli/sessionRunner.test.ts`
  - `pnpm run check`

- Date: 2026-03-18
- Area: ChatGPT browser assistant response watchdog
- Symptom: Browser runs could finalize long streamed answers too early after a short pause, and the watchdog poller could continue running after the observer path had already won.
- Root cause: `pollAssistantCompletion` used shorter stability thresholds for long answers than upstream’s later fixes, and the background poller was not aborted once `Runtime.evaluate(...awaitPromise)` returned first.
- Fix:
  - Ported the upstream watchdog abort pattern so the poller stops once the observer path wins.
  - Ported the longer stability thresholds for medium/long answers so paused streams are less likely to truncate.
  - Added a focused threshold unit test to lock the long-answer timing behavior.
- Verification:
  - `./node_modules/.bin/vitest run tests/browser/pageActions.test.ts tests/browser/pageActionsExpressions.test.ts`
  - `pnpm run check`
- Date: 2026-02-24
- Area: Cache default posture for account mirroring
- Symptom: Default cache behavior was conservative (`historyLimit=200`, no project-only refresh insertion, cleanup default 30 days), which under-captured larger accounts unless users manually passed flags each run.
- Root cause:
  - CLI fallback constants and docs were tuned for lightweight refreshes, not mirror-depth ingestion.
  - `cache --refresh` defaulted `includeProjectOnlyConversations` to false even when profile cache defaults should have been authoritative.
- Fix:
  - Promoted mirror-first defaults in CLI/runtime:
    - history depth default -> `2000`
    - cleanup default window -> `365` days
  - Added profile cache keys and propagation:
    - `includeProjectOnlyConversations`
    - `cleanupDays`
  - Updated `cache --refresh` option fallback to read `profiles.<name>.cache.includeProjectOnlyConversations`.
  - Aligned internal history fallback limits (llmService + Grok history reader) with the new default depth.
- Verification:
  - `pnpm run -s check`
  - `pnpm tsx bin/oracle-cli.ts cache --provider grok --refresh`
  - `pnpm tsx bin/oracle-cli.ts cache cleanup --provider grok --json`
- Follow-ups:
  - Add explicit smoke coverage for profile-driven `cleanupDays` and `includeProjectOnlyConversations` precedence over CLI defaults.

- Date: 2026-02-23
- Area: Cache maintenance contention (`cache doctor|repair|clear|compact|cleanup`)
- Symptom: SQLite maintenance operations could intermittently fail with `database is locked` under concurrent activity.
- Root cause:
  - Per-identity lock files serialized Oracle maintenance commands, but external SQLite access (or lock races across processes) could still surface transient `SQLITE_BUSY`.
- Fix:
  - Added exponential busy-retry wrapper for SQLite maintenance calls.
  - Applied retry handling to maintenance-critical SQL operations in doctor/repair/clear/compact/cleanup paths.
- Verification:
  - `pnpm run -s check`
  - `pnpm tsx bin/oracle-cli.ts cache doctor --provider grok --json`
  - `pnpm tsx bin/oracle-cli.ts cache compact --provider grok --identity-key <key> --json`
  - `pnpm tsx bin/oracle-cli.ts cache repair --provider grok --identity-key <key> --actions all --json`
- Follow-ups:
  - Add optional telemetry counters for retry attempts to identify hotspots.

- Date: 2026-02-23
- Area: Cache parity diagnostics and targeted repair actions
- Symptom: Drift between `cache_entries`, `cache-index.json`, and catalog tables could remain silent until exports/search results looked inconsistent.
- Root cause:
  - Doctor checks focused on sqlite health + missing local files but lacked cross-store parity checks.
  - Repair actions lacked catalog-level parity pruning for orphan source/file rows.
- Fix:
  - Extended `cache doctor` with parity metrics:
    - index keys missing in SQL
    - SQL keys missing in index
    - orphan `source_links`
    - orphan `file_bindings`
  - Added repair actions:
    - `prune-orphan-source-links`
    - `prune-orphan-file-bindings`
- Verification:
  - `pnpm run -s check`
  - `pnpm tsx bin/oracle-cli.ts cache doctor --provider grok --json`
  - `pnpm tsx bin/oracle-cli.ts cache repair --provider grok --identity-key <key> --actions prune-orphan-source-links --json`
  - `pnpm tsx bin/oracle-cli.ts cache repair --provider grok --identity-key <key> --actions prune-orphan-file-bindings --json`
- Follow-ups:
  - Add migration-marker parity checks (`schema_migrations`/`meta`) and optional auto-repair guidance.

- Date: 2026-02-23
- Area: WS4 file lifecycle bootstrap (deterministic local blob staging)
- Symptom: Local file pointers could remain host-specific/external and lacked deterministic cache-local placement for retention workflows.
- Root cause:
  - File asset sync stored raw local path pointers when available; no canonical cache blob path existed.
- Fix:
  - Added deterministic blob staging in SQL cache store:
    - local files are copied to `blobs/<sha256>/<filename>` when available,
    - `file_assets.storage_relpath` and metadata pointers are updated to cache-local paths.
  - Added detached stale blob pruning during `cache cleanup` (`blobFilesPruned`), guarded by SQL references.
- Verification:
  - `pnpm run -s check`
  - `pnpm tsx bin/oracle-cli.ts cache cleanup --provider grok --identity-key <key> --days 30 --json`
- Follow-ups:
  - Add explicit `maxBytes`/`maxAgeDays` retention policy controls and pinned-asset protection.

- Date: 2026-02-23
- Area: Cache refresh project conversation hydration mode (`cache --refresh`)
- Symptom: Operators needed two distinct behaviors:
  - conservative refresh that only enriches already-known global conversations with `projectId`
  - full project hydration that can include project-only conversation IDs
- Root cause:
  - The previous refresh path had only the conservative behavior, so project-only IDs discovered in scoped lists were intentionally dropped.
- Fix:
  - Added `oracle cache --refresh --include-project-only-conversations`.
  - Kept default behavior unchanged (existing-ID enrichment only).
  - When the flag is set, refresh now inserts scoped-only conversation IDs from project conversation lists, setting `projectId` at insertion time.
- Verification:
  - `pnpm run -s check`
  - `pnpm tsx bin/oracle-cli.ts cache --provider grok --refresh --include-history --history-limit 200`
  - `pnpm tsx bin/oracle-cli.ts cache --provider grok --refresh --include-history --history-limit 200 --include-project-only-conversations`
  - Compare conversation totals and `projectId`-linked counts between runs.
- Follow-ups:
  - Add an automated smoke script to assert conservative vs opt-in behavior against a fixed fixture identity.

- Date: 2026-02-23
- Area: Cache refresh project-link enrichment (`cache --refresh`)
- Symptom: Project-scoped exports/search could miss project linkage because many cached conversations had no `projectId` even though those conversations appeared under project views in Grok.
- Root cause:
  - Refresh wrote only the global conversation snapshot.
  - Project association data from `listConversations(projectId)` was not merged.
  - Refresh wrote JSON directly, which could diverge from SQL-backed reads in dual/sqlite modes.
- Fix:
  - During `refreshProviderCache`, fetch each project’s scoped conversation list and backfill `projectId`/project URL only for IDs already present in the global conversation set.
  - Keep behavior conservative: do not inject new IDs from project lists.
  - Write refreshed conversations/projects via cache-store APIs so JSON + SQLite stay synchronized.
- Verification:
  - `ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/oracle-cli.ts cache --provider grok --refresh --include-history --history-limit 200`
  - `jq '[.items[] | select(.projectId != null)] | length' ~/.oracle/cache/providers/grok/ez86944@gmail.com/conversations.json` -> `15`
  - `ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/oracle-cli.ts cache export --provider grok --scope conversations --project-id 8d2b61a7-6bcd-496f-ae3a-c20b3bd09e62 --format json --out /tmp/oracle-cache-export-smoke/conversations-by-project-post-enrich`
  - Exported `conversations.json` contains SoyLei conversation rows with `projectId`.
- Follow-ups:
  - Optional future mode: allow inserting project-only IDs when explicitly requested for full project hydration.

- Date: 2026-02-23
- Area: Cache export project filtering (`cache export --project-id`) – resolved
- Symptom: `--scope projects --project-id <existing-id>` exported `0` entries; `--scope conversations --project-id ...` ignored filters.
- Root cause:
  - Planner dropped all `projects` entries when filtering by `entry.projectId` (the `projects` dataset entry has no per-project `projectId` metadata).
  - Export renderer copied raw `projects.json` / `conversations.json` without applying `projectId` filtering at payload level.
- Fix:
  - Kept `projects` index entry when `scope=projects` + `projectId`.
  - Added payload-level filtering for `projects` and `conversations` exports during materialization/CSV/markdown/html rendering.
  - Added conversation project-id extraction fallback from URL (`/project/<id>`) when explicit `projectId` is missing.
  - Added scope-level filtering of conversation-context/file/attachment entries for `scope=conversations` + `projectId`.
- Verification:
  - `ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/oracle-cli.ts cache export --provider grok --scope projects --project-id 8d2b61a7-6bcd-496f-ae3a-c20b3bd09e62 --format json --out /tmp/oracle-cache-export-smoke/projects-filtered`
  - `jq '.items | length' /tmp/oracle-cache-export-smoke/projects-filtered/projects.json` -> `1`
  - `jq '.items[0].id' /tmp/oracle-cache-export-smoke/projects-filtered/projects.json` -> `8d2b61a7-6bcd-496f-ae3a-c20b3bd09e62`
  - `pnpm tsx scripts/verify-cache-export-parity.ts --provider grok --project-id 8d2b61a7-6bcd-496f-ae3a-c20b3bd09e62` -> pass
- Follow-ups:
  - For `scope=conversations --project-id`, results depend on cached conversation metadata containing project association (`projectId` or project URL). If absent, filtered `conversations.json` may be empty even when project chats exist.

- Date: 2026-02-23
- Area: Cache export project filtering (`cache export --project-id`)
- Symptom: Project-scoped filtering appears ineffective:
  - `--scope projects --project-id <existing-id>` exports `0` entries.
  - `--scope conversations --project-id <existing-id>` exports all conversations (unfiltered).
- Root cause: Superseded by the resolved entry above.
- Fix: Superseded by the resolved entry above.
- Verification:
  - Existing project present in cache:
    - `ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/oracle-cli.ts cache export --provider grok --scope projects --format json --out /tmp/oracle-cache-export-smoke/projects-all`
    - exported `projects.json` includes `8d2b61a7-6bcd-496f-ae3a-c20b3bd09e62`.
  - Failing filtered export:
    - `ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/oracle-cli.ts cache export --provider grok --scope projects --project-id 8d2b61a7-6bcd-496f-ae3a-c20b3bd09e62 --format json --out /tmp/oracle-cache-export-smoke/projects-filtered`
    - result: `Exported 0 entries`.
  - Unfiltered conversations despite `--project-id`:
    - `ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/oracle-cli.ts cache export --provider grok --scope conversations --project-id 8d2b61a7-6bcd-496f-ae3a-c20b3bd09e62 --format json --out /tmp/oracle-cache-export-smoke/conversations-by-project`
    - result: full conversation export count.
- Follow-ups:
  - See follow-ups in the resolved entry above.

- Date: 2026-02-23
- Area: Grok project instructions modal opener (`pushProjectInstructionsEditButton`)
- Symptom: `projects instructions get` intermittently failed with `Button not found` / `Edit instructions button not found` on the updated Grok project sidebar UI.
- Root cause: The newer sidebar variant often omits a visible labeled "Edit instructions" button; the actionable control is the clickable instructions card (`group/side-panel-section`), so label-only button matching misses.
- Fix:
  - Kept the existing label-first path (`edit instructions`) for older layouts.
  - Added fallback click path that targets the visible instructions side-panel section and dispatches pointer/mouse click sequence.
  - Preserved modal-ready verification (`textarea` must appear) to fail loudly if the open action did not apply.
- Verification:
  - `pnpm tsx scripts/verify-grok-project-instructions-edit.ts`
  - `pnpm tsx scripts/verify-grok-project-instructions-modal.ts`
  - `pnpm tsx bin/oracle-cli.ts projects instructions get 8d2b61a7-6bcd-496f-ae3a-c20b3bd09e62 --target grok`
- Follow-ups:
  - Consider adding a first-class helper for "click panel card by heading text" in browser-service so adapters do not repeat this pattern.

- Date: 2026-02-23
- Area: Grok project instructions retrieval (`projects instructions get`)
- Symptom: Project-level instruction scrape can fail even when project + conversations are accessible, blocking full project cache hydration.
- Root cause: `ensureProjectSidebarOpen` button matching remains brittle in some Grok layouts/timing states; fallback candidates miss the active project-sidebar opener in this flow.
- Fix: Initially documented only; now addressed by the newer entry above (`Grok project instructions modal opener`) with a card-click fallback for the updated sidebar UI.
- Verification:
  - Failing command:
    - `pnpm tsx bin/oracle-cli.ts projects instructions get 8d2b61a7-6bcd-496f-ae3a-c20b3bd09e62 --target grok`
  - Error:
    - `Button not found (candidates: home page, search, history, ec, toggle sidebar)`
- Follow-ups:
  - Reuse the already stable main/project sidebar toggle helpers in instructions path where possible.
  - Keep a dedicated instructions-open smoke for project URLs with sidebar pre-open/closed states.

- Date: 2026-02-23
- Area: Cache export (`cache export`) SQL-first discovery + sqlite materialization
- Symptom: Export planning depended on `cache-index.json` and filesystem mirrors, so sqlite-populated caches could under-export or fail when index/json artifacts were missing.
- Root cause: `buildCacheExportPlan` was index-first with filesystem fallback only; `exportJson` copied files only and could not synthesize payloads from cache store data.
- Fix:
  - Switched export planning order to:
    1. SQL (`cache.sqlite` `cache_entries`) discovery
    2. `cache-index.json` compatibility manifest
    3. filesystem fallback
  - Added SQL dataset->entry mapping for:
    - `projects`, `conversations`
    - `conversation-context`, `conversation-files`, `conversation-attachments`
    - `project-knowledge`, `project-instructions`
  - Added store-backed materialization in JSON export for missing source files:
    - reads through cache store (`json|sqlite|dual`) and writes canonical payload files at export target.
  - Updated CSV/Markdown/HTML exports to read via cache store instead of JSON mirror readers.
  - Fixed `cache export` option parsing so dashed flags (`--conversation-id`, `--project-id`) are honored reliably.
- Verification:
  - `pnpm run -s check`
  - `ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/oracle-cli.ts cache export --provider grok --scope conversation --conversation-id d9845a8e-f357-4969-8b1b-960e73af8989 --format json --out /tmp/oracle-export-smoke/json`
  - same scope with `--format csv|md|html|zip`
  - Temporary no-index smoke:
    - move `~/.oracle/cache/providers/grok/<identity>/cache-index.json` aside
    - rerun export conversation json
    - confirm output context file contains expected messages/sources
    - restore index file
- Follow-ups:
  - Add automated parity test matrix for export scopes (`projects|conversations|conversation|contexts`) with SQL-only fixtures.

- Date: 2026-02-23
- Area: Cache catalog CLI filters (`cache sources/files list|resolve`)
- Symptom: `--conversation-id` / `--project-id` appeared accepted but were ignored (filters showed `null`, queries returned unfiltered rows).
- Root cause: Nested Commander actions read only one callback options object; dashed/global flags could land in different option scopes and were not normalized before filter parsing.
- Fix:
  - Normalized command options in catalog actions by merging `program.opts()`, parent opts, command opts, and local options.
  - Added shared option readers that support both camelCase and dashed keys.
  - Updated filter extraction in sources/files list+resolve and cache context search helpers.
- Verification:
  - `ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/oracle-cli.ts cache sources list --provider grok --conversation-id 00000000-0000-0000-0000-000000000000 --limit 5` -> `count: 0`
  - `ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/oracle-cli.ts cache sources list --provider grok --conversation-id d9845a8e-f357-4969-8b1b-960e73af8989 --limit 2` -> filtered rows only for that conversation
  - `ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/oracle-cli.ts cache files list --provider grok --project-id d3ccca2d-8742-4e6b-b1d2-e96fbc3cdb1f --limit 2` -> `filters.projectId` populated
- Follow-ups:
  - Audit remaining nested subcommands for dashed-option parsing consistency.

- Date: 2026-02-23
- Area: Grok conversation context source extraction (`readConversationContext`)
- Symptom: `conversations context get` / `cache context get` sometimes returned `sources: []` even when Grok UI showed many sources (for example `27 sources` / `Searched web` + `Searched 𝕏` sidebar sections).
- Root cause: Source-chip detection only looked for `[role="button"][aria-label*=sources]`, but Grok renders source controls with varying DOM shapes and labels. The extractor often never opened the Sources sidebar, so accordion links were never collected.
- Fix:
  - Added robust, visibility-aware source-chip detection over `button, [role="button"]` with text matching for `sources`.
  - Added sidebar wait loop before scraping accordions.
  - Kept accordion scraping for `Searched ...` groups and persisted entries with `sourceGroup`.
  - Preserved dedupe and URL normalization behavior.
- Verification:
  - `pnpm tsx scripts/verify-grok-context-sources.ts d9845a8e-f357-4969-8b1b-960e73af8989`
  - `pnpm tsx scripts/verify-grok-context-get.ts d9845a8e-f357-4969-8b1b-960e73af8989`
  - `ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/oracle-cli.ts conversations context get d9845a8e-f357-4969-8b1b-960e73af8989 --target grok --json-only | jq '.sources | length'`
  - `ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/oracle-cli.ts cache context get d9845a8e-f357-4969-8b1b-960e73af8989 --provider grok | jq '.context.sources | length'`
- Follow-ups:
  - Add a dedicated smoke that asserts minimum source count for a known cited conversation fixture.
  - Continue SQL-first export/discovery work so source-rich contexts remain exportable without JSON-index dependency.

- Date: 2026-02-22
- Area: Cache operations lifecycle (`cache clear|compact|cleanup`)
- Symptom: Cache tooling lacked operational lifecycle commands for selective purge, compaction, and stale-data cleanup.
- Root cause: Only refresh/export/query/doctor/repair surfaces existed; no first-class maintenance operations for ongoing cache hygiene.
- Fix:
  - Added `oracle cache clear`:
    - dataset-scoped, optional `--older-than`, optional `--include-blobs`
    - dry-run by default, mutate only with `--yes`
  - Added `oracle cache compact`:
    - SQLite `VACUUM`, `ANALYZE`, `PRAGMA optimize`
  - Added `oracle cache cleanup`:
    - stale clear (`--older-than` / `--days`)
    - stale index-entry prune
    - old backup prune
    - dry-run by default, mutate only with `--yes`
- Verification:
  - `pnpm run -s check`
  - `pnpm tsx bin/oracle-cli.ts cache clear --provider grok --identity-key <key> --dataset context --json`
  - `pnpm tsx bin/oracle-cli.ts cache compact --provider grok --identity-key <key> --json`
  - `pnpm tsx bin/oracle-cli.ts cache cleanup --provider grok --identity-key <key> --days 30 --json`
- Follow-ups:
  - Serialize/lock cache maintenance by identity; running clear/compact/cleanup in parallel can trigger transient SQLite `database is locked`.

- Date: 2026-02-22
- Area: Cache mutation safety + repair operations (`cache repair`)
- Symptom: Operators had no guided way to perform cache repair actions (index rebuild, orphan pruning, status fixes) with safe defaults.
- Root cause: Diagnostics existed (`cache doctor`), but no repair command with dry-run/confirmation workflow.
- Fix:
  - Added `oracle cache repair` command:
    - dry-run by default,
    - mutating mode requires `--apply --yes`,
    - action selection via `--actions`.
  - Implemented repair actions:
    - `sync-sql` (initialize/sync SQLite cache)
    - `rebuild-index` (regenerate `cache-index.json` from filesystem)
    - `prune-orphan-assets` (drop unreferenced `file_assets` rows)
    - `mark-missing-local` (mark missing `local_cached` assets as `missing_local`)
  - Added automatic per-identity backups before mutation:
    - `backups/<timestamp>/cache.sqlite`
    - `backups/<timestamp>/cache-index.json`
- Verification:
  - `pnpm run -s check`
  - `pnpm tsx bin/oracle-cli.ts cache repair --provider grok --identity-key <key> --actions all --json`
  - `pnpm tsx bin/oracle-cli.ts cache repair --provider grok --identity-key <key> --actions rebuild-index --apply --yes --json`
- Follow-ups:
  - Add explicit catalog re-backfill repair action and parity checks between index entries and SQL datasets.

- Date: 2026-02-22
- Area: Cache integrity checks (`cache doctor`)
- Symptom: No unified integrity command existed to validate SQL health + file-pointer health across provider/identity cache trees.
- Root cause: Migration/backfill and catalog queries existed, but there was no consolidated diagnostic surface for operators/automation.
- Fix:
  - Added `oracle cache doctor` command with:
    - provider/identity scoping (`--provider`, `--identity-key`)
    - SQLite checks (`cache.sqlite` presence, `PRAGMA quick_check`, expected table presence)
    - file-pointer health via `resolveCachedFiles(..., missingOnly=true)`
    - machine-readable output (`--json`) and strict exit mode (`--strict`)
- Verification:
  - `pnpm run -s check`
  - `ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/oracle-cli.ts cache doctor --provider grok --json`
  - `ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/oracle-cli.ts cache doctor --provider grok`
- Follow-ups:
  - Add `cache repair` with dry-run and explicit mutation actions.

- Date: 2026-02-22
- Area: Cache file-pointer diagnostics (`cache files resolve`)
- Symptom: `cache files list` showed bindings, but there was no built-in way to determine whether bound local files still existed on disk.
- Root cause: Catalog queries returned metadata only; path-existence checks and status classification were not implemented.
- Fix:
  - Added `resolveCachedFiles(...)` in `src/browser/llmService/cache/catalog.ts`.
  - Added CLI command: `oracle cache files resolve`.
  - Resolution now classifies each row as:
    - `local_exists`
    - `missing_local`
    - `external_path`
    - `remote_only`
    - `unknown`
  - Added `--missing-only` filter and summary counters in command output.
- Verification:
  - `pnpm run -s check`
  - `ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/oracle-cli.ts cache files resolve --provider grok --limit 10`
  - `ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/oracle-cli.ts cache files resolve --provider grok --missing-only --limit 10`
- Follow-ups:
  - Integrate this classification into `cache doctor` so missing local pointers fail integrity checks.

- Date: 2026-02-22
- Area: SQL cache catalog query surface (sources/files)
- Symptom: Even after catalog backfill, there was no CLI to read normalized `source_links`/`file_bindings`; users had to inspect `cache.sqlite` manually.
- Root cause: Cache CLI exposed context object operations (`context list/get/search`) but no direct catalog query commands.
- Fix:
  - Added `src/browser/llmService/cache/catalog.ts`:
    - `listCachedSources(...)` (SQL-first; JSON context fallback)
    - `listCachedFiles(...)` (SQL-first join `file_bindings` + `file_assets`; JSON manifest/context fallback)
  - Added CLI commands:
    - `oracle cache sources list`
    - `oracle cache files list`
  - Added filters:
    - sources: `--conversation-id`, `--domain`, `--source-group`, `--query`, `--limit`
    - files: `--conversation-id`, `--project-id`, `--dataset`, `--query`, `--resolve-paths`, `--limit`
- Verification:
  - `pnpm run -s check`
  - `ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/oracle-cli.ts cache sources list --provider grok --limit 3`
  - `ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/oracle-cli.ts cache files list --provider grok --limit 3`
- Follow-ups:
  - Add `cache files resolve` and orphan/path integrity checks (`cache doctor`) so missing local assets are surfaced explicitly.

- Date: 2026-02-22
- Area: Cache context retrieval/search (agent + user workflows)
- Symptom: Cached contexts were listable/gettable but not queryable; there was no CLI search surface for retrieving relevant message/source snippets across cached conversations.
- Root cause: Cache CLI exposed only object retrieval (`context list/get`) and exports, without chunked context indexing/query logic.
- Fix:
  - Added `src/browser/llmService/cache/search.ts`:
    - keyword search (`searchCachedContextsByKeyword`)
    - semantic search (`searchCachedContextsSemantically`) with embedding cache table `semantic_embeddings`.
  - Added CLI commands:
    - `oracle cache context search <query>`
    - `oracle cache context semantic-search <query>`
  - Added filters (`--conversation-id`, `--role`, `--limit`) and semantic options (`--model`, `--max-chunks`, `--min-score`, `--openai-*`).
- Verification:
  - `pnpm run -s check`
  - `pnpm tsx bin/oracle-cli.ts cache context search "oracle" --provider grok --limit 3`
  - `pnpm tsx bin/oracle-cli.ts cache context semantic-search "oracle" --provider grok --limit 3` (expected explicit error without `OPENAI_API_KEY`)
- Follow-ups:
  - Add top-level cache catalog commands (`cache sources/files list`) to complement context search.
  - Add quiet/json-output mode that suppresses banner + warning noise for reliable `jq` pipelines.

- Date: 2026-02-22
- Area: SQLite cache catalog migration/backfill (sources + file pointers)
- Symptom: Existing `cache.sqlite` files could remain v1-style (`cache_entries`/`meta` only) and lacked normalized source/file metadata even when JSON cache had context/files.
- Root cause: Earlier migration only backfilled base datasets and did not guarantee a second-pass catalog sync for `source_links`/`file_bindings`/`file_assets`.
- Fix:
  - Added schema migration ledger entry for catalog hardening.
  - Added `backfill_catalog_v2` pass that walks existing `cache_entries` and writes:
    - context sources -> `source_links`
    - context/files/attachments/knowledge -> `file_bindings`
  - Added file-asset pointer write-through:
    - local file paths now upsert `file_assets` rows with `storage_relpath` when cache-relative,
    - `file_bindings.metadata_json` now carries path/mime/checksum metadata where present.
- Verification:
  - `pnpm run -s check`
  - `pnpm tsx scripts/verify-cache-sql-catalog.ts --provider grok <conversationId>`
- Follow-ups:
  - Add SQL-first source/file catalog query commands (beyond context list/get) for agent workflows.

- Date: 2026-02-22
- Area: Cache context CLI bypassing store abstraction
- Symptom: `oracle cache context list/get` read directly from `cache-index.json` and raw JSON files, so behavior could diverge from configured cache backend (`json|sqlite|dual`).
- Root cause: CLI command handlers used provider cache helpers directly instead of llmService/cache-store APIs.
- Fix:
  - Added `CacheStore.listConversationContexts(...)`.
  - Added `LlmService.listCachedConversationContexts(...)` and `LlmService.getCachedConversationContext(...)`.
  - Updated CLI `cache context list/get` to use the new llmService methods.
- Verification:
  - `pnpm run -s check`
  - Runtime smoke in normal environment:
    - `pnpm tsx bin/oracle-cli.ts cache context list --provider grok`
    - `pnpm tsx bin/oracle-cli.ts cache context get <conversationId> --provider grok`

- Date: 2026-01-24
- Area: Cache JSON mirror writes (nested paths)
- Symptom: `conversations context get` could return context, but JSON mirror files (`contexts/*.json`) were missing; some flows silently fell back to cached reads.
- Root cause: `writeProviderCache` created only the provider root directory, not nested path directories (e.g., `contexts/`, `conversation-files/`).
- Fix: Changed cache writes to `mkdir(path.dirname(cacheFile), { recursive: true })` before writing payload.
- Verification:
  - `pnpm tsx bin/oracle-cli.ts conversations context get <id> --target grok --json-only`
  - Confirmed both:
    - SQLite row exists in `cache_entries` (`dataset='conversation-context'`)
    - JSON mirror exists at `~/.oracle/cache/providers/grok/<identity>/contexts/<id>.json`

- Date: 2026-01-24
- Area: Conversation context completeness (source/citation capture)
- Symptom: `conversations context get` returned only messages/files; no explicit list of consulted sources/citations.
- Root cause: `ConversationContext` schema and Grok scraper did not include source link extraction.
- Fix:
  - Added `ConversationContext.sources` (`url`, `title`, `domain`, `messageIndex`) to domain types.
  - Updated Grok `readConversationContext` to collect:
    - inline external `a[href]` links per assistant row, and
    - sidebar citations from the `N sources` chip + `Searched web` / `Searched 𝕏` accordions.
  - Sidebar source extraction now expands accordions and reads linked results from their controlled panels.
  - Updated llmService normalization to sanitize/dedupe source entries before caching/output.
  - Updated context smoke script output to report source count.
- Verification:
  - `pnpm run -s check`
  - Live verification: run `oracle conversations context get <conversationId> --target grok` on a conversation with citations and confirm `context.sources` is populated.

- Date: 2026-01-24
- Area: Cache backend migration (JSON → SQLite)
- Symptom: Cache store migration introduced fragile path resolution and could fail hard when SQLite support was unavailable, risking regressions in cache-dependent flows.
- Root cause: Early SQLite integration derived cache directory from relative index paths and assumed `node:sqlite` availability; dual-store behavior did not consistently tolerate primary-store failure.
- Fix:
  - Added `browser.cache.store` (`json|sqlite|dual`) to schema/profile config and wired selection into `LlmService`.
  - Updated SQLite cache dir resolution to use `resolveProviderCachePath(...)` directly.
  - Hardened `DualCacheStore`:
    - read fallback to JSON when SQLite read fails,
    - seed-primary best-effort only,
    - write-secondary still succeeds when primary fails,
    - throw only when both stores fail.
  - Added migration plan doc: `docs/dev/cache-db-migration-plan.md`.
- Verification:
  - `pnpm run -s check`
  - `pnpm tsx bin/oracle-cli.ts cache context list --help`
  - `pnpm tsx bin/oracle-cli.ts cache context get --help`
  - `pnpm tsx bin/oracle-cli.ts cache export --help`

- Date: 2026-01-24
- Area: Cached context access + export ergonomics
- Symptom: Context JSON was cached on disk but not directly discoverable for agents, and export scope didn’t expose a first-class “contexts” mode.
- Root cause: CLI cache surfaced projects/conversations/exports broadly, but lacked a dedicated cached-context interface.
- Fix:
  - Added `oracle cache context list` and `oracle cache context get <id>` (ID or cached title) to read cached contexts without browser retrieval.
  - Extended `oracle cache export --scope ...` to include `contexts` for JSON/MD/HTML/CSV/ZIP exports.
  - Added fallback scanning of `contexts/*.json` when cache-index entries are missing.
- Verification:
  - `pnpm tsx bin/oracle-cli.ts cache context list --help`
  - `pnpm tsx bin/oracle-cli.ts cache context get --help`
  - `pnpm tsx bin/oracle-cli.ts cache export --help`

- Date: 2026-01-24
- Area: Conversation context retrieval (Grok + llmService + CLI)
- Symptom: No end-to-end command existed to retrieve/store conversation context; provider capability was exposed but not implemented.
- Root cause: `readConversationContext` was declared on provider types but missing in Grok adapter and missing from `LlmService`/CLI command surface.
- Fix:
  - Implemented Grok `readConversationContext(conversationId, projectId?, options?)` with route-aware navigation (`/c/<id>` and `/project/<id>?chat=<id>`) and message scraping from response rows.
  - Added `LlmService.getConversationContext(...)` with cache write-through to `contexts/<conversationId>.json` and cached fallback on live scrape failure.
  - Added CLI `auracall conversations context get <id>` with `--project-id`, `--cache-only`, and history controls for name/selector resolution.
  - Added smoke helper: `pnpm tsx scripts/verify-grok-context-get.ts <conversationId> [projectId]`.
- Verification:
  - `pnpm tsx bin/auracall.ts conversations context get --help`
  - `pnpm tsx scripts/verify-grok-context-get.ts` (usage/compile path)

- Date: 2026-01-24
- Area: Grok project files (new Personal Files modal UX)
- Symptom: `projects files add/list/remove` regressed after UI change; old Sources selectors no longer matched reliably.
- Root cause: Grok moved file interactions behind a `Personal files` modal (search input + Attach button + hover remove + Save), while old code assumed direct Sources-row controls.
- Fix: Reworked Grok file flows to the new modal lifecycle:
  - open `Personal files` modal from project Sources context
  - upload via modal attach/file-input path
  - delete via hover row action, verify pending-remove state (`opacity-50`, `line-through`, `Undo`), then commit with modal `Save`
  - list from modal rows for current UI variant
- Verification:
  - `pnpm tsx bin/auracall.ts projects files add <projectId> -f <file> --target grok`
  - `pnpm tsx bin/auracall.ts projects files remove <projectId> <fileName> --target grok`
  - `pnpm tsx bin/auracall.ts projects files list <projectId> --target grok`

- Date: 2026-01-24
- Area: Grok project sources (Files collapsible + uploads)
- Symptom: `projects files add/remove` failed when the Files list was empty; helper threw `Button not found` and attach menu never opened.
- Root cause: The Files collapsible toggle is sometimes absent when there are no rows; strict toggle matching caused a hard failure.
- Fix: `ensureProjectSourcesFilesExpanded` now tolerates a missing toggle and only expands when a toggle is visible; added a stepwise smoke script to validate sources flows.
- Verification: `pnpm tsx scripts/verify-grok-project-sources-steps.ts 1 <projectId>` and step 5/6 upload+remove succeed.

- Date: 2026-01-14
- Area: Grok project menu (clone/rename) + menu helpers
- Symptom: `projects clone` opened the user/profile menu (items like Settings/Help) and failed to find Clone; rename failed right after clone.
- Root cause: `openMenu` trusted `aria-controls` and did not fall back when the id was missing; project menu detection used broad `aria-haspopup="menu"` and raced DOM readiness.
- Fix: `openMenu` now falls back to the provided menu selector when `aria-controls` resolves to a missing element; `openProjectMenuButton` waits for `button[aria-label="Open menu"]` and matches by label (avoids profile menu).
- Verification: `pnpm tsx bin/auracall.ts projects clone "My Project" "My Project Clone 2" --target grok` and `projects rename <id> "My Project Clone"` succeeded.

- Date: 2026-01-24
- Area: Grok project sources tab selection
- Symptom: `projects files list <id>` failed with “Sources tab not found” even on `?tab=sources`.
- Root cause: Sources tablist can lag or be missing; when content is already rendered, there’s no tab to click.
- Fix: `ensureProjectSourcesTabSelected` now waits for a tablist but treats a rendered sources container as success; only throws if neither tab nor content exists.
- Verification: `pnpm tsx bin/auracall.ts projects files list <projectId> --target grok` returned file names.

- Date: 2026-01-14
- Area: Grok smoke tests + cache CLI usage
- Symptom: Smoke checklist referenced `auracall cache --target grok`, which is not a supported flag (command failed).
- Root cause: Cache CLI is provider-agnostic and does not accept a target override.
- Fix: Updated smoke checklist to use `auracall cache` and added an explicit `--browser-target grok` prompt variant.
- Verification: Live Grok smoke run completed (prompt, projects refresh, conversations list, project prompt, reattach, registry).

- Date: 2026-01-09
- Area: Grok browser conversation scraping (history dialog)
- Symptom: `auracall conversations --target grok --include-history` returned empty results with `SyntaxError` from `Runtime.evaluate`.
- Root cause: Unescaped backslashes in regex literals inside the injected history-dialog script caused JS parse errors (e.g., `\s` collapsed to `s`, `//c/` became a comment).
- Fix: Escaped regex literals inside the template string (match and cleanup patterns, `/c/` pathname regex) so the injected script remains valid JavaScript.
- Verification: Live Grok conversation fetch returned a full list via `pnpm tsx bin/auracall.ts conversations --target grok --refresh --include-history`.
- Follow-ups: Ensure `updatedAt` parsing finds timestamps in the current Grok UI.

- Date: 2026-01-10
- Area: Grok browser conversation timestamps (history dialog)
- Symptom: Conversation list rendered but `updatedAt` was always `undefined`.
- Root cause: History rows render relative time in a plain text element (e.g., a `div` with "1 hour ago"), not in `<time>` or ARIA attributes, so the scraper never parsed it.
- Fix: Scan descendant text nodes in each history row for short relative/absolute timestamps and parse them before falling back to title cleanup.
- Verification: Live Grok conversation fetch returned populated `updatedAt` values via `pnpm tsx bin/auracall.ts conversations --target grok --refresh --include-history`.

- Date: 2026-01-10
- Area: Grok browser conversation list (title cleanup)
- Symptom: `auracall conversations --target grok` returned empty results or a `Runtime.evaluate` `SyntaxError`.
- Root cause: Regex literals inside the injected list script used `\t`/`\n` escapes inside a template string, which injected literal newlines and broke regex parsing in the browser.
- Fix: Replace the title-cleanup regexes with `\\s`-based patterns so the injected script is valid.
- Verification: Pending (rerun Grok conversation list after patch).

- Date: 2026-01-10
- Area: Grok browser conversation timestamps (history + list)
- Symptom: `updatedAt` missing when Grok rendered short relative times (e.g., `2h`, `3d`) or when history dialog stayed open after scraping.
- Root cause: Timestamp parsing only handled “X hours ago” wording and didn’t recognize short unit tokens; dialog close relied on generic modal close paths only.
- Fix: Parse short relative units (`2h`, `3d`, `5w`, `2mo`, etc.) and add a history-toggle fallback when closing dialogs.
- Verification: Pending (rerun Grok conversation list/history with `--include-history` and confirm `updatedAt` populated + dialog closed).

- Date: 2026-01-11
- Area: Browser session reattach (dangling sessions)
- Symptom: `auracall session <id> --render` hangs when the browser instance died, even though the session still exists.
- Root cause: Reattach path assumes an active DevTools port and does not validate liveness before waiting.
- Fix: Pending (add fast liveness check against registry/port and fail with a clear message + relaunch hint).
- Verification: Pending (reattach should fail fast when Chrome is closed).

- Date: 2026-01-10
- Area: Grok assistant selectors (doctor + response polling)
- Symptom: `oracle doctor --target grok` failed `assistantBubble`, `assistantRole`, and `copyButton` when using the new Grok UI classes.
- Root cause: Message rows no longer use `.message-bubble` classes; assistant rows are now `div.relative.group.flex.flex-col.items-start`, with action buttons (Copy) nested under the same row.
- Fix: Updated Grok provider selectors to target the new row classes and align assistant detection with `items-start`.
- Verification: Live DOM inspection via `pnpm tsx scripts/browser-tools.ts eval ...` against a Grok conversation.

- Date: 2026-01-10
- Area: Browser registry (manual login + cookie export)
- Symptom: `oracle doctor` reported missing DevTools port even with a login window open.
- Root cause: Manual login + cookie export launches Chrome via `chrome-launcher` without registering the instance in `browser-state.json`.
- Fix: Register the DevTools port/pid after login chrome launches so registry lookups succeed.
- Verification: TBD (rerun doctor after login launch).

- Date: 2026-01-12
- Area: Cache identity + name resolution (llmService)
- Symptom: Cache refresh/name resolution logic diverged across CLI commands and duplicated LlmService behavior.
- Root cause: Cache helpers lived in `bin/auracall.ts` instead of the new LlmService layer.
- Fix: Centralized cache identity/context and name resolution in `src/browser/llmService/llmService.ts`, routing CLI list/resolve flows through it.
- Verification: Pending (rerun `auracall projects`, `auracall conversations`, and `auracall cache --refresh`).
- Follow-ups: Validate model-selection fallback in Phase 3.

- Date: 2026-01-12
- Area: Grok main sidebar state detection (history workflows)
- Symptom: Sidebar open/closed detection reported inverted states during toggle smoke tests.
- Root cause: Width-based checks can be inverted depending on layout/scroll state; the toggle icon state is more reliable.
- Fix: Detect open state via `button[data-sidebar="trigger"] svg.lucide-chevrons-right.rotate-180` (open). Keep width/right-edge check (`rect.width > 120 && rect.right > 40`) as a fallback if SVG changes.
- Verification: `scripts/verify-grok-main-sidebar-toggle.ts` reports correct state transitions.

- Date: 2026-01-12
- Area: Browser-service DOM wait helpers
- Symptom: Sidebar open check occasionally failed right after navigation; time-based sleeps were brittle.
- Root cause: Waits were time-based instead of selector-based, so the toggle could be queried before it was in the DOM.
- Fix: Added `waitForSelector` to `packages/browser-service/src/service/ui.ts` and used it in `ensureMainSidebarOpen` to wait for `button[data-sidebar="trigger"]`.
- Verification: `scripts/verify-grok-project-remove-steps.ts 2 <projectId>` no longer fails due to missing sidebar toggle.
- Fix: Grok project-create model picker needed `pointerdown`/`mousedown` before `click()` to open the Radix listbox. Added this in `resolveProjectInstructionsModal` and `verify-grok-project-create-model-picker.ts`.
- Verification: `pnpm tsx scripts/verify-grok-project-create-steps.ts 2 "My Project" "Instructions here" "Grok 4.1 Thinking"` sets the model correctly.
- Docs: Added `docs/dev/browser-service-tools.md` to centralize reusable browser-service UI helpers and patterns.
- Fix: Project instructions get/set now ensure project sidebar open and wait for the Edit Instructions button via `waitForSelector` before clicking.
- Fix: Project instructions get no longer fails when the edit dialog is already open; we short-circuit on textarea presence and skip model-menu inspection unless a model change is requested.
- Fix: Grok history rename flow required real mouse hover. Added `hoverElement` to browser-service (CDP mouse move + `elementFromPoint` verification) and used it to reveal hover-only controls in the history dialog.
- Verification: `pnpm tsx scripts/verify-grok-history-rename-steps.ts 4 <conversationId>` shows Rename/Delete controls consistently; CLI rename succeeds.

- Date: 2026-01-12
- Area: Dev workflow hygiene
- Note: Keep commits tight and scoped; stage new scripts/docs intentionally, and clean up/commit before switching phases to avoid losing automation learnings.
- 2026-03-26: Aura-Call profile precedence and Windows login endpoint reporting
  - Symptom: `auracall --profile windows-chrome-test login --target grok` still launched `/usr/bin/google-chrome` with WSL cookie paths even though the config profile clearly specified Windows Chrome/Windows cookies/Windows managed root. Separately, the login path printed `windows-loopback:9222` even when the real managed Windows Chrome session was alive on a different elevated port, which made the product path look broken and obscured the actual live browser.
  - Root cause: `src/schema/resolver.ts` applied selected Aura-Call profiles after `browserDefaults` had already been merged into `browser`, and `applyBrowserProfileOverrides()` only filled missing fields. That meant the selected profile could not override global browser defaults. On top of that, profile browser parsing still only recognized legacy `cookiePath/profileName` keys, so v2 profile blocks using `chromeCookiePath` were silently dropped. Separately, `packages/browser-service/src/login.ts` registered and printed the requested debug port instead of the actual `chrome.port` returned by the launcher.
  - Fix:
    - `src/schema/resolver.ts`
      - apply selected profiles from both `auracallProfiles` and v2 `profiles`
      - let selected profile values override global defaults
      - reapply CLI config after profile application so CLI still wins
    - `src/browser/service/profileConfig.ts`
      - add an explicit override mode for profile application
      - accept modern `chromeCookiePath` / `chromeProfile` aliases when reading profile-browser config
    - `src/schema/types.ts`
      - extend `OracleProfileBrowserSchema` with `chromeCookiePath` and `chromeProfile`
    - `packages/browser-service/src/login.ts`
      - register and print `chrome.port` / `chrome.host` instead of the originally requested debug port
  - Verification:
    - `pnpm vitest run tests/schema/resolver.test.ts tests/browser/profileDoctor.test.ts tests/browser/browserLoginCore.test.ts`
    - `pnpm tsx /tmp/resolve-profile.mts`
      - `--profile windows-chrome-test` now resolves Windows Chrome path, Windows cookie DB, Windows managed profile root, `wslChromePreference: "windows"`, and the pinned managed profile dir
    - live:
      - `pnpm tsx bin/auracall.ts --profile windows-chrome-test login --target grok`
      - now prints `Opened grok login in /mnt/c/Program Files/Google/Chrome/Application/chrome.exe`
      - and `Debug endpoint: windows-loopback:45920`
  - Additional finding: after cleaning up the broken sibling Windows browser process that used `--user-data-dir= C:\...windows-chrome-test\grok`, the remaining real listener on `127.0.0.1:45920` was the good managed-profile process with `--user-data-dir=C:\...windows-chrome-test\grok`, and its live DevTools tabs showed Grok pages plus `about:blank`, not the stray `file:///...` tab.

- 2026-03-26: Manual-login reuse should not spawn duplicate Grok tabs
  - Symptom: repeated `auracall --profile windows-chrome-test login --target grok` calls kept adding another `https://grok.com/` page to the live managed Windows profile even when a reusable Grok tab or `about:blank` page already existed.
  - Root cause: `packages/browser-service/src/manualLogin.ts` always finished manual/login launch with `CDP.New({ url })`, regardless of whether the managed browser already had a matching Grok tab or a reusable `about:blank` page.
  - Fix:
    - `packages/browser-service/src/manualLogin.ts`
      - export and update `openLoginUrl(...)`
      - reuse an existing matching page target when present
      - otherwise navigate an existing `about:blank` target
      - only fall back to `CDP.New(...)` when no reusable page exists
    - `tests/browser/manualLogin.test.ts`
      - add coverage for existing-target reuse, `about:blank` reuse, and new-tab fallback
  - Verification:
    - `pnpm vitest run tests/browser/manualLogin.test.ts tests/browser/browserLoginCore.test.ts tests/schema/resolver.test.ts tests/browser/profileDoctor.test.ts`
    - live Windows managed-profile check:
      - count `https://grok.com/` page targets on `127.0.0.1:45920`
      - run `pnpm tsx bin/auracall.ts --profile windows-chrome-test login --target grok`
      - count again
      - result stayed `4 -> 4`, so login reuse no longer creates a fifth Grok tab

- 2026-03-26: Windows managed-profile CDP rediscovery must be profile-scoped, not requested-port scoped
  - Symptom: after manually signing into and reopening the Windows Aura-Call-managed Chrome profile, the browser window could be visibly open and signed in while Aura-Call still could not attach. The process command line still advertised `--remote-debugging-port=<requestedPort>`, but that port could be dead or stale, so the failure looked like generic WSL<->Windows networking breakage.
  - Root cause: Windows-from-WSL launch/reuse trusted the requested or previously recorded DevTools port too much. If the live endpoint moved, or if the recorded port no longer matched any responsive listener, Aura-Call had no profile-scoped fallback and treated the session as dead.
  - Fix:
    - `packages/browser-service/src/processCheck.ts`
      - added `probeWindowsLocalDevToolsPort(...)`
      - added `findResponsiveWindowsDevToolsPortForUserDataDir(...)`
      - collect all Windows Chrome processes matching a managed `user-data-dir`, not just the first match
    - `packages/browser-service/src/chromeLifecycle.ts`
      - added `discoverWindowsChromeDevToolsPort(...)`
      - Windows launch/reuse now asks the managed profile for a responsive Windows-local endpoint before declaring the requested port dead
      - when a different live port is found, Aura-Call rewrites `DevToolsActivePort` and adopts that endpoint
    - tests
      - `tests/browser-service/processCheck.test.ts`
      - `tests/browser-service/windowsChromeDiscovery.test.ts`
  - Verification:
    - `pnpm vitest run tests/browser-service/processCheck.test.ts tests/browser-service/windowsChromeDiscovery.test.ts tests/browser-service/chromeLifecycle.test.ts tests/browser/manualLogin.test.ts tests/browser/browserLoginCore.test.ts tests/schema/resolver.test.ts`
    - `pnpm run check`
    - live probe:
      - `pnpm tsx /tmp/check-windows-devtools-discovery.mts`
      - returned `{"port":null}` for the current `windows-chrome-test/grok` browser root after checking the profile, advertised port, and Windows-local listeners
  - Additional finding: the current live failure mode is no longer "we picked the wrong port". For the active `windows-chrome-test/grok` session, Windows reported no responsive DevTools port for any Chrome process in that managed profile group. The browser window exists, but CDP is not being exposed at all.

- 2026-03-26: Windows-from-WSL launches should use `--remote-debugging-port=0`, not a preselected fixed port
  - Symptom: the Windows product launcher kept falling into dead `4589x` retries even though a literal Windows PowerShell launch proved Chrome could expose DevTools for the same kind of managed profile. The failure looked like quoting at first, but the evidence was inconsistent: `45941` worked, while nearby fixed ports like `45942` timed out.
  - Root cause: Aura-Call was choosing DevTools ports from Linux/WSL-local availability and passing those fixed ports into stock Windows Chrome. On this machine, some fixed ports simply never came up on the Windows side even though the launch flags were correct.
  - Fix:
    - `packages/browser-service/src/chromeLifecycle.ts`
      - Windows-from-WSL launches now request `--remote-debugging-port=0`
      - poll the managed profile's `DevToolsActivePort` and adopt the real Windows-assigned port
      - retry fresh auto-port launches instead of walking a fixed-port band
    - `tests/browser-service/windowsChromeDiscovery.test.ts`
      - add coverage for `requestedPort: 0` and for `DevToolsActivePort` beating the stale advertised command-line port
  - Verification:
    - `pnpm vitest run tests/browser-service/windowsChromeDiscovery.test.ts`
    - `pnpm run check`
    - live scratch proof:
      - `/tmp/auracall-win-ab-port-zero.ps1` returned a real Windows Chrome endpoint via `DevToolsActivePort`
      - `/tmp/auracall-launch-ab-product-auto.mts` launched through product code and adopted `windows-loopback:53868` on the first try
  - Additional finding: this narrows the earlier suspicion. The current product failure mode was not generic PowerShell escaping; it was fixed-port selection on Windows Chrome. Literal Windows launches with correct quoting do work, and the stable product answer is to let Windows choose the port.

- 2026-03-26: Windows managed-profile liveness must trust the responsive DevTools endpoint, not just the original root PID
  - Symptom: after a clean Windows relaunch on `--remote-debugging-port=0`, Aura-Call could prove the managed profile was live (`DevToolsActivePort=49926`, Windows-local probe ok, `windows-loopback:49926` relay ok), but `auracall doctor --local-only` still marked the registry entry stale/alive=false.
  - Root cause: `isChromeAlive(...)` over-trusted the Windows root PID path for WSL-managed Windows profiles. If that path was flaky or ambiguous, Aura-Call could report `alive=false` even while the actual Windows DevTools endpoint was responsive.
  - Fix:
    - `packages/browser-service/src/processCheck.ts`
      - for WSL + managed Windows profiles, check `probeWindowsLocalDevToolsPort(port)` first
      - treat a responsive Windows-local DevTools endpoint as sufficient proof of life
    - `tests/browser-service/processCheck.test.ts`
      - add coverage for the “tasklist says no, but `/json/version` is alive” case
  - Verification:
    - `pnpm vitest run tests/browser-service/processCheck.test.ts tests/browser-service/windowsChromeDiscovery.test.ts tests/browser-service/chromeLifecycle.test.ts`
    - live:
      - relaunched `windows-chrome-test/grok` through product code
      - `DevToolsActivePort` contained `49926`
      - `probeWindowsLocalDevToolsPort(49926) === true`
      - `auracall doctor --profile windows-chrome-test --target grok --local-only --json` now reports `alive: true`

- 2026-03-26: Browser onboarding needs a real wizard, not more setup flags
  - Symptom: the underlying managed-profile setup/login flow had become good enough, but first-time users still had to know too much: which browser runtime to prefer, whether to create a dedicated Aura-Call profile, which profile name to use, and when to run `setup` versus `doctor`. The product had the right primitives but no clear happy path.
  - Root cause: onboarding logic lived in scriptable commands (`setup`, `doctor`, profile-scoped config) with no guided entry point. That forced users to understand config shape before they could benefit from it.
  - Fix:
    - `src/cli/browserWizard.ts`
      - added wizard choice discovery for local/WSL/Windows Chromium sources
      - added profile-name suggestion/validation
      - added config patch + merge helpers for `profiles.<name>`
    - `bin/auracall.ts`
      - added `auracall wizard`
      - wizard writes/updates `~/.auracall/config.json`
      - extracted the existing setup action body into a reusable `runBrowserSetupCommand(...)`, so the wizard reuses the same managed-profile login/verification path instead of forking onboarding behavior
    - tests
      - `tests/cli/browserWizard.test.ts`
      - `tests/cli/browserSetup.test.ts`
  - Verification:
    - `pnpm vitest run tests/cli/browserWizard.test.ts tests/cli/browserSetup.test.ts`
    - `pnpm tsx bin/auracall.ts wizard --help`
    - `pnpm run check`
  - Outcome: the preferred first-run path is now `auracall wizard`, while `auracall setup` remains the scriptable/non-interactive path for automation and advanced users.

- 2026-03-26: Windows bot detection is not coming from a custom Aura-Call user-agent
  - Symptom: Windows-managed Aura-Call Chrome profiles were being flagged by some services as bot-like, raising suspicion that Aura-Call might be overriding the UA string.
  - Investigation:
    - `packages/browser-service/src/chromeLifecycle.ts` and `packages/browser-service/src/manualLogin.ts` do not set `--user-agent` or any explicit UA override.
    - Live probe against `windows-chrome-test/grok` via `pnpm tsx scripts/browser-tools.ts eval --port 62265 --url-contains grok.com ...` returned:
      - `navigator.userAgent = Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36`
      - `navigator.platform = Win32`
      - `navigator.webdriver = true`
  - Conclusion: the current high-signal bot fingerprint is `webdriver=true` on the debug-attached Windows session, not a strange UA string. The current manual-login/debug path uses `--remote-debugging-port=0` plus a managed profile and loopback relay; that is the more plausible cause of bot detection.

- 2026-03-26: WSL -> Windows launcher must emit `--user-data-dir="C:\..."`, not bare `--user-data-dir=C:\...`
  - Symptom: manual PowerShell launches of the kept Windows managed profile worked reliably only when the `--user-data-dir` argument itself contained inner double quotes around the Windows path. The product launcher was building the bare path form instead.
  - Root cause: `packages/browser-service/src/chromeLifecycle.ts` formatted the Windows `user-data-dir` token as `--user-data-dir=C:\...` and then only applied the outer single-quoted PowerShell literal wrapper. That did not match the known-good command shape the user verified manually.
  - Fix:
    - `packages/browser-service/src/chromeLifecycle.ts`
      - `resolveUserDataDirFlag(...)` now returns `--user-data-dir="C:\..."` for WSL -> Windows Chrome launches
    - `tests/browser-service/chromeLifecycle.test.ts`
      - add a regression asserting the quoted Windows path token
  - Verification:
    - `pnpm vitest run tests/browser-service/chromeLifecycle.test.ts --maxWorkers 1`
    - `pnpm vitest run tests/browser-service/windowsChromeDiscovery.test.ts --maxWorkers 1`

- 2026-03-27: Repeated browser actions should reuse existing service tabs before opening new ones
  - Symptom: repeated `auracall login`, remote browser attaches, and Grok project actions could leave behind a growing pile of same-service tabs because different layers independently fell back to raw `CDP.New(...)`.
  - Root cause: browser-service had no single shared tab-open policy. Manual login already knew how to reuse an exact URL or `about:blank`, but remote attach and the Grok adapter still eagerly created new pages.
  - Fix:
    - `packages/browser-service/src/chromeLifecycle.ts`
      - added `openOrReuseChromeTarget(...)`
      - default policy is now: exact URL -> blank/new-tab -> same-origin reuse -> compatible-host family reuse -> new tab
      - after selecting/opening a target, trim the obvious stockpile cases:
        - keep the selected tab
        - keep at most 3 matching-family tabs
        - keep at most 1 spare blank/new-tab page
        - if CDP window ids are available, close extra windows only when every tab in that window is disposable for the same profile/service action
      - `connectToRemoteChrome(...)` now uses that policy instead of always opening a dedicated new tab
    - `packages/browser-service/src/manualLogin.ts`
      - login-tab opening now reuses same-origin service pages too, not just exact URL / blank
    - `src/browser/providers/grokAdapter.ts`
      - Grok’s last-resort project/home target opening now uses the shared helper instead of direct `CDP.New(...)`
    - `src/browser/urlFamilies.ts`
      - added explicit browser-service host families, starting with ChatGPT `chatgpt.com` + `chat.openai.com`
    - `src/browser/login.ts` and `src/browser/index.ts`
      - pass compatible host families into manual login and remote attach so ChatGPT host migrations reuse the existing service tab instead of opening a sibling host tab
    - tests
      - `tests/browser-service/chromeTargetReuse.test.ts`
      - `tests/browser/manualLogin.test.ts`
  - Verification:
    - `pnpm vitest run tests/browser-service/chromeTargetReuse.test.ts tests/browser/manualLogin.test.ts tests/browser/browserLoginCore.test.ts tests/browser/browserService.test.ts --maxWorkers 1`
    - `pnpm run check`
  - Additional finding: compatible-host reuse should stay explicit per service. The generic fallback should not guess that unrelated hosts are interchangeable just because the page shape happens to look similar.
  - Additional finding: window cleanup must stay profile-scoped and conservative. The safe line is “close obviously disposable extra windows,” not “try to enforce one global browser window.”

- 2026-03-27: Grok conversation context cache writes failed for nested files, and project conversation lists could stick on generic `Chat` titles
  - Symptom:
    - `auracall conversations context get ... --target grok` failed with `ENOENT ... /contexts/<id>.json`
    - project conversation lists could keep showing generic titles like `Chat` even after the real conversation title was available elsewhere in the UI
  - Root cause:
    - `src/browser/providers/cache.ts` only created the provider cache root, not the parent directory for nested cache files like `contexts/<id>.json`
    - `src/browser/providers/grokAdapter.ts` merged raw/sidebar/history/open conversation records with a first-write-wins strategy, so a low-quality raw title could permanently dominate a better history/sidebar title
  - Fix:
    - `src/browser/providers/cache.ts`
      - `writeProviderCache(...)` now creates `path.dirname(cacheFile)` so nested conversation/project cache writes succeed
    - `src/browser/providers/grokAdapter.ts`
      - added `grokConversationTitleQuality(...)` and `choosePreferredGrokConversation(...)`
      - `listConversations(...)` now merges duplicate conversation ids by title quality / timestamp / URL quality instead of “first source wins forever”
      - added post-submit rename verification in `renameConversationInHistoryDialog(...)`
    - tests
      - `tests/browser/providerCache.test.ts`
      - `tests/browser/grokAdapter.test.ts`
  - Verification:
    - `pnpm vitest run tests/browser/grokAdapter.test.ts tests/browser/providerCache.test.ts --maxWorkers 1`
    - live `conversations context get` on Grok now returns the expected messages instead of `ENOENT`
    - live `conversations --refresh --include-history` now resolves `e21addd2-1413-408a-b700-b78e2dbadaf8` as `AuraCall Maple Ledger`
  - Additional finding:
    - Grok’s old history-dialog workflow is no longer the dependable place for conversation rename/delete. On current live pages, the project-page `History` control is just an expanded header, while the real action surface appears to be the hidden root-sidebar `Options` button on each conversation row.

- 2026-03-27: Grok conversation rename/delete had moved from the old history dialog to the root sidebar row menu
  - Symptom:
    - `auracall rename ... --target grok` and `auracall delete ... --target grok` were failing with `History dialog did not open`
    - live DOM inspection showed the target conversation still existed in the root sidebar, with a hidden per-row `Options` button and a Radix menu containing `Rename`, `Pin`, and `Delete`
  - Root cause:
    - the old implementation still assumed Grok conversation actions lived behind the history dialog
    - on the current UI, the project-page `History` control is just a collapsible header, while the real conversation action surface is the root sidebar row menu
  - Fix:
    - `src/browser/providers/grokAdapter.ts`
      - added helpers to tag the target sidebar row and hidden `Options` button
      - added `openGrokConversationSidebarMenu(...)`
      - added sidebar-specific rename/delete verification waits
      - `renameConversation(...)` and `deleteConversation(...)` now use the root sidebar `Options` menu first and only fall back to the old history-dialog flow if the sidebar path fails
  - Verification:
    - live rename of `e21addd2-1413-408a-b700-b78e2dbadaf8` to `AuraCall Maple Harbor` succeeded
    - live delete of that same conversation succeeded
    - follow-up `conversations --refresh --include-history` no longer listed the deleted conversation

- 2026-03-27: Grok live verification needed one explicit WSL-primary acceptance checklist instead of scattered ad hoc smoke commands
  - Symptom:
    - Grok project and conversation CRUD were being repaired successfully, but the repo still lacked one concrete "done" checklist for deciding when the WSL Grok path was actually fully functional.
    - `docs/manual-tests.md` only pointed loosely at `docs/dev/smoke-tests.md`, so the runbook did not clearly say which Grok operations had to pass together before calling the feature complete.
  - Root cause:
    - Live debugging had outpaced the smoke documentation. Each repair was being logged in the journal/fixes log, but the acceptance bar stayed implicit.
  - Fix:
    - `docs/dev/smoke-tests.md`
      - added `Grok Acceptance (WSL Chrome Primary)` with concrete steps for:
        - project create/list/rename/clone
        - project instructions get/set
        - project files add/list/remove
        - conversation create/list/context/rename/delete
        - markdown capture
        - cache freshness and cleanup
      - documented the Grok naming constraint: avoid timestamp-heavy disposable names because they can trip the backend `contains-phone-number` validator
    - `docs/manual-tests.md`
      - now points directly to that acceptance checklist as the canonical Grok runbook
    - `docs/testing.md`
      - now calls out the same checklist as the Grok "fully functional" bar
    - `docs/dev/llmservice-phase-7.md`
      - updated the Phase 7 smoke section so the plan references the same acceptance bar
  - Verification:
    - doc-only update; verified by reading the linked docs together and confirming they now point to the same checklist
  - Additional finding:
    - Windows Chrome should remain secondary/manual-debug coverage until its human-session and debug-session behavior are cleanly separated. The current Grok acceptance bar should stay WSL-primary rather than pretending both paths are equally mature.

- 2026-03-27: Grok project-file upload/list needed stronger saved-state verification on the WSL acceptance path
  - Symptom:
    - the first live `projects files list <project_id> --target grok` run failed with `Personal files modal not found`, while the immediate retry succeeded
    - uploading `/tmp/auracall-grok-stress/medium.jsonl` printed `Uploaded 1 file(s)...`, but a fresh file list never showed `medium.jsonl`
  - Root cause:
    - `src/browser/providers/grokAdapter.ts` still assumed the Personal Files modal would expose its search input immediately after the opener click
    - the upload path only verified transient modal state before `Save`; it never re-read the saved project state, so silently dropped Grok files looked like success
  - Fix:
    - `src/browser/providers/grokAdapter.ts`
      - hardened `ensurePersonalFilesModalOpen(...)` with retries and a broader wait that accepts the current delayed `Personal files` dialog
      - added `parseGrokPersonalFilesRowTexts(...)` and `readVisiblePersonalFilesWithClient(...)` so list/upload verification share one file-row parser
      - added `waitForProjectFilesPersisted(...)` after `clickPersonalFilesSaveWithClient(...)`, so Aura-Call now reopens the project file surface after Save and fails if the requested file names never actually persist
    - `tests/browser/grokAdapter.test.ts`
      - added parser coverage for file row text normalization and trailing size parsing
    - `docs/dev/smoke-tests.md`
      - extended the Grok acceptance runbook with a file-stress step and documented that unique file names are the primary correctness check
  - Verification:
    - `pnpm vitest run tests/browser/grokAdapter.test.ts tests/browser/grokActions.test.ts --maxWorkers 1`
    - live multi-file add/list/remove/delete on disposable project `e130b1b0-10b9-410b-97cd-e4f62c8a349e` succeeded on the WSL Grok profile
    - live medium-file upload now fails honestly with `Uploaded file(s) did not persist after save: medium.jsonl`
  - Additional finding:
    - Same-name duplicate uploads are still a provider/product ambiguity. Grok appears willing to accept duplicate names, but the current list/remove surfaces are name-based, so duplicate-name behavior should remain an exploratory stress case, not the primary acceptance bar.

- 2026-03-27: Full WSL Grok acceptance still fails on project-scoped conversation refresh after a real project prompt run
  - Symptom:
    - a full disposable WSL acceptance pass got through project create/rename/clone, instructions get/set, unique-file add/list/remove, medium-file rejection, and the project-scoped browser prompt itself
    - but `auracall conversations --target grok --project-id 628cae8a-8918-4567-912f-e44fde3ee3e0 --refresh --include-history` did not yield the newly created project conversation in a usable list
    - the same acceptance run then hit a related cleanup drift: `projects remove` for the disposable project/clone could land on a menu whose visible items were just `Conversations`, not the project action menu
  - Root cause:
    - project-scoped conversation refresh still did not have one dependable source of truth for "conversations that belong to this project after a real prompt run"
    - the previous implementation was too broad in one direction (root/global history results being tagged with the active `projectId`) and too narrow in another (a corrected project-page scrape still returning `[]` even though session metadata proved a project chat URL existed)
    - the disposable project cleanup drift indicates there is still a project/conversation menu-surface ambiguity on the current Grok page state
  - Fix:
    - `src/browser/providers/grokAdapter.ts`
      - stopped forcing project-scoped `includeHistory` onto the root `https://grok.com/` history path
      - project-scoped raw scraping now ignores nodes inside the main sidebar wrapper
      - open-tab fallback now only keeps Grok tabs whose URL actually belongs to the requested `/project/<id>`
    - This removed the earlier over-inclusive project conversation pollution, but it did not yet solve the deeper problem: the project-scoped list still comes back empty for the live disposable project
  - Verification:
    - `pnpm vitest run tests/browser/grokAdapter.test.ts --maxWorkers 1`
    - `pnpm run check`
    - live partial acceptance on:
      - project `628cae8a-8918-4567-912f-e44fde3ee3e0` / `AuraCall Harbor nzlqec`
      - clone `17e57d61-ce6c-4e41-b13c-3f64582daaa2` / `AuraCall Orbit nzlqec`
    - live blocker repro:
      - `DISPLAY=:0.0 timeout 45s pnpm tsx bin/auracall.ts conversations --target grok --project-id 628cae8a-8918-4567-912f-e44fde3ee3e0 --refresh --include-history`
      - result: `[]`
    - live browser-session evidence of the missing conversation still existing:
      - `~/.auracall/sessions/reply-exactly-with-auracall-maple-2/meta.json` recorded
        - project id `628cae8a-8918-4567-912f-e44fde3ee3e0`
        - tab URL `.../project/628cae8a-...?...chat=f3241435-0667-437d-b6ae-246f7815b1ec...`
        - conversation id `f3241435-0667-437d-b6ae-246f7815b1ec`
  - Additional finding:
    - The WSL Grok path is closer, but not done. Before calling it "fully functional," Aura-Call still needs one reliable project-scoped conversation source and a cleanup/remove path that cannot drift from the project menu onto the conversations UI.

- 2026-03-27: Project-scoped Grok conversation refresh now uses the project conversations tab and no longer trashes the global conversation cache
  - Symptom:
    - the live WSL acceptance project had a real conversation and chat id in session metadata, but `auracall conversations --target grok --project-id <id> --refresh --include-history` still returned `[]`
    - the same project-scoped refresh path was also overwriting the shared `~/.auracall/cache/providers/grok/<identity>/conversations.json`, so a failed project refresh could wipe the global cache to `[]`
    - disposable project cleanup was brittle because the tagged project-row menu strategy could throw before broader fallback menu-open paths had a chance to run
  - Root cause:
    - `src/browser/providers/grokAdapter.ts` still treated project-scoped conversation listing too much like the broad global conversation scrape. Even after narrowing some earlier selectors, the code still depended on mixed surfaces instead of the actual project conversations tab that Grok renders in `main`.
    - conversation cache storage was keyed only by provider + identity, not by project scope, so project-scoped refreshes and global refreshes shared the same `conversations.json`.
    - `openProjectMenuButton(...)` hard-failed when the tagged sidebar project row was transient, even though the broader menu-button fallbacks could still have succeeded.
  - Fix:
    - `src/browser/providers/grokAdapter.ts`
      - added a focused project-conversation readiness wait
      - added direct project-tab conversation extraction from `main [role="tabpanel"]` / `main`
      - changed project-scoped `listConversations(...)` to prefer that focused project list, with project history only as fallback
      - relaxed the tagged project-row menu-open path so transient row-selector failures fall through to other menu strategies
    - `src/browser/providers/types.ts`
      - added `projectId` to `BrowserProviderListOptions`
    - `src/browser/providers/cache.ts`
      - project-scoped conversation lists now use `project-conversations/<projectId>.json`
    - `src/browser/llmService/cache/store.ts`
      - JSON and SQLite conversation-list storage now honor the same project scope
    - `src/browser/llmService/llmService.ts`
    - `src/browser/llmService/providers/grokService.ts`
    - `src/browser/llmService/providers/chatgptService.ts`
    - `bin/auracall.ts`
      - propagated project scope consistently through conversation list resolution and cache writes
    - `tests/browser/providerCache.test.ts`
      - added regression coverage for the project-scoped cache path
  - Verification:
    - `pnpm vitest run tests/browser/grokAdapter.test.ts tests/browser/providerCache.test.ts --maxWorkers 1`
    - `pnpm run check`
    - live:
      - `DISPLAY=:0.0 timeout 45s pnpm tsx bin/auracall.ts conversations --target grok --project-id 628cae8a-8918-4567-912f-e44fde3ee3e0 --refresh --include-history`
        - returned `f3241435-0667-437d-b6ae-246f7815b1ec` / `AuraCall Maple Ledger`
      - `DISPLAY=:0.0 timeout 45s pnpm tsx bin/auracall.ts conversations context get f3241435-0667-437d-b6ae-246f7815b1ec --target grok --project-id 628cae8a-8918-4567-912f-e44fde3ee3e0 --json-only`
        - returned the expected project prompt/response pair
      - verified the project-scoped cache landed in `project-conversations/628cae8a-8918-4567-912f-e44fde3ee3e0.json`
      - removed disposable clone `17e57d61-ce6c-4e41-b13c-3f64582daaa2`
      - removed disposable project `628cae8a-8918-4567-912f-e44fde3ee3e0`
      - fresh `projects --target grok --refresh` no longer listed either disposable project
  - Additional finding:
    - This repair fixed correctness, but not yet the global title-quality issue. A follow-up metadata overlay is still needed so the root conversation list can reuse stronger project-scoped titles instead of regressing to `Chat`.

- 2026-03-27: Global Grok conversation lists now reuse stronger project-scoped titles instead of generic `Chat`
  - Symptom:
    - after the project-scoped refresh fix landed, project-scoped conversation list/context calls were correct, but the global `auracall conversations --target grok --refresh --include-history` output could still show the same conversation id as generic `Chat`
    - the weaker title could also persist in the global `conversations.json`, which meant cache-backed selectors/export surfaces could inherit the worse metadata too
  - Root cause:
    - global conversation metadata and project-scoped conversation metadata were still treated as parallel datasets with no reconciliation layer when reading the global list
    - the user-facing CLI conversation list path was still calling the provider directly, bypassing any cache-side metadata overlay
  - Fix:
    - `src/browser/llmService/cache/store.ts`
      - added a read-time conversation overlay for global conversation reads
      - JSON cache store now merges the global conversation list with `project-conversations/*.json`
      - SQLite cache store now merges all `conversations` datasets (global + project-scoped entity ids) when reading the global list
      - Grok reconciliation reuses `choosePreferredGrokConversation(...)` so specific project titles beat generic placeholders like `Chat`
    - `src/browser/llmService/llmService.ts`
      - added a shared helper for overlaying global conversation lists through the cache layer
    - `src/browser/llmService/providers/grokService.ts`
      - global Grok conversation listing now routes through that cache-backed overlay before returning to callers
    - `bin/auracall.ts`
      - the user-facing `conversations` command now uses `llmService.listConversations(...)` instead of calling the provider directly
    - `tests/browser/providerCache.test.ts`
      - added JSON + SQLite regression coverage proving a project-scoped `AuraCall Maple Ledger` title wins over a global `Chat` placeholder for the same id
  - Verification:
    - `pnpm vitest run tests/browser/providerCache.test.ts tests/browser/grokAdapter.test.ts --maxWorkers 1`
    - `pnpm run check`
    - live:
      - `DISPLAY=:0.0 timeout 45s pnpm tsx bin/auracall.ts conversations --target grok --refresh --include-history`
        - now shows `AuraCall Maple Ledger` for `f3241435-0667-437d-b6ae-246f7815b1ec`
      - verified the persisted global cache entry in `~/.auracall/cache/providers/grok/ez86944@gmail.com/conversations.json` now carries the stronger title for that same id
  - Additional finding:
    - The remaining Grok title work is now general ranking/normalization polish. The concrete project-scoped-vs-global `Chat` regression is fixed.

- 2026-03-27: WSL Grok acceptance blockers cleared for project conversation empty-state, project cleanup, and clone rename stability
  - Symptom:
    - after the project-scoped conversation fixes landed, the full disposable WSL Grok acceptance run still had three remaining blockers:
      - after deleting the last project conversation, `conversations --project-id ... --refresh` could fail with `Project conversations list did not load`
      - `projects remove ...` could actually delete the project in Grok but still throw afterward because Aura-Call reopened menus or retried against a page that had already been torn down
      - `projects clone <id> <new-name>` could leave the inline rename editor open and print `Clone rename failed: Project rename stayed in edit mode`
  - Root cause:
    - the project conversation readiness probe only recognized rows or the older `start a conversation in this project` text, not Grok's current empty-state copy `No conversations yet`
    - project conversation delete still ignored `projectId` and started from the generic projects index instead of the actual project conversation list
    - project cleanup reopened the wrong menu surface in some states (sidebar row `Options` instead of the page-level project menu), then retried into a dead/invalid page after the project had already been deleted
    - clone rename used a brittle 3-second “input disappeared” check instead of waiting for the new title to actually apply
  - Fix:
    - `src/browser/providers/grokAdapter.ts`
      - `waitForProjectConversationList(...)` now treats `No conversations yet` as a loaded project conversation surface
      - `deleteConversation(...)` now mirrors `renameConversation(...)` and uses the actual project page + project conversation list when `--project-id` is present
      - `openProjectMenuButton(...)` now prefers the page-level `Open menu` inside `main` before sidebar row `Options`
      - `selectRemoveProjectItem(...)` now chooses `Remove` or `Delete` from a single opened menu instead of reopening label-specific fallbacks
      - `pushProjectRemoveConfirmation(...)` now confirms an existing remove dialog first and treats an invalid/deleted project page after confirmation as success
      - project rename now waits for the new title to land and retries one more submit/blur cycle before failing
  - Verification:
    - `pnpm vitest run tests/browser/grokAdapter.test.ts tests/browser/grokActions.test.ts tests/browser/providerCache.test.ts --maxWorkers 1`
    - `pnpm run check`
    - live:
      - the final disposable WSL acceptance run completed cleanly end to end with:
        - project create / rename / clone
        - instructions get/set
        - unique-file add/list/remove
        - medium-file guard failing explicitly as intended
        - project conversation create / context / rename / delete
        - markdown-preserving browser capture
        - clone cleanup + source cleanup both returning success
      - focused project cleanup repro passed after the final fixes:
        - created `AuraCall Cedar Atlas qpwlyc`
        - cloned + renamed to `AuraCall Cedar Orbit qpwlyc`
        - removed clone `c0a97011-5a88-4298-a512-5d68927d2d1a`
        - removed source `4188013b-78f2-43b1-9102-0378581ed047`
        - refreshed project list no longer showed either disposable project
  - Additional finding:
    - WSL Grok CRUD is no longer blocked on the current live UI. The next reliability investment should be a scripted acceptance runner wired directly to `docs/dev/smoke-tests.md`.

- 2026-03-27: Project-scoped Grok conversation context no longer prepends project instructions into the first assistant message
  - Symptom:
    - after the live WSL Grok acceptance runner went green, one residual quality issue remained: project-scoped `conversations context get ... --project-id ...` could return the project instructions text duplicated at the start of the first assistant message payload
    - that polluted downstream cache/export consumers even when the actual user prompt and assistant answer were otherwise correct
  - Root cause:
    - the llmService conversation-context path did not persist project instructions into its cache store consistently, and it had no reconciliation step to strip a duplicated project-instructions prefix from live project-scoped assistant payloads before caching them
  - Fix:
    - `src/browser/llmService/llmService.ts`
      - added `stripProjectInstructionsPrefixFromConversationContext(...)`, a project-scoped normalization helper that removes an exact instructions prefix from the first assistant message only when real assistant content remains after the prefix
      - `createProject(...)`, `updateProjectInstructions(...)`, and `getProjectInstructions(...)` now write the latest project instructions into the cache store
      - `getConversationContext(...)` now reads cached project instructions for `--project-id ...`, applies the prefix-strip normalization when needed, then writes the cleaned context back to cache
    - `tests/browser/llmServiceContext.test.ts`
      - added focused regression coverage for both the positive prefix-strip case and the “instructions text appears later, so do not strip” case
  - Verification:
    - `pnpm vitest run tests/browser/llmServiceContext.test.ts tests/browser/providerCache.test.ts tests/browser/grokActions.test.ts --maxWorkers 1`
    - `pnpm run check`
    - live:
      - created disposable project `f9bd98f3-ffbd-4158-b40c-f95231111216`
      - created project conversation `6bfb2942-a443-4cf5-8bf4-23a82e3f264d`
      - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts conversations context get 6bfb2942-a443-4cf5-8bf4-23a82e3f264d --target grok --project-id f9bd98f3-ffbd-4158-b40c-f95231111216 --json-only`
        - returned the clean assistant text (`Context Probe Inspect`) with no duplicated project instructions prefix
  - Additional finding:
    - the earlier leaked-prefix case did not reproduce on the fresh probe after the broader Grok fixes, so this normalization now acts as a defensive safeguard against future Grok payload drift rather than masking an actively reproducible live bug.

- 2026-03-27: Grok project file CRUD now writes through to the `project-knowledge` cache/catalog dataset
  - Symptom:
    - the live WSL Grok file CRUD surface (`projects files add/list/remove`) was working in the browser, but Aura-Call was treating it as transient UI state
    - `cache files list --provider grok --project-id <id> --dataset project-knowledge` was not being refreshed by live project-file mutations, even though the cache schema and export/catalog tooling already had a dedicated `project-knowledge` dataset for durable project files
  - Root cause:
    - `src/browser/llmService/llmService.ts` exposed `listProjectFiles(...)`, `uploadProjectFiles(...)`, and `deleteProjectFile(...)`, but none of those methods wrote through to `cacheStore.writeProjectKnowledge(...)`
    - the scripted WSL Grok acceptance runner only verified the visible project file list, not the normalized cache/catalog view
  - Fix:
    - `src/browser/llmService/llmService.ts`
      - `listProjectFiles(...)` now refreshes `project-knowledge` from the live provider list
      - `uploadProjectFiles(...)` and `deleteProjectFile(...)` now re-read the live provider list after mutation and write the post-mutation state into `project-knowledge`
      - `createProject(...)` now does the same when a project is created with initial files attached
    - `tests/browser/llmServiceFiles.test.ts`
      - added focused regression coverage proving list/add/remove all write the correct `project-knowledge` cache state
    - `scripts/grok-acceptance.ts`
      - extended the live WSL acceptance runner to assert that `cache files list --provider grok --project-id <id> --dataset project-knowledge` matches the visible file CRUD state after single-file upload, single-file removal, and multi-file upload
    - `docs/dev/smoke-tests.md`, `docs/testing.md`
      - updated the Grok file acceptance bar to require project-knowledge cache freshness, not just the visible file list
    - `tests/browser/grokActions.test.ts`
      - stabilized the plain-text response unit by giving the mock one more steady snapshot and a slightly wider wait budget so the focused validation suite stays clean
  - Verification:
    - `pnpm vitest run tests/browser/llmServiceFiles.test.ts tests/browser/providerCache.test.ts tests/browser/grokActions.test.ts tests/browser/llmServiceContext.test.ts --maxWorkers 1`
    - `pnpm run check`
    - live:
      - `DISPLAY=:0.0 pnpm tsx scripts/grok-acceptance.ts --json`
      - passed with disposable project `aa02d27a-8a0c-4c7d-b006-92906f10e11b`, clone `bd23e825-a28a-43ee-948c-63a16605eef7`, and conversation `d6352fd9-34c2-4056-8697-ae670ae90e7e`
      - project file CRUD and `cache files list --dataset project-knowledge` agreed on `grok-file.txt`, `grok-file-a.txt`, and `grok-file-b.md`
      - medium-file guard still failed explicitly as intended with `Uploaded file(s) did not persist after save: grok-medium.jsonl`
  - Additional finding:
    - The remaining Grok file work is now about breadth of file surfaces, not persistence correctness for project files. Project files are now durable in both the live browser view and Aura-Call’s normalized cache/catalog view.

- 2026-03-27: Grok account-wide `/files` CRUD now works and is part of the WSL acceptance bar
  - Symptom:
    - Aura-Call only handled Grok project knowledge files, but Grok also exposes an account-wide `/files` page from the avatar menu
    - that master file list matters because Grok enforces a 1 GB account storage quota there
    - without support for the account-wide surface, Aura-Call could accumulate files and leave users blind to quota usage
  - Root cause:
    - the provider/cache/CLI model only covered project files and conversation files/attachments
    - the live Grok `/files` page has its own row parser, upload input, and a separate two-step inline delete flow (`Delete file`, then row-local `Delete`)
  - Fix:
    - `src/browser/providers/types.ts`, `src/browser/providers/domain.ts`, `src/browser/providers/cache.ts`
      - added account-file provider methods, source typing, and `account-files.json`
    - `src/browser/llmService/cache/store.ts`, `cache/catalog.ts`, `cache/export.ts`, `cache/index.ts`
      - added the `account-files` dataset across JSON + SQLite storage, catalog, and export
    - `src/browser/llmService/llmService.ts`
      - added cache-backed live account-file list/add/remove methods
    - `src/browser/providers/grokAdapter.ts`
      - implemented the live `/files` page adapter, including the current two-step inline delete sequence
    - `bin/auracall.ts`
      - added `auracall files add`, `auracall files list`, and `auracall files remove`
    - `scripts/grok-acceptance.ts`, `docs/dev/smoke-tests.md`, `docs/testing.md`, `docs/manual-tests.md`
      - added account-wide `/files` CRUD plus `account-files` cache freshness to the canonical WSL Grok acceptance bar
  - Verification:
    - `pnpm vitest run tests/browser/grokAdapter.test.ts tests/browser/llmServiceFiles.test.ts --maxWorkers 1`
    - `pnpm run check`
    - live:
      - uploaded disposable account file `auracall-account-files-smoke-1774669753.txt`
      - listed it as Grok file id `3849f21d-c354-4ee0-a8b6-47258d41fd46`
      - removed it successfully with `auracall files remove 3849f21d-c354-4ee0-a8b6-47258d41fd46 --target grok`
      - refreshed `auracall files list --target grok` no longer showed the file
      - refreshed `cache files list --provider grok --dataset account-files --query auracall-account-files-smoke-1774669753` returned `count: 0`
  - Additional finding:
    - The first live delete attempt revealed that Grok account-file removal is not modal-based like project Personal Files. It stages delete inline on the row, so the adapter must explicitly drive the second row-local `Delete` action.

- 2026-03-28: Remaining Grok CRUD plan is now explicit, and conversation file listing/cache parity has started
  - Symptom:
    - after the WSL Grok acceptance bar went green, the remaining CRUD work was still only described conversationally
    - the cache/export layer already modeled `conversation-files` and `conversation-attachments`, but there was no stable service/CLI entry point for conversation-scoped files
  - Fix:
    - added `docs/dev/grok-remaining-crud-plan.md` to make the remaining scope explicit and prioritized
    - wired the plan into `docs/dev/smoke-tests.md`, `docs/testing.md`, and `docs/manual-tests.md`
    - started the first implementation slice:
      - `src/browser/providers/types.ts`
        - `listConversationFiles(...)` now accepts list options
      - `src/browser/llmService/llmService.ts`
        - added `listConversationFiles(...)`
        - added `refreshConversationFilesCache(...)`
        - falls back to `readConversationContext(...).files` when no dedicated provider list method exists
      - `bin/auracall.ts`
        - added `auracall conversations files list <conversationId> [--project-id <id>]`
      - `tests/browser/llmServiceFiles.test.ts`
        - added focused coverage for provider-backed and context-fallback conversation file cache writes
  - Verification:
    - pending focused tests + typecheck
  - Additional finding:
    - The right first step is read/list/cache parity, not upload/delete. It gives the next live Grok adapter work a stable surface to target instead of another one-off browser patch.

- 2026-03-28: Grok conversation-file read parity now uses the live sent-turn file chips, not just service/cache scaffolding
  - Symptom:
    - `auracall conversations files list <conversationId> --target grok` existed at the service/CLI level, but Grok still had no live adapter-backed conversation-file surface
    - the first landing zone depended on provider `listConversationFiles(...)` when available, otherwise on `readConversationContext(...).files`, but Grok exposed neither
  - Fix:
    - live-probed the current WSL Grok conversation page and confirmed the real file surface:
      - user message rows render file chips above the bubble
      - the chip exposes filename text and an icon `aria-label` such as `Text File`
      - the row does not expose a provider file id or remote link
    - `src/browser/providers/grokAdapter.ts`
      - added `mapGrokConversationFileProbes(...)`
      - added `readVisibleConversationFilesWithClient(...)`
      - added Grok `listConversationFiles(...)`
      - updated `readConversationContext(...)` to include `files[]`
      - added a short polling window so context reads do not sample before file chips finish rendering
    - `tests/browser/grokAdapter.test.ts`
      - added focused coverage for conversation-file probe mapping/deduping
  - Verification:
    - `pnpm vitest run tests/browser/grokAdapter.test.ts tests/browser/llmServiceFiles.test.ts --maxWorkers 1`
    - live:
      - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts conversations files list 07adb712-2304-4746-adfd-2c87c888cec0 --target grok`
      - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts conversations context get 07adb712-2304-4746-adfd-2c87c888cec0 --target grok --json-only`
      - confirmed cache write at `~/.auracall/cache/providers/grok/ez86944@gmail.com/conversation-files/07adb712-2304-4746-adfd-2c87c888cec0.json`
  - Additional finding:
    - Grok conversation-file rows currently do not expose a durable provider-side file id. Aura-Call must synthesize stable ids from conversation id + response row id + chip index until Grok surfaces something richer.
    - Grok currently exposes mutation asymmetrically on conversations:
      - existing conversation composers still have `Attach` for the next turn
      - already-sent file chips only open a read-only preview aside with `Close`
      - no delete/remove/download control was visible on the sent file surface

- 2026-03-28: WSL Grok scripted acceptance is green again after fixing project-create verification, root submit/attach commit, multiline composer input, and `/files` readiness
  - Symptom:
    - after the conversation-file work landed, the full WSL acceptance runner still failed in several real ways:
      - `projects create` could fail even though Grok had actually created the project
      - root/non-project browser runs with an attached file could stage the prompt and attachment but never commit the turn
      - multiline markdown prompts on the live Grok `ProseMirror` composer could be flattened before send
      - `/files` refreshes could falsely fail with `Grok files page did not load` right after a successful delete
  - Root cause:
    - project-create verification only trusted immediate post-submit URL navigation instead of also consulting the live visible project list
    - the Grok send path was too optimistic about when a visible enabled submit control existed and whether a click actually committed the turn
    - the composer input path treated Grok's `ProseMirror` more like a plain text input and could lose line breaks/fence structure
    - the `/files` readiness gate required a narrower page shape than Grok currently presents during some post-delete refresh states
  - Fix:
    - `scripts/grok-acceptance.ts`
      - added a disposable root/non-project conversation-file step to the canonical WSL acceptance runner
      - added polling helper reuse for new conversation discovery instead of a one-shot list diff
    - `src/browser/providers/grokAdapter.ts`
      - added project-create recovery by exact normalized project name against the visible project surfaces
      - hardened the create-project name setters so the entered name must actually stick before continuing
      - broadened the `/files` readiness gate to accept the current usable heading/search/upload/empty-state combinations
    - `src/browser/actions/grok.ts`, `src/browser/index.ts`
      - made `setGrokPrompt(...)` preserve multiline `ProseMirror` content more defensively
      - made `submitGrokPrompt(...)` wait for a real enabled submit, verify commit, and fall back to Enter if click alone does not commit the turn
    - `tests/browser/grokActions.test.ts`, `tests/browser/grokAdapter.test.ts`
      - updated focused regression coverage for the stronger Grok submit/project-create paths
  - Verification:
    - `pnpm vitest run tests/browser/grokActions.test.ts tests/browser/grokAdapter.test.ts --maxWorkers 1`
    - `pnpm run check`
    - live:
      - root file probe returned `AuraCall Root Submit Probe` with `files=1`
      - multiline markdown probe preserved `- alpha` plus the fenced `txt` block
      - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx scripts/grok-acceptance.ts --json` returned `ok: true`
  - Additional finding:
    - The WSL-primary Grok bar is no longer blocked on core CRUD correctness. The remaining Grok work is now follow-on quality/breadth work plus quota cleanup of disposable artifacts left behind by failed intermediate runs.

- 2026-03-28: Grok `/files` needed a navigation fallback even after the broader ready-gate fix
  - Symptom:
    - `auracall files list --target grok` could still fail with `Grok files page did not load` during quota cleanup, even though the live WSL browser clearly showed a valid `Files - Grok` page with:
      - `Files`
      - `Add new file`
      - row `Options`
      - the expected disposable file names
  - Root cause:
    - the `/files` ready predicate was already correct on the live DOM
    - the remaining failure was the route/attach path into `/files`: Aura-Call could attach on an existing Grok tab, call `Page.navigate(...)`, and then give up before the SPA route fully settled on the files surface
  - Fix:
    - `src/browser/providers/grokAdapter.ts`
      - added `waitForGrokFilesPath(...)`
      - updated `navigateToGrokFiles(...)` to retry with an in-page `location.assign(...)` fallback before the ready gate gives up
    - verification:
      - the exact `/files` ready predicate evaluated to `ok: true` on the live page after direct CDP inspection
      - `pnpm vitest run tests/browser/grokAdapter.test.ts --maxWorkers 1`
      - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts files list --target grok`
  - Additional finding:
    - The lingering Grok `/files` flake was no longer about selector coverage. It was a navigation/settling race on top of an otherwise valid page.

- 2026-03-28: Cleaned the stale Grok acceptance artifacts after the WSL pass went green
  - Work completed:
    - removed the leftover `AuraCall ...` disposable projects created by failed intermediate passes
    - removed the disposable Grok account-file artifacts named like:
      - `grok-file*`
      - `grok-conversation-file*`
      - `grok-root-file*`
      - `grok-acceptance-*`
      - `auracall-conversation-file-probe-*`
  - Verification:
    - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts projects --target grok --refresh`
      - remaining projects now: `SoyLei`, `Oracle (clone)`, `Oracle`
    - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts files list --target grok`
      - no `grok-file*`, `grok-conversation-file*`, `grok-root-file*`, or `grok-acceptance-*` rows remained
    - `ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts cache files list --provider grok --dataset account-files --query grok-file`
      - returned `count: 0`
    - `ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts cache files list --provider grok --dataset account-files --query grok-conversation-file`
      - returned `count: 0`
  - Additional finding:
    - The remaining account-file rows are non-disposable uploads (for example `dup.txt`, `notes.txt`, `spec.md`, doc files, images, and browser-service docs) rather than the acceptance/debug artifacts this cleanup targeted.

- 2026-03-28: `auracall conversations files add ...` could succeed in Grok and still die afterward while refreshing `conversation-files`
  - Symptom:
    - the first live `auracall conversations files add <conversationId> --target grok --prompt ... -f ...` appended the file and follow-up turn successfully, but then exited with:
      - `TypeError: Cannot read properties of undefined (reading 'webSocketDebuggerUrl')`
    - a follow-up context probe showed the mutation had actually happened, so the failure was in the post-send refresh path, not the Grok send itself
  - Root cause:
    - after `runBrowserMode(...)` returned, the CLI asked `llmService.listConversationFiles(...)` to rediscover the browser session
    - that rediscovery could race against Chrome shutdown and stale DevTools state instead of simply reusing the runtime endpoint that had just sent the turn
  - Fix:
    - `bin/auracall.ts`
      - `conversations files add` now keeps the just-used browser alive long enough to refresh `conversation-files` from that same runtime endpoint
      - if the caller did not request `keepBrowser`, the command now closes the browser explicitly after the refresh
    - `src/browser/llmService/llmService.ts`
      - `buildListOptions(...)` now treats explicit runtime `host` / `port` overrides as authoritative and skips service-target rediscovery for that case
    - `tests/browser/llmServiceFiles.test.ts`
      - added a regression that verifies explicit `host` / `port` overrides do not trigger browser rediscovery
  - Verification:
    - `pnpm vitest run tests/browser/llmServiceFiles.test.ts tests/browser/grokAdapter.test.ts --maxWorkers 1`
    - live fresh conversation `c7188321-f0e4-4c39-ba1f-75e6511dcd14`:
      - first-run `auracall conversations files add ...` returned success
      - `conversations files list`, `conversations context get --json-only`, and `cache files list --dataset conversation-files` all agreed on `grok-conversation-append-fix-22376b.txt`
  - Additional finding:
    - on the WSL Grok path, conversation-file mutation is now practical as append-only add, but Grok still does not expose delete controls for already-sent conversation file chips.

- 2026-03-28: deleting a conversation left stale `conversation-files` cache rows behind
  - Symptom:
    - after deleting live disposable conversation `c7188321-f0e4-4c39-ba1f-75e6511dcd14`, refreshed conversation history no longer listed it, but `cache files list --provider grok --conversation-id ... --dataset conversation-files` still returned the attached file row
  - Root cause:
    - the CLI delete flow refreshed the conversation list cache only
    - it never cleared the per-conversation `conversation-files` / `conversation-attachments` datasets for the deleted conversation id
  - Fix:
    - `bin/auracall.ts`
      - after successful delete, Aura-Call now writes empty `conversation-files` and `conversation-attachments` datasets for each deleted conversation before refreshing the conversation list cache
  - Verification:
    - live disposable conversation `740f3cbe-6790-4729-9952-5ea899053edb`:
      - created
      - appended file via `conversations files add`
      - deleted via `auracall delete ... --target grok --yes`
      - `cache files list --provider grok --conversation-id 740f3cbe-6790-4729-9952-5ea899053edb --dataset conversation-files` returned `count: 0`

- 2026-03-28: `browser.hideWindow` needed launch-time minimization and per-client focus suppression, not a process-global env toggle
  - Symptom:
    - headful Aura-Call browser runs on WSL/Linux could still steal focus even with `browser.hideWindow`
    - the first implementation used a process-global env var to suppress Grok `bringToFront()` calls, which was wrong for simultaneous multi-profile work
  - Root cause:
    - hiding/minimizing after Chrome launched was too late to prevent the initial focus grab
    - Grok still had its own `Page.bringToFront()` path
    - a process-wide env flag would leak focus policy across profiles/runs in one process
  - Fix:
    - `packages/browser-service/src/chromeLifecycle.ts`
      - add `--start-minimized` for headful `hideWindow` launches
      - export `wasChromeLaunchedByAuracall(...)`
      - tag fresh vs adopted Chrome handles so only newly launched windows are auto-hidden
    - `packages/browser-service/src/manualLogin.ts`, `src/browser/index.ts`, `src/browser/reattach.ts`, `src/browser/reattachCore.ts`
      - only auto-hide Aura-Call-launched windows
      - manual-login launch now reapplies hide after opening the initial target URL
    - `src/browser/providers/grokAdapter.ts`
      - replace the process-global focus-suppression env var with per-client metadata
    - tests:
      - `tests/browser-service/chromeLifecycle.test.ts`
      - `tests/browser-service/chromeTargetReuse.test.ts`
      - `tests/browser/manualLogin.test.ts`
      - `tests/browser/grokAdapter.test.ts`
  - Verification:
    - `pnpm vitest run tests/browser-service/chromeLifecycle.test.ts tests/browser-service/chromeTargetReuse.test.ts tests/browser/manualLogin.test.ts tests/browser/grokAdapter.test.ts tests/browser/config.test.ts tests/cli/browserConfig.test.ts --maxWorkers 1`
    - `pnpm run check`
    - live WSL disposable smoke:
      - `_NET_ACTIVE_WINDOW` before launch matched `_NET_ACTIVE_WINDOW` after launch/open (`unchanged: true`)
      - Chrome DevTools still reported `windowState: "normal"` on this X11 stack
  - Additional finding:
    - On the current WSL/X11 environment, "no focus steal" is the trustworthy invariant. DevTools window-bounds state is not a reliable minimized-state oracle there.

- 2026-03-28: browser-service needed an explicit DOM-drift extraction plan after the Grok stabilization push
  - Symptom:
    - repeated Grok fixes kept landing in adapter code even when the failure class was generic:
      - SPA route settling
      - hover-only row actions
      - multi-surface action fallbacks
      - weak failure diagnostics
  - Root cause:
    - the package backlog did not yet spell out the next concrete extractions, so the path of least resistance was another provider-local patch
  - Fix:
    - expanded `docs/dev/browser-service-upgrade-backlog.md` with the current DOM-drift plan and priority order:
      - `navigateAndSettle(...)`
      - anchored row/menu action helpers
      - structured UI diagnostics wrappers
      - canonical action-surface fallback helpers
      - explicit per-client focus policy
      - optional failure snapshots
    - wired that plan into:
      - `AGENTS.md`
      - `docs/dev/browser-automation-playbook.md`
      - `docs/dev/browser-service-tools.md`
      - `docs/dev/smoke-tests.md`
  - Additional finding:
    - the most reusable lesson from the Grok work is not any one selector fix; it is that browser-service needs stronger post-condition helpers and better built-in diagnostics so DOM drift is cheaper to repair next time.

- 2026-03-28: started extracting SPA route settling into browser-service via `navigateAndSettle(...)`
  - Symptom:
    - Grok still had repeated provider-local route code:
      - `Page.navigate(...)`
      - document-ready polling
      - route predicate polling
      - fallback `location.assign(...)`
    - this was the same drift pattern we had already identified in the new backlog
  - Root cause:
    - browser-service had good wait primitives, but no single navigation helper that combined route settling with optional ready checks and a route fallback
  - Fix:
    - `packages/browser-service/src/service/ui.ts`
      - added `navigateAndSettle(...)`
    - `tests/browser-service/ui.test.ts`
      - added focused coverage for direct success and fallback `location.assign(...)`
    - `src/browser/providers/grokAdapter.ts`
      - moved `/files` navigation settling onto the shared helper
      - moved generic Grok URL/project navigation onto the shared helper
      - kept provider-specific post-validation (`isValidProjectUrl(...)`) in the adapter
  - Verification:
    - `pnpm vitest run tests/browser-service/ui.test.ts tests/browser/grokAdapter.test.ts --maxWorkers 1`
    - `pnpm run check`
  - Additional finding:
    - the first useful extraction was exactly the right size: one package helper plus one provider adoption. It improved maintainability immediately without trying to genericize every Grok branch in one pass.

- 2026-03-28: started extracting anchored row/menu action helpers into browser-service
  - Symptom:
    - Grok still repeated the same row-hover plumbing in multiple places:
      - reveal hidden row actions
      - open hidden row `Options` menus
      - then click rename/delete/menu items
    - the provider code was already using browser-service primitives, but the higher-level row interaction pattern was still duplicated
  - Root cause:
    - browser-service had `hoverAndReveal(...)`, `pressRowAction(...)`, and `openMenu(...)`, but no helper that expressed the common “reveal then act” pattern directly
  - Fix:
    - `packages/browser-service/src/service/ui.ts`
      - added `clickRevealedRowAction(...)`
      - added `openRevealedRowMenu(...)`
    - `tests/browser-service/ui.test.ts`
      - added focused coverage for both helpers
    - `src/browser/providers/grokAdapter.ts`
      - moved the root/sidebar conversation `Options` menu opening onto `openRevealedRowMenu(...)`
      - moved history-dialog conversation rename/delete row actions onto `clickRevealedRowAction(...)`
    - docs:
      - marked the anchored row/menu backlog item as started in `docs/dev/browser-service-upgrade-backlog.md`
      - updated `docs/dev/browser-service-tools.md`
      - updated `docs/dev/browser-automation-playbook.md`
  - Verification:
    - `pnpm vitest run tests/browser-service/ui.test.ts tests/browser/grokAdapter.test.ts --maxWorkers 1`
    - `pnpm run check`
    - live:
      - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx scripts/grok-acceptance.ts --json`
      - returned `ok: true`
  - Additional finding:
    - This was the right scope for the second extraction too: the generic reveal-then-act helpers now cover the conversation/sidebar/history paths, while the project-row `Options` path still needs one more generalization around link-navigation suppression before it can move fully onto the shared helper.

- 2026-03-28: moved the Grok project-row `Options` path onto the shared row-menu helper shape
  - Symptom:
    - `openProjectMenuButton(...)` still owned a large provider-local block for:
      - picking the best hidden `Options` trigger near the project row
      - suppressing accidental project-link navigation
      - trying direct click first
      - then falling back to manual CDP pointer events
    - that meant the highest-drift part of the project menu path was still not actually using the new browser-service helper
  - Root cause:
    - the first `openRevealedRowMenu(...)` extraction covered plain hidden menu triggers, but not the real-world case where the trigger sits beside a navigable link and needs a prep/fallback stage before open attempts
  - Fix:
    - `packages/browser-service/src/service/ui.ts`
      - extended `openRevealedRowMenu(...)` with:
        - `prepareTriggerBeforeOpen`
        - `directTriggerClickFallback`
      - the helper now:
        - makes the tagged trigger visible/clickable
        - installs one-shot link click suppression on nearby navigable ancestors
        - retries with a direct `trigger.click()` fallback if the generic `openMenu(...)` path still misses
    - `tests/browser-service/ui.test.ts`
      - added a regression for the prepare + direct-click fallback path
    - `src/browser/providers/grokAdapter.ts`
      - kept the Grok-specific row/button tagging logic
      - replaced the old direct-click + raw CDP pointer-click block with `openRevealedRowMenu(...)`
  - Verification:
    - `pnpm vitest run tests/browser-service/ui.test.ts tests/browser/grokAdapter.test.ts --maxWorkers 1`
    - `pnpm run check`
    - live:
      - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx scripts/grok-acceptance.ts --json`
      - returned `ok: true`
      - project rename/clone/remove and the later project conversation rename/delete flows all completed on the same run
  - Additional finding:
    - The remaining project-row complexity is now mostly “pick the correct button in this row,” not “how do we hover/open the menu safely.” That is a cleaner boundary for deciding what should remain provider-specific.

- 2026-03-28: documented the next browser-service extraction plan and made it the active repair policy
  - Symptom:
    - after the row/menu helper extractions, the remaining question was no longer “how do we open this menu?” but “should trigger scoring move into browser-service too?”
    - leaving that as an implicit judgment call would make the next DOM-drift repair inconsistent again
  - Root cause:
    - the backlog said structured diagnostics were next in priority order, but it did not yet spell out the concrete implementation steps or the rule for when trigger scoring should stay adapter-local
  - Fix:
    - `docs/dev/browser-service-upgrade-backlog.md`
      - made structured UI diagnostics wrappers the active next implementation plan
      - added the concrete phases:
        - `collectUiDiagnostics(...)`
        - `withUiDiagnostics(...)`
        - first Grok adoption surfaces
        - focused tests
        - live WSL Grok acceptance verification
      - added the explicit extraction rule:
        - do not move trigger scoring into browser-service until the same scoring shape repeats on another real surface/provider
    - `AGENTS.md`
      - added the current browser-service plan to the standing repo guidance
    - `docs/dev/browser-automation-playbook.md`
      - wired the same decision into the runbook
    - `docs/dev/browser-service-tools.md`
      - recorded the active extraction plan alongside the helper inventory
  - Additional finding:
    - this gives a better decision boundary:
      - browser-service should own mechanics and diagnostics first
      - adapters should keep app-shaped trigger scoring until there is evidence for a generic primitive

- 2026-03-28: started the structured UI diagnostics extraction and used it to repair the next live Grok drift round
  - Symptom:
    - live Grok regressions were still real, but they had become hard to localize quickly:
      - clone rename sometimes failed on a concrete project page with no obvious selector-level clue
      - root conversation file list after append could fail with a generic “Conversation content not found”
      - root conversation delete could fail with “Conversation sidebar row not found” even though the conversation still existed
  - Root cause:
    - browser-service had generic navigation and row helpers, but fragile flows still did not carry enough scoped UI evidence on failure
    - several of the remaining Grok failures were also hydration/timing problems rather than wrong-selector problems:
      - root `/c/...` reads were using raw `Page.navigate(...)`
      - clone rename could fire before the concrete project page had hydrated
      - root conversation list/delete depended on a home/sidebar surface that can lag behind the actual completed browser run
  - Fix:
    - `packages/browser-service/src/service/ui.ts`
      - added `collectUiDiagnostics(...)`
      - added `withUiDiagnostics(...)`
      - first diagnostics payload includes:
        - URL/title/readyState
        - active element summary
        - visible dialogs
        - visible menus plus menu items
        - visible buttons in scope
        - scoped candidate census
    - `tests/browser-service/ui.test.ts`
      - added focused diagnostics/enrichment coverage
    - `src/browser/providers/grokAdapter.ts`
      - adopted `withUiDiagnostics(...)` for:
        - project menu open
        - project menu item selection
        - conversation sidebar menu open
      - root conversation reads now use route-settled navigation plus a broader conversation-surface wait
      - sent-turn conversation-file chip polling now waits longer after append
      - root sidebar row tagging now retries long enough to survive the observed post-append lag
      - concrete project rename now waits for the project rename surface to hydrate before acting
      - root/non-project conversation listing now merges the visible home/sidebar conversation surface
    - `scripts/grok-acceptance.ts`
      - widened the root post-browser conversation wait
      - added a deliberate fallback to the fresh browser session’s recorded `conversationId` when the root list surface still lags
  - Verification:
    - `pnpm vitest run tests/browser-service/ui.test.ts tests/browser/grokAdapter.test.ts --maxWorkers 1`
    - `pnpm run check`
    - live targeted proofs:
      - `conversations context get db726922-f6a1-49c7-bdc3-f9c607c620a1 --target grok --json-only`
      - `conversations files list db726922-f6a1-49c7-bdc3-f9c607c620a1 --target grok`
      - `projects clone ff05cf94-c79d-4021-b66f-db19eb099c1e 'AuraCall Cedar Orbit hydratefix' --target grok`
      - `delete d966a9e0-85e6-4beb-8461-1bf6e08c3b9e --target grok --yes`
      - `conversations --target grok --refresh --include-history`
  - Additional finding:
    - the new diagnostics made the remaining failures much more specific:
      - clone issues were really pre-hydration rename attempts
      - root append/list issues were really route/surface settle problems
      - root delete issues were really home/sidebar discovery lag, not missing conversations
  - Final verification:
    - the full WSL Grok acceptance runner is green again on a fresh clean pass:
      - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx scripts/grok-acceptance.ts --json`
      - returned `ok: true`
      - clean pass ids:
        - project `b3f7da94-9342-4194-84ac-34b3c51c480c`
        - clone `ca3d75e7-5cba-4f5c-b801-bcc949d88284`
        - project conversation `77bee9d5-9d28-4fd6-9bb0-0d2a706e321c`
        - root conversation `39ed172c-59c4-4813-a98f-874e5ec7ba33`
    - stale disposable Grok projects from earlier failed runs were cleaned up afterward:
      - removed 42 `AuraCall Cedar (Atlas|Harbor|Orbit) ...` projects
      - verified `leftoverCount: 0` for that disposable family

## 2026-03-28 — ChatGPT project CRUD: DOM findings and first live green pass

- Scope:
  - start ChatGPT project CRUD after the Grok stabilization work
  - switch the browser-mode default model to Instant before the live ChatGPT pass
- Changed:
  - `src/browser/constants.ts`
    - browser-mode default model label now points at Instant instead of Pro
  - `src/cli/runOptions.ts`
    - browser engine fallback model now resolves to `gpt-5.2-instant`
  - `src/schema/resolver.ts`
    - browser-mode model fallback now resolves to `gpt-5.2-instant`
  - `src/browser/providers/chatgptAdapter.ts`
    - added initial ChatGPT project CRUD adapter coverage:
      - `listProjects`
      - `createProject`
      - `renameProject`
      - `selectRemoveProjectItem`
      - `pushProjectRemoveConfirmation`
    - canonicalized ChatGPT project ids to the bare `g-p-...` prefix
    - made create verification route-authoritative:
      - a post-submit route change to a new project id now counts as success even if the new page title/settings controls are still hydrating
    - added a ChatGPT project-surface hydration wait before rename/delete/settings work
    - broadened project-settings readiness detection beyond one specific input selector
    - targeted the real `Delete project?` confirmation dialog instead of the first dialog node, because the project settings sheet stays open underneath it
    - retried `listProjects` once with a fresh tab resolution when the initial attachment dies with `WebSocket connection closed`
  - `src/browser/providers/index.ts`
    - wired the new ChatGPT adapter into the provider registry
  - `tests/browser/chatgptAdapter.test.ts`
    - added focused coverage for:
      - slugged vs bare ChatGPT project id extraction
      - normalized project-name matching
- Live DOM findings that mattered:
  - sidebar project rows expose stable row-menu triggers:
    - `Open project options for <Project Name>`
  - create-project modal:
    - root: `[data-testid="modal-new-project-enhanced"]`
    - name: `input[name="projectName"]`
    - confirm text: `Create project`
  - project-page settings surface:
    - page trigger: aria starts with `Edit the title of ...`
    - secondary trigger: `Show project details`
    - fields:
      - `input[aria-label="Project name"]`
      - `textarea[aria-label="Instructions"]`
  - delete flow is two dialogs:
    - settings sheet remains open
    - destructive confirm dialog overlays it with `Delete` + `Cancel`
  - ChatGPT uses mixed id shapes:
    - current route: bare `g-p-...`
    - sidebar href: `g-p-...-slug`
    - Aura-Call should keep the bare prefix as the canonical project id
- Verification:
  - focused:
    - `pnpm vitest run tests/browser/chatgptAdapter.test.ts tests/runOptions.test.ts tests/schema/resolver.test.ts tests/browser/config.test.ts tests/cli/browserConfig.test.ts --maxWorkers 1`
    - `pnpm run check`
  - live:
    - create/rename/delete disposable ChatGPT project:
      - `AuraCall Harbor Vector`
      - rename to `AuraCall Harbor Ledger`
      - delete successful
    - direct rename/delete also passed on:
      - `g-p-69c852c00f7c8191a935698b7b6df07b`
      - `AuraCall Maple Orbit` -> `AuraCall Maple Harbor` -> deleted
    - `pnpm tsx bin/auracall.ts projects --target chatgpt`
      - now survives the stale-target websocket-close case and returns the real project list again
- Cleanup:
  - deleted the disposable ChatGPT probe projects created during DOM recon and validation
  - the remaining live ChatGPT projects list is back to the user’s real set:
    - `Support Letters`
    - `Reviewer`
    - `SoyLei`
    - `SABER Company`
    - `HARVEST Roads`
- Remaining note:
  - ChatGPT cache writes still prompt for cache identity unless `browser.cache.identityKey` / `browser.cache.identity` is configured; that is not a CRUD blocker, but it is still CLI noise
- Follow-up:
  - `bin/auracall.ts`
    - added `projects create --memory-mode <global|project>` for ChatGPT project creation
  - `src/browser/providers/domain.ts`
    - introduced shared `ProjectMemoryMode` plus normalization for `global` / `default` and `project` / `project-only`
  - `src/browser/providers/types.ts`
  - `src/browser/llmService/llmService.ts`
    - threaded optional project memory mode through provider/service create flows
    - accept bare ChatGPT `g-p-...` ids directly in `resolveProjectIdByName(...)` so `projects remove g-p-...` works without a cache-name lookup
  - `src/browser/providers/chatgptAdapter.ts`
    - mapped memory mode selection to ChatGPT's current create-modal gear menu:
      - `global` -> `Default`
      - `project` -> `Project-only`
    - switched the gear open path from a plain synthetic button click to the shared pointer-driven `openMenu(...)` helper, with `Space`/`ArrowDown` keyboard fallbacks for the current modal behavior
    - broadened project-settings open for rename/delete:
      - stop scoping the `Edit the title of ...` trigger to `main`
      - retry through `Show project details` when the page-level settings surface drifts
  - `tests/browser/chatgptAdapter.test.ts`
    - added coverage for ChatGPT memory-mode label mapping
- Live DOM finding that mattered:
  - ChatGPT create-modal `Project settings` gear is not equivalent to a simple synthetic `click`
  - on the current live DOM it opens on:
    - pointer sequence
    - keyboard `Space`
    - keyboard `ArrowDown`
  - Aura-Call now follows that actual interaction model instead of assuming button-click parity
- Verification:
  - focused:
    - `pnpm vitest run tests/browser/chatgptAdapter.test.ts tests/runOptions.test.ts tests/schema/resolver.test.ts tests/browser/config.test.ts tests/cli/browserConfig.test.ts --maxWorkers 1`
    - `pnpm run check`
  - live:
    - created disposable ChatGPT projects:
      - `AuraCall Harbor Memory Global`
      - `AuraCall Harbor Memory Project`
    - `--memory-mode project` now creates successfully on the managed WSL Chrome profile
    - removed both disposable projects successfully by bare `g-p-...` id

## 2026-03-28 — Browser-service absorbed the ChatGPT menu/surface/id learnings

- Scope:
  - stop re-solving the ChatGPT gear/settings drift in provider code
  - move the generalizable parts into browser-service and the provider interface
- Changed:
  - `packages/browser-service/src/service/ui.ts`
    - `pressButton(...)` now accepts ordered `interactionStrategies`
    - `openMenu(...)` now retries ordered interaction strategies and reports which strategy opened the menu
    - added `openSurface(...)` for shared “try these triggers until ready” flows
    - `collectUiDiagnostics(...)` / `withUiDiagnostics(...)` now accept caller `context`
  - `tests/browser-service/ui.test.ts`
    - added focused coverage for:
      - menu interaction-strategy fallback
      - surface trigger fallback
      - diagnostics context preservation
  - `src/browser/providers/types.ts`
    - added provider hooks for project-id normalization/extraction
  - `src/browser/providers/index.ts`
    - wired ChatGPT/Grok project-id hooks into the provider registry
  - `src/browser/llmService/llmService.ts`
    - provider-native project-id passthrough is now hook-based instead of a hardcoded ChatGPT branch
    - configured project-url parsing now asks the provider first
  - `src/browser/providers/chatgptAdapter.ts`
    - create-modal memory-mode now uses browser-service interaction strategies through `openMenu(...)`
    - project-settings open now uses `openSurface(...)` instead of provider-local trigger retry blocks
- Live lesson captured in code:
  - a UI trigger can be “button-shaped” without being plain-click-equivalent
  - browser-service now models that explicitly instead of forcing adapters to hand-roll pointer/keyboard fallbacks
- Verification:
  - focused:
    - `pnpm vitest run tests/browser-service/ui.test.ts tests/browser/chatgptAdapter.test.ts tests/runOptions.test.ts tests/schema/resolver.test.ts tests/browser/config.test.ts tests/cli/browserConfig.test.ts --maxWorkers 1`
    - `pnpm run check`
  - live:
    - created disposable ChatGPT project `AuraCall BrowserService Surface Probe` with `--memory-mode project`
    - removed it successfully by bare id `g-p-69c86caa0c308191bb2af23d234cf23f`

## 2026-03-29 — browser-service now selects the correct visible menu family

- Problem:
  - multiple menus can be visible at once
  - returning generic selectors like `[role="menu"]` lets later item selection
    hit the wrong menu family
  - provider code was compensating with ad hoc menu scoring logic
- Fix:
  - `packages/browser-service/src/service/ui.ts`
    - added `collectVisibleMenuInventory(...)`
      - bounded visible-menu census with item labels, geometry, and optional
        anchor distance
      - assigns a specific tagged selector to each currently visible menu so
        callers can target the chosen menu directly
    - upgraded `waitForMenuOpen(...)`
      - can now choose the best visible menu by expected item labels, new-vs-old
        menu signatures, and optional anchor proximity
    - upgraded `openMenu(...)`
      - records pre-open menu signatures and passes expected-item context into
        the shared waiter
    - `openAndSelectMenuItem(...)` / `selectFromListbox(...)`
      - now route their intended option label through the shared menu opener
  - `src/browser/providers/chatgptAdapter.ts`
    - ChatGPT project-create memory mode now uses the shared expected-item menu
      selection path for `Default` / `Project-only`
- Why it matters:
  - browser-service now owns the generic "pick the right menu family" fix that
    came out of ChatGPT composer/project drift, instead of leaving it as another
    provider-local menu heuristic
- Verification:
  - `pnpm vitest run tests/browser-service/ui.test.ts tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
  - `pnpm run check`
  - live:
    - created disposable ChatGPT project `AC BS Menu Probe 329` with
      `--memory-mode project`
    - removed it successfully afterward

## 2026-03-28 — ChatGPT project sources/files CRUD now survives fresh reloads

- Scope:
  - finish the ChatGPT project sources/files CRUD slice on the managed WSL Chrome path
  - stop treating the immediate post-picker source row as authoritative persistence
  - fix nested `projects files ...` / `projects instructions ...` target inheritance so `--target chatgpt` works the same way under subcommands
- Changed:
  - `src/browser/providers/chatgptAdapter.ts`
    - added reload-backed helpers for project-source persistence and removal verification
    - `uploadProjectFiles(...)` now requires the uploaded source names to survive a fresh `Sources` reload before returning success
    - `deleteProjectFile(...)` now requires the removed source name to stay gone after a fresh reload
    - `listProjectFiles(...)` now performs one hard-reload retry before returning an empty list
  - `bin/auracall.ts`
    - nested `projects files add|list|remove` now inherit `--target` from the parent/root CLI
    - nested `projects instructions get|set` now inherit `--target` from the parent/root CLI too
- Live DOM lesson captured in code:
  - ChatGPT closes the `Add sources` picker and shows a row immediately after file selection, but that first row is not a strong persisted-state proof on its own
  - a fresh `?tab=sources` reload is the right verification boundary for ChatGPT project sources
- Verification:
  - focused:
    - `pnpm vitest run tests/browser/chatgptAdapter.test.ts tests/browser/llmServiceIdentity.test.ts --maxWorkers 1`
    - `pnpm run check`
  - live:
    - created disposable ChatGPT project `AuraCall ChatGPT Sources Acceptance 1774747901`
    - `projects files add g-p-69c8810c65ac8191b2906da27ea5132f --target chatgpt --file /tmp/chatgpt-project-source-gQ3f.md`
    - `projects files list ...` returned `chatgpt-project-source-gQ3f.md`
    - `projects files remove ... chatgpt-project-source-gQ3f.md --target chatgpt`
    - follow-up `projects files list ...` returned `No files found for project g-p-69c8810c65ac8191b2906da27ea5132f.`
    - removed the disposable project afterward

## 2026-03-28 — ChatGPT project instructions now verify against the live settings sheet

- Scope:
  - finish the remaining ChatGPT project-instructions CRUD slice on the managed WSL Chrome path
  - make create-with-instructions and explicit `projects instructions set` rely on the same persisted-state proof
- Changed:
  - `src/browser/providers/chatgptAdapter.ts`
    - added `getProjectInstructions(projectId, ...)`
    - added `updateProjectInstructions(projectId, instructions, ...)`
    - added `readProjectSettingsSnapshot(...)` for the live project settings sheet
    - added `waitForProjectInstructionsApplied(...)` so instructions writes only return success after the sheet is reopened and the textarea value matches
    - create-with-instructions now reuses the same persistence verification instead of trusting the first edit pass
    - relaxed project delete success so a fresh post-delete sidebar/project scrape counts as success even if ChatGPT leaves the selected tab on the stale project route
  - `tests/browser/chatgptAdapter.test.ts`
    - adapter capabilities coverage now includes ChatGPT project instructions support
- Live DOM findings that mattered:
  - the current ChatGPT project settings sheet exposes instructions at `textarea[aria-label="Instructions"]`
  - there is still no explicit `Save` button, so the only safe success criterion is reopen-and-verify
  - ChatGPT currently rejects project names longer than 50 characters in the create modal; that is surfaced by the disabled `Create project` button, not by a later API error
- Verification:
  - focused:
    - `pnpm vitest run tests/browser/chatgptAdapter.test.ts tests/browser/llmServiceIdentity.test.ts --maxWorkers 1`
    - `pnpm run check`
  - live:
    - created disposable project `AC GPT Instr 1774749141`
    - `projects instructions set g-p-69c886002f6c8191a47b0335f89f5c59 --target chatgpt --file /tmp/tmp.hA6LUzlmsI`
    - `projects instructions get g-p-69c886002f6c8191a47b0335f89f5c59 --target chatgpt`
      - returned:
      - `Keep answers concise.`
      - `Always surface risks before suggestions.`
    - disposable project deletion succeeded in the live product state even though the original route-based delete post-condition fired falsely; the project no longer appeared in the refreshed project list

## 2026-03-29 — ChatGPT conversation CRUD now works on the managed WSL profile

- Scope:
  - finish root ChatGPT conversation CRUD before moving on to ChatGPT attachment breadth
- Changed:
  - `src/browser/providers/chatgptAdapter.ts`
    - added ChatGPT conversation list/read/rename/delete support
    - added canonical root/project conversation URL resolution
    - added sidebar conversation scraping + normalization
    - added row-tagging helpers for sidebar conversation action buttons
    - context reads now poll the turn DOM and do one reload/retry before failing
    - conversation delete now prefers the sidebar row menu and only falls back to the header menu if needed
    - row lookup now polls for sidebar hydration instead of failing on the first miss
  - `src/browser/providers/index.ts`
    - ChatGPT conversation URL resolution is now project-aware
  - `tests/browser/chatgptAdapter.test.ts`
    - added helper coverage for conversation id extraction, conversation probe normalization, canonical conversation URL resolution, and ChatGPT conversation capability advertising
- Live DOM lessons captured in code:
  - ChatGPT can truncate long sidebar conversation titles, so full-prompt filters are not a safe acceptance pattern
  - the route can be correct before the turn DOM is ready, so route checks alone are not enough for context reads
  - the sidebar row menu is the more reliable destructive-action surface for conversations in the current layout
- Verification:
  - focused:
    - `pnpm vitest run tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
    - `pnpm run check`
  - live non-Pro WSL ChatGPT pass:
    - created conversation `69c9410c-5678-8331-b6b3-d302ad9b922a`
    - listed it successfully
    - read context successfully
    - renamed it to `AuraCall ChatGPT CRUD Renamed`
    - deleted it successfully
    - verified it no longer appeared in the refreshed conversation list

## 2026-03-29 — ChatGPT conversation files now read from real sent-turn upload tiles

- Scope:
  - begin Phase 3 of the ChatGPT conversation surface plan by making real sent-turn uploads visible through CLI read surfaces before attempting any delete semantics
- Changed:
  - `src/browser/providers/chatgptAdapter.ts`
    - added ChatGPT conversation-file probe normalization
    - added sent user-turn file tile scraping
    - added `listConversationFiles(...)`
    - `readConversationContext(...)` now returns `files[]` for ChatGPT conversation uploads
  - `tests/browser/chatgptAdapter.test.ts`
    - added coverage for `normalizeChatgptConversationFileProbes(...)`
- Live DOM lessons captured in code:
  - small text-file runs need `--browser-attachments always` during live ChatGPT attachment recon; under `auto`, ChatGPT can inline the file contents into the prompt and never create a real upload tile
  - the current authoritative file-read surface is the sent user-turn tile group (`role="group"` with `aria-label=<filename>`), not the transient picker row and not a speculative `View files in chat` dialog
  - the live sent-turn tile does not currently expose a stronger stable native file id, so the adapter uses synthetic identity built from `conversationId + turn/message id + tile index + file name`
  - product boundary: users can remove files from the composer before send, but cannot delete an already-sent file from a ChatGPT conversation; durable delete belongs to project `Sources`
- Verification:
  - focused:
    - `pnpm vitest run tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
    - `pnpm run check`
  - live:
    - created real upload conversation `69c95f14-2ca0-8329-9d3a-be5d1a1967ab` with forced native attachment upload
    - `conversations files list 69c95f14-2ca0-8329-9d3a-be5d1a1967ab --target chatgpt`
      - returned `chatgpt-real-upload-vmuk.txt`
    - `conversations context get 69c95f14-2ca0-8329-9d3a-be5d1a1967ab --target chatgpt --json-only`
      - returned the same file in `files[]` with matching metadata
    - cleanup follow-up:
      - the first delete attempt exposed a stale-postcondition false negative after the destructive action had already succeeded
      - `waitForChatgptConversationDeleted(...)` now refreshes to the authoritative list surface before treating remaining stale anchors as real survivors
      - live reproof:
        - created disposable upload conversation `69c96223-2708-8329-b563-00e171e22b39`
        - `delete 69c96223-2708-8329-b563-00e171e22b39 --target chatgpt --yes`
          - returned `Deleted successfully.`

## 2026-03-29 — ChatGPT llmservice now persists rate-limit cooldown and write spacing

- Scope:
  - analyze why the ChatGPT acceptance path tripped the account-level `Too many requests` dialog
  - add a real guard in the ChatGPT llmservice layer so separate `auracall` CLI processes stop rediscovering the same rate limit by hammering the account
- Root cause:
  - the failure was not one broken DOM path
  - the acceptance path stacked multiple ChatGPT write-heavy operations across separate CLI invocations in a short window:
    - project create/rename
    - source add/remove
    - instructions set
    - later conversation rename/delete
  - once ChatGPT surfaced a visible `Too many requests` / `You're making requests too quickly` dialog, the next fresh process had no memory of that state and kept touching the live browser
- Changed:
  - `src/browser/llmService/llmService.ts`
    - added a persisted provider guard for ChatGPT under `~/.auracall/cache/providers/chatgpt/__runtime__/rate-limit-<profile>.json`
    - mutating ChatGPT llmservice operations are now spaced apart automatically before live browser work begins
    - live ChatGPT llmservice calls now honor a persisted cooldown after a detected rate-limit failure, with a short auto-wait path for near-expired cooldowns and a fail-fast path for longer active cooldowns
    - rate-limit detection currently keys off the real ChatGPT UI error text already captured in adapter/UI-diagnostics failures (`Too many requests`, `...too quickly`, `rate limit`)
  - `src/browser/llmService/providers/chatgptService.ts`
    - moved ChatGPT project/conversation list + rename/delete through the guarded llmservice retry wrapper so the persisted cooldown applies to real live ChatGPT CRUD entry points
  - `src/browser/chatgptRateLimitGuard.ts`
    - added the shared ChatGPT rate-limit guard path/profile/message helpers so llmservice CRUD and browser-mode prompt runs use the same persisted cooldown contract
  - `src/browser/index.ts`
    - ChatGPT browser-mode prompt runs now consult the persisted profile-scoped guard before sending a new prompt
    - successful ChatGPT browser-mode prompt runs now update the same `lastMutationAt` state as ChatGPT CRUD
    - browser-mode failures now inspect the live DOM for `Too many requests` / `...too quickly` text and persist the same cooldown file before rethrowing
  - `tests/browser/llmServiceRateLimit.test.ts`
    - added focused coverage for:
      - persisting cooldown state after a ChatGPT rate-limit error
      - blocking the next live ChatGPT llmservice call in a fresh service instance/process
      - enforcing write spacing across separate service instances
  - `tests/browser/chatgptRateLimitGuard.test.ts`
    - added profile/path + message-summary coverage for the shared guard helper
- Verification:
  - focused:
    - `pnpm vitest run tests/browser/chatgptRateLimitGuard.test.ts tests/browser/llmServiceRateLimit.test.ts tests/browser/llmServiceIdentity.test.ts tests/browser/browserModeExports.test.ts tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
    - `pnpm run check`

## 2026-03-29 — ChatGPT guard now enforces a rolling per-profile write budget before the UI rate-limits

- Scope:
  - close the remaining rate-limit hole after the first persisted guard still allowed a long ChatGPT acceptance run to trip the account
  - keep the fix in the shared ChatGPT guard path so browser-mode sends and multi-process CRUD both inherit it automatically
- Root cause:
  - min-spacing plus post-failure cooldown only remembered `lastMutationAt`
  - that was enough to keep adjacent writes apart, but it was not enough to recognize a whole burst of separate CLI mutations within one short window
  - the acceptance script could therefore still create a burst like create/rename/source add/remove/instructions set/browser send/rename/delete before the first visible `Too many requests` dialog had a chance to persist a cooldown
- Changed:
  - `src/browser/chatgptRateLimitGuard.ts`
    - added persisted `recentMutationAts[]` history
    - added shared helpers to prune mutation history, append a new mutation timestamp, and calculate the next allowed write time for a rolling write budget
    - added the new write-budget constants:
      - `CHATGPT_MUTATION_WINDOW_MS`
      - `CHATGPT_MUTATION_MAX_WRITES`
      - `CHATGPT_MUTATION_BUDGET_AUTO_WAIT_MAX_MS`
  - `src/browser/llmService/llmService.ts`
    - provider guard settings now include rolling-window write-budget parameters
    - mutating ChatGPT CRUD calls now enforce the rolling budget before executing another live write
    - successful mutations now persist `recentMutationAts[]`, not just `lastMutationAt`
    - detected rate-limit failures preserve/advance that same mutation history when writing the cooldown file
  - `src/browser/index.ts`
    - ChatGPT browser-mode prompt sends now enforce the same rolling write budget before sending
    - successful browser-mode ChatGPT writes now append to the same persisted mutation history
    - browser-mode rate-limit failure handling now preserves that mutation history when persisting a cooldown
  - `tests/browser/chatgptRateLimitGuard.test.ts`
    - added coverage for mutation-history pruning, append semantics, and rolling-budget delay calculation
  - `tests/browser/llmServiceRateLimit.test.ts`
    - added focused coverage for rolling-budget enforcement across separate service instances/processes
- Verification:
  - focused:
    - `pnpm vitest run tests/browser/chatgptRateLimitGuard.test.ts tests/browser/llmServiceRateLimit.test.ts tests/browser/llmServiceIdentity.test.ts tests/browser/browserModeExports.test.ts --maxWorkers 1`
    - `pnpm run check`
  - live:
    - intentionally skipped during this patch because the account had already been rate-limited and the goal of the change was to stop additional live mutation traffic first

## 2026-03-29 — ChatGPT acceptance now aborts long cooldown waits, and project-chat rename prefers the row label

- Scope:
  - stop stale `scripts/chatgpt-acceptance.ts` processes from sleeping through a multi-minute cooldown and then resuming later
  - harden the remaining project-scoped conversation rename persistence check without immediately spending more live writes
- Root cause:
  - the acceptance runner treated waits up to 6 minutes as acceptable retry time after a ChatGPT cooldown/write-budget failure
  - project-page rename propagation can surface the new title first in the row menu label (`Open conversation options for ...`) before the anchor text fully catches up
- Changed:
  - `scripts/chatgpt-acceptance.ts`
    - added a short acceptance-only cooldown ceiling (`30s`)
    - added a preflight cooldown read so later acceptance mutations abort before sending another write into a known long cooldown
    - kept the short retry path for near-expired cooldowns, but long waits now fail fast instead of parking a process
  - `src/browser/providers/chatgptAdapter.ts`
    - `buildConversationTitleAppliedExpression(...)` now prefers the row action label over anchor text when inferring the visible current title
    - `waitForChatgptConversationTitleApplied(...)` now retries once after a fresh list navigation before failing
- Verification:
  - focused:
    - `pnpm vitest run tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
    - `pnpm run check`

## 2026-03-29 — ChatGPT acceptance is now phaseable so this account can validate without one giant write burst

- Scope:
  - stop treating one dense ChatGPT end-to-end acceptance burst as the only way to validate the provider on this throttled account
  - make the acceptance harness resumable from already-created disposable entities
- Root cause:
  - the product-side guard now prevents repeated hammering, but a single full acceptance pass still exceeds this account's native write budget before the later root/tool steps finish
- Changed:
  - `scripts/chatgpt-acceptance.ts`
    - added `--phase full|project|project-chat|root-base|root-followups|cleanup`
    - added `--project-id` and `--conversation-id` so later phases can reuse disposable entities created in earlier phases
    - changed cleanup semantics so only `full` auto-cleans in `finally`; partial phases intentionally preserve state for the next phase
- Verification:
  - `pnpm tsx scripts/chatgpt-acceptance.ts --help`
  - `pnpm run check`

## 2026-03-30 — ChatGPT project-page conversation rows expose the clean title in the row-menu label, not always in the anchor text

- Area: Browser/ChatGPT project-scoped conversation list/rename verification
- Symptom:
  - during the phased ChatGPT acceptance rerun, project-chat rename failed even though the live project conversation existed and had been renamed
  - the project-page list returned the conversation as:
    - `AC GPT PC bqeekfReply exactly with CHATGPT ACCEPT PROJECT CHAT bqeekf.`
  - that caused the project-chat rename verifier to miss the expected title
- Root cause:
  - the project-page scraper in `src/browser/providers/chatgptAdapter.ts` derived conversation titles from raw anchor text
  - on current ChatGPT project pages, anchor text can concatenate the visible title with the preview snippet; the row action button aria label (`Open conversation options for ...`) is the cleaner title source
- Fix:
  - updated project/page conversation scraping to prefer the row action label over anchor text
  - taught `normalizeChatgptConversationLinkProbes(...)` to prefer a shorter authoritative title when the competing title is just that title with preview text appended
  - added a focused regression in `tests/browser/chatgptAdapter.test.ts`
- Verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
- Follow-up:
  - rerun the phased live `project-chat` acceptance slice once the account has a little more write headroom

## 2026-03-30 — ChatGPT's current rolling write budget needs to be stricter than 4 writes per 2 minutes on this account

- Area: Browser/ChatGPT rate-limit guard
- Symptom:
  - even after the first persisted cooldown + rolling-budget guard work, a phased live rerun still hit a real ChatGPT cooldown during `renameConversation` in the `root-base` slice
  - this happened after `project` and `project-chat` had already gone green, which meant the old `4 writes / 2 minutes` budget was still optimistic for this account when phases were chained with minimal idle time
- Fix:
  - lowered `CHATGPT_MUTATION_MAX_WRITES` in `src/browser/chatgptRateLimitGuard.ts` from `4` to `3`
  - kept the same 2-minute rolling window and existing cooldown handling, so the guard now forces a pause sooner instead of letting the next phase walk right into ChatGPT's own throttle
- Verification:
  - `pnpm vitest run tests/browser/chatgptRateLimitGuard.test.ts tests/browser/llmServiceRateLimit.test.ts --maxWorkers 1`
- Follow-up:
  - resume the phased live ChatGPT acceptance run only after the current persisted cooldown clears

## 2026-03-30 — Existing-conversation ChatGPT browser runs must reject reused assistant turns when a rate-limit modal blocks the new turn

- Area: Browser/ChatGPT browser-mode response detection on existing conversations
- Symptom:
  - a `--conversation-id ... --browser-composer-tool web-search` browser run could report a successful answer even though the conversation never got a new turn
  - the live session metadata looked healthy (`composerTool = "web search"`), but the conversation context still only contained the previous root-base prompt/answer
  - a direct `browser-tools` probe on the conversation showed the visible blocking ChatGPT modal:
    - `Too many requests`
    - `You’re making requests too quickly...`
  - the browser run had incorrectly returned the old assistant answer from the previous turn (`CHATGPT ACCEPT BASE ...`) as if it were the new web-search response
- Root cause:
  - existing-conversation browser runs already captured a baseline assistant snapshot, but stale detection relied too heavily on exact text equality
  - if the reused stale turn came back with extra prelude text such as `Thought for a few seconds ...`, the detector could miss that it was still the same underlying assistant message/turn
- Fix:
  - `src/browser/index.ts`
    - baseline assistant `messageId` / `turnId` now travel through the existing-conversation send path
    - added `shouldTreatChatgptAssistantResponseAsStale(...)` so reused assistant `messageId`, reused `turnId`, or responses that only append prelude text ahead of the old answer are treated as stale
    - when no fresh turn appears after that stale detection, browser mode now checks for a visible ChatGPT rate-limit modal and throws the rate-limit failure instead of returning the previous answer
  - `tests/browser/browserModeExports.test.ts`
    - added focused stale-response regressions
- Verification:
  - `pnpm vitest run tests/browser/browserModeExports.test.ts tests/browser/chatgptRateLimitGuard.test.ts tests/browser/llmServiceRateLimit.test.ts tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
  - `pnpm run check`
  - live phased acceptance:
    - `project` green
    - `project-chat` green
    - `root-base` green
    - `root-followups` green
    - `cleanup` green

## 2026-03-30 — ChatGPT phased acceptance should persist resumable state and keep one suffix across resumed phases

- Area: Browser/ChatGPT acceptance harness polish
- Symptom:
  - the harness had already grown `--phase`, `--state-file`, and `--resume`, but the runbook still described mostly manual phase handoff
  - resumed phases generated a fresh suffix/name set even when they were continuing the same disposable acceptance run, which made the logs and state file less coherent than they needed to be
  - `scripts/chatgpt-acceptance.ts` also called `mkdir(...)` when writing the state file without importing it
- Root cause:
  - the first cut of phaseability was focused on surviving account throttling, not on making the resumable path the polished canonical operator workflow
  - docs lagged behind the now-real state-file support, and suffix continuity had not been treated as part of operator ergonomics
- Fix:
  - imported `mkdir` in `scripts/chatgpt-acceptance.ts` so state-file writes are valid
  - resumed runs now reuse the prior summary's suffix and derived disposable names when available, while still creating a fresh temporary working directory per process
  - resumed runs now log the prior recorded failure from the state file
  - added `docs/dev/chatgpt-polish-plan.md` and updated `docs/testing.md`, `docs/dev/smoke-tests.md`, and `docs/dev/chatgpt-conversation-surface-plan.md` so the resumable state-file workflow is the documented default
- Verification:
  - `pnpm tsx scripts/chatgpt-acceptance.ts --help`
  - `pnpm run check`

## 2026-03-30 — ChatGPT workbook artifact fetches need the embedded spreadsheet card fallback, not just filename-matching buttons

- Area: Browser/ChatGPT artifact materialization
- Symptom:
  - `auracall conversations artifacts fetch 69ca9d71-1a04-8332-abe1-830d327b2a65 --target chatgpt` returned `artifactCount = 1`, `materializedCount = 0`
  - the artifact was already classified correctly as `kind = "spreadsheet"` with `uri = sandbox:/mnt/data/parabola_trendline_demo.xlsx`, but no file ever materialized
- Root cause:
  - the resolver only knew how to click filename-matching assistant `button.behavior-btn` downloads or scrape inline `ada_visualizations` tables
  - this workbook is exposed through the embedded spreadsheet card instead, and the real download affordance is the card's first unlabeled header button
  - that button emits a signed `backend-api/estuary/content?id=file_...` anchor URL when clicked
- Fix:
  - added a ChatGPT spreadsheet fallback that scopes to the assistant turn containing the artifact title, finds the embedded spreadsheet card, tags its first header button, captures the signed `estuary` URL, and fetches the workbook directly
  - `conversations artifacts fetch` now also writes `conversation-attachments/<conversationId>/artifact-fetch-manifest.json` with per-artifact `materialized|skipped|error` status while keeping the existing `conversation-attachments/<id>/manifest.json` schema unchanged
  - artifact fetches now record per-artifact failures in that sidecar manifest instead of aborting the whole fetch on the first error
- Verification:
  - `pnpm vitest run tests/browser/llmServiceFiles.test.ts tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
  - `pnpm run check`
  - live:
    - `ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts conversations artifacts fetch 69ca9d71-1a04-8332-abe1-830d327b2a65 --target chatgpt`
    - result:
      - `artifactCount = 1`
      - `materializedCount = 1`
      - materialized file `parabola_trendline_demo.xlsx`

## 2026-03-30 — ChatGPT rate-limit pacing should be cluster-aware, not just a flat write counter

- Area: Browser/ChatGPT rate-limit guard
- Symptom:
  - the old guard treated all successful writes as roughly equivalent with a flat `15s` spacing rule plus a `3 writes / 2 minutes` rolling cap
  - that did not match actual ChatGPT behavior well: short clustered rename/delete steps were often fine, but the follow-up refresh or next mutation after the commit was what tended to trigger throttling
- Root cause:
  - the persisted guard only stored timestamps, so it could not distinguish a cheap rename commit from a heavier prompt send or upload
  - it also had no explicit post-commit quiet-period model before the next refresh-heavy or mutating step
- Fix:
  - replaced the flat count-based budget with weighted persisted mutation records in `src/browser/chatgptRateLimitGuard.ts`
  - lighter actions like rename/instructions now count less than create/upload/browser-send
  - every successful write now opens a post-commit quiet period before the next action, starting around 12-18 seconds based on action class and lengthening as recent weighted activity accumulates
  - both `src/browser/llmService/llmService.ts` and `src/browser/index.ts` now enforce that post-commit quiet period plus the weighted rolling budget
  - kept the visible rate-limit modal/cooldown path unchanged on top of the new pacing model
- Verification:
  - `pnpm vitest run tests/browser/chatgptRateLimitGuard.test.ts tests/browser/llmServiceRateLimit.test.ts tests/browser/browserModeExports.test.ts --maxWorkers 1`
  - `pnpm run check`

## 2026-03-30 — ChatGPT context/artifact reads now recover from visible rate-limit dialogs locally

- Area: Browser/ChatGPT context + artifact ingestion
- Symptom:
  - the persisted ChatGPT guard already covered prompt sends and llmservice/browser-mode mutations, but `conversations context get` and `conversations artifacts fetch` did not have a provider-local response if ChatGPT surfaced a visible `Too many requests` dialog mid-read
  - that meant read/materialization flows could still fail abruptly on a visible modal even when the next sensible action was simply “dismiss it, wait a bit, and retry once”
- Root cause:
  - ChatGPT adapter read/materialization paths had no local visible-dialog recovery wrapper
  - only the higher-level persisted guard knew about rate limits, and it only had signal after an error escaped
- Fix:
  - added visible ChatGPT rate-limit dialog detection + dismissal helpers in `src/browser/providers/chatgptAdapter.ts`
  - wrapped `readChatgptConversationContextWithClient(...)` and `materializeChatgptConversationArtifactWithClient(...)` in a one-shot recovery path that:
    - detects a visible rate-limit modal
    - dismisses it
    - pauses about 15 seconds
    - retries once
    - then rethrows a real rate-limit failure if the modal/error persists so the persisted cross-process guard can still take over afterward
  - re-proved serialized full-context ingestion plus artifact fetch on three representative chats:
    - image chat `69bc77cf-be28-8326-8f07-88521224abeb`
    - DOCX + canvas chat `69caa22d-1e2c-8329-904f-808fb33a4a56`
    - workbook chat `69ca9d71-1a04-8332-abe1-830d327b2a65`
- Verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts tests/browser/llmServiceFiles.test.ts --maxWorkers 1`
  - `pnpm run check`
  - live serialized proofs:
    - image chat: context `messages = 4`, `files = 1`, `sources = 0`, `artifacts = 4`; fetch `materializedCount = 4`
    - DOCX + canvas chat: context `messages = 4`, `files = 0`, `sources = 0`, `artifacts = 2`; fetch `materializedCount = 2`
    - workbook chat: context `messages = 4`, `files = 0`, `sources = 0`, `artifacts = 1`; fetch `materializedCount = 1`

## 2026-03-30 — ChatGPT surfaced the next browser-service extraction order clearly

- Area: Browser-service package boundary review
- Observation:
  - the ChatGPT cycle repeated a few now-obvious generic failure modes even after the menu/nested-menu/browser-diagnostics extractions landed:
    - overlapping dialogs/overlays need stable scoped handles, not generic `[role="dialog"]`
    - visible blocking surfaces need a package-owned recovery loop with provider-supplied classifiers
    - button-backed downloads need package-owned target capture rather than adapter-local DOM/event glue
    - CDP network-response capture on reload/navigation should be generic, not reimplemented in each adapter
    - shared managed browser profiles need explicit operation leasing/serialization
- Result:
  - wrote `docs/dev/browser-service-lessons-review-2026-03-30.md`
  - linked it from the browser-service backlog/tools/playbook docs
  - set the recommended next extraction order to:
    1. dialog/overlay inventory + stable handles
    2. blocking-surface recovery framework
    3. native download-target capture
    4. network-response capture on reload/navigation
    5. profile-scoped browser operation lease
    6. row/list post-condition helpers
    7. generic action-phase instrumentation
- Verification:
  - docs review only; no runtime behavior changed in this step

## 2026-03-30 — The first ChatGPT lessons are now package-owned browser-service helpers

- Area: Browser-service shared UI helpers
- Symptom:
  - the lessons review identified dialog/overlay inventory and blocking-surface
    recovery as the next two browser-service extractions, but those mechanics
    were still sitting provider-local in the ChatGPT adapter
- Root cause:
  - menus already had package-owned stable handles and reopen/verify flows, but
    overlays/dialogs still only had primitive helpers like `closeDialog(...)`
  - provider adapters therefore kept writing their own detect/dismiss/retry
    loops for blocking surfaces such as ChatGPT's rate-limit modal
- Fix:
  - added `collectVisibleOverlayInventory(...)` to
    `packages/browser-service/src/service/ui.ts`
  - added `dismissOverlayRoot(...)` so one specific overlay root can be
    dismissed by stable selector instead of generic first-match dialog logic
  - added `withBlockingSurfaceRecovery(...)` so providers can supply a
    classifier + dismiss policy while reusing the shared
    detect/dismiss/pause/retry loop
  - moved ChatGPT context/artifact rate-limit modal recovery onto those shared
    helpers
- Verification:
  - `pnpm vitest run tests/browser-service/ui.test.ts tests/browser/chatgptAdapter.test.ts tests/browser/llmServiceFiles.test.ts --maxWorkers 1`
  - `pnpm run check`

## 2026-03-31 — Explicit browser provider targets now win over stale config-default targets

- Area: Browser service / managed profile routing
- Symptom:
  - explicit Grok-or-ChatGPT operations constructed through browser-service
    could still resolve the wrong managed profile or DevTools target when
    `userConfig.browser.target` pointed at a different provider
- Root cause:
  - `BrowserService.fromConfig(...)` resolved browser config from the raw user
    config without carrying the caller's explicit provider target
  - provider factories and browser client construction therefore defaulted back
    to the config-level target for managed profile lookup and browser-state
    attachment
- Fix:
  - threaded explicit provider target through
    `BrowserService.fromConfig(...)`
  - updated browser client plus ChatGPT/Grok service factories to pass their
    provider target explicitly
  - updated browser-state/profile lookup helpers so explicit target-specific
    resolution does not reattach against another provider's profile
- Verification:
  - `pnpm vitest run tests/browser/browserService.test.ts --maxWorkers 1`

## 2026-03-31 — WSL Linux Chrome now resolves `DISPLAY=:0.0` deterministically

- Area: Browser config / WSL Chrome launch
- Symptom:
  - opening a managed WSL Chrome profile could fail unless the caller's shell
    had already exported `DISPLAY`, even when the selected Aura-Call profile was
    explicitly configured to use Linux Chrome
- Root cause:
  - the `:0.0` fallback lived only inside the low-level launch path, so the
    resolved browser config did not carry a deterministic display value
  - logs therefore reflected ambient shell state, and fallback launcher choices
    could drift when the shell environment was incomplete
- Fix:
  - resolved `browser.display` up front in `src/browser/config.ts`
  - for WSL + Linux-hosted Chrome, defaulted `display` to `:0.0` unless config
    or `AURACALL_BROWSER_DISPLAY` overrides it
  - updated browser launch logging to report resolved `display` and
    `chromePath` from config
- Verification:
  - `pnpm vitest run tests/browser/config.test.ts tests/browser/browserService.test.ts tests/schema/resolver.test.ts --maxWorkers 1`

## 2026-03-31 — ChatGPT root rename probe moved onto stronger row-menu and commit helpers, but live rename still does not persist

- Area: ChatGPT browser rename investigation
- Symptom:
  - live root conversation rename still stalled in the ChatGPT acceptance
    `root-base` phase, and direct `auracall rename ... --target chatgpt` runs
    continued to leave the authoritative sidebar row title unchanged
- Root cause:
  - still not fully resolved
  - two partial learnings are now confirmed:
    - the simple sidebar-row trigger path was too weak for a navigable row
      surface and needed the same trigger-prep/direct-click semantics we
      already use for Grok
    - ChatGPT can close the inline rename editor without actually applying the
      new title, so "editor disappeared" is not a sufficient completion signal
- Fix:
  - switched ChatGPT tagged sidebar-row rename/delete menu opening onto
    `openRevealedRowMenu(...)` with trigger prep + direct-click fallback in
    `src/browser/providers/chatgptAdapter.ts`
  - added `submitInlineRename(..., submitStrategy: 'blur-body-click')` in
    `packages/browser-service/src/service/ui.ts`
  - ChatGPT rename now retries one alternate blur/click-away commit if the
    normal submit closes the inline editor without immediately applying the new
    title
- Verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts tests/browser-service/ui.test.ts --maxWorkers 1`
  - `pnpm run check`
  - live repro still blocked:
    - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts rename 69cc287c-2f0c-832b-99db-3760fa254e7a "AC GPT C najfie" --target chatgpt --verbose`
  - live DOM after the repro still showed:
    - row title `CHATGPT ACCEPT BASE najfie`
    - no open menu
    - no visible inline rename input
  - conclusion: the new helpers improved the investigation surface but did not
    yet produce a persisted ChatGPT root rename

## 2026-03-31 — ChatGPT live rename confirmed the shared hover-reveal plus native-enter technique

- Area: Browser-service row actions / ChatGPT rename investigation
- Symptom:
  - provider-level rename attempts were still unreliable, and it was unclear
    whether the problem was trigger discovery, edit readiness, or commit
    semantics
- Root cause:
  - the surface behaves like the earlier Grok rename case:
    - the row action trigger is hover-revealed and should be treated as such
    - the rename editor is a real inline input whose focus/typing semantics
      matter
    - editor disappearance alone is not proof of persisted rename
- Fix / learning:
  - direct live repro on the managed ChatGPT tab showed that the reliable
    interaction sequence is:
    - hover the conversation row
    - click the revealed `...` button
    - select `Rename`
    - wait for `input[name="title-editor"]`
    - type natively into that input
    - send one native `Enter`
    - verify the sidebar row text changed
  - documented this as a reusable browser-service technique in
    `docs/dev/browser-service-tools.md`
- Verification:
  - live tab on DevTools port `45011`
  - conversation `69cc287c-2f0c-832b-99db-3760fa254e7a`
  - sidebar title changed successfully to `AC GPT C najfie`

## 2026-03-31 — Browser-service inline rename now supports native typing for row-local editors

- Area: Browser-service inline rename helpers / ChatGPT rename
- Symptom:
  - the successful live ChatGPT rename path required "real" editing semantics,
    but `submitInlineRename(...)` only supported JS value assignment plus submit
- Root cause:
  - some inline rename surfaces accept native focus/typing/Enter reliably while
    remaining flaky under setter-only input updates
- Fix:
  - added `entryStrategy: 'native-input'` to
    `packages/browser-service/src/service/ui.ts::submitInlineRename(...)`
  - native entry now clicks the real input by geometry, selects existing text,
    clears it with native `Backspace`, then types via `Input.insertText(...)`
  - ChatGPT root rename now targets `input[name="title-editor"]` and uses the
    native-input + native-enter path
- Verification:
  - `pnpm vitest run tests/browser-service/ui.test.ts tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
- Remaining gap:
  - repeated live `auracall rename ... --target chatgpt` repros still did not
    apply the requested new title end-to-end, even after the native-entry
    upgrade
  - this narrows the remaining problem to provider-path orchestration or
    verification, not the base inline input mechanic itself

## 2026-03-31 — ChatGPT provider root rename now follows the exact live-proven row sequence

- Area: ChatGPT browser rename
- Symptom:
  - helper-composed provider renames stayed flaky even after native input and
    pointer-based menu tweaks, while the direct live manual sequence kept
    working
- Root cause:
  - the root rename path was still depending on the older score/title-based row
    tagging flow instead of resolving the exact conversation row by id and
    reproducing the proven interaction path
- Fix:
  - added an exact conversation-link row resolver for ChatGPT root rename
  - replaced the root rename interaction with the direct sequence:
    - exact row by conversation id
    - row hover
    - pointer click on row options
    - pointer click on `Rename`
    - wait for edit mode
    - native text entry
    - native `Enter`
- Verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts tests/browser-service/ui.test.ts --maxWorkers 1`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - live DOM after provider rename showed conversation
    `69cc287c-2f0c-832b-99db-3760fa254e7a` renamed successfully to
    `AC GPT C najfie provider-7`
- Remaining issue:
  - the top-level `auracall rename ... --target chatgpt` invocation still did
    not return promptly after the rename had already succeeded in the UI
  - that remaining bug is now post-success command lifecycle/cleanup, not the
    rename interaction itself

## 2026-03-31 — ChatGPT project conversation row actions now use the exact project-panel row

- Area: ChatGPT browser project conversation CRUD
- Symptom:
  - project-scoped rename/delete still depended on the older ranked row tagger,
    even after root-chat CRUD had moved to the more reliable exact-row path
- Root cause:
  - the old project row selection searched broadly across `/c/...` anchors and
    scored candidates, which is less reliable than directly resolving the
    authoritative project `Chats` panel row
- Fix:
  - extended `tagChatgptConversationRowExact(...)` with optional `projectId`
    scoping
  - when project-scoped, the resolver now prefers visible `role="tabpanel"`
    project chat rows whose parsed route project id matches the normalized
    project id exactly
  - switched ChatGPT project rename/delete flows onto that exact resolver so
    they use the same hover-reveal/pointer-driven row action path as root chats
- Verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts tests/browser-service/ui.test.ts --maxWorkers 1`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - live project conversation smoke on
    `g-p-69cc275fdfac8191be921387165ca803`
    - created conversation `69cc7121-eca0-832c-ab8a-9dde700e87d7`
    - rename returned `Renamed successfully.`
    - delete returned `Deleted successfully.` and `Conversation cache refreshed.`
    - fresh project conversation list returned `[]`
- Remaining gap:
  - immediate post-rename project list reads were inconsistent (`ChatGPT`, then
    `[]`) while the live tab still showed the conversation route, so project
    conversation list/read consistency remains a separate follow-up surface

## 2026-03-31 — ChatGPT project conversation listing now reads the real Chats-panel title

- Area: ChatGPT browser project conversation list/read
- Symptom:
  - project-scoped `auracall conversations --project-id ... --target chatgpt`
    could return `[]` even when the project page visibly contained the chat row,
    and earlier reads could surface placeholder/generic titles
- Root cause:
  - the project list reader had the same page-expression bug as the earlier
    `Chats` readiness probe: browser-evaluated code referenced TS constants like
    `CHATGPT_PROJECT_TAB_CHATS_LABEL` and
    `CHATGPT_CONVERSATION_OPTIONS_PREFIX` directly instead of interpolating
    their literal values
  - after the project page loaded, the scraper also trusted concatenated anchor
    text or generic placeholders instead of the concrete title leaf inside the
    `li.group/project-item` row
- Fix:
  - interpolated the `Chats` label and conversation-options prefix into the
    project-page browser expressions
  - kept the provider on the real project `Chats` surface before scraping
  - updated project row title extraction to prefer the shortest concrete leaf
    text and ignore generic placeholders such as `ChatGPT` / `New chat`
  - hardened `normalizeChatgptConversationLinkProbes(...)` so generic titles
    do not overwrite real titles
- Verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts tests/browser-service/ui.test.ts --maxWorkers 1`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - live proof on project `g-p-69cc275fdfac8191be921387165ca803`
    - renamed conversation `69cc7d43-acc0-832f-b1c2-5486459b4825` to
      `AC GPT PC title fixed`
    - fresh project conversation list returned:
      `AC GPT PC title fixed`
    - deleting that conversation succeeded and a fresh project list returned
      `[]`

## 2026-03-31 — ChatGPT project cleanup now survives the split remove-confirm command flow

- Area: ChatGPT browser project delete / acceptance cleanup
- Symptom:
  - phased ChatGPT acceptance was green through `project-chat`, `root-base`,
    and `root-followups`, but `cleanup` still failed on
    `projects remove <projectId> --target chatgpt`
- Root cause:
  - project removal is executed as two separate provider calls:
    `selectRemoveProjectItem(...)` then `pushProjectRemoveConfirmation(...)`
  - the second call reconnects in a fresh browser session, so the confirmation
    dialog may no longer exist even though the first step succeeded
  - `buildProjectDeleteConfirmationExpression()` also referenced the TS
    delete-dialog constant directly inside a browser-evaluated expression
- Fix:
  - interpolated the delete-dialog label into
    `buildProjectDeleteConfirmationExpression()`
  - updated `pushProjectRemoveConfirmation(...)` so if the confirmation dialog
    is missing after reconnect, it reopens project settings, presses
    `Delete project`, waits for the confirmation dialog, then confirms from
    that reconstructed state
- Verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts tests/browser-service/ui.test.ts --maxWorkers 1`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - phased live acceptance rerun:
    - `project-chat` PASS
    - `root-base` PASS
    - `root-followups` PASS
    - `cleanup` PASS

## 2026-04-01 — ChatGPT exact-row actions now share one local menu-item opener

- Area: ChatGPT browser conversation row actions / project cleanup tests
- Symptom:
  - the recently repaired ChatGPT rename/delete paths still duplicated the same
    exact-row hover -> trigger -> menu-item sequence in separate helpers, which
    increases the risk that future DOM drift fixes only land in one path
- Fix:
  - extracted `openChatgptTaggedConversationMenuItem(...)` and reused it for
    the exact-row rename and delete openers
  - added `matchesChatgptProjectDeleteConfirmationProbe(...)` plus focused
    tests so the project delete confirmation shape has direct unit coverage
- Verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts tests/browser-service/ui.test.ts --maxWorkers 1`
  - `pnpm exec tsc -p tsconfig.json --noEmit`

## 2026-04-01 — Fresh ChatGPT acceptance no longer depends on warm state

- Area: ChatGPT browser acceptance
- Symptom:
  - after the phased rerun went green, there was still a risk that ChatGPT
    acceptance only passed because the browser/session/project state was already
    warm from prior live debugging and partial sweeps
- Fix:
  - reran `scripts/chatgpt-acceptance.ts` from a brand-new state file so the
    full ChatGPT flow had to recreate and verify state from scratch
- Verification:
  - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx scripts/chatgpt-acceptance.ts --state-file docs/dev/tmp/chatgpt-fresh-state.json --command-timeout-ms 900000`
  - result: `PASS (full)`

## 2026-04-01 — Revealed row menu-item selection moved into browser-service

- Area: Browser-service row actions / ChatGPT conversation CRUD
- Symptom:
  - the repaired ChatGPT root/project rename/delete flow still carried its own
    local `hover row -> open row menu -> pointer-select item` mechanics even
    after the surface had stabilized, which left other providers with no
    package-owned primitive for the same pattern
- Fix:
  - added `openAndSelectRevealedRowMenuItem(...)` to
    `packages/browser-service/src/service/ui.ts`
  - rewired the ChatGPT exact-row rename/delete menu opener to use the new
    package helper while leaving exact row identity resolution and follow-up
    verification in the provider adapter
- Verification:
  - `pnpm vitest run tests/browser-service/ui.test.ts tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
  - `pnpm exec tsc -p tsconfig.json --noEmit`

## 2026-04-01 — Anchored row-action diagnostics moved into browser-service

- Area: Browser-service diagnostics / ChatGPT row actions
- Symptom:
  - ChatGPT still carried three almost-identical local diagnostics collectors
    for exact-row menu open, rename-editor readiness, and delete-confirmation
    readiness, each rebuilding row/trigger visibility plus menu/overlay
    snapshots separately
- Fix:
  - added `collectAnchoredActionDiagnostics(...)` to the browser-service UI
    helpers
  - rewired the ChatGPT exact-row rename/delete diagnostics to use the shared
    helper while preserving provider-specific row matching and post-condition
    logic
- Verification:
  - `pnpm vitest run tests/browser-service/ui.test.ts tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
  - `pnpm exec tsc -p tsconfig.json --noEmit`

## 2026-04-01 — Anchored action-phase failures now auto-attach diagnostics

- Area: Browser-service diagnostics wrappers / ChatGPT row-action phases
- Symptom:
  - even after moving anchored diagnostics into browser-service, adapters still
    had to manually call the collector on every false-result branch, which kept
    the package boundary noisy and easy to drift
- Fix:
  - added `withAnchoredActionDiagnostics(...)` to browser-service
  - it now attaches anchored diagnostics to `{ ok: false }` result objects and
    also enriches thrown errors with the same diagnostic payload
  - rewired the ChatGPT exact-row menu/rename/delete phase helpers to use the
    package wrapper instead of provider-local `collectDiagnostics` lambdas
- Verification:
  - `pnpm vitest run tests/browser-service/ui.test.ts tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
  - `pnpm exec tsc -p tsconfig.json --noEmit`

## 2026-04-01 — ChatGPT transient blocking-surface classification started

- Area: ChatGPT browser reliability / bad-state recovery
- Symptom:
  - ChatGPT CRUD/history/context surfaces were green, but hostile-state handling
    still focused mostly on the visible rate-limit modal and generic connection
    resets
  - that left red/white transient error surfaces, `server connection failed`
    states, and visible retry affordances under-classified
- Fix:
  - added `docs/dev/chatgpt-hardening-plan.md` as the dedicated hardening plan
  - added pure blocking-surface classifiers in `chatgptAdapter.ts` for:
    - `rate-limit`
    - `connection-failed`
    - `retry-affordance`
    - `transient-error`
  - expanded the existing ChatGPT blocking-surface recovery inspector to look
    beyond the rate-limit modal and include visible retry-affordance buttons
  - widened llmservice ChatGPT retryability matching for known transient
    connection/error strings
- Verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
  - `pnpm exec tsc -p tsconfig.json --noEmit`

- Follow-up:
  - the old rate-limit-only read/materialization wrapper is now
    `withChatgptBlockingSurfaceRecovery(...)`
  - for non-rate-limit ChatGPT bad states (`connection-failed`,
    `retry-affordance`, `transient-error`), the recovery path now reloads the
    page before retrying the wrapped read/materialization operation instead of
    only attempting a dialog dismiss
- Additional verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts tests/browser/llmServiceRateLimit.test.ts --maxWorkers 1`
  - `pnpm exec tsc -p tsconfig.json --noEmit`

- Follow-up:
  - `scrapeChatgptConversations(...)` now also uses
    `withChatgptBlockingSurfaceRecovery(...)`, so conversation list reads on
    both root and project surfaces recover from the same classified transient
    states as context/artifact reads
  - browser-mode stale-response rejection now checks for any visible classified
    ChatGPT blocking surface instead of only the rate-limit modal, which
    improves operator-visible failures on broken chat turns and connection-loss
    states
- Additional verification:
  - `pnpm vitest run tests/browser/chatgptAdapter.test.ts tests/browser/llmServiceRateLimit.test.ts tests/browser/browserModeExports.test.ts --maxWorkers 1`
  - `pnpm exec tsc -p tsconfig.json --noEmit`

- Policy correction:
  - browser-mode visible ChatGPT bad-state detection now returns structured
    `kind + summary` instead of flattening everything into a rate-limit-like
    reason string
  - only classified `rate-limit` surfaces are allowed to feed the persisted
    cooldown guard path
  - `retry-affordance`, `connection-failed`, and `transient-error` states now
    surface operation-specific stale-send failures instead of being mistaken for
    cooldowns

- Follow-up:
  - browser-mode stale-send handling now logs structured unexpected-state
    context in development mode (`browser.debug` / verbose logger) before
    failing:
    - classified ChatGPT bad-state kind/summary
    - source/probe details when available
    - explicit retry-affordance policy
    - baseline/answer ids when available
    - recent conversation snapshot
  - retry/regenerate failures now say explicitly that auto-click is disabled,
    which closes the remaining ambiguity in the send-path policy
- Additional verification:
  - `pnpm vitest run tests/browser/domDebug.test.ts tests/browser/browserModeExports.test.ts tests/browser/chatgptAdapter.test.ts tests/browser/llmServiceRateLimit.test.ts --maxWorkers 1`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
- Follow-up:
  - the dev-mode post-mortem record is now a bounded machine-readable browser
    snapshot, not only a recent-turn string dump
  - the session log now preserves route/title/readiness, active element,
    visible overlays + button labels, visible retry/regenerate buttons, and
    recent turns under a `Browser postmortem (...)` line so later tooling can
    cluster deterministic failure signatures
- Follow-up:
  - the same bounded browser snapshot is now also persisted for debug-mode
    ChatGPT read/recovery paths under `~/.auracall/postmortems/browser/`
  - current covered read surfaces:
    - conversation list refresh
    - conversation context reads
    - conversation file reads
    - artifact materialization
  - each persisted record includes the recovery phase and classified blocking
    surface, so repeated failure classes can be grouped without re-scraping the
    raw session log
  - the persisted record now also includes the actual recovery action/outcome
    used by the current ChatGPT recovery path, which makes it possible to
    separate "same visible symptom, different remediation" during later
    clustering
- Follow-up:
  - ChatGPT read-path recovery now performs one bounded authoritative re-anchor
    after the current dismiss/reload step
  - current re-anchor actions:
    - `reopen-list` for conversation list refresh
    - `reopen-conversation` for context/files/artifact reads
  - persisted post-mortem bundles now capture the full recovery sequence, not
    just the first recovery action
- Verification:
  - live hostile-state validation on the managed WSL ChatGPT browser is now
    green for two synthetic-on-real transient-error cases:
    - injected alert on the active ChatGPT tab, then ran
      `auracall conversations --target chatgpt --refresh`
      - persisted `transient-error` -> `reload-page` -> `reopen-list`
      - command still returned the refreshed list
    - injected alert on the active ChatGPT tab, then ran
      `auracall conversations context get 69bc77cf-be28-8326-8f07-88521224abeb --target chatgpt --json-only`
      - persisted `transient-error` -> `reload-page` -> `reopen-conversation`
      - command still returned a valid payload (`messages = 4`)
  - live hostile-state validation is now also green for the remaining
    classified non-rate-limit read-side states:
    - synthetic-on-real `retry-affordance` on
      `auracall conversations context get 69bc77cf-be28-8326-8f07-88521224abeb --target chatgpt --json-only`
      - persisted `retry-affordance` -> `reload-page` -> `reopen-conversation`
      - command still returned a valid payload (`messages = 4`)
    - synthetic-on-real `connection-failed` on
      `auracall conversations files list 69bc77cf-be28-8326-8f07-88521224abeb --target chatgpt`
      - persisted `connection-failed` -> `reload-page` -> `reopen-conversation`
      - command still returned the expected conversation file list
- Follow-up:
  - debug-mode send-side stale-response failures now persist bounded JSON
    post-mortems to the same `~/.auracall/postmortems/browser/` store as the
    read-side recoveries
  - those send bundles include `mode = send`, the classified surface, the
    browser snapshot, and policy metadata like
    `fail-fast-no-auto-retry-click`

## 2026-03-31 — Browser/profile architecture now has an explicit refactor handoff plan

- Area: Browser profile family configuration
- Symptom:
  - repeated bugs and operator confusion showed that Aura-Call still treats
    logical runtime profile selection, browser-family selection, service target
    selection, and managed-profile path derivation as one mutable merge problem
- Root cause:
  - profile config resolution still mutates a shared `browser` object across
    multiple scopes, while overloaded path fields such as
    `manualLoginProfileDir` continue acting as both derived output and input
    configuration
- Fix:
  - documented the target architecture and landing plan in
    `docs/dev/browser-profile-family-refactor-plan.md`
  - added a matching roadmap entry in `ROADMAP.md`
- Verification:
  - docs review only

## 2026-04-01 — Services manifest now fails fast on unexpected section drift

- Area: Service-volatility manifest core
- Symptom:
  - the checked-in `configs/auracall.services.json` manifest was nominally
    typed, but several route fields were only surviving because
    `src/services/manifest.ts` used permissive `.passthrough()` schemas
  - that meant new route or section drift could silently land in the manifest
    without the typed loader/schema catching it
- Fix:
  - added the already-real route fields to the explicit schema:
    - `app`
    - `files`
    - `projectIndex`
    - `projectConversations`
  - changed the manifest section schemas and top-level manifest schema to
    strict validation
  - added regression tests proving that:
    - unexpected route keys fail fast
    - unexpected service sections fail fast
- Verification:
  - `pnpm vitest run tests/services/registry.test.ts tests/browser/chatgptProvider.test.ts tests/browser/chatgptAdapter.test.ts tests/browser/chatgptComposerTool.test.ts --maxWorkers 1`
  - `pnpm run check`

## 2026-04-01 — Main route/host consumers now require bundled manifest-owned fields

- Area: Service-volatility manifest ownership boundary
- Symptom:
  - even after the manifest pilot landed, several core route/host consumers
    still restated bundled service defaults in code as fallback literals
  - that blurred the ownership boundary and made manifest-backed fields look
    optional when they are now intended to be authoritative checked-in data
- Fix:
  - added required bundled registry helpers for manifest-owned static fields:
    - `requireBundledServiceBaseUrl(...)`
    - `requireBundledServiceCompatibleHosts(...)`
    - `requireBundledServiceCookieOrigins(...)`
    - `requireBundledServiceRouteTemplate(...)`
  - rewired the main static route/host consumers to use those helpers instead
    of repeating duplicated fallback literals:
    - `src/browser/constants.ts`
    - `src/browser/urlFamilies.ts`
    - `src/browser/providers/chatgpt.ts`
    - `src/browser/providers/chatgptAdapter.ts`
    - `src/browser/providers/grokAdapter.ts`
  - added focused registry tests proving the bundled manifest provides the
    required ChatGPT/Grok/Gemini route and host data directly
- Verification:
  - `pnpm vitest run tests/services/registry.test.ts tests/browser/chatgptProvider.test.ts tests/browser/chatgptAdapter.test.ts tests/browser/chatgptComposerTool.test.ts tests/browser/grokAdapter.test.ts --maxWorkers 1`
  - `pnpm run check`


## 2026-04-01 — Browser picker labels now come from the bundled services manifest

- Area: Service-volatility model-label ownership
- Symptom:
  - `src/cli/browserConfig.ts` still carried a local browser-label lookup table
    for ChatGPT/Gemini/Grok models even though those picker labels were already
    checked into `configs/auracall.services.json`
  - that duplicated ownership made the manifest-backed label slice look less
    complete than it really was
- Fix:
  - added `requireBundledServiceModelLabel(...)` to
    `src/services/registry.ts`
  - rewired `mapModelToBrowserLabel(...)` to require manifest-backed labels
    for inferred browser services instead of reading a local fallback table
  - kept model normalization in code (`gpt-5.1` -> `gpt-5.2`,
    Pro alias normalization) so only the declarative picker labels moved to
    authoritative manifest ownership
- Verification:
  - `pnpm vitest run tests/services/registry.test.ts tests/cli/browserConfig.test.ts tests/browser/chatgptProvider.test.ts tests/browser/chatgptAdapter.test.ts tests/browser/chatgptComposerTool.test.ts tests/browser/grokAdapter.test.ts --maxWorkers 1`
  - `pnpm run check`

## 2026-04-01 — ChatGPT composer vocabulary no longer duplicates manifest-owned defaults

- Area: Service-volatility ChatGPT pilot
- Symptom:
  - `src/browser/actions/chatgptComposerTool.ts` still carried duplicated
    static alias and label fallback tables even though those values were
    already owned by the bundled services manifest
- Fix:
  - removed the duplicated local composer alias/label fallback bundle and now
    read the ChatGPT composer vocabulary directly from the bundled manifest
    through the existing registry helpers
- Verification:
  - `pnpm vitest run tests/services/registry.test.ts tests/cli/browserConfig.test.ts tests/browser/chatgptComposerTool.test.ts tests/browser/chatgptProvider.test.ts tests/browser/chatgptAdapter.test.ts --maxWorkers 1`
  - `pnpm run check`

## 2026-04-01 — Browser profile-family refactor now has a typed resolution seam

- Area: Browser/profile-family refactor Slice 1
- Symptom:
  - the current resolver path still blends Aura-Call profile selection,
    browser-family wiring, service binding, and launch-plan fields into one
    mutable browser object
- Fix:
  - added a new pure typed resolution helper in
    `src/browser/service/profileResolution.ts`
  - the helper exposes explicit typed layers for:
    - `ResolvedProfileFamily`
    - `ResolvedBrowserFamily`
    - `ResolvedServiceBinding`
    - `ResolvedBrowserLaunchProfile`
  - added focused tests that pin the current expected layering behavior before
    future slices start moving launch/runtime code over to these objects
- Verification:
  - `pnpm vitest run tests/browser/profileResolution.test.ts tests/schema/resolver.test.ts tests/cli/browserConfig.test.ts --maxWorkers 1`
  - `pnpm run check`

## 2026-04-01 — Typed profile resolution now drives service/default config layering

- Area: Browser/profile-family refactor Slice 1
- Symptom:
  - the initial typed resolution helper existed, but runtime code still used
    only the legacy ad hoc record-merge logic
- Fix:
  - rewired `src/browser/service/profileConfig.ts` so the new typed
    resolution seam now drives service/default resolution for:
    - selected/default target selection
    - service URL layering
    - service-scoped browser defaults
  - fixed the precedence rule so an explicit browser/CLI target overrides the
    profile default service inside the typed resolution layer
  - added focused coverage in `tests/browser/profileConfig.test.ts`
- Verification:
  - `pnpm vitest run tests/browser/profileResolution.test.ts tests/browser/profileConfig.test.ts tests/schema/resolver.test.ts tests/cli/browserConfig.test.ts --maxWorkers 1`
  - `pnpm run check`

## 2026-04-01 — Browser-family defaults now come from the typed resolution seam

- Area: Browser/profile-family refactor Slice 2
- Symptom:
  - browser-family fields in `profileConfig.ts` were still populated by local
    ad hoc derivation, which let generic browser defaults leak into
    profile-selected cookie/bootstrap fields and let browser-family fallback
    claim `manualLoginProfileDir` before service binding ran
- Fix:
  - rewired `applyBrowserProfileDefaults(...)` to consume the typed
    `ResolvedBrowserFamily` layer for browser-family-owned defaults
  - used browser-family source-profile/source-cookie fields directly instead of
    the broader launch-profile projection, so selected profile browser-family
    values win over prefilled generic browser defaults
  - stopped browser-family fallback from claiming
    `manualLoginProfileDir` via `profilePath`, leaving service-scoped
    managed-profile selection to the service-binding layer
  - expanded `tests/browser/profileConfig.test.ts` to pin browser-family
    defaults and explicit-target precedence
- Verification:
  - `pnpm vitest run tests/browser/profileResolution.test.ts tests/browser/profileConfig.test.ts tests/schema/resolver.test.ts tests/cli/browserConfig.test.ts --maxWorkers 1`
  - `pnpm run check`

## 2026-04-01 — Typed profile/browser layers now also own debug-port-range and cache defaults

- Area: Browser/profile-family refactor Slice 2
- Symptom:
  - after the initial browser-family extraction, `profileConfig.ts` still
    mixed typed resolution with direct raw reads for
    `browser.debugPortRange` and `profile.cache`
- Fix:
  - rewired `applyBrowserProfileOverrides(...)` to use
    `ResolvedBrowserFamily.debugPortRange`
  - rewired cache default application to use
    `ResolvedProfileFamily.cacheDefaults`
  - extended `tests/browser/profileConfig.test.ts` so the typed seam now has
    direct regression coverage for both behaviors
- Verification:
  - `pnpm vitest run tests/browser/profileResolution.test.ts tests/browser/profileConfig.test.ts tests/schema/resolver.test.ts tests/cli/browserConfig.test.ts --maxWorkers 1`
  - `pnpm run check`

## 2026-04-01 — Browser-service attach paths now consume the typed launch profile

- Area: Browser/profile-family refactor Slice 3
- Symptom:
  - even after browser-family extraction, the browser-service entry path still
    rebuilt launch-owned fields like profile name, profile dir, debug-port
    config, and fallback managed profile targeting from local ad hoc reads
  - that meant a service scan/reattach could still drift back toward the
    constructor target or stale flattened values instead of using a consistent
    launch-profile view
- Fix:
  - added `resolveBrowserProfileResolutionFromResolvedConfig(...)` for the
    resolved-config/runtime path
  - taught the helper to derive a target-scoped managed profile dir from
    `managedProfileRoot + auracallProfile + target` when
    `manualLoginProfileDir` is absent
  - rewired `src/browser/service/portResolution.ts` and
    `src/browser/service/browserService.ts` to consume launch-owned fields
    from that helper
  - added regression coverage that proves
    `BrowserService.resolveServiceTarget(...)` uses the requested service
    launch profile when scanning fallback tabs
- Verification:
  - `pnpm vitest run tests/browser/profileResolution.test.ts tests/browser/profileConfig.test.ts tests/browser/browserService.test.ts tests/schema/resolver.test.ts tests/cli/browserConfig.test.ts --maxWorkers 1`
  - `pnpm run check`

## 2026-04-01 — resolveBrowserConfig now projects launch-owned fields through the typed seam

- Area: Browser/profile-family refactor Slice 3
- Symptom:
  - after the first launch-profile consumers landed in browser-service attach
    paths, `resolveBrowserConfig(...)` still assembled its final launch-owned
    output fields locally
  - that left the refactor with two parallel interpretations of launch state:
    one for resolved config and one for browser-service runtime
- Fix:
  - rewired `src/browser/config.ts` so launch-owned output fields are now
    projected through
    `resolveBrowserProfileResolutionFromResolvedConfig(...)` after the
    existing env/discovery normalization step
  - added a regression test proving this projection does not accidentally
    re-derive a managed profile dir when `manualLogin` is disabled
- Verification:
  - `pnpm vitest run tests/browser/config.test.ts tests/browser/profileResolution.test.ts tests/browser/profileConfig.test.ts tests/browser/browserService.test.ts tests/schema/resolver.test.ts tests/cli/browserConfig.test.ts --maxWorkers 1`
  - `pnpm run check`

## 2026-04-01 — Typed profile resolution now uses the real browser config unions

- Area: Browser/profile-family refactor type cleanup
- Symptom:
  - even after launch-profile consumers were wired in, runtime code still had to
    cast `debugPortStrategy` and `blockingProfileAction` because
    `profileResolution.ts` modeled them as generic strings
- Fix:
  - tightened `profileResolution.ts` to parse and expose:
    - `DebugPortStrategy`
    - resolved browser blocking-profile-action union
  - removed the remaining consumer casts in
    `src/browser/config.ts` and
    `src/browser/service/portResolution.ts`
  - corrected a stale invalid `blockingProfileAction: 'reuse'` test fixture
    in `tests/browser/profileConfig.test.ts`; that value was not part of the
    supported schema and should not be preserved by the typed seam
- Verification:
  - `pnpm vitest run tests/browser/config.test.ts tests/browser/profileResolution.test.ts tests/browser/profileConfig.test.ts tests/browser/browserService.test.ts tests/schema/resolver.test.ts tests/cli/browserConfig.test.ts --maxWorkers 1`
  - `pnpm run check`

## 2026-04-01 — Browser doctor and login prep now share the launch-profile seam

- Area: Browser/profile-family refactor bootstrap slice
- Symptom:
  - browser doctor and login prep were still reconstructing managed profile
    path, profile name, and source-cookie/bootstrap preference locally even
    after runtime config and browser-service attach paths had moved onto the
    typed launch profile
- Fix:
  - rewired `src/browser/profileDoctor.ts` to derive bootstrap/profile-report
    state from the resolved launch profile
  - added `resolveBrowserLoginOptionsFromUserConfig(...)` in
    `src/browser/login.ts` so setup/login callers can use the same seam for
    login prep instead of rebuilding launch inputs ad hoc
  - kept a final `resolveManagedProfileDir(...)` guard in both paths so stale
    inherited managed profile dirs from another Aura-Call profile are still
    corrected to the currently selected profile
- Verification:
  - `pnpm vitest run tests/browser/profileDoctor.test.ts tests/browser/login.test.ts tests/browser/config.test.ts tests/browser/profileResolution.test.ts tests/browser/profileConfig.test.ts tests/browser/browserService.test.ts tests/schema/resolver.test.ts tests/cli/browserConfig.test.ts --maxWorkers 1`
  - `pnpm run check`

## 2026-04-01 — Browser runtime no longer duplicates managed profile/bootstrap derivation

- Area: Browser/profile-family refactor runtime cleanup
- Symptom:
  - both ChatGPT and Grok browser runtime paths in `src/browser/index.ts`
    still duplicated the same managed-profile/bootstrap derivation logic even
    after config, browser-service, doctor, and login prep had moved onto the
    resolved launch/profile seam
- Fix:
  - added one shared
    `resolveManagedBrowserLaunchContext(...)`
    helper in `src/browser/index.ts`
  - both runtime paths now use it for managed profile dir, default managed
    profile dir, chrome profile, and preferred bootstrap cookie path
  - added a direct export-backed regression in
    `tests/browser/browserModeExports.test.ts`
- Verification:
  - `pnpm vitest run tests/browser/browserModeExports.test.ts tests/browser/config.test.ts tests/browser/profileDoctor.test.ts tests/browser/login.test.ts tests/browser/profileResolution.test.ts tests/browser/profileConfig.test.ts tests/browser/browserService.test.ts tests/schema/resolver.test.ts tests/cli/browserConfig.test.ts --maxWorkers 1`
  - `pnpm run check`


## 2026-04-01 — Browser-profile-family refactor now has a defined Phase 1 stop point

- Area: Browser/profile-family planning and execution control
- Symptom:
  - the profile-family refactor had already removed most of the dangerous
    launch/profile ambiguity, but the plans still read as if deeper
    `index.ts` cleanup was the obvious next step
- Fix:
  - marked the refactor as Phase 1 complete enough through commit `196aad27`
  - updated the refactor plan, execution board, and roadmap so the next work is
    explicit Phase 2 cleanup around secondary WSL browser-family config and
    naming clarity instead of uncontrolled runtime-scope expansion
- Verification:
  - planning docs updated:
    - `docs/dev/browser-profile-family-refactor-plan.md`
    - `docs/dev/next-execution-plan.md`
    - `ROADMAP.md`


## 2026-04-01 — Secondary WSL browser families no longer require path-first config teaching

- Area: Browser/profile-family refactor Phase 2 cleanup
- Symptom:
  - `wsl-chrome-2` had been documented as a named secondary profile, but the
    config model still forced operators to express it mostly by repeating raw
    browser fields and `manualLoginProfileDir` wiring inside the profile
- Root cause:
  - the schema had no first-class browser-family registry, and the profile
    normalization bridge would not have preserved a `browserFamily` selector
    even if one had been added
- Fix:
  - added top-level `browserFamilies` plus
    `profiles.<name>.browserFamily`
  - updated profile resolution to merge named browser-family defaults before
    profile-local browser overrides
  - fixed `normalizeConfigV1toV2(...)` to preserve `profile.browserFamily`
    when promoting `profiles` into `auracallProfiles`
  - updated configuration/runbook docs so secondary WSL families are taught via
    named browser-family config first, with `manualLoginProfileDir` kept as an
    advanced override
- Verification:
  - `pnpm vitest run tests/browser/profileResolution.test.ts tests/browser/profileConfig.test.ts tests/browser/config.test.ts tests/browser/browserService.test.ts tests/browser/login.test.ts tests/browser/profileDoctor.test.ts tests/schema/resolver.test.ts tests/cli/browserConfig.test.ts --maxWorkers 1`
  - `pnpm run check`
- Follow-ups:
  - live/manual smoke default WSL and `wsl-chrome-2`
  - decide whether `auracall wizard` should emit named browser families by
    default in a later compatibility-conscious slice


## 2026-04-01 — Browser/profile terminology is now explicit in docs and agent guidance

- Area: Config semantics and documentation clarity
- Symptom:
  - the repo still used `profile` to mean several different things:
    AuraCall config entry, browser/account family, native Chromium profile, and
    managed automation profile
  - `AGENTS.md` still carried stale guidance and terminology from an older
    project shape
- Fix:
  - documented the canonical terms in `README.md`,
    `docs/configuration.md`, `docs/wsl-chatgpt-runbook.md`, and
    `docs/dev/browser-profile-family-refactor-plan.md`
  - rewrote `AGENTS.md` as a focused Aura-Call guide with the new semantic
    split and current browser-work rules
- Verification:
  - docs reviewed locally after rewrite
- Follow-ups:
  - keep the implementation terminology stable enough for now
  - only do broad code symbol renames when there is a larger refactor reason


## 2026-04-01 — Config-model refactor is now explicitly sequenced before agents/teams

- Area: Roadmap and architecture sequencing
- Symptom:
  - the repo had clearer browser/runtime-profile semantics, but the roadmap did
    not yet state clearly when the larger config-shape refactor should happen
    relative to future agent/team work
- Fix:
  - added `docs/dev/config-model-refactor-plan.md`
  - updated `ROADMAP.md` and `docs/dev/next-execution-plan.md` so the
    config-model refactor is a named architecture track that should happen
    before agent/team implementation
  - clarified in the browser-profile-family plan that broad code renames and
    final public config-shape decisions are deferred to that larger refactor
- Verification:
  - planning docs reviewed locally after update


## 2026-04-01 — Wizard and default scaffold now emit browser-profile-backed config

- Area: Browser-profile onboarding and config ergonomics
- Symptom:
  - the docs now described browser profiles as first-class config concepts, but
    the wizard and default config scaffold still wrote the older shape directly
    into `profiles.<name>.browser`
- Root cause:
  - the onboarding/config-entry path had not been updated after the
    `browserFamilies` bridge landed, so the easiest path for users still
    taught the pre-refactor mental model
- Fix:
  - updated `src/cli/browserWizard.ts` so wizard-created runtime profiles now
    emit a named browser profile in `browserFamilies` and bind to it via
    `profiles.<name>.browserFamily`
  - updated `src/config.ts` so missing-config scaffolding now emits
    `browserFamilies.default` plus
    `profiles.default.browserFamily = "default"`
  - updated onboarding/config docs to say the wizard/scaffold now emit the
    browser-profile bridge directly
- Verification:
  - targeted onboarding/config tests updated and reviewed locally


## 2026-04-01 — CLI/runtime terminology now distinguishes source vs managed browser profiles

- Area: Product-surface terminology cleanup
- Symptom:
  - docs had the new semantic split, but live CLI/runtime wording still mixed
    older phrases like `Chrome profile`, `managed profile`, and
    `browser profile` in ways that blurred source vs managed state
- Root cause:
  - the terminology lock-in had not yet been pushed through doctor warnings,
    login/bootstrap logs, TUI prompts, and dry-run policy descriptions
- Fix:
  - updated doctor warnings to say `managed browser profile` and
    `source browser cookies`
  - updated login/runtime/bootstrap logs to distinguish managed browser profile
    from source browser profile
  - updated the TUI source-profile prompt and cookie-plan dry-run wording
- Verification:
  - focused browser/CLI tests updated and reviewed locally


## 2026-04-01 — Reserved config landing zone added for future agents and teams

- Area: Config-model refactor preparation
- Symptom:
  - the roadmap and design docs said agents/teams must come after the config-model
    refactor, but the schema had no explicit landing zone for those future layers
- Root cause:
  - the config model had planning language but no reserved shape for future
    higher-level objects
- Fix:
  - added inert top-level `agents` and `teams` schema blocks
  - documented that they are placeholders only and do not drive runtime behavior
  - updated configuration and planning docs to reference that reserved seam
- Verification:
  - config loading tests updated and reviewed locally


## 2026-04-01 — Agent inheritance and override boundary is now explicit in planning docs

- Area: Config-model and future agent architecture
- Symptom:
  - the roadmap said agents should come after the config-model refactor, but
    there was still no precise statement of what an agent should inherit versus
    what it may override
- Root cause:
  - the layering model had been named, but the agent boundary itself was still
    implicit
- Fix:
  - added `docs/dev/agent-config-boundary-plan.md`
  - defined the first explicit contract for:
    - agent inheritance from AuraCall runtime profiles
    - allowed agent overrides
    - non-goals that remain owned by browser profiles or future teams
  - linked that boundary from the roadmap and config-model planning docs
- Verification:
  - planning docs reviewed locally after update


## 2026-04-01 — ChatGPT project-settings commit button vocabulary is now manifest-owned

- Area: ChatGPT service-volatility extraction
- Symptom:
  - the ChatGPT adapter still had one low-risk hard-coded button vocabulary in
    the project-settings commit flow (`save`, `save changes`, `done`,
    `apply`)
- Root cause:
  - that declarative UI label set had not yet been moved into the checked-in
    service manifest even though nearby ChatGPT labels already were
- Fix:
  - added `ui.labelSets.project_settings_commit_buttons` to
    `configs/auracall.services.json`
  - rewired the project-settings commit matcher to consume the manifest-owned
    label set
  - added focused registry and adapter tests to pin the new ownership boundary
- Verification:
  - `pnpm vitest run tests/services/registry.test.ts tests/browser/chatgptAdapter.test.ts tests/browser/chatgptProvider.test.ts tests/browser/chatgptComposerTool.test.ts --maxWorkers 1`
  - `pnpm run check`


## 2026-04-01 — ChatGPT project-source upload action labels are now manifest-owned

- Area: ChatGPT service-volatility extraction
- Symptom:
  - the ChatGPT adapter still had a hard-coded low-risk upload-action label set
    inside the project-sources upload-dialog readiness probe
- Root cause:
  - those labels (`upload`, `browse`, `upload file`) had not yet been
    promoted into the checked-in service manifest even though adjacent
    project-source labels already were
- Fix:
  - added `ui.labelSets.project_source_upload_actions` to
    `configs/auracall.services.json`
  - rewired the upload-dialog readiness probe to consume that manifest-owned
    label set
  - added focused registry and adapter tests to pin the ownership boundary
- Verification:
  - `pnpm vitest run tests/services/registry.test.ts tests/browser/chatgptAdapter.test.ts tests/browser/chatgptProvider.test.ts tests/browser/chatgptComposerTool.test.ts --maxWorkers 1`
  - `pnpm run check`


## 2026-04-01 — Browser-service stale browser-state is now classified, not just "alive" or "dead"

- Area: Browser-service registry / reattach reliability
- Symptom:
  - stale browser-state and attach failures were being treated as a generic
    boolean "not alive" condition, which made doctor output noisy and limited
    safe pruning/reattach decisions
- Root cause:
  - the shared state registry had no explicit liveness model for dead process,
    dead DevTools port, or profile ownership mismatch
- Fix:
  - added a first explicit browser-service liveness classifier for registry
    entries
  - started surfacing that liveness reason through browser doctor reporting
  - documented the follow-on implementation plan in
    `docs/dev/browser-service-reattach-reliability-plan.md`
- Verification:
  - `pnpm vitest run tests/browser-service/stateRegistry.test.ts tests/browser/profileDoctor.test.ts tests/browser/browserService.test.ts --maxWorkers 1`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - `pnpm run check`


## 2026-04-01 — Browser doctor now reports why stale browser-state entries were pruned

- Area: Browser-service registry / reattach reliability
- Symptom:
  - doctor could report stale entry kinds currently present, but once stale
    entries were pruned it only surfaced a flat count of removed entries
- Root cause:
  - the shared prune path deleted stale registry entries without returning the
    per-entry liveness reason to callers
- Fix:
  - added package-owned `pruneRegistryDetailed(...)` to return the exact
    stale-entry liveness reasons being removed
  - updated browser doctor to include `prunedRegistryEntryReasons` in the
    local report and warn with the concrete stale reason mix after pruning
- Verification:
  - `pnpm vitest run tests/browser-service/stateRegistry.test.ts tests/browser/profileDoctor.test.ts tests/browser/browserService.test.ts tests/cli/browserSetup.test.ts --maxWorkers 1`
  - `pnpm run check`


## 2026-04-01 — Attach resolution now explains discarded stale browser-state candidates

- Area: Browser-service registry / attach diagnostics
- Symptom:
  - attach failures could still look like "no target found" even when nearby
    browser-state entries existed but had already been invalidated by stale
    liveness or profile mismatch
- Root cause:
  - the attach path was only consuming the winning or scanned profile path and
    did not surface which stale registry candidates had just been rejected
- Fix:
  - updated browser-service attach resolution to report discarded stale registry
    candidates for:
    - the selected DevTools port
    - the expected browser profile identity
  - added focused tests so those diagnostics are pinned without changing the
    current tab-selection policy
- Verification:
  - `pnpm vitest run tests/browser/browserService.test.ts tests/browser-service/stateRegistry.test.ts tests/browser/profileDoctor.test.ts --maxWorkers 1`
  - `pnpm exec tsc -p tsconfig.json --noEmit`


## 2026-04-01 — Reattach/session flows now classify target loss versus wrong-browser drift

- Area: Browser-service registry / reattach diagnostics
- Symptom:
  - failed session reattach still surfaced as a generic raw error string even
    after attach resolution learned to explain stale candidate rejection
- Root cause:
  - the reattach path did not classify missing prior ChatGPT targets versus
    wrong-browser/profile drift before falling back or reporting failure
- Fix:
  - added classified reattach failures for:
    - missing prior ChatGPT target/conversation
    - wrong-browser/profile drift when the prior ChatGPT origin disappears from
      the current Chrome target list
  - updated `attachSession(...)` to print the classified reattach reason instead
    of only the raw exception text
- Verification:
  - `pnpm vitest run tests/browser/reattach.test.ts tests/cli/sessionDisplay.test.ts tests/cli/sessionDisplay.coverage.test.ts --maxWorkers 1`
  - `pnpm run check`


## 2026-04-01 — Failed reattach now persists stale registry evidence into session metadata

- Area: Browser-service registry / reattach diagnostics
- Symptom:
  - reattach failures now classified target loss versus wrong-browser drift, but
    the stale registry candidates that explained nearby dead or mismatched
    browser-state were still only visible in live attach logs
- Root cause:
  - session reattach did not persist the discarded stale registry candidates it
    could have correlated with the classified failure
- Fix:
  - extracted the stale registry candidate collector into a shared helper used
    by attach and reattach flows
  - failed reattach now writes `browser.runtime.reattachDiagnostics` with:
    - classified failure kind/message
    - discarded stale registry candidates captured at failure time
- Verification:
  - `pnpm vitest run tests/browser/registryDiagnostics.test.ts tests/browser/reattach.test.ts tests/cli/sessionDisplay.test.ts tests/cli/sessionDisplay.coverage.test.ts --maxWorkers 1`
  - `pnpm run check`


## 2026-04-02 — Session/status output now shows persisted reattach diagnostics

- Area: Browser-service registry / reattach diagnostics
- Symptom:
  - failed reattach now persisted stale registry evidence in session metadata,
    but operators still had to inspect raw metadata files to see it
- Root cause:
  - session/status surfaces did not yet render the stored
    `browser.runtime.reattachDiagnostics` summary
- Fix:
  - added a shared reattach-diagnostics formatter in `sessionDisplay`
  - `auracall session <id>` now prints the stored reattach summary
  - `auracall status` now prints an indented reattach summary under affected rows
- Verification:
  - `pnpm vitest run tests/cli/sessionDisplay.coverage.test.ts tests/cli/sessionDisplay.test.ts --maxWorkers 1`
  - `pnpm run check`


## 2026-04-02 — Session/status JSON now exposes stored reattach diagnostics

- Area: Browser-service registry / reattach diagnostics
- Symptom:
  - human session/status output now showed persisted reattach diagnostics, but
    automation and postmortem tooling still had no machine-readable session CLI
    surface for the same evidence
- Root cause:
  - `auracall session` and `auracall status` did not yet offer JSON output for
    stored session metadata
- Fix:
  - added `--json` to `auracall session` and `auracall status`
  - list JSON now emits `{ entries, truncated, total }`
  - single-session JSON now emits the raw stored session metadata, including
    nested `browser.runtime.reattachDiagnostics`
- Verification:
  - `pnpm vitest run tests/cli/sessionCommand.test.ts tests/cli/sessionDisplay.coverage.test.ts tests/cli/sessionDisplay.test.ts --maxWorkers 1`
  - `pnpm run check`


## 2026-04-02 — Session/status `--json-only` is now a first-class documented option

- Area: Session CLI / machine-readable output
- Symptom:
  - session/status JSON output worked, but `--json-only` was not advertised on
    those subcommands and could still look like an unrelated ignored flag on
    attach flows
- Root cause:
  - the global intro-banner suppression flag existed, but the session command
    surfaces had not declared it locally or whitelisted it in ignored-flag
    reporting
- Fix:
  - added explicit `--json-only` options to `auracall session` and
    `auracall status`
  - whitelisted `json` and `jsonOnly` in session ignored-flag detection
- Verification:
  - `pnpm vitest run tests/cli/sessionCommand.test.ts --maxWorkers 1`
  - `pnpm run check`


## 2026-04-02 — Session/status JSON now emits normalized `reattachSummary` objects

- Area: Session CLI / machine-readable reattach diagnostics
- Symptom:
  - raw nested `browser.runtime.reattachDiagnostics` was now available in JSON,
    but tooling still had to traverse nested metadata and aggregate discarded
    stale candidates itself
- Root cause:
  - the machine-readable payload exposed storage-shaped data only, not a stable
    operator-oriented summary object
- Fix:
  - added helper-backed `reattachSummary` objects to single-session and list JSON
    payloads
  - included normalized stale-candidate counts grouped by `reason + liveness`
  - aligned the direct `status` subcommand JSON path with the `session` command
    helper path so both emit the same contract
- Verification:
  - `pnpm vitest run tests/cli/sessionCommand.test.ts --maxWorkers 1`
  - `pnpm run check`


## 2026-04-02 — Session JSON payload now has explicit exported types and a doc

- Area: Session CLI / machine-readable contract
- Symptom:
  - session/status JSON had become useful enough for tooling, but the contract
    still had to be inferred from implementation and tests
- Root cause:
  - the CLI payload helpers existed without named exported payload interfaces or
    a dedicated contract note
- Fix:
  - exported explicit session JSON payload types from `src/cli/sessionCommand.ts`
  - added `docs/dev/session-json-contract.md` as the current contract note
- Verification:
  - `pnpm vitest run tests/cli/sessionCommand.test.ts --maxWorkers 1`
  - `pnpm run check`


## 2026-04-02 — Reattach now classifies ambiguous same-profile targets

- Area: Browser-service reattach reliability
- Symptom:
  - when the exact prior target disappeared but multiple same-origin ChatGPT tabs
    still existed in the selected browser profile, reattach had no first-class
    ambiguity classification and could only fall through broader recovery
- Root cause:
  - the reattach classifier only distinguished `target-missing` versus
    `wrong-browser-profile`, even though it already knew how many same-origin
    page targets remained
- Fix:
  - added `ambiguous` as a classified reattach failure kind
  - classify the case where the exact target is gone, no exact URL/id match
    remains, and multiple same-origin page targets are still present
  - keep recovery bounded by logging/classifying ambiguity instead of guessing a
    target before fallback recovery
- Verification:
  - `pnpm vitest run tests/browser/reattach.test.ts tests/cli/sessionDisplay.coverage.test.ts tests/cli/sessionDisplay.test.ts --maxWorkers 1`
  - `pnpm run check`


## 2026-04-02 — Generic ChatGPT root tabs must not suppress ambiguous reattach

- Area: Browser-service reattach reliability
- Symptom:
  - a live multi-tab ChatGPT reattach scenario still classified as
    `target-missing` instead of `ambiguous` even though two same-origin pages
    remained in the selected browser profile and the original conversation tab
    was gone
- Root cause:
  - the ambiguity guard treated a generic root tab like
    `https://chatgpt.com/` as an exact-enough match for a prior conversation URL
    because of a broad `startsWith(...)` URL comparison
- Fix:
  - replaced the broad prefix comparison with a more specific target-URL check
  - generic root/origin pages no longer count as exact prior-target matches
  - only genuinely specific same-target URLs suppress ambiguity
- Verification:
  - `pnpm vitest run tests/browser/reattach.test.ts tests/cli/sessionDisplay.coverage.test.ts tests/cli/sessionDisplay.test.ts --maxWorkers 1`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - live direct `resumeBrowserSessionCore(...)` repro on a real browser now logs
    `ambiguous` for the staged root-plus-Explore-GPTs conflict


## 2026-04-02 — browser-tools must honor AuraCall runtime profile resolution

- Area: Browser-service tooling / WSL Chrome profile handling
- Symptom:
  - opening `wsl-chrome-2` through `scripts/browser-tools.ts` could appear to
    launch the wrong managed browser profile or behave inconsistently compared
    with real Aura-Call/browser-service launches
- Root cause:
  - the thin Aura-Call wrapper still bypassed AuraCall runtime profile
    resolution
  - it loaded raw user config and resolved only the flattened browser block,
    ignoring AuraCall runtime profile selection and browser target selection
- Fix:
  - added package-owned CLI flags `--auracall-profile` and `--browser-target`
  - forwarded those through `BrowserToolsPortResolverOptions`
  - changed `scripts/browser-tools.ts` to call `resolveConfig(...)` and
    `BrowserService.fromConfig(...)` before attach/launch, so browser-tools now
    uses the same managed browser profile selection logic as Aura-Call
- Verification:
  - `pnpm vitest run tests/browser/browserTools.test.ts tests/browser/profileResolution.test.ts tests/browser/profileConfig.test.ts tests/browser/browserService.test.ts --maxWorkers 1`
  - `pnpm exec tsc -p tsconfig.json --noEmit`


## 2026-04-02 — Managed browser profiles must follow the signed-in subprofile, not always `Default`

- Area: Browser profile semantics / managed WSL Chrome account families
- Symptom:
  - `wsl-chrome-2` could have a signed-in managed Chrome account under
    `Profile 1`, while Aura-Call still resolved `chromeProfile: "Default"` for
    launch, attach, and doctor flows
- Root cause:
  - config/browser resolution treated the source browser profile name as if it
    were always the correct managed browser profile subdirectory too
  - after Chrome sign-in created a new managed subprofile, Aura-Call had no
    logic for following `Local State.profile.last_used` or the signed-in profile
    in `info_cache`
- Fix:
  - added `resolveManagedProfileName(...)`
  - when the configured managed subprofile is `Default`, prefer the managed
    profile's `last_used` entry if it exists on disk, has a signed-in marker,
    and `Default` does not
  - applied that to:
    - typed launch-profile resolution
    - the Aura-Call browser-service wrapper
    - local browser doctor
- Verification:
  - `pnpm vitest run tests/browser/profileStore.test.ts tests/browser/profileResolution.test.ts tests/browser/browserService.test.ts tests/browser/profileDoctor.test.ts tests/browser/browserTools.test.ts --maxWorkers 1`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - live local doctor on `wsl-chrome-2/chatgpt` now reports:
    - `chromeProfile: "Profile 1"`
    - signed-in Chrome account `consult@polymerconsultinggroup.com`


## 2026-04-02 — browser-tools start must not rewrite explicit managed browser profiles back to `default`

- Area: Browser-service tooling / managed browser profile launch resolution
- Symptom:
  - `scripts/browser-tools.ts --auracall-profile wsl-chrome-2 --browser-target chatgpt start`
    could still reuse or relaunch the `default` managed browser profile even
    after the wrapper learned AuraCall runtime profile selection
  - in some runs it also silently fell back to `~/.cache/scraping`
- Root cause:
  - the package `browser-tools` CLI always injected a default `--profile-dir`,
    so unset launch options were not actually unset
  - `resolveBrowserConfig(...)` did not know the AuraCall runtime profile name,
    so an explicit managed browser profile like
    `~/.auracall/browser-profiles/wsl-chrome-2/chatgpt` could be normalized
    back to `.../default/chatgpt`
  - stale top-level browser service fields could also contaminate service
    binding when switching AuraCall runtime profiles
- Fix:
  - removed package defaults for `browser-tools start --profile-dir` and
    `--chrome-path`, so the resolver only sees explicit operator values
  - fixed profile-service default application so selected-service fields like
    `manualLoginProfileDir` come from the selected service config rather than
    stale top-level browser state
  - added explicit `auracallProfileName` context to `resolveBrowserConfig(...)`
    and threaded it through userConfig-backed call sites
- Verification:
  - `pnpm vitest run tests/browser/config.test.ts tests/browser/profileConfig.test.ts tests/browser/profileResolution.test.ts tests/browser/browserTools.test.ts tests/browser/browserService.test.ts tests/browser/profileStore.test.ts tests/browser/profileDoctor.test.ts tests/browser/login.test.ts --maxWorkers 1`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - live:
    - `DISPLAY=:0.0 pnpm tsx scripts/browser-tools.ts --auracall-profile wsl-chrome-2 --browser-target chatgpt start`
      now launches:
      - `--profile-directory=Profile 1`
      - `--user-data-dir=/home/ecochran76/.auracall/browser-profiles/wsl-chrome-2/chatgpt`
      - stable DevTools on port `45013`


## 2026-04-02 — top-level browser runs must preserve the selected AuraCall runtime profile

- Area: Browser runtime launch resolution / managed browser profile selection
- Symptom:
  - top-level browser runs like
    `auracall --profile wsl-chrome-2 --engine browser ...`
    could still fall back to `/home/.../browser-profiles/default/chatgpt`
    even after browser-tools and doctor were fixed
- Root cause:
  - the real browser-run path still dropped `auracallProfileName` before
    resolving launch config and managed browser profile dirs
  - `resolveManagedBrowserLaunchContext(...)` then recomputed the managed
    browser profile path without the selected AuraCall runtime profile context
- Fix:
  - persisted `auracallProfileName` in browser session config
  - threaded it into:
    - `runBrowserMode(...)`
    - reattach config resolution
    - the managed browser launch-context helper
  - added regression coverage for:
    - browser session config carrying `auracallProfileName`
    - managed browser launch-context resolution inside a non-default AuraCall
      runtime profile
- Verification:
  - `pnpm vitest run tests/browser/browserModeExports.test.ts tests/cli/browserConfig.test.ts tests/browser/config.test.ts tests/browser/profileConfig.test.ts tests/browser/browserTools.test.ts tests/browser/browserService.test.ts tests/browser/profileDoctor.test.ts tests/browser/login.test.ts tests/browser/reattach.test.ts --maxWorkers 1`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - live:
    - `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts --profile wsl-chrome-2 --engine browser --model gpt-5.2 --prompt "Reply exactly with: WSL CHROME 2 SESSION OK 3" --verbose --force`
    - now reuses:
      - `/home/ecochran76/.auracall/browser-profiles/wsl-chrome-2/chatgpt`
      - `Profile 1`
      - DevTools port `45013`
    - and returns the expected reply


## 2026-04-02 — same-origin reattach must trust selected-port profile-mismatch evidence

- Area: Browser session reattach / cross-profile safety
- Symptom:
  - a real `default` ChatGPT session aimed at the live `wsl-chrome-2`
    DevTools port could still reattach and read the wrong browser profile's
    tab because both browsers were on the same origin (`chatgpt.com`)
- Root cause:
  - reattach classification only trusted fully `live` selected-port owners
  - after Chrome respawned under the same managed browser profile with a new
    PID, the correct `wsl-chrome-2` selected-port entry was downgraded to
    `profile-mismatch`
  - that meant the classifier threw away the strongest signal that port `45013`
    still belonged to the `wsl-chrome-2` managed browser profile
- Fix:
  - added selected-port registry candidate collection to reattach diagnostics
  - reattach now treats selected-port candidates with either:
    - `live`
    - `profile-mismatch`
    as strong browser-profile ownership evidence
  - if the selected DevTools port belongs to a different managed browser
    profile than the session expects, reattach now fails as
    `wrong-browser-profile` before target picking
- Verification:
  - `pnpm vitest run tests/browser/registryDiagnostics.test.ts tests/browser/reattach.test.ts tests/cli/sessionDisplay.coverage.test.ts --maxWorkers 1`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - live:
    - replayed a stored `default` ChatGPT session against live port `45013`
      from `wsl-chrome-2`
    - confirmed the reattach path classified the attempt as
      `wrong-browser-profile`


## 2026-04-02 — reattach recovery must retry one fresh DevTools attach after launch

- Area: Browser reattach recovery / fresh Chrome launch
- Symptom:
  - `resumeBrowserSessionViaNewChrome(...)` could fail immediately with
    `connect ECONNREFUSED 127.0.0.1:<port>` even after a fresh managed browser
    launch succeeded
- Root cause:
  - the reattach recovery path connected to the new DevTools port too eagerly
  - the main browser-run path already had a bounded `isDevToolsResponsive(...)`
    probe and attach retry, but reattach recovery did not
- Fix:
  - added the same bounded recovery pattern to reattach recovery:
    - first connect attempt
    - if it fails, probe the fresh DevTools port once
    - if reachable, retry the attach once and continue
- Verification:
  - `pnpm vitest run tests/browser/reattach.test.ts tests/browser/registryDiagnostics.test.ts tests/cli/sessionDisplay.coverage.test.ts --maxWorkers 1`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - live:
    - after pruning stale browser-state entries, the `default` ChatGPT
      reattach smoke completed successfully through the fresh-browser recovery
      path
- Remaining follow-up:
  - `wsl-chrome-2` still has a separate fresh-launch issue:
    when reattach has to launch a new managed browser, ChatGPT shows a login
    CTA even though the already-open managed browser is signed in

## 2026-04-02 - browser-tools managed-browser-profile launch isolation

- Symptom:
  - `scripts/browser-tools.ts --browser-target chatgpt start` could return the
    live Grok DevTools port or relaunch onto the Grok port instead of opening a
    separate `default/chatgpt` managed browser profile
  - this made it look like the `default/chatgpt` managed browser profile had
    been wiped when the real problem was launch/attach contamination
- Root cause:
  - the live `default` AuraCall runtime profile still had stale top-level
    browser fields pinned to Grok (`manualLoginProfileDir` and `debugPort`)
  - `scripts/browser-tools.ts` trusted those fields for both registry reuse and
    fresh launch
  - the wrapper also bypassed the new stable preferred-port logic in
    `packages/browser-service/src/manualLogin.ts`
- Fix:
  - `packages/browser-service/src/manualLogin.ts`
    - derive a stable preferred fixed DevTools port from the managed browser
      profile identity before probing for availability
  - `scripts/browser-tools.ts`
    - resolve the managed browser profile dir from AuraCall runtime profile +
      target
    - reuse only a matching registry entry for that exact managed browser
      profile
    - ignore config-derived fixed ports unless the operator explicitly passes
      `--port`
- Verification:
  - tests:
    - `pnpm vitest run tests/browser/browserTools.test.ts tests/browser-service/manualLogin.test.ts tests/browser/profileConfig.test.ts --maxWorkers 1`
    - `pnpm exec tsc -p tsconfig.json --noEmit`
  - live:
    - with `default/grok` already open on `45011`, a fresh
      `default/chatgpt` launch now comes up separately on `45065`
    - DevTools tab inventory stays isolated:
      - `45011` => Grok
      - `45065` => ChatGPT

## 2026-04-02 - wsl-chrome-2 fresh reattach launch now keeps the selected AuraCall runtime profile

- Symptom:
  - `wsl-chrome-2` fresh-launch reattach could reopen a ChatGPT login surface
    even though the real `wsl-chrome-2` managed browser profile was already
    signed in
- Root cause:
  - `resumeBrowserSessionViaNewChrome(...)` rebuilt the managed browser profile
    path with `resolveManagedProfileDir(...)` but did not pass the AuraCall
    runtime profile name
  - that allowed the fallback managed browser profile path to collapse to
    `~/.auracall/browser-profiles/default/chatgpt`
    even when the stored session belonged to `wsl-chrome-2`
- Fix:
  - pass `config.auracallProfileName` into `resolveManagedProfileDir(...)`
    during fresh reattach launch
  - added a regression test proving fresh reattach launch preserves the
    selected AuraCall runtime profile's managed browser directory
- Verification:
  - `pnpm vitest run tests/browser/reattach.test.ts tests/browser/registryDiagnostics.test.ts tests/cli/sessionDisplay.coverage.test.ts --maxWorkers 1`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - live:
    - killed the live `wsl-chrome-2/chatgpt` browser
    - replayed the stored `reattach-smoke-wsl` session
    - fresh reattach launch reopened:
      - `~/.auracall/browser-profiles/wsl-chrome-2/chatgpt`
      - `Profile 1`
    - ChatGPT login check passed and the stored response was recovered

## 2026-04-02 - doctor/browser-tools now stay on the selected managed browser profile

- Symptom:
  - `auracall doctor --target chatgpt --prune-browser-state --json` could route
    its runtime probe and selector diagnosis into the live Grok page
  - the same command also surfaced `browserToolsError: "__name is not defined"`
- Root cause:
  - attach discovery still trusted config-derived fixed ports, so stale
    top-level browser state could pull doctor onto the wrong live browser
  - the package-owned browser-tools page probe serialized a transpiled
    `page.evaluate(...)` function that referenced an unavailable `__name`
    helper inside the browser context
- Fix:
  - `src/browser/service/portResolution.ts`
    - removed config-derived fixed-port reuse from attach discovery
    - attach discovery now trusts only:
      - explicit env port overrides, or
      - exact managed browser profile registry matches
  - `src/browser/service/registryDiagnostics.ts`
    - preserve AuraCall runtime profile context when rebuilding expected
      managed browser profile paths
  - `packages/browser-service/src/browserTools.ts`
    - replaced the failing page-side probe function with a raw expression
      string so browser-side execution no longer depends on transpiler helpers
- Verification:
  - `pnpm vitest run tests/browser/browserTools.test.ts tests/browser/portResolution.test.ts tests/browser/profileDoctor.test.ts tests/browser/browserService.test.ts tests/browser/registryDiagnostics.test.ts --maxWorkers 1`
  - `pnpm exec tsc -p tsconfig.json --noEmit`
  - live:
    - `auracall doctor --target chatgpt --prune-browser-state --json`
      now attaches runtime probes to the real ChatGPT browser on `38155`
    - `browserToolsError` is now `null`

## 2026-04-02 - config-model target shape is now explicit and the bridge names are documented as transitional

- Durable lesson:
  - the docs had the right semantics, but not one explicit target public shape
  - that made it too easy for implementation work to keep landing on bridge
    names like `browserFamilies` and `profiles` without a clear end-state
- Decision:
  - the design authority is now the layered target shape:
    - `browserProfiles`
    - `runtimeProfiles`
    - `agents`
    - `teams`
  - the currently implemented public keys remain bridge names for now:
    - `browserFamilies`
    - `profiles`
    - `profiles.<name>.browserFamily`
- Implication for future slices:
  - keep current bridge keys stable enough for normal use
  - do not treat bridge names as the long-term model
  - land non-breaking schema/runtime seams toward the target shape before
    doing broad renames

## 2026-04-02 - config inspection and bridge-health commands now expose the target model without changing stored bridge keys

- Durable lesson:
  - once the bridge terminology was clarified, operators still had no easy way
    to inspect the active AuraCall runtime profile, browser-profile bridge, or
    bridge-health problems without reading raw JSON
- Fix:
  - added read-only config-model inspection/reporting commands:
    - `auracall config show`
    - `auracall profile list`
    - `auracall config doctor`
  - onboarding and migration writes now print a compact runtime-profile ->
    browser-profile summary in the target-model terms
- Result:
  - operators can now inspect:
    - the active AuraCall runtime profile
    - browser-profile bridges across all runtime profiles
    - missing/dangling browser-profile references
    - legacy `auracallProfiles` residue
  - without changing the stored bridge-key layout

## 2026-04-02 - resolved browser config still needs one shared managed-browser identity seam

- Symptom:
  - even after the runtime-profile/browser-profile bridge helpers were in
    place, multiple runtime flows were still rebuilding managed browser profile
    identity independently from already-resolved browser config
  - the duplicated logic covered:
    - managed browser profile dir
    - default managed browser profile dir
    - effective Chrome profile name
    - bootstrap cookie source path
- Fix:
  - added
    `resolveManagedBrowserLaunchContextFromResolvedConfig(...)` in
    `src/browser/service/profileResolution.ts`
  - moved browser runtime/bootstrap, login, doctor, browser-service attach,
    browser list targeting, registry diagnostics, and fresh reattach launch onto
    that shared seam
- Durable lesson:
  - centralizing only the user-config -> resolved-config transition is not
    enough
  - the next boundary also matters:
    - resolved browser config -> managed browser profile identity
  - if that second seam stays duplicated, profile/path drift can reappear even
    when higher-level config semantics are already correct

## 2026-04-02 - reattach should reuse one resolved session launch context

- Symptom:
  - reattach had already moved fresh relaunch onto the shared managed-browser
    seam, but `reattach.ts` still rebuilt browser config separately for
    wrong-browser-profile classification and for the relaunch dependency hook
- Fix:
  - added `resolveSessionBrowserLaunchContext(...)`
  - reattach now resolves session browser config once and reuses it across:
    - fresh relaunch
    - registry diagnostics
    - wrong-browser-profile classification
- Durable lesson:
  - after introducing a shared seam, the next cleanup should target the callers
    that still rebuild the same resolved object twice in one flow
  - that is where hidden drift tends to survive longest even when the shared
    helper already exists

## 2026-04-02 - browser runtime entry should share one managed-profile preparation path

- Symptom:
  - after the managed-browser launch seam was centralized, the two main browser
    runtime entry paths in `src/browser/index.ts` still repeated the same local
    launch-preparation work:
    - managed browser profile dir setup
    - bootstrap logging
    - destructive retry eligibility
- Fix:
  - extracted `prepareManagedBrowserProfileLaunch(...)` inside
    `src/browser/index.ts`
  - both ChatGPT and Grok local browser entry flows now use that helper
- Durable lesson:
  - once config/launch semantics are centralized, the next duplication hotspot
    is usually the runtime entrypoint itself
  - that layer should still get one local seam before attempting larger package
    extraction, otherwise provider entry paths drift again even while lower
    layers are clean

## 2026-04-02 - browser runtime entry should also centralize pre-launch config normalization

- Symptom:
  - even after launch-prep was shared, `runBrowserMode(...)` still mixed three
    separate responsibilities inline before provider branching:
    - resolve browser config
    - normalize logger defaults
    - allocate a fixed DevTools port when the strategy is not `auto`
- Fix:
  - extracted `resolveBrowserRuntimeEntryContext(...)` in
    `src/browser/index.ts`
  - the top-level browser runtime path now uses one explicit entry helper for
    pre-launch config preparation
- Durable lesson:
  - the browser runtime entry boundary has at least two useful local seams:
    - pre-launch config preparation
    - managed browser profile launch preparation
  - separating those explicitly is cleaner than one large refactor and gives a
    better base for future provider/runtime cleanup

## 2026-04-02 - config inspection JSON should expose the target model directly, but read-only

- Symptom:
  - the new inspection commands spoke the right terms, but machine-readable
    output still mirrored the bridge model too closely
  - tooling could see:
    - `browserFamilies`
    - `profiles`
    - bridge summaries
  - but not one explicit projected target model
- Fix:
  - added `projectConfigModel(...)` and exposed its result as `projectedModel`
    in `config show --json` and `profile list --json`
- Durable lesson:
  - inspection/output can move ahead of input compatibility safely
  - that is the right order here:
    - first expose the target model read-only
    - only later decide whether to accept target-shape aliases like
      `browserProfiles` / `runtimeProfiles`

## 2026-04-02 - target-shape input aliases need an explicit compatibility policy before implementation

- Durable lesson:
  - once the target model is visible in read-only inspection output, the next
    temptation is to start accepting `browserProfiles` / `runtimeProfiles`
    immediately
  - doing that without a documented policy would create ambiguity around:
    - precedence
    - mixed bridge/target configs
    - write-back behavior
- Decision:
  - document the input-alias policy first
  - keep target-shape aliases unimplemented until that policy is the source of
    truth
- Policy document:
  - [config-model-input-alias-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/config-model-input-alias-plan.md)

## 2026-04-02 - bridge-health diagnostics belong in the config-model seam, not only in CLI formatting

- Symptom:
  - `config doctor` knew how to reason about missing or dangling
    runtime-profile -> browser-profile bridges
  - but that logic lived only inside `configCommand.ts`
  - other model-aware surfaces already depended on `projectConfigModel(...)`,
    so diagnostics and projection were drifting apart
- Fix:
  - added `analyzeConfigModelBridgeHealth(...)` and shared doctor report types
    in [src/config/model.ts](/home/ecochran76/workspace.local/oracle/src/config/model.ts)
  - kept `configCommand.ts` as a presentation layer that formats the shared
    analysis instead of owning it
- Durable lesson:
  - once the target model gets a shared projection seam, its read-only
    diagnostics should live there too
  - CLI/operator surfaces should consume that seam rather than re-implement the
    same bridge rules locally

## 2026-04-02 - overlapping read-only config inspection views should share one model-layer inventory helper

- Symptom:
  - `config show` and `profile list` were both read-only target-model surfaces
  - but each still rebuilt overlapping state locally:
    - active AuraCall runtime profile
    - browser-profile inventory
    - runtime-profile inventory
    - bridge-key presence
- Fix:
  - added `inspectConfigModel(...)` in
    [src/config/model.ts](/home/ecochran76/workspace.local/oracle/src/config/model.ts)
  - rewired CLI report builders to consume that shared inspection view
- Durable lesson:
  - once multiple operator surfaces are exposing the same conceptual model,
    inventory/state assembly should move into the model seam before adding more
    commands or input aliases
