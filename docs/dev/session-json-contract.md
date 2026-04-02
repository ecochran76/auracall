# Session JSON Contract

This note describes the machine-readable payloads emitted by:
- `auracall session --json [id]`
- `auracall status --json [id]`

## Single Session

Single-session JSON emits the stored session metadata plus a normalized
`reattachSummary` sibling object.

Key points:
- raw stored metadata remains present, including nested
  `browser.runtime.reattachDiagnostics`
- `reattachSummary` is a tooling-friendly projection for the last failed
  reattach state

`reattachSummary` fields:
- `capturedAt`
- `failureKind`
- `failureMessage`
- `discardedCandidateCount`
- `discardedCandidateCounts[]` grouped by `reason + liveness`
- `summary` matching the human-readable CLI text summary

## Session List

List JSON emits:
- `entries`
- `truncated`
- `total`

Each `entries[]` item is the stored session metadata plus the same
`reattachSummary` sibling object.

## Source Of Truth

The current exported TypeScript contract lives in:
- `src/cli/sessionCommand.ts`

Named exports:
- `SessionReattachSummaryCount`
- `SessionReattachSummary`
- `SessionJsonEntry<T>`
- `SessionListJsonPayload<T>`

Keep the doc and exported types aligned whenever this payload changes.
