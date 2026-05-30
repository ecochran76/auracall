# Full Live-Follow Artifact Retrieval Plan | 0086-2026-05-30

State: CLOSED
Lane: P01

## Purpose

Move AuraCall live follow out of metadata-only artifact posture and into
explicit full artifact retrieval for configured targets. Plan 0085 proved that
recovery candidates and bounded materialization work exist; this plan makes the
desired operator state durable: live-follow targets that are configured for
full retrieval should run `full_sweep` plus `full_missing_assets`, upgrade
existing metadata-only completions when needed, and prove missing-local counts
drop through installed-runtime evidence.

## Current State

- Plan 0085 is closed. It added cache-first recovery candidate planning across
  API, CLI, MCP, and `/console?view=runs`.
- Installed recovery readback on port `18095` still reports:
  - `434` remote-known missing local assets;
  - `6` unknown/deferred assets;
  - `4` queueable ChatGPT history-materialization candidates;
  - `2` Gemini detail-refresh candidates.
- Installed `~/.auracall/config.json` has enabled live-follow targets with
  `mode: metadata-first` and `priority: background`, but no `sweepMode`,
  `materializationPolicy`, `materializationAssetKinds`, or
  `materializationMaxItems`.
- The active completions are still `steady_follow` plus `metadata_only`:
  - `chatgpt/wsl-chrome-3`;
  - `gemini/auracall-gemini-pro`;
  - `grok/default`.
- `chatgpt/wsl-chrome-3` was the first proof target:
  - active and error-free at baseline;
  - `145` remote-known missing local assets at baseline;
  - `2` locally materialized assets at baseline through run-archive overlay;
  - after the installed full-retrieval run, `24` local materialized artifacts
    are visible through recovery readback and search/archive reports `24`
    available artifact rows with local paths and SHA-256 checksums;
  - remaining recovery readback for the target is `123` remote-known missing
    local assets, so the target is no longer metadata-only and is making
    measured catch-up progress.
- Other ChatGPT targets are not ready for broad execution:
  - `chatgpt/default`, `chatgpt/wsl-chrome-2`, and `chatgpt/wsl-chrome-4`
    are in failure cooldown or page-target/collector timeout states.

## Root Cause Summary

Full retrieval is not happening because the current runtime is configured for
metadata-first live follow, existing active completions remain metadata-only,
and dry-run reconciliation does not upgrade active completions. The retrieval
code exists, but the installed policy and upgrade path are not yet aligned with
the desired full artifact retrieval behavior.

## Scope

- Make the desired full-retrieval policy explicit for operator-selected
  live-follow targets.
- Ensure active metadata-only completions can be upgraded to the configured
  full-retrieval policy without waiting for cancellation or replacement.
- Prove the first installed target with `chatgpt/wsl-chrome-3` before running a
  broader fleet campaign.
- Keep the proof bounded with `materializationMaxItems` and provider politeness
  controls.
- Update API/CLI/MCP/readback docs so operators can see whether a target is:
  - configured for full retrieval;
  - actively running metadata-only;
  - upgraded and waiting;
  - queueing materialization jobs;
  - blocked by provider cooldown or browser target failure.

## Non-Goals

- Do not launch broad multi-tenant materialization until the first target proves
  reduced missing-local counts.
- Do not bypass provider guard, cooldown, browser profile ownership, or
  foreground-yield policy.
- Do not mutate provider conversations, submit prompts, or create provider
  projects.
- Do not treat Gemini deferred asset inventory as fetchable until detail
  refresh classifies concrete retrievable assets.
- Do not add Search/archive product expansion, API Access, broad retry/launch,
  or new console control families in this slice.
- Do not extend the retired legacy frontend.

## Architecture Boundaries

- Desired artifact retrieval policy belongs in service-level `liveFollow`
  config and explicit operator controls.
- Active completion policy belongs to the durable completion operation and must
  be inspectable through API, CLI, MCP, status, and console readback.
- Materialization remains explicit durable work owned by completion,
  reconciliation campaign, history-materialization job, or archive job.
- Ordinary metadata reads remain cache-first. Browser downloads only occur
  through configured full-retrieval policy or an explicit recovery operation.
- Tenant identity remains provider plus bound identity; runtime/browser profile
  remains execution provenance.

## Implementation Tracks

### Track 1 | Desired Policy Contract

Status: complete.

- Add or verify durable config support for:
  - `liveFollow.sweepMode: full_sweep`;
  - `liveFollow.materializationPolicy: full_missing_assets`;
  - `liveFollow.materializationAssetKinds: [all]`;
  - bounded `liveFollow.materializationMaxItems`.
- Update operator docs with the exact config keys and CLI/MCP equivalents.
- Ensure readback distinguishes configured desired policy from the active
  completion's current policy.

### Track 2 | Active Completion Upgrade

Status: complete.

- Make startup reconciliation or explicit reconciliation able to upgrade an
  existing active metadata-only completion when the configured desired policy is
  full retrieval.
- Preserve no-duplicate semantics: upgrade the active completion in place when
  possible instead of starting a second browser loop for the same target.
- Ensure upgrades set:
  - `sweepMode: full_sweep`;
  - `materializationPolicy: full_missing_assets`;
  - `materializationRefreshSnapshot: true`;
  - bounded `materializationMaxItems`;
  - a bounded `maxPasses` when the upgrade is campaign-driven.
- Add readback/lifecycle events that say the completion was upgraded for full
  artifact retrieval.

### Track 3 | First Installed Proof Target

Status: complete.

- Use `chatgpt/wsl-chrome-3` as the first proof target.
- Baseline before upgrade:
  - active completion id;
  - sweep mode;
  - materialization policy;
  - materialization cursor;
  - recovery-candidate counts;
  - active history-materialization jobs.
- Upgrade/run one bounded pass with a conservative item cap.
- Prove:
  - a completion policy change is visible in installed readback;
  - a `materializationCursor` or explicit history-materialization job is
    created;
  - job status reaches terminal state;
  - local paths, checksums, manifest paths, archive/search rows, and
    skip/failure reasons are recorded;
  - `chatgpt/wsl-chrome-3` missing-local count drops or all attempted assets
    are classified terminal/unsupported.

### Track 4 | Scale Gate For Remaining Targets

Status: complete.

- Do not broaden to `chatgpt/default`, `chatgpt/wsl-chrome-2`, or
  `chatgpt/wsl-chrome-4` until their current cooldown/page-target failures are
  understood or cleared.
- Keep Gemini in detail-refresh posture until a provider-specific detail slice
  converts unknown/deferred asset counts into concrete retrievable candidates.
- Define an operator scale gate:
  - first target reduced missing-local count or terminalized attempted assets;
  - active jobs are zero or bounded;
  - browser queue is not backpressured;
  - provider guard is clear;
  - console and CLI read the same policy/count posture.

## Acceptance Criteria

- Complete. Plan 0086 is wired into `ROADMAP.md` and `RUNBOOK.md`.
- Complete. Installed `~/.auracall/config.json` for
  `profiles["wsl-chrome-3"].services.chatgpt.liveFollow` now expresses:
  - `sweepMode: full_sweep`;
  - `materializationPolicy: full_missing_assets`;
  - `materializationAssetKinds: [all]`;
  - `materializationMaxItems: 3`;
  - `materializationRefreshSnapshot: true`;
  - `materializationForce: false`.
- Complete. Existing active metadata-only completions are upgraded in place by
  configured live-follow reconciliation, with a
  `live_follow_policy_upgraded` lifecycle event and no duplicate target loop.
- Complete. Installed readback for
  `acctmirror_completion_ca854a9c-d49f-48e3-b472-91e6966311c4` shows:
  - `mode: live_follow`;
  - `sweepMode: full_sweep`;
  - `materializationPolicy: full_missing_assets`;
  - `materializationAssetKinds: [all]`;
  - `materializationMaxItems: 3`;
  - `materializationRefreshSnapshot: true`.
- Complete. The first installed proof target materialized real assets through
  provider-backed history retrieval:
  - explicit bounded proof job `hmj_57def4c362a14e46bfd1efd741fc6edb`
    succeeded after the timeout fix with `maxItems=3`, `3` conversations
    attempted, `3` materialized assets, `1` skipped entry, `4` failed entries,
    `3` manifest paths, and `3` checksum-bearing entries;
  - search/archive readback for `chatgpt/wsl-chrome-3` and
    `eric.cochran@soylei.com` reports `24` available artifact rows with local
    paths and SHA-256 checksums;
  - recovery-candidate readback moved from `145` remote-known missing local
    assets and `2` local materialized assets to `123` remote-known missing
    local assets and `24` local materialized artifacts.
- Complete. The history-materialization job runner no longer marks a job
  failed on a hard wrapper timeout while provider work continues in the
  background. Jobs remain `running` until provider work settles or startup
  recovery marks interrupted active jobs failed after service restart.
- Complete. Remaining targets are explicit:
  - `chatgpt/wsl-chrome-3`: full-retrieval policy active, incremental catch-up
    still needed for the remaining `123` remote-known missing local assets;
  - other ChatGPT targets: still require bounded per-binding proof before
    broadening retrieval;
  - Gemini: detail-refresh required before asserting concrete retrievable
    assets;
  - Grok blocked targets: no-op until binding/browser readiness is fixed.

## Validation Plan

- Focused tests for live-follow policy reconciliation and active completion
  upgrade behavior.
- Focused tests for completion lifecycle/readback when metadata-only is
  upgraded to full retrieval.
- HTTP/CLI/MCP tests for policy visibility and recovery posture.
- Console build or focused console test if `/console?view=runs` changes.
- `pnpm run typecheck`
- `pnpm run build`
- `pnpm run lint`
- `pnpm run plans:audit -- --keep 86`
- `git diff --check`
- Installed runtime:
  - rebuild and restart `auracall-api.service`;
  - read active completions from port `18095`;
  - read recovery candidates from port `18095`;
  - run one bounded full-retrieval proof for `chatgpt/wsl-chrome-3`;
  - record before/after counts and job evidence.

## Definition Of Done

- AuraCall is no longer stuck in metadata-only posture for the selected proof
  target.
- The installed proof target reduced missing-local artifact counts and exposed
  local paths/checksums through search/archive readback.
- Operators can tell from API, CLI, MCP, and console readback whether a target
  is configured and running full artifact retrieval.
- The roadmap, runbook, dev journal, and durable fixes log record the final
  evidence.
- Plan 0086 is updated with proof and closed.
