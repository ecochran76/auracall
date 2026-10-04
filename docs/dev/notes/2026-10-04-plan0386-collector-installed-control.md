# Issue165 installed collector control

Canonical PR186 merge 7ca6db49d installed successfully. Collector SHA-256
 a5ab95c0d3cee5075d7793a82d6cdf3477077c397b514791c8114d1b30f3f01e
and scheduler SHA-256
 b3782f812c24ea88133a39f59570d70e0306e47c228cf48bae6a258740a68b5c
match the canonical build. Restarted API PID9059 was active.

Single paused scheduler control submitted 2026-10-04T19:13:28.815Z.
Request acctmirror_fe2e3641-0946-4fcd-b0e7-845cb5334dcd failed with
WebSocket readyState3 CLOSED; current refresh-blocked receipt correctly
replaces stale dry-run evidence. Observer recorded 504 requests, four documents
and no warnings. Browser holder terminated after cleanup.

Fresh Bailey context receipt succeeded at 19:15:34.905Z, attemptCount1,
timeoutMs360000, elapsedMs116033, lastStage complete. Thus this control
proves a successful fresh read, not another navigation timeout.

Structural source shows completeSuccess reuses the last warning probe context
after the collector closes its provider session. This is the next local
reproduction target; lifecycle repair and original live acceptance remain open.
Private full receipt: /tmp/auracall-pr186-scheduler-live-pass-control.json.
Scheduler remains paused. No repeat live control is justified before repair.
