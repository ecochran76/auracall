# Issue368 — source repair and installed CLI contract

Work item ecochran76/auracall#368; Plan0451 / lane issue368.
Source214c03d2c in PR390 mergedfb026941f. The integrated build also includes
clipboard PR388/389; it does not drop the separately adopted clipboard helper.

## Diagnosis and repair

The reported error reproduces through the public app command, real serialized
ChatgptService utility dispatch, and the mandatory physical-target guard:
Provider traffic governor is required before physical action:
provider:chatgpt:connect-tab. A target-bound authority factory can govern an
existing target but cannot authorize creation before a target exists. Existing
connection fixtures with an injected target/factory therefore passed.

Explicit serialized utility commands now request target custody through the
existing ephemeral acquisition/lease/governor pipeline, before identity/inventory
or catalog mutation. Prompt concurrency remains serialized. No guard bypass or
synthetic target identity. Known tenant scope remains authoritative; unconfigured
serialized discovery uses the existing managed-browser scope convention without
asserting an account identity. Affinity-mode identity requirements are unchanged.

## Source validation

- Red: `pnpm vitest run tests/cli/chatgptDeveloperAppsGovernor.test.ts --maxWorkers=1`
  fails with the exact original missing-governor error before the repair.
- Green: list with/without configured identity and confirmed refresh-tools all
  pass; an explicitly ungoverned first-target control still raises that error.
- 91 focused command/service/utility checks and 103 backend/utility checks pass
  in separate overlapping selections. Integrated clipboard + command checks:
  four pass. Full typecheck, build, scoped Biome, docs:list and whitespace pass.
- Fixture setup was completed for real reused-target transport, and its interaction
  rate was explicitly raised to remove real-time throttling from deterministic
  regressions. This does not change production admission rates.
- Primary Standards/Spec review: no blocking findings against the bounded repair;
  shared skills utility consumers and existing warning/cleanup fences remain covered.

## Installed boundary and remaining acceptance

CLI prefix ~/.auracall/user-runtime-issue368-fb026941f. Installed public service
contract verifies requireTargetLease on serialized explicit utilities, preserves
configured prompt mode, and dispatches the exact leased target to the callback.
Compiled configuredChatgptUtilityAffinity.js SHA256:
db89e18d7b949d5d4bd547df38063ccca9ee41bf0bce99b426ab613fd3b30a6a.
Installed CLI app-list help succeeds. The candidate clipboard helper is identical
to the active API helper. API PID1777322 remains active on its previously adopted
Recall runtime with the clipboard overlay; this was a CLI-only installation with
no API restart. Do not claim CLI/API artifact parity or live catalog acceptance.

The operator was asked for the exact app and runtime profile for installed
read-only discovery and one targeted in-place catalog refresh. No target has been
supplied yet. No provider discovery, prompt, catalog mutation, warning clearance,
app replacement or endpoint/permissions change was performed by this packet.
#368 and Plan0451 remain OPEN pending the exact live target and provider evidence.
Private install/compiled-contract receipts: ~/.local/state/auracall-issue368-20261023/.
Memory forbidden: no explicit save request.

## Live OpenSign qualification — 2026-10-23

Operator selected OpenSign on wsl-chrome-3. The installed CLI list exits0 and
observes30 apps, including one exact enabled OpenSign app on the expected account.
The endpoint expectation was resolved from the OpenSign ingress inventory and
OAuth docs. A single guarded refresh-tools invocation exits1/status unconfirmed:
“No attributable successful refreshed tool catalog was observed. Inspect before
retrying.” retrySafe=false. The exact-settings checks before and after trusted
activation passed; identity, endpoint, connection and permission snapshot were
preserved. No catalog count/hash was returned, so refresh success is unproved.
No replay, app replacement, provider prompt, consent or warning clearance.
This supersedes the target-pending gate above. #368/Plan0451 stay OPEN pending
read-only reconciliation of the missing catalog observation, not another click.
Private receipts: ~/.local/state/auracall-issue368-opensign-20261023/.
Memory disposition forbidden: no explicit request to save memory.
