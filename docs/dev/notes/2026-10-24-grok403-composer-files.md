# Grok exact composer files — #403

Source implementation for Plan0452 T05, based on frozen base `87c4910ba`.
No installed or live provider acceptance. The controlled DOM fixtures exercise
actual evaluated browser algorithms; their structure is synthetic and sanitized.

The public `grok_files` operation accepts `context`, `recent`, `select` with an
exact `id`, or `upload` with local `paths`; an optional `runtimeProfile` selects
configured authority. All wrappers use `GrokFilesRequestSchema` and the same
`createGrokFilesService` operation. Coordinator-owned registration and configured
resolver wiring are required. This operation attaches files without submitting a
prompt. Existing text-prompt local attachments use the same readiness algorithm.

`context` reports selected composer file IDs, readiness, project/conversation
context, native input accept/multiple limits and visible composer limit/error
text. Unknown limits remain null; no provider quota is invented. `recent` opens
Attach → Recent files and returns observed provider IDs with explicitly partial
visible coverage. Names are display information, never selectors. Repeated names
with distinct IDs can be selected unambiguously; duplicate IDs fail closed.

Local upload binds the sole visible composer and exact native file input before
setting paths. It verifies native selection names and requires newly observed
stable file IDs in that same composer plus explicit ready evidence. Progress,
error, unknown state, missing identity, changed project/conversation context and
missing confirmation cannot satisfy readiness. It never reads the entire page
for a filename and never proceeds anyway. The command returns a structured
`unconfirmed` outcome when effect custody is unknown; reconcile before retrying.
The source readiness algorithm currently accepts explicit ready/complete/success/
uploaded state or aria-busy=false, while progress/error evidence takes precedence.
DOM drift without this evidence intentionally stops acceptance.

The service uses the existing configured Grok connection, requires a Grok traffic
governor with native backend admission and exact target attribution, and checks
configured provider session authority before and after the operation. It settles
operations through that governor. Unknown mutation outcomes retain an owned tab
for reconciliation while closing the transport. Public errors omit raw transport
messages and local paths. Successful envelopes retain hashed provider account,
exact browser target, composer, project/conversation and provider file identity;
no artifact-byte materialization or provider persistence is claimed.

Validation seam: controlled CDP transport running real DOM expressions, governed
service and shared CLI/MCP handlers. Red→green commands:

- `pnpm vitest run tests/browser/grok403Files.test.ts`: original basename-only
  implementation resolved instead of rejecting; replacement rejected unconfirmed
  upload (green).
- Same command with `-t 'native selection mismatch'`: ready was falsely reported
  for wrong native selection (red); exact native-name verification passed (green).
- Same command with `-t 'changing project'`: ready was falsely reported after a
  project switch (red); baseline context fence passed (green).

Focused final selection also includes existing `grokActions.test.ts` and
`grok402Text.test.ts`. Further tests cover actual recent ID selection with duplicate
basenames, progress/readiness, exact errors, lost composer, governed public CLI/MCP
upload, missing governor and unknown-effect target retention. Source typecheck and
focused lint are required before integration. Live UI readiness attributes, current
recent-file identity attributes, installed wrappers and provider acceptance remain
separate unexecuted gates. Do not infer them from these fixtures.

Memory disposition: forbidden — no explicit memory-write authorization; this
repository implementation note is the decision and validation record.
