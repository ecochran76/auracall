# ChatGPT Service Volatility Plan | 0010-2026-04-14

State: OPEN
Lane: P01

## Current State

- roadmap classification: maintenance-only unless a concrete ChatGPT service
  volatility mismatch blocks current behavior or the primary service/runner
  lane
- the ChatGPT volatility pilot is still the live per-service execution plan for
  the broader service-volatility roadmap
- workflow-specific follow-on planning is already archived and this document is
  now the durable live pilot boundary
- the current need is stable canonical placement for the active service
  volatility pilot, not a semantic rewrite of the pilot scope
- the old loose path will remain searchable in the legacy archive once the
  canonical plan is wired

# ChatGPT Service Volatility Plan

## Objective

Run the first narrow service-volatility pilot on ChatGPT by extracting only low-risk, high-value volatile fields into a typed service manifest.

This pilot should validate the manifest architecture without moving ChatGPT’s fragile workflow logic into config.

Follow-on behavior/workflow planning is archived in [0025-2026-04-08-service-volatility-chatgpt-workflow-plan.md](/home/ecochran76/workspace.local/auracall/docs/dev/plans/legacy-archive/0025-2026-04-08-service-volatility-chatgpt-workflow-plan.md).

## Scope

Completed/approved low-risk ChatGPT slices:

- model aliases and browser picker label mappings
- base URLs, compatible hosts, cookie-origin lists, and route templates
- feature-flag keys and connected-app token dictionaries used for cache signatures
- composer taxonomy and low-risk composer heuristic vocabulary
- project/conversation UI labels and label sets
- provider selector families from `src/browser/providers/chatgpt.ts`
- selected static DOM anchor selectors used by `chatgptAdapter.ts`
- low-risk artifact taxonomy tables: extension/kind maps, MIME/extension maps, default titles, and payload marker strings

## Out of Scope

Still explicitly out of scope:

- adapter-local selector-family extraction inside `chatgptAdapter.ts` beyond named static DOM anchors
- project/chat workflow orchestration
- artifact payload parsing/merge logic and download/materialization behavior
- rate-limit guard tuning
- DOM materialization/download behavior
- rename/delete/create fallback order

## Current Hard-Coded Areas

Primary current locations:

- `src/oracle/config.ts`
- `src/cli/options.ts`
- `src/cli/browserConfig.ts`
- `src/schema/resolver.ts`
- `src/browser/constants.ts`
- `src/browser/urlFamilies.ts`
- `src/browser/providers/chatgptAdapter.ts`
- `src/browser/llmService/providers/schema.ts`

## Proposed Manifest Sections

Planned ChatGPT manifest sections for this slice:

- `models.aliases`
- `models.browserLabels`
- `routes.baseUrl`
- `routes.cookieOrigins`
- `routes.compatibleHosts`
- `routes.project`
- `routes.conversation`
- `features.flags`
- `features.appTokens`
- `composer`
- `ui`
- `selectors`
- `dom`
- `artifacts`

## Code Paths Touched

Expected touch list:

- manifest schema/loader modules
- `src/oracle/config.ts`
- `src/cli/options.ts`
- `src/cli/browserConfig.ts`
- `src/browser/constants.ts`
- `src/browser/urlFamilies.ts`
- `src/browser/providers/chatgpt.ts`
- `src/browser/providers/chatgptAdapter.ts`
- `src/browser/actions/chatgptComposerTool.ts`
- tests that currently encode ChatGPT defaults/aliases/route assumptions

## Migration Strategy

1. Add the manifest schema/loader with checked-in default manifests only.
2. Add a ChatGPT manifest file with models/routes/features fields only.
3. Dual-read current constants and manifest values during transition.
4. Cut low-risk consumers over:
   - model alias resolution
   - browser label mapping
   - compatible-host lookup
   - route generation
   - feature token dictionaries
   - composer taxonomy / menu vocabulary
   - UI labels / label sets
   - provider selector families
   - selected static DOM anchor selectors
   - low-risk artifact taxonomy tables
5. Remove dead duplicated constants only after tests and acceptance pass.

## Regression Coverage

### Unit Tests

- `tests/cli/options.test.ts`
- `tests/cli/browserConfig.test.ts`
- `tests/schema/resolver.test.ts`

### Adapter Tests

- `tests/browser/chatgptAdapter.test.ts`
- `tests/browser/chatgptComposerTool.test.ts`
- `tests/browser/chatgptProvider.test.ts`

### Cache/Resolver Tests

- `tests/browser/llmServiceIdentity.test.ts`
- `tests/browser/providerCache.test.ts`

### Acceptance/Smoke

Required minimum live gate before merge:

1. `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx scripts/chatgpt-acceptance.ts --phase project --state-file docs/dev/tmp/chatgpt-volatility-state.json`
2. `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx scripts/chatgpt-acceptance.ts --phase root-base --resume docs/dev/tmp/chatgpt-volatility-state.json`

Reasoning:
- `project` validates project route construction and project-surface navigation assumptions
- `root-base` validates root conversation route selection and core browser target behavior

If manifest extraction touches feature-signature behavior materially, also run:

- `pnpm vitest run tests/browser/llmServiceIdentity.test.ts tests/browser/providerCache.test.ts`

For the post-acceptance follow-on slices that only move declarative labels/taxonomy/selector families/artifact taxonomy and do not change route construction or feature-signature behavior, focused unit coverage plus `pnpm run check` is sufficient unless a regression is suspected.

## Risks

- route-template drift could break project or conversation targeting even if selectors stay unchanged
- over-eager alias normalization could change operator-facing defaults unexpectedly
- host-family extraction could break tab reuse or remote attach matching
- feature-token extraction could make cache invalidation too sensitive or too lax
- selector-family extraction could accidentally smuggle DOM workflow assumptions into config if it expands past provider-level static selector lists
- DOM-anchor extraction could accidentally ossify fallback strategy if it expands past stable named anchors into procedural DOM traversal
- artifact-taxonomy extraction could overreach if it starts encoding payload recursion or download transport decisions rather than simple classification tables

## Rollback Plan

- keep dual-read behavior until the acceptance gate is green
- preserve old constants behind one revertable adapter layer during the pilot
- if live routing regresses, revert the consumer cutover but keep the manifest schema/loader work

## Exit Criteria

This ChatGPT pilot phase is complete when:

- manifest fields for models/routes/features plus the approved low-risk follow-on slices are validated and loaded from checked-in data
- current ChatGPT behavior is preserved
- the named unit suites are green
- the required ChatGPT acceptance phases are green
- dead duplicated low-risk constants for this slice are removed or clearly marked transitional
- docs are updated to reflect the new manifest ownership boundary
