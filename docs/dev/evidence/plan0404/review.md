# Plan0404 two-axis review

Fixed point: patch against8aa11f18a, public launchChrome exit-before-CDP fixture.
Spec: Issue226 current expected recovery/classification, Plan0404 bounded source slice.
Standards: AGENTS.md, CONTEXT.md, policies0008/0009/0018/0029. Serial primary review;
no delegation authorized. Original historical exit attribution remains unknown.

## Standards

No accepted blocking finding. Generic lifecycle behavior stays in browser-service.
Owned child state read at failed readiness, not inferred from stale registry PID.
Structured process/profile context remains separate from source cookie copying.
Shared kill/restart behavior and cancellation unchanged. Existing mock export-name
lint warnings retained; package source excluded by repository lint configuration.

## Spec

Public launchChrome regression reproduces original generic readiness error after
observed owned child exit. Typed exited failure and scoped diagnostic instruction
now returned. Unready endpoint without observed exit is explicitly not proof of
process exit. Profile directory retained through WSL launcher bypass. No accepted
blocking finding. Scope is launch-time classification; existing-browser loss,
Windows PowerShell launch and prior exit actors remain outside this source proof.

Summary: Standards0 blocking; Spec0 blocking. No claim to close whole Issue226.
