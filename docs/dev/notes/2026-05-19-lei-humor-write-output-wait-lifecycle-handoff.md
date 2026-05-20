# Lei Humor `--write-output --wait` Lifecycle Handoff

Date: 2026-05-19

## Summary

`company-bot` successfully used AuraCall browser mode to generate and post Lei's
SoyLei end-of-day humor digest, but the AuraCall process did not exit cleanly
after writing the requested `--write-output` file.

The current workflow is operational because `company-bot` now treats a
materialized output file as recoverable success and terminates the still-running
AuraCall process after a bounded grace period. That should be considered a
caller-side guardrail, not proof that AuraCall browser mode is fully healthy.

## Calling Workflow

Caller repo:

```text
/home/ecochran76/workspace.local/company-bot
```

Timer:

```text
company-bot-eod-humor-digest-soylei-lei.timer
```

Timer command invokes:

```bash
/home/ecochran76/workspace.local/company-bot/scripts/run_eod_humor_digest.py \
  --tenant soylei \
  --bot lei \
  --slack-workspace default,soylei \
  --openclaw-bin /home/ecochran76/.nvm/versions/node/v24.14.0/bin/openclaw \
  --agent-id soylei-primary \
  --reply-account soylei \
  --reply-to C0B0AK14B7X \
  --primary-runner auracall \
  --openclaw-fallback-on-failure \
  --auracall-bin /home/ecochran76/.local/bin/auracall \
  --auracall-agent pro-extended-chatgpt-soylei \
  --auracall-project Lei \
  --auracall-model gpt-5.2-pro \
  --auracall-timeout auto \
  --auracall-reply-token-env SLACK_BOT_TOKEN_SOYLEI \
  --post
```

That eventually invokes AuraCall with this shape:

```bash
/home/ecochran76/.local/bin/auracall \
  --agent pro-extended-chatgpt-soylei \
  --engine browser \
  --browser-target chatgpt \
  --project-name Lei \
  --model gpt-5.2-pro \
  --browser-attachments always \
  --slug soylei-lei-humor-backup-2026-05-19 \
  --timeout auto \
  --write-output /home/ecochran76/workspace.local/company-bot/generated/soylei/humor/daily/2026-05-19/lei-humor-auracall-backup-post.md \
  --prompt <Lei humor prompt> \
  --file <23 package files> \
  --wait
```

## Expected Behavior

For a successful browser run with `--write-output <path> --wait`, AuraCall
should:

1. Resolve the `pro-extended-chatgpt-soylei` agent and SoyLei ChatGPT runtime
   profile.
2. Resolve the exact ChatGPT project named `Lei`.
3. Upload or attach the requested package files.
4. Submit the prompt.
5. Wait until the final assistant answer is available.
6. Write only the final assistant answer to the `--write-output` path.
7. Exit normally with return code `0`.
8. Leave a durable session/run record showing completed state.

## Observed Behavior

The May 19 scheduled run did generate and post successfully, but only through
caller-side materialized-output recovery.

Observed systemd service state:

```text
Started: 2026-05-19 18:00:03 CDT
Finished: 2026-05-19 18:06:25 CDT
Result: status=0/SUCCESS
```

Observed company-bot doctor line:

```text
latest-scheduled-run: status=posted kind=scheduled date=2026-05-19 phase=complete skipped=false reason=- observations=imcliWhatsAppSoyLei=0,slackDefaultMpims=2,whatsappChris=0 generation=auracall/materialized_recovery/rc=-15 post=/home/ecochran76/workspace.local/company-bot/generated/soylei/humor/daily/2026-05-19/lei-humor-auracall-backup-post.md error=- updated=2026-05-19T23:06:25+00:00
```

Observed AuraCall transcript fields:

```json
{
  "returncode": -15,
  "postMaterialized": true,
  "terminatedAfterPostMaterialization": true
}
```

The transcript stdout proves the browser run itself reached the important
milestones:

```text
Resolved project "Lei" to g-p-6a08e8fee1788191bcb052b00d6bb7b3
Packed 23 files into 1 bundle (contents counted in token estimate).
Launching browser mode (gpt-5.2-pro) with ~25,556 tokens.
Answer:
...
Saved assistant output to /home/ecochran76/workspace.local/company-bot/generated/soylei/humor/daily/2026-05-19/lei-humor-auracall-backup-post.md
```

But the process remained alive after writing the file. `company-bot` terminated
it, producing return code `-15`.

## Current External Evidence

Generated post:

```text
/home/ecochran76/workspace.local/company-bot/generated/soylei/humor/daily/2026-05-19/lei-humor-auracall-backup-post.md
```

AuraCall transcript:

```text
/home/ecochran76/workspace.local/company-bot/generated/soylei/humor/daily/2026-05-19/lei-humor-auracall-backup-run.json
```

Company-bot wrapper record:

```text
/home/ecochran76/workspace.local/company-bot/generated/soylei/humor/daily/2026-05-19/lei-humor-auracall-backup-wrapper.json
```

Company-bot final state:

```text
/home/ecochran76/workspace.local/company-bot/generated/soylei/humor/daily/2026-05-19/lei-humor-state.json
```

Slack post timestamp in SoyLei `#ask-lei`:

```text
1779231984.371089
```

Installed AuraCall CLI:

```text
/home/ecochran76/.local/bin/auracall
version: 0.1.1
```

## Interpretation

AuraCall's browser fetch/generation path was healthy enough to:

- resolve the correct `Lei` project,
- upload/package the files,
- drive ChatGPT to a final answer,
- extract the answer,
- and write the requested output file.

The unhealthy part is the lifecycle after successful materialization:

- `--wait` did not return after `--write-output` succeeded.
- AuraCall apparently left the browser-mode process alive after the final answer
  was captured and saved.
- Caller-side termination was required to avoid a stuck systemd oneshot.

This looks like an AuraCall browser-run completion/finalization bug, not a
company-bot source-ingestion or Slack-posting bug.

## Company-Bot Workaround Already Installed

`company-bot` commit:

```text
baeadaf Harden AuraCall humor posting recovery
```

added the guardrail:

- poll the `--write-output` path while AuraCall is still running,
- once a non-empty post file is stable for a bounded grace period, terminate
  AuraCall,
- treat that as recoverable success,
- continue Slack posting and run-state bookkeeping.

Follow-up status commit:

```text
dc78a65 Surface humor generation recovery status
```

made the distinction visible via:

```bash
cd /home/ecochran76/workspace.local/company-bot
python3 scripts/company_bot.py humor-digest doctor --tenant soylei --bot lei
```

Healthy ordinary AuraCall completion should show:

```text
generation=auracall/ordinary_success/rc=0
```

The current degraded-but-recovered state shows:

```text
generation=auracall/materialized_recovery/rc=-15
```

## Requested AuraCall Troubleshooting

Please investigate why a ChatGPT browser-mode run with
`--write-output <path> --wait` remains alive after the final answer is captured
and written.

Recommended focus areas:

1. Browser-mode finalization after assistant output extraction.
2. Any active wait loops that keep polling after `writeOutputPath` is
   successfully materialized.
3. Session completion state and whether the run is marked completed before the
   CLI process exits.
4. Cleanup behavior for uploaded-file/project-bound ChatGPT runs.
5. Whether `--wait` waits for a browser/session status that is not updated after
   output materialization.

## Reproduction Command

Use a non-posting reproduction first:

```bash
cd /home/ecochran76/workspace.local/company-bot
set -a; . /home/ecochran76/credentials/API-keys.env; set +a
python3 scripts/company_bot.py humor-digest auracall-backup \
  --tenant soylei \
  --bot lei \
  --date 2026-05-19 \
  --run-dir generated/soylei/humor/daily/2026-05-19 \
  --auracall-bin /home/ecochran76/.local/bin/auracall \
  --no-dry-run \
  --force
```

Note: because company-bot now has materialized-output recovery, this wrapper may
terminate AuraCall after the output is stable. To debug AuraCall directly, run
the equivalent `/home/ecochran76/.local/bin/auracall ... --write-output ... --wait`
command with a fresh temporary output path and watch whether it exits after
printing `Saved assistant output to ...`.

## Acceptance Criteria

1. The direct AuraCall command exits with return code `0` after writing
   `--write-output`.
2. `company-bot humor-digest doctor` reports the latest run as:

   ```text
   generation=auracall/ordinary_success/rc=0
   ```

3. The post file exists and contains only the final assistant answer.
4. The session/run record, if present, shows completed state rather than an
   interrupted or terminated process.
5. The SoyLei timer remains a normal successful systemd oneshot without relying
   on caller-side SIGTERM recovery.

## Do Not

- Do not silently change the SoyLei ChatGPT account or project.
- Do not treat the company-bot recovery guardrail as the desired AuraCall end
  state.
- Do not remove `--wait`; the workflow needs deterministic completion.
- Do not post to Slack while debugging unless explicitly requested.

