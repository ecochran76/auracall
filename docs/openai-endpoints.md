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

Use the global profile option before `api serve` when the local API should run
against a non-default AuraCall runtime profile:

```bash
auracall --profile auracall-gemini-pro api serve --port 8080
```

Non-loopback bind is blocked by default. To opt into an unauthenticated public
bind intentionally:

```bash
auracall api serve --host 0.0.0.0 --listen-public --port 8080
```

Current endpoints:

- `GET /status`
- `GET /status/recovery/{run_id}`
- `POST /v1/team-runs`
- `GET /v1/team-runs/inspect`
- `GET /v1/runtime-runs/inspect`
- `GET /v1/models`
- `GET /v1/config/agents`
- `GET /v1/config/agent-diagnostics`
- `POST /v1/config/api-keys/issue`
- `POST /v1/config/snapshots/export`
- `POST /v1/config/snapshots/import`
- `PUT /v1/config/agents/{agent_id}`
- `DELETE /v1/config/agents/{agent_id}`
- `GET /v1/config/teams`
- `PUT /v1/config/teams/{team_id}`
- `DELETE /v1/config/teams/{team_id}`
- `POST /v1/projects/ensure`
- `POST /v1/tenant-pool-teams/ensure`
- `POST /v1/agent-setup-packages`
- `POST /v1/agent-setup-handoffs`
- `POST /v1/responses`
- `GET /v1/responses/{response_id}`
- `POST /v1/response-batches`
- `GET /v1/response-batches/{batch_id}`
- `GET /v1/search`
- `GET /v1/archive`
- `POST /v1/archive/backfill`
- `POST /v1/archive/evidence`
- `POST /v1/archive/materializations`
- `GET /v1/archive/materializations`
- `GET /v1/archive/materializations/{job_id}`
- `GET /v1/archive/items/{archive_item_id}`
- `GET /v1/archive/items/{archive_item_id}/asset`
- `POST /v1/archive/items/{archive_item_id}/materialize`

Workflow-oriented guidance lives in `docs/agent-workflows.md`. Treat this file
as the endpoint contract and that file as the agent/app integration playbook.

Current limits:

- loopback by default; non-loopback requires `--listen-public`
- runtime-backed create/read with one bounded local execution pass for direct
  runs
  - direct browser-backed `/v1/responses` runs now execute through the same
    configured stored-step executor path as normal Aura-Call runtime work
  - direct `/v1/responses` requests can opt into deterministic model output
    with `auracall.outputContract: "auracall.step-output.v1"`
  - direct `/v1/responses` requests may include `attachments`. Local paths and
    `file://` URIs are projected into the stored step artifact list so the
    browser executor can upload them; remote HTTP(S) URIs are preserved as
    metadata but are not downloaded automatically.
  - project-bound workflows should bootstrap downstream clients through
    `POST /v1/agent-setup-handoffs` when they need a ready-to-source scoped
    client env and non-secret status; use `POST /v1/agent-setup-packages` only
    when a privileged operator needs the full one-time secret-bearing response,
    or use `POST /v1/projects/ensure` plus
    `POST /v1/config/api-keys/issue` only when the operator needs separate
    inspection/customization phases.
- `POST /v1/team-runs` creates one bounded task-backed team execution through
  the existing `TaskRunSpec -> TeamRun -> TeamRuntimeBridge -> runtimeRun`
  chain
  - accepted input shapes are:
    - compact fields: `teamId`, `objective`, and optional `title`,
      `promptAppend`, `structuredContext`, `responseFormat`, `outputContract`,
      `maxTurns`, and bounded `localActionPolicy`
    - a prebuilt flattened `taskRunSpec` validated with Aura-Call's live
      `TaskRunSpec` schema
  - `outputContract: "auracall.step-output.v1"` opts the planned stored steps
    into the deterministic model-emitted envelope documented in
    `docs/response-shape-contract.md`
  - response shape is `object = "team_run"` with the accepted `taskRunSpec`,
    deterministic `execution` ids/status, and `links` for team inspection,
    runtime inspection, and response readback
  - when background drain is enabled, the route returns after persisting the
    task/team/runtime records and schedules the existing server-owned drain;
    when background drain is disabled, it keeps the synchronous one-request
    behavior
  - sectioned public task-run-spec envelopes, background worker pools, and
    parallel team execution are intentionally deferred
- `/v1/config/agents` and `/v1/config/teams` expose trusted local agent/team
  management:
  - `GET` lists the effective config plus user-scoped registry projection,
    including source/revision metadata and config-wins conflicts
  - `PUT /v1/config/agents/{agent_id}` accepts one raw agent config object
  - `PUT /v1/config/teams/{team_id}` accepts one raw team config object
  - `DELETE` removes the selected entry
  - writes target the user-scoped registry by default and return
    `mutationTarget="registry"` with source/revision metadata in the effective
    catalog response
  - config-defined overlay ids are pinned; mutation attempts return
    `mutationTarget="blocked"` and a `blockedReason` instead of creating a
    hidden registry record behind the config overlay
  - config-file writes are retained only for explicit config-path/bootstrap
    maintenance services
  - registry-created agents and teams are available to stored-step execution,
    HTTP team-runs, MCP response execution, and MCP team-runs through the same
    effective catalog projection
  - `GET /v1/config/agent-diagnostics` returns non-secret operator health for
    the effective registry/config catalog, including disabled registry records,
    config-vs-registry conflicts, loaded API-key ids, missing scoped agents or
    teams, and team-derived effective agent reachability. When API auth is
    enabled, this route requires an unscoped operator key until AuraCall has a
    first-class role/principal model.
  - `POST /v1/config/snapshots/export` accepts `{ "agents": ["id"], "teams":
    ["id"] }` or `{ "all": true }` and returns a versioned
    `auracall_agent_registry_snapshot` for review, backup, or promotion.
  - `POST /v1/config/snapshots/import` accepts `{ "snapshot": { ... },
    "dryRun": true }`; imports write the user-scoped registry and report
    config-defined overlay ids as blocked.
  - snapshot routes are operator control-plane routes. When API auth is
    enabled, they require an unscoped operator key until AuraCall has a
    first-class role/principal model.
  - protect this local control-plane surface with API-key auth before exposing
    it to any non-loopback client
- `POST /v1/projects/ensure` is the setup surface for project-bound agents:
  - accepts `service`, `runtimeProfile`, `projectName`, optional create fields
    such as `instructions`, `modelLabel`, `files`, and `memoryMode`, plus
    optional agent binding fields such as `agentId`, `agentModelSelector`,
    `agentInstructions`, `agentPrePrompt`, and `agentPostPrompt`
  - finds an existing provider project by normalized exact name or creates it
    when `createIfMissing` is omitted or `true`
  - if `agentId` is supplied, writes a registry-backed agent bound to the
    resolved `projectId` and `projectName`
  - this is an operator control-plane route; scoped execution keys should use
    the resulting agent id, not create provider projects themselves
  - domain-specific setup agents can call this route as a deterministic setup
    step, then hand a scoped execution key and `agent:<agent_id>` model name to
    the downstream client agent
- `POST /v1/tenant-pool-teams/ensure` is the setup surface for project-bound
  tenant-pool batch teams:
  - accepts `teamId`, `service`, `projectName`, optional project/agent/model
    setup fields, and a non-empty `members[]` list with `agentId`,
    `runtimeProfile`, optional `service`, and optional per-agent overrides
  - runs one project ensure per member and binds each member agent to the
    resolved provider project
  - creates `teams.<teamId>.type = "dispatch-pool"` with
    `dispatch.mode = "next_available"` and `projectSync = "none"` only when
    the team does not already exist
  - existing dispatch-pool teams return `status = "found"` and keep their
    membership unchanged; existing non-dispatch teams return
    `status = "blocked"` before provider/project mutation
  - returns `object = "auracall_tenant_pool_team_ensure"` with per-member
    project/agent status, team mutation status, and explicit no-sync warnings
  - when API auth is enabled, this route requires an unscoped operator key
- `POST /v1/agent-setup-packages` is the composed privileged setup surface:
  - accepts the project ensure fields plus required `agentId` and
    `clientEnvPath`, and optional key fields such as `keyId`, `apiBaseUrl`,
    `envPath`, `services`, `runtimeProfiles`, and `overwrite`
  - ensures/fetches the provider project, binds the registry-backed AuraCall
    agent, issues an agent-scoped API key, and writes the scoped client env in
    one operator call
  - returns `object = "auracall_agent_setup_package"` with the nested project
    ensure result, API-key issue result, `clientEnvPath`, model id, and
    `restartRequired`
  - this is the preferred setup path for privileged setup agents preparing work
    for downstream scoped execution clients only when they must inspect the
    one-time secret-bearing response
  - prefer `POST /v1/agent-setup-handoffs` when the caller only needs the
    generated env path and non-secret readiness metadata
  - when API auth is enabled, this route requires an unscoped operator key
- `POST /v1/agent-setup-handoffs` is the redacted composed setup surface:
  - accepts the same input as `/v1/agent-setup-packages`
  - performs the same provider project ensure, registry agent binding, scoped
    key issuance, and client env write
  - returns `object = "auracall_agent_setup_handoff"` with the agent id, model,
    project status/id/name, scoped key id/scopes, client env path, and restart
    hint
  - never returns `apiKey`, `openaiApiKey`, or the generated secret; the secret
    is only written into the client env file
  - this is the default setup endpoint for privileged agents preparing work for
    downstream clients
  - when API auth is enabled, this route requires an unscoped operator key
- `POST /v1/response-batches` is the first nonblocking batch enqueue surface:
  - accepts `{ "requests": [ ... ] }`, where each child request is an ordinary
    `/v1/responses` body, plus optional `metadata`, caller-supplied `id`, and
    persisted batch limits such as `maxConcurrentRuns` and
    `maxBrowserInteractionsPerMinute`
  - accepts dispatch-pool team routing with either
    `{ "dispatch": { "team": "<team_id>" }, "requests": [...] }` or top-level
    `{ "team": "<team_id>", "requests": [...] }` when
    `teams.<team_id>.type = "dispatch-pool"`. AuraCall expands every child to
    the next available member agent before authorization and persistence.
    Children in a dispatch-pool batch must not pre-pin `auracall.agent` or an
    `agent:<id>` model.
  - returns `202` with `object = "response_batch_status"`, aggregate counts,
    child `responseId` values, and optional `dispatch` metadata identifying
    the pool team, projectSync mode, and pool warnings
  - when background drain is enabled, the route schedules the existing
    server-owned drain and returns without waiting for provider execution
  - `GET /v1/response-batches/{batch_id}` reads aggregate status without
    resubmitting prompts; child responses can also be inspected through
    `/v1/runs/{response_id}/status`
  - the shared service-host drain path enforces those batch limits before
    acquiring a run lease; skipped child runs remain queued for a later drain
    pass
  - ChatGPT tenant-wide limits are enforced on the same drain path across
    response batches and one-shot responses. The default tenant budget is
    `maxConcurrentChats = 4`, `maxChatsPerHour = 120`, and
    `maxChatsPerDay = 240`; tenant identity is the configured ChatGPT service
    account when present, then the AuraCall runtime profile fallback.
    Configured ChatGPT identities that share an email can still become separate
    tenants when `accountId`, `organizationId`, `accountPlanType`, or
    `accountStructure` is present, so a Business/workspace account and a
    Pro/personal account do not share one budget accidentally. Configure
    narrower budgets under `services.chatgpt.tenantLimits` or
    `profiles.<name>.services.chatgpt.tenantLimits`.
  - `GET /status` exposes the current configured ChatGPT tenant budgets under
    `tenantExecutionLimits`; add `?tenantExecutionLimits=usage` when runtime
    lease/event-derived usage counters are needed.
  - Browser-backed ChatGPT response runs refresh active leases from runtime
    evidence, including passive DOM probe observations while the submitted tab
    is still loading or thinking. Startup recovery uses persisted submitted-tab
    evidence to reattach stranded ChatGPT work; if AuraCall cannot prove the
    original tab, it fails the run instead of replaying the prompt.
  - Passive DOM evidence for a running ChatGPT prompt must still be attached to
    the submitted conversation target. Library, root, project, or wrong-chat
    targets do not count as running-prompt evidence and should produce a
    target-mismatch failure rather than an endlessly renewed lease.
  - Response-batch job rows include bounded runtime diagnostics when child
    response readback has runtime evidence: `runtimeState`, `leaseState`,
    `lastLeaseEvent`, `browserTaskState`, `lastProviderEvidence`, and
    `terminalTransitionSource`. `runtimeState = "finalizing"` means passive
    provider evidence has reached `response-complete` while AuraCall is still
    persisting the final child output, so the row is not a generic stranded
    expired-lease state. If a child runtime record is being rewritten and
    briefly cannot be parsed, the batch remains readable and marks that child
    with a `response_read_failed` failure until the next successful poll.
  - `cancel-run` can cancel mutable browser-backed runs that have already lost
    their active lease. If completion already won the race, AuraCall reports the
    terminal state instead of returning an ambiguous no-active-lease conflict.
  - the browser dispatcher and provider politeness controls still enforce the
    lower-level CDP/account safety guardrails
  - dispatch-pool project binding uses `projectSync = "none"` for now. AuraCall
    can route member agents to their configured projects, but response-batch
    dispatch does not synchronize project instructions, files, settings, or
    history between tenant accounts; divergence is surfaced as risk metadata,
    not treated as an error.
  - deterministic local workflow smoke: `pnpm run smoke:che447-grading-batch`
    verifies the general setup-plus-batch pattern: operator project ensure,
    project-bound agent creation, an agent-scoped API key batch enqueue, two
    attachment-bearing jobs, batch polling, and child response readback without
    live provider/browser work
  - deterministic client handoff smoke:
    `pnpm run smoke:scoped-client-handoff` verifies the redacted composed setup
    handoff route, scoped key issuance with `clientEnvPath`, API service reload
    simulation, `/v1/models` validation, one direct response, and one response
    batch using only generated client env values
  - downstream-client smoke:
    `pnpm run smoke:scoped-client-env -- <client.env>` reads a generated client
    handoff env, calls `/v1/models`, submits one `/v1/responses` request, and
    polls the response to completion without using any repo-internal setup
    privileges
- `GET /v1/search` is the operator search projection for cross-surface
  discovery:
  - merges account-mirror catalog rows with run-archive rows without launching
    provider browsers
  - returns `object = "search_results"` with normalized `rows`, `facets`,
    `metrics`, and `nextCursor`
  - supports filters for `q`, `kind`, `provider`, `runtimeProfile`, `tenant`,
    `status`, `limit`, and `cursor`
  - archive-backed run rows include `runtimeState`; non-terminal states such as
    `finalizing`, `recovering`, or `stranded` are promoted into the row
    `status` display field while the raw runtime-run status remains available
    in row metadata as `rawStatus`
  - row links can include archive item, catalog item, provider, asset, or other
    source-specific routes
- `GET /v1/archive` is the searchable archive surface for
  AuraCall-created work:
  - reads the user-scoped archive index under the AuraCall runtime tree and
    auto-builds it from persisted runtime records on first use when missing
  - does not launch browsers or revisit provider pages
  - returns `object = "run_archive"` with stable item ids for response runs,
    response batches, team runs, media generations, uploaded input artifacts,
    generated artifacts, and provider conversation references
  - supports filters for `kind`, `provider`, `runtimeProfile`, `agent`, `team`,
    `responseId`, `batchId`, `status`, `q`, and `limit`
  - runtime archive items preserve the raw run `status` and expose derived
    `runtimeState`; the `status` filter matches either value so operators can
    query transient states such as `finalizing` without waiting for terminal
    persistence
  - compact CLI archive summaries display non-terminal `runtimeState` as the
    item status and keep raw run status in parentheses, for example
    `status=finalizing (raw: running)`
  - `GET /v1/archive/items/{archive_item_id}` reads one item detail by stable
    archive id
  - `GET /v1/archive/items/{archive_item_id}/asset` streams the readable local
    file for file-bearing archive items, returning 404 for non-file items or
    missing local paths
  - `POST /v1/archive/items/{archive_item_id}/materialize` asks the provider
    materializer to recover a missing generated artifact through the normal
    provider runtime path, then writes the local file facts back into the
    archive index. This foreground compatibility route makes live-follow yield
    while it runs; CLI parity is `auracall api archive-materialize --port
    <port> <archive_id>`.
  - `POST /v1/archive/materializations` queues the same provider-backed
    recovery as a persisted job and returns
    `object = "run_archive_materialization_job_create_result"` with a job id.
    The job store is user-scoped under the run archive tree, de-duplicates
    active jobs for the same archive item, records provider/auth failures as
    terminal job errors, and marks interrupted active jobs failed on API/MCP
    startup instead of leaving them forever running. Poll one job with
    `GET /v1/archive/materializations/{job_id}` or list jobs with
    `GET /v1/archive/materializations?status=active|terminal|queued|running|succeeded|skipped|failed&archiveItemId=<archive_id>&limit=50`.
    CLI parity is
    `auracall api archive-materialization-create --port <port> <archive_id>`
    plus `auracall api archive-materialization-status --port <port> <job_id>`
    and `auracall api archive-materialization-jobs --port <port> --status
    active`.
    MCP parity is `run_archive_materialization_create` and
    `run_archive_materialization_job`, plus `run_archive_materialization_jobs`
    for list/polling surfaces.
  - `POST /v1/archive/backfill` rebuilds the index from existing runtime
    records without browser work; CLI parity is
    `auracall api archive-backfill --port <port>`
  - `POST /v1/archive/evidence` stores caller-owned validation,
    post-processing, or review evidence as a searchable archive item with
    `kind = "evidence"`. Required fields are `producer` and `schema`;
    optional fields include `id`, `status`, `title`, `summary`, `responseId`,
    `batchId`, `archiveItemId`, `providerConversationId`, `data`, and
    `metadata`. CLI parity is `auracall api archive-evidence --payload-json
    '{...}'` or `auracall api archive-evidence --payload-file evidence.json`.
  - domain validation remains caller-owned; workflow agents attach their own
    validation evidence beside archived AuraCall outputs instead of adding
    domain validators to AuraCall core
  - CLI parity: `auracall api archive --port <port> --kind upload --batch-id
    <batch_id>`, `auracall api archive-item --port <port> <archive_id>`, and
    `auracall api archive-materialize --port <port> <archive_id>` read the
    same API surface and recover missing generated-artifact files; `auracall
    api archive-evidence --payload-file evidence.json` writes caller-owned
    evidence. When the local service challenges these archive CLI calls with
    HTTP 401, the CLI retries with the user-scoped key from
    `AURACALL_API_KEY` or `~/.auracall/api.env`.
- API-key authorization can be configured in `~/.auracall/config.json` or
  through the installed service dotenv file at `~/.auracall/api.env`. The
  service recognizes `AURACALL_API_KEY` as a bearer key and optional
  comma/space-delimited scopes in `AURACALL_API_KEY_AGENTS`,
  `AURACALL_API_KEY_TEAMS`, `AURACALL_API_KEY_SERVICES`, and
  `AURACALL_API_KEY_RUNTIME_PROFILES`. `pnpm run install:user-api-service`
  creates the dotenv file with `OPENAI_BASE_URL`, `OPENAI_API_KEY`, and
  `AURACALL_MODEL` defaults for client agents when the file does not exist.
  Execution-scope checks use the effective config plus registry catalog:
  registry-backed agent ids are valid scope ids, agent calls can infer service
  and runtime-profile scopes from the catalog, team-scoped keys can call member
  agents, and `/v1/team-runs` enforces team scopes before creating work.
  Privileged local MCP operators can use `api_key_issue`, and unscoped
  operator API clients can use `POST /v1/config/api-keys/issue`, to add an
  agent/team-scoped key to `~/.auracall/api.env`. The issue response returns
  the new OpenAI-compatible key once. Add `clientEnvPath` when AuraCall should
  also write a scoped client handoff containing `OPENAI_BASE_URL`,
  `OPENAI_API_KEY`, `AURACALL_MODEL`, `AURACALL_STATUS_URL`, and
  `AURACALL_BATCH_URL`; restart the user API service afterward so systemd
  reloads the service environment file. Use
  `GET /v1/config/agent-diagnostics` against the running service or MCP
  `api_key_diagnostics` against the env file to validate key scope metadata
  without exposing secret values.
- Agent-facing skills:
  - `skills/auracall-api-workflow/SKILL.md` covers scoped execution clients,
    single responses, batches, attachments, and polling
  - `skills/auracall-agent-setup/SKILL.md` covers privileged setup clients,
    project ensure, registry-backed agents, scoped keys, and diagnostics
- startup recovery can re-run bounded stale persisted direct runs before readback; keep
  this enabled by default, or disable with `--no-recover-runs-on-start`.
  - control source scope with `--recover-runs-on-start-source <direct|team-run|all>`
    - `direct` (default): only direct API responses
    - `team-run`: only team-mode executions
    - `all`: both direct and team-run
- tune startup recovery scan cap with `--recover-runs-on-start-max <count>`
- background drain defaults to a 60-second cadence. Tune it with
  `--background-drain-interval-ms <ms>` or set `0` to disable timer-driven
  drain when the operator wants request-scoped execution only.
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
  - `/status.runnerTopology` reports read-only runner topology/readiness:
    - `localExecutionOwnerRunnerId`
    - `generatedAt`
    - aggregate active/stale/fresh/expired/browser-capable runner counts
    - bounded runner capability summaries for service ids, runtime profiles,
      browser profiles, service-account ids, and browser capability
    - `selectedAsLocalExecutionOwner`
    - this surface does not select claims, acquire leases, execute steps, or
      reassign work to another runner
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
  - `/status.tenantExecutionLimits` reports read-only ChatGPT tenant budgets:
    - `providers.chatgpt.defaultLimits`
    - `providers.chatgpt.metrics.tenantCount`
    - `providers.chatgpt.metrics.activeChats`
    - `providers.chatgpt.entries[].tenantKey`
    - `providers.chatgpt.entries[].runtimeProfileIds`
    - `providers.chatgpt.entries[].browserProfileIds`
    - `providers.chatgpt.entries[].limits`
    - default `/status` leaves usage counters unscanned with
      `usage.basis = not-requested`
    - `GET /status?tenantExecutionLimits=usage` adds
      `providers.chatgpt.entries[].usage.activeChats`,
      `providers.chatgpt.entries[].usage.chatsLastHour`, and
      `providers.chatgpt.entries[].usage.chatsLastDay`
    - usage is derived from persisted active leases and `step-started` events;
      this status path does not acquire leases or execute work
    - recovery replays can write more than one `step-started` event for the
      same response step; usage counts that step once so reattaching an
      existing ChatGPT tab does not spend an extra hourly/daily chat-start
      budget
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
      - `diagnostics=browser-state`
      - `authority=scheduler`
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
            - active browser-backed Gemini runs prefer provider-owned
              lottie/avatar spinner evidence when visible, then fall back to
              executor-owned transient `thinking`
          - Grok on browser-backed runtime profiles only
            - active browser-backed Grok runs prefer executor-owned transient
              `thinking` state before DOM/page fallback
        - Gemini API-backed runtime profiles still return honest
          `unavailable` posture on this seam
        - Grok API-backed runtime profiles still return honest `unavailable`
          posture on this seam
        - keep it separate from queue/lease posture and `/status`
      - optional `browserDiagnostics` when explicitly requested with
        `diagnostics=browser-state`
        - bounded live browser evidence for the active step only
        - includes target URL/title/id, document readiness, visible control
          counts, provider evidence, recent browser mutation records, and a
          stored PNG screenshot path
        - generic run/media status also supports this switch for active
          browser-backed media jobs and prefers the provider `tabTargetId`
          recorded at prompt submission
      - optional `schedulerAuthority` when explicitly requested with
        `authority=scheduler`
        - read-only authority evidence only
        - includes decision, reason, active lease posture, candidates,
          selected runner evidence, future mutation label, and
          `mutationAllowed = false`
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
      - can execute runnable work already leased by the configured
        server-local runner
    - local-action request resolution:
      - `{"localActionControl":{"action":"resolve-request","runId":"...","requestId":"...","resolution":"approved|rejected|cancelled"}}`
      - only succeeds for currently `requested` local action records on direct
        or team runs
    - scheduler local claim:
      - `{"schedulerControl":{"action":"claim-local-run","runId":"...","schedulerId":"operator:local-status"}}`
      - only claims or reassigns to the server-local runner after read-only
        scheduler authority selects that runner
      - does not execute by itself; use targeted `drain-run` for immediate
        follow-through
      - fresh active leases, still-active lease owners, non-local selected
        runners, and affinity/capability blocks reject without mutation
  - startup recovery logs now also emit:
    - `attention=stale-heartbeat-inspect-only:<count>`
    - `attention=suspiciously-idle:<count>`
- optional `X-AuraCall-*` headers for execution hints:
  - `X-AuraCall-Runtime-Profile`
  - `X-AuraCall-Agent`
  - `X-AuraCall-Team`
  - `X-AuraCall-Service`
- configured single-agent calls can use OpenAI-style model routing:
  - `model: "agent:<agent_id>"` is equivalent to setting
    `auracall.agent = "<agent_id>"`
  - agent config may bind `runtimeProfile`, `service`, raw `model`,
    `modelSelector`, optional project/conversation ids, knowledge refs, and
    pre/post prompt text
  - raw `model` remains the provider-version escape hatch
  - `modelSelector` is the stable semantic intent field, e.g.
    `chatgpt:auto`, `chatgpt:instant`, `chatgpt:thinking-standard`,
    `chatgpt:thinking-extended`, `chatgpt:pro-standard`,
    `chatgpt:pro-extended`, `grok:auto`, `grok:thinking`, or
    `gemini:thinking`
  - provider adapters should resolve semantic selectors against the current
    workbench UI; older exact version selectors are non-urgent compatibility
    pins, not the default config posture
  - ChatGPT browser-backed execution currently resolves those ChatGPT selectors
    into the model picker plus Standard/Extended thinking controls; Grok and
    Gemini semantic execution remain follow-up work
- MCP exposes the same trusted local agent/team config surface through
  `config_entities_list`, `config_agent_upsert`, `config_agent_delete`,
  `config_team_upsert`, and `config_team_delete`; list responses include
  effective registry/config source metadata, and mutation responses include
  `mutationTarget` plus `blockedReason` when a config overlay id is pinned
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
  response body as the canonical machine-handling summary
- AuraCall keeps the user-visible result timeline and machine summary split
  explicit:
  - `output[]`
    - ordered visible result timeline
    - `message` items for assistant prose
    - sibling `artifact` items for durable non-text outputs
    - recoverable diagnostic artifacts when a browser provider fails after
      producing useful partial output; for example, an unparseable
      `response_format: {"type":"json_object"}` ChatGPT run stores the full
      best JSON snapshot as an artifact instead of returning an empty output
      array
  - `metadata.executionSummary`
    - bounded machine-handling summary for routing, retries, local actions,
      artifacts, handoffs, and failure/readback inspection
- AuraCall response readback also includes bounded assignment identity at
  top-level metadata only when the runtime run is task-backed:
  - `taskRunSpecId`
  - bounded `taskRunSpecSummary`
- direct runs suppress those fields even if a legacy or malformed stored run
  record still carries a persisted `taskRunSpecId`
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

auracall api status --port 8080

curl -s http://127.0.0.1:8080/v1/responses \
  -H 'Content-Type: application/json' \
  -d '{"model":"gpt-5.2","input":"Reply exactly with: local api smoke"}'

auracall run status <media_generation_id> \
  --expect-status succeeded \
  --expect-min-artifacts 1 \
  --expect-media-run-state terminal_image

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
