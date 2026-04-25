# Manual Test Suite (Browser Mode + Live API)

These checks validate the real Chrome automation path and the optional live
Responses API smoke suite. Run the browser steps whenever you touch Chrome
automation (lifecycle, cookie sync, prompt injection, Markdown capture, etc.),
and run the live API suite before shipping major transport changes.

## Prerequisites

- macOS with Chrome installed (default profile signed in to ChatGPT Pro).
- Node 22+ and `pnpm install` already completed.
- Headful display access (no `--browser-headless`).
- When debugging, add `--browser-keep-browser` so Chrome stays open after Aura-Call exits, then connect with `pnpm exec tsx scripts/browser-tools.ts ...` (screenshot, eval, DOM picker, etc.). The `pick` command is the general-purpose DOM inspector we use for browser automation selectors.
- Ensure no Chrome instances are force-terminated mid-run; let Aura-Call clean up once you’re done capturing state.
- Clipboard checks (`browser-tools.ts eval "navigator.clipboard.readText()"`) trigger a permission dialog in Chrome—approve it for debugging, but remember that we can’t rely on readText in unattended runs.
- On Gemini, if the browser shows `google.com/sorry`, CAPTCHA, reCAPTCHA, or
  similar human-verification state, stop automated retries immediately. Until
  captcha automation exists, a human must clear that page before any more
  automated Gemini steps on that managed browser profile.

## Test Cases

### Grok browser smoke (live)

Run the WSL-primary Grok acceptance checklist in `docs/dev/smoke-tests.md` before calling Grok browser support done. That checklist is the canonical runbook for:
- project create/list/rename/clone/instructions/files/remove
- account-wide `/files` add/list/remove
- conversation create/list/context/rename/delete
- root/non-project conversation file list/context/cache parity plus append-only `conversations files add`
- markdown capture and cache-freshness verification

Prefer the scripted runner first:
- `DISPLAY=:0.0 pnpm tsx scripts/grok-acceptance.ts`
- add `--profile <name>` to target a non-default Aura-Call profile
- add `--keep-projects` if you want the disposable project/clone preserved after a passing run

Treat Windows Chrome as supplemental/manual-debug coverage for now. It should not block the WSL Grok acceptance bar unless the change is specifically Windows-only.

For the post-acceptance Grok backlog, use `docs/dev/grok-remaining-crud-plan.md`. Conversation-scoped file read/list/cache parity and append-only add are now live for both project and non-project conversations; the current active slice is attachment/asset-manifest breadth beyond the visible file chips.

For Grok Imagine video, do not let Aura-Call click Video Submit yet. Use
`docs/grok-imagine-video-readback-runbook.md` to validate readback/status on a
human-submitted existing tab with the diagnostic readback probe.

### Quick browser port smoke

- `pnpm test:browser` — launches headful Chrome and checks the DevTools endpoint is reachable. Set `AURACALL_BROWSER_PORT` (or `AURACALL_BROWSER_DEBUG_PORT`) to reuse a fixed port when you’ve already opened a firewall rule.

### Gemini browser mode (Gemini web / cookies)

Run this whenever you touch the Gemini web client or the `--generate-image` / `--edit-image` plumbing.

Prereqs:
- Chrome profile is signed into `gemini.google.com`.
- If Gemini is currently on `google.com/sorry` or a CAPTCHA page, clear it
  manually before running these smokes.

1. Generate an image:
   `pnpm run auracall -- --engine browser --model gemini-3-pro --prompt "a cute robot holding a banana" --generate-image /tmp/gemini-gen.jpg --aspect 1:1 --wait --verbose`
   - Confirm the output file exists and is a real image (`file /tmp/gemini-gen.jpg`).
2. Edit an image:
   `pnpm run auracall -- --engine browser --model gemini-3-pro --prompt "add sunglasses" --edit-image /tmp/gemini-gen.jpg --output /tmp/gemini-edit.jpg --wait --verbose`
   - Confirm `/tmp/gemini-edit.jpg` exists.
3. Feature discovery:
   `pnpm tsx bin/auracall.ts features --target gemini --json`
   - Confirm the result includes a versioned `auracall.browser-features`
     contract and live Gemini drawer/toggle data.
4. Feature snapshot/diff:
   `pnpm tsx bin/auracall.ts features snapshot --target gemini --json`
   `pnpm tsx bin/auracall.ts features diff --target gemini --json`
   - Confirm snapshot writes succeed and `diff` compares against `latest.json`.
5. Blocking-page rule:
   - If the managed Gemini page is on `google.com/sorry`, CAPTCHA,
     reCAPTCHA, Cloudflare, or a similar human-verification surface, the
     commands above should stop early with manual-clear guidance instead of
     continuing into ordinary automation.

### Multi-Model CLI fan-out

Run this whenever you touch the session store, CLI session views, or TUI wiring for multi-model runs.

1. Kick off an API multi-run:  
   `pnpm run auracall -- --models "gpt-5.1-pro,gemini-3-pro" --prompt "Compare the moon & sun."`
   - Expect stdout to print sequential sections, one per model (`[gpt-5.1-pro] …` followed by `[gemini-3-pro] …`). No interleaved tokens.
2. Capture the session ID from the summary line. Run `auracall session --status --model gpt-5.1-pro`.  
   - Table should collapse to sessions that include GPT-5.1 Pro and show status icons (✓/⌛/✖) per model.
3. Inspect detailed logs: `auracall session <id>`
   - The metadata header now includes a `Models:` block with one line per model plus token counts.
   - When prompted, pick `View gemini-3-pro log` and confirm only that model’s stream renders. Refresh should keep completed models intact even if others still run.
4. Model filter path: `auracall session <id> --model gemini-3-pro`  
   - Attach mode should error if that model is missing (double-check by filtering for a bogus model), otherwise it should render the prompt + single-model log only.

### Write-output export (API)

Run this when touching session serialization, file IO helpers, or CLI flag plumbing.

1. `AURACALL_LIVE_TEST=1 OPENAI_API_KEY=<real key> pnpm vitest run tests/live/write-output-live.test.ts --runInBand`
   - Expect the test to create a temp `write-output-live.md` file containing `write-output e2e`.
2. Manual spot-check: `auracall --prompt "answer file smoke" --write-output /tmp/out.md --wait`
   - Confirm `/tmp/out.md` exists with the answer text and a trailing newline.
3. Multi-model spot-check: `auracall --models "gpt-5.1-pro,gemini-3-pro" --prompt "two files" --write-output /tmp/out.md --wait`
   - Confirm `/tmp/out.gpt-5.1-pro.md` and `/tmp/out.gemini-3-pro.md` exist with distinct content.

### Lightweight Browser CLI (manual exploration)

Before running any agent-driven debugging, you can rely on the TypeScript CLI in `scripts/browser-tools.ts`:

```bash
# Show help / available commands
pnpm tsx scripts/browser-tools.ts --help

# Launch Chrome with your normal profile so you stay logged in
pnpm tsx scripts/browser-tools.ts start --profile

# Drive the active tab
pnpm tsx scripts/browser-tools.ts nav https://example.com
pnpm tsx scripts/browser-tools.ts eval 'document.title'
pnpm tsx scripts/browser-tools.ts screenshot
pnpm tsx scripts/browser-tools.ts pick "Select checkout button"
pnpm tsx scripts/browser-tools.ts cookies
pnpm tsx scripts/browser-tools.ts inspect   # show DevTools-enabled Chrome PIDs/ports/tabs
pnpm tsx scripts/browser-tools.ts kill --all --force   # tear down straggler DevTools sessions
```

This mirrors Mario Zechner’s “What if you don’t need MCP?” technique and is handy when you just need a few quick interactions without spinning up additional tooling.

1. **Prompt Submission & Model Switching**
   - With Chrome signed in and cookie sync enabled, run  
     ```bash
     pnpm run auracall -- --engine browser --model "GPT-5.2" \
       --prompt "Line 1\nLine 2\nLine 3"
     ```
   - Observe logs for:
     - `Prompt textarea ready (xxx chars queued)` (twice: initial + after model switch).
     - `Model picker: ... 5.2 ...`.
     - `Clicked send button` (or Enter fallback).
   - In the attached Chrome window, verify the multi-line prompt appears exactly as sent.

2. **Markdown Capture**
   - Prompt:
     ```bash
     pnpm run auracall -- --engine browser --model "GPT-5.2" \
       --prompt "Produce a short bullet list with code fencing."
     ```
   - Expected CLI output:
     - `Answer:` section containing bullet list with Markdown preserved (e.g., `- item`, fenced code).
     - Session log (`auracall session <id>`) should show the assistant markdown (confirm via `grep -n '```' ~/.auracall/sessions/<id>/output.log`).

3. **Stop Button Handling**
  - Start a long prompt (`"Write a detailed essay about browsers"`) and once ChatGPT responds, manually click “Stop generating” inside Chrome.
  - Aura-Call should detect the assistant message (partial) and still store the markdown.

4. **Override Flag**
  - Run with `--browser-allow-cookie-errors` while intentionally breaking bindings.
  - Confirm log shows `Cookie sync failed (continuing with override)` and the run proceeds headless/logged-out.
- Remember: the browser composer now pastes only the user prompt (plus any inline file blocks). If you see the default “You are Aura-Call…” text or other system-prefixed content in the ChatGPT composer, something regressed in `assembleBrowserPrompt` and you should stop and file a bug.
- Heartbeats: Browser runs do **not** emit `--heartbeat` logs today. Heartbeat settings apply to streaming API runs only; ignore heartbeat toggles when validating browser mode.

## Post-Run Validation

- `auracall session <id>` should replay the transcript with markdown.
- `~/.auracall/sessions/<id>/meta.json` must include `browser.config` metadata (model label, cookie settings) and `browser.runtime` (PID/port).

Document results (pass/fail, session IDs) in PR descriptions so reviewers can audit real-world behavior.

## Recent Smoke Runs

- 2025-11-18 — API gpt-5.1 (`api-smoke-give-two-words`): returned “blue sky” in 2.5s.
- 2025-11-18 — API gpt-5.1-pro (`api-smoke-pro-three-words`): completed in 3m08s with “Fast API verification”.
- 2025-11-18 — Browser gpt-5.1 Instant (`browser-smoke-instant-two-words`): completed in ~10s; replied with a clarification prompt.
- 2025-11-18 — Browser gpt-5.1-pro (`browser-smoke-pro-three-words`): completed in ~1m33s; response noted “Search tool used.”.
- 2025-11-18 (rerun) — API gpt-5.1 (`api-smoke-give-two-words`): reconfirmed OK; same answer + cost bracket.
- 2025-11-18 (rerun) — Browser gpt-5.1-pro (`browser-smoke-pro-three-words`): reconfirmed OK; included heartbeat progress and search tool note.
- 2025-11-20 — Browser gpt-5.1 via `auracall serve` (remote host on same Mac): fetched https://example.com; title “Example Domain”; first sentence “This domain is for use in documentation examples without needing permission.” (ran via tmux sessions `oracle-serve` and `auracallent`).

## Browser Regression Checklist (manual)

Run these four smoke tests whenever we touch browser automation:

1. **GPT-5.2 simple prompt**  
   `pnpm run auracall -- --engine browser --model "GPT-5.2" --prompt "Give me two short markdown bullet points about tables"`  
   Expect two markdown bullets, no files/search referenced. Note the session ID (e.g., `give-me-two-short-markdown`).

2. **GPT-5.2 simple prompt**  
   `pnpm run auracall -- --engine browser --model gpt-5.2 --prompt "List two reasons Markdown is handy"`  
   Confirm the answer arrives (and only once) even if it takes ~2–3 minutes.

3. **GPT-5.2 + attachment**  
   Prepare `/tmp/browser-md.txt` with a short note, then run  
   `pnpm run auracall -- --engine browser --model "GPT-5.2" --prompt "Summarize the key idea from the attached note" --file /tmp/browser-md.txt`  
   Ensure upload logs show “Attachment queued” and the answer references the file contents explicitly.

4. **GPT-5.2 + attachment (verbose)**  
   Prepare `/tmp/browser-report.txt` with faux metrics, then run  
   `pnpm run auracall -- --engine browser --model gpt-5.2 --prompt "Use the attachment to report current CPU and memory figures" --file /tmp/browser-report.txt --verbose`  
   Verify verbose logs show attachment upload and the final answer matches the file data.

Record session IDs and outcomes in the PR description (pass/fail, notable delays). This ensures reviewers can audit real runs.

### Remote Chrome smoke test (CDP)

Run this whenever you touch CDP connection logic (remote chrome lifecycle, attachment transfer) or before executing remote sessions in CI.

1. Launch a throwaway Chrome instance with remote debugging enabled (adjust the path per OS):
   ```bash
   REMOTE_PROFILE=/tmp/oracle-remote-test-profile
   rm -rf "$REMOTE_PROFILE"
   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
     --headless=new \
     --disable-gpu \
     --remote-debugging-port=9333 \
     --remote-allow-origins=* \
     --user-data-dir="$REMOTE_PROFILE" \
     >/tmp/oracle-remote-chrome.log 2>&1 &
   export REMOTE_CHROME_PID=$!
   sleep 3
   ```
2. Run the helper to verify CDP connectivity:
   ```bash
   pnpm tsx scripts/test-remote-chrome.ts localhost 9333
   ```
   Expect ✓ logs for connection, protocol info, navigation to https://chatgpt.com/, and the final “POC successful!” line.
3. Tear down the temporary browser:
   ```bash
   kill "$REMOTE_CHROME_PID"
   rm -rf "$REMOTE_PROFILE"
   ```
   Use `pkill -f oracle-remote-test-profile` if Chrome refuses to exit cleanly.

Capture the pass/fail result (include the helper’s log snippet) in your PR description alongside other manual browser tests.

## Chrome DevTools / MCP Debugging

Use this when you need to inspect the live ChatGPT composer (DOM state, markdown text, screenshots, etc.). For smaller ad‑hoc pokes, you can often rely on `pnpm tsx scripts/browser-tools.ts …` instead.

1. **Launch within tmux**
   ```bash
   tmux new -d -s oracle-browser \\
     "pnpm run auracall -- --engine browser --browser-keep-browser \\
       --model 'GPT-5.2 Pro' --prompt 'Debug via DevTools.'"
   ```
   Keeping the run in tmux prevents your shell from blocking and ensures Chrome stays open afterward.

2. **Grab the DevTools port**
   - `tmux capture-pane -pt oracle-browser` to read the logs (`Launched Chrome … on port 56663`).
   - Verify the endpoint:
     ```bash
     curl http://127.0.0.1:<PORT>/json/version
     ```
     Note the `webSocketDebuggerUrl` for reference.

3. **Attach Chrome DevTools MCP**
   - One-off: `CHROME_DEVTOOLS_URL=http://127.0.0.1:<PORT> npx -y chrome-devtools-mcp@latest`
   - `mcporter` config snippet:
     ```json
     {
       "chrome-devtools": {
         "command": "npx",
         "args": [
           "-y",
           "chrome-devtools-mcp@latest",
           "--browserUrl",
           "http://127.0.0.1:<PORT>"
         ]
       }
     }
     ```
   - Once the server prints `chrome-devtools-mcp exposes…`, you can list/call tools via `mcporter`.

4. **Interact & capture**
   - Use MCP tools (`click`, `evaluate_js`, `screenshot`, etc.) to debug the composer contents.
   - Record any manual actions you take (e.g., “fired evaluate_js to dump #prompt-textarea.innerText”).

5. **Cleanup**
   - `tmux kill-session -t oracle-browser`
   - `pkill -f oracle-browser-<slug>` if Chrome is still running.

> **Tip:** Running `npx chrome-devtools-mcp@latest --help` lists additional switches (custom Chrome binary, headless, viewport, etc.).

## Team CLI Smoke

Use this before claiming live team readiness changes:

1. Confirm the configured live targets exist:
   ```bash
   pnpm tsx bin/auracall.ts config show --team auracall-solo
   pnpm tsx bin/auracall.ts config show --team auracall-chatgpt-solo
   pnpm tsx bin/auracall.ts config show --team auracall-cross-service
   pnpm tsx bin/auracall.ts config show --team auracall-cross-service-gemini
   pnpm tsx bin/auracall.ts config show --team auracall-two-step
   pnpm tsx bin/auracall.ts config show --team auracall-multi-agent
   pnpm tsx bin/auracall.ts config show --team auracall-tooling
   pnpm tsx bin/auracall.ts config show --team auracall-gemini-tooling
   ```
2. Run the bounded team execution smoke:
   ```bash
   ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 DISPLAY=:0.0 \
     pnpm tsx bin/auracall.ts teams run auracall-solo \
     "Reply exactly with: AURACALL_TEAM_SMOKE_OK" \
     --title "AuraCall team smoke" \
     --prompt-append "Do not use tools. Reply with exactly AURACALL_TEAM_SMOKE_OK and nothing else." \
     --max-turns 1 \
     --json
   ```
3. Run the bounded ChatGPT baseline smoke:
   ```bash
   ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 DISPLAY=:0.0 \
     pnpm tsx bin/auracall.ts teams run auracall-chatgpt-solo \
     "Reply exactly with: AURACALL_CHATGPT_TEAM_LIVE_SMOKE_OK" \
     --title "AuraCall ChatGPT team live smoke" \
     --prompt-append "Do not use tools. Reply with exactly AURACALL_CHATGPT_TEAM_LIVE_SMOKE_OK and nothing else." \
     --max-turns 1 \
     --json
   ```
4. Run the bounded two-step workflow smoke:
   ```bash
   ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 DISPLAY=:0.0 \
     pnpm tsx bin/auracall.ts teams run auracall-two-step \
     "Reply exactly with: AURACALL_TEAM_TWO_STEP_LIVE_SMOKE_OK" \
     --title "AuraCall two-step team live smoke" \
     --prompt-append "Do not use tools. Reply with exactly AURACALL_TEAM_TWO_STEP_LIVE_SMOKE_OK and nothing else." \
     --max-turns 2 \
     --json
   ```
5. Run the bounded cross-service workflow smoke:
   ```bash
   ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 DISPLAY=:0.0 \
     pnpm tsx bin/auracall.ts teams run auracall-cross-service \
     "Reply exactly with: AURACALL_CROSS_SERVICE_LIVE_SMOKE_OK" \
     --title "AuraCall cross-service team live smoke" \
     --prompt-append "Do not use tools. Reply with exactly AURACALL_CROSS_SERVICE_LIVE_SMOKE_OK and nothing else." \
     --max-turns 2 \
     --json
   ```
6. Run the bounded multi-agent workflow smoke:
   ```bash
   ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 DISPLAY=:0.0 \
     pnpm tsx bin/auracall.ts teams run auracall-multi-agent \
     "Reply exactly with: AURACALL_MULTI_AGENT_LIVE_SMOKE_OK" \
     --title "AuraCall multi-agent team live smoke" \
     --prompt-append "Do not use tools. Reply with exactly AURACALL_MULTI_AGENT_LIVE_SMOKE_OK and nothing else." \
     --max-turns 2 \
     --json
   ```
7. Run the bounded cross-service Gemini workflow smoke:
   ```bash
   pnpm tsx bin/auracall.ts login --target gemini --profile auracall-gemini-pro --export-cookies

   ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 DISPLAY=:0.0 \
     pnpm tsx bin/auracall.ts teams run auracall-cross-service-gemini \
     "Reply exactly with: AURACALL_CROSS_SERVICE_GEMINI_LIVE_SMOKE_OK" \
     --title "AuraCall cross-service Gemini team live smoke" \
     --prompt-append "Do not use tools. Reply with exactly AURACALL_CROSS_SERVICE_GEMINI_LIVE_SMOKE_OK and nothing else." \
     --max-turns 2 \
     --json
   ```
8. Run the bounded tooling workflow smoke:
   ```bash
   ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 DISPLAY=:0.0 \
     pnpm tsx bin/auracall.ts teams run auracall-tooling \
     "Run one bounded node local shell action that emits AURACALL_TOOL_ACTION_OK, then reply exactly with: AURACALL_TOOL_TEAM_LIVE_SMOKE_OK" \
     --title "AuraCall tooling team live smoke" \
     --prompt-append "For the tool envelope, use a top-level localActionRequests array with exactly one shell action. Preserve the provided toolEnvelope unchanged. Use kind \"shell\" and command \"node\". Use args [\"-e\",\"process.stdout.write('AURACALL_TOOL_ACTION_OK')\"]. Use structuredPayload {\"cwd\":\"/home/ecochran76/workspace.local/oracle\"}. After the local action succeeds, the final answer must be exactly AURACALL_TOOL_TEAM_LIVE_SMOKE_OK." \
     --max-turns 2 \
     --allow-local-shell-command node \
     --allow-local-cwd-root /home/ecochran76/workspace.local/oracle \
     --json
   ```
9. Run the bounded Gemini tooling workflow smoke when validating Gemini-bound
   team execution:
   ```bash
   pnpm tsx bin/auracall.ts login --target gemini --profile auracall-gemini-pro --export-cookies

   ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 DISPLAY=:0.0 \
     pnpm tsx bin/auracall.ts teams run auracall-gemini-tooling \
     "Use the provided toolEnvelope structured context to request one bounded shell action, then use the resulting tool outcome to return the provided finalToken exactly." \
     --title "AuraCall Gemini tooling team live smoke" \
     --prompt-append "Requester must emit exactly one JSON object with top-level localActionRequests containing the provided toolEnvelope unchanged. Do not rename fields, add markdown fences, or add prose. Finisher must output only the final token after a successful executed tool outcome." \
     --structured-context-json '{"toolEnvelope":{"kind":"shell","summary":"Run one bounded deterministic node command","command":"node","args":["-e","process.stdout.write('\''AURACALL_TOOL_ACTION_OK'\'')"],"structuredPayload":{"cwd":"/home/ecochran76/workspace.local/oracle"}},"finalToken":"AURACALL_GEMINI_TOOL_TEAM_SMOKE_OK"}' \
     --max-turns 2 \
     --allow-local-shell-command node \
     --allow-local-cwd-root /home/ecochran76/workspace.local/oracle \
     --json
   ```
10. Current expected baseline result:
  - command succeeds
  - payload includes `taskRunSpec`, `teamRunId`, `runtimeRunId`
  - `runtimeSourceKind = "team-run"`
  - `runtimeRunStatus = "succeeded"`
   - the single step resolves to:
     - `runtimeProfileId = "auracall-grok-auto"`
     - `browserProfileId = "default"`
    - `service = "grok"`
  - `finalOutputSummary = "AURACALL_TEAM_SMOKE_OK"`
11. Current expected ChatGPT baseline result:
  - command succeeds
  - payload includes `taskRunSpec`, `teamRunId`, `runtimeRunId`
  - `runtimeSourceKind = "team-run"`
  - `runtimeRunStatus = "succeeded"`
  - the single step resolves to:
    - `runtimeProfileId = "wsl-chrome-2"`
    - `browserProfileId = "wsl-chrome-2"`
    - `service = "chatgpt"`
  - `finalOutputSummary = "AURACALL_CHATGPT_TEAM_LIVE_SMOKE_OK"`
12. Current expected cross-service result:
  - command succeeds
  - payload includes `taskRunSpec`, `teamRunId`, `runtimeRunId`
  - `runtimeSourceKind = "team-run"`
  - `runtimeRunStatus = "succeeded"`
  - two steps succeed in order across different providers
  - the first step resolves to:
    - `runtimeProfileId = "wsl-chrome-2"`
    - `browserProfileId = "wsl-chrome-2"`
    - `service = "chatgpt"`
  - the second step resolves to:
    - `runtimeProfileId = "auracall-grok-auto"`
    - `browserProfileId = "default"`
    - `service = "grok"`
  - `finalOutputSummary = "AURACALL_CROSS_SERVICE_LIVE_SMOKE_OK"`
13. Current expected cross-service Gemini result:
  - command succeeds
  - payload includes `taskRunSpec`, `teamRunId`, `runtimeRunId`
  - `runtimeSourceKind = "team-run"`
  - `runtimeRunStatus = "succeeded"`
  - two steps succeed in order across different providers
  - the first step resolves to:
    - `runtimeProfileId = "wsl-chrome-2"`
    - `browserProfileId = "wsl-chrome-2"`
    - `service = "chatgpt"`
  - the second step resolves to:
    - `runtimeProfileId = "auracall-gemini-pro"`
    - `browserProfileId = "default"`
    - `service = "gemini"`
  - `finalOutputSummary = "AURACALL_CROSS_SERVICE_GEMINI_LIVE_SMOKE_OK"`
14. Current expected broader-workflow result:
   - command succeeds
   - `runtimeRunStatus = "succeeded"`
   - two steps succeed in order on `auracall-grok-auto`
   - `sharedStateNotes` includes consumed-transfer evidence for step 2
   - `finalOutputSummary = "AURACALL_TEAM_TWO_STEP_LIVE_SMOKE_OK"`
8. Current expected multi-agent result:
   - command succeeds
   - `runtimeRunStatus = "succeeded"`
   - two distinct configured agents succeed in order on `auracall-grok-auto`
   - `sharedStateNotes` includes consumed-transfer evidence for step 2
   - `finalOutputSummary = "AURACALL_MULTI_AGENT_LIVE_SMOKE_OK"`
9. Current expected tooling result:
   - command succeeds
   - `runtimeRunStatus = "succeeded"`
   - two steps succeed in order on `auracall-grok-auto`
   - `sharedStateNotes` includes:
     - `local shell action executed: node`
     - local action outcome summary for the tool step
   - the stored local action request for the tool step reaches
     `status = executed`
   - `finalOutputSummary = "AURACALL_TOOL_TEAM_LIVE_SMOKE_OK"`
10. Current browser-profile validation:
   - Chrome should reuse:
     - `~/.auracall/browser-profiles/default/grok`
   - Chrome should not mint:
     - `~/.auracall/browser-profiles/auracall-grok-auto/grok`
11. Current tooling automation boundary:
   - the bounded tooling CLI smoke above is the current authoritative proof
   - the matching live Vitest case exists, but stays separately gated behind:
     - `AURACALL_TOOLING_LIVE_TEST=1`
   - do not block the stable `AURACALL_LIVE_TEST=1` Grok baseline on Grok
     tool-envelope drift until that case is consistently deterministic
12. Current stop conditions:
   - if `finalOutputSummary` is `bounded local runner pass completed`, the
     provider-backed stored-step seam regressed
   - if Grok visibly answers but the CLI keeps running, Grok fast-reply
     completion detection regressed
   - if Grok shows:
     - `Query limit reached for Auto`
     - `Try again in <n> minutes`
     treat that as a provider quota stop, wait for the declared cooldown, and
     do not keep hammering the same managed browser profile
   - if the command pauses briefly or exits with:
     - `Grok rate limit cooldown active until ...`
     - `Grok write spacing active until ...`
     that is the new bounded Grok live-test guard, not a prompt/transport bug

## Responses API Live Smoke Tests

These Vitest cases hit the real OpenAI API to exercise both transports:

1. Export a real key and explicitly opt in (default runs stay fast):
   ```bash
   export OPENAI_API_KEY=sk-...
   export AURACALL_LIVE_TEST=1
   pnpm vitest run tests/live/openai-live.test.ts
   ```
2. The first test sends a `gpt-5.1-pro` prompt (API: `gpt-5.2-pro`) and expects the CLI to stay
   in background mode until OpenAI finishes (up to 30 minutes). The second test
   targets the standard GPT-5 (`gpt-5.1`) path with foreground streaming.
3. Watch the console for `Reconnected to OpenAI background response...` if
   you're debugging transport flakiness; the test will fail if the response
   status isn't `completed` or if the text doesn't contain the hard-coded
   smoke strings.

Skip these unless you're intentionally validating the production API; they are
fully gated behind `AURACALL_LIVE_TEST=1` to avoid accidental CI runs.
