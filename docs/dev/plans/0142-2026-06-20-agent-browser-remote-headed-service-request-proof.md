# Agent Browser Remote-Headed Service Request Proof | 0142-2026-06-20

State: CLOSED
Lane: P03

Closeout: no-provider-mutation proof completed on 2026-06-20 and rerun after
the agent-browser route-facing binary refresh. The repaired agent-browser
runtime now passes the remote-view readiness gate from the AuraCall working
directory and preserves AuraCall's requested remote-headed RDP posture in
no-launch access-plan output. The stale-daemon proof first exposed unsafe
fallback to the retained `default` browser/runtime profile. The clean-binary
rerun improved that behavior to fail closed on the locked AuraCall BYOP profile,
but the cutover still is not ready because agent-browser has no retained browser
or route descriptor for the externally running AuraCall Chrome lane.

## Purpose

Recheck agent-browser after upstream remote-view and service-routing repairs and
decide whether AuraCall can advance beyond Plan 0141's deferred pilot boundary.

This proof intentionally stops short of provider interaction. It may open a
single broker-owned tab to the target URL, but it must not click, submit,
scrape, upload, or mutate ChatGPT provider state.

## Baseline

Plan 0141 closed as **Pilot deferred** because AuraCall could register and
select the `auracall-chatgpt-wsl-chrome-2-consult` lane, but agent-browser
could not adopt or reuse the existing AuraCall BYOP Chrome process tree as a
retained service browser/session/tab. The cutover remained blocked while
`profileReuse.recommendedAction` returned `launch_new_browser`.

The new agent-browser instruction under review says AuraCall should prefer:

```json
{
  "browserBuild": "stealthcdp_chromium",
  "browserHost": "remote_headed",
  "viewStreamProvider": "rdp_gateway",
  "controlInputProvider": "manual_attached_desktop",
  "displayIsolation": "private_virtual_display"
}
```

## Proof Steps

1. Run `agent-browser doctor remote-view --json` from the AuraCall repository
   root.
2. Request a no-launch access plan for:
   - service: `AuraCall`
   - agent: `auracall-api`
   - task: `auracall-agent-browser-remote-headed-proof-20260620`
   - target service: `chatgpt`
   - account: `consult@polymerconsultinggroup.com`
   - URL: `https://chatgpt.com`
   - browser posture: `stealthcdp_chromium`, `remote_headed`, `rdp_gateway`,
     `manual_attached_desktop`, `private_virtual_display`
3. Submit the copied planned `tab_new` service request through
   `POST /api/service/request`.
4. Read back jobs, trace, browsers, tabs, and a fresh access-plan.
5. Stop before any provider-specific AuraCall adapter or live-follow cutover.

## Evidence

- Remote-view doctor from the AuraCall cwd now reaches the correct installed
  script root:
  `/home/ecochran76/workspace.local/agent-browser/scripts`.
- The readiness gate is green:
  - `manyToMany.privateDisplayAllocatorReady: true`
  - `manyToMany.routePoolReady: true`
  - `manyToMany.routeDisplaysReady: true`
  - `manyToMany.routeDisplayAccessReady: true`
  - `manyToMany.simultaneousViewingReady: true`
  - `guacamole.localEmbedReady: true`
  - `guacamole.publicOperatorReady: true`
- Remaining doctor issues are non-blocking for this proof but still worth
  operator cleanup:
  - `remote_view_privileged_group_membership_missing`
  - `remote_view_privileged_helper_not_usable`
- The access-plan selected
  `auracall-chatgpt-wsl-chrome-2-consult` by `authenticated_target` and
  preserved:
  - `browserBuild: stealthcdp_chromium`
  - `browserHost: remote_headed`
  - `viewStreamProvider: rdp_gateway`
  - `controlInputProvider: manual_attached_desktop`
  - `displayIsolation: private_virtual_display`
- The planned service request remained available and used
  `profileLeasePolicy: wait`, but `profileReuse` still reported:
  - `recommendedAction: launch_new_browser`
  - `compatibleLiveBrowserCount: 0`
  - `duplicatePressure: false`
  - `duplicateProcessAllowed: false`
- The queued request succeeded as job
  `http-service-request-tab_new-3db11da7-4a36-4170-92dd-5e7d1e690244`.
- The response showed the wrong execution lane:
  - `browserId: session:default`
  - `sessionId: default`
  - `profileId: default`
  - `runtimeProfile: default`
  - `url: https://chatgpt.com`
- `agent-browser service tabs --json` confirmed the resulting ChatGPT tab is in
  `session:default`, with title `Just a moment...`.
- Cleanup closed the unintended default-session tab with job
  `http-service-request-tab_close-17cd0f63-a96e-4347-a8d9-010067cce472`;
  tab readback retained the record as `lifecycle: closed`.
- A fresh access-plan after the queued request still selects the AuraCall
  ChatGPT profile but reports `compatibleLiveBrowserCount: 0`, so the default
  browser tab did not become a reusable AuraCall lane.
- Job trace recorded the request as `succeeded` with
  `displayIsolation: private_virtual_display`, but did not record
  `remoteViewRouteId`, `routePoolEntryId`, `viewerLeaseId`, or the selected
  AuraCall profile/runtime profile on the job record.

## Clean-Binary Rerun

After the route-facing agent-browser binaries were refreshed to
`4ae6838cd3c8b4de3341b4dc8b884e2dc14db62269212427e55b8239e4e4b6df`, the same
proof was rerun with task
`auracall-agent-browser-clean-baseline-proof-20260620`.

Evidence:

- `which agent-browser` resolved to
  `/home/ecochran76/.local/bin/agent-browser` and its SHA-256 matched
  `4ae6838cd3c8b4de3341b4dc8b884e2dc14db62269212427e55b8239e4e4b6df`.
- `agent-browser install doctor --json` returned `success: true` and no
  top-level issues. In the current shell, nested remote-view privilege status
  still reported `userInGroup: false` and helper usability issues, so a new
  shell or `newgrp agent-browser` may still be required before privilege
  checks report fully ready in this terminal.
- `agent-browser doctor remote-view --json` returned `success: true`,
  `status: ready`, and all required many-to-many plus Guacamole route readiness
  checks green.
- `agent-browser service status --json` reported:
  - `browserHealth: NotStarted`
  - `workerState: Ready`
  - `queueDepth: 0`
  - retained browser count `0`
  - retained tab count `0`
- `agent-browser service access-plan` again selected
  `auracall-chatgpt-wsl-chrome-2-consult`, preserved the requested
  remote-headed RDP posture, and returned an available `tab_new` service
  request.
- The service request failed closed as job
  `http-service-request-tab_new-3a8c634f-8049-4742-baef-acdb396dc0c1` with:
  `Chrome profile /home/ecochran76/.auracall/browser-profiles/wsl-chrome-2/chatgpt is already in use by PID 28288`.
- The locked process is owned by `auracall-api.service`:
  `/opt/google/chrome/chrome --remote-debugging-port=37379 ... --user-data-dir=/home/ecochran76/.auracall/browser-profiles/wsl-chrome-2/chatgpt about:blank`.
- Post-failure readback still showed no retained service browsers or tabs, and
  a fresh access-plan still reported `compatibleLiveBrowserCount: 0`.

Interpretation:

- The route-facing binary refresh fixed the dangerous failure mode where a
  queued AuraCall request silently opened ChatGPT in `session:default`.
- The remaining blocker is now the expected external-BYOP adopt/reuse gap:
  agent-browser can detect the profile lock and refuse duplicate launch, but it
  still does not represent the live AuraCall Chrome process as a retained
  service browser with reusable route hints.

## Decision

The cutover is **not ready**.

Agent-browser repairs are real: remote-view readiness now works from downstream
cwd, and access-plan preserves the requested hidden RDP/Guacamole posture.
The clean-binary rerun also fails closed rather than routing an authenticated
request to `default`. However, AuraCall must not enable the agent-browser
browser owner path until a repeated `POST /api/service/request` proof opens the
tab in the selected AuraCall service profile or reuses/adopts the existing
AuraCall Chrome process with route hints and route descriptors.

## Next Acceptance Gate

Before AuraCall adapter work resumes:

- `POST /api/service/request` using the access-plan request must return a
  service-owned browser/session/tab whose profile/runtime profile matches
  `auracall-chatgpt-wsl-chrome-2-consult`;
- the job or trace must preserve enough route metadata for AuraCall run
  metadata, including browser/session/tab ids and Guac/RDP route descriptors;
- a post-request access-plan for the same identity must either recommend
  `reuse_existing_browser` with top-level `browserId` and `sessionName`, or
  explain why reuse is unsafe without routing to an unrelated default browser;
- the ChatGPT tab must not be opened under `default` for an account-bound
  AuraCall request.
