# Approved Grok unknown-effect abandonment recovery

User explicitly approved adding and using a separate abandonment action after
being told the original connector outcome would remain unknown. Source:
805f94d44. The public file-backed registry action requires exact scope, target,
revision, explicit acknowledgement and immutable approval evidence. Only expired,
ownerless idle/lost non-live-follow custody without process binding qualifies.
It atomically releases custody and records abandonment without confirming the
provider effect. Normal release/reconciliation retain their existing semantics.

TDD: the new public-registry test first failed with missing method. Green focused
command: `pnpm vitest run tests/browser-service/tabLeaseRegistry.test.ts
tests/browser-service/tabLeaseEffectReconciliation.test.ts --maxWorkers=1`:
27/27 pass, including one concurrent CAS winner, scope/target/revision/expiry/owner
refusals, restart durability, cloned audit and subsequent admission. Local
`pnpm typecheck` passes after correcting the audit field placement; scoped Biome
lint and diff check pass. No hosted CI was requested; local Linux/Node validation
does not reproduce hosted runners. No broad review or findings phase reset.

Exact approved reservation transitioned revision3to4, state released,
effectState outcome-unknown, finalDisposition preserved. Its approval audit and
original history remain. No browser/account/grant change or target close occurs.
Private immutable approval/result: `~/.auracall/private/grok/recovery-20261030/`.
Memory disposition:forbidden; no explicit user memory-write request.
