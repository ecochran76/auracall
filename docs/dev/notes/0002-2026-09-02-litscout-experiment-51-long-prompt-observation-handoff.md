# LitScout Experiment 51 long-prompt observation handoff

## Source incident

LitScout Experiment 51 used AuraCall to submit one ChatGPT prompt and two
literal continuations in conversation
`6a978f34-485c-83ea-aefd-e5d8ea4884d7`. During the final continuation,
AuraCall's 3,600-second `auto` wait ended while ChatGPT was still generating.
The terminal observation contained 33,688 assistant-text characters, a visible
Stop control, and no provider error dialog, but AuraCall persisted a
`browser-terminal-response` error and the experiment was initially graded as a
model timeout.

A later read-only conversation-context reattachment recovered the completed
response from the same turn. No retry, resend, additional continuation, or
provider effect was required. The model did not time out; AuraCall's observer
stopped waiting.

Canonical LitScout evidence is preserved in:

- `docs/dev/validation/0491-frakktal-experiment-51-continuation-2-timeout.json`
- `docs/dev/validation/0491-frakktal-experiment-51-response-turn-03-recovered.md`
- `docs/dev/validation/0492-experiment-51-post-timeout-reconciliation.json`

Those paths are in the sibling `litscout` repository.

## Required semantic correction

AuraCall must distinguish four states:

1. the observation lease expired;
2. the provider is still actively generating;
3. browser/server connection to the conversation was lost or became stale;
4. the provider/model reached a genuine completed or failed terminal state.

An elapsed observer deadline is not by itself a model deadline. When current
evidence still shows generation, persist a resumable state such as
`observation_expired_generation_active`, preserve the accumulated response and
exact target/conversation identity, release or renew only the observer lease,
and direct callers to read-only reattachment. Do not persist terminal `error`
or invite a semantic resend.

## Reuse and enhance existing machinery

The repair should build on the existing prompt monitoring and instrumentation,
not add an unrelated polling path:

- runtime evidence callbacks and heartbeats already report browser runtime
  hints, provider thinking state, target URL, conversation identity, and
  confidence;
- `browserResponseProgress` already survives the browser runner error path;
- stored-run recovery can reattach to the exact submitted ChatGPT tab without
  replaying the prompt;
- session reattachment and ChatGPT response reconciliation already recover
  authored output after interruption chrome;
- the browser-service dispatcher, mutation audit, interaction governor, and
  exact managed browser profile/target identity remain the ownership boundary.

The missing behavior is renewable observation and a nonterminal timeout
classification tied to that existing evidence stream.

## Fifteen-minute connection guard

While a long ChatGPT prompt remains active, AuraCall may refresh or reattach the
exact conversation tab no more frequently than once every 15 minutes. This is
a connection-liveness guard for occasional prompts whose browser tab loses its
server connection; it is not a response deadline and never resends the prompt.

Preferred order:

1. perform a passive same-target progress probe;
2. if the target is healthy and progress is current, record a heartbeat and do
   nothing;
3. if progress is stale or an exact connection-interruption condition is
   observed and the 15-minute cooldown has elapsed, attempt read-only
   conversation-context refresh/reattachment;
4. only if a physical tab reload is required, keep the same managed browser
   profile, target, account, Project/conversation identity, and mutation-audit
   record; do not navigate to a new conversation and do not submit composer
   content;
5. reconcile accumulated text by stable assistant message/turn identity and
   bounded content fingerprint after refresh.

The current post-submit `preserveActiveTab` rule forbids reload recovery. A
successor must reconcile that safety rule deliberately: permit only the narrow
cooldown-bound connection-recovery reload above, or prove that context/API
reattachment is sufficient and retain the physical-reload prohibition.

## Terminal classification

AuraCall may mark a run terminal only after one of:

- provider completion is positively observed and final output is captured;
- a provider error or blocking state is positively classified;
- the browser and server connection are unrecoverable under a bounded
  reattachment policy and the status says connection/observation failure, not
  model timeout;
- the operator explicitly stops or cancels the run.

After any ambiguous post-submit failure, read-only recovery precedes evaluation
or retry. A new Send remains a separate, explicit effect decision.

## Provider-free acceptance cases

1. At 3,600 seconds with Stop visible and growing assistant text, the session
   remains resumable/running and does not become `browser-terminal-response`.
2. A later reattachment recovers completion without calling the prompt runner.
3. Healthy progress heartbeats suppress physical refresh.
4. A stale/interrupted active tab can trigger at most one guarded refresh in a
   15-minute window.
5. Refresh preserves exact target/conversation identity and accumulated text.
6. No recovery path clicks `Answer now`, touches the composer, or sends a new
   turn.
7. A real provider error, operator cancel, and genuine completed response still
   terminalize normally.

## Scope boundary

This is a handoff, not implementation or live-test authority. It authorizes no
browser launch, tab reload, prompt, provider call, install, service restart, or
mutation. Open a bounded AuraCall plan before changing timeout, monitoring,
reattachment, or reload behavior.
