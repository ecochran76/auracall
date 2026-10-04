# Plan 0386 Gate D retry: readiness-scope finding

Date: 2026-10-02
Runtime profile: `wsl-chrome-3`
Job: `hmj_1d8bf96fdc8e44c28b8c6dbf384e0d80`

## Authority and bounds

- One explicitly authorized installed positive-control attempt.
- Root Bailey proposal conversation, generated artifacts only, `maxItems=1`.
- No snapshot refresh, repair prompt, scheduler resume, warning dismissal, or
  retry.
- Passive observation followed the runtime-resolved DevTools endpoint.

## Result

- Terminal status: `skipped`.
- Conversations: 1; materialized: 0; skipped: 1; failed: 0.
- Typed manifest entries: none.
- Provider warning/CAPTCHA: none observed.
- Browser and exact lease cleaned up after the attempt; scheduler remained
  paused.

The result does not satisfy Gate D. The provider session and selected
conversation were authoritative, but AuraCall reported no downloadable asset.

## Reconciled defect

The bounded late-control wait used a page-global selector. Final extraction,
however, accepts only controls inside an assistant or user conversation turn.
An unrelated matching control could therefore terminate the wait before the
selected turn mounted its generated-file control.

The provider-free repair scopes the readiness predicate to the same role/turn
structure as collection and records explicit recoverability states:
`downloadable_now`, `repair_prompt_candidate`, `metadata_only`,
`terminally_unavailable`, and `materialized`. It does not send a repair prompt.

## Remaining gate

PR #158 integrated the scoped-readiness repair at canonical merge
`faac74e6b60f4356781be512719855d5dea44751`, and that canonical build is
installed. Source and installed SHA-256 values match for
`chatgptAdapter.js` (`32bc610239f01dce2d94a14ce0609d73768044fe2faeb99b5a768f32f651ff5a`)
and `historyMaterializationService.js`
(`bf2a99f151d960c13a5a3eb42f6b0e5fd2748c09ade48865fb0eba2fad5eab42`).
The installed API is active, the scheduler remains paused, active history
materialization jobs are zero, all 204 recorded leases are released, and no
exact `wsl-chrome-3` browser process remains.

Obtain separate authority for one no-retry installed positive control. Gate D
closes only when one Bailey asset is readable and its filename, size/type
evidence, checksum, manifest, and archive projection agree.

## Subsequent authorized retry

Job `hmj_ac49686510764445a6ecb8b3ebc8498d` ran once against the same root
Bailey conversation after the scoped-readiness repair was installed. It
completed `skipped` with one conversation, zero entries, zero materialized
assets, and zero failures. Provider identity matched on every required
dimension. The direct-CDP watcher followed port `45015`, observed no warning or
error, and accumulated 315 requests, three document requests, one top-level
navigation, and ten subframe navigations during this attempt. Final state was
zero exact browser processes and 205 released leases with no non-released
lease. No retry ran.

The failure localized another provider-free defect: the turn selector may
return a modern role-bearing search-unit node itself, but the artifact paths
read modern role keys only from a descendant. The source follow-up reads
`data-content-search-unit-key` and `data-chatgpt-search-unit-key` from both the
selected node and its descendant role node across artifact discovery, image
discovery, readiness, and click-time tagging. PR #160 merged the follow-up at
canonical `d8ed3c96f3878ea9fdc68614a2bc2bb9e164a74b`; the installed adapter
matches its build at SHA-256
`b6e64869d8c4351b66efe6da9fd6b647f749f69a699422d1a8cb093843f233d8`.
The installed API is active, scheduler posture is paused, and active history
materialization jobs are zero. Another live attempt requires separate
authority.
