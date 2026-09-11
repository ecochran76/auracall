# ChatGPT 6 Pro Deep Research recovery handoff

Status: provider work completed and artifacts recovered; five AuraCall runtime
defects remain for a bounded provider-free repair.

## Incident

An operator-authorized Deep Research run used installed AuraCall `0.1.1`,
AuraCall runtime profile `wsl-chrome-3`, its matching managed browser profile,
Chat mode, and the signed-in Pro account. The run attached five local evidence
files and targeted the live `6 Pro` model shown in the composer.

The successful provider conversation is
`6aa368bc-43c4-83ea-8d98-964264dd4340`. ChatGPT completed the research in ten
minutes. AuraCall subsequently retrieved a 32,081-character report and
materialized Markdown, DOCX, and PDF artifacts. The managed browser remained
alive on its existing owned process after recovery.

Do not retry or recreate this provider job. The provider conversation and
materialized artifacts are authoritative; the originating AuraCall session's
terminal `error` state is stale.

## Observed defects

### 1. Current `6 Pro` has no faithful semantic selector

The live Chat model menu exposed `6 Pro`, `Latest`, `GPT-5.6 Sol`, and
`GPT-5.5`. AuraCall's semantic model registry and effective browser config
still describe the Pro route as `GPT-5.6 Sol`. A direct
`--browser-model-label 'GPT-6'` override did not survive configuration
resolution for a GPT transport model; the effective target became
`GPT-5.6 Terra`.

The successful run preserved the already selected current model with
`--browser-model-strategy current`. The attachment-state readback showed the
live `6 Pro` label, while AuraCall metadata still recorded desired model
`GPT-5.6 Sol`. This proves provider model state for this run, but is not
acceptable durable model provenance.

### 2. Sol depth selection targets a removed or changed control

The semantic `chatgpt:sol-extra-high` and related selectors inject
`thinkingTime`. AuraCall then failed before submission with:

```text
Unable to find the Thinking time dropdown menu.
```

The current composer did not expose the expected depth control. A one-run
omission of the inherited depth was not available through the public CLI.
Using `modelStrategy=current` with no explicit depth avoided this obsolete
interaction.

### 3. Attachment-rendered user turns fail exact prompt commit

After AuraCall uploaded all five files and clicked Send once, its prompt
commit probe reported:

```text
userMatched=true
prefixMatched=true
lastMatched=true
lastExactMatched=false
hasNewTurn=true
assistantVisible=true
composerCleared=true
inConversation=true
```

The rendered user turn included attachment names, file-kind labels, the Deep
Research marker, and collapsed-content affordances around the prompt. ChatGPT
had already created the conversation and the assistant had entered `Called
tool`, but AuraCall raised `Prompt did not appear in conversation before
timeout`.

The verifier should accept a uniquely matched post-baseline user turn when the
normalized prompt body is intact and provider-owned attachment/tool chrome is
the only extra text. This must remain bounded by the new-turn boundary and
must not weaken duplicate-submit protection.

### 4. Post-effect rate limiting overwrites the real outcome

The prompt verifier's false negative coincided with ChatGPT's temporary `Too
many requests` dialog. AuraCall terminalized the local session as a browser
automation error and installed a cooldown even though the provider effect had
already started. A naive retry would have duplicated an active Deep Research
job.

Provider-effect reconciliation must run before retry guidance when evidence
shows `hasNewTurn`, an assistant turn, a conversation ID, or a tool call. The
terminal result should distinguish `pre_effect`, `effect_observed`, and
`unknown` rather than allowing a later rate-limit dialog to erase observed
submission evidence.

### 5. Completed artifact fetch did not exit

`conversations artifacts fetch` printed a complete result with three
materialized files and a manifest, but the CLI process remained alive and
silent for more than one minute. It required `SIGINT` after materialization.
The persistent managed Chrome process was separate and remained healthy.

Artifact-fetch completion should release transient browser/client resources
and exit while respecting `keepBrowser` ownership for the managed browser.

## Recovery evidence

The safe recovery path was read-only and did not submit another prompt:

```bash
auracall --profile wsl-chrome-3 conversations context get \
  6aa368bc-43c4-83ea-8d98-964264dd4340 \
  --target chatgpt --refresh --retry-attempts 0 --json-only

auracall --profile wsl-chrome-3 conversations artifacts fetch \
  6aa368bc-43c4-83ea-8d98-964264dd4340 \
  --target chatgpt
```

The context payload proved one user turn, one completed Deep Research
assistant report, and Word/PDF artifact descriptors. Artifact fetch then
materialized Markdown, DOCX, and PDF with an auditable manifest.

## Recommended repair slice

1. Add a current `6 Pro` semantic descriptor and record observed current-model
   provenance separately from requested-model metadata.
2. Add a public one-run way to omit profile-derived thinking depth, and update
   depth discovery for the current composer before re-enabling explicit depth.
3. Add attachment-bearing prompt-commit fixtures that preserve exact
   post-baseline and duplicate-submit boundaries.
4. Reconcile observed provider effects before classifying rate-limit failures
   or suggesting retry.
5. Add an artifact-fetch lifecycle test proving command exit while the owned
   persistent browser remains alive.

Keep the next slice provider-free until these regressions pass. A live canary
should use one small prompt, one attachment, `modelStrategy=current`, and no
explicit thinking depth.
