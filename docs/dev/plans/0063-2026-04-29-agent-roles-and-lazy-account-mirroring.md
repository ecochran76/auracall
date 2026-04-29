# Agent Roles And Lazy Account Mirroring Plan | 0063-2026-04-29

State: OPEN
Lane: P01

## Purpose

Define the next bounded step for account-aware agents and lazy account
mirroring while `auracall api serve` is running.

This plan does not implement a new provider API lane. It keeps the browser
service as the control plane and treats provider account history as
identity-scoped state that must be mirrored patiently through the same managed
browser profile and dispatcher paths as normal browser work.

## Current State

- `agents.<name>.runtimeProfile` is the only live agent-owned execution
  selector.
- `agents.<name>.description`, `instructions`, and `metadata` are accepted
  config fields, but they remain organizational/future-workflow fields.
- Account identity already belongs on
  `runtimeProfiles.<name>.services.<service>.identity`.
- A missing expected service identity is unsafe for browser-backed work because
  it can pollute caches or use the wrong provider account.
- Browser-backed response and media work now routes through the browser
  operation dispatcher; lazy mirroring must use the same queue/control plane.
- The default ChatGPT tenant has the richest useful history and should be the
  first mirror source.

## Proposed Agent Catalog

These are intended config-level agents. They specialize purpose and routing,
not browser identity.

| Agent | Runtime profile | Primary service | Purpose |
| --- | --- | --- | --- |
| `default-chatgpt-memory-steward` | `default` | `chatgpt` | Maintain the low-churn mirror of the default ChatGPT tenant's history, projects, artifacts, account level, and capability snapshot. |
| `default-chatgpt-primary` | `default` | `chatgpt` | Use the richest default ChatGPT account context for normal planning, drafting, synthesis, and historical recall. |
| `consult-chatgpt-pro` | `wsl-chrome-2` | `chatgpt` | Route Pro-capable consulting work and Deep Research while keeping it separate from the default account cache. |
| `soylei-chatgpt-pro` | `wsl-chrome-3` | `chatgpt` | Route Soylei-domain Pro and Deep Research work with its own identity-scoped cache. |
| `grok-imagine-media` | `auracall-grok-auto` | `grok` | Handle Grok Imagine image/video work and mirror saved/files metadata during idle windows. |
| `gemini-media-research` | `auracall-gemini-pro` | `gemini` | Handle Gemini media/research workflows with quota-aware, low-churn discovery and mirror updates. |
| `cross-service-synthesizer` | `default` | `chatgpt` | Consume mirrored account indexes and orchestrate provider-specific agents without merging account identities. |

Initial config shape should stay within the existing schema:

```json5
{
  agents: {
    "default-chatgpt-memory-steward": {
      runtimeProfile: "default",
      description: "Low-churn mirror steward for the default ChatGPT tenant.",
      instructions: "Maintain account mirror freshness without submitting prompts or navigating away from active provider work.",
      metadata: {
        service: "chatgpt",
        purpose: "account-mirror",
        mirrorPolicy: {
          mode: "lazy",
          priority: "background",
          contentPolicy: "metadata-first"
        }
      }
    }
  }
}
```

The `metadata.mirrorPolicy` block is descriptive until a later slice promotes a
typed execution contract.

## Lazy Mirroring Model

Lazy account mirroring should be opportunistic and conservative:

- enqueue only while `api serve` or a future service host is running
- run on startup, idle windows, after successful provider work, and explicit
  operator/API/MCP refresh requests
- acquire the browser operation dispatcher queue before touching CDP
- apply a self-imposed politeness policy before queueing browser work:
  - provider-specific minimum refresh intervals
  - deterministic jitter so all mirrors do not wake at once
  - shorter, still jittered explicit-refresh intervals for operator-requested
    checks
  - exponential failure backoff
  - long cooldowns after provider hard stops such as CAPTCHA, `sorry`, account
    challenge, rate limit, or sign-in required states
- fail fast when expected identity is missing, mismatched, signed out, or
  blocked by human-verification
- prefer metadata first:
  - account identity and account level
  - provider capabilities/tool snapshots
  - projects/workspaces
  - conversation ids, titles, timestamps, service refs, and maturity state
  - files/artifact manifests
  - media saved/files indexes
- fetch full content or binary artifacts lazily on explicit request or bounded
  recent-window policy
- never reload or re-navigate a just-submitted conversation in order to mirror
  it
- never load immature conversation ids for validation; wait for provider-owned
  completion evidence first
- serialize per managed browser profile and provider service
- cap each mirror cycle with provider-specific page/read budgets; do not chase
  infinite scroll or full-history completion in one pass

Current implementation-facing politeness contract:

- `src/accountMirror/politePolicy.ts` owns the first pure policy evaluator.
- `src/accountMirror/statusRegistry.ts` owns the first read-only status
  registry over configured runtime-profile service identities.
- `/status.accountMirrorStatus`, `GET /v1/account-mirrors/status`, and MCP
  `account_mirror_status` expose whether each configured service/profile
  mirror is currently `eligible`, `delayed`, or `blocked` before any browser
  work is enqueued.
- `src/accountMirror/refreshService.ts` owns the first explicit refresh request
  path. It is intentionally narrow: default ChatGPT only, browser operation
  dispatcher acquisition/release first, identity verification before history
  reads, and bounded metadata collection only.
- `src/accountMirror/chatgptMetadataCollector.ts` owns the first passive
  ChatGPT collector. It reads identity, project rows, and conversation rows
  through the existing ChatGPT adapter, bounded by the politeness page/row
  budgets. It does not submit prompts or fetch full conversation bodies.
- `POST /v1/account-mirrors/refresh` and MCP `account_mirror_refresh` request
  that one explicit refresh and return dispatcher evidence plus updated mirror
  status.
- `src/accountMirror/cachePersistence.ts` owns the first durable persistence
  seam. Mirror content is stored in the existing provider cache store under
  `cache/providers/<provider>/<boundIdentity>/account-mirror/snapshot.json`
  and the matching SQLite `account-mirror` dataset when the SQLite/dual cache
  backend is active.
- The canonical mirror content key is provider service plus bound identity.
  AuraCall runtime profile and browser profile remain profile-binding and
  refresh-provenance fields; they do not own separate copies of the same
  account mirror.
- `/status`, `GET /v1/account-mirrors/status`, and MCP `account_mirror_status`
  hydrate persisted mirror counts/evidence before readback without enqueueing
  browser work.
- default routine intervals:
  - ChatGPT: 6 hours plus up to 20 minutes jitter
  - Gemini: 12 hours plus up to 45 minutes jitter
  - Grok: 8 hours plus up to 30 minutes jitter
- default explicit refresh intervals:
  - ChatGPT: 10 minutes plus jitter
  - Gemini: 30 minutes plus jitter
  - Grok: 20 minutes plus jitter
- hard-stop cooldowns:
  - ChatGPT/Grok: 12 hours
  - Gemini: 24 hours
- default per-cycle budgets:
  - ChatGPT: 12 page reads, 250 conversation rows, 80 artifact rows
  - Gemini: 6 page reads, 120 conversation rows, 40 artifact rows
  - Grok: 8 page reads, 160 conversation rows, 80 artifact rows

## Runtime Surfaces

The service should expose mirror status through API and MCP before broadening
the worker behavior:

- `idle`
- `queued`
- `syncing`
- `blocked`
- `stale`
- `healthy`
- `failed`

Each status payload should include:

- AuraCall runtime profile
- browser profile
- provider service
- expected identity
- detected identity when available
- account level when available
- last sync attempt
- last successful sync
- next eligible sync
- queued/acquired browser operation evidence
- metadata counts by resource kind
- latest hard-stop reason

## Acceptance Criteria

- Agent role guidance is documented without changing the live agent execution
  contract.
- Lazy mirroring has a service-mode plan that keeps browser/CDP access behind
  the browser operation dispatcher.
- Read-only mirror-status reporting exists before any background mirror loop.
- Explicit default ChatGPT refresh can be requested through API/MCP and records
  queued/running/completed dispatcher evidence without background looping.
- Explicit default ChatGPT refresh verifies the bound identity before reading
  bounded project/conversation metadata.
- The first implementation slice targets default ChatGPT metadata-first
  mirroring only.
- API and MCP mirror-status readback exist before any long-running background
  mirror loop is widened.
- Mirror storage is keyed by provider service plus bound identity, not by
  agent name, AuraCall runtime profile, or browser profile alone.
- Mirror status can read the latest persisted metadata counts/evidence from
  the cache store after process restart without keeping all mirror state in
  memory.
- Tests cover config projection, mirror scheduling state, identity hard stops,
  and dispatcher queue evidence before live provider dogfood.
- The first scheduling tests prove self-imposed jitter, minimum intervals,
  provider hard-stop cooldowns, failure backoff, and page/read budgets.

## Non-Goals

- Provider API execution for ChatGPT, Gemini, Grok, xAI, or Google AI.
- Cross-account cache merging.
- A fleet scheduler or parallel browser workers.
- Agent-local browser identity overrides.
- Prompt submission as part of background account mirroring.

## Next Implementation Slice

Next persist richer provider manifests into the same identity-scoped provider
cache: project rows, conversation rows, artifact manifests, and media indexes
as separate cache datasets. Keep full content and binary artifact fetches lazy
behind explicit requests or bounded recent-window policy.
