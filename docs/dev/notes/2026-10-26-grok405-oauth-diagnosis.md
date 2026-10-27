# #405 OAuth diagnosis — callback activation prepared

State: CLOSED after PR484 integration and verified GitHub readback. OAuth,
native tool catalog and public original-journal reconciliation are verified. This follows the diagnosing-bugs feedback-loop procedure; the previous
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


## Approved activation readback

The operator explicitly approved activation. The hash-guarded atomic change
installed candidate SHA256ea63df296245c4752bd8ec288434e75a18139b687f3a6c181545f6297454b0a0
and restarted only `mail-receipts-external-oauth.service`. Fresh process PID1349156
is active/running. Public authorization-server and protected-resource discovery
both returned200 with expected issuer/resource. The original installed-code loop
without `--candidate` now passes, using deployed configuration and temporary
SQLite. Existing ChatGPT callback remains preserved. Private activation-result
receipt and original rollback configuration remain in the prepared directory.
No OAuth consent, real client registration, mailbox grant, second Add or connected
account readback occurred. The confirmed callback blocker is fixed; #405/#406
remain OPEN until the real Grok OAuth journey is qualified.


## Original Connector OAuth resumed — human sign-in boundary

After the operator directed proceeding, fresh runtime census found the prior
Grok process and transient modal gone. Configured managed browser profile
`default/grok` was reopened; new native identity matched the configured account.
The current gallery reader returned incomplete visible inventory. Bounded current
React data inspection did not find the canary among the gallery models; that was
not treated as proof the server record was absent. Original installation journal
and one-Add continuation record were retained unchanged.

Native UI/source discovery qualified the new Custom Connector preparation form
and its current SDK imports. One metadata-only probe failed because previous
long export names/context shape no longer matched the new minified module.
An independent account-bound read qualified the failure; immutable proof and
supported registry CAS settled/released its failed-read lease, preserving audit.
No SDK business method or Input ran in that failed metadata probe. A local Custom
form-opening attempt was requalified with a distinct marker after a hit-test
failure; this was UI preparation only, with no Add or typed fields.

The original provider Connector ID was then used directly through normal
configured provider governance. First native validation succeeded but popup
creation was blocked after the asynchronous wait, before any auth-URL request.
The bounded corrective attempt focused the target and opened the native blank
popup synchronously first. Validation again succeeded, and Grok returned an
actual authentication URL and OAuth cookie for the original Connector. Both
backend requests completed. No new Connector was created or journal reset.

The popup reached `https://cooper-auth.ecochran.dyndns.org/` with title
`Login - Authelia`, username/password fields and a SIGN IN button. Its return URL
points to Mail Receipts `/authorize`, with the exact approved Grok callback,
S256 PKCE, response type `code`, and requested `read send write` scopes. These are
requested permissions, not granted authority. No credentials, cookie, client ID,
state, challenge or raw authorization URL enter this repository.

The native180-second wait ended with OAuthTimeoutError while the login popup
remained open. No sign-in, approval or connected-account acceptance was claimed.
Human sign-in is now the precise remaining boundary; do not replay authentication
merely because the listener timed out. Reconcile native/server state after the
human completes the existing page before any new flow. #405/#406 remain OPEN.
Private readbacks and curated hashed manifest are under
`~/.auracall/private/grok/implementation-native/oauth-resume-20261026/`.


## Cooper skill continuation — OAuth and tool catalog qualified

The operator explicitly invoked the Cooper ingress skill and its independent
agent logon authority. The existing Cooper credential was read only inside the
login process via the canonical private file; no password, credential hash,
cookie, hidden CSRF value or screenshot was recorded. Both attempted Cooper
sign-ins succeeded; there was no rejected-login retry or other-realm fallback.
No ingress policy, account, credentials or grants configuration was changed.

The first sign-in reached Mail Receipts authorization. Its requested permissions
matched the existing configured agent policy: two accounts, read/write on both,
send on one. The old Grok OAuth cookie's native helper has a3600second lifetime
and that exchange had expired while waiting. A fresh same-Connector OAuth exchange
was started after qualifying the old unapproved prompt and completed sign-in.
Its exact callback/resource/S256/scope parameters and account/permission summary
were checked before one trusted Approve. No new or unexpected scope was added.

The popup reached Grok `/connectors-oauth-success`; the still-running native SDK
returned authenticated success. One subsequent native catalog RPC for the exact
original Connector ID/account/endpoint completed and returned62allowed tool
entries, including account/read/draft/send surfaces. These are catalog and grant
observations, not tool execution or proof that every tool is permitted for every
account. No Mail Receipts tool was invoked and no mail was sent.

A separate clean HTTP context without cookies still redirected authorization to
Cooper Authelia (302), preserving anonymous denial and the expected realm.
No renderer/inventory/deployment checks were necessary for this login-only slice;
no ingress inventory or container configuration changed.

Private immutable `oauth-qualified-proof.json` under the existing resume directory
binds the successful login/approval/native-auth/catalog receipts by SHA256.
The last public visible-inventory read still reports incomplete coverage with no
exact match, even after one qualified native gallery refetch. Do not equate this
readback gap with failed OAuth, silently reset the installation journal or close
#405. Original target/browser replacement and public reconciliation remain the
next bounded acceptance repair; #406 remains blocked until #405 closure.

## 2026-10-27 public original-journal acceptance

Source45cf4482d adds an exact selected-ID personal MCP metadata reader and
explicit read-only replacement-target reconciliation. The original enabled
Connector exists with valid OAuth tokens even though its gallery card is omitted.
Public configured inspection and reconciliation returned `already-connected`,
exact endpoint/entity/provider-account agreement and all62tools. No new Add,
OAuth, tool invocation, mailbox read or mail send occurred. The original
operation ID and immutable installation input remain; the journal preserves its
historical result and appends verified target-change provenance. Its permanent
continuation fence remains intact.

Acceptance mapping:

- Input validation, provider account custody and one-Add fencing: source tests
  and original native installation; no duplicate installation during recovery.
- Human continuation and actual scopes: earlier Cooper agent approval matched
  the existing two-account policy (read/write both, send one), followed by native
  OAuth success. Metadata advertisements are not used as grant evidence.
- Readback: exact original entity, endpoint and provider account plus62native
  tools, independently followed by public inspection and terminal reconciliation.
  Remote account/grants remain sourced from the actual approval evidence; public
  `accountRef:null` and `grantedScopesObserved:false` are truthful limitations.
- Unconfirmed outcome recovery: public reconciliation preserves original input,
  operation ID, Add fence and prior journal result; no retry/disconnect/replacement.
- Source/live distinction: executed repository source against the configured
  managed browser. No installed AuraCall runtime adoption or package release
  is claimed. Focused58tests and full typecheck passed before source commit.

Private public receipt: `public-reconciliation-1793135870009.json`, SHA-256
`0396f99ed47be410e6e45167fad3b9140bf4f3e26ff823f3df04b0633b25f81b`. Private originals, OAuth approval/catalog proof and journal-before backup
remain under the user-scoped OAuth resume evidence directory. Parent398 is
untouched; review/TDD counts remain1/1.

PR484 merged at4e02b33e82cd3d8ca9549df488d45a0592cfd074; #405 CLOSED
at2026-10-27T21:20:05Z, read back from GitHub. Parent398 remains OPEN.
The MCP registration schema now also advertises explicit target recovery, with
a registration-boundary regression; handler/API/CLI all retain strict validation.
