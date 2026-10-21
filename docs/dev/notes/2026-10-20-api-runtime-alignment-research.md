# API runtime alignment research

Question: how should the running local API be aligned with the verified CLI runtime?
Bound: read-only local unit/process/API evidence and first-party repository docs/source;
stop at a supported procedure and explicit remaining verification gates. No restart,
installation, provider work or scheduler mutation is authorized by this research.

## Findings

- API PID 50485 runs `user-runtime-plan0411-7070532aa`, while the current CLI wrapper
  selects `user-runtime-issue311-6b07a6c84`. Both report version 0.1.1, so version alone
  does not establish build identity. Sources: `/proc/50485/cmdline` and
  `/home/ecochran76/.local/bin/auracall`, read 2026-10-21T00:57Z.
- API `/status` responds successfully with `ok: true`. At the captured instant,
  foreground activeRequestCount and drainReservations were zero; background drain
  was idle; activeInteractionCount was zero. Scheduler was paused and all 20 active
  completion records were paused (zero queued/running/idle_waiting). These are
  momentary observations, not a reservation or proof that every subsystem is idle.
  Source: GET `http://127.0.0.1:18095/status`, private raw snapshot retained at
  `/tmp/auracall-research-status.json` (ephemeral; repeat the GET for fresh evidence).
- The installed unit executes the CLI wrapper and uses `KillMode=process` and a
  20-second stop timeout. It is configured to preserve managed browser processes
  across API restarts, but this does not prove browser health afterward. Sources:
  `systemctl --user cat auracall-api.service` and
  [service unit generator](../../../scripts/install-user-api-service.ts#L135).
- The documented combined installer rebuilds/reinstalls and restarts the service.
  This is broader than needed when the desired wrapper already exists. The unit's
  ExecStart resolves that wrapper at its next start. Sources:
  [runtime guide](../../user-scoped-runtime.md) and installed unit above.

## Recommendation and remaining gates

Use a controlled API-only restart of the existing unit after freshly verifying
no executing work and reconciling the intended installed build. Do not rerun an
installer merely to change the running process. Capture current process/browser
identities and paused scheduler/completion state first. After restart, verify a
new API PID resolves the intended absolute runtime path, `/status` returns ok,
and paused state remains paused. Independently verify retained managed browser
processes, assignment and readiness; HTTP200 alone is insufficient. Preserve
ownership/warning records and do not resume provider work as part of alignment.
See [runtime proof requirements](../../agents/runtime-proof.md).

No execution acceptance claimed: the research stops before restart. Snapshot
freshness must be renewed at execution time. Source/runtime parity and startup
compatibility remain execution gates. No need for external web sources: local
process evidence, first-party status API and repository source own these claims.

Memory disposition: forbidden; no explicit user request to save memory.
