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
- Initial provider readback: authenticated actor `ecochran76` had `ADMIN` on
  owned fork `ecochran76/auracall`, while GitHub Issues and private
  vulnerability reporting were disabled.
- Follow-up configuration: explicit operator direction enabled GitHub Issues
  and private vulnerability reporting. Fresh readback reports both enabled.
- Registry decision: allowlist read, create, comment, edit, existing-label
  application, close, and reopen. Assignment, milestones, Projects/planning,
  label creation, transfer, and repository-setting changes remain outside the
  allowlist.
- Label mappings use only the nine exact existing GitHub labels. No label was
  created, renamed, recolored, or deleted.
- Behavioral evidence: repository feature configuration and read-only
  preflight are validated. No issue, comment, label application, assignment,
  milestone, Project, PR, branch, or worktree was created or changed.
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
- Initial live read-only forge preflight resolved actor `ecochran76`, role
  `ADMIN`, and repository `ecochran76/auracall`, then failed closed because the
  issue surface was disabled. Post-configuration preflights validate the
  enabled surface and exact label mappings while continuing to report
  `operator_authority_verified: false` and `mutation_authorized: false`.
- Post-configuration read-only preflights passed for read, comment, edit, close,
  reopen, and create plus application of all nine mapped labels. The create
  preflight found no duplicate for its non-secret validation marker and did not
  perform a write.
