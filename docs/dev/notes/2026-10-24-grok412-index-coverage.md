# Grok412 first source packet: preserve index coverage

Base:161c743971057df7d15ff219324fc2c779019d42. Ticket: https://github.com/ecochran76/auracall/issues/412. Parent: https://github.com/ecochran76/auracall/issues/398.

Authority: user resumed AuraCall, requested manual resource monitoring and assigned Codex Wake319 elsewhere. This packet changes source and fixtures only. No provider calls, account writes, shared MCP refresh or controller mutation. Original elapsed-time window remains expired; no allowance reset.

## Accepted change

`readBoundedConversations` now captures and forwards `onHistoryInventory`, returns the observed coverage to callers, derives truncation from incomplete coverage, and rejects explicit failed coverage. Grok reads with no coverage remain partial when the provider is known through the observation context. Other providers retain row overflow handling. The production collector consumes this truncation when building metadata evidence and the existing backfill ledger.

Three regression cases failed before implementation. Final focused run:93 tests across3 files pass (8 new coverage cases,72 collector cases,13 provider history cases). Targeted Biome lint passes. Two existing Gemini tests required additive callback expectations; their budgets, cursor traversal and result assertions remain intact.

One bounded independent static review found no blocking findings. The reviewer checked callback forwarding, other-provider compatibility, empty/overflow semantics and failure tolerance. Additional fixtures verify empty incomplete coverage, overflow without callbacks, and explicit failure under tolerance. Review is not installed/live proof.

## Remaining acceptance

Ticket412 remains partial/open. Durable continuation must atomically retain qualified rows with their cursor; persisting a cursor alone after cancellation could skip rows. Root/project/Bot scope coverage and omissions, per-project continuation, foreground phase/page preemption, restart eligibility and public status agreement remain unproved. A visible history bottom is only visible-scope evidence. No cursor has been added to public Ops diagnostics by this slice.

Manual resource readback:43,150MiB memory available,75,065MiB swap used. No unrelated process cleanup. Memory disposition: forbidden because the developer requires an explicit user request for memory writes.
