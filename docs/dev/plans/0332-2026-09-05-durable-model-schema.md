# Durable Model Schema | 0332-2026-09-05

State: CLOSED
Lane: P25
Operational state: PROVIDER_FREE_ACCEPTED_NOT_INSTALLED
Branch: fix/plan0332-durable-model-schema
Target: main
Integration: merge
Revision: 2 | 2026-09-05

## Stable Objective

Replace version- and codename-shaped internal ChatGPT selector IDs with a
durable capability vocabulary, add the current GPT-6 provider contracts, and
retain older selectors as compatibility inputs without advertising them to new
callers.

## Current State

- Checkpoint `c96a472f` contains the implementation and current docs.
- The final affected packet passes 448 tests. Typecheck, production build,
  JSON validation, changed-file lint at error level, diff hygiene, and the
  331-candidate zero-error plan audit pass.
- The comprehensive lane passes 3,066 tests with 65 policy-skipped tests. Two
  contention-sensitive timing tests failed in that run and passed together in
  a 245-test focused rerun, so they remain recorded as pass-on-retry flakes.
  The sole deterministic failure is Plan 0326's pre-existing stale raw-CDP
  allowlist expectation.
- No installation or live browser interaction occurred. GPT-6 Pro browser
  visibility remains intentionally unclaimed.

## Scope

- Publish six canonical ChatGPT selectors: fast, reasoning, reasoning-high,
  reasoning-max, premium, and legacy.
- Resolve old GPT-5.2, Sol/Terra/Luna, Auto/Thinking/Pro spellings through an
  alias layer while preserving explicit provider-family pins.
- Separate canonical selector, provider picker label, and API bookkeeping ID
  in the resolved selection contract.
- Add GPT-6 Pro browser and GPT-6 Astra API mappings.
- Add the durable `openai:frontier` API alias and make it the default.
- Update the OpenAI SDK for Astra's `max` reasoning contract.
- Update current operator docs, config examples, catalog tests, and migration
  guidance.

## Non-goals

- Removing compatibility aliases or rewriting historical plans and receipts.
- Claiming GPT-6 Pro is visible in the currently retained browser before a
  separately authorized live survey.
- Installing the revision, sending a prompt, changing the live browser model,
  or touching the unfinished P08/P17 checkout.

## Acceptance Criteria

- [x] Focused red coverage proves the old catalog advertises volatile IDs.
- [x] Discovery advertises only durable ChatGPT selector IDs.
- [x] Legacy saved selectors continue to resolve and validate.
- [x] `chatgpt:premium` resolves to GPT-6 Pro with `gpt-6-astra` bookkeeping.
- [x] `openai:frontier` resolves to the GPT-6 Astra API contract.
- [x] Affected tests, typecheck, build, lint, diff hygiene, and plan audit pass.
- [x] Comprehensive provider-free tests pass or any unrelated baseline failure
      is recorded precisely.
- [x] The implementation and docs are committed and pushed.

## Provider References

- OpenAI API model contract:
  <https://developers.openai.com/api/docs/models/gpt-6-astra>
- ChatGPT GPT-6 Pro availability and Astra relationship:
  <https://help.openai.com/en/articles/20001354>

## Definition of Done

Provider-free source acceptance is complete when current configuration and
discovery emit durable labels, legacy inputs remain compatible, GPT-6 contracts
are verified by deterministic tests, documentation and governance records
agree, and the isolated topic branch is published. Installation and live
browser proof remain separate effects.
