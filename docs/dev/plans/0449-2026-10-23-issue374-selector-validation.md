# Plan 0449 | Reject unknown ChatGPT CLI selectors

State: CLOSED
Issue: https://github.com/ecochran76/auracall/issues/374
Owner: Eric Cochran / Codex
Branch: fix/issue374-selector-validation

## Current State

Offline installed-runtime replay reproduced `chatgpt:reasoning-medium` resolving to null semantic selection, then gpt-5.2 / GPT-5.6 Terra. Config-free reproduction rules out profile overrides. Supported `chatgpt:reasoning` selects Sol / standard. Installed and source selector tables agree. New run-option regressions failed before the first fix. A full source CLI dry-run exposed the separate schema resolver path; its regressions then failed and pass after validating that boundary too. The source slice is complete. The 2026-10-29 continuation below qualifies the current workbench and preserved installed candidate separately.

## Scope and acceptance

Reject unknown namespaced ChatGPT selectors before generic inference for single-model browser CLI requests, including configured model input. Preserve valid selectors and explicit provider-family pins. Document supported Medium intent. Prove red/green resolver regression and focused adjacent tests; typecheck. No provider prompts, warning changes, model-family remapping, new aliases, multi-model/API changes or installed-runtime deployment.

## Validation

- `pnpm exec vitest run tests/runOptions.test.ts tests/schema/resolver.test.ts tests/config/modelSelector.test.ts tests/cli/browserConfig.test.ts`: 121/121 passed.
- `pnpm exec tsc --noEmit`: passed after correcting a new test fixture missing its required model property.
- `pnpm exec tsx bin/auracall.ts --engine browser --model chatgpt:reasoning-medium --dry-run json --prompt "Synthetic offline selector probe"`: now exits 1 with precise unknown-selector validation; before fix exited 0 with gpt-5.2.
- Same CLI command with `--model chatgpt:reasoning`: exits 0 with gpt-5.6-sol. No provider prompt submitted.
- No debug instrumentation introduced. Private throwaway installed-runtime replay retained outside Git for diagnosis, not shipped.

## Definition of done

Source validation passes; bounded diff reviewed; commit and remote PR custody verified. Installed promotion and ticket closure require the qualified candidate and guarded canonical merge; receipts are retained in the user-scoped acceptance directory below.


## 2026-10-29 — Current composer and installed candidate qualification

The operator requested checking the updated composer first. An isolated Agent
Browser task borrowed the existing `wsl-chrome-3` browser; peer tabs were not
selected. The current root Chat composer exposes `Select ChatGPT model`, a
`Select model` submenu containing GPT-6 and GPT-5.6 Sol, and a keyboard Power
control with five positions. Its observed model list still matches the supported
reasoning selector. No provider-family remapping or picker repair was needed.

The active CLI first reproduced the unsupported-selector fallback to gpt-5.2 in
an offline dry-run. Current main624930ff7 was composed into the existing source
branch at4fa2f3ac9; three additive documentation conflicts retain both histories.
169 focused checks across run options, schema, selector mapping, browser config,
model selection and thinking time pass. Full typecheck, TypeScript compilation,
scoped lint and diff checks pass. These are selected local gates; CI is excluded.

A preserved composite candidate at
`~/.auracall/user-runtime-issue374-4fa2f3ac9` differs from the active runtime in
exactly two compiled modules: `cli/runOptions.js` and `schema/resolver.js`.
All651 compared package regular files retain their previous bytes except those
two. The installed CLI candidate rejects `chatgpt:reasoning-medium` with exit1
and a precise error; `chatgpt:reasoning` previews Sol with exit0. A pre-send live
invocation through the candidate's public run-option resolver and installed
model/thinking actions confirms GPT-5.6 Sol and Medium. Fresh UI readback says
`Medium, 2 of 5.` No prompt was entered or submitted. This qualifies selection,
not provider answer completion or deferred connector issue377.

Private receipts and rollback custody:
`~/.local/state/auracall-374-20261029/`, including candidate runtime hashes,
CLI results, current-workbench acceptance, source gate logs and the final
activation/cleanup receipt. Promote only after the exact PR head merges; preserve
the previous wrapper/prefix, API process, browser generation and peer tabs.
This is a component-qualified CLI update, not deployment of all current main.
