# Project And Roadmap 360 Review | 2026-04-20

## Scope

This review covers the current Aura-Call project and roadmap posture across:

- repository architecture
- runtime/team execution model
- testing and live-proof posture
- roadmap/plan governance
- operational risk
- next sequencing decision

Primary evidence came from:

- `ROADMAP.md`
- `RUNBOOK.md`
- `docs/dev/plans/*.md`
- `package.json`
- `src/runtime/*`
- `src/teams/*`
- `src/config/*`
- `tests/*`

## Executive Summary

Aura-Call has crossed from exploratory browser/API automation into a real
runtime/orchestration product. The strongest assets are the durable execution
contracts, the breadth of regression coverage, and the discipline around
provider volatility and live-test gating.

The main project risk is not lack of implementation. It is roadmap ambiguity:
too many plans remain `OPEN`, several roadmap lanes are effectively
maintenance-only but still appear active, and the next product step can be read
three different ways depending on whether the reader starts from `ROADMAP.md`,
`0001`, or the recent `0004` checkpoint.

The next best move is a roadmap-pruning and sequencing slice, not another
normalization or service hardening slice.

## Highest-Impact Findings

### 1. Roadmap State Is No Longer Tight Enough For Execution

Severity: high.

Evidence:

- `ROADMAP.md` says the next decision is product sequencing and marks several
  tracks as in progress.
- `docs/dev/plans/0001-2026-04-14-execution.md` says the current migration
  audit result is `keep = 14`.
- Current `pnpm run plans:audit` reports `Candidates: 18` and `keep=18`.
- Current plan states show 13 open canonical plans and 5 closed canonical
  plans:
  - open: `0001`, `0002`, `0003`, `0004`, `0006`, `0007`, `0008`, `0009`,
    `0010`, `0011`, `0012`, `0013`, `0014`
  - closed: `0005`, `0015`, `0016`, `0017`, `0018`

Impact:

- Operators cannot easily tell which `OPEN` plans are truly active versus
  maintenance-only.
- The roadmap still advertises multiple simultaneous "in progress" lanes even
  after recent checkpoints explicitly parked several of them.
- This increases the chance of continuing implementation by inertia.

Recommendation:

- Do one explicit roadmap-pruning slice:
  - close or mark maintenance-only the plans that already say they are parked
  - update `0001` audit counts from `14` to the current `18`
  - reduce the active execution board to one primary next lane and at most two
    maintenance lanes

### 2. The Product Is Ready For A Sequencing Decision, Not More Contract Mining

Severity: high.

Evidence:

- `0004` now states the deterministic response-shape enforcement checkpoint is
  complete for:
  - team-only assignment identity
  - local-action request aliases
  - handoff transfer payloads
  - provider/local-host artifact refs
  - persisted `response.output` item projection
- Recent commits added and then checkpointed those normalizers:
  - `f367c558 runtime: normalize local action request aliases`
  - `d7f6a10a runtime: normalize handoff task transfers`
  - `5f8e3dcb runtime: normalize artifact refs at ingress`
  - `fcfa9d1f runtime: normalize response output items`
  - `a9b2a569 docs: checkpoint response shape contract`

Impact:

- Continuing to mine adjacent seams now risks over-normalizing intentionally
  open payloads, especially local-action result payloads and arbitrary
  structured-output keys.
- The architecture needs a product choice:
  - push service/runner orchestration deeper
  - expose more external control surfaces
  - prune legacy/config/browser roadmap debt first

Recommendation:

- Treat the response-shape lane as parked.
- Require a reproduced mismatch, a public routing/error-handling need, or a
  host-handoff requirement before reopening it.

### 3. Runtime Architecture Is Coherent But Concentrated In Large Files

Severity: medium-high.

Evidence:

- Large central files:
  - `src/runtime/runner.ts`: 2,133 lines
  - `src/runtime/serviceHost.ts`: 2,064 lines
  - `src/config/model.ts`: 1,406 lines
  - `src/http/responsesServer.ts`: 1,321 lines
  - `src/teams/model.ts`: 1,064 lines
  - `src/runtime/apiModel.ts`: 743 lines
- Runtime and team entities are now well-defined in:
  - `src/runtime/types.ts`
  - `src/teams/types.ts`
  - `src/runtime/schema.ts`
  - `src/teams/schema.ts`

Impact:

- The architecture is conceptually clean, but behavior is accumulating in a
  few orchestrator files.
- Multi-runner or external API/MCP writes will become harder to reason about
  unless the next implementation slices extract narrow components instead of
  adding more branches to existing files.

Recommendation:

- Before multi-runner work, split one or two stable subdomains out of
  `runner.ts` / `serviceHost.ts`:
  - local-action outcome handling
  - readback summary builders
  - recovery/claim classification helpers
- Keep the public behavior unchanged during extraction.

### 4. Test Coverage Is A Major Strength, But The Signal Is Fragmented

Severity: medium.

Evidence:

- Test tree contains roughly 212 test files.
- Ripgrep counted roughly 1,897 `describe` / `it` / `test` declarations.
- Runtime/team/HTTP control surfaces have focused suites:
  - `tests/runtime.*.test.ts`
  - `tests/teams.*.test.ts`
  - `tests/http.responsesServer.test.ts`
  - `tests/cli/teamRunCommand.test.ts`
  - `tests/cli/runtimeInspectionCommand.test.ts`
- `docs/testing.md` explicitly separates:
  - stable live baseline
  - extended matrix
  - flaky-but-informative probes

Impact:

- Regression safety is strong.
- However, routine validation is increasingly hard to choose because there are
  many focused suites and a large opt-in live matrix.
- This matters before release or before broad control-surface expansion.

Recommendation:

- Add a small "release confidence matrix" doc section or script target:
  - contract-only changes
  - runtime/team changes
  - HTTP/API changes
  - browser-provider changes
  - release candidate
- Keep live tests opt-in, but make the recommended smoke set one command per
  change class.

### 5. Provider/Browser State Is Correctly Treated As Volatile, But Operational Weight Is High

Severity: medium.

Evidence:

- `docs/testing.md` records provider-specific manual and opt-in posture:
  - Gemini exported-cookie/manual-auth constraints
  - anti-bot/captcha hard stops
  - rate-limit modal handling
  - provider-specific cooldown behavior
- `~/.auracall` is currently about 33 GB on this machine.
- Browser/profile plans still include maintenance around profile family,
  reattach reliability, and service volatility.

Impact:

- The project has the right architecture boundary: provider state is evidence,
  not orchestration truth.
- Operationally, provider state and caches are already heavy enough to require
  lifecycle policy.

Recommendation:

- Add a bounded cache/profile operations checkpoint before another big live
  provider push:
  - size reporting
  - safe pruning policy
  - per-profile cache health
  - "what can be deleted" operator guidance

### 6. Public Surface Strategy Needs A Fresh Gate

Severity: medium.

Evidence:

- The roadmap says external control surfaces are "Soon".
- `0001` and `0004` repeatedly say broader public team execution writes remain
  paused on HTTP/MCP.
- Current public/read surfaces are intentionally bounded:
  - `GET /v1/runtime-runs/inspect`
  - `GET /v1/team-runs/inspect`
  - `GET /v1/responses/{response_id}`
  - `auracall teams inspect`
  - `auracall teams review`
- The write surface exists as bounded CLI:
  - `auracall teams run`

Impact:

- API/MCP expansion is tempting now because the readback contract is stronger.
- But widening writes before the roadmap explicitly chooses the next service
  ownership model would likely create long-lived compatibility debt.

Recommendation:

- Keep HTTP/MCP team writes paused.
- If external surfaces become the next priority, start with a read-only parity
  checklist and an auth/audit model, not write execution.

## Strengths

- The core layering is now coherent:
  - browser profile
  - AuraCall runtime profile
  - agent
  - team
  - task/run spec
  - service/runners
- Team/run-spec/runtime separation is materially better than the original
  `team == executable input` risk.
- The deterministic readback envelope is now concrete enough for routing and
  automation clients.
- The repo has unusually strong testing discipline for a browser-heavy tool.
- Provider volatility is being isolated instead of allowed to define the
  orchestration model.
- Recent commits are small, coherent, and reviewable.

## Weaknesses

- Too many roadmap lanes remain simultaneously open.
- Some active docs contain stale counts or pre-checkpoint wording.
- Large orchestrator files are becoming future change bottlenecks.
- `RUNBOOK.md` is useful historically but not a concise current-state entry
  point.
- Live-test confidence depends heavily on machine/account/browser state.
- Cache/profile storage pressure is visible and should not remain implicit.

## Recommended Next Roadmap Slice

Title:

- `docs: prune roadmap execution board`

Acceptance criteria:

- `ROADMAP.md` has exactly one primary "Now" implementation lane.
- Each `OPEN` plan is classified as:
  - active
  - maintenance-only
  - parked pending reproduced mismatch
  - superseded/closed
- `0001` current audit counts match `pnpm run plans:audit`.
- Plans with completed checkpoints are either closed or explicitly
  maintenance-only in their first `Current State` block.
- `RUNBOOK.md` gets one current-state turn entry pointing to the new active
  lane.
- No runtime behavior changes.

Best next active lane after pruning:

- Service/runner orchestration beyond the current single-host bounded
  local-runner bridge, but only after the execution board is pruned.

Reason:

- The runtime/team/task foundation is already the deepest product line.
- It unlocks later external API/MCP writes without forcing those surfaces to
  invent semantics.
- It should happen before provider expansion or retrieval/search work.

## Watchlist

- Do not reopen response-shape normalization without a concrete mismatch.
- Do not widen HTTP/MCP team writes until service ownership is chosen.
- Do not start multi-runner execution until liveness, affinity, and recovery
  semantics have one written checkpoint for multi-process behavior.
- Do not let provider service-state probes control runner execution directly.
- Do not treat `agents.<name>.defaults` as live execution semantics until a
  typed workflow-defaults contract exists.

## Machine-Readable Handoff

```json
{
  "task_type": "mixed-code-docs synthesis",
  "path_type": "stable local git repo",
  "persistence_mode": "repo-local report",
  "repo_profile": {
    "name": "auracall",
    "package_version": "0.8.4",
    "runtime": "Node >=22",
    "source_files_approx": 212,
    "test_files_approx": 212,
    "canonical_plan_files": 18
  },
  "retrieval_posture": "hybrid",
  "top_findings": [
    {
      "severity": "high",
      "finding": "Roadmap state is too broad for execution; many plans remain OPEN despite maintenance-only checkpoints."
    },
    {
      "severity": "high",
      "finding": "Response-shape normalization should stop unless a new concrete mismatch appears."
    },
    {
      "severity": "medium-high",
      "finding": "Runtime orchestration is coherent but concentrated in very large files."
    },
    {
      "severity": "medium",
      "finding": "Validation coverage is strong but needs clearer change-class targets."
    },
    {
      "severity": "medium",
      "finding": "Provider/browser state is properly bounded but operationally heavy."
    }
  ],
  "best_next_action": "Run a doc-only roadmap-pruning slice before more implementation.",
  "state_location": "docs/dev/reviews/2026-04-20-project-roadmap-360.md",
  "persistence_bundle": null
}
```
