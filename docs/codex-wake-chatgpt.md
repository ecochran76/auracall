# Continue one long-running ChatGPT request with codex-wake

This recipe submits exactly one AuraCall CLI session, binds one `codex-wake`
HTTP/JSON source to that session's deterministic terminal-receipt identity, and
resumes the originating Codex thread once. The Codex agent does not poll the
provider and never resubmits the prompt.

AuraCall's ordinary `/v1/runs/{run_id}/status` resource is not the authority for
this workflow. The wake source must use
`GET /v1/terminal-receipts/{session_id}`. That projection returns `succeeded`,
`error`, or `cancelled` only after the immutable
`auracall.session.terminal` receipt and any result artifact verify. A corrupted
receipt returns terminal `integrity_error`. A provider-terminal session whose
receipt is not published yet stays `pending`.

## Prerequisites and authority

- Use AuraCall and `codex-wake` installations that include this contract
  (`codex-wake` 0.6.0 or newer). Record `auracall --version`,
  `codex-wake --version`, and the resolved executable paths.
- Configure `terminalSessionReceipts.enabled = true`, schema version `1`, with
  `root: "auracall-home"` or another owner-only allowed root. Confirm
  `auracall terminal-receipts status --json` reports `enabled: true` and a
  ready or ready-to-create root.
- Run the AuraCall API service under the same OS user, `AURACALL_HOME_DIR`, and
  installed build as the CLI request. Keep it loopback-only unless the operator
  deliberately configured authenticated remote access.
- Verify `wsl-chrome-3` is the intended AuraCall runtime profile and that its
  ChatGPT service is already authenticated. CAPTCHA, MFA, identity ambiguity,
  provider warnings, an unknown managed browser owner, or a stale/mismatched
  runtime are hard stops.
- Obtain explicit authority before the command that sends the prompt. Discovery,
  receipt reads, and wake setup do not grant provider-effect authority.
- Select the wake transport from the Codex runtime that is actually executing
  this recipe. When `TMUX_PANE` and `TMUX` identify the current Codex TUI,
  preserve codex-wake's default tmux capture and do not pass app-server flags.
  Only a headless/non-tmux workflow should use an existing resumable
  `CODEX_THREAD_ID`, validated with `codex-wake app status --resume`. Do not
  substitute a guessed or placeholder thread ID.
- Verify the exact wake root has an active persistent monitor. If
  `monitor_ready` is false, stop. Installing or repairing a service is a
  separate operator action.

```bash
set -euo pipefail

auracall_bin="$(command -v auracall)"
codex_wake_bin="$(command -v codex-wake)"
codex_bin="$(command -v codex)"
wake_root="$PWD/.codex/wake"
api_base="http://127.0.0.1:8080"
wake_target_args=()

if [[ -n "${TMUX_PANE-}" && -n "${TMUX-}" ]]; then
  printf 'Wake transport: current Codex TUI in tmux pane %s\n' "$TMUX_PANE"
else
  thread_id="${CODEX_THREAD_ID:?headless wake requires a resumable CODEX_THREAD_ID}"
  "$codex_wake_bin" app status --resume --codex-path "$codex_bin" --json "$thread_id"
  wake_target_args=(
    --app-server-thread-id "$thread_id"
    --app-server-codex-path "$codex_bin"
  )
fi

"$auracall_bin" --version
"$codex_wake_bin" --version
"$auracall_bin" terminal-receipts status --json | jq -e \
  '.enabled == true and (.rootState == "ready" or .rootState == "ready-to-create")'
"$codex_wake_bin" --wake-root "$wake_root" monitor check --json | jq -e \
  '.monitor_ready == true'
curl --fail --silent --show-error "$api_base/status" | jq -e \
  '.routes.terminalSessionReceiptTemplate == "/v1/terminal-receipts/{session_id}"'
```

For the tmux path, codex-wake captures the current pane and socket when it
creates the wake; this is the operator-visible TUI continuation path. For the
headless path, an active writer is expected while the current agent prepares
the wake. In either case, the request must still be pending when armed, and the
agent should yield after registration. This recipe sets one dispatch attempt
and does not enable active-writer retry.

## Submit once and capture exact identity

Put the private request in a shell variable supplied by the calling agent's
secret-safe input mechanism. Do not put prompt text, credentials, response
bodies, or absolute receipt paths in the wake prompt.

The slug below is three bounded words and normally becomes the session ID. The
readback, not that assumption, is authoritative. Run the AuraCall command once:

```bash
session_slug="wake-research-$(date -u +%s)"
request_text="${AURACALL_REQUEST_TEXT:?provide the authorized request privately}"

"$auracall_bin" session --all --json | jq -e --arg slug "$session_slug" \
  '[.entries[] | select(.id == $slug)] | length == 0'

"$auracall_bin" --profile wsl-chrome-3 --engine browser \
  --model chatgpt:premium \
  --browser-composer-tool chatgpt.research.deep_research \
  --browser-deep-research-plan-action start \
  --slug "$session_slug" --no-wait \
  --prompt "$request_text"

session_inventory="$(mktemp)"
chmod 600 "$session_inventory"
"$auracall_bin" session --all --json >"$session_inventory"
session_id="$(jq -er --arg slug "$session_slug" \
  '[.entries[] | select(.id == $slug)] | if length == 1 then .[0].id else error("exact session id not found") end' \
  "$session_inventory")"
receipt_url="$api_base/v1/terminal-receipts/$(jq -rn --arg value "$session_id" '$value|@uri')"

observation="$(curl --fail --silent --show-error "$receipt_url")"
printf '%s\n' "$observation" | jq -e \
  '.object == "auracall_terminal_session_receipt_observation"
   and .eventKind == "auracall.session.terminal"
   and .status == "pending"
   and .completedAt == null'
event_id="$(printf '%s\n' "$observation" | jq -er .eventId)"
receipt_idempotency_key="$(printf '%s\n' "$observation" | jq -er .idempotencyKey)"
session_ref="$(printf '%s\n' "$observation" | jq -er .sessionRef)"
receipt_locator="$(printf '%s\n' "$observation" | jq -er .receiptLocator)"
source_id="auracall-$session_slug"
```

If the submit command exits ambiguously, if the exact session cannot be found,
or if the first observation is already terminal, do not send the request
again. Inspect the single session and either continue inline from its terminal
receipt or stop for operator review.

The exact CLI request identity and session identity are both `session_id` for
this workflow. The pre-submit absence check prevents accidentally binding a
new wake to an older same-slug session.

When API auth is enabled, set an uppercase environment variable to the bearer
token and add `--credential-ref AURACALL_WAKE_TOKEN` below. `codex-wake` resolves
that value at request time and does not store it in source or wake readback.
The variable must be available to the persistent monitor process, not only the
interactive setup shell; otherwise source observation fails closed.

## Arm the exact receipt and yield

```bash
"$codex_wake_bin" --wake-root "$wake_root" http-json source configure \
  --source "$source_id" \
  --url "$receipt_url" \
  --state-pointer /status \
  --event-id-pointer /eventId \
  --completed-at-pointer /completedAt \
  --selector /object=auracall_terminal_session_receipt_observation \
  --selector /eventKind=auracall.session.terminal \
  --terminal-value succeeded \
  --terminal-value error \
  --terminal-value cancelled \
  --terminal-value integrity_error \
  --enabled

"$codex_wake_bin" --wake-root "$wake_root" http-json source check "$source_id" --json | jq -e \
  '.reachable == true and .terminal == false and .state == null and .event_id == null'

"$codex_wake_bin" --wake-root "$wake_root" http-json completed \
  --source "$source_id" \
  --idempotency-key "$receipt_idempotency_key" \
  --max-attempts 1 \
  "${wake_target_args[@]}" \
  --require-monitor -- \
  "AuraCall session $session_id published terminal receipt $event_id. Read $receipt_url once. Match eventId $event_id and sessionRef $session_ref. Never resubmit the provider request. Verify wsl-chrome-3 provenance. On succeeded, read the stored session once and continue. On error, cancelled, or integrity_error, report the receipt and stop."

"$codex_wake_bin" --wake-root "$wake_root" list --json
```

Record the printed wake ID, then end the current turn. `codex-wake` performs
the bounded source observation; the Codex agent should not loop, sleep, or poll.
For tmux, require an acknowledgement plus
`visibility_result.classification=visible_prompt_observed` (or direct pane
inspection) before claiming operator-visible continuation. For app-server,
require its submitted/acknowledged dispatch evidence. Submission
acknowledgement alone does not prove that resumed work succeeded.
Controller/process exit is not a wake condition and does not prove a persisted
result. Repeated source observations of the same event remain one occurrence;
do not register a second wake for the same event ID.

## Resume once and verify provenance

On the one resumed turn, read the observation once and compare all identities
before reading the session:

```bash
terminal_observation="$(curl --fail --silent --show-error "$receipt_url")"
printf '%s\n' "$terminal_observation" | jq -e \
  --arg event_id "$event_id" --arg receipt_idempotency_key "$receipt_idempotency_key" \
  --arg session_ref "$session_ref" --arg receipt_locator "$receipt_locator" \
  '.eventId == $event_id and .idempotencyKey == $receipt_idempotency_key and
   .sessionRef == $session_ref and .receiptLocator == $receipt_locator and
   ((.status == "integrity_error" and .verified == false) or
    ((.status == "succeeded" or .status == "error" or .status == "cancelled") and
     .verified == true))'

session_readback="$(mktemp)"
chmod 600 "$session_readback"
"$auracall_bin" session "$session_id" --json >"$session_readback"
jq -e --arg session_id "$session_id" --arg event_id "$event_id" '
  .id == $session_id and
  .terminalReceiptIntent.eventId == $event_id and
  .browser.config.auracallProfileName == "wsl-chrome-3" and
  .browser.config.target == "chatgpt" and
  (.browser.runtime.userDataDir | endswith("/browser-profiles/wsl-chrome-3/chatgpt")) and
  (.browser.runtime.tabUrl | startswith("https://chatgpt.com/"))
' "$session_readback"

terminal_status="$(printf '%s\n' "$terminal_observation" | jq -er .status)"
response_id="$(jq -r '.response.id // empty' "$session_readback")"
conversation_id="$(jq -r '.browser.runtime.conversationId // empty' "$session_readback")"
result_locator="$(printf '%s\n' "$terminal_observation" | jq -r '.result.locator // empty')"
result_digest="$(printf '%s\n' "$terminal_observation" | jq -r '.result.digest // empty')"
result_bytes="$(printf '%s\n' "$terminal_observation" | jq -r '.result.bytes // empty')"

case "$terminal_status" in
  succeeded)
    test -n "$conversation_id"
    test -n "$result_locator"
    test -n "$result_digest"
    test -n "$result_bytes"
    jq -e --arg digest "$result_digest" --arg locator "$result_locator" \
      '.terminalReceiptIntent.result.digest == $digest and
       .terminalReceiptIntent.result.locator == $locator' "$session_readback"
    ;;
  error|cancelled)
    echo "Verified terminal $terminal_status receipt; do not retry the provider request." >&2
    exit 20
    ;;
  integrity_error)
    echo "Receipt integrity failed; do not trust the result or retry the provider request." >&2
    exit 21
    ;;
  *)
    echo "Unexpected terminal receipt status: $terminal_status" >&2
    exit 22
    ;;
esac
```

For this ChatGPT browser path, the exact persisted response identity is the
verified result triple (`result_locator`, `result_digest`, `result_bytes`),
paired with the exact provider `conversation_id`. An OpenAI API-style
`response_id` is optional for browser sessions; capture it when present, but do
not fabricate or require it. For `succeeded`, run
`auracall terminal-receipts status --session "$session_id" --json` once, then
read the answer with `auracall session "$session_id" --hide-prompt`. For
`error`, including provider failure or AuraCall's overall timeout, preserve the
verified failure receipt and stop without retry. A signal-driven cancellation
produces `cancelled` and has the same no-retry rule. For `integrity_error`,
including a missing successful result or digest mismatch, do not trust or read
the result artifact; report `errorCode` and stop. A wrong runtime profile,
provider target, managed browser profile path, ChatGPT URL, event ID, or
session reference is also a hard stop.

## Connected capabilities and Library references

Deep Research above is a first-party composer capability. For an already
connected app, discover first and replace only `--browser-composer-tool` with
the returned stable ID, for example `chatgpt.apps.litscout`. Discovery must not
click Connect or approve access, and still requires explicit browser-read
authority:

```bash
auracall --profile wsl-chrome-3 capabilities \
  --target chatgpt --category app --available-only --json
```

ChatGPT Library documents are a distinct request surface, never a composer
tool or local attachment. Discover stable IDs read-only:

```bash
auracall --profile wsl-chrome-3 library-files --json
```

Direct `/v1/responses` requests may then use
`"auracall":{"libraryFiles":[{"id":"file_..."}]}`. That response-run API has
its own durable identity and is not interchangeable with this CLI
terminal-session receipt recipe; do not point this wake at `/v1/runs/...` and
claim terminal-receipt verification.

## Cancellation and cleanup

- Before firing, `codex-wake --wake-root "$wake_root" cancel <wake-id>` cancels
  only the continuation. It does not cancel ChatGPT or AuraCall work.
- Do not kill a shared API service, Chromium profile, or guessed PID. This
  detached CLI recipe has no generic session-cancel command. If provider-work
  cancellation is required, use separately authorized exact controller/session
  ownership evidence; otherwise let the bounded AuraCall timeout publish
  terminal `error` and let the wake report it.
- After a terminal wake, inspect it with `codex-wake show <wake-id>`, archive it
  with `codex-wake archive <wake-id>`, then remove the source with
  `codex-wake http-json source remove "$source_id"`. Source removal is blocked
  while its wake is pending or firing.
- Remove the two owner-only temporary JSON files after extracting the bounded
  identity/provenance fields. Keep the immutable AuraCall receipt and result
  artifacts for audit; do not delete them as routine wake cleanup.
- Never use `cleanup --delete` as a substitute for cancellation. Cleanup is
  conservative and applies only to already archived wake records.
