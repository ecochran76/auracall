# Grok utility lock: originating operation identified

Scope: user-requested diagnosing-bugs investigation of #409's browser admission
block, baseline `563faa1a7e0e2cb5b334398c245f092c273689e8`. No installation retry,
provider configuration write, ownership bypass or lock clearance was performed.

## Feedback loop and minimisation

Private `diagnosis-20261030-lock/loop.mts` invokes the real file-backed registry's
public reserve method on an isolated copy containing only the blocking lease.
It fixes time after the lease's expiry, supplies no live owner and attempts the
same Grok utility group on the dedicated inspection target. Two runs return
`workload-owned` and fail the assertion that inspection should be admitted.
No live registry or provider state is mutated. One retained unknown reservation
and one subsequent reservation are sufficient; the browser is unnecessary for
reproducing this admission symptom. This is a reproduction, not proof that the
registry's intended preservation rule is a source defect.

Command: `pnpm tsx ~/.auracall/private/grok/diagnosis-20261030-lock/loop.mts`.
Output: `actual=workload-owned; priorState=idle; priorEffect=outcome-unknown;
ownerPresent=false; expired=true; liveStateTouched=false`, followed by
`AssertionError: Grok inspection remains blocked by prior operation state`.

## Ranked hypotheses and evidence

Before examining operation-specific history, ranked: failed read misclassified
as uncertain; real change without confirmation; completed operation with failed
cleanup. Each predicts respectively read-only history, dispatched mutation, or
completed effects before lingering custody.

**The second hypothesis is supported; cleanup uncertainty also occurred.** The
exact target in the retained lease belongs to an Overleaf connector qualification
workflow, not the409Bot inspection. Its R5script at source
`5dc9fa4a3845591d1aa3fb985b26c7b254bfde94` created that dedicated target and
attempted Add for a synthetic custom connector. The final guard diagnostic passed;
the returned outcome was `unconfirmed/grok_connector_install_inventory_incomplete`,
`effectDispatched=true`, `transportCloseUnknown=true`. The script explicitly
settled unconfirmed dispatched work as unknown. This uncertainty is meaningful;
expiry or process absence does not establish that installation failed.

The shared ledger binds the original lease to the10:30UTC operation. Its outer
interaction was labelled list-read because its supplied interaction class was
generic, despite wrapping an in-page Add action. The read label therefore cannot
prove no mutation. Nested backend requests settled, but that does not establish
the connector's saved identity. No request/response body or credential is copied.

A later R7receipt at13:54UTC (candidate
`5ffb1714b7f4087f0c29c7b79aa8f07920357fae`, PR502) observed a connection-failed
category with `nameMatches=false` and `endpointMatches=false`, deliberately leaving
the original unknown lease unchanged. Its API contract explicitly states that a
terminal message without canonical identity cannot attribute the original outcome.
That observation is not a qualified effect-reconciliation receipt.

Two new passive exact-target browser-tools reads succeeded without navigation or
UI actions. The first output formatter flattened nested dialog objects; the
second explicitly serialized them. At those observations the visible surface was
the Plugins inventory, with no matching synthetic connector shown. This does not
prove complete saved-state absence or bind the earlier terminal failure to that
connector. Browser PID/executable/managed directory/start token matched before
inspection. The dedicated Bot target and other tabs received no UI action.

## Disposition and exact remaining gap

No source defect justifies weakening admission or clearing this reservation.
The lock is executing the documented unknown-effect rule. The missing evidence
is the original connector's exact saved identity/current authenticated state, or
an attributable terminal failure for that prepared operation. Preserve the
original target and evidence; use the owning connector workflow's reconciliation
path, without repeating Add, granting access, or changing its historical journal.
The current failure is specifically cross-workflow shared-browser custody, not
provider-wide capability absence or an OAuth diagnosis.

Focused validation: registry and effect-reconciliation suites pass26/26. Existing
tests cover unknown-owner preservation, exclusive groups and qualified public
reconciliation. No production fix or new regression test is warranted while no
incorrect implementation behavior is demonstrated. The original offline loop
remains red; runtime recovery and409management discovery are incomplete. No
additional broad review/findings round; counters remain1/1.

Private evidence index and intentionally retained debug loop:
`~/.auracall/private/grok/diagnosis-20261030-lock/`. R5result SHA256:
`37eabf7fadffaa95d15635cae52459a7cf0fb2e17101c6585c0cb87029ee40ef`.
R7observation SHA256:
`1b901264f9f52c40298b9b124981d730c9c4c0ec8b944ffcbce21dec422bd794`.
No production debug logging was added. Memory disposition:forbidden; no explicit
user memory-write request.
