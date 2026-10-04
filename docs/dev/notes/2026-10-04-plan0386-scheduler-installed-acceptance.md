# Issue165 installed scheduler recovery acceptance

Canonical PR187 merge 530cdc808 installed with affinity artifact SHA-256
95cea280f3b943b757661f6d1068448b0da1e33f3e7a1bcdc8ae42c6be5bbd75.
Restarted API PID88145 was active. First run-once was skipped because the
480000ms failure backoff had not yet expired; no refresh happened. That receipt
was preserved. A subsequent dry run proved exactly one selectable target.

One eligible installed run-once completed successfully, request
acctmirror_3c71c4f4-2f29-43ac-9ddc-2c9fda7c8432. Final warning check succeeded and identity matched.
Observer recorded 526 requests, four documents and no warnings. Initial browser
startup is excluded. The collector completed one detail read and persisted its
yielded cursor within the provider interaction budget. Backpressure text says
queued work; durable yieldCause identifies provider-interaction-budget.

This proves installed recovery and final warning lifecycle, not changed/unchanged
planner acceptance: requested detail phase bypasses that planner. Scheduler
remains paused; automatic selection and scheduler resume remain open. Curated
evidence is in the adjacent JSON; private full evidence remains in
/tmp/auracall-pr187-scheduler-live-pass-control.json.

## Requested-phase automatic selection repair

A full collector regression reproduced detail recovery reading changed, retained
partial, and unchanged complete rows instead of reading only changed. The
steady-follow requested phase bypassed the deterministic planner. It now uses
the same planner, with original cached catalog rows forwarded by refreshService
to preserve index fingerprints. Frontier evidence and filtered cursors track
the resulting selection; incomplete chunk cursors remain supported. Explicit
full_sweep keeps its comprehensive semantics.

110 focused collector/refresh/scheduler tests pass in 2.09 seconds, no retries.
The extended regression includes a prior cursor beyond the remaining selected
row and proves that changed content is still read. Installed acceptance of
this source repair remains pending; scheduler remains paused.
