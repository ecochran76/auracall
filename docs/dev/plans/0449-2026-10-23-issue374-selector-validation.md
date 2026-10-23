# Plan 0449 | Reject unknown ChatGPT CLI selectors

State: CLOSED
Issue: https://github.com/ecochran76/auracall/issues/374
Owner: Eric Cochran / Codex
Branch: fix/issue374-selector-validation

## Current State

Offline installed-runtime replay reproduced `chatgpt:reasoning-medium` resolving to null semantic selection, then gpt-5.2 / GPT-5.6 Terra. Config-free reproduction rules out profile overrides. Supported `chatgpt:reasoning` selects Sol / standard. Installed and source selector tables agree. New run-option regressions failed before the first fix. A full source CLI dry-run exposed the separate schema resolver path; its regressions then failed and pass after validating that boundary too. Runtime deployment and live browser acceptance remain separate.

## Scope and acceptance

Reject unknown namespaced ChatGPT selectors before generic inference for single-model browser CLI requests, including configured model input. Preserve valid selectors and explicit provider-family pins. Document supported Medium intent. Prove red/green resolver regression and focused adjacent tests; typecheck. No provider prompts, warning changes, model-family remapping, new aliases, multi-model/API changes or installed-runtime deployment.

## Validation

- `pnpm exec vitest run tests/runOptions.test.ts tests/schema/resolver.test.ts tests/config/modelSelector.test.ts tests/cli/browserConfig.test.ts`: 121/121 passed.
- `pnpm exec tsc --noEmit`: passed after correcting a new test fixture missing its required model property.
- `pnpm exec tsx bin/auracall.ts --engine browser --model chatgpt:reasoning-medium --dry-run json --prompt "Synthetic offline selector probe"`: now exits 1 with precise unknown-selector validation; before fix exited 0 with gpt-5.2.
- Same CLI command with `--model chatgpt:reasoning`: exits 0 with gpt-5.6-sol. No provider prompt submitted.
- No debug instrumentation introduced. Private throwaway installed-runtime replay retained outside Git for diagnosis, not shipped.

## Definition of done

Source validation passes; bounded diff reviewed; commit and remote PR custody verified. Issue stays open for separate installed qualification.
