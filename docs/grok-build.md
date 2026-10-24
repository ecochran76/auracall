# Grok Build generation

The Build operation discovers the visible Build menu entry and its advertised
account gate. `available` means that entry is available; it does not prove an app
was generated or that an export exists.

The CLI, HTTP and MCP registrations use the same request contract:

```sh
auracall grok-build --action discover --runtime-profile default --json
```

Generation requires a separate explicit confirmation and an empty root composer:

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

Invalid/unconfirmed requests, missing/gated Build, nonempty drafts and preflight
refusals send nothing. Completed/uncertain submissions have `retrySafe=false`.
Cleanup failure is separately reported and retains a completed response when one
was already proved. The target is retained for operator reconciliation.

These operations are source implementations covered by provider-free tests.
The CLI/API/MCP registration and Ops projection are integrated by the Plan0453
coordinator. Installed-runtime and native Build/app/export acceptance are separate
pending gates; issue 410 remains open until all its acceptance criteria are met.
