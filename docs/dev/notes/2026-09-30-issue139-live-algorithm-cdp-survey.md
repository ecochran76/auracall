# Issue 139 live algorithm CDP survey

Date: 2026-09-30

Scope: bounded, read-oriented observation of the installed ChatGPT account-mirror
detail and materialization paths on AuraCall runtime profile `wsl-chrome-3`.
Provider interaction was serialized through an isolated API server with the
production scheduler left paused. A visible `Too many requests` dialog,
verification surface, CAPTCHA, or identity mismatch was a hard stop. None was
observed.

## Method

`scripts/capture-account-mirror-cdp.mjs` attached directly to every ChatGPT page
target on the managed browser's CDP endpoint. It enabled `Network`, `Page`, and
`Runtime`, recorded request/response and top-frame navigation events, and polled
the visible DOM for the known rate-limit dialog throughout each run. Provider
and conversation identifiers were replaced with route placeholders or one-way
pseudokeys before evidence was retained.

## Interaction ledger

| Probe | Result | Requests | Navigations | Targets before/after | Rate warning |
| --- | --- | ---: | ---: | ---: | --- |
| detail pass 1 | completed; one cursor item consumed | 888 | 4 | 10/11 | absent |
| detail pass 2 | completed; one cursor item consumed | 853 | 4 | 11/12 | absent |
| retained reconciliation | authoritative result skipped; no asset attempt | 239 | 1 | 13/0 | absent |
| persistent Library file | failed `library_row_not_found` | 293 | 1 | 0/0 | absent |
| volatile upload, conversation route | terminal evidence skip | 0 | 0 | 0/0 | absent |
| volatile upload, exact item, three separated candidates | terminal evidence skip | 0 each | 0 each | 0/0 each | absent |

The queued retained capture and the pre-install Library capture are retained as
harness/runtime failure evidence, but they are not counted as successful live
observations.

## Observed behavior versus the prior model

1. A detail-inventory item is not one cheap provider read. In both independent
   passes, the newly created target navigated to the same conversation three
   times. Each cycle rehydrated much of the ChatGPT application, producing
   853-888 network requests for one cursor item. The provider-facing cost is
   therefore dominated by full-page churn rather than the nominal item count.
2. A retained-snapshot reconciliation with `refreshSnapshot=false` still
   opened the provider, performed 239 requests, and navigated once, then spent
   its one-target budget without making an asset attempt. Its authoritative
   terminal result contained only `no-materializable-artifact` and
   `no-materializable-file` skips.
3. A persistent Library-file attempt produced 293 requests, including five
   file-endpoint POSTs, before failing `library_row_not_found`. The failure is
   explicit and non-retryable, but the amount of provider work is high for a
   single unsuccessful lookup.
4. The volatile-upload terminal guard is genuinely provider-sparing. Four
   probes across direct-conversation and exact-catalog-item routes all stopped
   locally with zero CDP requests and zero navigations.
5. The sampled volatile upload's terminal classification was backed by exactly
   one older `tile_not_found` entry for that same family. It was not a title
   collision in the current catalog. However, the historical child entry is
   merely `failed`, has no explicit availability value, no `failureKind`, and
   no `retryable` value, while its parent job is `succeeded`. This does not
   satisfy the desired durable statement that a failed volatile asset is
   unavailable.
6. Before reinstalling current main, a failed materialization left stale
   browser ownership that blocked the next probe with `tab-leases-active`.
   After installing current main, the same recovery path retired the dead
   ownership and left the browser-state registry empty. The tab-lease file is
   an append-only ledger; its historical records must not be reported as active
   leases.
7. The job ledger contains repeated refresh materializations that ran until the
   30-minute stale threshold. At least 18 recent instances were launched at an
   approximately hourly cadence. Repeating an already-stuck high-churn job is a
   separate amplification source from the per-item page reloads.

## Defects established by the survey

- The detail algorithm's logical unit (`one conversation`) does not bound its
  physical provider cost. Three same-route navigations and full application
  hydration recur deterministically across independent passes.
- Materialization performs provider work before proving that its selected
  target has an actionable asset attempt.
- Failed volatile assets have terminal behavior but lack an explicit
  `unavailable` representation, and aggregate job success can conceal the
  failed child.
- Recurring scheduling can relaunch long-running refresh materializations after
  they age out, multiplying provider churn without progress.

## Evidence files

- `2026-09-30-issue139-cdp-detail-pass-01.json`
- `2026-09-30-issue139-cdp-detail-pass-02.json`
- `2026-09-30-issue139-cdp-materialize-retained-01.json`
- `2026-09-30-issue139-cdp-materialize-retained-02.json`
- `2026-09-30-issue139-cdp-materialize-library-01.json`
- `2026-09-30-issue139-cdp-materialize-library-02.json`
- `2026-09-30-issue139-cdp-materialize-upload-01.json`
- `2026-09-30-issue139-cdp-materialize-upload-item-01.json`
- `2026-09-30-issue139-cdp-materialize-upload-item-02.json`
- `2026-09-30-issue139-cdp-materialize-upload-item-03.json`

## Remaining implementation gate

Convert the logical frontier into an explicit physical interaction budget:
preselect actionable targets locally, reuse one loaded conversation target,
avoid navigation when the target is already current, and persist per-asset
terminal availability (`available`, `unavailable`, or `unknown`) independently
of aggregate job status. Then replay the same bounded CDP cases and require a
large reduction in requests/navigations without losing deterministic cursor or
asset outcomes.
