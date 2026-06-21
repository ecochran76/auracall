# Agent-Browser Generic Service Routines Handoff

Date: 2026-06-14
Source plan: `/home/ecochran76/workspace.local/agent-browser/docs/dev/plans/0034-2026-06-14-generic-browser-service-routines-plan.md`
AuraCall governing plan: `docs/dev/plans/0141-2026-06-12-agent-browser-migration.md`
Scope: handoff only. This note does not change AuraCall code, runtime state, provider adapters, account mirrors, or migration sequencing.

## Summary

Agent-browser now has generic browser-service routines that cover the repeated CDP-backed work AuraCall previously needed to perform directly in provider adapters. The new routines are intentionally provider-neutral. Agent-browser owns lifecycle, service tab handles, leases, generic browser routines, traceability, evidence caps, and live validation. AuraCall should continue to own provider-specific selectors, DOM interpretation, identity mismatch rules, account-mirror cursors, materialization policy, and the migration sequence.

The useful migration target is not zero CDP everywhere. The useful target is that broad raw CDP becomes the exception. AuraCall can move common browser-service tasks to access-plan-first service requests and keep provider-specific extraction logic as caller-owned recipes.

## Availability Boundary

The agent-browser implementation workspace is intentionally dirty at handoff
time. Treat this note as a feature and contract handoff, not proof that the
installed `agent-browser` binary on this workstation already exposes every
routine through the command on `PATH`.

Before AuraCall imports client helpers or calls the new service actions, an
AuraCall migration slice must record one of these consumption boundaries:

- the exact agent-browser commit or branch used for integration;
- the installed agent-browser binary/package version that contains these
  service actions;
- or a local checkout path used only for a bounded adapter proof.

Do not mix a stale installed binary with generated client helpers from the
dirty agent-browser checkout and call that a supported runtime. The first
AuraCall adapter proof should include a no-launch contract readback from the
actual agent-browser surface it will call.

## New Agent-Browser Capabilities

- Access-plan-first service tab flow:
  - `getServiceAccessPlan()`
  - `requestServiceTabFromAccessPlan()`
  - `requireServiceTabHandle()`
  - `attachServiceTabCdp()`
  - `requestServiceCdpDetach()`

- Generic identity and account probing:
  - service request action: `probe`
  - helpers: `createServiceProbeRequest()`, `requestServiceProbe()`, `probeServiceTab()`
  - detector types: `url_title`, `selector_text`, `evaluate`, `client_evidence`
  - freshness writes only happen when the caller explicitly supplies `probe.recordFreshness` and target/account context

- Service tab handle refresh:
  - service request action: `tab_handle_refresh`
  - helpers: `createServiceTabHandleRefreshRequest()`, `requestServiceTabHandleRefresh()`, `refreshServiceTabHandle()`
  - repair policies: `reject_only`, `reuse_compatible`, `open_if_missing`

- Generic UI actions:
  - service request action: `ui_action`
  - helpers: `createServiceUiActionRequest()`, `requestServiceUiAction()`, `runServiceUiAction()`
  - generic step types include `find`, `focus`, `fill`, `type`, `select`, `menu_select`, `click`, `wait`, `clear`, and guarded `dialog`

- Capped network evidence:
  - service request action: `network_capture`
  - helpers: `createServiceNetworkCaptureRequest()`, `requestServiceNetworkCapture()`, `captureServiceNetwork()`
  - metadata-only by default, explicit body capture with `maxBodyBytes`, response header allowlists, and truncation metadata

- Upload and download transfer:
  - service request action: `file_transfer`
  - helpers: `createServiceFileTransferRequest()`, `requestServiceFileTransfer()`, `transferServiceFiles()`
  - uploads require selector or visible label, explicit files, `allowedPaths`, and `maxFiles`
  - downloads require selector, directory, `allowedDirectories`, and optional expected file name or `maxBytes`

- Diagnostics:
  - service request action: `diagnostics`
  - helpers: `requestServiceDiagnostics()`, `getServiceTabDiagnostics()`
  - returns compact URL/title, browser, session, tab, profile-readiness, route/view, console, error, request-summary, snapshot-summary, trace, and optional screenshot evidence for the same handle

- Composed workflow harness:
  - example: `/home/ecochran76/workspace.local/agent-browser/examples/service-client/composed-workflow.mjs`
  - no-launch test: `/home/ecochran76/workspace.local/agent-browser/scripts/test-service-client-composed-workflow.js`
  - live smoke: `/home/ecochran76/workspace.local/agent-browser/scripts/smoke-service-composed-workflow-live.js`
  - command: `pnpm test:service-composed-workflow-live`
  - flow: access plan, service-owned tab, policy-gated attach, identity/account probe, UI action recipe, network capture, file transfer, diagnostics, and detach

## Suggested AuraCall Migration Mapping

Plan 0141 remains the governing AuraCall migration plan. The next AuraCall
work should update or execute Plan 0141 Slice 2 and Slice 3 rather than create
a separate migration plan.

The first blocker is still identity/profile mapping. Before porting provider
CDP categories to the generic routines below, AuraCall must prove the pilot
lane `chatgpt/wsl-chrome-2` with expected provider-app identity
`consult@polymerconsultinggroup.com` maps to a real agent-browser service
profile and that no-launch access-plan readback no longer falls back to
`stealthcdp-default`.

- `Runtime.evaluate` for page-state, account, URL, title, or identity reads:
  - Prefer `probeServiceTab()` with caller-owned detector recipes.
  - Keep ChatGPT, Gemini, Grok, or other provider-specific selectors in AuraCall recipe data.
  - Use `probe.recordFreshness` only when AuraCall is intentionally updating browser-service freshness for a target/account.

- `Target.*` rescans and ad hoc tab rediscovery:
  - Prefer `refreshServiceTabHandle()` with `reject_only` for evidence, `reuse_compatible` for same-lane recovery, or `open_if_missing` for reviewed replacement.

- `Input.*`, small DOM scripts, and repeated click/fill/wait sequences:
  - Prefer `runServiceUiAction()` with bounded steps.
  - Keep destructive confirmations, captcha, anti-bot, payment, and human-verification flows outside generic automation unless a human or provider-specific policy explicitly authorizes them.

- `Network.*` listeners and `Network.getResponseBody`:
  - Prefer `captureServiceNetwork()`.
  - Default to metadata-only. Capture bodies only with explicit filters and caps.

- `Browser.setDownloadBehavior` and `Page.setDownloadBehavior`:
  - Prefer the download half of `transferServiceFiles()`.
  - Use allowlisted directories and `maxBytes` when possible.

- `DOM.setFileInputFiles`:
  - Prefer the upload half of `transferServiceFiles()`.
  - Use selector or visible label recipes plus explicit file path allowlists.

- Post-failure screenshots, URL/title reads, console, errors, and request summaries:
  - Prefer `getServiceTabDiagnostics()` against the same `serviceTabHandle`.

## Validation Evidence From Agent-Browser

The generic routines and composed harness were validated in the agent-browser repo with:

- `pnpm generate:service-client`
- `pnpm test:service-client`
- `pnpm test:service-api-mcp-parity`
- `pnpm test:service-client-contract`
- `pnpm test:service-composed-workflow-live`
- `cd docs && pnpm build`
- `git diff --check`

The composed live smoke passed against an isolated daemon and generic local HTML fixture. It proved access plan, service tab handle, policy-gated attach, identity/account probe, UI action, network capture, upload, download capture, diagnostics, detach, and service trace readback without provider selectors or private AuraCall state.

## Recommended Next AuraCall Step

Update Plan 0141 Slice 2 to consume this handoff as an input, then prove the
pilot profile/account mapping and the agent-browser availability boundary
without changing provider scraping. After that, execute Plan 0141 Slice 3 as
an opt-in adapter proof that groups current direct CDP usage by provider and
uses the generic routines only where AuraCall can keep account-mirror and
materialization rules explicit.

## 2026-06-15 AuraCall Rerun Addendum

AuraCall proved the first half of the mapping after this handoff:

- registered `auracall-chatgpt-wsl-chrome-2-consult` as an
  agent-browser service profile through the public service API;
- marked it `external_byop` / `caller_supplied`;
- mapped it to `chatgpt` and
  `consult@polymerconsultinggroup.com`;
- pointed it at
  `/home/ecochran76/.auracall/browser-profiles/wsl-chrome-2/chatgpt`;
- added the stock Chrome browser-capability rows needed for no-launch
  preflight;
- verified access-plan now selects that profile by `authenticated_target`.

The remaining blocker is live browser adoption, not account identity:

- AuraCall has an active Chrome process tree for the BYOP profile on DevTools
  port `45013`.
- `agent-browser service resources --json` sees that process tree, but keeps it
  `observed` with no retained `profileId`, `browserId`, `cdpPort`, `sessionIds`,
  or tab correlation.
- Access-plan therefore reports `compatibleLiveBrowserCount: 0` and
  `recommendedAction: launch_new_browser` for the registered BYOP profile.

Feature request for agent-browser implementation:

- Provide an adopt/attach/reuse path for registered `external_byop` profiles
  where a live Chrome process is already running with a known user-data dir and
  DevTools endpoint.
- The path should create or update retained service browser/session/tab records
  without relaunching Chrome, then make `profileReuse` report the reusable
  browser/session and emit route hints that `requestServiceTabFromAccessPlan()`
  can use.
- Until this exists, AuraCall must not issue a live `tab_new` service request
  for the BYOP lane because the advertised action is `launch_new_browser`.
