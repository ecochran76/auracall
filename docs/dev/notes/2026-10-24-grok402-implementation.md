# Grok text submission and completion — ticket 402

Source implementation packet for [#402](https://github.com/ecochran76/auracall/issues/402),
under [Plan 0452](../plans/0452-2026-10-24-grok-upgrade-spec.md).
Worker branch: `feat/grok-402-text`; integration base: `f1b2463b1`.
The coordinator owns integration, shared caller wiring, ledger, final review and
closure. This note is the worker's decision and validation receipt.

## Operator behavior

Explicit Grok model selection matches an exact configured model label/id/alias
and a single visible picker entry. Missing, ambiguous, disabled or visibly
account-gated choices fail before submission. Selected-state readback is required;
a click alone is insufficient. Model discovery includes observed Build entries
and separates selected state from entitlement. The coordinator adds Build to the
bundled registry. `current` verifies and preserves the selected entry; `ignore`
retains its explicit picker bypass semantics. Observed labels do not prove an
underlying model version or subscription grant.

The public Grok route retains prompt edge whitespace. Prompt preparation requires
one visible composer outside dialogs, pins it through insertion/readback, retains
immutable composer tokens and their identity evidence, and verifies paragraph,
blank-line and BR boundaries without trimming the instruction. Submission resolves
one enabled send control within that composer's form/ancestor and pins the control
for the click. A new response-turn count confirms commit; missing evidence after a
bounded five-second observation is **unknown**, requiring conversation
reconciliation. A dispatched click is never followed by Enter or a second click.
Transport/DOM uncertainty after dispatch carries `effectState: unknown`.

Response polling compares full content signatures and response IDs. Same-length
replacement content is observable. Stable text alone cannot finish the operation:
the current response also needs a non-streaming explicit completed state or visible
terminal response actions. A visible stop/busy/streaming signal prevents completion.
The first-turn warning probe works without an assistant node. Quota warnings stop
observation; polling also invokes the configured shared warning authority. Timeout
is an observation failure after an observed effect, rather than completed text.
The terminal DOM surfaces are fixture-qualified; current live UI acceptance remains
separate and unperformed.

Both Grok text routes attach the existing configured traffic authority and owned
backend observer before navigation and prompt effects. Remote target acquisition
receives the same authority contract. Local execution forwards its browser-run
options and requires an exact CDP target ID. Unknown owned-request cleanup rejects
apparent success. No second traffic ledger or provider capacity is introduced.

## Boundaries and integration requirements

The public text path is `browser/index.ts` → `actions/grok.ts`. The adapter's
Imagine execution path is separate and unchanged. Shared wrapper/caller changes
remain coordinator-owned:

- `sessionRunner.ts`: pass the resolved user configuration for serialized Grok,
  as well as the existing tab-affinity case.
- `configuredExecutor.ts`: pass the resolved configuration when service is Grok,
  retaining the existing ChatGPT tab-affinity condition.
- `cli/browserConfig.ts`: preserve an explicit Grok model override verbatim until
  action-layer exact alias validation; generic prefix resolution can otherwise
  erase an explicit miss before the action sees it.

Direct callers need the full resolved configuration in `tabAffinityUserConfig` or
an explicit matching governor to apply configured account identity/limits. The
existing minimal-config fallback alone does not prove cross-profile account scope.
No CLI/API/MCP parity acceptance or installed binary identity is claimed by this
worker. No provider/browser action, credential use, installation, deployment,
external message or tracker mutation was performed.

## TDD evidence

Seams: the actual Grok actions evaluating their generated JavaScript against
sanitized in-memory DOM fixtures, and public `runBrowserMode` with controlled
transport/action boundaries and isolated writable state. The fixtures prove DOM
selection/effect counts and orchestration contracts; they do not execute React or
ProseMirror internals, or prove a real account's UI/entitlement.

Exact tracer command throughout the vertical cycles:

```
pnpm vitest run tests/browser/grok402Text.test.ts --maxWorkers=1
```

Observed red → green cycles:

1. Unknown commit: the old action resolved after issuing Enter; now one click
   ends in an unknown-outcome error without keyboard send.
2. Exact submit: an unrelated earlier form was clicked and the delayed owned
   turn remained unconfirmed; scoped targeting accepts the delayed owned commit.
3. Missing/gated model: explicit Build absence resolved silently; now rejects.
4. Selected readback: a no-op Build click resolved; now rejects verification.
5. Streaming pause: unchanged partial text returned as success; now times out
   without terminal evidence.
6. Prompt boundaries: leading/trailing spaces were silently discarded; exact
   composer readback now repairs/preserves them.
7. Immutable tokens: the original rich composer clear removed the selected
   token; the same node now survives multiline preparation with a separator.
8. Dispatch uncertainty: a post-click transport failure lacked custody metadata;
   it now reports unknown effect without another send.

Public orchestration tracer:

```
pnpm vitest run tests/browser/grok402Orchestration.test.ts --maxWorkers=1
```

Initially failed because public routing trimmed the prompt. The corrected route
preserves its exact string, verifies current-model strategy without selection,
and supplies admission before navigation. Existing completion fixtures now supply
terminal evidence; the obsolete Enter fallback assertion is replaced by stronger
real-DOM custody regressions.

Focused validation: **60 tests pass across six files**, with `--maxWorkers=1`
and no retries (9.17 seconds wall time):

```
pnpm vitest run tests/browser/grok402Text.test.ts tests/browser/grok402Orchestration.test.ts tests/browser/grokActions.test.ts tests/browser/grokModelMenu.test.ts tests/browser/grokEvidence.test.ts tests/browser/browserModeExports.test.ts --maxWorkers=1
```

New text/orchestration tests plus existing actions, model menu, evidence and
browser exports are covered. `pnpm exec tsc --noEmit --pretty false` passes.
Touched-file `pnpm exec biome lint ... --diagnostic-level=error` and
`git diff --check` pass. Full repository tests, installed checks and live checks
were not run. The coordinator independently reviews and validates the integrated
revision before any broader claim.

Memory disposition: **forbidden** — this delegated provider-free packet excludes
external effects and leaves durable integration closeout to the coordinator. A
machine-readable non-write receipt is retained outside Git.
