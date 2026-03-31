# Service Volatility Service Plan Template

Use this template before starting any service-specific migration under the service-volatility refactor.

Suggested file name:
- `docs/dev/service-volatility-<service>-plan.md`

---

# `<Service>` Service Volatility Plan

## Objective

State the exact migration slice for this service.

Examples:
- extract model aliases and route templates only
- extract selector dictionaries for project/chat surfaces
- extract feature/app signature tokens

## Scope

List what is in scope.

## Out of Scope

List what is intentionally deferred.

## Current Hard-Coded Areas

List the current files/constants/functions that hold volatile service data.

## Proposed Manifest Sections

List the manifest sections to be introduced or consumed in this slice.

Example headings:
- `models`
- `routes`
- `selectors`
- `labels`
- `features`
- `artifacts`
- `rateLimits`

## Code Paths Touched

List the expected files/modules to change.

## Migration Strategy

Describe the exact order of changes.

Recommended pattern:
1. add schema/manifest support
2. dual-read old constant + manifest during transition
3. cut consumers over
4. remove dead constants only after tests are green

## Regression Coverage

### Unit Tests

List the focused test files that must pass.

### Adapter Tests

List service-specific browser/provider tests.

### Cache/Resolver Tests

List cache/model/config tests affected by this slice.

### Acceptance/Smoke

Name the live or semi-live acceptance bar required before merge.

## Risks

List the real failure modes.

Examples:
- selector drift hidden by overbroad fallback logic
- route mismatch causing wrong tab reuse
- cache invalidation drift
- artifact classification regressions

## Rollback Plan

State how to revert or disable the slice if regressions appear.

## Exit Criteria

The slice is done when:

- manifest fields are validated
- old behavior is preserved or intentionally updated
- regression suite is green
- docs are updated
