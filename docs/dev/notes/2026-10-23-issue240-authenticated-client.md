# Issue240 authenticated client checkpoint

Work item: [#240](https://github.com/ecochran76/auracall/issues/240)
Governing plans: Plan0391 and Plan0448
Disposition: authenticated inspection passes; named-pair/root/input acceptance remains open

## Authentication and route proof

The operator explicitly invoked the Cooper service ingress skill to continue
through Authelia using its existing machine-local agent account. The password
was read inside a private login process and passed through the browser's private
automation connection. It was not placed in command arguments, tool output,
screenshots, receipts or source. Session cookies remain in the private managed
browser profile. No account, credential or access-control configuration changed.

The initial submit locator had a case mismatch. Read-only form inspection showed
zero first-factor requests before the corrected selector submitted the existing
filled form once. Sign-in succeeded without rejection or a second-factor request.

The active ingress inventory pins AuraCall to port18095 with local routing and
external Authelia protection enabled. Inventory validation passes with its
pre-existing missing-port-policy-metadata warning. Raw upstream and local ingress
both return200. A clean HTML request without cookies returns302 to Authelia;
the earlier API-style request returned401 with the authentication location.
Authenticated browser `/desktops` and same-origin `/v1/desktops` return the app
and inventory200. No proxy, guard or shared ingress changes were made.

The API process remains PID2028634 in the existing issue357-55520b18e prefix.
Its entrypoint SHA256 is
`3b851844247ec51f432a9164d6d7794025c93a854513cb7a60233fb424922c29`.
No AuraCall installation, service restart or profile reassignment occurred.

## Observed views and limits

- Research is ready with one browser. Its authenticated embedded viewer connects
  and renders a nonblank existing browser window; this is actual streamed image
  evidence, rather than an API grant or an empty canvas declaration.
- One other retained running desktop also connects and renders a separate browser
  window. It is not substituted for the named Writing desktop.
- Authenticated inventory reports Writing empty with zero browsers. The earlier
  ownership fence is not overridden and no allocation is silently rebound.
- The actual Root desktop link opens the independent authenticated Remote View
  portal. It connects to Shared Desktop2, which has no app windows and a black
  canvas. This proves the portal/connection, not the intended physical root
  desktop content or input behavior.
- The root portal initially displayed Control active. Its View Only action was
  selected and input-locked mode confirmed before observation continued. No native
  pointer/keyboard acceptance test or provider interaction was initiated.

No marker preparation, browser wake/termination in AuraCall, ownership adoption,
new provider prompt or historical evidence rewrite was used. Current authenticated
viewing does not renew old Writing ownership or prove new input acceptance.

## Transport and cleanup

The configured Agent Browser MCP connection now works in this session. Its
original task open, repeated snapshots, scoped navigation/tab creation and close
succeed against installed `0.28.0-ff0b22c3bb93-e5a1b9f945e7`. The inspection task
owned two tabs on its own browser; it did not own the browsers being viewed.

Task-scoped close removes that task and browser record. Fresh PID/start readback
finds none of the16 captured inspection-browser processes still live. The private
persistent profile and its authenticated session remain available. Raw images,
inventory and operational receipts remain private; no screenshots or cookies are
published with this note.

## Remaining acceptance

Keep #240 and Plan0391 open. Qualify Writing through its supported current
allocation/ownership path before any new preparation, and establish the intended
root desktop and required input acceptance independently. Do not count the other
retained browser or the empty root-portal default as those missing proofs.
The old Agent Browser transport and Authelia sign-in gates are cleared.

A separate bounded Agent Browser readiness task using the authenticated profile
returns native handoff `operatorVisible.state=ready` with owned-browser-window
proof scope. It is then closed through the configured MCP. Its task/browser are
absent and all14 captured process identities are absent. This completes #365's
handoff criterion without repeating AuraCall marker preparation or input tests.
