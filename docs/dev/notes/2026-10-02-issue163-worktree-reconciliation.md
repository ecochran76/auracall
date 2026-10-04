# Root and worktree reconciliation — 2026-10-02

Work item: ecochran76/auracall#163. Operator: ecochran76.

## Verified integration

PR #162 merged exact head `b6130fc1f9dcc1b8bb25258fd3d8705b54c8ebd8`
into canonical `main` at `554cbe58b8d30b2360d6780894f1c31cbcf5444c`.
The primary agent inspected the published diff and reran 187 adapter tests and
typecheck successfully. No forge checks were reported; existing operator CI
waiver remains applicable. Root checkout was fast-forwarded to that canonical
merge, preserving the untracked `.tmp/` Graphiti receipt.

## Preserved work and remaining gates

- `feat/issue-49-chatgpt-affinity-rollout` remains remotely backed at
  `aed59b6c84af7b9e1edd11283c9bfd6e828f10c8`. Two commits are not in main:
  `c3626fc45` (policy v0.1.29 rollout) and `aed59b6c8` (rate-limit dialog fixture
  and classifier). They need separate scoped PR recovery; do not discard the
  branch because its earlier PRs merged. Issue #49 is closed while its plan
  remains OPEN, so outcome reconciliation is still required.
- `auracall-issue107-scope` contains three uncommitted files (lease restart
  reconciliation, configured utility affinity, and its production test),
  156 insertions / 3 deletions. Preserve them for owner-led recovery; ancestral
  HEAD alone is insufficient cleanup evidence.
- PR #120 remains open at `8a30ae34edbd13b3f6b3483f4a97c88bac2bd67b`.
  It is a separate Library cache bypass, with 13 changed files. Forge
  mergeability returned UNKNOWN; review and refresh that gate before merging.
- Plan 0386 Gate D remains OPEN. Trusted activation is canonical source only;
  installation parity and one separately bounded installed positive control
  remain pending. No browser command, installation, scheduler change, or live
  acceptance was performed in this reconciliation.
- Supplied AGENTS instructions reference policies 0035–0066 that are absent
  from current canonical source. Actual policies 0001–0034 were used for this
  slice; do not invent the missing files or silently claim policy parity.

## Worktree opportunities

This is a review, not disposal authorization. No physical worktree or branch
was removed. Clean integrated candidates still require current process/cwd,
ignored-file custody, and lane-owner checks before removal. Remote refs remain
retained. Seven missing detached registrations are eligible for targeted prune.

| Branch | Head | Disposition |
| --- | --- | --- |
| `docs/issue-163-worktree-reconciliation` | `554cbe58b` | preserve root |
| `fix/chatgpt-selector-drift` | `f6c53ca6c` | clean integrated cleanup candidate |
| `fix/issue-100-thinking-selector` | `389bda3f9` | clean integrated cleanup candidate |
| `fix/issue-107-library-cli-lifecycle` | `352b72bfa` | clean integrated cleanup candidate |
| `fix/issue-107-library-budget-composition` | `578fd73a5` | clean integrated cleanup candidate |
| `fix/issue-107-library-cache-bypass` | `8a30ae34e` | preserve open PR #120 |
| `fix/issue-107-library-client-cleanup` | `a2f265f13` | clean integrated cleanup candidate |
| `fix/issue-107-library-diagnostics` | `331c56fee` | clean integrated cleanup candidate |
| `fix/issue-107-library-inventory-stage` | `b2a29ab9c` | clean integrated cleanup candidate |
| `fix/issue-107-library-production-adoption` | `7564973de` | clean integrated cleanup candidate |
| `fix/issue-107-library-target-exit` | `6b4f041ee` | clean integrated cleanup candidate |
| `fix/issue-107-library-timeout-retry` | `75b30c0b6` | clean integrated cleanup candidate |
| `fix/issue-107-library-scope-recovery` | `96095e68c` | preserve dirty changes |
| `fix/issue-107-library-session-close-timeout` | `11507a926` | clean integrated cleanup candidate |
| `fix/issue-110-library-clock-ordering` | `97d4e0988` | clean integrated cleanup candidate |
| `fix/issue-123-tab-affinity-coexistence` | `0a800e22d` | clean integrated cleanup candidate |
| `docs/issue-125-closeout` | `9f877adff` | clean integrated cleanup candidate |
| `docs/issue-138-closeout` | `e0303b24a` | clean integrated cleanup candidate |
| `plan/issue-139-change-frontier` | `bf28f6b79` | clean integrated cleanup candidate |
| `docs/issue-139-closeout` | `d7e355667` | clean integrated cleanup candidate |
| `fix/issue-146-live-follow-governor-bootstrap` | `939726286` | clean integrated cleanup candidate |
| `fix/issue-148-bounded-cleanup-lease-retirement` | `aa385d2e1` | clean integrated cleanup candidate |
| `plan/issue-151-live-follow-traffic-efficiency` | `cb07bfca0` | clean integrated cleanup candidate |
| `feat/issue-93-terminal-receipts` | `b59a4fb9c` | clean integrated cleanup candidate |
| `fix/issue-94-profile-provenance` | `2165d64b1` | clean integrated cleanup candidate |
| `ops/issue-94-live-acceptance` | `5b65e16ff` | clean integrated cleanup candidate |
| `feat/issue-95-chatgpt-connectors` | `cf84d0363` | clean integrated cleanup candidate |
| `feat/issue-96-library-references` | `693008faa` | clean integrated cleanup candidate |
| `feat/issue-97-codex-wake-skill` | `2e31d9f6c` | clean integrated cleanup candidate |
| `fix/issue-98-soak-attribution` | `e6ba35bc9` | clean integrated cleanup candidate |
| `fix/chatgpt-materialization-surface` | `b6130fc1f` | clean integrated cleanup candidate |
| `research/issue-46-dispatcher-impact` | `7e3dc8e9a` | clean integrated cleanup candidate |
| `research/issue-46-lease-contract` | `7e3dc8e9a` | clean integrated cleanup candidate |
| `research/issue-46-test-inventory` | `7e3dc8e9a` | clean integrated cleanup candidate |
| `detached` | `404053dd1` | clean integrated cleanup candidate |
| `detached` | `4e5938cde` | prunable missing registration |
| `detached` | `45e07d6aa` | prunable missing registration |
| `detached` | `562884d03` | prunable missing registration |
| `detached` | `fe6375955` | prunable missing registration |
| `detached` | `ed7e1f0dc` | prunable missing registration |
| `detached` | `4c6d06d51` | prunable missing registration |
| `detached` | `252439ddc` | prunable missing registration |

## Catalog audit

Before the two scoped projection repairs, catalog-only audit against canonical
main reported 86 problems. This is not global governance acceptance.
After the P53/P85 repairs, audit against the proposed commit reports 82
remaining problems and zero findings on those two lanes. The complete
pre-repair finding set follows; most concerns are historical plan
metadata, missing remote custody, stale checkpoints, and unresolved overlaps.

- P74: unknown dependency lane: P61
- P85: invalid custody_state: OWNED
- P08: plan state CLOSED does not match catalog state OPEN
- P52: catalog checkpoint does not match the local branch tip
- P53: catalog checkpoint does not match the local branch tip
- P53: ACTIVE_WORKTREE lane has no assigned worktree
- P54: catalog checkpoint does not match the local branch tip
- P55: plan branch <missing> does not match catalog branch fix/issue-94-profile-provenance
- P55: plan target <missing> does not match catalog target main
- P55: plan integration <missing> does not match catalog integration merge
- P55: catalog checkpoint does not match the local branch tip
- P55: declared overlap lacks disposition: P56
- P55: declared overlap lacks disposition: P58
- P56: plan lane P55 does not match catalog lane P56
- P56: plan branch <missing> does not match catalog branch feat/issue-93-terminal-receipts
- P56: plan target <missing> does not match catalog target main
- P56: plan integration <missing> does not match catalog integration merge
- P56: local branch has no configured remote custody
- P56: catalog checkpoint does not match the local branch tip
- P56: declared overlap lacks disposition: P55
- P57: plan lane P55 does not match catalog lane P57
- P57: plan branch <missing> does not match catalog branch feat/issue-95-chatgpt-connectors
- P57: plan target <missing> does not match catalog target main
- P57: plan integration <missing> does not match catalog integration merge
- P57: local branch has no configured remote custody
- P57: catalog checkpoint does not match the local branch tip
- P57: declared overlap lacks disposition: P58
- P58: plan lane P55 does not match catalog lane P58
- P58: plan branch <missing> does not match catalog branch feat/issue-96-library-references
- P58: plan target <missing> does not match catalog target main
- P58: plan integration <missing> does not match catalog integration merge
- P58: local branch has no configured remote custody
- P58: catalog checkpoint does not match the local branch tip
- P58: declared overlap lacks disposition: P55
- P58: declared overlap lacks disposition: P57
- P62: plan lane P55 does not match catalog lane P62
- P62: plan branch <missing> does not match catalog branch fix/issue-100-thinking-selector
- P62: plan target <missing> does not match catalog target main
- P62: plan integration <missing> does not match catalog integration merge
- P62: local branch has no configured remote custody
- P62: catalog checkpoint does not match the local branch tip
- P59: plan lane P55 does not match catalog lane P59
- P59: plan branch <missing> does not match catalog branch feat/issue-97-codex-wake-skill
- P59: plan target <missing> does not match catalog target main
- P59: plan integration <missing> does not match catalog integration merge
- P59: local branch has no configured remote custody
- P59: catalog checkpoint does not match the local branch tip
- P63: local branch has no configured remote custody
- P63: catalog checkpoint does not match the local branch tip
- P63: declared overlap lacks disposition: P53
- P63: INTEGRATION_READY state lacks complete readiness evidence
- P64: local branch has no configured remote custody
- P64: catalog checkpoint does not match the local branch tip
- P64: INTEGRATION_READY state lacks complete readiness evidence
- P65: local branch has no configured remote custody
- P65: catalog checkpoint does not match the local branch tip
- P65: INTEGRATION_READY state lacks complete readiness evidence
- P66: local branch has no configured remote custody
- P66: catalog checkpoint does not match the local branch tip
- P66: INTEGRATION_READY state lacks complete readiness evidence
- P67: local branch has no configured remote custody
- P67: catalog checkpoint does not match the local branch tip
- P67: INTEGRATION_READY state lacks complete readiness evidence
- P68: local branch has no configured remote custody
- P68: catalog checkpoint does not match the local branch tip
- P68: INTEGRATION_READY state lacks complete readiness evidence
- P69: local branch has no configured remote custody
- P69: catalog checkpoint does not match the local branch tip
- P69: INTEGRATION_READY state lacks complete readiness evidence
- P70: local branch has no configured remote custody
- P70: catalog checkpoint does not match the local branch tip
- P70: INTEGRATION_READY state lacks complete readiness evidence
- P71: local branch has no configured remote custody
- P71: catalog checkpoint does not match the local branch tip
- P71: INTEGRATION_READY state lacks complete readiness evidence
- P72: local branch has no configured remote custody
- P72: catalog checkpoint does not match the local branch tip
- P72: INTEGRATION_READY state lacks complete readiness evidence
- P74: registered branch has no local or remote ref
- P74: INTEGRATION_READY state lacks complete readiness evidence
- P80: catalog checkpoint does not match the local branch tip
- P81: catalog checkpoint does not match the local branch tip
- P82: catalog checkpoint does not match the local branch tip
- P83: catalog checkpoint does not match the local branch tip
- P84: catalog checkpoint does not match the local branch tip
- P85: catalog checkpoint does not match the local branch tip
