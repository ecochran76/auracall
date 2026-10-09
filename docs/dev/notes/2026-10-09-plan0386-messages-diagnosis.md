# Plan0386 messages-not-found diagnosis: Phase1 evidence gap

User explicitly invoked diagnosing-bugs after the ten-journey objective was
blocked. Target symptom is journey8's `ChatGPT conversation
6ac76440-d80c-83e9-8b84-df32c009247d messages not found`, separately from the
already reproduced frontier reselection. No Phase2–5 claim or source fix.

Current readback at 2026-10-09T00:08Z: installed adapter SHA
5c893ff21d2f1fb86ee4dcbeff4c927ec1fdd509931704cd2892038cd3a07861 and shared UI
SHAc7d7d83603813ab9dbdc822d34000bed53efaf556dc59bde70faee62b3098790 still match
PR238. API PID12677, zero restarts. Parent paused/pass13, global scheduler paused,
zero active materialization jobs. Original two-hour journey window expired;
eight charged terminal, two unused. No journey9 started or bound reset.

## Attempts to establish the feedback loop

- Re-read the existing public single-visit context fixture. It supplies a
  synthetic successful message result, so its green result cannot diagnose this
  live missing-message symptom.
- Inspected saved artifact fields without printing private body/main text.
  Journey6 snapshots contain DOM/main/composer metadata but no response payload.
  Journey8 observer contains document counts, navigations and HTTP429 count but
  no conversation-response payload. Replaying an empty DOM alone cannot prove
  the reader missed messages that were available.
- Fresh live preflight via authenticated API and `python3
  /tmp/auracall-0386-final-local.py`: API is paused/idle, but the previously clear
  process assertion now fails. A read-only census identifies exact managed
  Chromium PID6377, started 2026-10-09T00:02:08Z, with three held idle tab leases
  from an app/root/other-conversation workflow. No live task owner established;
  parent PID1 and expired lease timestamps do not prove abandonment.
- Original A assets and earlier journey7 capture/manifest integrity remain
  unchanged in the fresh readback. Browser was neither attached to nor closed.

No command yet meets Phase1: a fast deterministic actual-reader reproduction
with trustworthy expected message content. Artifact inventory and process checks
are diagnosis evidence, not a red-capable bug loop. No ranked hypotheses,
production instrumentation or regression test was fabricated.

## Exact next evidence

Establish custody for the managed browser before a live capture, or obtain a
redacted conversation-response/DOM capture for the failing conversation. A
bounded normal read can then collect passive HTTP status, response shape and
rendered message structure without publishing message text, credentials or
headers. Use those actual inputs to establish the offline reader loop before
testing hypotheses. Any new live window must be explicit in the control record;
preserve the expired window, eight charges and two unused journeys.

The skill requires: "No red-capable command, no Phase 2." Phase1 remains
incomplete rather than substituting a nearby planner bug or another selector fix.
Browser-owner clarification was requested. Memory disposition: unavailable;
prior focused discovery supplied no qualified AuraCall group.
