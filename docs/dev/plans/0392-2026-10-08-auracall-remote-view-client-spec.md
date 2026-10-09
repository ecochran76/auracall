# AuraCall Remote-View Client Spec | 0392-2026-10-08

State: OPEN
Lane: P86
Parent: Plan 0391
Owner: Eric Cochran

## Current State

Tickets #240, #241 and #242 are published. Configured launch placement and the
passive dedicated client are in implementation; coordinated control remains
pending. All tickets stay open until integrated and installed evidence qualifies
their respective outcomes.
This is a local spec, not a claim of installed behavior.

## Problem Statement

AuraCall browsers need a dedicated application view through remote-view,
without requiring the operator to use the general root desktop. AuraCall can
own multiple desktops, so one browser or one undifferentiated stream is not
a sufficient product model.

## Solution

A dedicated AuraCall remote-view client navigates multiple AuraCall-owned
named desktops. Configuration chooses the default desktop and allows each
browser profile to override its assignment. Root desktop remains available
independently. Views begin passively; manual interaction requires explicit
control handoff coordinated with automation. Unavailable configured remote-view
stops clearly rather than falling back to root desktop.

## User Stories

1. As an operator, I want a dedicated AuraCall client so I can find AuraCall work.
2. As an operator, I want multiple named desktops so I can organize browsers.
3. As an operator, I want navigation between desktops so I can inspect each one.
4. As an operator, I want a global default so new browser launches are predictable.
5. As an operator, I want browser-profile assignments so different browsers can use different desktops.
6. As an operator, I want explicit root desktop selection so the general desktop remains usable.
7. As an operator, I want clear unavailable-desktop errors so I can fix configuration.
8. As an operator, I want an empty client state so no browsers is not confused with a failure.
9. As an operator, I want passive viewing so observing does not disrupt automation.
10. As an operator, I want explicit control handoff so I can interact without conflicting automation.
11. As an operator, I want control release so automation can safely resume.
12. As an operator, I want conflict messages so another controller is not silently displaced.
13. As an operator, I want durable reconnect so transient disconnection does not lose the desktop binding.
14. As an operator, I want closing the client to preserve browsers so viewing and browser lifetime remain separate.
15. As an operator, I want positive AuraCall ownership filtering so unrelated browsers are not presented as mine.
16. As an operator, I want existing authenticated browser state preserved so display selection does not force account migration.

## Implementation Decisions

- Extend shared configuration resolution and browser launch dispatch; provider
  adapters do not independently choose desktops.
- Model desktop names separately from browser profiles and runtime profiles.
- Global defaults and explicit browser-profile overrides resolve deterministically.
- Named desktops resolve to exact service-owned routes and display allocations.
  Do not use a raw DISPLAY environment value as ownership proof.
- Reuse Agent Browser remote-view readiness, build proof, inventory and durable
  handoff contracts. Do not persist ephemeral Guacamole provider links.
- Preserve existing configurations until the new behavior is selected. Do not
  move running browsers when configuration changes.
- Start with configured existing route capacity; do not automatically provision
  RDP users, desktops or infrastructure during browser launch.
- Build the dedicated presentation at its owning application seam. Any missing
  Agent Browser contract must be identified and implemented truthfully rather
  than inferred from a successful shared-display launch.
- Passive presentation uses Agent Browser desktop capture frames from the
  retained remote-view browser, with exact route/display checks before exposure.
  Frames are response-only and refresh at most once every 1.5 seconds per client.
  Observation exposes no interactive provider iframe.
- Viewer and controller ownership remain separate. A controller lease alone
  does not establish that AuraCall CDP writes are excluded. The integration
  must coordinate both or refuse conflicting handoff.
- A client filter is presentation scope, not a new security isolation claim.

## Testing Decisions

Test externally observable behavior through three public seams: configuration
and launch dispatch, client inventory/view selection, and control handoff with
automation admission. Prefer existing config-resolution and launcher test
harnesses. Known literal expectations must come from this spec, not a duplicate
of the implementation algorithm.

Cover two named desktops, global default, profile override, unknown desktop,
root selection, unavailable route and no fallback. Verify exact route binding
and build/readiness checks. Client tests prove positive ownership filtering,
multiple-desktop navigation, empty/unavailable states and durable reconnect.
Control tests prove passive observation, explicit takeover, real automation
exclusion, conflicting ownership, release and fresh-ownership resume.
Provider-free checks prove source behavior only. Installed acceptance must
separately demonstrate the dedicated client, two actual desktops and root
availability, followed by process/resource readback.

## Out of Scope

A separately installed native binary, provider prompts, account migration,
automatic desktop infrastructure provisioning, root replacement, automatic
movement of running browsers, and unrelated recovery or refactoring.

## Further Notes

The approved vertical slices and their blocking edges are recorded in the
parent plan: #240 → #241 → #242. Product decisions are settled. The next
implementation frontier is the joint source checkpoint for #240/#241, followed
by #242 control coordination and whole-plan integration/installed acceptance.
