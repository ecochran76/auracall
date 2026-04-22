# Grok Model Drift Checkpoint | 0048-2026-04-22

State: CLOSED
Lane: P01

## Scope

Correct Aura-Call's Grok text-model canonicalization after dogfood exposed that
plain `grok` still resolved through the stale 4.1 model key.

## Current State

- Grok browser service registry already treated `grok`, `grok-4.2`, and
  `grok-4.20` as current Heavy-mode aliases.
- Higher-level CLI/API model canonicalization still collapsed plain `grok` to
  `grok-4.1`.
- The installed-runtime image dogfood request exposed the drift when the Grok
  API leg attempted the wrong model ID.

## Change

- Added `grok-4.20` as a first-class known model key.
- Mapped `grok-4.20` API calls to `grok-4.20-reasoning`.
- Kept `grok-4.1` as an explicit legacy key.
- Changed plain `grok`, `Grok 4.2`, and related labels to resolve to
  `grok-4.20`.
- Updated setup/wizard defaults and Grok docs to use the current key.

## Acceptance Criteria

- Plain Grok selection no longer points at the stale 4.1 key.
- Explicit `grok-4.1` remains accepted for legacy/manual testing.
- Browser setup/wizard defaults select current Grok.
- Docs distinguish current Grok text support from unimplemented Grok Imagine
  media support.

## Validation

- `pnpm vitest run tests/cli/options.test.ts tests/runOptions.test.ts tests/cli/browserSetup.test.ts tests/cli/browserWizard.test.ts tests/openrouter.test.ts tests/oracle/multiModelRunner.test.ts tests/services/registry.test.ts tests/browser/grokModelMenu.test.ts tests/cli/browserConfig.test.ts tests/cli/runOracle/runOracle.request-payload.test.ts`

