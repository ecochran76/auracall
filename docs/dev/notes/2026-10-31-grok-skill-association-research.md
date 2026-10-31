# Grok Skill detail and Bot association research

Question: does this web client expose explicit persistent assignment of a Skill
to the exact owned Bot, with a stable saved identity? Bound: current native UI,
committed read-only component data and existing repository evidence; five governed
inspection slices. No internet re-search or account configuration mutation.
Stop after comparing one personal Skill's detail/identity at home and on the
original synthetic Bot route, plus its available detail menu. Baseline ed3ec65fc.

## Observed result

Normal startup recreated the existing managed Grok browser profile after the
previous process had exited. New Chrome PID1156715/start866957/port45040.
Original account checks passed before/after all five governed slices. Settlements
and transport cleanup completed. No source, installation or provider permission
change was made.

The personal Skill detail exposes SKILL.md, Preview/Raw, Edit and Try it now.
Its More options menu contains Share, Download, Disable and Delete. Only the
menu itself was opened; none of those actions, Edit or Try it now were selected.
No Bot picker, assignment switch or saved Bot-association identity was exposed
in the inspected detail view/menu. This is bounded surface evidence, not proof
that no other supported management path exists.

A bounded committed-component data scan recovered a stable Skill id, name and
`enabled:true`. The record also has file metadata and source provenance keys.
Its observed own keys do not include Bot/agent identity. Only selected identity/
status fields and key names were retained; hooks, callbacks, getters and network
requests were not invoked to discover data. The scan completed without exhausting
its budget. Raw personal Skill content/IDs stay outside Git.

The original synthetic Bot was then reached through its exact visible ID/name
sidebar link. Opening Plugins → Skills → the same detail from that exact Bot
route produced an identical Skill record (same stable id/name/enabled value).
Account continuity passed. This qualifies saved Skill identity shared across the
observed entry contexts, not a per-Bot grant, completeness of assignments, or the
persistence scope of the enabled switch. No switch was changed to infer scope.

## Evidence and decision

Primary receipts under `~/.auracall/private/grok/skill-research-20261031/`:

- Home detail: SHA256 `c822bb3e722a90d1a4c106b87807d0adf8a446efdfaebf75a37a7c5958f70acd`.
- Committed home identity: SHA256 `88873f533ee26e0db021af4452bdc54d4cbfe55ca6079db31b9fb575626f5f62`.
- Detail menu: SHA256 `68ef3e763f4ab38885de94979bce2eae4a3b3c84c101e8858ef427a02b152117`.

The private receipt index binds original-Bot entry and repeat-detail comparison
as well. These refine the [previous native report](2026-10-30-grok-resource-management-native.md)
and [official resource-scope research](2026-10-30-grok409-resource-capability-research.md).
They do not qualify the separate documented application's current-Bot enablement
contract for this client. Exact native Bot/account identity is established;
exact per-Bot resource association remains the missing provider contract.

[Issue409](https://github.com/ecochran76/auracall/issues/409) stays OPEN: stable
library Skill identity is progress toward discovery, but persistent Bot-specific
configuration/readback remains unmet. Do not present a global enabled value as
a saved Bot grant or guess setters. No behavior-changing TDD is initiated because
this research has not established that setter's contract. Existing public resource
reader remains Settings-scoped; this report does not expand its capabilities.

Next useful implementation, if selected, is a separate qualified library-read
contract retaining scope and exact Skill identity. It must not be counted as409
assignment acceptance. To complete409, require native evidence of an explicit
Bot association or document the exact provider/client gate; do not repeat the
same metadata/library inspection as though it were new qualification.

Validation: five native slices pass account continuity/settlement/cleanup;
documentation diff and ledger JSON checks only. No fresh code tests, build,
installed acceptance or hosted CI. Review/findings counters unchanged1/1.
Memory disposition:forbidden; no explicit user memory-write request.
