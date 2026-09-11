# Installed Plan 0346 Live Acceptance | 0347-2026-09-11

State: CLOSED
Lane: P40
Operational state: TERMINAL_FINDING
Branch: ops/plan0347-installed-plan0346-live-acceptance
Target: main
Integration: merge
Revision: 2 | 2026-09-11

## Stable Objective

Install exact published Plan 0346 bytes and run one bounded live adoption packet
that proves current compact `6Pro` selection can submit successfully and the
recovered Deep Research conversation materializes a genuine PDF rather than
admitting retained or DOCX bytes.

## Current State

- Published `main` is clean and local/remote equal at `36914e877`; P39 is
  provider-free accepted and integrated.
- Provider-free evidence passes 353/353 affected tests, typecheck, production
  build, and plan audit. It is not installed/live acceptance.
- The last installed/live pass used source-identical Plan 0344 bytes. Identity
  passed, the explicit premium prompt stopped before Send on compact `6Pro`,
  and the one artifact fetch reported a false PDF that duplicated DOCX bytes.
- Existing runtime custody from P38 is six paused completions, no queued,
  running, or idle-waiting completions, active/running service PID `89826` with
  zero restarts, and persistent managed Chrome PID `71128` on port `45015`.
  These are prior receipts and must be refreshed before effects.
- P40's one install produced 523-file source/installed parity at normalized
  SHA-256 `97fb0011...`; service PID `96978` is active/running with zero
  restarts. The one identity smoke matched, exited 0, and launched no browser.
- The only prompt attempt again stopped before Send. Compact `6Pro` now passes
  trigger admission, but the option-selection path still reported no matching
  `6 Pro` option even while listing `6Pro`. Session `plan-p40-six-pro` has null
  conversation/output, zero Sends, zero retries, and no fallback.
- The serialized artifact fetch was withheld after the prompt gate failed, so
  PDF acceptance remains unspent. Final custody is six paused and zero queued,
  running, or idle-waiting completions; Chrome PID `71128` and service PID
  `96978` remain responsive/stable.
- Terminal receipt:
  `docs/dev/notes/2026-09-11-plan0347-installed-live-acceptance.json`.

## Execution Graph

Owner: primary agent. No subagents are authorized for this lane.

1. Publish this plan and P40 registration from exact published `main` before
   any install or provider effect.
2. Re-run the 353 affected provider-free tests, typecheck, production build,
   plan audit, and exact Git/source preflight.
3. Read back narrow completion, service, and managed-browser custody. Stop on
   any active work, identity ambiguity, missing browser owner, CAPTCHA, human
   verification, or unexpected runtime drift.
4. Run exactly one supported user-runtime install and prove complete source /
   installed `dist` parity plus service identity.
5. Run one installed no-prompt identity smoke, then one explicit
   `chatgpt:premium` Chat prompt with selection strategy, at most one Send, no
   thinking-time selection, no fallback, and no retry.
6. Run one read-only artifact fetch for recovered conversation
   `6aa368bc-43c4-83ea-8d98-964264dd4340`. Verify Markdown, DOCX, and PDF
   manifest entries independently, including actual names, extensions, MIME,
   sizes, hashes, and binary signatures.
7. Persist a redacted receipt, reconcile final narrow runtime custody, close or
   record one terminal finding, integrate exact evidence, and close local Git
   custody when eligible.

## Acceptance Criteria

- `ILA-R1`: one supported install binds exact published source SHA to installed
  metadata; complete source/installed `dist` inventories and normalized hashes
  match, and the service is active/running with a stable restart count.
- `ILA-R2`: one installed identity smoke exits normally, matches the configured
  account and browser ownership, and launches no new browser.
- `ILA-R3`: the only prompt attempt requests `chatgpt:premium`, desires semantic
  `6 Pro`, selects the current compact `6Pro` provider surface, preserves that
  raw observed label, issues at most one Send, receives exactly
  `AURACALL_P40_6PRO_OK_20260911`, and uses no retry or `current` fallback.
- `ILA-R4`: the only recovered-conversation fetch materializes Markdown, DOCX,
  and PDF independently. The PDF has a `.pdf` name, `application/pdf` MIME,
  `%PDF-` bytes, and a hash distinct from DOCX. Retained/wrong variants cannot
  count as fresh success; no fetch retry or conversation mutation occurs.
- `ILA-R5`: final service/browser ownership and paused/queued/running/idle-
  waiting completion posture are freshly read back, with no scheduler,
  completion, live-follow, background-drain, or materialization control effect.
- `ILA-R6`: plan, lane, roadmap, runbook, journal, receipt, Git history, and
  published `main` agree on accepted or terminal-finding disposition.

## Bounds And Hard Stops

- Exactly one supported install, one identity smoke, one prompt attempt with at
  most one Send, and one artifact fetch. No retry, resend, fallback to current,
  alternate profile, second conversation, or additional provider canary.
- Never click `Answer now`. CAPTCHA, reCAPTCHA, `google.com/sorry`, human-
  verification, account mismatch, browser-owner ambiguity, active completion,
  or post-effect uncertainty is a hard stop.
- Recovered conversation access is read-only. Do not mutate, regenerate,
  continue, retry, rename, delete, or otherwise alter it.
- Do not run broad aggregate status, scheduler/completion/materialization
  controls, background drain, developer-app response, Skill execution, or
  unrelated browser inspection.
- Retained artifacts are authoritative history. Do not delete, overwrite, or
  relabel them to improve acceptance counts.

## Definition Of Done

ILA-R1 through ILA-R6 are live accepted and integrated, or the bounded packet
records one terminal finding with exact effect counts and custody. Only live
acceptance closes the end-to-end goal; a terminal finding continues through a
new provider-free repair under the existing goal authority.
