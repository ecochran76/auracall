# Plan0463 — Dormant tab TTL cleanup

State: OPEN
Branch: fix/dormant-tab-ttl
Target: main
Work item: Plan0463 (operator report of tab proliferation)
Base: ce140802491bbc5801b283853bae132f6eb8b90f

## Current State

Read-only census:22page tabs on four reachable endpoints;17have no AuraCall
lease records and require runtime ownership classification. wsl-chrome-3 has
four tabs: one expired idle lease and three expired lost leases. Activity probe
finds two inactive and two unknown. Source and installed maintenance module
hashes match, so this is not that module's deployment drift. No tabs closed.

## Bounded outcome and seams

Primary owner; serialized diagnosis/fix. Reproduce a preserved active/unknown
lost tab blocking retirement of another expired inactive tab through the real
configured maintenance entrypoint and public registry, using fake CDP boundaries.
Record red before root-cause selection; preserve active/unknown tabs and all
ownership/audit/close-proof rules. Investigate the17untracked tabs separately by
exact runtime identity; never assume they belong to AuraCall based on count.

No provider prompts, warning clearance, browser restart, blanket tab closure,
CI or resumption of deferred issue377. One source slice, targeted checks,
Standards/Spec review, docs and published checkpoint. Live cleanup requires
fresh per-tab inactivity and configured runtime ownership. Finish when eligible
dormant tabs progress despite another preserved tab; report any independent
runtime/account blockers without broadening cleanup authority.

## Qualified reproduction and repair

`pnpm vitest run tests/browser/activeChatRetirement.test.ts -t 'does not prevent expiry' --maxWorkers=1`
failed both active/unknown controls: expected only the preserved tab, received
both preserved and dormant. Test bodies34ms. Two tabs are the minimal scenario;
existing one-inactive-tab control passes. Live lost iteration order begins with
an unknown tab, ahead of another inactive lost tab and the expired idle tab.

Ranked predictions: (1) per-lost deferral escapes the profile loop and skips
later tabs; (2) expiry eligibility rejects the dormant tab even alone; (3) scope
resolution fails before activity inspection. Existing inactive-alone coverage
and live/current scope qualification rule out2/3. Isolating each lost lease's
error makes the two-tab cases green without changing classification or budgets.
21 focused checks and typecheck pass. No native tab has been closed yet.

The17unregistered pages are confirmed under Agent Browser user-data directories;
they are outside AuraCall TTL authority. AuraCall ChatGPT probe finds2inactive
and2unknown tabs, so eligible cleanup is bounded to the2inactive pages after
fresh revalidation. Preserve unknown pages and the independent Grok tab.

## Source acceptance

31 checks across activity retirement, configured maintenance, retirement audit,
maintenance scheduling and restart reconciliation pass. Typecheck, full source
build, scoped lint, docs:list and diff checks pass. Expanded regression covers
both idle and lost dormant successors, each preceded by active and unknown
preserved lost tabs. Fixed base ce140802491bbc5801b283853bae132f6eb8b90f.
Primary Standards review: no blocking findings; change is a per-lease exception
boundary, not a new cleanup policy. Primary Spec review: inactive expired tabs
progress independently; existing provider-activity, expiry, audit and native
ownership checks remain. No temporary production debug instrumentation.
Native cleanup/deployment not yet accepted. API status requires bounded readback
before any runtime restart; an initial five-second status read timed out, while
runtime-run read returned HTTP200. No restart has been performed.
