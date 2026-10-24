# Grok existing Bot discovery and invocation — #407

Source packet for [#407](https://github.com/ecochran76/auracall/issues/407),
[Plan0452](../plans/0452-2026-10-24-grok-upgrade-spec.md), based on `87c4910ba`.
Coordinator owns shared registration, configured resolver, Ops and user docs.

Public seam: `createGrokBotsService(options, dependencies).list(source)` and
`.invoke({id, source, author?}, prompt)`. Shared CLI/API operation:
`GrokBotsRequestSchema` / `runGrokBotsCommand`; MCP:
`registerGrokBotsTool` / `createGrokBotsToolHandler`; content-free Ops projection:
`summarizeGrokBotDiagnostics`.

Inventory opens Plugins/Bots or the empty root composer @ chooser. Visible
catalog entries retain observed stable provider identity and author. Duplicate
names remain distinct; missing identity/provenance gives unknown coverage.
Catalog listing never installs. Catalog invocation is explicitly blocked because
installation is deferred. Installation, removal and scheduling have no schema.

Invocation uses the same configured, account-verified, governed target throughout.
It requires an empty root composer, uniquely matches an owned Bot by stable ID
and optional author, and requires an exact matching noneditable @ token before
prompt preparation. Existing text preparation preserves/rechecks tokens; existing
single-submit and terminal-response functions perform real default execution.
Prompt whitespace is preserved. Final text/Markdown must agree with the completed
snapshot; exact conversation URL/ID and response ID accompany Bot/account custody.
Unknown submission outcomes forbid inferred completion and automatic resubmission.
Invocation targets are retained and ordinary results expose their target ID.
Pre/post account drift rejects the result; thrown/cleanup failures are sanitized
by public wrappers and conservatively mark invocation effect unknown.

Response-scoped same-origin `/files/<id>` links retain Bot/account/conversation/
response ownership. They are references, not downloaded or locally materialized
artifacts; coverage is explicitly incomplete. Missing exact response root reports
artifact inventory unknown. This does not establish full provider artifact support.

Validation tier: focused, provider-free; no live browser/provider/account effects,
installation, deployed runtime or service acceptance. The synthetic hierarchy and
stable-ID attributes/routes are controlled fixtures, not captured provider HTML.
Live DOM drift may therefore return unknown until a separately authorized canary.
The survey establishes Plugins/Bots/@ labels, not provider ID attribute shapes.

TDD receipts: repeated `pnpm vitest run tests/browser/grok407Bots.test.ts` observed
red before green for initial catalog module, service module, uncertain-effect
preservation, response-scoped artifact custody, mismatched final response,
prompt whitespace and retained target locator. Final selection: 13 tests.
`pnpm vitest run tests/browser/grok407Bots.test.ts tests/browser/grok402Text.test.ts tests/browser/grok404ConnectorsService.test.ts --maxWorkers=2`
passed 33 tests before the final target-locator test addition. Bot service tests
execute actual DOM selection and orchestration; they replace the already-covered
text pipeline exports at that collaborator boundary, and do not claim an end-to-end
real-text DOM run. Primary owns integration review and postcompletion TDD.

Memory disposition: forbidden — this packet explicitly prohibits memory writes.
