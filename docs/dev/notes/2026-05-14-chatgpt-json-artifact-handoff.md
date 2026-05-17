# 2026-05-14 ChatGPT JSON Artifact Handoff

## Context

`transcribe-audio` retried the legacy enrichment batch through AuraCall and all
three jobs failed with the same shape:

- Batch: `batch_e9b79b1474ec4cf8a622e52f5b8f7bce`
- Diagnostics:
  `/home/ecochran76/.local/state/transcribe-audio/auracall-batches/legacy-enrichment-20260514-151528-diagnostics/`
- Response ids:
  - `resp_56c5a0d25823456d99d97e50114fe887`
  - `resp_618693902f244b8e8a777cff9fc38305`
  - `resp_c073d5e002414a0c98f8ee0fe987470b`

Each response returned HTTP 200 with `status = failed` and `output = []`.
The failure message showed ChatGPT had produced a large partial JSON snapshot
but did not finish as one parseable JSON object:

- about 22,322 chars for the SoyLei/Nacu handover meeting
- about 10,358 chars for the Baker Pappajohn SABR pitch
- about 11,918 chars for the Lululemon/HDA nylon discussion

This is most likely a ChatGPT browser response-output/materialization boundary,
not an AuraCall HTTP body limit and not a reason to truncate transcript input.

## AuraCall Fix Landed

AuraCall now treats this failure as recoverable evidence instead of dropping it:

- ChatGPT JSON-object timeout handling writes the full best snapshot under
  `~/.auracall/recovery/json-object/*.partial.json`.
- The thrown `BrowserAutomationError` carries `recoverySharedState`.
- The runtime runner preserves that recovery shared state even when the step
  fails.
- `GET /v1/responses/{response_id}` can now return a failed response with an
  `output[]` artifact for the partial JSON snapshot instead of `output: []`.

Touched surfaces:

- `src/browser/index.ts`
- `src/runtime/runner.ts`
- `tests/runtime.runner.test.ts`
- `docs/openai-endpoints.md`
- `README.md`

Validation run:

- `pnpm exec vitest run tests/runtime.runner.test.ts --testNamePattern "recoverable failure artifacts|browser automation failure details|local runner step throws"`
- `pnpm exec vitest run tests/runStatus.test.ts tests/mcp.runStatus.test.ts --testNamePattern "run status|shared status envelope|response run status"`
- `pnpm run typecheck`

Installed/restarted:

- `pnpm run install:user-runtime-service`
- `systemctl --user restart auracall-api.service`
- `systemctl --user is-active auracall-api.service` returned `active`

## Non-Retroactive Limitation

The fix is not retroactive for
`batch_e9b79b1474ec4cf8a622e52f5b8f7bce`. Those records only persisted the
failure preview, not the full best snapshot. A fresh run is required to produce
the new recovery artifact output.

## Recommended Contract Change

The stronger fix is to stop forcing large transcript readout JSON through chat
text. ChatGPT can write large outputs into its workspace and expose a file
download. AuraCall's `/v1/responses` surface already supports artifact items,
so the transcribe readout agent should request a workspace file such as
`legacy_readout.json` and a short textual confirmation.

Target behavior:

- Prompt asks ChatGPT to create `legacy_readout.json`.
- AuraCall materializes the workspace download as an `output[]` artifact:
  - `type = "artifact"`
  - `artifact_type = "file"`
  - `mime_type = "application/json"`
  - `disposition = "attachment"`
  - `metadata.materialization = "chatgpt_workspace_download"` or equivalent
- The run fails only if AuraCall cannot produce either:
  - parseable JSON text, or
  - the requested JSON artifact.

Next slice:

1. Update the transcribe-bound agent prompt/output contract to ask for
   `legacy_readout.json` as a workspace artifact.
2. Add AuraCall acceptance coverage for a failed/large JSON-object run returning
   an artifact output.
3. Run a 1-item transcribe retry and confirm `/v1/responses/{id}` has either a
   parseable message output or an artifact output before re-enqueuing a full
   batch.
