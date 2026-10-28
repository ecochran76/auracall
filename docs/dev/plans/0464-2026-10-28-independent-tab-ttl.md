# Plan0464 — Independent tab ownership and TTL

State: OPEN
Branch: fix/ttl-ownership-integration
Target: main
Base: 00a45bd0bf7df36845ba100aec2a2ddf97e72f33
Work items: ecochran76/auracall#490, CochranResearchGroup/agent-browser#490, ecochran76/auracall#491

## Current State

The operator approved the three-ticket graph and explicitly requested one primary
ticket plus one worker per other unblocked ticket. Primary owns AuraCall ownership;
one worker owns Agent Browser TTL in its independent repository integration branch.
Shared acceptance has native blocking relationships to both repairs. No parent
issue is modified. CI excluded. No provider prompts or broad cleanup.

## Frozen outcome and seams

AuraCall closes only positively owned eligible tabs, preserving foreign/uncertain
targets including legacy census-generated deadline leases. Test through public
configured maintenance and real registry with controlled browser/time boundaries.
Agent Browser independently closes its eligible task under normal periodic reaping,
verifies disappearance and reconciles lifecycle while preserving peers. Worker uses
the highest existing owner/maintenance seam after qualifying the actual failure.

Shared installed acceptance in wsl-chrome-3 requires both validated candidates and
attributable automatic retirement. A later physical disappearance alone is not
proof of the responsible TTL. Preserve original peer targets and OS identities.

## Execution ledger

| Ticket | Owner | Branch/base | State | Blockers |
| --- | --- | --- | --- | --- |
| AuraCall#490 | primary | fix/ttl-ownership-integration / 00a45bd0bf7d | running | none |
| Agent Browser#490 | worker agent_browser_ttl | fix/issue488-tab-ttl / 7d9b4b7ad411 | running | none |
| AuraCall#491 | primary after dependency validation | same AuraCall integration | pending | both490repairs |

Primary owns AuraCall census/lease/retirement source, focused tests, operator docs,
this ledger and lane projection. Worker owns Agent Browser code/tests/docs and its
own ledger. Source contracts do not cross repositories. Runtime effects serialize
through primary. Reuse the existing clean owned AuraCall checkout and worker's
integrated clean enrollment checkout; no extra worktrees are created.

## Review and terminal criteria

Record red/green commands, result SHAs, validation and installed receipts before
tracker closure. Once all three tickets are qualified and closed, run exactly one
consolidated Standards/Spec review against the recorded repository bases, adjudicate
findings, then exactly one bounded findings-TDD phase. Focused regression checks
complete that phase; no new broad review loop. Reopen an affected ticket if an
accepted finding invalidates its closure. Parent488reports remain unchanged.

Final integration branches are repository-specific because Git histories differ;
this plan coordinates the validated branch pair, rather than pretending a commit
from one repository can integrate into the other. Source, merge, installed runtime
and tracker closure are separate gates.

## AuraCall source checkpoint

Primary TDD: the public owned/foreign fixture failed under census adoption, then
passed after registration removal. Legacy idle/lost/retiring cases were then red,
then green with explicit preservation at both automatic retirement boundaries.
62focused checks passed. Expanded nine-file selection exposed only a fixture ID
expectation that counted a removed synthetic lease; corrected to the actual owned
lease. Its14checks passed, completing88checks across the selected files. Full
source build/typecheck, scoped lint and docs validation passed. No native acceptance
yet. Red/green commands and private logs retained under user-scoped ttl-integration
artifacts. No broad code review has run; the reserved post-closure review is unused.
