# Browser-Service Upgrade Backlog

Purpose: track generic browser-automation improvements that belong in
`packages/browser-service/`, not Aura-Call provider code.

Use this backlog for features that would help any agentic browser workflow:
DevTools targeting, tab selection, readiness detection, structured probing, and
instance diagnostics.

## Order of work

1. Deterministic tab census + selection explanation
2. Reusable target-selection framework
3. Generic readiness / hydration wait helpers
4. Structured probe primitives
5. Browser-service doctor surface

## 1. Deterministic tab census + selection explanation

Status: landed 2026-03-25

Why:
- We keep spending tokens rediscovering which tab was actually targeted.
- Existing `inspect` output listed tabs but did not explain which one `eval` /
  `pick` / `screenshot` would choose.

Files:
- `packages/browser-service/src/browserTools.ts`
- `tests/browser/browserTools.test.ts`
- `docs/dev/browser-service-tools.md`

Acceptance:
- `browser-tools tabs` shows every tab in one DevTools browser instance.
- Output includes the selected tab, selection reason, and candidate facts.
- The selection logic is exported for package reuse and unit-tested.

## 2. Reusable target-selection framework

Status: started 2026-03-25

Why:
- Browser flows need deterministic, explainable target choice without
  copy-pasting scoring logic into every caller.

Files:
- `packages/browser-service/src/service/instanceScanner.ts`
- `packages/browser-service/src/browserTools.ts`
- `packages/browser-service/src/service/browserService.ts`
- `tests/browser-service/stateRegistry.test.ts`

Acceptance:
- One generic target-selector API accepts URL/title/type preferences.
- The API returns both the winning target and scored alternatives.
- BrowserService can reuse it instead of open-coded tab resolution.

Progress:
- `packages/browser-service/src/service/instanceScanner.ts` now exports
  `explainTabResolution(...)`, which returns the winning tab plus scored
  candidate reasons (`match-url`, `match-title`, `preferred-type`).
- Aura-Call's browser wrapper now returns that explanation as `tabSelection`
  from `resolveServiceTarget(...)` instead of hiding the package scoring result.
- The same wrapper now emits a compact runtime debug summary through its logger,
  so callers can see the winning tab and nearest losers without dumping the full
  tab list.

Next:
- Reuse the same explanation model in more callers instead of only
  `resolveServiceTarget(...)`.
- Decide whether a package-owned formatter should back a future generic doctor
  command, instead of each host app formatting target summaries itself.

## 3. Generic readiness / hydration wait helpers

Status: started 2026-03-25

Why:
- Many failures are “tab exists but app state has not hydrated yet”.
- Retry loops are still too provider-local.

Files:
- `packages/browser-service/src/service/ui.ts`
- `packages/browser-service/src/service/browserService.ts`
- `tests/browser-service/*`

Acceptance:
- Reusable waits for selector, not-selector, arbitrary predicate, and
  script-text presence.
- Clear timeout errors that say what condition failed.
- No service-specific DOM knowledge in the helper surface.

Progress:
- `packages/browser-service/src/service/ui.ts` now exports
  `waitForPredicate(...)` and `waitForDocumentReady(...)`.
- Added `waitForVisibleSelector(...)` and `waitForScriptText(...)` on top of the
  same predicate primitive.
- Existing generic waits (`waitForDialog`, `waitForSelector`,
  `waitForNotSelector`) now reuse the shared predicate helper instead of open
  coding their own polling loops.
- `pressButton(...)` now uses the visible-selector wait when
  `requireVisible` is in effect, so selector-based clicks align with the
  caller's actual readiness expectation.
- Added focused coverage in `tests/browser-service/ui.test.ts`.

Next:
- Start using the richer wait result in targeted debug paths where hydration
  timing still causes ambiguous failures.
- Decide whether `waitForSelector(...)` should eventually gain an options object
  instead of staying as a boolean compatibility wrapper.

## 4. Structured probe primitives

Status: started 2026-03-25

Why:
- Debugging still relies on ad hoc `eval` snippets.
- We need cheap, deterministic probes that return machine-readable facts.

Files:
- `packages/browser-service/src/browserTools.ts`
- `packages/browser-service/src/service/ui.ts`
- `tests/browser/*`

Acceptance:
- Generic probes for visible CTA/button census, storage presence, cookie
  presence, and document state.
- CLI surface can emit JSON directly without hand-written snippets.

Progress:
- `packages/browser-service/src/browserTools.ts` now exports structured page
  probe collection for:
  - document state
  - visible selector matches
  - inline script-text token presence
  - local/session storage presence
  - cookie presence
- Added `browser-tools probe` as a package-owned CLI surface for those probes.

Next:
- Keep the output generic; service-specific interpretation still belongs in the
  host app.
- Decide whether storage/cookie probe matching should stay exact-name based or
  grow a generic substring/prefix mode later.

## 5. Browser-service doctor surface

Status: started 2026-03-25

Why:
- Package consumers need a first-line diagnosis tool before app-specific doctor
  commands.

Files:
- `packages/browser-service/src/browserTools.ts`
- `packages/browser-service/src/service/stateRegistry.ts`
- `packages/browser-service/src/service/instanceScanner.ts`

Acceptance:
- A package-owned doctor command reports live instances, tabs, selection
  explanation, and registry mismatches.
- No Aura-Call-specific provider/auth concepts appear in the output.

Progress:
- `browser-tools doctor` now reports:
  - live tab census
  - selected-tab explanation
  - selected-page document/probe summary
- The doctor/probe surfaces share the same package-owned structured probe layer.
- `doctor --json` and `probe --json` now emit explicit versioned envelopes:
  - `contract: "browser-tools.doctor-report", version: 1`
  - `contract: "browser-tools.page-probe", version: 1`

Next:
- Decide whether registry mismatch reporting belongs in the package doctor or in
  host-app wrappers that know where registry state lives.
- Keep the JSON contract additive and version-gated as the probe surface grows.
