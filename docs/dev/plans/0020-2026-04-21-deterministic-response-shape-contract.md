# Plan 0020 | Deterministic Response Shape Contract

State: OPEN

## Purpose

Give AuraCall one deterministic model-output envelope that runtime runners can
validate and route without scraping arbitrary prose.

The first slice is intentionally opt-in. Legacy plain-text execution keeps
working unless a step requests `auracall.step-output.v1`.

## Current State

Already exists:

- OpenAI-compatible API response projection through `/v1/responses` and
  `/v1/team-runs`.
- Runtime step output with `summary`, `artifacts`, `structuredData`, and
  `notes`.
- Team handoff records, local action request records, and shared runtime
  structured outputs.
- Passive provider observations and stored failure readback.
- Request-level opt-in through `POST /v1/team-runs` `outputContract` and
  direct `/v1/responses` `auracall.outputContract`.

Missing before this plan:

- One canonical LLM-emitted shape for step completion, routing, local actions,
  artifacts, handoffs, and model-reported errors.
- Runtime schema validation for malformed contract output.
- A deterministic prompt prefix that can be prepended at execution time when a
  step opts in.

## Scope

- Define `auracall.step-output.v1`.
- Add prompt-prefix text that tells the model to return exactly one JSON
  object.
- Validate browser-backed stored-step output when the step opts in through
  `responseShape.contract`, `responseShape.version`, `responseShape.format`,
  `structuredData.outputContract`, `structuredData.contract`, or task override
  structured context.
- Convert valid envelopes into existing runtime surfaces:
  - response text via `response.output`
  - artifacts via step output and shared state
  - local action requests via existing `localActionRequests`
  - handoff payloads under structured step data
  - model-reported failures as prompt-validation failures

## Non-goals

- Making all legacy plain-text runs fail if they do not emit the contract.
- Replacing OpenAI-compatible `/v1/responses` response objects.
- Implementing new local action kinds beyond the currently supported bounded
  shell action.
- Changing provider adapters to understand the contract directly.
- Adding a new public endpoint for artifacts or handoffs.

## Contract Summary

The model must emit exactly one JSON object:

```json
{
  "version": "auracall.step-output.v1",
  "status": "succeeded",
  "routing": { "action": "complete" },
  "message": { "markdown": "Final answer." },
  "artifacts": [],
  "localActionRequests": [],
  "handoffs": [],
  "metadata": {}
}
```

Allowed `status` values:

- `succeeded`
- `needs_local_action`
- `handoff`
- `failed`

Allowed routing actions:

- `complete`
- `local_action`
- `handoff`
- `error`

## Acceptance Criteria

- Schema and parser reject non-JSON or invalid envelopes with
  `PromptValidationError` details.
- Configured browser-backed stored-step execution prepends the contract prompt
  only for opted-in steps.
- Valid contract output maps to existing response output, artifact, local
  action, and structured data surfaces.
- Legacy non-contract runs keep current plain-text behavior.
- Docs identify prompt-prefix enforcement as necessary but not sufficient;
  runtime validation remains authoritative.
- Public API requests can select the contract without editing team role config.

## Validation

- `pnpm vitest run tests/runtime.stepOutputContract.test.ts tests/runtime.configuredExecutor.test.ts tests/runtime.responsesService.test.ts tests/cli/teamRunCommand.test.ts tests/http.responsesServer.test.ts`
- `pnpm exec tsc -p tsconfig.json --noEmit`
- Before closing this plan, also run the relevant runtime response/runner suite.

## Definition Of Done

- The contract is documented for operators and future agents.
- Opt-in contract validation is covered by unit tests.
- Invalid contract output produces deterministic stored failure details.
- A follow-on decision is made on whether to make the contract the default for
  team-run roles or keep it opt-in per `responseShape`.

## Follow-on Slices

- Project `handoffs[]` into first-class handoff records when model-created
  handoffs are allowed.
- Add richer artifact output item typing once provider artifact materialization
  is unified.
- Decide whether single-step runners should require the contract by default and
  fail immediately on malformed output.
