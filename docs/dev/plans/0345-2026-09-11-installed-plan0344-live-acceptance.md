# Installed Plan 0344 Live Acceptance | 0345-2026-09-11

State: CLOSED
Lane: P38
Operational state: LIVE_VERIFICATION_COMPLETED_WITH_TERMINAL_FINDINGS_INTEGRATED
Branch: ops/plan0345-installed-plan0344-live-acceptance
Target: main
Integration: merge
Revision: 4 | 2026-09-11

## Stable Objective

Install exact published Plan 0344 `main` and run the smallest serialized live
proof of its explicit current `6 Pro` selection, persisted observed-model
provenance, and independent three-artifact settlement without mutating the
recovered Deep Research conversation or unrelated runtime controls.

## Current State

- Published `main` is clean and local/remote equal at
  `51801cc4ec28620ea4b9f7cf67bbe26c41374d55`; P37 is provider-free accepted,
  integrated, and locally closed.
- Installed AuraCall `0.1.1` still contains the P36 build. API service PID
  `37901` is active/running with `NRestarts=0`; one supported refresh is
  required before live proof.
- AuraCall runtime profile `wsl-chrome-3` maps to browser profile
  `wsl-chrome-3` and managed browser profile
  `~/.auracall/browser-profiles/wsl-chrome-3/chatgpt`. Persistent Chrome owner
  PID `71128` remains on DevTools port `45015`; responsive singular ownership
  and exact account identity are pre-effect gates.
- Recovered conversation `6aa368bc-43c4-83ea-8d98-964264dd4340` is
  authoritative. One read-only artifact fetch is authorized solely to adopt
  P37; no prompt, retry, recreation, rename, delete, or mutation is authorized
  on that conversation.
- Graphiti is healthy but returned no relevant AuraCall cloud. Current
  repository artifacts, P36's receipt, installed metadata, and direct runtime
  readbacks are authoritative.
- The provider-free full-suite browser-launch leak is excluded from this lane.
  Only focused and affected tests may run before the live packet.
- The single supported install produced source/installed parity across 523
  files at normalized SHA-256 `af32d079b...`; service PID `89826` is
  active/running with `NRestarts=0`.
- The installed identity smoke matched the configured Pro/personal identity,
  exited normally in five seconds, launched no browser, and retained Chrome
  PID `71128` on DevTools `45015`.
- The single prompt attempt failed before Send because the current menu exposed
  `6Pro` while exact matching required `6 Pro`. Its Session is `error` with no
  conversation or output; no retry or `current` fallback ran.
- The single artifact fetch removed the old Promise-lifecycle failures, but its
  claimed PDF is a duplicate DOCX with the same filename extension, MIME type,
  size, and hash. The prior authoritative PDF remains intact; no retry ran.
- Six completions remain paused; queued/running/idle-waiting and active history
  materialization jobs remain zero. No broad status, recovered-conversation
  mutation, or scheduler/completion/materialization control ran.

## Execution Graph

Owner: primary agent. Every runtime/browser/provider operation is serialized.

1. Publish this P38 plan and lane from exact current main.
2. Run focused and affected provider-free tests, typecheck, production build,
   scoped lint, diff hygiene, and planning audits; stop before installation on
   any failure.
3. Perform one supported `install:user-runtime-service` refresh. Bind source
   and installed `dist` inventories, installed metadata, launcher, API
   PID/restart state, and preserved completion posture.
4. Run one installed `profile identity-smoke --target chatgpt
   --no-launch-if-needed --json` under a bounded caller. Require exact identity,
   normal CLI exit, and the same persistent Chrome owner afterward.
5. Run one installed Chat-mode prompt requesting semantic
   `chatgpt:premium`, strategy `select`, no thinking-time selection, exact token
   `AURACALL_P38_6PRO_OK_20260911`, browser retention, and zero resend. Require
   the persisted ordinary Session to retain requested/desired identity and
   provider-observed exact `6 Pro` separately.
6. Run one installed read-only artifact fetch against the recovered
   conversation under a bounded caller. Require three independent successful
   entries, no `Promise was collected`, normal CLI exit, and unchanged provider
   conversation and persistent Chrome ownership.
7. Write a redacted durable receipt, validate docs/audits/Git state, integrate
   the truthful result, publish main, and re-check installed/service/browser
   custody.

## Acceptance Criteria

- `ILA2-R1`: exact clean published source is installed once; normalized source
  and installed `dist` inventories match, installed metadata names the source,
  and the supported service refresh produces no unexpected automatic restart.
- `ILA2-R2`: the no-prompt identity report proves the configured ChatGPT
  account, exits normally within 60 seconds, and leaves Chrome PID `71128`
  responsive.
- `ILA2-R3`: one new short Chat turn returns the exact token with one Send and
  no retry; semantic `chatgpt:premium` selects exact current `6 Pro`, and the
  persisted ordinary Session records observed `6 Pro` separately from
  requested/desired model identity.
- `ILA2-R4`: one read-only fetch yields successful Markdown, DOCX, and PDF
  manifest entries without `Promise was collected`, exits within 120 seconds,
  preserves existing files, and does not mutate or prompt the recovered
  conversation.
- `ILA2-R5`: six completions remain paused with zero
  queued/running/idle-waiting; scheduler/background-drain/materialization
  controls remain untouched; Chrome ownership remains singular and responsive.
- `ILA2-R6`: receipt, plan, lane, roadmap, runbook, journal, tests, typecheck,
  build, lint, planning audits, Git parity, and integration evidence agree with
  actual effects and distinguish acceptance from any terminal finding.

## Bounds And Hard Stops

- At most one supported runtime/service installation, one identity smoke, one
  new provider prompt, one Send, zero prompt retries/resends, and one recovered
  conversation artifact fetch.
- Explicit selection failure before Send is terminal; do not fall back to
  `current`. If Send state is uncertain or observed, inspect the stored Session
  read-only and never resend.
- Artifact timeout or partial materialization is terminal; do not retry the
  recovered conversation.
- Never click ChatGPT's `Answer now`. CAPTCHA, human verification, identity
  mismatch, nonresponsive or ambiguous Chrome ownership, nonempty composer, or
  missing Chat-mode proof is a hard stop.
- Do not call broad `/status`; do not pause, resume, start, or cancel
  schedulers, completions, live-follow, background drain, or materialization.
- At most two local diagnostic attempts before an effect. After the single Send
  or artifact fetch, only read-only reconciliation is allowed.

## Definition Of Done

ILA2-R1 through ILA2-R6 have current durable evidence or an explicit terminal
finding, effect counters are exact, the recovered conversation remains
unmodified, and the bounded receipt is integrated and published.

## Final Disposition

- `ILA2-R1`: PASS — exact installed-source parity and stable service refresh.
- `ILA2-R2`: PASS — exact no-prompt identity and normal five-second CLI exit.
- `ILA2-R3`: FAIL, TERMINAL — live `6Pro` label drift rejected exact `6 Pro`
  matching before Send; no observed-model or response acceptance exists.
- `ILA2-R4`: FAIL, TERMINAL — all three entries reported materialized, but the
  PDF entry is byte-identical DOCX content with DOCX name and MIME type.
- `ILA2-R5`: PASS — runtime/browser/completion custody and excluded controls
  are preserved.
- `ILA2-R6`: PASS — receipt/docs, planning audit, topic publication,
  non-fast-forward integration, and merged-result checks pass.

P38 is verification-complete with terminal findings; it is not live accepted.
The redacted receipt is
`docs/dev/notes/2026-09-11-plan0345-installed-live-acceptance.json`.

## Integration Receipt

- Evidence commit: `89e40da9cc292e27640da6adbf48fa38004d4e77`.
- Published topic tip: `ce5ee0cedab1b2c0e8b6dd9a31b2a9651ececff0`.
- Non-fast-forward merge: `62b05600574c05282aa881d7f258ef24136485ed`.
- Integration changed documentation and evidence only; no additional runtime,
  browser, provider, artifact, recovered-conversation, or control effect ran.
