# AuraCall Response Shape Contract

AuraCall supports an opt-in deterministic model-output contract:

```text
auracall.step-output.v1
```

Use it when a runner must route output, request local host actions, pass
artifacts to another agent, or fail deterministically without scraping prose.

## Enforcement Model

AuraCall uses both:

- a prompt prefix, prepended at execution time for opted-in steps
- runtime schema validation after the provider returns text

The prompt prefix improves compliance, but runtime validation is authoritative.
If the model emits malformed output, AuraCall fails the step with structured
prompt-validation details.

This is intentionally not a post-prompt-only contract. The prefix must appear
before the assignment so the model frames the whole response around the
required envelope.

## Opt In

A stored step opts in when its structured data includes one of these fields:

```json
{
  "responseShape": {
    "contract": "auracall.step-output.v1"
  }
}
```

Equivalent accepted selectors:

- `responseShape.contract`
- `responseShape.version`
- `responseShape.format`
- `structuredData.outputContract`
- `structuredData.contract`
- `structuredData.taskOverrideStructuredContext.outputContract`
- `structuredData.taskOverrideStructuredContext.contract`

Public API callers can request the same contract without editing team role
config:

```json
{
  "teamId": "auracall-chatgpt-solo",
  "objective": "Produce the requested result.",
  "outputContract": "auracall.step-output.v1"
}
```

For direct `/v1/responses` requests, place the selector under `auracall`:

```json
{
  "model": "gpt-5.2",
  "input": "Produce the requested result.",
  "auracall": {
    "runtimeProfile": "default",
    "service": "chatgpt",
    "outputContract": "auracall.step-output.v1"
  }
}
```

Legacy steps without one of those selectors keep plain-text behavior.

## Envelope

The model must return exactly one JSON object, with no markdown fence and no
extra prose:

```json
{
  "version": "auracall.step-output.v1",
  "status": "succeeded",
  "routing": {
    "action": "complete"
  },
  "message": {
    "markdown": "Final answer."
  },
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

Allowed `routing.action` values:

- `complete`
- `local_action`
- `handoff`
- `error`

## Output Fields

`message` carries human-readable assistant output. Prefer `message.markdown`
when formatting matters; use `message.text` for plain text.

`artifacts[]` carries durable outputs that should be visible to the host or
later team steps:

```json
{
  "id": "artifact_1",
  "kind": "file",
  "title": "report.md",
  "path": "/workspace/report.md",
  "uri": null
}
```

`localActionRequests[]` asks the host to perform a bounded local action. The
first supported action kind is `shell`:

```json
{
  "kind": "shell",
  "summary": "Run the focused test",
  "command": "pnpm",
  "args": ["vitest", "run", "tests/runtime.stepOutputContract.test.ts"],
  "structuredPayload": {
    "cwd": "/home/ecochran76/workspace.local/auracall"
  },
  "notes": []
}
```

`handoffs[]` carries payloads intended for another role or agent:

```json
{
  "toRoleId": "reviewer",
  "summary": "Implementation is ready for review.",
  "artifacts": [],
  "structuredData": {
    "changedSurface": "runtime step output contract"
  },
  "notes": []
}
```

`error` is required when `status` is `failed`:

```json
{
  "code": "missing_required_context",
  "message": "The input artifact was not available.",
  "recoverable": true,
  "details": {
    "artifactId": "spec_pdf"
  }
}
```

## Runtime Mapping

AuraCall maps valid envelopes onto existing runtime surfaces:

- `message` becomes the public `response.output` message item.
- `artifacts[]` are recorded on the step output and shared state.
- `localActionRequests[]` flow through the existing local-action request
  machinery.
- `handoffs[]` are preserved in structured step output for downstream handoff
  handling.
- `failed` envelopes become deterministic prompt-validation failures.

## Design Rule

OpenAI-compatible API response objects remain the public HTTP response shape.
`auracall.step-output.v1` is the model-emitted internal step envelope that
feeds those response objects and the team runtime.
