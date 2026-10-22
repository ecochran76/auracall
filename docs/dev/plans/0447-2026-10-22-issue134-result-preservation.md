# Plan0447 — Qualify completed result preservation (#134)

State: CLOSED
Owner: primary agent for ecochran76
Branch: fix/issue134-result-preservation
Base: 756939c9d

## Current State

Issue134 reports a captured ChatGPT answer discarded after stale-claim binding
on incident source4e5938cde. Current source already includes40ea42c19 in-flight
renewal. Verify that existing repair covers the exact reported duration before
adding runtime changes. No overlapping active implementation PR found.

## Scope and acceptance

Public executeChatgptConversation seam with real in-memory lease registry and
interaction ledger, fake clock, exact returned result and successful settlement.
Reproduce reported1703.3-second new-conversation completion across maintenance on
incident source; preserve answer with same target/conversation on current source.
Superseded/lost claims must fail closed without overwriting newer binding; absolute
deadline remains enforced and no automatic Send/retry. Existing heartbeat tests
cover timer stop/cancellation. Verify exact installed runtime separately. No live
prompt, historical session rewrite, receipt replacement, provider retry or memory
write. Evidence may qualify an existing repair without new production code.

## Diagnosis

Controlled replay substitutes only the incident executor4e5938cde into current
public registry/ledger fixture seams. After1703.3seconds and maintenance, the
new-conversation result rejects with the exact reported conversation-binding
stale-claim error; existing-conversation control rejects heartbeat stale-claim.
This recreates the failure mechanism, not the historical provider interaction.

Ranked hypotheses: (1) maintenance revises an unrenewed expired idle claim;
(2) local renewal revisions are ignored at settlement; (3) genuine supersession
must remain fenced. Current40ea42c19 renewal serializes claim revisions and uses
activeClaim for settlement. The same replay on current code preserves the exact
substantive answer, target/conversation binding and successful settled ledger.
No additional production patch is justified. Existing heartbeat coverage is
strengthened to reported duration/exact result and ledger checks, rather than
adding a duplicate happy-path fixture. Distinct completion-time takeover control
proves the old response cannot overwrite a newer owner before next renewal.

## Verification and limits

47focused tests/5suites pass: executor, configured affinity runtime, legacy runtime,
restart reconciliation and terminal receipt contracts.9installed compiled controls
pass (14unselected cases) including long completions, lost/taken-over claim and
absolute-deadline bounds. Installed executor/registry/ledger/reconciliation bytes
match current dist and the active issue357-55520b18e runtime; wrappers and API
PID2028634 remain unchanged/healthy. No restart is needed for test/doc-only work.
The terminal receipt suite verifies success/result integrity as a separate seam;
no end-to-end live provider session or historical receipt repair is claimed.

Private commands/fixtures/red/green/parity receipts:
~/.auracall/acceptance/issue134-result-preservation-20261022/.

## Review and delivery

Primary Standards review: fixed comparison756939c9d against this patch; AGENTS,
CONTEXT, policies0029/0018 and Matt code-review baseline. Public seams, real
registry/ledger and fake clock; strengthen existing cases with one distinct
supersession control. No production abstraction, weakened CAS fence or new retry.
Spec review: issue134 expected renewal option is already implemented and installed.
Exact result/identity propagation, settled success and negative ownership/deadline
controls pass. Terminal receipt contracts pass separately; original provider run
and receipt are intentionally not rerun/replaced. No accepted blocker remains.

Scoped Biome, typecheck and diff checks pass. No build/redeployment required:
production files are unchanged and installed seam byte parity was verified.
Regression additions and this closeout land through one linked PR; close #134 on
verified existing repair. Memory disposition forbidden: no explicit save request.
