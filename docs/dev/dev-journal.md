# Dev Journal

Log ongoing progress, current focus, and problems/solutions. Keep entries brief and ordered newest-first.

## Entry format

- Date:
- Focus:
- Progress:
- Issues:
- Next:

## Entries

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
- Progress: Replaced the embedded Grok browser alias map with service-registry-driven label resolution. `configs/oracle.services.json` now carries the current Grok browser picker labels plus legacy aliases (`grok-4.1*` -> `Expert`, `grok` / `grok-4.20` -> `Heavy`), while the code keeps only DOM text normalization. Updated the Grok browser config path, runtime mode selection, and project-instructions modal selection to resolve through the registry.
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
