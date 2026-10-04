# Plan 0386 verified-cache archive reconciliation

Operator authorized continuation of the archive-publication gate. Used the
installed archive service's real upsertHistoryMaterializationItems path, also
called by the history worker. No mock service, synthetic job ID, scheduler
resume, browser launch or provider call occurred.

The successful installed control receipt and current artifact-fetch manifest
qualified the exact two files for conversation
6ab6d340-89e4-83ea-9990-d8fb278993e6, runtime/browser profile wsl-chrome-3,
bound identity eric.cochran@soylei.com. Both file bytes were rehashed and sizes
checked before publication. Original control provenance remains attached in
file metadata; historyMaterializationJobId is null because no queued job ran.

Local publication succeeded at 2026-10-04T04:03:29.737Z. The ZIP archive ID is
history-generated-artifact:chatgpt:eric.cochran_soylei.com:6ab6d340-89e4-83ea-9990-d8fb278993e6:download-dom_message-8_0.
Bailey_FY27_Proposal_With_Figures.zip has 1721645 bytes, application/zip,
SHA-256 c463e95ddac8fc739d5f5865986d63a33add63ff87696ec57a06be43bf8a46dc,
and fileAvailable=true. The PDF likewise agrees with its retained checksum,
2132164 bytes and application/pdf. Repeated real upsert retains both IDs.

The first verification incorrectly read a top-level size field; actual archive
size is metadata.fileSizeBytes. Corrected verification passes. An initial API
lookup timed out at its default five-second bound. Local host reads also hung;
fresh host load was 116.61/55.05/24.65. Do not infer API or scheduler acceptance
from successful local publication. No service restart or host recovery ran.

Private harness: /tmp/auracall-plan0386-debug/reconcile-cached-archive.mjs.
Private sanitized receipt: /tmp/auracall-cache-archive-reconciliation.json.
Queued-worker and autonomous live-follow acceptance remain open; scheduler
stays paused. Next step is API projection/asset readback followed by a bounded
normal-worker acceptance that preserves verified-cache reuse.

## Post-reboot readback

After the operator rebooted for the filesystem hang, local commands responded
normally and load was 3.03/3.07/2.88. Authenticated API checksum lookup returned
exactly the ZIP entry with fileAvailable=true, matching filename/size/checksum.
The authenticated asset endpoint returned HTTP 200, 1721645 bytes, and the same
SHA-256. Scheduler state is paused with foregroundWork.active=false. No provider
call or archive write was needed for this readback. Archive projection and
asset retrieval now pass; queued-worker/autonomous acceptance remains open.
The original temporary local-publication receipt did not survive reboot. The
adjacent JSON records the fresh authenticated API readback; the earlier
publication result remains documented above.
