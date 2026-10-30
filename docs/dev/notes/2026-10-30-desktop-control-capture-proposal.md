# Optional desktop admission failure capture

Status: PROPOSED_ONLY; not implemented, installed or enabled.
Source authority: diagnosing-bugs Phase1 when a trustworthy loop is unavailable.

The guarded read and full unchanged installed selector now pass. The historical
refusal has no contemporaneous owner snapshot, so no causal fix is qualified.

## Exact proposed capture

At terminal refused admission in
`src/browser/service/desktopControlGate.ts::withAutomation`, record once for the
failed operation, without changing the original error or gate behavior:

- timestamp, rejection category, requested automation/human role;
- owner role, numeric PID, acquisition timestamp, same-boot PID liveness;
- SHA256 of requested and observed binding, whether they match;
- whether an inherited automation scope exists and matches the current process;
- attempt count and whether caller cancellation was supplied.

Never record owner.id or human control tokens, raw bindings, credentials, process
arguments, page text, URLs or a DOM dump. Write an owner-only0600 bounded JSON
file under `~/.auracall/diagnostics/desktop-control/` using a unique
`DEBUG-desktop-control-busy` tag. Enable only by explicit temporary opt-in;
retain at most one terminal failure receipt per operation. Capture failure must
not mask the original refusal. Do not acquire, release, override or delete a
production ownership record as part of capture.

Before installation, source-only controlled contention fixtures must prove the
exact rejected public gate call creates the allowlisted receipt, token canaries
never escape, success creates no receipt, and original error/ownership remain.
No research prompt or browser restart is included. Remove the temporary capture
and tag after a qualified failing observation and diagnosis.

Operator approval is required before adding this temporary production capture.
A user-supplied failure-time owner snapshot is an alternative evidence source.
