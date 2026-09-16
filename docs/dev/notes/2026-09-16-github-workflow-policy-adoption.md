# GitHub Workflow Policy Adoption | 2026-09-16

- Installed selector release: `v0.1.26`
- Selected profile: `skill-repo-maintainer`
- Adoption mode: missing-modules patch on the current AuraCall policy baseline
- Adopted modules:
  - `forge-issue-reporting` as
    `docs/dev/policies/0033-forge-issue-reporting.md`
  - `github-issue-operations` as
    `docs/dev/policies/0034-github-issue-operations.md`
- Retained without duplication:
  - `git-worktree-hygiene` at
    `docs/dev/policies/0010-git-worktree-hygiene.md`
  - `work-item-traceability` at
    `docs/dev/policies/0031-work-item-traceability.md`
  - `collaborative-development-workflow` at
    `docs/dev/policies/0032-collaborative-development-workflow.md`
- Repo-local target registry:
  `docs/dev/forge-issue-targets.json`
- Memory-discovery assessment: `use` as the repo default because AuraCall
  explicitly adopts Graphiti discovery; this slice queried the available
  `openclaw_ec_main` group, found no AuraCall-relevant recall, and used current
  repo/provider evidence instead.
- Current provider readback: authenticated actor `ecochran76` has `ADMIN` on
  owned fork `ecochran76/auracall`, but GitHub Issues and private vulnerability
  reporting are disabled.
- Registry decision: allowlist read-only inspection, no issue mutation, no
  label mappings, and no security-report route. Enabling GitHub features or
  granting mutation actions requires a separate explicit decision and fresh
  provider preflight.
- Behavioral evidence: policy wiring and fail-closed preflight are validated;
  issue creation, comments, labels, assignments, milestones, Projects, closure,
  and repository-setting changes are not authorized and were not exercised.
- Fit assessment: the installed selector cleanly identified only the two
  missing issue modules. The existing pull-request and worktree policies remain
  the authoritative local contracts.

## Validation

- Post-adoption selector result: `already-aligned`, profile
  `skill-repo-maintainer`, zero validation problems, and no duplicate policy
  identities.
- Focused installed-bundle tests: `test_preflight_forge_issue.py` passed 11/11
  and `test_select_policy.py` passed 40/40.
- Full installed-bundle discovery: 122 tests ran; 112 passed and 10 errored
  because source-repo contract tests resolve non-installed paths such as
  `.agents/skills/modules/`. This is an installed-test-layout limitation, not a
  policy-content failure, and was not expanded into selector maintenance here.
- Goal policy audit: zero problems.
- Active planning audit: four pre-existing Plan 0017/0018 metadata findings;
  this adoption adds no plan or planning-contract change.
- Live read-only forge preflight: resolved actor `ecochran76`, role `ADMIN`, and
  repository `ecochran76/auracall`, then failed closed because the issue surface
  is disabled. It reported `operator_authority_verified: false` and
  `mutation_authorized: false`.
