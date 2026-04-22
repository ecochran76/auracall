# Browser-Service Wrapper Build Compatibility | 0043-2026-04-22

State: CLOSED
Lane: P01

## Scope

Fix the integration issue found during the post-checkpoint validation pass:
browser-service wrapper scripts passed `tsx` and `tsc --noEmit`, but failed the
build tsconfig because they used explicit `.ts` import extensions.

## Current State

- Plan 0041 added thin wrapper copies under `scripts/browser-service/`.
- The wrappers used `await import("../<script>.ts")`.
- `pnpm run check` passed because the base tsconfig enables
  `allowImportingTsExtensions`.
- `pnpm run build` failed because `tsconfig.build.json` disables
  `allowImportingTsExtensions` for emitted builds.

## Change

- Switched all browser-service wrapper imports to extensionless module
  specifiers:
  - from `await import("../browser-tools.ts")`
  - to `await import("../browser-tools")`
- Updated wrapper-shape coverage to require extensionless imports.
- Verified the wrapper family still executes through `tsx`.

## Acceptance Criteria

- Wrapper scripts remain thin compatibility copies.
- Wrapper scripts compile under both the dev typecheck and emitted build
  tsconfig.
- Raw-CDP guarded wrappers still refuse without an explicit escape hatch.
- Full non-live validation remains green.

## Validation

- `pnpm vitest run tests/scripts/browserServiceWrappers.test.ts tests/scripts/rawDevtoolsGuard.test.ts`
- `pnpm tsx scripts/browser-service/test-remote-chrome.ts 127.0.0.1 1`
- `pnpm tsx scripts/browser-service/browser-tools.ts --help`
- `pnpm run check`
- `pnpm test`
- `pnpm run test:mcp`
- `pnpm run plans:audit -- --keep 43`
- `git diff --check`
