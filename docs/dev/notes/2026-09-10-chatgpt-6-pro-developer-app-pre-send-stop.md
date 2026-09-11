# ChatGPT 6 Pro developer-app pre-send stop

Status: live zero-effect selector drift retained; no prompt submitted.

One operator-authorized LitScout product continuation used installed AuraCall
`0.1.1`, runtime profile `wsl-chrome-3`, and the exact new OAuth-active private
LitScout app `asdk_app_6aa32e43e4a08191b92060904afc706d`. ChatGPT's blank
composer was in Chat mode with Work off and displayed the newly observed model
label `6 Pro`.

The supported `apps test --submit` path stopped before Send with:

```text
Timed out waiting for ChatGPT model selector after 35s.
```

Passive browser and LitScout-ledger reconciliation found no new conversation,
user turn, or MCP invocation. A bounded direct-CDP qualification then preserved
the current model and attempted the same exact `@LitScout` mention boundary,
but did not observe a unique mention row within its 900 ms observation window.
It also stopped before Send and the staged composer was cleared. That short
fallback does not establish that the mention selector is broken: the supported
non-submitting path uses a longer eight-second bound and had passed before the
prompt attempt. The demonstrated defect is the supported submit path's failure
to preserve the current `6 Pro` model without waiting on its older model-selector
contract.

No prompt, ChatGPT conversation, LitScout tool call, provider request, OAuth
action, app lifecycle mutation, or canonical research mutation occurred. The
prompt allowance is unconsumed. Do not retry by forcing an older model label or
using the generic composer-tools menu. A bounded AuraCall source repair should
make `modelStrategy=current` accept and record the current model control without
selecting it, retain exact private-app identity checks, and pass provider-free
coverage before another live Send.

## Provider-free repair

The causal defect was narrower than the visible label. `submitTest()` created
a replacement browser config with `modelStrategy=current`, but its prompt
request omitted the strategy. A profile-level service binding could therefore
restore `select` inside the prompt workbench. The regression failed red at that
exact adapter boundary, and the minimal repair now passes `modelStrategy=current`
directly to `runPrompt()`. This does not recognize `6 Pro`, open the model
picker, or select a different model; it makes the active label irrelevant.

The first installed attempt after that repair crossed the model boundary but
still stopped before Send: ChatGPT exposed and activated one exact `litscout`
row, while generic composer verification did not recognize the resulting
`data-symbol="ecosystemMention"` inline pill. Ledger, Project 68, Session 129,
the root URL, and the blank composer reconciled unchanged. A second red tracer
now protects that exact current pill family, and the shared verifier recognizes
it without relaxing label or visibility matching.
