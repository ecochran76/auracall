# Plan0469 — Audit ChatGPT conversation-list call efficiency

State: CLOSED
Owner: primary agent
Branch: research/chatgpt-list-efficiency-20261030
Target: origin/main
Base: 563faa1a7e0e2cb5b334398c245f092c273689e8

## Current State

Research packet complete. Current-source offline probe reproduces redundant
reads, lack of batching across independent invocations, virtualized-row loss,
ignored in-loop cancellation, and omitted recovery options. Findings and limits
are recorded in the linked note. No production fix, installation, live provider
traffic, or rate-limit causal attribution is claimed.

## Scope and completion

Question: where does ChatGPT list-conversations repeat provider-facing work or
perform work without useful progress under concurrent workflows? Primary sources:
current repository implementation, callers, existing regression contracts, and a
hermetic executable probe. Discovery budget: one initial graph flow, two focused
follow-ups, then named unresolved source sections. Stop after a reproducible
algorithm-level accounting and ranked repair sequence; live network attribution
is a separate packet. Do not submit prompts, induce warnings, clear provider
guards, change ownership, or interfere with the other active Grok agent.

Acceptance: map the operation and distinguish CDP from HTTP calls; reproduce
bounded waste offline; cite source and state unproved provider assumptions;
publish one research note and reproducible probe. All met. Research does not
authorize changing authentication freshness, cache semantics or provider limits.

## Evidence

- [Research findings](../notes/2026-10-30-chatgpt-list-efficiency.md)
- [Offline probe](../notes/2026-10-30-chatgpt-list-efficiency-probe.mjs)
- `node docs/dev/notes/2026-10-30-chatgpt-list-efficiency-probe.mjs`: all assertions pass.
