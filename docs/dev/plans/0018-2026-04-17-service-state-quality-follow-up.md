## Service-State Quality Follow-Up Plan | 0018-2026-04-17

State: CLOSED
Lane: P01

## Current State

- the live runtime-inspection `serviceState` seam is implemented and
  live-validated across:
  - ChatGPT on the managed browser path
  - Gemini on browser-backed runtime profiles
  - Grok on browser-backed runtime profiles
- the provider-breadth checkpoint is complete:
  - active browser-backed Gemini and Grok runs can surface executor-owned
    `thinking`
  - terminal runs still return honest `unavailable`
- the remaining gap is quality, not coverage:
  - ChatGPT already exposes richer live mid-turn progression on the seam
  - Gemini and Grok still rely primarily on executor-owned `thinking` during
    active runs unless provider-owned page evidence becomes visible

## Purpose

Improve the quality of live mid-turn provider state on the existing
runtime-inspection seam without widening `/status`, adding generic runtime
DOM polling, or changing durable orchestration ownership.

## Problem Statement

The current seam is good enough to answer "is the provider actively working?"
but still weaker at answering "what phase is the provider visibly in right now?"
for Gemini and Grok.

That leaves a bounded follow-up:

- keep the current run-scoped API/CLI contract
- keep provider evidence provider-owned
- deepen richer mid-turn state only where the provider seam can support it

## Design Goals

- keep `serviceState` opt-in and read-only
- preserve the current separation from `/status`
- improve richer mid-turn state only on the existing seam
- prefer provider-owned evidence over generic heuristics
- keep honest `unknown` or `unavailable` posture when richer evidence does not
  exist

## Non-Goals

- no new top-level API route
- no widening of `/status`
- no background watcher or polling daemon
- no generic runtime-owned DOM polling contract
- no requirement that Gemini and Grok reach identical state richness in the
  same slice

## Finite Implementation Plan

### Slice 1: Close provider-breadth checkpoint and define quality lane

Status: implemented

Goal:

- close the provider-breadth phase and open one bounded quality-focused
  follow-up plan

Acceptance criteria:

- the prior provider-breadth plan is closed
- roadmap and runbook point to this new quality lane
- the quality problem is stated narrowly as richer mid-turn state on the
  existing seam

### Slice 2: Gemini richer mid-turn states on the existing seam

Status: completed with bounded negative evidence

Goal:

- improve Gemini live `serviceState` beyond executor-owned `thinking` where
  stable provider-owned evidence exists

In scope:

- validate whether Gemini can expose reliable `response-incoming`
- validate whether Gemini can expose reliable `response-complete`
- keep executor-owned `thinking` as the active fallback when page evidence is
  absent

Acceptance criteria:

- at least one richer Gemini state beyond `thinking` is live-proven on the
  current seam, or
- the repo records explicit evidence that Gemini cannot currently support that
  state reliably on this machine/profile
- the seam still returns honest `unknown` when richer evidence is absent

Verification:

- targeted browser live-service-state tests
- targeted runtime-inspection HTTP tests
- one bounded live `api serve` Gemini proof

Current evidence:

- bounded live `api serve` Gemini quality attempts on this machine/profile
  still showed:
  - active `thinking` via executor-owned `gemini-web-request-started`
  - then fast failure or terminal `unavailable` before any stable
    provider-owned `response-incoming` / `response-complete` signal appeared
- direct DOM inspection on the same managed Gemini browser profile during this
  lane still showed the idle/home surface rather than active answer text:
  - visible page text remained at the generic home prompt level
  - no stable answer-bearing chat history signal was available for the live
    inspection seam to consume
- conclusion for this checkpoint:
  - do not invent richer Gemini states from generic heuristics on this
    machine/profile
  - keep executor-owned `thinking` as the honest active fallback

### Slice 3: Grok richer mid-turn states on the existing seam

Status: completed with bounded negative evidence

Goal:

- improve Grok live `serviceState` beyond executor-owned `thinking` where
  stable provider-owned evidence exists during active runs

In scope:

- validate active `response-incoming` on a successful live Grok run
- validate whether visible rate-limit or provider-error posture should surface
  directly during active inspection
- preserve executor-owned `thinking` as the active fallback

Acceptance criteria:

- at least one richer active Grok state beyond `thinking` is live-proven on the
  current seam, or
- the repo records explicit evidence that the current Grok surface does not
  expose that state reliably
- terminal runs still return explicit `unavailable`

Verification:

- targeted browser live-service-state tests
- targeted runtime-inspection HTTP tests
- one bounded live `api serve` Grok proof

Current evidence:

- tightened Grok precedence so provider-owned visible answer state can override
  transient executor-owned `thinking` when it is actually present
- bounded live `api serve` Grok quality proof on this machine/profile still
  showed:
  - active `thinking` via executor-owned `grok-prompt-submitted`
  - then terminal `unavailable` after successful completion
  - no stable provider-owned `response-incoming` signal was observed during the
    active polling window
- conclusion for this checkpoint:
  - keep Grok executor-owned `thinking` as the honest active fallback on this
    machine/profile
  - retain the stricter precedence logic so provider-owned visible answer state
    can win if a future live run actually exposes it

## Definition Of Done

- one bounded follow-up plan existed for service-state quality validation
- roadmap and runbook treat provider breadth as complete
- richer Gemini/Grok quality work was evaluated on the existing
  `serviceState` seam
- `/status` and durable review-ledger ownership remain unchanged

## Post-Close Maintenance Notes

- 2026-04-23: The service-state probe now centralizes shared LLM observation
  construction while keeping provider-specific DOM evidence in provider
  adapters. Gemini's active lottie/avatar spinner is a high-confidence
  `thinking` signal, and a visible `Stop response`/cancel control is treated as
  stale once generated media is visible.
- 2026-04-23: Gemini activity evidence selectors now live in a single
  provider-owned helper shared by service-state probing and media prompt
  readback, so spinner/media/stop-control semantics do not drift between text
  and media workflows.
- 2026-04-23: Grok assistant/rate-limit evidence now lives in a provider-owned
  helper shared by response waiting and service-state probing, keeping
  visible-answer and provider-error semantics ready for future Grok media work.
- 2026-04-23: ChatGPT thinking and stop-control evidence now lives in a
  provider-owned helper shared by browser-run passive observations and
  service-state probing, completing the provider evidence centralization pass
  across ChatGPT, Gemini, and Grok.
