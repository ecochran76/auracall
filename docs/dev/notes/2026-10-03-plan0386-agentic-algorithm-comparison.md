# Plan 0386: recorded agentic sequence versus product discovery

Date: 2026-10-03. Work item: #165. Provider-free follow-up only.

The successful agentic command and output survive in
`/home/ecochran76/.codex/shared/sessions/2026/09/28/rollout-2026-09-28T20-12-14-01a0eab8-2df1-7003-b588-6a4f20a70def.jsonl`,
records 21538–21539. The preceding synthetic click returned success but no
file. The successful run selected the root conversation page, set download
behavior, checked visible dialogs, required exactly one visible control, and
scrolled it into view before computing its center.

```js
Browser.setDownloadBehavior({
  behavior: "allow",
  downloadPath: "/tmp/auracall-plan0386-asset.Yw5UVl",
  eventsEnabled: true
});
// Runtime.evaluate: visible matching node, scrollIntoView, bounding rect center.
// Selector: span[role="button"][aria-label="Download Bailey_FY27_Proposal_With_Figures.zip"]
Input.dispatchMouseEvent({ type: "mouseMoved", x, y });
Input.dispatchMouseEvent({ type: "mousePressed", x, y, button: "left", clickCount: 1 });
Input.dispatchMouseEvent({ type: "mouseReleased", x, y, button: "left", clickCount: 1 });
```

Coordinates were computed inside the evaluation, not emitted in the receipt.
The event GUID was `3416010a-40d5-464b-a2b3-4c387d62eca4`.
`Browser.downloadProgress` completed with total/received bytes both 1,721,645.
The ZIP SHA-256 is
`c463e95ddac8fc739d5f5865986d63a33add63ff87696ec57a06be43bf8a46dc`;
archive validation passed for `Bailey_FY27_Proposal_With_Figures.docx`.

The product's trusted activation now uses the same move/press/release sequence,
with explicit `buttons` values and geometry validation. Its upstream selection
uses assistant-turn discovery and scoped tagging rather than the agentic run's
exact filename selector. The installed control's zero assets and absent entries
provide no evidence that activation was reached. No emitted CDP call trace
proves which eligibility decision removed the candidate.

A deterministic fixture executes the actual discovery evaluation against the
recorded modern assistant-root/filename-control shape. Three cases reproduce a
separate defect: a hidden control, an unnamed control, or a textdoc control can
satisfy the old readiness predicate while collection rejects it. The old source
returns an empty result before a later DOM mutation mounts the eligible ZIP.
All three cases fail before the repair. Readiness now checks the collected
eligible probes initially and on mutation, returning that same result. This
preserves the single evaluation, five-second wait, ten-second outer bound,
assistant scope, and exclusions. It adds no navigation or provider requests.

Validation: all 190 adapter tests, typecheck, production build, scoped lint,
plan audit, and diff hygiene pass. This demonstrates a source defect and
repair, not causality for the prior live job or installed acceptance. Gate D
remains open; no install, provider probe, or scheduler resume occurred.
