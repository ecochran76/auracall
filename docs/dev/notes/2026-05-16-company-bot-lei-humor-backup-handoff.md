# Company-Bot Lei Humor Backup Handoff

Date: 2026-05-16

## Summary

`company-bot` is trying to use AuraCall as a backup writer for Lei's SoyLei
end-of-day humor digest when OpenClaw fails after deterministic source
ingestion. The deterministic `company-bot` side successfully builds a daily
humor packet and packages the exact personality/lore/event files for AuraCall,
but the SoyLei ChatGPT browser path stalled before a project-bound run actually
submitted or materialized an output.

This looks like an AuraCall ChatGPT browser/profile/project readiness issue, not
a `company-bot` packet-generation issue.

## Calling Workflow

Repository:

- `/home/ecochran76/workspace.local/company-bot`

Runtime data used for the smoke:

- Run directory:
  `/home/ecochran76/workspace.local/company-bot/generated/soylei/humor/replays/2026-05-15`
- OpenClaw replay output for comparison:
  `lei-humor-post.md`
- AuraCall backup package:
  `lei-humor-auracall-backup-manifest.json`
  `lei-humor-auracall-backup-prompt.txt`

The backup runner command shape was:

```bash
python3 scripts/company_bot.py humor-digest auracall-backup \
  --tenant soylei \
  --bot lei \
  --date 2026-05-15 \
  --run-dir generated/soylei/humor/replays/2026-05-15 \
  --auracall-bin /home/ecochran76/.local/bin/auracall \
  --no-dry-run \
  --force
```

That invokes:

```bash
auracall \
  --agent pro-extended-chatgpt-soylei \
  --engine browser \
  --browser-target chatgpt \
  --project-name Lei \
  --model gpt-5.2-pro \
  --browser-attachments always \
  --slug soylei-lei-humor-backup-2026-05-15 \
  --timeout auto \
  --write-output generated/soylei/humor/replays/2026-05-15/lei-humor-auracall-backup-post.md \
  --prompt <backup prompt> \
  --file <20 package files> \
  --wait \
  --force
```

The package included 20 files:

- Lei personality files from `~/.company-bot/soylei/lei`, including `SOUL.md`,
  `shared/personality-core.md`, `personality/voice.md`, user profiles, banter
  lore, people lore, `runtime-lore-pack.json`, and the recent banter ledger.
- Daily event files from the company-bot run directory, including
  `humor-packet.json`, `lei-humor-prompt.txt`, and `lei-humor-state.json`.

## Intended Behavior

AuraCall should have:

1. Resolved `agent:pro-extended-chatgpt-soylei` to the SoyLei ChatGPT runtime
   profile/account.
2. Resolved the ChatGPT project named `Lei`.
3. Navigated the SoyLei managed ChatGPT browser profile into that project.
4. Uploaded the package files or otherwise attached them to the project-bound
   prompt.
5. Selected `gpt-5.2-pro`.
6. Submitted the prompt.
7. Waited for a final assistant response.
8. Wrote only the final post text to:
   `/home/ecochran76/workspace.local/company-bot/generated/soylei/humor/replays/2026-05-15/lei-humor-auracall-backup-post.md`

The expected output is a Slack-ready humor digest comparable to the existing
OpenClaw replay post, grounded in the same `humor-packet.json` and Lei
personality/lore files. No Slack post was requested during the smoke.

## What Actually Happened

The `company-bot` runner successfully wrote:

- `lei-humor-auracall-backup-manifest.json`
- `lei-humor-auracall-backup-prompt.txt`

The live AuraCall process started and remained alive for about five minutes, but
it produced no:

- `lei-humor-auracall-backup-post.md`
- `lei-humor-auracall-backup-run.json`
- `lei-humor-auracall-backup-error.json`
- `auracall status` entry for the attempted run

The process was killed manually to avoid leaving a runaway browser job.

The same pattern happened when trying to create the requested ChatGPT project:

```bash
auracall --agent pro-extended-chatgpt-soylei projects create Lei \
  --target chatgpt \
  --model gpt-5.2-pro \
  --memory-mode project \
  --instructions-file <tmpfile>
```

That project-creation command also stayed silent for several minutes and was
killed.

A quick doctor probe also stalled:

```bash
auracall --agent pro-extended-chatgpt-soylei doctor --target chatgpt
```

That was killed after a short bounded wait.

## Evidence Observed

AuraCall profile inventory showed the expected SoyLei-capable agent:

- `pro-extended-chatgpt-soylei -> runtime profile wsl-chrome-3 -> browser
  profile wsl-chrome-3 -> default service chatgpt`

Cached ChatGPT projects for `eric.cochran@soylei.com` did not include a project
named `Lei`:

- `SoyLei`
- `ChE 4470`
- `Transcripts`
- `ChE 4470/5470 Seminar Grading`

`~/.auracall/runtime/dom-drift-observations.jsonl` contained recent ChatGPT
account-mirror collector timeouts, including for `wsl-chrome-3`:

```text
Account mirror metadata collector timed out for chatgpt/wsl-chrome-3.
```

`~/.auracall/browser-state.json` showed the SoyLei ChatGPT managed browser
profile at an unrelated project URL during this period:

```text
https://chatgpt.com/g/g-p-6a0485902cc481918bb72066dd7164b9/project
```

That URL corresponds to the seminar grading project, not a `Lei` project.

## Interpretation

The most likely failure is project/profile readiness in AuraCall's ChatGPT
browser path:

- The requested project name `Lei` does not currently appear in the SoyLei
  ChatGPT project cache.
- Project creation through the same SoyLei AuraCall agent also stalled.
- Doctor through the same SoyLei AuraCall agent stalled.
- There are recent account-mirror collector timeouts for the SoyLei ChatGPT
  runtime profile (`wsl-chrome-3`).
- No run record or transcript was written, so failure likely happened before
  normal run-status recording or before the configured executor could report a
  structured error.

This may be related to the existing project-bound dispatch/readiness class
already seen in other handoff notes, but this smoke is narrower: a
project-bound ChatGPT browser run with uploads, `--project-name Lei`, and
`--write-output` should either complete or fail fast with a diagnostic artifact.

## Requested AuraCall Fix

Please make the SoyLei project-bound ChatGPT path deterministic and diagnosable
for this workflow.

Recommended acceptance criteria:

1. `auracall --agent pro-extended-chatgpt-soylei projects --target chatgpt`
   returns or fails within a bounded time and clearly reports account/profile
   readiness.
2. `auracall --agent pro-extended-chatgpt-soylei projects create Lei ...`
   either creates the project, reports that it already exists, or fails with a
   concrete browser/account/project diagnostic.
3. A project-bound run with `--project-name Lei`, `--browser-attachments always`,
   and `--write-output <path>` lands in the resolved project URL before
   submission.
4. If project resolution fails, or if the browser remains on the wrong project
   or ChatGPT root page, the command exits nonzero and writes a useful
   transcript/error instead of hanging silently.
5. If upload/submission starts, the response run is visible via `auracall
   status` or an equivalent run-status surface.
6. The following non-posting smoke writes the backup post file:

```bash
cd /home/ecochran76/workspace.local/company-bot
set -a; . /home/ecochran76/credentials/API-keys.env; set +a
python3 scripts/company_bot.py humor-digest auracall-backup \
  --tenant soylei \
  --bot lei \
  --date 2026-05-15 \
  --run-dir generated/soylei/humor/replays/2026-05-15 \
  --auracall-bin /home/ecochran76/.local/bin/auracall \
  --no-dry-run \
  --force
```

Success means:

- `lei-humor-auracall-backup-post.md` exists and contains only the final
  Slack-ready post text.
- `lei-humor-auracall-backup-run.json` or another durable run record exists.
- The generated post is grounded in `humor-packet.json` and uses the uploaded
  Lei personality/lore files.
- No Slack message is posted during the smoke.

## Do Not

- Do not retry the live smoke indefinitely against the same managed browser
  profile while account-mirror/project resolution is timing out.
- Do not silently fall back to a different ChatGPT account; this backup must use
  the SoyLei tenant/account.
- Do not silently fall back to ChatGPT root when `--project-name Lei` is
  requested.
- Do not auto-reseed or quarantine the managed browser profile without explicit
  operator approval.

## AuraCall Follow-up, 2026-05-16

Implemented the first fail-fast slice in AuraCall:

- `auracall projects` now routes through the LLM service wrapper instead of
  calling the raw provider adapter directly.
- `auracall projects` and `auracall projects create` now support
  `--operation-timeout <seconds|auto>` and default to bounded browser project
  operations.
- `/v1/projects/ensure` and the MCP project ensure tool now accept `timeoutMs`
  and return a bounded timeout error when project listing or project creation
  stalls.
- `auracall doctor` now supports `--operation-timeout <seconds|auto>` and emits
  a JSON doctor contract with local browser state plus the probe timeout reason.

Validation:

```bash
pnpm vitest run tests/projects.projectEnsureService.test.ts
pnpm exec tsc --noEmit --pretty false
git diff --check -- bin/auracall.ts src/projects/projectEnsureService.ts tests/projects.projectEnsureService.test.ts
```

Live SoyLei evidence after this fix:

```bash
pnpm tsx bin/auracall.ts --agent pro-extended-chatgpt-soylei projects \
  --target chatgpt --refresh --operation-timeout 8
```

Now fails nonzero with:

```text
chatgpt project listing timed out after 8s. The browser operation may still be
blocked on provider readiness; run doctor and inspect browser-state before
retrying.
```

```bash
pnpm tsx bin/auracall.ts --agent pro-extended-chatgpt-soylei doctor \
  --target chatgpt --json --operation-timeout 8
```

Now emits a browser-doctor JSON contract and exits nonzero. The contract confirms
that the resolved managed profile is
`/home/ecochran76/.auracall/browser-profiles/wsl-chrome-3/chatgpt` on port
`9222`, but provider app identity was not verified for
`eric.cochran@soylei.com` before the probe deadline. Chrome's Google identity
inside that profile is `ecochran76@gmail.com`, which remains informational until
the provider app session can be read.

Implemented the second readiness/recovery slice:

- ChatGPT provider-app identity probing now bounds the `/api/auth/session` fetch
  with `AbortController` and retries briefly when a fresh tab is still settling.
- Chrome DevTools target listing now has a bounded timeout instead of being able
  to hang project/doctor operations indefinitely.
- ChatGPT tab attach now detects an unresponsive selected page target and, for
  non-active-tab operations, excludes that target and opens a fresh ChatGPT tab
  without quarantining or reseeding the managed browser profile.
- Browser doctor can synthesize a live managed-profile entry from the OS Chrome
  process when the browser service registry is stale, without mutating the
  registry.
- Browser doctor reports provider-app identity as the authority for ChatGPT
  account matching. Chrome/Google profile mismatch remains informational when
  the provider app session matches the expected ChatGPT account.
- ChatGPT project name matching is now exact-normalized only; short names such
  as `Lei` no longer fuzzy-match longer names such as `SoyLei`.

Live SoyLei evidence after this fix:

```bash
pnpm tsx bin/auracall.ts --agent pro-extended-chatgpt-soylei projects \
  --target chatgpt --refresh --operation-timeout 25
```

returned SoyLei projects including:

```json
{
  "id": "g-p-6a08e8fee1788191bcb052b00d6bb7b3",
  "name": "Lei",
  "provider": "chatgpt",
  "url": "https://chatgpt.com/g/g-p-6a08e8fee1788191bcb052b00d6bb7b3/project"
}
```

The `Lei` project was created by:

```bash
pnpm tsx bin/auracall.ts --agent pro-extended-chatgpt-soylei projects create Lei \
  --target chatgpt \
  --model gpt-5.2-pro \
  --memory-mode project \
  --operation-timeout 60
```

Validation:

```bash
pnpm vitest run tests/browser/providerCache.test.ts tests/browser/chatgptAdapter.test.ts \
  --testNamePattern "project cache matching|auth session expression|normalizeChatgptAuthSessionIdentity"
pnpm exec tsc --noEmit --pretty false
```

Remaining work before retrying the Lei smoke:

1. Install the updated AuraCall runtime used by `/home/ecochran76/.local/bin/auracall`.
2. Confirm the installed CLI sees the `Lei` project for
   `agent:pro-extended-chatgpt-soylei`.
3. Rerun the company-bot non-posting backup smoke once.

Installed runtime and smoke result:

```bash
pnpm run install:user-runtime
/home/ecochran76/.local/bin/auracall --agent pro-extended-chatgpt-soylei projects \
  --target chatgpt --refresh --operation-timeout 25
```

The installed CLI sees `Lei` on `eric.cochran@soylei.com`.

The first installed company-bot smoke reached the correct `Lei` project and
created a ChatGPT conversation, but an operator-side status inspection exposed
two remaining runtime issues:

- Session liveness could falsely classify the run as `chrome-disconnected`
  because the all-Chrome PID cache could select a renderer process for the same
  `--user-data-dir` instead of the browser process.
- A recovered reattach captured the assistant response but did not materialize
  the original `--write-output` target.

AuraCall follow-up fixes:

- The all-Chrome process cache now uses the same browser-process preference as
  direct process lookup: browser process first, remote-debugging port preferred,
  renderer processes de-prioritized.
- Reattach success now writes `metadata.options.writeOutputPath` when a browser
  run had requested `--write-output`.

Validation:

```bash
pnpm vitest run tests/browser/reattach.e2e.test.ts tests/browser-service/processCheck.test.ts \
  tests/browser/providerCache.test.ts tests/browser/chatgptAdapter.test.ts \
  --testNamePattern "marks session completed|prefers the browser process|project cache matching|auth session expression|normalizeChatgptAuthSessionIdentity"
pnpm exec tsc --noEmit --pretty false
git diff --check -- bin/auracall.ts packages/browser-service/src/chromeLifecycle.ts \
  packages/browser-service/src/processCheck.ts src/browser/profileDoctor.ts \
  src/browser/providers/cache.ts src/browser/providers/chatgptAdapter.ts \
  src/cli/sessionDisplay.ts tests/browser/reattach.e2e.test.ts \
  tests/browser-service/processCheck.test.ts tests/browser/chatgptAdapter.test.ts \
  tests/browser/providerCache.test.ts \
  docs/dev/notes/2026-05-16-company-bot-lei-humor-backup-handoff.md
```

Second installed company-bot smoke completed:

```bash
cd /home/ecochran76/workspace.local/company-bot
set -a; . /home/ecochran76/credentials/API-keys.env; set +a
python3 scripts/company_bot.py humor-digest auracall-backup \
  --tenant soylei \
  --bot lei \
  --date 2026-05-15 \
  --run-dir generated/soylei/humor/replays/2026-05-15 \
  --auracall-bin /home/ecochran76/.local/bin/auracall \
  --no-dry-run \
  --force
```

Evidence:

- AuraCall session `soylei-lei-humor-backup-2026-2` completed.
- ChatGPT conversation:
  `https://chatgpt.com/g/g-p-6a08e8fee1788191bcb052b00d6bb7b3-lei/c/6a08ebbd-1814-83ea-bd32-e1ec3d23a461`
- Company-bot wrote:
  `generated/soylei/humor/replays/2026-05-15/lei-humor-auracall-backup-post.md`
- Company-bot wrote the durable command record:
  `generated/soylei/humor/replays/2026-05-15/lei-humor-auracall-backup-run.json`
