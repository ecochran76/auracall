# ChatGPT Workflow Volatility Plan

## Objective

Define the next ChatGPT service-volatility phase after the narrow manifest pilot.

This phase is not "move more strings into config." The goal is to classify the remaining ChatGPT drift into the right ownership buckets:

- manifest-owned declarative data
- shared browser-service abstractions
- ChatGPT adapter workflow logic that should remain code-owned

Current status:

- landed first behavior-aware browser-service slice: `openAndSelectMenuItemFromTriggers(...)` now owns the generic ordered menu-trigger fallback mechanic
- landed first ChatGPT adoption: conversation rename/delete now treat row-menu then header-menu as explicit action surfaces instead of provider-local retry glue
- remaining active ChatGPT issue: root conversation rename can still stall after the trigger phase, so the next slice should focus on post-trigger inline-editor discovery and title-persistence verification rather than more menu-surface extraction

## Scope

- inventory the remaining adapter-local selector/fallback layer in `src/browser/providers/chatgptAdapter.ts`
- split ChatGPT artifact handling into declarative taxonomy versus behavioral parsing/materialization
- evaluate whether any remaining repeated DOM/workflow helpers belong in browser-service instead of the provider
- bound any future ChatGPT manifest expansion so it only covers genuinely declarative data
- require live ChatGPT acceptance for any slice that changes workflow order, timing, or materialization behavior

## Out of Scope

- a wholesale attempt to express ChatGPT workflows in config
- broad multi-provider abstractions without at least one second real consumer
- unrelated ChatGPT feature work that is not part of the service-volatility boundary
- replacing the current low-risk manifest pilot; this plan starts where that one stops

## Current Hard-Coded Areas

### Adapter-Local Selector and Fallback Logic

- `src/browser/providers/chatgptAdapter.ts`
  - dialog/menu scanning order
  - row tagging and row re-discovery logic
  - delete/rename verification expressions
  - project/conversation list fallback order

### Artifact Parsing and Materialization

- `src/browser/providers/chatgptAdapter.ts`
  - payload recursion
  - DOM probe normalization
  - payload/DOM merge rules
  - download-button tagging and capture
  - estuary/image fetch and local file materialization

### Rate-Limit Tuning

- `src/browser/chatgptRateLimitGuard.ts`
  - weighted activity model
  - quiet-window growth
  - cooldown persistence and retry boundaries
- `src/browser/providers/chatgptAdapter.ts`
  - provider-local recovery pause and read-path retry behavior

### Shared Extraction Candidates

- `packages/browser-service/src/service/ui.ts`
  - generic menu/dialog/row-action helpers
  - download capture wrappers
  - structured UI diagnostics helpers

## Candidate Outputs

Potential outputs from this phase:

- a small number of new browser-service primitives
- narrower provider-local helper modules inside `src/browser/providers/`
- optional additional manifest fields only when they are clearly declarative

Possible later manifest-owned fields:

- bounded artifact payload markers if still purely classificatory
- rate-limit numeric knobs only if they can be isolated from guard mechanics

## Migration Strategy

1. Re-inventory the remaining ChatGPT behavioral drift and classify each item as:
   - manifest
   - browser-service abstraction
   - provider-local workflow logic
2. Cut the remaining work into separate implementation slices:
   - adapter-local selector/fallback slice
   - artifact pipeline slice
   - rate-limit policy slice
3. For each slice, add or tighten focused regression coverage before moving behavior.
4. Only externalize more manifest data after the bounded table/dictionary is isolated from workflow sequencing.
5. Re-run live ChatGPT acceptance for any slice that changes action ordering, waits, retries, or materialization behavior.

## Regression Coverage

### Unit Tests

- `tests/services/registry.test.ts` when manifest shape changes
- `tests/browser/browserService.test.ts` for any new shared browser-service primitive
- `tests/browser/chatgptRateLimitGuard.test.ts`
- `tests/browser/llmServiceRateLimit.test.ts`

### Adapter Tests

- `tests/browser/chatgptAdapter.test.ts`
- `tests/browser/chatgptComposerTool.test.ts` when menu helpers change
- `tests/browser/chatgptProvider.test.ts` if provider-level selector assumptions move again

### Acceptance/Smoke

Behavior-affecting slices should use the resumable ChatGPT acceptance path in `docs/testing.md`:

1. `project`
2. `project-chat`
3. `root-base`
4. `root-followups`
5. `cleanup`

Artifact-materialization changes should also be checked against the known artifact-heavy conversations already documented in `docs/testing.md`.

## Risks

- over-broad selector extraction could hide real DOM drift under weaker matching
- artifact parsing could be accidentally frozen into config even though the payload shape still evolves
- rate-limit tuning could regress live reliability even when unit tests stay green
- browser-service abstractions could be overfit to ChatGPT and become worse for Grok/Gemini

## Rollback Plan

- keep behavior-affecting changes in small slices with focused tests
- prefer additive shared helpers before deleting provider-local implementations
- if a live slice regresses, revert the consumer cutover and keep only the docs/inventory work

## Exit Criteria

This phase is on track when:

- every remaining ChatGPT drift area is assigned to manifest, browser-service, or provider-local ownership
- the next behavior-aware implementation slice has its own bounded scope and regression bar
- no additional manifest expansion happens without an explicit boundary justification
- live ChatGPT acceptance remains green for behavior-affecting slices
