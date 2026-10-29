# Grok native snapshot acceptance — 2026-10-29

Source: `af1bdb9ad54f5c3789dd93b3777b29ee6804f0b0`, branch
`feat/grok411-spec-20261028-r2`; main remains `00a45bd0b`.
Root owns #411; independent workers continued #409 and #414. Browser operations
were serialized. No implementation source changed in this native packet.

## Accepted evidence

The normal configured launcher created a fresh managed Grok browser. OS,
executable, managed browser profile, endpoint and exact original account were
qualified. A new retained target opened the original Build conversation and
assistant response; obsolete target IDs were not reused as current authority.

One fresh public native workspace export retained 1,524,947 bytes, SHA-256
`771e4a062c5d8c2be6949d6af1493de3df7ff3d642143cfcba6d048b9bc548e8`.
Primary independently verified the ZIP and a bounded content manifest: 222 files,
3,761,014 uncompressed bytes, canonical content-manifest SHA-256
`b236d1fa868601137711a01b1d0ab02cc96f4da5d78394b1f3618b035755ae77`.
No generated code was extracted to execute or executed locally.

The #414 worker qualified actual native tree rows and selected
`/src/components/timer.tsx`. One public adapter discovery/materialization retained
21,762 bytes, SHA-256
`9c806b0f60e392ad993cc2485d1631914a8100303027dff1896fee24f6753f06`.
Primary independently verified those bytes, equality to the fresh ZIP member,
the sidecar/provenance equality, and all five capture-source hashes against the
integration branch. Native app/version/content-revision fields remain null.

The worker exercised real ArchiveService/ArchiveMaterializationService APIs and
a durable job store using an isolated user home and the actual captured FileRef.
Materialization, verified reuse, same-job restart, injected foreground gating and
same-size tamper refusal passed. The tamper touched only an isolated copy; the
original checksum and captured bytes remained intact. Provider recaptures: zero.
This is actual local API proof with an injected offline gate, not installed-host
or native history-continuation proof. Primary inspected the receipt and retained
its delegated execution status. Existing source checks (root 92/9 files; worker
173 plus later 45 selected checks) were reused because source hashes match.

## Remaining original gates

- #409: one fresh public resources read returned
  `unknown / grok_bot_exact_settings_unknown`. Subsequent bounded reads show
  only the authenticated Grok shell on the canonical Bot route, with no Bot
  content or Settings. Normal governed focus changed visibility but not content;
  the focus-defect hypothesis was rejected. No source patch or resource retry.
  Current resource absence and current owned Bot identity are not established.
- #411: native controls remain idle/not published, ready, deployment null.
  Committed callback source qualifies a publish request with conversationId,
  projectName and access. A revision-bound selected-output publish contract and
  genuine provider app/version readback remain unqualified. Native terms and
  public-deploy warning gates exist; neither was accepted or bypassed. The fresh
  workspace/archive is concrete preparation, not permission or proof of publish.
- #414: the selected generated timer slice is native-accepted. Conversation-bound
  referenced-upload retrieval remains unqualified. Installed/native history
  continuation and coordinated original-issue acceptance remain unproved.

All three tickets stay OPEN. Parent #398 and separate #477 were untouched.
No new prompt, upload, Bot edit, Connector invocation, mail Send, publication or
terms acceptance occurred. The completed-ticket review/findings-TDD round is
still unconsumed; this partial native packet does not narrow the original scope.

## Custody

Raw native receipts and account/target details remain in user-private artifacts.
The following digests bind the sanitized report to those retained receipts:

- `freshWorkspaceExport`: `08330190fa4be2c2a0a06080afa0c9edafa934b4ae1f4dac996c68723abeff22`
- `workspaceManifest`: `c362b852f31f50d90fe591d98262495cf15ec48d0dbc87b65bef64fe4fb02a1d`
- `selectedTimerCapture`: `38af4f26862cb4285f866d83efa87bf0d62a5c3a6bba512f31a80af7d9dc8693`
- `isolatedArchiveApi`: `04e6303f23b145493b1474ee24f842965a0bc61874edd36b8deec972bb3ef172`
- `botContentDiagnosis`: `1eb52c6ab220175c7a37fc14ec4377fd77f4f96cbf6fed522711f8bc7c1ac7c6`
- `publishController`: `b50ae1cfeae002294a8064080e15e3311462a3b6e8addf13eb3de02dde88dd7f`

Memory disposition: `forbidden`; no explicit user memory-write request.
