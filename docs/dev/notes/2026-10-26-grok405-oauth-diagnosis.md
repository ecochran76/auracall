# #405 OAuth diagnosis — callback activation prepared

State: OPEN; service activation pending operator approval, end-to-end OAuth not
qualified. This follows the diagnosing-bugs feedback-loop procedure; the previous
checkpoint review/TDD counts remain1/1 and were not reset or invoked again.

## Live validation feedback

One normal-governed read on the retained created session invoked only the actual
native SDK validation method. Passive exact-current closure inspection first
qualified its method descriptor and route `/rest/mcp/validate-url`; no guessed
private endpoint was called. Normal configured connection installed backend
admission. Exact account/target/runtime checks matched before and after.

Command: `pnpm exec tsx /tmp/grok405-normal-validation-loop.mts`.
Observed one call: `passed:true`, `isValid:true`, `authRequired:true`,
`authStrategy:oauth`. Server metadata was discovered. The original UI session
remained `created`; no UI callback or journal was rewritten. No Add,
authentication URL request, popup, registration, consent or tool discovery occurred.
The earlier validation failure did not reproduce; do not claim its cause fixed.
Private result: `20261026-plan0458-405-validation-loop-1793012544075.json` under
`~/.auracall/private/grok/implementation-native/`.

## OAuth red-capable loop and minimization

The current installed OAuth process is PID3671750 from release
`p320-ranked-b6bd1371`, rather than the previously recorded process. Its configured
exact redirect list still contains only the ChatGPT callback. Runtime Grok client
configuration and callback constructor independently qualify
`https://grok.com/connectors-oauth-exchange-code/`.

Installed Python runs the actual `OAuthState.register_public` method against a
fresh temporary SQLite database, using current configuration in memory. It does
not register a real client or access mailbox data. Repro command:

```sh
/home/ecochran76/.local/share/mail-receipts/releases/p320-ranked-b6bd1371/runtime/bin/python -I -B /tmp/grok405-oauth-diagnosis-20261026/redirect-loop.py
```

Red: exit1, `registration_accepted:false`, `invalid_client_metadata`. Removing
optional metadata with `--minimal` preserves the same red verdict. Both finish
in under a second. This isolates a genuine registration compatibility blocker;
it does not pretend to replay Grok's unobserved registration request.

Ranked predictions were shown before testing: missing exact callback; additional
native client-metadata incompatibility; discovery/issuer mismatch. Adding only the
verified callback in memory with `--candidate` makes both minimal and original
request variants pass. Production configuration/state remain untouched.

## Concrete fix and remaining gate

Prepared private original/candidate config and activation packet under
`~/.auracall/private/grok/implementation-native/oauth-fix-20261026/`.
The sole semantic change appends the exact Grok callback to `server.redirect_uris`.
The existing ChatGPT callback, clients, grants, issuer and authentication settings
are preserved. Candidate SHA256
`ea63df296245c4752bd8ec288434e75a18139b687f3a6c181545f6297454b0a0`;
original SHA256
`521cb2a49e1124d4d3bc5552d5e4aceac87dc6184e8874ce1d8df90f677a523b`.
Do not copy the private JSON files into Git; they contain service credentials.

Activation requires checking the original hash, atomically writing the candidate,
restarting only `mail-receipts-external-oauth.service`, verifying discovery and
rerunning the installed-code loop without `--candidate`. Rollback restores the
original only if the current config matches the candidate hash, then restarts the
same service. Approval was requested for this exact separate-service activation;
no response is assumed. Human OAuth consent and installation readback remain
subsequent gates. #405/#406 remain OPEN.

No production instrumentation was added. Temporary harnesses are confined to
explicit debug paths. No root-cause claim is made for the earlier transient
validation failure; the confirmed defect is missing callback compatibility.
