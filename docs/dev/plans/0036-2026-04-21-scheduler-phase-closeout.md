# Scheduler Phase Closeout | 0036-2026-04-21

State: CLOSED
Lane: P01

## Scope

Close the current scheduler local-control phase after Plans 0027-0035 added
runner topology readback, read-only scheduler authority, explicit local claim
control, and local-owned active lease drain follow-through.

This checkpoint decides whether to add an operator-facing compound control now.

## Current State

- `/status.runnerTopology` exposes read-only local runner readiness.
- Runtime and CLI inspection expose read-only scheduler authority evidence.
- `schedulerControl.action = "claim-local-run"` can explicitly claim or
  reassign one scheduler-authorized run to the server-local runner.
- `runControl.action = "drain-run"` can execute runnable work already leased by
  that same server-local runner.
- `claim-local-run` and `drain-run` together provide explicit operator
  claim-then-execute follow-through without adding a scheduler loop.
- Full validation after Plan 0035 passed:
  - `pnpm test`
  - `pnpm run check`
  - `pnpm run plans:audit -- --keep 35`
  - `git diff --check`

## Decision

- Do not add `claim-and-drain-local-run` or another compound control now.
- Keep the operator workflow explicit:
  - inspect scheduler authority
  - claim the local run
  - drain the run when immediate execution is desired
- Keep fleet scheduling, background worker loops, non-local assignment,
  parallel execution, and browser dispatcher bypass deferred.
- Treat the scheduler local-control phase as closed unless a concrete operator
  workflow shows that the two-step control is too noisy or error-prone.

## Rationale

- The two-step flow preserves clear audit boundaries:
  - scheduler control mutates lease ownership
  - run control executes one targeted host pass
- Existing HTTP remains a mapper; service-host and stored-step ownership stay
  intact.
- A compound action would mostly reduce operator round trips, not unlock a new
  capability.
- Deferring the compound action avoids another public control shape until there
  is evidence that it is needed.

## Validation

- `pnpm run plans:audit -- --keep 36`
- `git diff --check`

## Next Slice

Pause scheduler local-control work and return to the broader service/runner
orchestration roadmap. The next implementation should not add scheduler
mutation unless a new concrete mismatch is reproduced.
