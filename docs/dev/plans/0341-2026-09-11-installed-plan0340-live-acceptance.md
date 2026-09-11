# Installed Plan 0340 Live Acceptance | 0341-2026-09-11

State: OPEN
Lane: P34
Operational state: PREINSTALL_BASELINE_ACCEPTED
Branch: ops/plan0341-installed-plan0340-live-acceptance
Target: main
Integration: merge
Revision: 1 | 2026-09-11

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
5. Run one installed Chat-mode canary with semantic `chatgpt:premium`, public
   `--browser-no-thinking-time`, one small attachment, one unique expected
   token, `--browser-keep-browser`, and no retry. Reattach read-only if the
   provider effect is uncertain; never resend.
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
  smoke, one new provider prompt, one attachment upload, one Send, and one
  recovered-conversation artifact fetch.
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
- Do not absorb P08, P16, P18, or P29. One evidence-driven correction pass is
  allowed only for a confirmed pre-effect local/configuration defect; no second
  provider Send or artifact-fetch attempt is allowed.

## Definition Of Done

Current published Plan 0340 bytes are installed and source-identical; one
identity-qualified attached-file canary and one read-only artifact-fetch exit
proof satisfy LVA-R1 through LVA-R6; unrelated paused controls and the recovered
conversation are unchanged; and the durable receipt is integrated and
published on `main`.
