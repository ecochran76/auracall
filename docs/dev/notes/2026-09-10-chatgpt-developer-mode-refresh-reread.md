# ChatGPT developer-app refresh Developer Mode re-read

Status: deadline follow-up source repair validated; installation pending; no
new live refresh authorized.

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

Installation and installed-module verification remain pending. No new ChatGPT
refresh, OAuth action, prompt, connector call, or provider request is authorized
by this source repair.
