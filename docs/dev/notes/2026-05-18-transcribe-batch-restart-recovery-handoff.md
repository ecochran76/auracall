# Transcribe-Audio Batch Restart Recovery Handoff

Date: 2026-05-18

## Summary

`transcribe-audio` reran the first-pass transcript-intake path against the
project-bound SoyLei Transcripts ChatGPT agent after the target-bound browser
fix. A three-item response batch eventually completed and all three
`first_pass_readout.json` artifacts were materialized, but the live operator
surface exposed inconsistent intermediate states during and after an AuraCall
service restart.

The remaining AuraCall owner boundary is not prompt quality or artifact
surfacing. It is response-batch/run-state reconciliation around browser-backed
runs that temporarily lose their active lease, receive a cancel request, or are
read while child state is partially written.

## Source Workflow

- Caller repo: `/home/ecochran76/workspace.local/transcribe-audio`
- Caller runbook checkpoint: `RUNBOOK.md` Turn 106
- Caller commit recording the mid-run boundary:
  `e927efe Record AuraCall batch recovery boundary`
- Runtime env used by caller:
  `/home/ecochran76/.local/state/transcribe-audio/auracall-transcripts.env`
- Model: `agent:pro-extended-chatgpt-soylei-transcripts`
- Runtime profile: `wsl-chrome-3`
- Service/account tenant: SoyLei ChatGPT Transcripts project
- Batch manifest:
  `/home/ecochran76/.local/state/transcribe-audio/auracall-batches/first-pass-summary-20260518-085533.json`
- Batch id: `batch_baec0e7666d143a283a01a4f4828507d`
- Batch limits: `maxConcurrentRuns=1`,
  `maxBrowserInteractionsPerMinute=8`

## Final Batch State

Final readback after the earlier inconsistent state:

```json
{
  "status": "completed",
  "counts": {
    "total": 3,
    "completed": 3,
    "failed": 0,
    "cancelled": 0,
    "missing": 0,
    "in_progress": 0
  },
  "materialized": 3,
  "materialization_errors": 0
}
```

Completed children:

- `resp_81b34938e9694aa9aaf19198cfe8cf89`
- `resp_7504789aba714119b23903bfbbed4adf`
- `resp_3c57d99d2e5e4601970149345dfab749`

Materialized readouts:

- `/home/ecochran76/.transcripts/legacy-artifacts/ff/ff13b2fc131bfca2eb12-2026-02-20 13-30 Meet with Eric (ryan jaggar) My recording 60.readout.json`
- `/home/ecochran76/.transcripts/legacy-artifacts/c7/c72a9a2433cfe9027b83-2025-08-20 Nacu Eric Line of Business follow up meeting My recording 19.readout.json`
- `/home/ecochran76/.transcripts/legacy-artifacts/62/62b0e1928e29f2f6e4db-2025-09-26 SoyLei Scott Roberts Nacu Austin My recording 32.readout.json`

## What Worked

- The project-bound agent was used successfully:
  `agent:pro-extended-chatgpt-soylei-transcripts`.
- The first child completed normally and surfaced
  `sandbox:/mnt/data/first_pass_readout.json`.
- The two later children eventually reached `completed` through API readback
  and were materializable by the caller.
- This confirms the artifact contract is viable for multi-item first-pass
  transcript batches when the browser runner eventually converges.

## Observed Failure Shape

During the second response, AuraCall logged:

```text
Received SIGTERM; leaving Chrome running (assistant response pending)
Session still in flight; use your reattach command to continue.
```

After the service came back, the caller observed states that looked terminally
unsafe from the outside:

- `resp_7504789aba714119b23903bfbbed4adf` was API-visible as `in_progress`
  with `output=[]` and no error, while its runtime record showed `running`,
  `lease expired`, and no active lease.
- `cancel-run` for `resp_7504789aba714119b23903bfbbed4adf` returned HTTP 409:
  `run has no active lease to cancel`.
- `resp_3c57d99d2e5e4601970149345dfab749` was API-visible as `in_progress`
  with `output=[]` and no error after a cancellation attempt; its runtime
  record still showed `running` even after `lease released: cancelled`.
- A status/materialization poll briefly failed with:
  `Expected double-quoted property name in JSON at position 1048544`.

Later readback showed both runs had actually succeeded:

- `resp_7504789aba714119b23903bfbbed4adf` recorded
  `step-succeeded` at `2026-05-18T14:23:50.930Z`.
- `resp_3c57d99d2e5e4601970149345dfab749` recorded
  `step-succeeded` at `2026-05-18T14:19:48.438Z`.
- Direct `/v1/responses/{id}` reads later returned `completed` with output for
  both responses.

## Why This Still Needs AuraCall Work

The final result was successful, but the intermediate state was operationally
ambiguous enough that a caller or operator could make the wrong decision:

- `in_progress` plus no active lease looked stranded, even though useful
  browser work was apparently still able to complete.
- cancellation semantics were unclear: one run could not be cancelled because
  no active lease existed, while another emitted `lease released: cancelled`
  but still later succeeded.
- batch readback was temporarily vulnerable to malformed or partially written
  JSON state while child runs were active or recovering.

AuraCall should make these states explicit. If a browser-backed run is
detached-but-recovering, finalizing, or still owned by a live browser task
without an active run lease, that status should be visible through the API and
operator surfaces. If cancellation is accepted, the run should converge to
`cancelled` or report that cancellation could not be applied because the child
was already completing.

## Recommended Next Owner Steps

1. Reproduce with a small non-private or low-sensitivity response batch on
   `agent:pro-extended-chatgpt-soylei-transcripts`, then restart
   `auracall-api.service` while a child is waiting on ChatGPT.
2. Audit response-batch status reconciliation when a child run has a
   `lease-released` event but no terminal `run.status`.
3. Make `cancel-run` behavior deterministic for no-active-lease browser runs:
   either transition to terminal `cancelled`, reject with an explicit
   `still_recovering_or_finalizing` reason, or report that completion already
   won the race.
4. Harden `/v1/response-batches/{id}` and materialization reads against
   partially written child runtime JSON so a transient corrupt child record
   cannot break the whole batch status call.
5. Add diagnostics to batch status jobs for restart/recovery races:
   `leaseState`, `lastLeaseEvent`, `browserTaskState`, `lastProviderEvidence`,
   and `terminalTransitionSource`.
6. After fixing the status/cancel semantics, rerun a three-item
   transcribe-audio batch and verify the caller never sees contradictory
   `in_progress`/no-active-lease/cancelled-but-later-succeeded states.

## Suggested Acceptance Criteria

- A browser-backed response batch survives an API service restart and converges
  to `completed`, `failed`, or `cancelled` without exposing an unclassified
  no-active-lease `running` state.
- A cancellation request made during restart recovery has one deterministic
  outcome in both the child run and the parent batch counts.
- Batch status remains readable while child runtime records are being updated.
- The caller can distinguish recoverable/transient restart state from a truly
  stranded run without reading raw runtime records under `~/.auracall`.

## Private Data Caution

Runtime records and request attachments for the response ids above can include
private transcript payloads. Debug with metadata, run ids, batch ids, lease
events, provider conversation ids, artifact state, and redacted prompt-boundary
facts unless the operator explicitly authorizes raw transcript inspection.
