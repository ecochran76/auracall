# ChatGPT developer-app refresh Developer Mode re-read

Status: deadline follow-up source and installed-runtime repair accepted; no new
live refresh authorized.

The LitScout connected-app refresh on 2026-09-10 stopped before deletion when
the mutation-time state read reported Developer Mode disabled. Complete
inventory immediately before and after reported it enabled and showed the same
private OAuth-active app ID, proving a transient false observation and zero app
replacement.

AuraCall's create path already handled this provider state by performing one
complete account, installed-app, linked-app, and Developer Mode re-read before
rejecting. Commit `3b59cd2c2` applies that same bounded confirmation to refresh.
Two false observations still reject before delete or create.

Verification:

- Red first: the focused transient-refresh test failed with `ChatGPT Developer
  mode must be enabled before replacing an app.`
- Green focused invariant: four Developer Mode confirmation tests passed.
- Developer-app lifecycle contract: 57/57 tests passed across browser-service
  connection/core, provider adapter, and CLI operation tests.
- `pnpm run typecheck`, `pnpm run build`, scoped Biome lint, diff hygiene, and
  the plan-library audit passed.
- The user-scoped AuraCall `0.1.1` runtime was installed without restarting the
  API service. Its compiled CLI-operation module SHA-256 matches the built
  module: `a21eb68a9b8d3225b526adb285c136c370f97369075dea78a2c96a19e563439b`.
- An installed-module harness proved transient false -> four state reads, one
  delete, one create, completed; persistent false -> two state reads, zero
  delete, zero create, rejected.
- Read-only live inventory on AuraCall runtime/browser profile `wsl-chrome-3`
  reported the expected SoyLei Pro account, complete inventory, Developer Mode
  enabled, and the unchanged LitScout app enabled/private/OAuth-active.

No app refresh, app deletion, app creation, OAuth mutation, ChatGPT prompt,
LitScout tool call, or provider request was performed during repair
qualification. Another destructive refresh requires fresh explicit authority.

## Mutation deadline follow-up

The next explicitly authorized LitScout replacement attempt completed both
inventory/Developer Mode cycles but emitted no result before an external
120-second timeout. Read-only browser history contained no exact LitScout
management route, and complete reconciliation preserved the old enabled,
private, OAuth-active app. This proved a pre-effect outcome for that attempt but
also exposed a generic lifecycle liveness gap: only `apps list` had an internal
operation deadline.

The follow-up adds a five-minute internal boundary to create, refresh,
submitted test, and uninstall. The same abort signal reaches the provider
adapter, cleanup remains separately bounded, and every operation records its
active lifecycle phase. A timeout before create/delete/submit/uninstall is
classified `pre_effect`; a timeout at or after a provider mutation phase is
`unknown` and explicitly requires exact inventory reconciliation. `--json`
returns stable `action`, `status`, `code`, `phase`, `timeoutMs`, `effectState`,
and `retrySafe` fields.

Provider-free red/green evidence:

- RED: a never-settling refresh delete returned `still pending` after 80 ms.
- GREEN: the same test returns the exact `delete` phase timeout, `unknown`
  effect state, reconciliation instruction, and bounded adapter close.
- A separate stalled initial inventory returns `pre_effect` and `retrySafe:
  true`.

Installed-runtime verification:

- Source repair commit: `ecda2cea6`.
- The user-scoped AuraCall `0.1.1` runtime was installed without restarting the
  API service. The service remained active with PID `41886` and `NRestarts=0`.
- The built and installed CLI-operation modules have the same SHA-256:
  `0c91a712140e16cf520f6fabffe62ca247e62c81662a6e0d07d12abdb70d28e4`.
- An installed-module delete-stall harness returned `phase: delete`,
  `effectState: unknown`, `retrySafe: false`, propagated abort, and closed the
  adapter once.
- An installed-module initial-inventory-stall harness returned `phase:
  initial_inventory`, `effectState: pre_effect`, `retrySafe: true`, propagated
  abort, and closed the adapter once.
- Read-only live inventory on `wsl-chrome-3` reported the expected
  `eric.cochran@soylei.com` Pro account, complete inventory, Developer Mode on,
  and the unchanged enabled LitScout plugin
  `plugin_asdk_app_6aa022ba1b448191b6f48cf050bb4b68`.

The full developer-app contract passed 59/59 tests; typecheck, production build,
scoped Biome checks, plan audit, and diff hygiene also passed. This repair gives
the next live attempt a bounded outcome and exact phase/effect diagnostics; it
does not claim to identify the provider wait that caused the prior timeout.

No new ChatGPT refresh, OAuth action, prompt, connector call, or provider
request was performed or authorized by this repair and installation slice.

## Live replacement follow-up

With fresh operator authority, one installed `apps refresh` targeted the exact
old LitScout app and current public MCP endpoint. AuraCall deleted the old app
but returned `recreate-pending` because ChatGPT's Create dialog remained open at
the custom-MCP risk acknowledgement. No refresh retry or recovery create ran.

Fresh complete inventory then proved the provider had accepted the creation
asynchronously: the old ID `asdk_app_6aa022ba1b448191b6f48cf050bb4b68`
was absent and exactly one new LitScout app existed at
`asdk_app_6aa32e43e4a08191b92060904afc706d`. It was enabled, private,
development, and OAuth-active. A non-submitting app test selected the exact new
ecosystem mention in a blank Chat composer and cleared it afterward.

A passive CDP capture recorded HTTP 200 for the exact new canonical-app record,
including release `PluginRelease_292aadcaa9388191b3e32bf808077898`, version
`1.0.0`, the expected display name and description, and the new app ID. That
canonical metadata response exposed neither tool definitions nor input schemas;
its `capabilities` and `mcp_servers` arrays were empty. Therefore replacement
and ChatGPT-side canonical metadata loading are accepted, but exact visibility
of LitScout's consolidated acquisition request schema remains unverified until
a separately authorized prompt-driven tool-discovery check.

There was one refresh command, zero refresh retries, zero recovery creates,
zero prompt submissions, zero LitScout tool invocations, and zero provider or
canonical research effects. The initially reported `recreate-pending` result is
a retained AuraCall observability defect: delayed provider acceptance can make
the command's immediate terminal classification stale even though the required
post-command inventory reconciliation prevents a duplicate recovery create.
