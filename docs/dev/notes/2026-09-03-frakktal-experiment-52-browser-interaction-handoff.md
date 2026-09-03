# Frakktal Experiment 52 browser-interaction handoff

Date: 2026-09-03
Source incident: LitScout Frakktal Experiment 52
Audience: AuraCall browser/composer and observation maintainers
Scope owner: AuraCall

## Purpose

Use the Experiment 52 evidence to tune AuraCall's ChatGPT browser interaction
semantics. The long-observation timeout repair is already merged, installed,
and live-accepted through AuraCall Plan 0328. This handoff addresses the
remaining distinction between browser transport, provider commit, conversation
identity, active generation, terminal completion, and recoverability.

This is a handoff, not an implementation plan or live-effect authorization. It
does not reopen Skill CRUD, does not belong to LitScout's implementation lane,
and authorizes no prompt, attachment, browser, provider, scheduler, install, or
runtime action.

## Source evidence

LitScout authorities:

- `docs/dev/plans/0499-2026-09-02-research-coordination-experiment-52.md`
- `docs/dev/validation/0499-frakktal-experiment-52-terminal.json`
- `docs/dev/validation/0499-frakktal-experiment-52-evaluation.md`

The terminal receipt identifies one provider conversation,
`6a987662-6578-83ea-bef5-6a465a31eada`, with exactly one initial Send and one
literal continuation. The frozen prompt and attachment bytes did not change.
The browser outcomes did not match AuraCall's terminal classifications.

### Observation A | Pre-Send selector proof was incomplete

- AuraCall session: `plan0499-frakktal-experiment-52`
- AuraCall stopped before Send because the configured selector expected an
  effort-control surface the current ChatGPT UI did not expose.
- Provider UI proved `GPT-5.6 Sol / Pro`; launcher metadata remained only a
  surrogate and reported `gpt-5.2-instant`.
- No semantic Send was consumed.

Required semantic: an adapter must distinguish configured intent, selection
attempt, provider-visible selected model/mode/effort, and unsupported or absent
controls. A successful model-family observation must not imply that the full
semantic selector was proved.

### Observation B | Initial Send committed despite terminal error

- AuraCall session: `plan0499-frakktal-experiment-52-send`
- Recorded status: `error`
- Recorded error: `Prompt did not appear in conversation before timeout (send
  may have failed)`
- Recorded conversation ID: null
- Actual effect: the prompt committed, created the exact conversation, began
  LitScout effects four minutes after launch, and completed a roughly
  40-minute assistant response.

Required semantic: failure to observe the submitted prompt is not proof that
Send failed. Once activation may have occurred, the run is
`commit_unknown/recovery_required`, automatic retry is forbidden, and
conversation/history recovery must precede any second mutation.

### Observation C | Continuation committed despite browser-close error

- AuraCall session: `plan0499-frakktal-experiment-52-continue`
- Recorded status: `error`
- Recorded error: `Chrome window closed before auracall finished. Please keep
  it open until completion.`
- Recorded conversation ID: null
- Actual effect: the exact literal `continue` committed once and the assistant
  completed in the same provider conversation.

Required semantic: browser attachment loss and window closure describe the
observer transport. They do not prove provider non-commit or model failure.
Preserve the last exact conversation/target evidence and transition to
read-only recovery.

### Observation D | Attachment staging was logically idempotent but physically repeated

- The exact local archive hash stayed frozen.
- At least three upload selections occurred across pre-Send preparation and
  launch.
- The recovered conversation contained one attachment named
  `litscout-research-coordination-1.0.0(2).zip`.
- The current handoff adapter derives a synthetic provider file ID from package
  and file hashes, while prompt submission sends the local paths again through
  `runPrompt`. This permits “uploaded” bookkeeping without proving that the
  current composer already contains the intended provider attachment.

Required semantic: separate package identity, upload-attempt identity,
provider attachment identity, and visible composer attachment state. Before
upload, inspect the composer for a matching attached-file chip and bind it to
the package/file digest when possible. If the same frozen file is already
present, reuse it; if presence or identity is ambiguous, stop before selecting
the file again.

## Recommended interaction state machine

Represent these states explicitly rather than collapsing them into one browser
success/error flag:

1. `prepared` — exact prompt hash, attachment manifest, target intent, and
   provider-visible model evidence captured; no Send attempted.
2. `activation_started` — the exact Send gesture began; an effect is possible.
3. `commit_unknown` — activation may have occurred but neither a submitted
   user turn nor a provider conversation identity is yet proved.
4. `committed` — the exact user turn is visible in a specific conversation or
   equivalent provider evidence proves acceptance.
5. `generating` — positive active-generation evidence exists, including the
   accepted Plan 0328 zero-assistant-text plus visible-Stop case.
6. `terminal` — the same committed turn has a stable assistant result and no
   active-generation evidence after a settle interval.
7. `recovery_required` — browser/CDP/tab/transport was lost after
   `activation_started`; no resend is permitted.
8. `recovered_terminal` — exact conversation/history readback proves the
   original committed turn completed.
9. `reconciled_no_effect` — bounded recovery proves the activation did not
   commit. Only this state may make a separately authorized retry eligible.

Browser transport state, provider commit state, model-generation state, and
terminal evidence should be separate receipt fields. An exception may set the
transport field to failed while provider/model fields remain unknown or later
become committed/terminal.

## Recommended module placement

Current structural evidence points to these AuraCall-owned seams:

- `src/browser/actions/promptComposer.ts`
  - retain exact composer insertion and activation mechanics;
  - change commit verification to return typed positive, negative, or unknown
    evidence rather than turning observation timeout directly into Send
    failure.
- `src/browser/actions/attachments.ts` and
  `src/browser/actions/chatgptComposerTool.ts`
  - add composer-visible attachment inventory and exact duplicate-prevention
    before file selection;
  - keep ChatGPT-specific chip/attachment heuristics here.
- `src/browser/llmService/llmService.ts`
  - orchestrate the multi-axis interaction state machine;
  - preserve the prompt/package hash and last target/conversation evidence
    through observer loss;
  - route uncertain effects to recovery without calling `runPrompt` again.
- `src/browser/providers/chatgptAdapter.ts`
  - own provider-specific conversation URL/ID recovery, current-turn matching,
    active-generation probes, stable-terminal probes, and exact history reads.
- `src/handoff/chatgptBrowserAdapter.ts`
  - do not describe synthetic hash-derived IDs as proof of provider upload;
  - preserve and return typed commit/recovery state from `runPrompt` rather
    than always summarizing the action as submitted.

Prefer one deep ChatGPT prompt-execution module whose interface accepts the
prepared prompt package and returns the typed state above. Composer action,
attachment, history, and provider adapters may remain internal seams. Avoid a
second orchestration path specifically for LitScout experiments.

## Recovery policy

- Capture the provider conversation URL/ID as soon as it appears, before
  waiting for assistant output.
- Persist prompt hash, package/attachment digests, target ID, browser port, and
  provider URL evidence incrementally so transport loss does not erase the
  last known identity.
- On `commit_unknown` or `recovery_required`, never issue another Send. Search
  exact provider history/current targets for the prompt hash or unique prompt
  fingerprint and time window, then attach read-only to exactly one candidate.
- A blank root composer proves only the state of that root tab. It does not
  prove that no new conversation or provider effect exists.
- When active generation may have lost its server connection, refresh only the
  exact recovered conversation and no more than once every 15 minutes. A
  refresh is observation renewal, not a semantic turn; it must not invoke
  Send, `continue`, `Answer now`, or tool approval.
- Preserve the managed browser process and unrelated tabs unless exact
  ownership says cleanup belongs to the current operation.
- Distinguish a closed CDP client, closed tab, closed window, lost server
  connection, and completed model turn. None is an alias for another.
- After recovery, require exact turn ordering and prompt fingerprint before
  classifying the response as belonging to the attempted Send.

## Provider-free acceptance cases

1. **Commit before observer visibility:** Send gesture succeeds; submitted user
   node appears after the current verification timeout. Expected:
   `commit_unknown`, no retry, later exact recovery to `committed`.
2. **Conversation ID appears before user node:** URL changes to `/c/<id>` while
   DOM lags. Expected: persist conversation identity immediately and continue
   bounded observation.
3. **Pre-answer active generation:** no assistant node/text, visible exact Stop
   control, no dialog. Expected: `generating`, preserving Plan 0328 behavior.
4. **Browser closes after commit:** transport closes after user turn exists.
   Expected: `recovery_required`, conversation identity retained, zero resend.
5. **Browser closes during activation:** effect ambiguous. Expected:
   `commit_unknown`, exact history recovery required, zero automatic retry.
6. **Blank root plus created conversation:** observer lands on `/`, while exact
   history contains one new matching conversation. Expected: recover that
   conversation; never classify the root as proof of zero effect.
7. **Existing frozen attachment:** matching composer chip already present.
   Expected: zero new file selection and one bound provider attachment.
8. **Ambiguous attachment chip:** same display name but identity cannot be
   proved. Expected: pre-Send stop, no second upload selection.
9. **Server connection loss:** same conversation refreshes at the 15-minute
   floor and resumes observation. Expected: zero semantic turns and preserved
   conversation identity.
10. **Stable terminal:** assistant text settles and active-generation controls
    disappear. Expected: terminal response captured from the same turn.
11. **Two identical-looking prompts:** recovery candidate set has more than one
    exact-enough match. Expected: ambiguous stop; no selection and no retry.
12. **Model selector partial proof:** model family is visible but requested
    effort/mode is absent. Expected: partial selector evidence and pre-Send
    rejection unless the caller explicitly selected a current-state policy.

Each case should assert separate transport, commit, model, conversation,
attachment, retry-eligibility, and terminal fields. The most important
negative assertion is zero duplicate Sends after any possible activation.

## Suggested installed canary boundary

After provider-free acceptance and normal AuraCall planning/authority checks,
use at most one new deterministic prompt on one exact managed browser profile.
The canary should deliberately expire the initial commit-observation window
while preserving the longer renewable generation observer, then prove exact
same-turn recovery without a resend. It should not reuse the Frakktal mission,
LitScout canonical data, or Skill CRUD.

The canary is not authorized by this note. Its plan should bind current source,
installed runtime, account, browser target, model/mode evidence, prompt hash,
attachment posture, retry ceiling zero, refresh floor 15 minutes, and exact
cleanup ownership before any Send.

## Handoff completion condition

AuraCall has consumed this handoff when one bounded AuraCall plan maps the
interaction state machine and twelve provider-free cases to current code,
preserves the already accepted Plan 0328 behavior, and defines a separately
authorized installed canary. LitScout should receive only the resulting
browser-observation contract and acceptance receipt; AuraCall implementation
and Skill CRUD remain AuraCall-owned.

