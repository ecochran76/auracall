# Plan0458 — Deployment readiness contract

State: PLANNED
Branch: feat/deployment-readiness
Target: main
Owner: ecochran76
Source: Plan0455 retrospective, PR457

## Current State

Discovery only; implementation has not started. The existing installer invokes
an isolated compiled verifier for `/desktops`. API service installation invokes
systemctl but has no stateful readiness or rollback gate. No open deployment
issue or overlapping PR was found. The operator challenged automatic rollback
on timeout as an invitation to refuse upgrades; the contract is revised below.

## Proposed bounded outcome

One reusable deployment readiness contract separates isolated artifact checks
from live pre-/post-restart checks. Keep one HTTP probe in flight, explicit
deadlines, saved wrapper/artifact identities and a terminal receipt. Preserve
browser processes, auth/scheduler posture and unknown provider custody.

Revised direction:

1. Probe budgets bound observation, not upgrade eligibility. A timeout records
   verification pending; it does not establish that the candidate is broken or
   automatically trigger rollback. Keep the candidate installed, preserve its
   evidence, and arrange a bounded follow-up rather than declare success or
   repeat probes indefinitely.
2. Qualify rollback against concrete evidence of a candidate regression, such
   as a crash or a required route failing when the prior runtime passed the
   same check. Existing baseline failures do not become upgrade blockers.
   Stop a rollback that would overwrite another deployment's changes.
3. Distinguish starting, ready, failed and verification-pending outcomes.
   Confirm the revised contract before implementation; numeric observation
   budgets are configurable implementation defaults rather than refusal rules.

## Scope and acceptance

Reuse existing installer/verifier seams. Exercise the readiness contract against
a local HTTP fixture: delayed/unhealthy/malformed status, healthy static route,
deadline termination into verification-pending, probe concurrency and
evidence-qualified rollback. Tests are
provider-free and use isolated state. No existing browser launch/close, provider
action, live deployment, CI change, process-census redesign or Graphiti-runtime
change is included in implementation acceptance.

After contract confirmation: create/claim the bounded issue, register its lane,
implement through public-seam red/green tests, review Standards and Spec, and
commit/publish through a PR. Detailed implementation choices remain contingent
on the revised outcomes. No ADR is needed for reversible numeric defaults alone.
