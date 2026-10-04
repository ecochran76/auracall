# Issue 165: fresh collector evidence and scheduler failures

Installed canonical `055010aa6` successfully ran normal queued worker
`hmj_9fa5382a07a7423ca13cdccb3b2a62fd`: one new PDF (183246 bytes,
SHA-256 `88a11545071c98f40838e2115e92524608bf11eb8dfc15e2a46436805efe0362`),
four verified cache reuses, one successful transfer, matching identity, and six
trusted CDP mouse events. Four remaining assets persisted as partial/deferred.
The private full receipt is `/tmp/auracall-normal-worker-control.json`.

The subsequent single scheduler pass, while still paused, failed. Request
`acctmirror_6c39650b-1eb0-418b-a20c-0e361184a290` started at
2026-10-04T18:49:09.623Z and ended at 18:51:04.659Z. The durable context-read
receipt reports a 120000 ms timeout, last stage `provider:chatgpt.navigateUrl`.
DOM-drift observation `domdrift-6b8fdeee-d3c0-4471-b005-4ccb2069b729`
records `WebSocket is not open: readyState 3 (CLOSED)`. The latest scheduler
receipt incorrectly remained an earlier dry run. Private control evidence is
`/tmp/auracall-scheduler-live-pass-control.json`; raw account data is excluded
from this curated note.

Two deterministic regressions reproduced the evidence defects. The real LLM
service returned cached asset controls after a failed fresh collector read;
the scheduler rejected an unexpected refresh error without returning a current
pass receipt. ChatGPT collection now disables cache fallback and retries and
forwards the declared provider-call timeout. Unexpected refresh errors produce
a current `refresh-blocked` receipt, preserving existing structured errors.

Focused provider-free validation: 132 tests passed across llmServiceFiles,
chatgptMetadataCollector, and schedulerService in 3.62 seconds, with no retries.
Both regressions were observed failing before their fixes. Installed acceptance
of these repairs remains pending. The actual navigation timeout cause remains
unproven; scheduler resume and autonomous changed/unchanged acceptance remain
open. No warning clearance, prompt, or scheduler resume occurred.
