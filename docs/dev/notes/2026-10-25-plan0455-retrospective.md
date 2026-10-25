# Plan0455 repair and deployment retrospective

Reviewed the visible session from the desktop-transition diagnosis through
deployment and the first memory reconciliations. Accepted source/deployment
record:4ffe87be25d53dc5ec309ba011a7b53882f11bcf. Repository files were
cross-checked during this review; private deployment receipts were reduced to
[non-secret evidence](2026-10-25-plan0455-retro-evidence.json). This is a
recommendation packet. CI is explicitly excluded; no workflow inspection,
runtime changes, broader access or cross-repository implementation is included.
This review does not establish current application health after that interval.

## 1. High — Use one explicit deployment readiness contract

**Evidence.** The existing
[compiled runtime verifier](https://github.com/ecochran76/auracall/blob/4ffe87be25d53dc5ec309ba011a7b53882f11bcf/scripts/verify-runtime-contract.ts#L18)
starts an isolated server with maintenance disabled and checks `/desktops`.
The [installer already invokes it](https://github.com/ecochran76/auracall/blob/4ffe87be25d53dc5ec309ba011a7b53882f11bcf/scripts/install-user-runtime.ts#L127);
the missing surface is stateful deployment readiness, not a missing verifier.
After promotion, the desktop page returned200 while `/status` failed a loop
of3s requests and a separate8s request. A subsequent single35s-budget request
returned200/ok=true in5.649s; the public CLI status command passed with15s.

**Consequence.** Changing time budgets and repeatedly issuing status reads made
the deployment gate unclear and generated extra work while readiness was
unqualified. The record does not prove those reads caused the latency, that
cold startup caused it, or that a steady-state regression exists. A3s budget
would reject the later5.649s response, but that does not explain every failure.

**Proposal.** Extend the existing deployment procedure with explicit static-route
and stateful-status gates. Measure before and after with the same declared
budget. Allow one status request at a time, a bounded overall deadline and a
defined rollback decision; record the actual owned probe PID/log/result path.
Keep the isolated verifier provider-free. Its fixture cannot qualify the
operator store's latency; retain a separate post-restart readback. Reuse the
existing wrapper backups and auth/scheduler/browser-preservation checks.

**Cheapest verification.** A local HTTP fixture returns a healthy static page
while status is delayed, malformed or unhealthy. The helper must withhold
promotion acceptance, keep maximum in-flight status probes at1, and stop at its
deadline without an additional request. Verify rollback behavior without
starting a provider or touching operator state. **Maintenance cost:** medium;
one shared deployment helper and focused transport-contract tests.

## 2. Medium — Give concurrent reconciliation receipts unique paths

**Evidence.** Two independent `remember-reconcile` calls in the same second
both returned `20261025T025559Z-reconciliation.json` as their automatic receipt
filename. One filesystem path could retain only one result. The host transcript
retained both responses and the original queued-write receipts were intact.
The existing `--receipt-path` flag subsequently produced distinct files.

**Consequence.** Default local receipt naming lost one standalone reconciliation
artifact. This is an observability collision, not evidence of lost server jobs,
cross-cloud disclosure or failed extraction. Both writes were accepted and
reconciled as running; neither was repeated.

**Proposal.** Use an explicit per-job receipt path immediately, as the session
eventually did. Separately scope a Graphiti-runtime change so its default name
includes a job UUID or another collision-resistant suffix. Keep that change in
its owning repository; do not add AuraCall-specific flags or more global
instructions. Queue acceptance remains sufficient for ordinary closeout;
reconcile to answer a concrete custody question rather than polling extraction.

**Cheapest verification.** Freeze the timestamp and reconcile two metadata
fixtures concurrently. Both returned paths and persisted job identities must
remain distinct. No model call or memory write is needed. **Maintenance cost:**
low; a filename-generation fix and deterministic fixture in the owning runtime.

## 3. Medium — Reuse a process-tree census for preservation checks

**Evidence.** The initial census treated Chrome command lines without `--type`
as roots and counted248. The retained process snapshot, grouped by parent PID,
contained48 browser-related process-tree roots. These were separate captures,
so the entire difference cannot be attributed to one cause. Final verification compared
those48 roots' process start times and found all48 retained. Source tests also
already cover [scrubbed process command lines](https://github.com/ecochran76/auracall/blob/4ffe87be25d53dc5ec309ba011a7b53882f11bcf/tests/browser/nativeDesktopCdp.test.ts).

**Consequence.** Different classification methods and capture times produced
incompatible root counts. Root components are not a count of configured browsers,
and their preservation is not a resource-health or orphan-free assertion.

**Proposal.** Reuse a bounded census helper that records PID, parent PID,
process start identity and resource totals. Derive process-tree roots from
parent relationships; use managed-browser receipts when asserting browser
inventory. Keep renderer/crash-handler components separate and preserve
unknown classifications. Store raw process evidence privately and publish only
the bounded comparison.

**Cheapest verification.** A saved process-table fixture includes scrubbed
arguments, a browser parent/renderer pair and a reused PID with a new start
time. The comparison must retain the correct root count and reject the reused
generation. **Maintenance cost:** low to medium; a reusable census and one
fixture, rather than another browser launch or soak.

## Retained lessons and scope

The diagnosis built an actual red child-crash loop before the fix and isolated
the orphaned transition. The child initially could exit naturally while parked;
its IPC keepalive and asserted SIGKILL now protect the existing fixture. These
are already implemented safeguards, not new follow-up tickets. Original error
and green acceptance evidence remain in Plan0455.

Existing typecheck, lint and test commands caught concrete syntax/type/style
issues during implementation. No additional coding-standard rule is proposed.
Large combined reads and empty-output polling also repeated despite the
existing [bounded-discovery policy](https://github.com/ecochran76/auracall/blob/4ffe87be25d53dc5ec309ba011a7b53882f11bcf/docs/dev/policies/0005-planning-discipline.md#L5).
Apply that policy with focused excerpts and compact result files; do not enlarge
AGENTS.md to restate it.

Recommended first packet: the deployment readiness helper. Keep receipt naming
and process census independently scoped. No implementation is authorized by
this report alone. Validation: source/receipt reconciliation, JSON parsing,
docs listing and whitespace checks. Closeout disposition: queued to
`auracall_main`; queue acceptance does not establish processing or retrieval.
