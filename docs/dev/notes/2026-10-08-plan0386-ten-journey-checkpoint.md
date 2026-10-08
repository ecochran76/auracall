# Plan0386 additional ten-journey admission checkpoint

Execution stopped after four charged journeys; six remain unused. Plan0386 remains OPEN and the ten-journey goal is incomplete. No new captures or production fixes landed in this allowance.

| Journey | Outcome |
| --- | --- |
| 1 | Pass6→7; child `hmj_e70fb8a4e309423f91ec0664b481c5bd` skipped, no downloadable artifact, zero transfers/snapshots. One detail document and one page. |
| 2 | Pass7→8; child `hmj_d096b5b9ea3a4185a4d94f0ca71939d2` skipped, no downloadable artifact, zero transfers/snapshots. One detail document and one page. |
| 3 | Pass8→9; collector context read of independently added row `6ac76440-d80c-83e9-8b84-df32c009247d` **failed** with `Provider traffic budget exhausted for detail/page_navigate at limit 1.` Refresh nevertheless completed. Child `hmj_e56e90aad21244a386f651c187a20d48` selected different retained row `6a95ef46-fb90-83ea-a0c9-33e5a50649dc` and skipped after one resolution attempt. Two distinct conversation documents, one page, zero downloads/snapshots. |
| 4 | Controller incorrectly started after missing journey3's nested failure. Stopped while waiting before eligibility; zero browser attachments, requests or downloads, no new child, passCount unchanged9. Conservatively charged. |

All collector identity verdicts match, and all observed HTTP429 counts are zero. These results do not establish complete A/B quiet behavior or positive independently changed-B capture. No skipped child is relabeled as acceptance. Individual JSON receipts and the [ledger](2026-10-08-plan0386-ten-journey-control.json) retain exact times/IDs and diagnostics.

## Control failure and local investigation

The controller checked top-level parent/child status and child reason text, missing a failed collector diagnostic inside a completed refresh. A direct replay against its actual condition went RED with `Controller admitted a completed refresh containing detail/page_navigate budget denial`. Including failed collector diagnostics and recorded observer hard stops makes the same replay GREEN. The controller is stopped; this correction does not clear the provider admission failure.

A provider-free root-route variation of the existing public adapter fixture passes one test in1.34s: a ready root conversation is read without navigation. This does **not** reproduce the live arrival/readiness state. Bounded native history lookup for only the failed conversation confirms a canonical `/c/<id>` route, without a project slug or query parameters. The retained observer records a single document navigation, and collector diagnostics record a second navigation admission denial. No captured DOM/transport trace establishes why readiness failed. No product patch is justified by present local evidence. Temporary diagnostic test was removed.

The source seam remains the existing `createChatgptAdapter().readConversationContext` regression fixture in `tests/browser/chatgptSingleVisitContext.test.ts`. Current live failure is not reproduced by its ready-root variant. Next work must obtain a trustworthy replay of the observed readiness/second-navigation boundary before a product fix or provider retry. Six unused journeys are preserved under the admission stop; no new allowance is claimed or requested.

## Terminal readback

At15:10UTC, API parent is paused at pass9, latest child skipped, scheduler paused. Native OS census reports zero exact managed roots, zero custom Chromium processes, zero held leases/controls. All three original A assets preserve size/hash/mtime; earlier journey7 file and manifest identities/count also remain unchanged. Installed source remains5b05f5371 with adapter/collector canonical parity verified at entry. Controller exec51505 terminated with exit143 intentionally; its journey4 monitor settled and wrote a terminal result. There is no live process being represented as terminal merely from an observation timeout.

Validation: sanitized JSON parses; direct admission replay RED then GREEN; root diagnostic1test PASS; whitespace check passes. No broad product tests or installation are claimed because production source did not change. Source acceptance still requires independently changed/missing B, complete sampled A/B quiet repeat, full mixed guard/reload, then dependent scheduler continuation.

Memory disposition: unavailable; focused discovery supplied no qualified AuraCall group.
