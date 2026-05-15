# Transcribe-Audio AuraCall Dispatch Handoff

Date: 2026-05-15

## Summary

`transcribe-audio` retried the two remaining legacy enrichment items after the
AuraCall artifact-contract upgrade. The retry did not reach a valid
`legacy_readout.json` artifact test. It exposed a lower-level AuraCall browser
dispatch/runtime problem with the `wsl-chrome-3` ChatGPT profile.

The transcribe-audio repo has the canonical operator record in:

- `/home/ecochran76/workspace.local/transcribe-audio/RUNBOOK.md`, Turn 69
- Commit: `1368171 Record AuraCall dispatch retry failure`

## Retry Boundary

- Batch manifest:
  `/home/ecochran76/.local/state/transcribe-audio/auracall-batches/legacy-enrichment-20260515-055623.json`
- Batch id: `batch_88aa13c439f44ea3a62aa9e636a5ddcc`
- Model: `agent:pro-extended-chatgpt-soylei-transcripts`
- Runtime profile: `wsl-chrome-3`
- Service: `chatgpt`
- Limits: `maxConcurrentRuns=1`, `maxBrowserInteractionsPerMinute=6`
- Responses:
  - `resp_971323e460de434d93bf2b44941091d7`
  - `resp_f047ef728c7e456ab2f7e8f03289fc52`

Final status:

- `total=2`
- `completed=0`
- `failed=0`
- `cancelled=2`
- `materialized=0`
- `materialization_errors=0`

## Observed Failure Shape

Initial execution was blocked by stale ChE grading response runs on the same
`wsl-chrome-3` ChatGPT browser runner:

- `resp_6998b1db0f744932832054674dc17e65`
- `resp_634a607998244cde84139e505600aa1f`
- `resp_348547c367514c08899e2ea345ec3e63`

Those were cancelled as operator cleanup to unblock the transcript retry.

`resp_971323e460de434d93bf2b44941091d7` then reached `running`, but the managed
Chrome renderer stopped responding to direct CDP `Runtime.evaluate`. The managed
Chrome process for `wsl-chrome-3` had to be terminated to release the browser
lock. That stranded the run, so it was cancelled.

`resp_f047ef728c7e456ab2f7e8f03289fc52` then became the only active transcript
run. It held the browser operation, but live CDP inspection of the new
`wsl-chrome-3` Chrome instance showed ChatGPT idle at:

`https://chatgpt.com/`

The tab was not in the Transcripts project and was not generating/submitting the
transcript request. That run was cancelled.

## What This Proves

- This was not a response-length issue.
- This was not a successful artifact-contract test.
- The correct artifact requirement is still `legacy_readout.json` as a ChatGPT
  workspace/downloadable artifact.
- The current blocking bug is earlier: project-bound browser dispatch can hold
  the operation lock while failing to navigate/submit into the configured
  project-bound agent context.

## Recommended Next Owner Steps

1. Add a tiny non-private project-bound artifact smoke for
   `agent:pro-extended-chatgpt-soylei-transcripts`.
2. Assert the browser actually lands in the configured Transcripts project URL
   before typing/submitting.
3. Assert a submitted user message appears in the project conversation before
   waiting for a response.
4. If navigation/submission does not happen, fail the response run immediately
   instead of leaving it `running` with an idle ChatGPT home page.
5. Only after that smoke passes, rerun the two transcript payloads from the
   `transcribe-audio` manifest.

## Useful Live Evidence Paths

- Runtime run records:
  `/home/ecochran76/.auracall/runtime/runs/resp_971323e460de434d93bf2b44941091d7/record.json`
  `/home/ecochran76/.auracall/runtime/runs/resp_f047ef728c7e456ab2f7e8f03289fc52/record.json`
- Request attachments:
  `/home/ecochran76/.auracall/runtime/request-attachments/resp_971323e460de434d93bf2b44941091d7/`
  `/home/ecochran76/.auracall/runtime/request-attachments/resp_f047ef728c7e456ab2f7e8f03289fc52/`
- Browser operation lock file observed during the run:
  `/home/ecochran76/.auracall/browser-operations/c87b2b9342ec3550ef10e159dbd460fb274c2f25a4445cc7e0bbbaf730eb33fc.json`
- AuraCall API log:
  `/home/ecochran76/.auracall/logs/api-18095.log`

## Do Not

- Do not retry the private transcript payloads again until a non-private
  project-bound artifact smoke proves navigation, submission, and artifact
  extraction.
- Do not treat status prose such as "I'll create the artifact" as a successful
  response.
- Do not quarantine or reseed the managed profile automatically; managed profile
  repair should remain explicit operator action.
