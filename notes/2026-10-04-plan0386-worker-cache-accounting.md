# Plan 0386 | Queued worker cache accounting repair | 2026-10-04

Issue #165; installed main 52f8fd38d. Renewed objective remains new-asset queued-worker acceptance, automatic changed/unchanged handling, and scheduler resume. RDP source fixes merged through PR #183; viewer/input acceptance is separate.

## Observed worker control

Normal API job hmj_c45cae01747647a88dc8d855d7716335 ran once from 18:22:18.869Z to 18:22:54.419Z. Request: exact wsl-chrome-3 ChatGPT account binding, conversation 6ab6d340-89e4-83ea-9990-d8fb278993e6, artifacts, maxItems=1, force=false, refreshSnapshot=false, providerWorkTimeoutMs=120000. Scheduler paused and foreground idle before submission; no other active materialization jobs.

Worker identity proof matched all four dimensions. The worker failed with: History materialization attempt result materialized 3 exceeds maxItems 1. Result and scrape telemetry were null. Independent page observer counted 266 requests and one Document request; no visible warning detected during coverage. This is not a zero-request control or complete traffic acceptance.

Local cache now contains one additional PDF, download-dom:message-1:1, 2132150 bytes, valid %PDF- signature, SHA-256 f753dc62116aa3b2b0a8ab0d2bdf83ac6a6cf18c529dd9625f5b9a6f6fe20205. The prior PDF and ZIP retained their exact prior checksums. The failed terminal job is retained; do not rewrite it as succeeded or remove downloaded bytes to manufacture another positive transfer.

## Diagnosis and repair

The adapter applies maxItems to uncached transfers and returns verified cached-provider-file entries alongside new transfers. The queued worker validator instead compared all materialized entries with maxItems. Deterministic queued-worker regression failed for two cached assets plus one transfer before repair; two new transfers must still fail under maxItems=1.

The repair excludes verified cached-provider-file entries from transfer-limit validation, remaining asset-budget accounting, and frontier download counters. File availability and result materialized totals still include cache reuse.

Focused validation: 94 worker-service tests plus 16 planner/metrics tests passed; 80 frontier-state/freshness/completion tests passed. Typecheck, build, scoped Biome lint, plan audit, and diff checks passed. Installed acceptance of the repair is pending. Scheduler remains paused.

## Harness preparation failures

No job was submitted in the preceding preflight failures. Raw HTTP status uses accountMirrorScheduler, unlike the CLI status projection. A subsequent observer attachment failed because stealth Chromium DevToolsActivePort contained only /devtools/browser; /json/version supplied the actual canonical WebSocket URL. Harness corrected to use that authoritative URL, consistent with the merged RDP endpoint repair. These are preparation failures, not additional provider control attempts.

Private detailed receipts remain under /tmp/auracall-normal-worker-control.json and preparation-failure locators. Canonical durable evidence is this curated note. Browser cleanup census after the control found no exact managed-profile Chrome process.
