# Grok Bot editor discovery packet — #408

State: BLOCKED_NATIVE_DISCOVERY. This packet is a proposal, not authorization or
implementation acceptance. Governing work: [#408](https://github.com/ecochran76/auracall/issues/408),
[Plan0452](../plans/0452-2026-10-24-grok-upgrade-spec.md), Plan0453.
Source base: `83e0951e8ca6b1da564be940088c671cc9e9ddd5`.

## Verified evidence and missing boundary

The [survey](2026-10-24-grok-ux-survey.md) inspected the Plugins → Bots → New Bot
creation dialog, which exposes Create Bot, a text input for the name, avatar
controls, a Terms link and Close. The retained private `bot-form-fields.json`
corroborates a nested Create Bot dialog with one visible text input; catalog
Search and an aria-hidden textarea are separate controls. No Bot was created,
no terms accepted and no post-create editor was inspected.

The existing [#407 source note](2026-10-24-grok407-bots-source.md) explicitly
identifies its stable-ID attribute/route fixtures as synthetic. They cannot
qualify a real post-create editor, persisted configuration or native ID shape.
Implementing guessed Description, Instructions, Model or Save controls would
violate #408's first criterion. No new mutation implementation is introduced by
this packet, and #408 remains open with all implementation/native gates intact.

## Proposed exact target

Read-only `profile list --json` and `--profile default config show --json` from
`83e0951e8` confirm active AuraCall runtime profile `default`, browser profile
`default`, resolved target `grok`. This matches the survey's configured target.
`auracall-grok-auto` also resolves to browser profile `default`; do not dispatch
both as independent browser/account lanes. The supported config output does not
provide a verified current Grok account identity. No identity smoke, browser
launch, page interaction or provider request was run for this packet.

Before any canary, resolve and verify the exact expected Grok account through
the supported configured account preflight on `default/grok`, and bind its opaque
account reference and the exact owned browser process/target in a user-scoped
receipt. A configuration/profile name or historical signed-in page is not account
proof. Stop if there is no exact configured expected-account match. Do not put
raw account identifiers, credentials or private DOM in Git.

## Proposed canary and bounded actions

Proposed new owned Bot name: `AuraCall-408-canary-20261024-r1`.
Before creation, inspect the exact owned-Bot inventory for that name. An existing
match requires reconciliation by stable identity; multiple matches stop. Never
create a replacement merely because the prior action timed out.

After explicit authorization for this exact account and effect:

1. Reverify account, governor/warnings, browser ownership and target. Open only
   Plugins → Bots → New Bot. Reinspect the nested Create Bot dialog and uniquely
   qualify its visible enabled name input and exact Create Bot action. Do not
   treat the underlying catalog Search or hidden textarea as the name field.
2. Enter the exact canary name and dispatch Create Bot once. The dialog says
   use additionally agrees to Terms: the authorization must cover this provider
   agreement. Record dispatch and retained target before awaiting completion.
3. Capture resulting canonical Bot ID, route, owner/account evidence and actual
   visible editor field/control labels with DOM roles/types and readiness.
   Separate saved values from unsaved input. Missing exact ID or unknown outcome
   stops mutation; reconcile the same target and inventory before any retry.
4. If the actual editor exposes uniquely attributable name, description,
   instructions and model-default fields, retain sanitized structural evidence
   and implement the public production path against those observed controls.
   If a field is absent or entitlement-gated, record that exact outcome; do not
   invent controls or count absence as successful configuration.
5. Authorize one edit to this exact created ID only: name
   `AuraCall-408-canary-20261024-r1-edited`; description
   `AuraCall ticket 408 synthetic acceptance Bot`; instructions
   `Synthetic acceptance Bot. Reply only to direct test prompts. Do not use external tools, send messages, schedule work, or modify external resources.`
   Preserve the provider-observed model default for this first edit. A model
   change needs one exact available model ID/label captured in step 3 and bound
   before dispatch. Use the actual observed commit/Save mechanism once.
6. Reopen the same canonical ID and read persisted fields plus selected model
   from the actual editor. Report requested, observed-unsaved and saved-readback
   values distinctly. A label, toast or dialog closure alone is insufficient.

No Bot invocation, Connector/tool grant, Skill/knowledge installation, scheduling,
publication, deletion or cleanup is included. Retain the canary for attribution.
New unrelated consent, CAPTCHA/MFA, account drift, warning, missing ownership,
ambiguous identity, multiple active editors or uncertain effect stops the packet.

## Acceptance and verification

This packet qualifies the missing discovery input and exact next actions only.
It does not close #408, unlock #409, prove public create/edit behavior, establish
installed runtime identity or satisfy native acceptance. After discovery, the
implementation still requires public CLI/API/MCP parity, durable ambiguous-outcome
reconciliation, provider-free real-path tests and separate native acceptance.

Validation: read-only config commands exited 0; private historical form evidence
was inspected without copying it into Git; `git diff --check` passed. No product
behavior changed, so no product tests or red/green cycle were claimed. The new
worktree initially lacks dependencies (`pnpm tsx` reports command not found);
config readback used the already provisioned integration worktree at the same
base, without changing its files. CodeGraph initialized successfully in the new
worktree (1,151 files); generated index remains untracked/ignored local state.
Memory disposition: forbidden — developer prohibits memory writes absent an
explicit user request. No memory write attempted.
