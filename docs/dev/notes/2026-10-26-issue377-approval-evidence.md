# Issue377 — Approval evidence boundary

Status: unresolved; no production repair qualified.
Source: GitHub ecochran76/auracall#377, retained original session, copied ledger
snapshot and current source/installed offline replay. Plan0462 owns this packet.

## Observed evidence

The original session records allow-once, standard thinking and the180-second
terminal timeout. Its output contains three lines; its model log is empty.
There are no approval observations or timestamped DOM/protocol captures in
that session directory. No new tool action was performed during this packet.

A reconstructed UI containing the operator-reported OpenSign text and exact
Always allow / Deny / Allow once controls was evaluated by the real approval
DOM expression and handler inside real response waiting. Current source and
installed runtime both complete, selecting Allow once exactly once and focusing
neither Always allow nor Deny. Two cases pass; fixture bodies291ms. This is a
negative reproduction result, not a captured-UI regression or proof that the
original rendered card was supported. The temporary fixture patch and log are
retained privately; no speculative production change or always-green historical
regression was added to the repository suite.

Read-only inspection of three retained ChatGPT pages found zero visible Allow
once, Always allow or Deny controls. No page title matched the original OpenSign
run. These observations do not prove the original conversation is gone from
provider history; an exact conversation URL may allow later read-only inspection.
A read-only local API search for OpenSign conversations on ChatGPT/wsl-chrome-3
returned zero cached rows; it did not query or mutate provider conversations.

## Historical rate-limit evidence

The preserved ledger has two provider-warning-observed events at
2026-10-23T18:55:21.275Z and18:55:21.305Z on wsl-chrome-3. The same window includes
one recorded new-conversation operation with73backend-request reservations;
72are settled and1is frozen. These are ledger records, not a count of HTTP200
responses or proof of response completion. The conversation-start effect is
outcome-unknown. A frozen backend reservation is not proof that it was the
request that returned429: observing a warning can freeze other active custody.

This operation starts at18:53:17.848Z, shortly after the session started at
18:53:17.537Z, but the session receipt does not provide the operation-ID linkage.
Temporal/profile agreement is supporting association, not exact session proof.
No other new operation admissions appear in the reviewed18:53:11–18:56:12window;
unrecorded browser/provider/account activity is not excluded. Snapshot events
and request records omit endpoint URLs; the backend key is opaque. The exact
429-producing endpoint and causal relationship to approval remain unqualified.

## Next evidence needed

Obtain the original conversation URL and inspect the remaining card without
clicking it. A currently failing card needs a timestamped DOM snapshot, exact
account/tab binding, approval observations and sanitized per-request correlation.
Reconcile any original upload/draft effects before a replacement submission.
Preserve warning stops. No warning clearance, retry, Always allow substitution,
new draft submission or installed acceptance was authorized by this diagnosis.

Private primary evidence and runnable fixture patch are under
`~/.local/state/auracall-issue377-20261026/`. Raw session/ledger data remain outside
Git. The public issue remains open; inability to reproduce is not resolution.
