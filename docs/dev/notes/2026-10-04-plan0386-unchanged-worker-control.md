# Plan 0386 unchanged archive-item worker acceptance

The installed API queued real job hmj_bbe8bf40e3b444c894622837e23307cb against the verified ZIP archive
item, force=false, artifacts only, maxItems=1, wsl-chrome-3 and the established
bound account. It terminated skipped after one attempt, with the exact reason
"Run archive item already has a readable local asset." Metrics: one conversation,
zero materialized, one skipped, zero failures. Scheduler remains paused and
foreground work inactive. The adjacent JSON is the sanitized terminal receipt.

The worker's archive-item branch returns before materialization when readItem
finds a readable local asset. No provider proof or scrape telemetry was created;
these are null, not independently measured network/CDP counters. This proves
installed durable dispatch and unchanged archive-item skip, not new-asset
worker capture or autonomous change detection.

The earlier exact artifact catalog lookup returned 404. Catalog source reads
the separate account-mirror artifact manifest, with a 500-item lookup window;
direct materialization writes conversation attachment/context caches. The
404 therefore does not prove a missing download or a broken catalog ID. No
synthetic catalog row was inserted.

Primary provider-free checks: three selected existing worker tests pass (88
excluded), covering redispatch, archive-backed skips, and traffic budgets.
The earlier installed transfer captured the ZIP once and reused unchanged
files; positive new-asset capture through the normal history worker and the
autonomous changed/unchanged frontier remain unproven. Do not resume scheduler
on this receipt alone. No additional provider control ran.
