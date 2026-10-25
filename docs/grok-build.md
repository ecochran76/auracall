# Grok Build generation

The Build operation discovers the visible Build menu entry and its advertised
account gate. `available` means that entry is available; it does not prove an app
was generated or that an export exists.

The CLI, HTTP and MCP registrations use the same request contract:

```sh
auracall grok-build --action discover --runtime-profile default --json
```

Generation requires a separate explicit confirmation and an empty root composer.
It acquires a new retained target and clears inherited target affinity; an
existing draft, selected files or Connector dialog remains on its original target.
AuraCall checks the empty root before opening the modal model picker, then
selects and verifies Build, closes that picker, and checks again before inserting
the prompt. A draft or selected file arriving during selection prevents Send:

```sh
auracall grok-build --action generate --runtime-profile default --yes \
  --prompt 'Create a static one-page timer for local inspection. Do not publish or deploy it.' \
  --timeout-ms 300000 --json
```

For `POST /v1/grok/build/query` and the `grok_build` MCP tool, use
`{"action":"generate","prompt":"...","confirmed":true,"runtimeProfile":"default"}`.
The HTTP route requires operator configuration access. The response observation
timeout defaults to 120000 milliseconds and can be set up to 7200000. Cancellation
or timeout after Send retains the exact target and forbids automatic resubmission.

A `response_completed` generation result proves a terminal assistant response
with conversation/response identity. The current source returns `partial` with
`grok_build_app_identity_unobserved`: app ID, app version, preview and exported
app bytes have not been qualified. `artifacts.entries=[]` with
`artifacts.status=unavailable` is missing app/export evidence, not a successful
empty export. No arbitrary response link is treated as an app or downloaded.

`publication.requested=false` records that AuraCall did not invoke publication.
The actual provider publication state remains `unknown`; terminal text or a
preview does not prove publication. App publication is a separate operation under
issue 411 and is not implemented by this command.

Invalid/unconfirmed requests, missing/gated Build, nonempty drafts, selected native files (including files without a provider chip),
and preflight refusals send nothing. Completed/uncertain submissions have `retrySafe=false`.
Cleanup failure is separately reported and retains a completed response when one
was already proved. The target is retained for operator reconciliation.

These operations are source implementations covered by provider-free tests.
The CLI/API/MCP registration and Ops projection are integrated by the Plan0453
coordinator. Installed-runtime and native Build/app/export acceptance are separate
pending gates; issue 410 remains open until all its acceptance criteria are met.


Retained Build results can be read without generating again:

```sh
auracall grok-build --action inspect --runtime-profile default \
  --target-id '<retained-target-id>' --conversation-id '<exact-conversation-id>' \
  --response-id '<optional-exact-assistant-response-id>' --json
```

For the existing HTTP/MCP surfaces, use
`{"action":"inspect","targetId":"...","conversationId":"...","responseId":"..."}`;
`responseId` is optional when exactly one assistant message is mounted. Inspection
requires an existing configured browser endpoint and the exact retained target.
It never launches a browser, opens a model menu, navigates, edits, sends, downloads
or settles an unknown-effect lease. A still-fenced target requires supported
operator reconciliation before ordinary inspection can acquire it.

The observed Build plane has provider response IDs under separate user and
assistant gateway rows, rather than under `main`. Inspection accepts assistant
messages only and verifies native completed-work UI outside the generated prose
plus absence of an active Stop control. A marker quoted in prose is insufficient.
Fresh account or route drift discards unattributable content.

A visible authenticated preview is reported as `preview.status=available` and
`preview.url=null`, with `grok_build_preview_session_required`: view it in the
retained managed tab. Its bearer URL never enters public results or Ops. App ID,
version and exported bytes remain unqualified; a completed response or preview
therefore still returns `partial`. `operation=inspect` and `effectState=none`
describe this read, while `generation.uiState` reports the observed generation.
They never authorize resending the original generation.


Generation also observes the native Build plane when it is present outside
`main`, using only assistant messages and the same native completed-work marker
as inspection. Legacy main-based text handling retains its existing behavior.
An active Stop control takes precedence over an older completed-work marker;
ambiguous plane roots cannot supply completion. Qualified preview presence may
be returned with the completed response, while app/version/export remain partial.
The observation timeout never authorizes restarting a still-running generation.
