# Installed Plan 0342 Live Acceptance | 0343-2026-09-11

State: CLOSED
Lane: P36
Operational state: LIVE_VERIFICATION_COMPLETED_WITH_TERMINAL_FINDINGS_INTEGRATED
Branch: ops/plan0343-installed-plan0342-live-acceptance
Target: main
Integration: merge
Revision: 4 | 2026-09-11

## Stable Objective

Install exact published Plan 0342 `main` and run the smallest serialized live
proof of its identity-smoke exit, explicit current `6 Pro` trigger, persisted
observed-model provenance, and independent three-artifact settlement without
mutating the recovered Deep Research conversation or unrelated runtime controls.

## Current State

- Published `main` is clean and local/remote equal at
  `ab01c510a5dca6ad26b66f376861661541fb588a`; P35 is provider-free accepted,
  integrated, and locally closed.
- The installed `0.1.1` runtime was last installed at
  `2026-09-11T11:16:56.288Z` from the same integration checkout before P35.
  Current source has 523 built files while the installed runtime has 522, so a
  supported refresh is required before live proof.
- API service PID `47500` is active/running with `NRestarts=1`, inherited from
  P34's broad-status OOM. Six account-mirror completions remain paused with
  zero queued, running, or idle-waiting. P36 will not call broad `/status` or
  invoke any scheduler, completion, live-follow, background-drain, or
  materialization control.
- AuraCall runtime profile `wsl-chrome-3` maps to browser profile
  `wsl-chrome-3` and managed browser profile
  `~/.auracall/browser-profiles/wsl-chrome-3/chatgpt`. Persistent Chrome owner
  PID `71128` remains on DevTools port `45015`; responsive ownership and exact
  account identity remain pre-effect gates.
- Recovered conversation `6aa368bc-43c4-83ea-8d98-964264dd4340` and its
  Markdown, DOCX, and PDF are authoritative. One successor read-only artifact
  fetch is authorized solely to adopt P35; no prompt, retry, recreation,
  rename, delete, or other mutation is authorized on that conversation.
- Graphiti is healthy but its reviewed atlas returned no relevant AuraCall
  cloud. Current repository, P34 receipt, installed metadata, runtime files,
  and direct readbacks are authoritative.
- The single supported install completed from the published P36 topic. Source
  and installed `dist` each contain 523 files with equal normalized SHA-256
  `74ea79a3f4486eaedb90d585b2fa763ce3941581a915dfed38003ab633446143`;
  service PID `37901` is active/running with `NRestarts=0`.
- The installed identity smoke exited normally in one second, proved the exact
  configured Pro/personal identity, launched no browser, and retained Chrome
  PID `71128` on DevTools `45015`.
- The single effect-capable prompt attempt persisted desired `6 Pro`, explicit
  `select`, and Chat mode, then timed out waiting 35 seconds for the model
  selector. Its Session is `error` with no conversation or output, so no Send
  completed. The terminal selector finding was not retried or replaced with
  `current`.
- The single recovered-conversation artifact fetch exited normally in 24
  seconds but materialized only Markdown; DOCX and PDF each failed with
  `Promise was collected`. Previously recovered Markdown, DOCX, and PDF bytes
  remain intact at their recorded hashes, but the fresh fetch is terminally
  partial and not accepted.
- Six completions remain paused, scheduler control is unchanged, Chrome and the
  service remain responsive, and no broad status, retry, resend, recovered
  conversation mutation, or scheduler/completion/materialization control ran.

## Execution Graph

Owner: primary agent. Every runtime/browser/provider operation is serialized.

1. Publish this P36 plan and lane from exact current main.
2. Run the affected provider-free suite, typecheck, production build, and diff
   gate; stop before installation on any failure.
3. Perform one supported `install:user-runtime-service` refresh. Bind the
   source and installed `dist` inventories, installed metadata, launcher, API
   PID/restart state, and preserved completion posture.
4. Run one installed `profile identity-smoke --target chatgpt
   --no-launch-if-needed --json` under a bounded caller. Require exact identity,
   normal CLI exit, and the same persistent Chrome owner afterward.
5. Run one installed Chat-mode prompt requesting `chatgpt:premium` with
   `modelStrategy=select`, no thinking-time selection, exact expected token
   `AURACALL_P36_6PRO_OK_20260911`, browser retention, and zero resend. Require
   the ordinary persisted Session to retain requested/desired identity and
   provider-observed exact `6 Pro` separately.
6. Run one installed read-only artifact fetch against the recovered
   conversation under a bounded caller. Require three independent successful
   entries, no `Promise was collected`, normal CLI exit, and unchanged provider
   conversation and persistent Chrome ownership.
7. Write a redacted durable receipt, validate docs/audits/Git state, integrate
   only accepted evidence, publish main, and re-check installed/service/browser
   custody.

## Acceptance Criteria

- `ILA-R1`: exact clean published source is installed once; normalized source
  and installed `dist` inventories match, installed metadata names the source,
  and the supported service refresh produces no unexpected automatic restart.
- `ILA-R2`: the no-prompt identity report proves the configured ChatGPT account,
  exits normally within 60 seconds, and leaves Chrome PID `71128` responsive.
- `ILA-R3`: one new short Chat turn returns the exact token with one Send and no
  retry; explicit semantic `chatgpt:premium` uses the current animated model
  trigger and the persisted ordinary Session records observed `6 Pro`
  separately from requested/desired model identity.
- `ILA-R4`: one read-only fetch yields successful Markdown, DOCX, and PDF
  manifest entries without `Promise was collected`, exits within 120 seconds,
  preserves existing files, and does not mutate or prompt the recovered
  conversation.
- `ILA-R5`: six completions remain paused with zero queued/running/idle-waiting;
  scheduler/background-drain/materialization controls remain untouched; Chrome
  ownership remains singular and responsive.
- `ILA-R6`: receipt, plan, lane, roadmap, runbook, journal, tests, typecheck,
  build, lint, planning audits, Git parity, and integration evidence agree with
  actual effects and distinguish acceptance from remaining follow-up.

## Bounds And Hard Stops

- At most one supported runtime/service installation, one identity smoke, one
  new provider prompt, one Send, zero prompt retries/resends, and one recovered
  conversation artifact fetch.
- Explicit selection failure before Send is a terminal selector finding; do not
  fall back to `current`. If Send state is uncertain or observed, inspect the
  stored Session/conversation read-only and never resend.
- Artifact timeout or partial materialization is terminal for this pass; do not
  retry the recovered conversation.
- Never click ChatGPT's `Answer now`. CAPTCHA, human verification, identity
  mismatch, nonresponsive/ambiguous browser ownership, nonempty composer, or
  missing Chat-mode proof is a hard stop.
- Do not call broad `/status`; do not pause/resume/start/cancel schedulers,
  completions, live-follow, background drain, or materialization.
- At most two local diagnosis/remediation attempts before an effect. After the
  single Send or artifact fetch, only read-only reconciliation is allowed.

## Definition Of Done

ILA-R1 through ILA-R6 have current durable evidence or an explicit terminal
finding, effect counters are exact, the recovered conversation remains
unmodified, and the bounded receipt is integrated and published.

## Final Disposition

- `ILA-R1`: PASS — exact installed-source parity and stable service refresh.
- `ILA-R2`: PASS — exact no-prompt identity and normal one-second CLI exit.
- `ILA-R3`: FAIL, TERMINAL — explicit `6 Pro` selector timeout before Send; no
  observed-model or response acceptance exists.
- `ILA-R4`: FAIL, TERMINAL — one of three fresh artifacts materialized; DOCX
  and PDF returned `Promise was collected` and were not retried.
- `ILA-R5`: PASS — runtime/browser/completion custody and excluded controls are
  preserved.
- `ILA-R6`: PASS — receipt/docs, provider-free gates, planning audit, topic
  publication, non-fast-forward integration, and merged-result checks pass.

P36 is verification-complete and integrated with terminal findings; it is not
live accepted.
The redacted receipt is
`docs/dev/notes/2026-09-11-plan0343-installed-live-acceptance.json`.

## Integration Receipt

- Published topic tip: `14d2f6ab26f38d6bdb4439cdd4bd43ecbb25fed7`.
- Non-fast-forward merge: `1ec768b4620ca931d905d39d334ad249086e556e`.
- Integration changes documentation and evidence only; no additional runtime,
  browser, provider, artifact, or control effect ran.

## Custody Closeout

- The published topic tip is clean, remote-equal, ancestral to published
  `main`, and owned by zero process working directories.
- Removed the local P36 worktree and local branch without force, including only
  ignored generated build/dependency files. The remote recovery ref remains.
