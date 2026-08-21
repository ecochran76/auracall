# Reused Browser Provider Provenance PID | 0298-2026-08-21

State: CLOSED
Lane: P01
Operational state: INSTALLED ACCEPTED

## Stable Objective

Preserve fail-closed ChatGPT provider-session identity proof when AuraCall
reuses a live managed browser whose launch handle omits the browser PID.

## Current State

- LitScout Plan 0432 stopped before Send with
  `provider_session_provenance_missing`; its proof contained the exact new
  target ID but `browser process=unknown`.
- The managed profile retained `chrome.pid=58728`; browser-state and a fresh
  doctor proved PID 58728 alive on port 45044 and the configured SoyLei Pro
  personal identity matched the ChatGPT auth session on that same target.
- Provider fingerprints require both process and target identity. The local run
  passed only `chrome.pid`, which can be absent on a reused-browser handle.

## Selected Design

- Prefer the launch handle PID when present.
- Otherwise read the managed profile's persisted PID and accept it only after
  `isChromeAlive(pid, exactManagedProfileDir)` succeeds.
- Pass the resolved PID into the existing provider-session authority; do not
  weaken account dimensions, target binding, or stale/conflict rejection.

## Validation

- Red/green coverage proves live persisted-PID recovery and stale-PID refusal.
- Focused browser-mode, provider-session, and doctor coverage passes `53/53`;
  the broader ChatGPT/provenance packet passes `322/322`.
- Typecheck, production build, scoped lint, the 298-plan audit, and diff hygiene
  pass. Commit/push, installed parity, and an installed exact-profile resolver
  probe remain before closure.

## Non-Goals

- No prompt Send, provider call, identity bypass, account fallback, manual
  lease deletion, browser restart, or LitScout effect.

## Installed Acceptance

- Product commit `86ebba3e` is pushed to `origin/main`.
- Built and installed `dist/src/browser/index.js` are byte-exact at SHA-256
  `88a81b6377be2f0e7e99e00f1e9b10da01076d0e40477649c8492eebb8585f66`.
- The installed resolver recovered PID `58728` from the exact live managed
  profile and returned it only after exact-profile Chrome liveness validation.

## Acceptance Criteria

- [x] Reused live managed-profile PID is recovered and profile-validated.
- [x] Missing or stale PID remains fail-closed.
- [x] Existing provider account and target proof remains unchanged.
- [x] Source and installed runtime are accepted before any separately governed
  LitScout successor.

## Definition Of Done

Reused managed-browser runs can form the same exact provider-session
fingerprint as doctor without accepting stale or unowned process provenance.
