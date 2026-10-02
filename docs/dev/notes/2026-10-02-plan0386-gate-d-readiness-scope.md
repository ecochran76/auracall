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

Integrate and install the scoped-readiness repair, then obtain separate
authority for one no-retry installed positive control. Gate D closes only when
one Bailey asset is readable and its filename, size/type evidence, checksum,
manifest, and archive projection agree.
