# Issue 151 Final Installed Live Acceptance

Date: 2026-09-30 America/Chicago  
Plan: `docs/dev/plans/0385-2026-09-30-live-follow-provider-traffic-closeout.md`  
Canonical implementation: `f55e687261a063f36b94cd41dd40d89fba233686`  
Integration: PR #153  
Installed CLI: `0.1.1`

## Source and install acceptance

- Focused and adjacent provider-free validation passed 72 tests, plus
  typecheck, production build, diff hygiene, plan audit, CodeGraph sync, and
  impact review.
- The full provider-free suite reported 3,487 passes, 65 skips, and two
  reproducible failures unchanged from `origin/main`: a disabled Grok video
  readback fixture timeout and a stale ChatGPT source-shape assertion.
- The install was built from a detached checkout at the canonical merge. All
  touched installed runtime artifacts matched that build byte-for-byte.
- The installed API was healthy. The scheduler was paused before the canary
  and remained paused afterward.

## Inert preflight

The initial exact-scope census found one orphaned owned browser process for the
selected AuraCall runtime profile and no non-released lease. That exact process
was terminated without touching unrelated browser state. A fresh census then
confirmed zero owned processes, zero DevTools listeners, and zero non-released
exact-scope leases before provider work began.

## Sole installed canary

One continuous read-only direct-CDP observer was attached before the canary. It
counted network and page events and probed the visible rate-limit-warning DOM;
it performed no click, reload, navigation, dismissal, or provider action.

The installed CLI created one metadata-only steady-follow completion with a
one-pass ceiling. Because the scheduler was intentionally paused, the same
completion was advanced once through its bounded `run-one-pass` control. No
preparatory refresh or automatic retry ran.

Commands:

```text
auracall api mirror-complete --port 18095 --provider chatgpt --runtime-profile wsl-chrome-3 --max-passes 1 --sweep-mode steady_follow --materialization-policy metadata_only --json
auracall api mirror-completion-control --port 18095 <completion-id> run-one-pass --json
```

Sanitized result:

- completion: `acctmirror_completion_b1acfca3-da4c-426f-87ed-e5c068d1cd22`
- terminal status: `completed`
- scheduler diagnostic: `clean_completion`
- pass count: 1
- AuraCall provider interactions: 2 active and 3 passive
- AuraCall explicit `Page.navigate`: 1
- direct-CDP targets observed: 1
- direct-CDP total requests: 163
- direct-CDP document requests: 1
- direct-CDP top-level frame navigations: 1
- direct-CDP subframe navigations: 4
- visible rate-limit warning: none
- observer errors: none

The single top-level document/navigation agrees with AuraCall's single explicit
navigation admission. Subframe and hydration traffic remained separately
observable and did not consume additional top-level route authority. The
canary stayed below both acceptance ceilings: fewer than four explicit
navigations and fewer than 2,146 total requests.

## Cleanup and final posture

The exact owned browser process was stopped after observation. The installed
maintenance path retired its settled idle lease through the normal
`idle -> retiring -> released` transition. A fresh final census found:

- zero exact owned browser processes;
- zero exact DevTools listeners;
- zero non-released exact-scope leases;
- zero active warning records for the selected AuraCall runtime profile; and
- scheduler state and posture still `paused`.

No raw conversation identifier, route, provider content, header, cookie, or
response body is retained in this receipt. Issue closure does not authorize
scheduler resume.
