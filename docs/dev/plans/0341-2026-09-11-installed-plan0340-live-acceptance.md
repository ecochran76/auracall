# Installed Plan 0340 Live Acceptance | 0341-2026-09-11

State: CLOSED
Lane: P34
Operational state: LIVE_VERIFICATION_COMPLETED_WITH_FINDINGS_INTEGRATED
Branch: ops/plan0341-installed-plan0340-live-acceptance
Target: main
Integration: merge
Revision: 3 | 2026-09-11

## Stable Objective

Install current published `main` containing Plan 0340, then prove its bounded
ChatGPT behavior on the exact installed runtime while preserving the completed
Deep Research conversation and every unrelated scheduler/completion control.

## Current State

- Published `main` is clean and local/remote equal at
  `da1871eb85b899629baba915f66fabbbb3c2bfc59`; Plan 0340 is provider-free
  accepted and integrated.
- The installed launcher reports `0.1.1`, but version equality is not byte
  identity. Its API still runs the prior installed package at PID `41886` with
  zero systemd restarts, so current-main installation remains unproved.
- The API reports six active completions, all paused, with zero queued/running;
  the scheduler is healthy/scheduled and background drain is idle. This plan
  will not invoke any scheduler, completion, or materialization control.
- AuraCall runtime profile `wsl-chrome-3` resolves browser profile
  `wsl-chrome-3`, WSL Chrome, and managed browser profile
  `~/.auracall/browser-profiles/wsl-chrome-3/chatgpt`. That directory has one
  established Chrome owner at PID `71128` and DevTools port `45015`; responsive
  ownership and exact account identity must be re-proved immediately before
  the canary.
- The September 10 provider conversation
  `6aa368bc-43c4-83ea-8d98-964264dd4340` and its recovered Markdown, DOCX, and
  PDF artifacts are authoritative. It may be read once for the artifact-fetch
  lifecycle proof but must never receive a prompt, retry, recreation, or other
  mutation.
- Graphiti is healthy but its reviewed atlas has no AuraCall-specific memory
  cloud for this work. Current repo, Git, installed service, and browser
  readbacks are authoritative. CodeGraph is not initialized in this worktree,
  so source lookup uses the documented native fallback.
- The one supported install completed from published `main`; source and
  installed `dist` each contain 522 files with equal aggregate SHA-256
  `6615333ea65e35903f817264b41eac6135fc33d3c0857b2845bf0ddd9860af64`.
  The API automatically restarted once after a broad `/status` read exhausted
  the Node heap; narrow authenticated endpoints remain healthy and prove the
  six completions are still paused with zero queued/running.
- The no-prompt identity smoke proved an exact Pro/personal match and exact
  browser ownership, but printed complete JSON without exiting and was stopped
  at the exact CLI process. Two September 10 identity-smoke orphans in other
  working directories remain outside this plan's process ownership.
- The first effect-capable canary attempt passed account, ownership, Chat-mode,
  and composer readiness but stopped before upload or Send because explicit
  model selection could not find its selector. A bounded read-only DOM census
  proved a visible open menu containing `6 Pro` in a changed slider/menu shape.
  The second and final work-unit attempt uses the handoff-prescribed
  `modelStrategy=current`; only one provider Send remains permitted.

## Execution Graph

Owner: primary agent. All runtime/browser/provider operations are serialized.

1. Publish this bounded plan and P34 lane from exact current `origin/main`.
2. Re-run the affected provider-free gate and production build, then install
   exactly that published source once through
   `pnpm run install:user-runtime-service`.
3. Bind source and installed `dist` inventories, installed launcher target,
   API PID/restart state, status endpoint, and preserved completion posture to
   the installed checkpoint.
4. Run one read-only identity smoke for AuraCall runtime profile
   `wsl-chrome-3`; stop on identity, ownership, mode, or human-verification
   ambiguity.
5. Request semantic `chatgpt:premium` but preserve the already active `6 Pro`
   model with `modelStrategy=current`, as prescribed by the incident handoff.
   Run one installed Chat-mode Send with public `--browser-no-thinking-time`,
   one small attachment, one unique expected token, `--browser-keep-browser`,
   and no retry. Reattach read-only if the provider effect is uncertain; never
   resend.
6. Run `conversations artifacts fetch` exactly once, read-only, against the
   recovered conversation under a bounded caller timeout. Require completed
   output plus normal process exit while the exact owned persistent Chrome
   remains alive; do not retry a timeout.
7. Record a redacted durable receipt, close P34 only if every acceptance
   criterion has current evidence, integrate through the documented merge
   path, publish, and re-check service/browser/process state.

## Acceptance Criteria

- `LVA-R1`: installed metadata and complete `dist` inventories bind the
  installed runtime to the clean published source checkpoint; the installed
  launcher and API report the expected version and executable target.
- `LVA-R2`: the post-install API is healthy with zero restart churn, background
  drain idle, six paused completions, and zero queued/running completions; no
  scheduler/completion/materialization control ran.
- `LVA-R3`: the exact `wsl-chrome-3` AuraCall runtime profile, matching browser
  profile and managed browser profile, responsive DevTools owner, and configured
  ChatGPT identity pass a no-prompt identity smoke before Send.
- `LVA-R4`: one new attached-file Chat turn completes with the unique expected
  token. Session/result evidence distinguishes requested `chatgpt:premium`
  identity from provider-observed `6 Pro`, shows no thinking-time selection,
  and records no retry or post-effect cooldown rewrite.
- `LVA-R5`: one read-only artifact fetch for the recovered conversation prints
  its completed result and exits within the caller bound while the pre-existing
  managed Chrome owner remains responsive. The recovered conversation receives
  no prompt or retry.
- `LVA-R6`: the live receipt, plan, lane, roadmap, runbook, journal, and durable
  lesson agree with actual effects; focused tests, build, audits, Git hygiene,
  and published-ref readback pass with inherited unrelated findings explicit.

## Bounds

- At most one supported runtime/service installation, one no-prompt identity
  smoke, two effect-capable work-unit attempts, one new provider prompt, one
  attachment upload, one Send, and one recovered-conversation artifact fetch.
  The first work-unit attempt is accepted only as a proven pre-upload/pre-Send
  selector failure; the second uses `modelStrategy=current` and is final.
- Zero automatic or manual prompt retries. If submission is uncertain or
  `effect_observed`, inspect/reattach read-only and stop rather than resend.
- Never click ChatGPT's `Answer now` button. CAPTCHA, human verification,
  identity mismatch, unknown browser ownership, missing Chat-mode proof, or
  selector ambiguity is a hard stop.
- Do not pause, resume, start, cancel, or otherwise control schedulers,
  completions, live-follow, background drain, or materialization. Do not induce
  rate limiting or intentionally exercise a failure.
- Do not prompt, retry, recreate, rename, delete, or otherwise mutate recovered
  conversation `6aa368bc-43c4-83ea-8d98-964264dd4340`.
- Do not absorb P08, P16, P18, or P29. One evidence-driven tactic change is
  allowed after a proven pre-effect selector failure; no second provider Send
  or artifact-fetch attempt is allowed.

## Definition Of Done

Current published Plan 0340 bytes are installed and source-identical; one
identity-qualified attached-file canary and one read-only artifact-fetch exit
proof satisfy LVA-R1 through LVA-R6; unrelated paused controls and the recovered
conversation are unchanged; and the durable receipt is integrated and
published on `main`.

## Acceptance Evidence

- `LVA-R1` passed. The one supported install used clean, published main at
  `da1871eb85`; source and installed `dist` each contain 522 files and share
  aggregate SHA-256 `6615333ea65e35903f817264b41eac6135fc33d3c0857b2845bf0ddd9860af64`.
- `LVA-R2` was rejected. A broad `/status` projection exhausted the API's
  1536 MiB Node heap and caused one automatic systemd restart. The replacement
  service is healthy at PID `47500`; narrow authenticated reads show 78 models,
  six paused completions, and zero queued/running completions. No control ran.
- `LVA-R3` is partial. Exact Pro/personal identity, runtime/browser profile,
  Chrome PID `71128`, and DevTools port `45015` matched, but the identity-smoke
  CLI printed complete JSON and did not exit. Only that invocation was stopped;
  two September 10 foreign orphans remain untouched.
- `LVA-R4` is partial. Explicit `6 Pro` selection failed before upload/Send
  despite the open live menu containing that label. The final current-model
  canary uploaded one attachment, sent once, retried zero times, and returned
  the exact token in 22.245 seconds, but persisted session metadata omitted the
  provider-observed model field.
- `LVA-R5` is partial. The one recovered-conversation fetch printed completion
  and exited normally in 24 seconds without a prompt or mutation. It freshly
  materialized Markdown; the DOCX/PDF entries reported `Promise was collected`.
  The previously recovered Markdown, DOCX, and PDF remain present and hashed.
- `LVA-R6` passed through non-fast-forward main integration
  `52b0604d159af176c74ca117e30f46887670bfd3` of the redacted receipt at
  `docs/dev/notes/2026-09-11-plan0341-installed-live-verification.json`, the
  synchronized closeout documents, audits, and published integration receipt.

## Disposition

P34 is closed as verification completed with partial acceptance, not as a
fully accepted Plan 0340 live surface. The recovered conversation remains
authoritative and unmodified. Any repair for aggregate status memory use,
identity-smoke lifecycle, live selector triggering, observed-model persistence,
or DOCX/PDF fetch materialization requires a new provider-free plan; no P34
provider retry is authorized.
