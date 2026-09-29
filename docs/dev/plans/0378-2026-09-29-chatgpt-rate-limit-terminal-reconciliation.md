# ChatGPT Rate-Limit Terminal Reconciliation | 0378-2026-09-29

State: OPEN
Lane: P78
Work item: ecochran76/auracall#131
Source base: `origin/main` at `5ba27dc614f12babdf2e5f04aa4c75fd8b88fe48`
Branch: `fix/issue-131-chatgpt-rate-limit-reconciliation`
Target: `main`
Integration: merge

## Stable Objective

Detect a delayed account-wide ChatGPT rate-limit warning on the leased or a
sibling ChatGPT target before releasing a browser operation, persist the
browser-profile cooldown, and preserve truthful non-retryable provider-effect
semantics.

## Current State

- Installed session `mail-wake-review-1790685771` reached a committed user turn
  and then terminated as a prompt-commit verification failure before ChatGPT's
  account-wide `Too many requests` warning was visible.
- The installed exact phrase classifier is present and prior receipts prove it
  works when the warning is already visible on the leased target.
- The `wsl-chrome-3` guard contains no detection or cooldown for this incident.
- `runRemoteBrowserMode` checks only its attached `Runtime` while handling the
  active error; after cleanup it has no bounded delayed or sibling-target
  reconciliation.
- Issue 131 records the defect and provider-free acceptance contract.
- The implementation remains absent; the next action is the delayed
  sibling-target RED fixture through the planned reconciliation interface.

## Execution Packet

- Add one provider-free public-interface regression in which a sibling
  ChatGPT target exposes the rate-limit warning on a later bounded poll; prove
  it fails before implementation.
- Add a small terminal-reconciliation module that inventories only ChatGPT
  page targets on the same resolved browser endpoint, inspects targets without
  navigation or clicks, and returns target identity plus a sanitized reason.
- Invoke that reconciliation only for uncertain or observed provider effects
  before the remote target lease is released.
- Persist the profile-wide cooldown for a detected rate limit even when a
  provider effect was observed, while returning a non-retryable
  provider-effect-reconciliation error and never resubmitting.
- Add the leased-target delayed case and bounded absence case incrementally.
- Validate focused browser/rate-limit suites, typecheck, scoped lint, build,
  diff hygiene, plan audit, and lane audit.

## Non-goals

- Retrying or resubmitting any provider prompt.
- Dismissing the provider warning, closing ChatGPT targets, or navigating tabs.
- Monitoring unrelated Chrome endpoints or browser profiles.
- Running a live ChatGPT request or installed acceptance during provider-free
  source repair.
- Generalizing all browser warnings into a background monitoring subsystem.

## Acceptance Criteria

- [ ] A provider-free regression reproduces delayed sibling-target detection
      and fails before the repair.
- [ ] Delayed warning detection works for both the leased target and a sibling
      ChatGPT target on the same browser endpoint.
- [ ] Non-ChatGPT and non-page targets are excluded, inspected clients are
      closed, and target content is not retained in diagnostics.
- [ ] No-warning reconciliation terminates within its configured deterministic
      attempt/interval bound.
- [ ] A detected post-effect rate limit persists the profile cooldown and
      returns `retrySafe=false` without changing the original effect state.
- [ ] Existing pre-effect rate-limit handling and prompt-effect reconciliation
      remain green.
- [ ] Focused and adjacent tests, typecheck, scoped lint, build, diff hygiene,
      plan audit, and lane audit complete with truthful receipts.

## Stop Rules

- Do not send a live ChatGPT request to reproduce or validate this repair.
- Stop if reconciliation requires navigation, clicks, target closure, or
  inspection outside the exact browser endpoint.
- Stop if the repair makes any post-effect outcome retryable.
- Preserve the original prompt-commit failure as the cause of a later detected
  rate-limit result.

## Validation Boundary

Provider-free fixtures and current source validation are authorized. Installing
the runtime, restarting services, dismissing the warning, or running a live
provider canary require a separate explicit authority gate.
