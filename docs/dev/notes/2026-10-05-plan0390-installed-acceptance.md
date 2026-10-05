# Plan 0390 installed tab lifecycle acceptance

Final code: 3e58471b27d8b1584dce882fade80bbdcf22f007 (PRs 211, 212).
Ten-module installed parity and canonical build verified. API PID 46019, zero
restarts. One actual target was reused through follow/child/follow. Three extra
blank pages expired after five real minutes; retained follow remained despite
a one-second fixture TTL. Final run duration: 333511ms. Verified cleanup: native
browser absent, zero active/idle/retiring/lost leases. All 12 active completion
records and scheduler remain paused; background drain remains unpaused.

See `../evidence/plan0390/installed-3e58471b2-physical-proof.json`, parity and
runtime-state receipts, and the opt-in fixture in `../fixtures/`. The initial
CLI startup failure is retained: missing X authority, no browser left running,
corrected by using the API service's display authority. No provider navigation
or provider journey was spent. Broader asset materialization acceptance remains
OPEN with one previously authorized provider journey remaining.

Selected broad validation: 1781 passed, one skipped, 164 files. Unchanged
prompt-structure failure reproduced on clean PR 208 and its two-case file
excluded. Restart remediation: two observed red cases, 44 affected tests green,
typecheck/build/Biome green. Primary serial source review, no delegation.

Memory disposition: unavailable; no qualified AuraCall Graphiti destination
manifest. Repository-native source and receipts preserve the durable outcome.
