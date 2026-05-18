# Transcribe-Audio First-Pass Batch Stale Response Handoff

Date: 2026-05-18

## Summary

The AuraCall lease-heartbeat/activity fix is working for the transcribe-audio
first-pass summary workflow, but a new browser freshness failure appeared in a
conservative three-item batch. Two ChatGPT workspace artifacts were surfaced,
downloaded, materialized, and ingested by transcribe-audio. One sibling run
failed with:

```text
runner_execution_failed: Stale ChatGPT assistant response detected after send.
```

This is now the next AuraCall owner boundary. The prior suspicious-idle /
connection-loss symptom did not recur in this batch.

## Source Workflow

- Caller repo: `/home/ecochran76/workspace.local/transcribe-audio`
- Caller commit recording the retry: `baa04bb Record first-pass summary retry results`
- Caller runbook section: `RUNBOOK.md` Turn 103
- Runtime env used by caller:
  `/home/ecochran76/.local/state/transcribe-audio/auracall-transcripts.env`
- Model: `agent:pro-extended-chatgpt-soylei-transcripts`
- Runtime profile: `wsl-chrome-3`
- Service/account tenant: SoyLei ChatGPT Transcripts project
- Batch manifest:
  `/home/ecochran76/.local/state/transcribe-audio/auracall-batches/first-pass-summary-20260517-201320.json`
- Batch id: `batch_4201009fb3e84b498957ae992866191e`
- Batch limits: `maxConcurrentRuns=1`,
  `maxBrowserInteractionsPerMinute=8`

## Final Batch State

```json
{
  "status": "failed",
  "counts": {
    "total": 3,
    "completed": 2,
    "failed": 1,
    "cancelled": 0,
    "missing": 0,
    "in_progress": 0
  },
  "materialized": 2,
  "materialization_errors": 0
}
```

Completed children:

- `resp_2e3d43e62acb4276a73156de2bdcfcd4`
- `resp_5c93dd88b43b4e60a0c5e5b3a1a747ba`

Failed child:

- `resp_3168e7286aa94bef85f02eaca860e58f`
- Failure:
  `runner_execution_failed: Stale ChatGPT assistant response detected after send.`

## What Worked

- The run no longer produced the previous active-lease stale-runner condition.
- `/status?recovery=1&runnerTopologyMode=full&tenantExecutionLimits=usage`
  showed no `activeLeaseHealth` warning while the batch was active.
- Runner `lastActivityAt` updated from browser runtime evidence during the
  active run.
- The successful children produced ChatGPT `first_pass_readout.json` workspace
  artifacts and local materialized files.
- transcribe-audio quality gate passed for both materialized readouts:
  2 pass, 0 warn, 0 fail.

Materialized files:

- `/home/ecochran76/.transcripts/legacy-artifacts/ce/cebc3de9804d0276e862-2026-01-07 Scott Roberts Charlie Nacu Austin update Recording (10).readout.json`
- `/home/ecochran76/.transcripts/legacy-artifacts/37/37a7dc67cc5cb5870a95-2026-02-13 14-45 SoyLei - Discussion of Infringement & C&D Letters My recording 53 (1).readout.json`

## Failure Evidence

The relevant AuraCall log sequence for the failed child shows a project-bound
ChatGPT run, a response recovered by polling fallback, then stale-response
detection:

```text
Navigating to https://chatgpt.com/g/g-p-6a04628762ac8191894b16cfaddfd126/project
Prompt textarea ready (initial focus, 59,473 chars queued)
Model picker: Pro• Extended
Thinking time: Extended Pro (already selected)
Clicked send button
Waiting for ChatGPT response
[browser] conversation url (post-submit) = https://chatgpt.com/g/g-p-6a04628762ac8191894b16cfaddfd126-transcripts/c/6a0a69aa-1f5c-83ea-bcdc-692457c7e212
Recovered assistant response via polling fallback
Detected stale assistant response; waiting for new response...
Failed to complete ChatGPT run: Stale ChatGPT assistant response detected after send.
```

Important nuance: the failed response did not record provider conversation
metadata in `/v1/runtime-runs/recent`:

```text
runId=resp_3168e7286aa94bef85f02eaca860e58f
status=failed
providerConversationSummary.count=0
```

The adjacent successful runs did record conversation ids:

- `resp_2e3d43e62acb4276a73156de2bdcfcd4` ->
  `6a0a67b5-ce50-83ea-98ec-2d15805beb7f`
- `resp_5c93dd88b43b4e60a0c5e5b3a1a747ba` ->
  `6a0a6d34-003c-83ea-a442-11e63d8b13d4`

## Observed Secondary Issue

During repeated transcribe-audio status polling, AuraCall intermittently
returned API read errors while the batch was otherwise recoverable:

```text
AuraCall read failed (400): {'message': 'Unterminated string in JSON at position 524288 (line 5351 column 62)', 'type': 'invalid_request_error'}
AuraCall read failed (400): {'message': 'Unexpected end of JSON input', 'type': 'invalid_request_error'}
```

Direct subsequent reads of the batch and response records worked. Treat this
as a separate status/readback robustness issue unless it shares a root cause
with stale assistant-response recovery.

## Current Runtime Caution

At handoff capture time, AuraCall had an active SoyLei ChatGPT run unrelated to
the terminal batch:

```text
runId=resp_801d7fae735e4a348460029d8ca95ef0
status=in_progress
createdAt=2026-05-18T01:44:42.399Z
lastUpdatedAt=2026-05-18T02:58:51.302Z
providerConversationSummary.count=0
```

Do not restart or clear the `wsl-chrome-3` managed profile without first
checking whether this run is still active and whether it should be cancelled,
recovered, or left alone.

## Recommended AuraCall Debug Path

1. Inspect the stale-response guard around ChatGPT polling fallback for
   project-bound runs.
2. Determine why the failed run considered the recovered assistant response
   stale after a successful send, despite a concrete post-submit conversation
   URL.
3. Confirm whether the guard should wait longer, re-read the submitted
   conversation, compare message identity differently, or materialize from the
   submitted conversation when a fresh artifact/link is visible.
4. Add diagnostics to failed run metadata when stale-response detection fires:
   submitted target id, post-submit conversation id, recovered message id or
   fingerprint if available, stale baseline fingerprint, and current URL.
5. Add or update tests around a polling-fallback response that initially
   matches stale content but later updates to the post-send response.
6. After a fix, rerun only the failed transcribe item first:
   `/home/ecochran76/.transcripts/legacy-artifacts/ac/acdee7fa22751e3a64e2-2026-02-12 Scott Roberts Call 2 Recording.transcript.json`

## Suggested Validation

- Run targeted AuraCall tests for ChatGPT response freshness and configured
  executor artifact materialization.
- Reinstall/restart the user runtime only after checking the active run noted
  above.
- Live smoke:
  submit a one-item transcribe-audio first-pass batch for the Scott Roberts
  Call 2 transcript with `maxConcurrentRuns=1`.
- Success criteria:
  batch completes, `first_pass_readout.json` is surfaced and locally
  materialized, transcribe-audio ingests it, and
  `scripts/check_readout_quality.py` passes.

