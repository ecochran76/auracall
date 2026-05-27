# Roadmap Governance Hygiene

State: CLOSED
Date: 2026-05-27
Lane: P01

## Context

The roadmap audit on 2026-05-27 found that the planning system is structurally
usable but semantically noisy. `ROADMAP.md` remains the priority map, and
`RUNBOOK.md` remains the turn log, but several governance invariants are weak:

- `ROADMAP.md` still contains many stale absolute links to the old `oracle`
  checkout.
- newer bounded plans 0064 through 0069 use `Status:` instead of the canonical
  `State:` field.
- older `OPEN` plans are mixed with parked or maintenance-only roadmap posture,
  making the current active lane harder to identify.
- the roadmap `Now` section still points at an older Plan 0063 live-follow
  action even after Plans 0071 through 0074 closed.
- `pnpm run plans:audit` passes despite those issues, so the deterministic
  helper does not yet enforce the policy contract.

## Goal

Make the roadmap and plan library reliable enough that a new operator can tell:

- what is active now
- what is parked or maintenance-only
- which plan artifacts are closed history versus active work
- which links are valid within this repo
- which deterministic checks prevent the same drift from returning

## Non-Goals

- Do not reorder the roadmap lanes beyond the minimal correction needed to
  clarify the current active slice.
- Do not reopen closed implementation plans.
- Do not run provider browser work.
- Do not change product behavior or service contracts.
- Do not delete historical plan artifacts merely because they are closed or
  superseded.

## Scope

### 1. Link Hygiene

Replace stale absolute links to the old `oracle` checkout in `ROADMAP.md` with
relative links or current-repo paths.

Acceptance:

- no old-checkout workspace references remain in `ROADMAP.md`
- all roadmap `docs/dev/...` links resolve in the current checkout

### 2. Plan State Header Normalization

Normalize plan headers to the canonical `State:` field for the plan library:

- 0064
- 0065
- 0066
- 0067
- 0068
- 0069

Acceptance:

- every top-level `docs/dev/plans/*.md` plan has a valid `State:` line in the
  header
- the existing state value is preserved unless the roadmap/runbook evidence
  proves it should change in this slice

### 3. Active Versus Parked Plan Reconciliation

Audit older `OPEN` plans against the current roadmap posture. For each plan,
choose one of:

- keep `OPEN` and ensure roadmap `Current State` names why it remains active
- change to `CLOSED` or a parked/maintenance posture when the plan itself says
  no active follow-up remains
- open a new bounded follow-up only if there is a real actionable next slice

Initial candidates:

- `0014-2026-04-14-browser-service-reattach-reliability.md`
- `0020-2026-04-21-deterministic-response-shape-contract.md`
- the old config/team/service-volatility cluster

Acceptance:

- no plan says both `State: OPEN` and "no active follow-up remains"
- roadmap active-lane text and plan states do not contradict each other

### 4. Roadmap Now Section

Refresh `ROADMAP.md` `### Now` so it reflects the current post-0071/0073/0074
state instead of the older Plan 0063 `chatgpt/wsl-chrome-3` instruction.

Acceptance:

- `Now` names one current primary action or explicitly says the next slice is
  this governance cleanup
- it does not direct operators to stale already-completed proof work

### 5. Deterministic Audit Helper

Tighten `scripts/audit-plan-library.ts` so future runs catch:

- missing canonical `State:` headers
- non-canonical state values
- stale absolute repo paths in roadmap/plan links

Acceptance:

- a deliberately current clean run passes
- if practical, a small fixture/unit path proves the new checks catch drift

## Validation Plan

- `pnpm run plans:audit -- --keep 75`
- `git diff --check`
- targeted tests for `scripts/audit-plan-library.ts` if the helper has existing
  test coverage or can be exercised without broad suite cost
- `rg 'workspace[.]local/oracle' ROADMAP.md docs/dev/plans`
- plan-state inventory over `docs/dev/plans/*.md`

## Definition Of Done

- Plan 0075 is wired into `ROADMAP.md`, `RUNBOOK.md`, and the dev journal.
- `ROADMAP.md` no longer points at the old `oracle` workspace.
- all bounded plan files use canonical `State:` headers.
- the active lane and `Now` text agree with the current plan states.
- the deterministic audit helper enforces the newly cleaned invariants.

## Completion Notes

- Replaced stale old-checkout `ROADMAP.md` link targets with repo-relative
  links.
- Normalized plan 0064 through 0069 headers from `Status:` to `State:`.
- Closed historical Plan 0014 after its own current state said no active
  browser-service reliability follow-up remained from that incident.
- Moved Plan 0020 from `OPEN` to `PLANNED` to match the parked
  response-shape-normalization roadmap posture.
- Refreshed `ROADMAP.md` `Now` so the next action points back to the Plan 0063
  lazy account mirror service-mode lane without stale browser-profile proof
  instructions.
- Hardened `scripts/audit-plan-library.ts` so `plans:audit` reports and fails
  on missing canonical `State:` headers, legacy header `Status:`, invalid state
  values, and stale absolute old-checkout workspace paths in roadmap/plan
  surfaces.

## Validation

- `pnpm run plans:audit -- --keep 75`
- `pnpm run typecheck`
- `rg 'workspace[.]local/oracle' ROADMAP.md docs/dev/plans`
- plan-state inventory over `docs/dev/plans/*.md`
- ROADMAP `docs/dev/...` link-resolution check
- `git diff --check`
