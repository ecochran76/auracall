# Transcribe-Audio First-Pass Batch Stall Handoff

Date: 2026-05-17

## Summary

`transcribe-audio` submitted the next reviewed first-pass summary batch through
AuraCall using the `agent:pro-extended-chatgpt-soylei-transcripts` model and the
`wsl-chrome-3` ChatGPT runtime profile. The first batch produced two valid
`first_pass_readout.json` artifacts, then the remaining runs stopped making
provider progress and had to be recovered or cancelled. An exact three-item
retry for the unmaterialized items also stopped making provider progress and was
cancelled to avoid leaving active work hanging.

This is not evidence that the transcript payloads are too large or that the
artifact contract is invalid. It is evidence that the browser-backed response
batch runner can strand or idle runs across AuraCall restarts/recovery claims
without surfacing a terminal failure or producing an artifact.

The canonical client-side operator record is in:

- `/home/ecochran76/workspace.local/transcribe-audio/RUNBOOK.md`, Turn 101
- Commit: `dcb7156 Record stalled AuraCall batch`

## Runtime Boundary

- Client repo: `/home/ecochran76/workspace.local/transcribe-audio`
- AuraCall repo: `/home/ecochran76/workspace.local/auracall`
- Store root: `/home/ecochran76/.transcripts`
- AuraCall API: `http://127.0.0.1:18095`
- Transcript API: `http://127.0.0.1:18876`
- Model: `agent:pro-extended-chatgpt-soylei-transcripts`
- Service: `chatgpt`
- Runtime profile: `wsl-chrome-3`
- Requested artifact: `first_pass_readout.json`
- Artifact mode: ChatGPT REPL/workspace downloadable artifact, not text-only
  JSON.

The transcribe prompt was explicit that ChatGPT must create and surface a
downloadable `first_pass_readout.json` artifact. The prompt also still contains
the older structured-readout instruction text that says "Return ONLY one valid
JSON object"; the newer artifact instructions are stronger and appear in the
system and user prompt. The successful jobs prove AuraCall can materialize the
requested artifact in this workflow, but the stalled jobs did not reach a
provider-output state.

## Original Batch

- Manifest:
  `/home/ecochran76/.local/state/transcribe-audio/first-pass-summary-batches/first-pass-summary-prepare-20260517-075535.json`
- Batch id: `batch_6a27f88c9abe4d71b16090f7f53efc5a`
- Final status: `cancelled`
- Final counts:
  - `total=5`
  - `completed=2`
  - `cancelled=3`
  - `failed=0`
  - `missing=0`
  - `in_progress=0`
- Materialization:
  - `materialized=2`
  - `materialization_errors=0`

Jobs:

- index 0: `resp_bed920cb00634fccbf34025712fe1f7a` -> `cancelled`
- index 1: `resp_980033458825423099284ba0fc53cb0d` -> `completed`
- index 2: `resp_15b5ac60f95f4e61bfa67c4690f46719` -> `cancelled`
- index 3: `resp_5ee97cb6319c473cb03f942254fc2257` -> `completed`
- index 4: `resp_bd7a9dce64304262b3ed99c917e891eb` -> `cancelled`

Quality gate:

- `scripts/check_readout_quality.py --manifest ...075535.json --format text`
  passed for the two materialized readouts.
- Result: 2 pass, 0 warn, 0 fail.

Materialized readouts:

- `/home/ecochran76/.transcripts/legacy-artifacts/32/323f6892045ed1a7fb8a-2026-01-09 14-00 SoyLei & ASR - Gravel roads and cold patching solutions My recording 145.readout.json`
- `/home/ecochran76/.transcripts/legacy-artifacts/8b/8bc8e6575cf0649954ae-2026-02-12 Scott Roberts Call.readout.json`

## Exact Retry

- Manifest:
  `/home/ecochran76/.local/state/transcribe-audio/first-pass-summary-batches/first-pass-summary-prepare-20260517-083532.json`
- Batch id: `batch_fcc01c7655d440d0aaabfe7e0125686e`
- Purpose: retry only the three unmaterialized items from the original batch.
- Final status: `cancelled`
- Final counts:
  - `total=3`
  - `completed=0`
  - `cancelled=3`
  - `failed=0`
  - `missing=0`
  - `in_progress=0`
- Materialization:
  - `materialized=0`
  - `materialization_errors=0`

Jobs:

- index 0: `resp_a90dcd0a092a41b8997deddb8378e339` -> `cancelled`
- index 1: `resp_734b72e38fa140e9a755bfc4938c8ead` -> `cancelled`
- index 2: `resp_3350304c536046a29448be927c22ec04` -> `cancelled`

## Observed Failure Shape

Original batch timeline:

- The batch started with all five jobs `in_progress`.
- `resp_5ee97cb6319c473cb03f942254fc2257` completed first and materialized.
- AuraCall restarted/re-attached Chrome during the batch window. The systemd
  service remained active, but the service process restarted multiple times.
- After repeated polling, the batch remained stuck with four jobs still marked
  `in_progress`, no `failure`, no output, and no materialization errors.
- Direct `/v1/responses/{id}` reads for the stuck responses reported
  `status=in_progress`, `output=[]`, and `error=null`.
- Runtime recovery classified some runs as recoverable or stranded; targeted
  operator cancellation initially failed for runs without active leases.
- Claiming recoverable stranded runs caused one previously stuck run to complete
  and materialize, proving some recovery path still works.
- The remaining original-batch runs either had no active lease to cancel or had
  leases that could be reclaimed/cancelled only after recovery/control actions.

Retry batch timeline:

- The exact three-item retry started with all three jobs `in_progress`.
- After a bounded poll window, all three remained `in_progress` with no output,
  no failure, and no materialization.
- Recovery status classified one run as active but suspiciously idle and two as
  reclaimable.
- The suspiciously idle run was cancelled.
- The two reclaimable runs were claimed for the local runner, but did not
  produce provider progress or artifacts after a final bounded wait.
- The remaining retry runs were cancelled cleanly so no active batch work was
  left hanging.

Important distinction:

- The transcript API status/materialize endpoint behaved correctly. It preserved
  completed artifacts, reported provider counts, and did not invent success.
- The failure is below that boundary: AuraCall response batches and/or the
  browser runner can leave runs in `in_progress` with no output, no failure, and
  no durable progress until operator recovery is applied.

## Evidence Paths

Batch manifests:

- `/home/ecochran76/.local/state/transcribe-audio/first-pass-summary-batches/first-pass-summary-prepare-20260517-075535.json`
- `/home/ecochran76/.local/state/transcribe-audio/first-pass-summary-batches/first-pass-summary-prepare-20260517-083532.json`

Runtime records:

- `/home/ecochran76/.auracall/runtime/runs/resp_bed920cb00634fccbf34025712fe1f7a/record.json`
- `/home/ecochran76/.auracall/runtime/runs/resp_980033458825423099284ba0fc53cb0d/record.json`
- `/home/ecochran76/.auracall/runtime/runs/resp_15b5ac60f95f4e61bfa67c4690f46719/record.json`
- `/home/ecochran76/.auracall/runtime/runs/resp_5ee97cb6319c473cb03f942254fc2257/record.json`
- `/home/ecochran76/.auracall/runtime/runs/resp_bd7a9dce64304262b3ed99c917e891eb/record.json`
- `/home/ecochran76/.auracall/runtime/runs/resp_a90dcd0a092a41b8997deddb8378e339/record.json`
- `/home/ecochran76/.auracall/runtime/runs/resp_734b72e38fa140e9a755bfc4938c8ead/record.json`
- `/home/ecochran76/.auracall/runtime/runs/resp_3350304c536046a29448be927c22ec04/record.json`

Private data caution:

- The runtime records and request attachments may include private transcript
  text. Do not quote raw transcript payloads in tickets, commits, or public
  logs.
- For debugging, prefer metadata, response ids, batch ids, lease state,
  artifact/materialization state, and redacted prompt-boundary facts.

## What Should Have Happened

For each batch job, AuraCall should reach one of these states without operator
intervention:

- completed with a materializable `first_pass_readout.json` artifact;
- failed with a concrete browser/provider/contract failure; or
- cancelled by an explicit operator action that is reflected in the batch counts.

For browser-backed runs, the response runner should also prove internal
provider progress before waiting indefinitely:

- the configured ChatGPT agent/project context was opened;
- the prompt was submitted;
- a provider response began;
- a `first_pass_readout.json` artifact/link/card was detected or a concrete
  artifact absence/failure was recorded.

If any of those progress checks fail, the run should fail terminally with a
diagnostic that explains the missing phase instead of remaining `in_progress`.

## Recommended Next Owner Steps

1. Add a non-private one-item response-batch smoke for
   `agent:pro-extended-chatgpt-soylei-transcripts` that requires a surfaced
   `first_pass_readout.json` workspace artifact.
2. Make the smoke assert provider-progress phases, not just final batch status:
   project/agent context opened, prompt submitted, response started, artifact
   surfaced, artifact materialized.
3. Add or tighten watchdog logic for browser-backed response runs that remain
   `in_progress` with `output=[]`, `error=null`, and no observed provider
   progress across a service restart or recovery claim.
4. Reconcile response-batch counts when child runs are reclaimed, cancelled, or
   completed after a recovery action; the batch readback should converge without
   requiring the client to infer from raw run records.
5. Preserve explicit operator recovery, but make "no active lease to cancel",
   "recoverable stranded", "reclaimable", and "suspiciously idle" states easier
   to map back to the affected batch/job index.
6. Only after the non-private smoke passes, retry the three pending transcript
   readouts from the `transcribe-audio` queue.

## Suggested Acceptance Criteria

- A single non-private `response-batches` smoke on
  `agent:pro-extended-chatgpt-soylei-transcripts` completes with exactly one
  materialized `first_pass_readout.json` artifact.
- Killing or restarting the AuraCall API during a browser-backed run produces
  either a clean recovered completion or a terminal failed/cancelled state with
  a specific reason.
- `/v1/response-batches/{batch_id}` never leaves jobs indefinitely
  `in_progress` after all child runs are terminal or reclaimable.
- `/status?recovery=1&runnerTopologyMode=full` exposes enough batch linkage to
  identify which response-batch job needs recovery.
- The transcribe-audio retry can process the three pending readouts without
  manual lease recovery and with `materialization_errors=0`.

## Do Not

- Do not retry the private transcript batch again until a non-private artifact
  smoke proves provider progress and local materialization.
- Do not treat text such as `first_pass_readout.json ready` as success unless
  the artifact was actually surfaced and downloaded/materialized.
- Do not reduce or truncate transcript payloads as the first fix; two artifacts
  from the same batch passed the quality gate, and the observed stall was
  runtime/provider progress, not readout quality.
- Do not silently auto-reset or reseed the managed browser profile as part of
  the response-batch runner. Profile repair should remain explicit operator
  action unless a separate plan changes that policy.
