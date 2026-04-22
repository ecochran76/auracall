# Installed Runtime Dogfood | 0046-2026-04-22

State: CLOSED
Lane: P01

## Scope

Dogfood the user-scoped installed runtime from a neutral working directory so
daily usage no longer depends on the repo checkout being the current working
directory.

## Current State

- `~/.local/bin/auracall` is installed from the current checkout tarball under
  `~/.auracall/user-runtime`.
- The installed runtime reads the shared `~/.auracall` config and browser state
  correctly from `/tmp/auracall-installed-dogfood`.
- There is no evidence that repo-cwd assumptions block normal CLI, browser, or
  local API usage.

## Result

- Config and profile readback from the installed runtime resolved the expected
  AuraCall runtime profiles, browser profiles, and `auracall-solo` team member.
- Grok doctor passed through the installed runtime against the active default
  managed browser profile.
- ChatGPT default doctor reported no active default DevTools session, but
  `--profile wsl-chrome-2` attached to the active ChatGPT managed browser
  profile and identified `consult@polymerconsultinggroup.com`.
- A real installed-runtime ChatGPT team run succeeded with
  `AURACALL_INSTALLED_CHATGPT_OK`, confirming the stricter doctor
  `sendButton` result was not a blocking runtime failure.
- Gemini doctor stayed passive, confirmed the default managed browser profile
  is signed in as `ecochran76@gmail.com`, and did not launch or repeatedly probe
  Gemini.
- Installed `api serve --port 8099` started from the neutral directory,
  reported `/status.ok = true`, and was stopped cleanly.

## Acceptance Criteria

- Installed CLI commands work from outside the repo checkout.
- Installed browser-backed team execution works for at least one non-Grok
  provider without relying on repo-local `tsx`.
- Gemini verification remains passive unless a human-cleared browser state is
  intentionally selected.
- Installed local API server can bind and report status from outside the repo.

## Validation

- `ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 ~/.local/bin/auracall config show --team auracall-solo --json`
- `ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 ~/.local/bin/auracall profile list --json`
- `ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 ~/.local/bin/auracall --version`
- `ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 ~/.local/bin/auracall status --hours 4 --limit 5`
- `ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 DISPLAY=:0.0 ~/.local/bin/auracall doctor --target grok --json`
- `ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 DISPLAY=:0.0 ~/.local/bin/auracall --profile wsl-chrome-2 doctor --target chatgpt --json`
- `ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 DISPLAY=:0.0 ~/.local/bin/auracall teams run auracall-chatgpt-solo "Reply exactly with: AURACALL_INSTALLED_CHATGPT_OK" --title "AuraCall installed ChatGPT dogfood" --prompt-append "Do not use tools. Reply with exactly AURACALL_INSTALLED_CHATGPT_OK and nothing else." --max-turns 1 --json`
- `ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 DISPLAY=:0.0 ~/.local/bin/auracall doctor --target gemini --json`
- `ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 DISPLAY=:0.0 ~/.local/bin/auracall api serve --port 8099`
- `curl -sS http://127.0.0.1:8099/status`
