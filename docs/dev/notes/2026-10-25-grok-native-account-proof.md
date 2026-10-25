# Grok native account-proof repair — Plan0453

Outcome: native configured account proof is restored. Eight of16 child tickets
remain closed; this packet does not close405/408/410 or unlock their dependents.
The configured account and live managed browser were present. Earlier missing-
account/browser conclusions were incorrect: the process stored its full command
in one argument element, which the initial scan did not parse.

## Qualified changes

- `645778fe0`: bind the actual Grok root/project transport target and endpoint
  into account authorization; invalidate old-target proofs, never invent a PID.
- `55afa2a23`: a name-only display label no longer suppresses stronger account
  evidence. Parse bounded Flight JSON and project `initialData.user` fields;
  reject conflicting user objects and exhausted traversal. The observed user
  payload lay beyond the previous16000-character script prefix.
- `7cb115ec9`: globally scanned DOM label/handle/avatar text is display context,
  not stable account authority. Bot discovery text cannot mask structured account
  proof. Real direct `next-data` conflicts still reject authorization.
- `fd93b676c` / worker `600b0a6b5`: Build refuses a selected native FileList before
  Send even if no provider chip has appeared. The causal regression observed one
  Send before the fix and zero afterward.

Latest source integration checkpoint: `556522f24a849e0256f090f7044d13dee308505e`,
including incoming main through `6cece5883`; documentation merge conflicts were
resolved by preserving both projects' entries. No unrelated source was changed.

## Verification and its limits

Primary independently ran112 tests across six files: Grok identity, adapter,
attached-session binding, session authority, Bots and Build. All passed. Fresh
build, full typecheck and primary six-file lint pass. Worker-reported earlier selections, causal reds,
lint and offline private-capture qualification remain in the two source notes.
This is implementation validation, not the reserved whole-program code-review
and subsequent TDD findings pass, which remain pending ticket completion.

A freshly built public CLI at `55afa2a23` ran:

```sh
node dist/bin/auracall.js --profile default profile identity-smoke --target grok --no-launch-if-needed --json
```

It exited0 with `launchedBrowser=false`, proof `match`, and both configured email
and handle dimensions matching observed stable provider identity. This is built
executable/native proof; no global installed-runtime upgrade is claimed.

After the DOM-handle repair, an exact retained-target governed read at556522f24
proved matching account before and after inspection. Owned Bot inventory returned
`grok_bot_surface_unknown`, zero qualified IDs. A freshly built public catalog
read returned `grok_bot_inventory_unknown`, zero qualified IDs and a verified
provider-account reference. Therefore account proof is qualified while native
Bot inventory/editor control discovery remains open. No inferred Bot ID or edit
URL was used.

Native raw receipts stay under
`~/.auracall/private/grok/implementation-native`, including built identity smoke,
retained-picker reads and built catalog read. Personal identifiers, raw bootstrap
and DOM remain outside Git. A reused auth-debug script overwrote its old fixed
filename and carried a stale hardcoded source tag; that raw result was preserved
as `20261025-auth-state-post-projection-raw.json` and is not used as a source-bound
acceptance receipt. The earlier result is also retained inside the prior
serialized-shape capture. Later retained-target receipts bind the live Git SHA
at invocation and use unique filenames.

No browser launch, Connector installation/OAuth, Bot creation/editing, chat Send,
file upload, Build generation, publication or provider deletion was performed.
Prepared effect packets remain pending explicit authority; exact account custody
is now resolved.405 still needs actual saved Connector/entity/grants proof;
403 needs upload-source binding;408 needs actual editor/create/edit readback;
410 needs actual app/version/preview/export bytes.406/409/411/414 remain dependent.

Memory disposition: forbidden. The developer prohibits memory writes absent an
explicit user request to remember; no Graphiti write is attempted.

## Retained UI state

The owned read staged one unsent `@` in the previously empty exact root composer.
The catalog read opened its dialog. A conservative restoration attempt sent
Escape only to the task-opened dialog, then refused to clear the draft because
the dialog remained. It matched account before/after, sent no prompt, and cleared
no other text. Leave that exact managed target in place; do not infer that an
unknown inventory proves there are no Bots. No additional native retry is queued.

Non-write receipt: `/tmp/grok-native-account-proof-memory-disposition.json`
(`recorded_no_write`, zero Graphiti writes). Fresh tracker readback confirms
eight closed children and eight open; parent398 remains open.
