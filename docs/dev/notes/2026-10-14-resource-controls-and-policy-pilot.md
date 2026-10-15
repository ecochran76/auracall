# Resource Controls And Policy Pilot | 2026-10-14

Authority: user approved the Ask Matt governance amendment/adoption packet.
Shared baseline: agent-policies ddbc90f86ede770ae8e78050677c4bc8d8381baa.
AuraCall baseline: 3711d41a8ce52988bfeb829a6e730ee60852ba78.

## Decision

Amend goal-execution-governance, planning-discipline,
model-selection-and-calibration and turn-closeout. Each concern has one shared
home; downstream copies are explicit adoptions. Preserve unchanged evidence and
reopen decisions only for named change/freshness triggers. Reserve closeout
capacity and check consumption before bounded units. The shared bundle is marked
UNRELEASED with a refreshed content digest, not relabeled as published v0.1.32.
AuraCall adopts this reviewed source delta directly; no global selector upgrade.

AuraCall's provisional implementation stop is 50% of an authorized token ceiling
or 80% of its time ceiling, whichever occurs first. This conservative reserve
responds to the observed 854,279-token closeout after a 1,648,195-token stop
announcement. It is uncalibrated and does not renew the paused issue165 budget.

## Pilot Admission

Version: installed governance-context 0.0.5.dev0.
Manifest: schema 1, `.governance/policy-context.json`.
Owner: primary agent. Profile: `policy-investigation`; task: `investigation`.
Read-only governance investigation only. Canonical source paths and hashes are
in the manifest. Implementation, browser/provider effects, release, integration
and autonomous goal resumption use direct canonical policies.

The ignored local `.codex/config.toml` holds the tested registration; the
tracked `.governance/mcp-config.example.toml` is its portable setup template.
Registration and admission apply to the isolated AuraCall pilot checkout, not
the dirty original checkout. The current Codex namespace still binds the old
root. Fresh stdio discovery/current packet/fallback reads pass; a fresh Codex
session must independently verify native client visibility and invocation.
Source text must be hydrated and consumed on first real use; admission saved
text is not proof of consumption. No real-task efficiency acceptance is claimed.

## Verification

- Installed-host preflight: admitted; exact root/includes/version, gov_policy
  discovery, current packet, readable canonical fallback.
- Five isolated profile checks pass: current, changed source, added policy,
  missing policy, out-of-scope task.
- Eight existing local-policy/preflight tests pass.
- Both repo goal-contract audits pass; manifest drift checks pass.
- Shared module/bundle byte parity and bundle content digest checked.

AuraCall evidence: `docs/dev/evidence/governance-resource-pilot/`.
Reproduce: `python scripts/dev/build_policy_context.py --check`; run
`scripts/dev/check_policy_context.py` with the registered governance venv Python;
run governance-context-preflight with `.codex/config.toml`, this checkout root,
profile policy-investigation, task investigation, expected version 0.0.5.dev0,
and required includes AGENTS.md and docs/dev/policies/**/*.md.

## Serial Review

Pinned baselines above; review the working diff against each baseline.
Standards: shared/local separation, canonical Markdown authority, bundle parity,
explicit source-delta adoption, source/inventory invalidation, no dirty-state
adoption. Accepted finding: stale published bundle identity after editing bundled
modules; repaired by marking the bundle UNRELEASED and refreshing its digest.
Spec: requested controls and narrow pilot configuration are present. Actual host
stopping, whole-turn savings and fresh Codex-client availability are unverified;
none is claimed. No blocking finding for the bounded source checkpoint.

## Remaining Gates

Source/adoption integration and native fresh-client check remain open. Runtime
budget enforcement requires an accessible host-controller boundary and observed
aggregate stop receipts. No synthetic counter test in these repos would prove
that behavior. Pilot usefulness requires paired representative real tasks and
whole-turn usage, including startup/cache cost. File presence and admission are
not effectiveness evidence.
