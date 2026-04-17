# OpenAI-Compatible Endpoints

Oracle uses the official OpenAI Node.js SDK, which allows it to connect to any API that adheres to the OpenAI API specification. This includes:

- Official OpenAI API
- Azure OpenAI Service
- Local inference servers (e.g., vLLM, Ollama)
- Proxy servers (e.g., LiteLLM)

## AuraCall local compatibility server

AuraCall now has a bounded local development server for the first
OpenAI-compatible runtime surfaces:

```bash
auracall api serve --port 8080
```

Non-loopback bind is blocked by default. To opt into an unauthenticated public
bind intentionally:

```bash
auracall api serve --host 0.0.0.0 --listen-public --port 8080
```

Current endpoints:

- `GET /status`
- `GET /status/recovery/{run_id}`
- `GET /v1/team-runs/inspect`
- `GET /v1/runtime-runs/inspect`
- `GET /v1/models`
- `POST /v1/responses`
- `GET /v1/responses/{response_id}`

Current limits:

- loopback by default; non-loopback requires `--listen-public`
- runtime-backed create/read with one bounded local execution pass for direct
  runs
  - direct browser-backed `/v1/responses` runs now execute through the same
    configured stored-step executor path as normal Aura-Call runtime work
- startup recovery can re-run bounded stale persisted direct runs before readback; keep
  this enabled by default, or disable with `--no-recover-runs-on-start`.
  - control source scope with `--recover-runs-on-start-source <direct|team-run|all>`
    - `direct` (default): only direct API responses
    - `team-run`: only team-mode executions
    - `all`: both direct and team-run
- tune startup recovery scan cap with `--recover-runs-on-start-max <count>`
- `/status` reports explicit development posture, route surface, and
  unauthenticated/local-only state, including the current AuraCall version
  - `/status.runner` now reports the live persisted local runner owned by
    `api serve`:
    - `id`
    - `hostId`
    - `status`
    - `lastHeartbeatAt`
    - `expiresAt`
    - `lastActivityAt`
    - `lastClaimedRunId`
  - plain `/status.localClaimSummary` now reports a compact direct-run local
    claim snapshot when a local runner is configured:
    - `sourceKind`
    - `runnerId`
    - `selectedRunIds`
    - `blockedRunIds`
    - `notReadyRunIds`
    - `unavailableRunIds`
    - `statusByRunId`
    - `reasonsByRunId`
  - when called with `?recovery=1` (or `?recovery=true`) it also returns:
    - `recoverySummary.totalRuns`
    - reclaimable run IDs in `recoverySummary.reclaimableRunIds`
    - busy active-lease IDs in `recoverySummary.activeLeaseRunIds`
    - stranded-running-without-lease IDs in `recoverySummary.strandedRunIds`
    - idle/terminal IDs in `recoverySummary.idleRunIds`
    - bounded local-claim summary in `recoverySummary.localClaim` when a local runner is configured:
      - `runnerId`
      - `selectedRunIds`
      - `blockedRunIds`
      - `notReadyRunIds`
      - `unavailableRunIds`
      - `statusByRunId`
      - `reasonsByRunId`
    - bounded active-lease health in `recoverySummary.activeLeaseHealth`:
      - `freshRunIds`
      - `staleHeartbeatRunIds`
      - `suspiciousIdleRunIds`
      - `reasonsByRunId`
    - bounded lease-repair posture in `recoverySummary.leaseRepair`:
      - `locallyReclaimableRunIds`
      - `inspectOnlyRunIds`
      - `notReclaimableRunIds`
      - `repairedRunIds`
      - `reasonsByRunId`
  - `GET /status/recovery/{run_id}` returns one bounded per-run recovery
    detail view with:
    - `taskRunSpecId`
    - bounded `taskRunSpecSummary`
    - `orchestrationTimelineSummary`
      - derived from selected relevant durable `sharedState.history` entries
      - `total`
      - bounded `items`
        - `type`
        - `createdAt`
        - `stepId`
        - `note`
        - `handoffId`
    - bounded `handoffTransferSummary`
    - current host classification
    - active lease snapshot
    - dispatch posture
    - reconciliation / repair posture and reasons
      - including bounded `reconciliationReason`
    - active-lease health under `leaseHealth`, including whether the lease
      looks fresh, stale-heartbeat, or suspiciously idle
    - bounded operator attention:
      - `attention.kind = stale-heartbeat-inspect-only|suspiciously-idle`
    - bounded cancellation readback:
      - `cancellation.cancelledAt`
      - `cancellation.source`
      - `cancellation.reason`
    - configured local runner claim posture under `localClaim`, including:
      - `status`
      - `selected`
      - `queueState`
      - `claimState`
      - `affinityStatus`
      - `affinityReason`
  - `GET /v1/team-runs/inspect` returns one bounded read-only team linkage
    view:
    - query by `taskRunSpecId=<task_run_spec_id>`,
      `teamRunId=<team_run_id>`, or `runtimeRunId=<runtime_run_id>`
    - returns:
      - `resolvedBy`
      - `queryId`
      - bounded `taskRunSpecSummary`
      - bounded linkage to the selected runtime run
  - `GET /v1/runtime-runs/inspect` returns one bounded read-only runtime
    queue/runner view:
    - query by exactly one of:
      - `runId`
      - `runtimeRunId`
      - `teamRunId`
      - `taskRunSpecId`
    - optional:
      - `runnerId`
      - `probe=service-state`
    - returns:
      - `resolvedBy`
      - `queryId`
      - `queryRunId`
      - `matchingRuntimeRunCount`
      - bounded `matchingRuntimeRunIds`
      - bounded `taskRunSpecSummary` when task-backed
      - optional `serviceState` when explicitly requested with
        `probe=service-state`
        - `probeStatus = observed|unavailable`
        - this is live run-scoped provider state, not durable replay
        - current default live probe coverage is:
          - ChatGPT on the managed browser path
          - Gemini on browser-backed runtime profiles only
            - active browser-backed Gemini runs prefer executor-owned transient
              `thinking` state before DOM/page fallback
          - Grok on browser-backed runtime profiles only
            - active browser-backed Grok runs prefer executor-owned transient
              `thinking` state before DOM/page fallback
        - Gemini API-backed runtime profiles still return honest
          `unavailable` posture on this seam
        - Grok API-backed runtime profiles still return honest `unavailable`
          posture on this seam
        - keep it separate from queue/lease posture and `/status`
      - `runtime.queueProjection` with:
        - `queueState`
        - `claimState`
        - `nextRunnableStepId`
        - `activeLeaseId`
        - `activeLeaseOwnerId`
        - active/waiting/running/deferred/terminal step ids
        - bounded affinity posture:
          - `status`
          - `reason`
          - `requiredService`
          - `requiredRuntimeProfileId`
          - `requiredBrowserProfileId`
          - `requiredHostId`
          - `hostRequirement`
          - `requiredServiceAccountId`
          - `browserRequired`
          - `eligibilityNote`
        - configured service identity for the active step service is projected
          into `requiredServiceAccountId` using the same
          `service-account:<service>:<identity-key>` shape as runner metadata
        - this configured identity is declarative:
          - identity key preference is `email`, then `handle`, then `name`
          - `api serve` does not live-probe the browser account during runner
            registration
          - matching affinity means the runner and run share the same
            configured account id, not that the current browser tab account was
            independently verified
      - bounded `runner` summary when a runner is explicitly queried or the
        active lease owner resolves to a persisted runner record
        - `api serve` derives runner `serviceAccountIds` from configured
          service identities when present, using
          `service-account:<service>:<identity-key>`
        - browser-capable `api serve` runners with absent or incomplete
          configured identities preserve that limitation in `eligibilityNote`
  - `POST /status` now also accepts bounded operator actions:
    - stale-heartbeat lease repair:
      - `{"leaseRepair":{"action":"repair-stale-heartbeat","runId":"..."}}`
      - only succeeds when the run is currently `stale-heartbeat` and already
        `locally-reclaimable`
      - `suspiciously-idle` remains read-only and is rejected by that action
    - local run cancel:
      - `{"runControl":{"action":"cancel-run","runId":"..."}}`
      - only succeeds for active runs currently owned by the local configured
        runner/host
      - successful cancellation releases the active lease with release reason
        `cancelled`
    - human-escalation resume:
      - `{"runControl":{"action":"resume-human-escalation","runId":"...","note":"...","guidance":{...},"override":{"promptAppend":"...","structuredContext":{...}}}}`
      - only succeeds for direct or team runs currently paused for human
        escalation
    - targeted drain:
      - `{"runControl":{"action":"drain-run","runId":"..."}}`
      - only succeeds for direct or team runs
    - local-action request resolution:
      - `{"localActionControl":{"action":"resolve-request","runId":"...","requestId":"...","resolution":"approved|rejected|cancelled"}}`
      - only succeeds for currently `requested` local action records on direct
        or team runs
  - startup recovery logs now also emit:
    - `attention=stale-heartbeat-inspect-only:<count>`
    - `attention=suspiciously-idle:<count>`
- optional `X-AuraCall-*` headers for execution hints:
  - `X-AuraCall-Runtime-Profile`
  - `X-AuraCall-Agent`
  - `X-AuraCall-Team`
  - `X-AuraCall-Service`
- no auth
- no streaming/SSE
- no `POST /v1/chat/completions` adapter yet
- local `api serve` now self-registers one persisted runner record and
  heartbeats it while the server is alive; shutdown marks that runner stale
- successful bounded direct-run execution now also updates that runner record
  with the last observed execution activity and claimed run id
- if a run is cancelled while a delayed local step is still finishing, the
  runner path now preserves the `cancelled` terminal state instead of
  overwriting it with a later completion persist
- bounded local execution now refreshes the active lease heartbeat while a step
  is still running, so live runner-owned claims start fresh and stay fresh
  during one delayed local execution pass
- bounded local host claims now use that live runner id as the lease owner,
  and new claims are skipped when the configured runner owner is unavailable
- non-loopback host binding is still unauthenticated and warned as unsafe

This server is intended as the first local compatibility surface, not yet a
full production API layer.

Current direct-run behavior:

- `POST /v1/responses` creates a durable runtime record
- the local host then performs one bounded sequential local runner pass
- the same response can therefore come back:
  - `completed`
  - `failed`
  - or still `in_progress` later if broader runner behavior is added in the
    future
- there is still no streaming, auth, or `chat/completions` adapter

Current response readback note:

- AuraCall now adds a bounded `metadata.executionSummary` object on the same
  response body for runtime-backed direct runs
- AuraCall response readback now also includes bounded assignment identity at
  top-level metadata:
  - `taskRunSpecId`
- current fields are:
  - `terminalStepId`
  - `completedAt`
  - `lastUpdatedAt`
  - `inputArtifactSummary`
    - `total`
    - bounded `items`
      - `id`
      - `kind`
      - `title`
      - `path`
      - `uri`
  - `handoffTransferSummary`
    - `total`
    - bounded `items`
      - `handoffId`
      - `fromStepId`
      - `fromAgentId`
      - `title`
      - `objective`
      - `requestedOutputCount`
      - `inputArtifactCount`
  - `orchestrationTimelineSummary`
    - derived from bounded relevant entries in durable `sharedState.history`
    - `total`
    - bounded `items`
      - `type`
      - `createdAt`
      - `stepId`
      - `note`
      - `handoffId`
  - `requestedOutputSummary`
    - `total`
    - `fulfilledCount`
    - `missingRequiredCount`
    - bounded `items`
      - `label`
      - `kind`
      - `format`
      - `destination`
      - `required`
      - `fulfilled`
      - `evidence`
  - `requestedOutputPolicy`
    - `status`
    - `message`
    - `missingRequiredLabels`
    - when required outputs remain missing, response readback now also returns:
      - `status = failed`
      - `failureSummary.code = requested_output_required_missing`
      - stored runtime/service terminal state also converges to `failed` for
        those same clearly missing-required cases
    - when the next runnable step would exceed
      `constraints.providerBudget.maxRequests`, stored runtime/service state
      now fails before execution with:
      - `failureSummary.code = task_provider_request_limit_exceeded`
    - when cumulative stored provider usage already exceeds
      `constraints.providerBudget.maxTokens`, stored runtime/service state now
      fails before the next step executes with:
      - `failureSummary.code = task_provider_token_limit_exceeded`
  - `providerUsageSummary`
    - when the stored execution path reports real usage, readback now also
      includes:
      - `ownerStepId`
      - `generatedAt`
      - `inputTokens`
      - `outputTokens`
      - `reasoningTokens`
      - `totalTokens`
  - `operatorControlSummary`
    - `humanEscalationResume`
      - `resumedAt`
      - `note`
    - `targetedDrain`
      - `requestedAt`
      - `status`
      - `reason`
      - `skipReason`
  - `localActionSummary`
    - operator resolution on `POST /status` updates this same summary in later `GET /v1/responses/{response_id}` reads
    - `ownerStepId`
    - `generatedAt`
    - `counts`
    - bounded `items`
  - `cancellationSummary`
    - `cancelledAt`
    - `source`
    - `reason`
  - `failureSummary`

Minimal local smoke:

```bash
# terminal 1
auracall api serve --port 8080

# terminal 2
curl http://127.0.0.1:8080/status

curl -s http://127.0.0.1:8080/v1/responses \
  -H 'Content-Type: application/json' \
  -d '{"model":"gpt-5.2","input":"Reply exactly with: local api smoke"}'

curl http://127.0.0.1:8080/v1/responses/<response_id>
```

## Azure OpenAI

To use Azure OpenAI, point Oracle at your Azure resource and supply the Azure key:

```bash
export AZURE_OPENAI_ENDPOINT="https://your-resource-name.openai.azure.com/"
export AZURE_OPENAI_API_KEY="your-azure-api-key"
export AZURE_OPENAI_API_VERSION="2024-02-15-preview"
```

Key lookup for GPT-family models when an Azure endpoint is set:
- First looks for `AZURE_OPENAI_API_KEY`.
- Falls back to `OPENAI_API_KEY` if the Azure key is missing.

Without an Azure endpoint, Oracle keeps using `OPENAI_API_KEY` as before.

### CLI Configuration

You can also pass the Azure settings via CLI flags (env for the key is still recommended):

```bash
oracle --azure-endpoint https://... --azure-deployment my-deployment-name --azure-api-version 2024-02-15-preview
```

## Custom Base URLs (LiteLLM, Localhost)

For other compatible services that use the standard OpenAI protocol but a different URL:

```bash
oracle --base-url http://localhost:4000
```

Or via `config.json`:

```json
{
  "apiBaseUrl": "http://localhost:4000"
}
```

## Model aliases

Oracle keeps a stable CLI-facing model set, but some names are aliases for the concrete API model ids it sends:

- `gpt-5.1-pro` → `gpt-5.2-pro` (API)
- generic `pro` labels/defaults resolve to `gpt-5.1-pro` first, so operator-facing config does not need to pin a dated concrete Pro id

Notes:
- `gpt-5.1-pro` is a **CLI alias** for “the current Pro API model” — OpenAI’s API uses `gpt-5.2-pro`.
- If you want the classic Pro tier explicitly, use `gpt-5-pro`.

### Browser engine vs API base URLs

`--base-url` / `apiBaseUrl` only affect API runs. For browser automation, use `--chatgpt-url` (or `browser.chatgptUrl` in config) to point Chrome at a specific ChatGPT workspace/folder such as `https://chatgpt.com/g/.../project`.

### Example: LiteLLM

[LiteLLM](https://docs.litellm.ai/) allows you to use Azure, Anthropic, VertexAI, and more using the OpenAI format.

1. Start LiteLLM:
   ```bash
   litellm --model azure/gpt-4-turbo
   ```
2. Connect Oracle:
   ```bash
   oracle --base-url http://localhost:4000
   ```

## OpenRouter

Oracle can also talk to OpenRouter (Responses API compatible) with any model id:

```bash
export OPENROUTER_API_KEY="sk-or-..."
oracle --model minimax/minimax-m2 --prompt "Summarize the notes"
```

 - If `OPENROUTER_API_KEY` is set and no provider-specific key is available for the chosen model, Oracle defaults the base URL to `https://openrouter.ai/api/v1`.
 - You can still set `--base-url` explicitly; if it points at OpenRouter (with or without a trailing `/responses`), Oracle will use `OPENROUTER_API_KEY` and forward optional attribution headers (`OPENROUTER_REFERER` / `OPENROUTER_TITLE`).
- Multi-model runs accept OpenRouter ids alongside built-in ones. See `docs/openrouter.md` for details.
