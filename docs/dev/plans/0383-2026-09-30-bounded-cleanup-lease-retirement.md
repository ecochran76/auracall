# Bounded Cleanup Lease Retirement | 0383-2026-09-30

State: OPEN
Lane: P83
Work item: ecochran76/auracall#148
Source base: `origin/main` at `939726286`
Branch: `fix/issue-148-bounded-cleanup-lease-retirement`
Target: `main`
Integration: merge

## Stable Objective

Make exact managed-browser shutdown retire every idle tab lease whose target is
proven nonexistent, so a completed bounded account-mirror pass cannot leave a
false `tab-leases-active` fence behind.

## Current State

Issue #146 is integrated and installed. Its single direct-CDP acceptance canary
completed one metadata pass and one bounded materialization attempt with no
visible rate-limit warning. The managed Chrome process and DevTools listener
then exited, but the crawler lease and materialization lease remained `idle`
for nonexistent targets. Normal affinity settlement idles leases for reuse;
the bounded cleanup paths terminate the whole browser without immediately
retiring those idle records, leaving retirement to the 15-minute expiry path.

The provider-free repair is implemented: both cleanup paths call one
configured ChatGPT shutdown-reconciliation helper after exact process-absence
proof and while their browser-operation fence is still held. The red regression
and the widened 240-test lease/affinity/completion/refresh/materialization gate,
typecheck, production build, affected Biome check, and diff hygiene pass.
Integration, exact install, and reconciliation of the two installed canary
leases remain.

## Architecture Contract

1. Affinity settlement may continue to idle a reusable target while its exact
   managed browser remains alive.
2. Once bounded cleanup positively proves the exact managed browser process and
   endpoint are gone, target absence is authoritative for that exact
   runtime/profile/service/tenant scope.
3. Idle leases in that proven-stopped scope transition through retirement to
   `released` with `already-missing`; active, in-flight, cross-scope, ambiguous,
   or identity-mismatched leases are never force-released.
4. Metadata cleanup and history-materialization cleanup share one deep lease
   reconciliation seam rather than maintaining divergent provider-specific
   mutations.
5. Cleanup reconciliation is local-only and performs no provider navigation,
   reload, dismissal, or retry.

## Execution

1. Add a provider-free regression that proves a stopped exact managed browser
   retires idle crawler and ephemeral leases immediately.
2. Introduce one configured ChatGPT shutdown-reconciliation helper at the
   browser ownership layer.
3. Invoke it only after metadata and materialization cleanup have proved the
   exact managed browser stopped.
4. Validate focused and adjacent lease, affinity, refresh, materialization,
   typecheck, build, lint, diff hygiene, and active-plan audit gates.
5. Integrate and install the exact canonical merge, reconcile the two preserved
   canary leases locally, and verify zero non-released leases with the scheduler
   still paused. Do not run another provider canary.

## Acceptance Criteria

- [x] Provider-free coverage fails before the repair and proves immediate
      `idle` to `retiring` to `released/already-missing` transitions afterward.
- [x] Only the exact stopped browser scope is affected; active, in-flight,
      ambiguous, and unrelated leases remain fail-closed.
- [x] Both bounded metadata cleanup and history-materialization cleanup invoke
      the same deep reconciliation helper after positive shutdown proof.
- [x] Focused and adjacent tests, typecheck, build, affected lint, diff hygiene,
      and active-plan audit pass.
- [ ] The exact canonical merge is installed and the two canary leases are
      locally reconciled to released with no browser process or port listener.
- [ ] Scheduler unit and operator posture remain paused; no additional provider
      canary is run.

## Non-goals

- No scheduler resume or broader live-follow activity.
- No reduction of lease TTLs as a substitute for deterministic cleanup.
- No force-release based only on an unreachable endpoint or stale process
  observation when exact owned shutdown was not established.
- No cleanup of unrelated browser profiles, scopes, or active workloads.

## Stop Rules

- Stop if exact managed-browser ownership or scope identity cannot be resolved.
- Stop if any target is still live or any candidate lease is active, in-flight,
  outcome-unknown, cross-scope, or otherwise ambiguous.
- Keep `auracall-account-mirror-scheduler.service` inactive and the API
  scheduler operator-paused throughout.
