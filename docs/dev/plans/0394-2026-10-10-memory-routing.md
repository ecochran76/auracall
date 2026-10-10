# Plan0394 | Discoverable AuraCall memory routing

State: OPEN
Owner: ecochran76
Work item: https://github.com/ecochran76/auracall/issues/251
Branch: docs/auracall-memory-routing
Target: main

## Current State

The populated auracall_main group successfully persisted and retrieved issue225 acceptance, but the repo omits its route and atlas discovery found no matching manifest. An earlier agent unavailable receipt attempted zero writes.

## Scope and acceptance

Document the explicit local-user-only group in AGENTS and operator docs, distinguish unresolved routing from service failure, retain one reviewed routing-only JSON manifest, publish it through the receipt-producing helper, and prove atlas discovery and source-group retrieval. No shared Graphiti code, service changes, raw private data or unrelated lanes. Docs/JSON validation and independent Standards/Spec review precede integration. Critical path is repo contract, review/publication, then live atlas verification.
