# Active ChatGPT response protection during maintenance | 0392

State: OPEN
Owner: primary
Work item: Issue #226
Branch: fix/issue226-active-chat-retirement
Target: main

## Current State

Installed retirement replay closes a simulated active externally submitted chat whose lease is settled. Exact prior incident leases report already-missing with zero closes; actual disappearance remains unattributed. Regression at production maintenance seam is running, file-backed under build/issue226.

## Bounded outcome

Prevent maintenance from closing an active ChatGPT response, including expired lost leases and untracked/CDP-submitted chats. Probe failures preserve the target. Keep cleanup of positively inactive tabs. Add focused regressions, document contract, review and publish a bounded repair. Preserve unrelated root edits and existing worktrees. No new provider submission until source and installed repair qualification.

## Acceptance

Actual maintenance replay must fail before the fix and pass afterward for active and unknown provider activity. Ordinary inactive cleanup still works. Read-only provider activity probe never navigates or clicks. Retained incident artifacts remain unchanged. A later installed ChatGPT/LitScout run must distinguish protection proof from incident attribution.
