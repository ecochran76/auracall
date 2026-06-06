# Plan 0113 | Browser Process Owner Attribution

Date: 2026-06-05
State: CLOSED
Lane: P01

## Goal

Make AuraCall-managed browser process readbacks answer which AuraCall operation
is driving a live or retained managed browser process.

## Context

The Plan 0109 rerun no-go showed the scheduler foreground-work false positive
was fixed, but process isolation was still not explainable from browser-state
alone. `~/.auracall/browser-state.json` records managed browser PID, port,
profile path, and service affinity, but not the active operation, source, or
lease/cleanup policy that caused AuraCall to launch or reattach the browser.

## Scope

- Add optional owner, operation, and lease metadata to browser registry entries.
- Thread history materialization job context into browser service creation for
  provider browser work.
- Update the managed browser registry after launch or reattach resolution.
- Surface owner/operation/lease metadata in browser-process status readbacks.
- Add focused coverage for registry preservation and service owner updates.

## Non-Goals

- Do not change scheduler eligibility or account-library automatic mode.
- Do not kill or restart existing managed browsers as part of this plan.
- Do not infer owners for unmanaged or pre-existing Chrome processes without
  an AuraCall registry entry.

## Acceptance

- A history materialization browser launch or reattach can persist the job id,
  provider, AuraCall runtime profile, source type/key, and cleanup policy in
  browser-state.
- `/v1/browser/processes` and status payloads expose the recorded
  owner/operation/lease fields for each managed browser process target.
- Existing registry entries without ownership metadata still load and update.
- Focused tests and plan audit pass.

## Closeout

Implemented additive browser registry ownership metadata:

- `BrowserInstance` now supports optional `owner`, `operation`, and `lease`.
- History materialization browser-backed work stamps job id, provider, AuraCall
  runtime profile, browser profile, source type/key, reason, and lease cleanup
  policy when the managed browser target is resolved or reattached.
- Browser-process status readbacks include the recorded ownership fields, and
  the ops browser-process table shows the current owner summary.

Validation:

- `pnpm vitest run tests/browser-service/stateRegistry.test.ts tests/browser/browserService.test.ts`
- `pnpm vitest run tests/http.responsesServer.test.ts -t "browser process"`
- `pnpm exec tsc --noEmit --pretty false`
- `pnpm exec biome lint packages/browser-service/src/service/stateRegistry.ts src/browser/service/stateRegistry.ts src/browser/service/browserService.ts src/browser/llmService/providers/index.ts src/browser/llmService/providers/chatgptService.ts src/browser/llmService/providers/geminiService.ts src/browser/llmService/providers/grokService.ts src/runtime/historyMaterializationService.ts src/http/responsesServer.ts tests/browser-service/stateRegistry.test.ts tests/browser/browserService.test.ts`
- `pnpm run build`
- `git diff --check`
- `pnpm run install:user-runtime-service`
- `systemctl --user restart auracall-api.service && systemctl --user is-active auracall-api.service`
- authenticated `GET /v1/browser/processes` returned ten configured browser
  process targets with `owner`, `operation`, and `lease` fields present; all
  current targets were idle with `processAlive=false`, so ownership values were
  `null` until the next browser-backed history materialization stamps them.

Note: a full-file lint of `tests/http.responsesServer.test.ts` still reports
pre-existing non-null assertion warnings outside this slice.
