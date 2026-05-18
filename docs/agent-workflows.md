# Agent Workflow Integration

AuraCall is not only a single CLI call into one model. It is a local service
for agent-managed workflows that need browser-backed LLM accounts, durable run
state, OpenAI-compatible request shapes, MCP control tools, and operator
visibility.

The ChE grading workflow is one example. The same pattern should support many
deterministic and stochastic algorithms:

- deterministic setup: ensure an agent, project, team, key, and limits exist
- stochastic execution: submit prompts to provider workbenches that may take
  variable time and may return variable model output
- durable polling: read run or batch status by id without resubmitting work
- bounded parallelism: run multiple jobs while respecting browser/account
  limits
- operator inspection: expose enough state through API, MCP, and dashboards to
  debug the workflow without opening provider browsers directly

## Integration Model

Use three layers deliberately:

1. Setup layer
   - create or update AuraCall agents and teams
   - ensure provider projects when a workflow depends on a provider-side project
   - issue scoped API keys for execution clients
   - requires operator privileges
2. Execution layer
   - submit one response, chat completion, team run, media request, or response
     batch
   - use scoped keys whenever possible
   - never mutate provider/project/account setup as a side effect of ordinary
     prompt execution
3. Observation layer
   - poll response, batch, scheduler, live-follow, and browser-status surfaces
   - read-only calls must not resubmit prompts, reopen provider tools, or
     navigate browser tabs

This separation matters because live browser accounts are scarce resources.
Lazy account mirroring, provider media runs, direct response runs, and batch
work all share the same browser service control plane.

## Agent Shape

An AuraCall agent is the stable model name a client should use. Its id is
published as:

```text
agent:<agent_id>
```

Agent ids should be deterministic, descriptive, and safe to reuse from app
config. Prefer:

```text
<mode>-<provider>-<identity-or-tenant>[-<project-or-domain>]
```

Examples:

```text
instant-chatgpt-ecochran76
pro-extended-chatgpt-soylei
pro-extended-chatgpt-soylei-che4470-seminar-grading
thinking-standard-chatgpt-consult-review
instant-gemini-default
instant-grok-default
```

An agent can carry:

- `runtimeProfile`: AuraCall runtime profile such as `default` or
  `wsl-chrome-3`
- `service`: provider family such as `chatgpt`, `gemini`, or `grok`
- `modelSelector`: semantic intent such as `chatgpt:pro-extended`
- raw `model`: provider-version escape hatch when semantic selectors are not
  enough
- `projectId` and `projectName`: provider-side project binding
- `knowledge`: workflow-local references
- `prePrompt` and `postPrompt`: agent-local prompt framing
- `metadata`: ownership, course/client/domain, or app identifiers

Prefer semantic selectors for current-provider behavior and keep raw model
pins as escape hatches. Provider model labels drift quickly; client apps should
not hard-code provider version strings unless they intentionally need a pinned
legacy model.

## Workflow Classes

### One-Shot Agent Call

Use this when a client app needs one answer from one configured agent.

1. Discover available agents with `GET /v1/models`.
2. Select an `agent:<agent_id>` model id.
3. Submit `POST /v1/responses` or non-streaming
   `POST /v1/chat/completions`.
4. Read the response body. If the run is asynchronous or detached, keep the
   response id and poll `GET /v1/responses/{response_id}` or MCP `run_status`.

This is the minimum OpenAI-compatible path.

When the selected model is a configured `agent:<agent_id>`, callers do not need
to repeat `auracall.service` or `auracall.runtimeProfile`. AuraCall hydrates
missing service/runtime routing from the effective agent catalog before
authorization, persistence, and scheduling. Runtime inspection should therefore
show concrete `serviceIds`, `runtimeProfileIds`, and queue affinity even for
plain OpenAI-compatible requests.

### Project-Bound Agent Setup

Use this when a workflow needs provider-side project context before execution.

Primary path:

1. Call `POST /v1/agent-setup-handoffs` or MCP
   `agent_setup_handoff_create` with an operator key.
2. Supply `service`, `runtimeProfile`, `projectName`, `agentId`,
   `agentModelSelector`, and `clientEnvPath`.
3. Optionally supply project fields, agent instructions, key id, service/runtime
   scopes, `apiBaseUrl`, and `envPath`.
4. Verify the returned project id, agent id, `clientEnvPath`, model id, scoped
   key id, scopes, and restart hint. This response is intentionally non-secret.
5. Restart the installed API service so the server reloads the service env.
6. Run `pnpm run smoke:scoped-client-env -- <clientEnvPath>` or the equivalent
   `/v1/models` plus `/v1/responses` check against the generated env.
7. Hand only the scoped client env path to the execution agent.

Lower-level path:

1. Call `POST /v1/projects/ensure` or MCP `project_ensure` with an operator key.
2. Supply `service`, `runtimeProfile`, `projectName`, and optional project
   fields such as instructions/files.
3. Supply `agentId` and agent fields when the setup should bind an AuraCall
   agent to the resolved provider project.
4. Verify the returned `mutationTarget` and resulting agent id.
5. Issue a scoped API key for that agent.
6. Request a `clientEnvPath` when issuing the key so AuraCall writes a scoped
   client handoff file.
7. Restart the installed API service so the server reloads the service env.
8. Hand only the scoped client env path to the execution agent.

Setup is intentionally separate from execution. A scoped execution agent should
not be able to create or rewrite provider projects. Prefer the composed setup
handoff route when a downstream app needs a ready-to-source `.env`; use
`/v1/agent-setup-packages` only when a privileged operator explicitly needs the
full one-time secret-bearing setup response, and use the lower-level routes only
when an operator needs to inspect or customize each phase.

### Batch Workflow

Use this when a client app has many independent jobs that can run under shared
limits.

1. Create or identify the target agent.
2. Prepare one ordinary response request per job.
3. Include local attachments as local paths or `file://` URIs when provider
   upload is required.
4. Submit one `POST /v1/response-batches` request.
5. Store the returned batch id and child response ids.
6. Poll `GET /v1/response-batches/{batch_id}` or MCP
   `response_batch_status`.
7. Read child output through `GET /v1/responses/{response_id}` or MCP
   `run_status`.

Batch limits are attached to the child runs and enforced by the shared service
host drain path before a run lease is acquired. Skipped children remain queued
for a later drain pass.

ChatGPT tenant limits are enforced across all ChatGPT response batches and
one-shot responses on the same drain path. Defaults are 4 concurrent chats, 120
chat starts per hour, and 240 chat starts per day per configured ChatGPT service
account, falling back to the AuraCall runtime profile when no service account
identity is configured. Per-batch `maxConcurrentRuns` may be lower, but it
cannot raise a tenant above that budget. Operators can read the configured
ChatGPT tenant budgets from `GET /status` under `tenantExecutionLimits`; add
`?tenantExecutionLimits=usage` when current lease/event-derived usage counters
are needed.

Batch children should normally use the same configured `agent:<agent_id>` model
as one-shot calls. AuraCall applies the same catalog hydration to every child
request before enqueueing, so scoped clients can submit ordinary OpenAI-style
jobs without duplicating provider routing fields.

Tenant-pool teams are the batch-specific alternative when one logical batch
should spread across several account-bearing agents. A privileged setup agent
can call `POST /v1/tenant-pool-teams/ensure` or MCP
`tenant_pool_team_ensure` with a shared `projectName` and one member entry per
tenant runtime profile. AuraCall ensures the member projects/agents and creates
the team only when it does not already exist:

```json
{
  "teamId": "chatgpt-pro-pool",
  "service": "chatgpt",
  "projectName": "Shared Project",
  "agentModelSelector": "chatgpt:pro-extended",
  "members": [
    { "agentId": "chatgpt-pro-a", "runtimeProfile": "wsl-chrome-1" },
    { "agentId": "chatgpt-pro-b", "runtimeProfile": "wsl-chrome-2" }
  ]
}
```

Existing dispatch-pool teams return `found` and keep their membership
unchanged. Existing non-dispatch teams block setup before provider/project
mutation.

Once the team is configured with `type = "dispatch-pool"`, submit:

```json
{
  "dispatch": { "team": "chatgpt-pro-pool" },
  "requests": [
    { "model": "gpt-5.1", "input": "Job 1" },
    { "model": "gpt-5.1", "input": "Job 2" }
  ]
}
```

AuraCall rewrites each child to the next available member agent before
authorization. Availability is based on persisted runtime evidence for active
direct-run leases/running steps plus assignments already made in the current
batch. Batch status and child run metadata include the selected member agent.

For consistent results, keep pool members on equivalent services, models, and
project configuration. Mixed services/models and project divergence are allowed
and reported as risk metadata. Project-bound pools currently use
`projectSync = "none"`; dispatch does not synchronize project instructions,
files, settings, or history between tenants.

Useful limits:

```json
{
  "maxConcurrentRuns": 1,
  "maxBrowserInteractionsPerMinute": 8
}
```

The exact values should be workflow-specific. Gemini and other bot-sensitive
services often need lower interaction rates than ChatGPT.

### Team Workflow

Use `/v1/team-runs` or MCP `team_run` when a workflow is naturally multi-agent
inside AuraCall: review loops, staged planning, independent reviewers, or local
action approval. Team runs should still use configured agents rather than raw
provider model labels.

### Live-Follow-Aware Workflow

Lazy account mirroring runs in the background, but foreground AuraCall work has
priority. Client agents should not try to pause live follow before every job.
Instead:

- check `/status` or MCP `api_status` when diagnosing service health
- let foreground API requests mark active work
- expect routine mirror refreshes to yield when provider/browser work is queued
- use the dashboard or MCP status tools to investigate backpressure

## API Key Pattern

Use the narrowest key that can run the workflow.

- operator key:
  - setup agents, teams, projects, snapshots, diagnostics, and key issuance
  - should stay local to trusted operators or privileged setup agents
- agent-scoped key:
  - can call a specific `agent:<agent_id>`
  - may be scoped by `services` and `runtimeProfiles`
  - should be the default for client apps
- team-scoped key:
  - can call the team and member agents implied by the effective catalog
  - useful for multi-agent orchestration clients

After key issuance, restart the installed API service so the running process
reloads `~/.auracall/api.env`.

When a setup agent can create the project-bound agent and key in one call, use
`POST /v1/agent-setup-handoffs` or MCP `agent_setup_handoff_create`:

```json
{
  "service": "chatgpt",
  "runtimeProfile": "wsl-chrome-3",
  "projectName": "ChE 4470/5470 Seminar Grading",
  "agentId": "pro-extended-chatgpt-soylei-che4470-seminar-grading",
  "agentModelSelector": "chatgpt:pro-extended",
  "keyId": "che447-grading-client",
  "envPath": "/home/ecochran76/.auracall/api.env",
  "clientEnvPath": "/home/ecochran76/.auracall/clients/che447-grading.env"
}
```

When using the lower-level key route, provide both paths so AuraCall can also
write the downstream handoff:

```json
{
  "agentId": "pro-extended-chatgpt-soylei-che4470-seminar-grading",
  "keyId": "che447-grading-client",
  "services": ["chatgpt"],
  "runtimeProfiles": ["wsl-chrome-3"],
  "envPath": "/home/ecochran76/.auracall/api.env",
  "clientEnvPath": "/home/ecochran76/.auracall/clients/che447-grading.env"
}
```

`envPath` is loaded by `auracall-api.service`. `clientEnvPath` is the scoped
handoff file for the calling agent.

## Client Handoff Contract

A setup agent should hand an execution agent only the fields it needs:

```env
OPENAI_BASE_URL=http://auracall.localhost/v1
OPENAI_API_KEY=<scoped key>
AURACALL_MODEL=agent:pro-extended-chatgpt-soylei-che4470-seminar-grading
AURACALL_STATUS_URL=http://auracall.localhost/status
AURACALL_BATCH_URL=http://auracall.localhost/v1/response-batches
```

For OpenAI-compatible clients, set:

- base URL: `OPENAI_BASE_URL`
- key: `OPENAI_API_KEY`
- model: `AURACALL_MODEL`

For custom clients, also store:

- `AURACALL_STATUS_URL=http://auracall.localhost/status`
- `AURACALL_BATCH_URL=http://auracall.localhost/v1/response-batches`

Do not store provider account credentials, provider cookies, or browser profile
paths in app repos.

Validate the handoff before batch work:

1. restart `auracall-api.service` after issuing the key
2. source or parse the client env file
3. call `GET /v1/models` with the scoped key
4. verify the expected `AURACALL_MODEL` appears
5. run one small `/v1/responses` smoke before enqueuing a large batch

## Polling Rules

Polling is read-only:

- poll by response id, batch id, or run id
- do not call create endpoints again to "check status"
- do not reload provider conversation URLs while a new conversation is still
  materializing
- do not navigate a browser tab after submitting a prompt unless the provider
  adapter explicitly owns that navigation

This rule is central to avoiding the re-navigation failures seen in Gemini and
Grok materialization work.

## Archive Readback

Use the run archive when a caller needs to find what AuraCall did after a
single response, batch, team run, or media generation:

- API: `GET /v1/archive`, `GET /v1/archive/items/{archive_item_id}`, and
  `GET /v1/archive/items/{archive_item_id}/asset`
- CLI: `auracall api archive`, `auracall api archive-item`, and
  `auracall api archive-backfill`; shell workflows can attach evidence with
  `auracall api archive-evidence --payload-json '{...}'` or
  `--payload-file evidence.json`
- MCP: `run_archive_search`, `run_archive_item`, `run_archive_backfill`, and
  `run_archive_attach_evidence`

The archive reads a user-scoped index that is auto-built on first use if it is
missing. Operators and privileged agents can rebuild it with the backfill
surface after runtime repair or older-record import. The index lists response
runs, response batches, team runs, media generations, uploaded input artifacts,
generated artifacts, and provider conversation references without launching
browsers or navigating provider pages. Domain agents should use this for audit
and handoff, then store their own validation evidence when they need
workflow-specific correctness checks.

For file-bearing archive items, use the `/asset` route to stream the local
file. It returns 404 when the archive item is not a file, the local path is
missing, or the file no longer exists.

Caller-owned validators and post-processors can attach their audit result with
`POST /v1/archive/evidence`, CLI `auracall api archive-evidence`, or MCP
`run_archive_attach_evidence`. Evidence records require `producer` and
`schema`, may carry structured `data`, and can link to a response id, batch id,
provider conversation id, or another archive item id. Search them with
`GET /v1/archive?kind=evidence&q=<text>`.

## Attachments

For local attachments:

- use `attachments[]` with `uri` as a local path or `file://` URI
- include stable `id`, `fileName`, and `mimeType` when known
- keep attachment sets job-local so a failed child can be retried without
  reconstructing the whole batch

Remote HTTP(S) URIs are currently preserved as metadata for future
materialization. They are not automatically downloaded into provider upload
slots.

## Deterministic vs Stochastic Design

Keep deterministic and stochastic parts explicit:

- deterministic:
  - registry mutation
  - key issuance
  - batch creation
  - status polling
  - output file placement
  - caller-owned schema/domain validation
- stochastic:
  - provider model response
  - provider-side execution duration
  - browser UI timing
  - generated media/artifact availability

Where a workflow needs machine-readable output, use a deterministic prompt
contract such as `auracall.outputContract = "auracall.step-output.v1"` or a
workflow-specific JSON schema in the agent post-prompt. Then validate output
after readback rather than assuming the provider followed instructions.

AuraCall core should store and expose the request, uploaded files, provider
conversation references, generated artifacts, response content, and any
caller-supplied validation evidence. It should not decide whether a grading
score, transcript summary, literature screen, or other domain result is correct.
Those checks belong to workflow agents or downstream apps, and their results
should be attached to the searchable AuraCall archive when they are useful for
audit or handoff.

## Skill Strategy

Agents that use AuraCall should have small, purpose-specific skills instead of
copying API choreography into every app.

Initial skill families:

- `auracall-api-workflow`
  - discover models
  - call one agent
  - submit/poll batches
  - handle scoped key environment
- `auracall-agent-setup`
  - ensure projects
  - create/update agents
  - issue scoped keys
  - validate diagnostics
- workflow-specific skills
  - wrap domain payload preparation and output validation
  - delegate AuraCall setup/execution details to the two generic skills above

Workflow-specific skills should not carry provider browser heuristics. Browser
state belongs inside AuraCall provider adapters and browser services.

## Current Gaps

- Grok and Gemini semantic selector execution are visible in discovery but not
  fully execution-ready.
- Streaming chat completions are deferred.
- Remote HTTP(S) attachment download/materialization is deferred.
- API key issuance is local/operator-scoped; remote privileged MCP/API
  exposure needs a first-class principal/role model.
- Batch cancellation, retry, and per-child priority are not yet first-class
  batch controls.
- Searchable archive promotion for AuraCall-created runs, uploads, generated
  artifacts, provider conversation ids, and caller-supplied validation evidence
  is now tracked in Plan 0066.
- Workflow-specific output schemas remain caller-owned unless the caller
  validates them after readback and stores that evidence.

## Reference Smoke

Run:

```bash
pnpm run smoke:che447-grading-batch
pnpm run smoke:scoped-client-env -- <client.env>
pnpm run smoke:scoped-client-handoff
```

The grading smoke is intentionally named after the current course workflow, but
it is a general pattern smoke. It proves:

- operator project ensure
- project-bound agent creation
- agent-scoped API-key execution
- batch enqueue
- attachment-bearing child jobs
- batch polling
- child response readback
- no live provider/browser quota use

The scoped-client-env smoke is the tiny downstream client check: it reads a
generated handoff env file, calls `/v1/models`, submits one `/v1/responses`
request, polls it, and exits with clear diagnostics.

The scoped-client-handoff smoke proves the same setup contract from the client
side: after a simulated API service reload, it uses the scoped-client-env smoke
against the generated env values, then enqueues a batch and polls/reads the
results.
