# Plan0459 — Silent installed app inventory

State: OPEN
Branch: fix/issue427-inventory-silence
Target: main
Owner: ecochran76
Work item: ecochran76/auracall#427
Base: d468ee7a6

## Current State

The installed exact command reproduces silence at an outer12s deadline.
Version finishes in1.624s and config show in5.412s. A correctly placed global
verbose flag reaches identity, attachment and inventory, but no terminal result
before an outer50s deadline. The effective operation deadline reports645000ms;
the short probes do not demonstrate expiration of that configured deadline.
The missing-progress cause is now qualified: CLI passes no progress observer
unless verbose is enabled. A minimized real-command/operation/adapter/file-queue
fixture stays silent at30virtual seconds; changing only verbose makes it pass.
The default CLI now reports long-wait stage/budget on stderr every30seconds.
No inventory policy or deadline was shortened.65 focused checks and typecheck
pass, as do build, scoped test lint and docs checks. Uninterrupted source-native
acceptance returned complete inventory with30apps, exit0 in347.649s, ten stderr
progress messages and one terminal JSON result. Review/integration remain open.

## Bounded outcome

Find the actual inventory wait, establish a fast source-backed reproducer and
repair it through the real command/adapter/transport seam. Preserve configured
capacity waiting, account/tab authority, warnings, browser lifecycle and unknown
effect fences. A diagnostics-only change is not proof of repaired inventory.

No prompt, app mutation, browser restart, warning clearance, CI change, deployment
helper or unrelated Grok work. One serialized native probe at a time. Raw
outputs remain private under the issue427 user-state directory.

## Execution and acceptance

Primary owns one serialized diagnosis track: real command → minimized fixture →
ranked falsifiable hypotheses → one-variable probes → regression before repair →
original-command verification. Claim recorded on issue427. Expected source
surfaces depend on the minimized reproducer; currently CLI inventory diagnostics
and app inventory adapter are discovery seams only.

Run focused tests, typecheck/build and scoped lint for the eventual change;
review Standards/Spec, integrate via PR, and distinguish source, installed and
live acceptance. Close only with the original symptom reconciled or an exact
external blocker stated. Capture a qualified Graphiti closeout under existing
standing authority. Never invent a root cause from an outer timeout.

## Diagnosis evidence

Red command: `pnpm vitest run tests/cli/developerAppWaitingDiagnostics.test.ts --maxWorkers=1`.
The default-mode case fails with empty diagnostics; verbose-only control passes.
Tests run the actual CLI action, public operation and real inventory adapter,
with isolated real file dispatch and a stalled browser SDK identity boundary.
They complete in under1s excluding runner/module startup. After the repair,
JSON stdout stays terminal-only, later failure retains the identity stage and
the waiting timer is removed before exit.

Ranked predictions: (1) dropping progress in the CLI explains the silence,
so verbose-only changes output; (2) missing operation-stage publication would
also suppress verbose output; (3) output delivery loss would leave the direct
console capture empty even with verbose. The control confirms1 and rejects2/3.
This qualifies diagnostics, not the still-unqualified provider inventory delay.

A measured installed probe spent19.5/34.8s idle and substantial time importing
modules; it did not establish a ledger CPU bottleneck. A private50MB-ledger
replay measured read-only public list calls at576–845ms. No ledger optimization
or history removal is justified by these observations.

The uninterrupted source command ran as `auracall-issue427-source-live.service`
with a700s outer observation bound and original provider/capacity deadlines.
It finished normally before that bound; complete inventory contains30apps.
Progress traversed queue, identity and inventory while stdout remained one JSON
receipt. This reconciles the apparent hang without proving why provider reads
took347.649s. Do not claim a performance improvement or a specific capacity
wait cause. No competing live probe or fence clearance was used.

Private stdout/result/summary/job status are under
`~/.local/state/auracall-issue427-20261025/`; `source-live.done` was written only
after result capture. Attempted completion wake was rejected with
`wake_permission_policy_required`; no wake was armed. The bounded probe
completed during active source validation, so no unattended resume was needed.

Primary review againstd468ee7a6 and issue427: Standards has one accepted
fixture-cleanup finding, remediated by guaranteeing timer/filesystem cleanup
even when an assertion fails; both affected tests pass afterward. Spec has no
blocking source findings. The live source run proves complete30-app inventory,
matching configured account, unchanged browser PID2122493 and responsive CDP
metadata. It does not qualify the cause or speed of the long inventory read.

Incoming main6a712f57d and85c32aa39 changed Grok and shared diagnostic tools.
Journal/fix-log conflicts preserve both intents; issue427 notes were placed
beside stable entries rather than competing for the first line. Separate
integration selections passed26 then23 checks, with fresh typecheck/build and
docs checks. These selections overlap and are not a cumulative test count.
