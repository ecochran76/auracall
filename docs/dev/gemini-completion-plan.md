# Gemini Completion Plan

## Purpose

Define a bounded Gemini side track that can move forward without displacing the
main service/runtime foundation work.

This plan assumes:

- Gemini already has meaningful inherited support from Oracle
- Gemini should be the first provider-expansion side track
- Gemini should not become the new primary architecture track

## Current state

Gemini already exists in two real surfaces:

1. Gemini API mode
2. Gemini web mode via signed-in browser cookies

Current evidence in-repo:

- docs:
  - [docs/gemini.md](/home/ecochran76/workspace.local/oracle/docs/gemini.md)
- API adapter:
  - [src/oracle/gemini.ts](/home/ecochran76/workspace.local/oracle/src/oracle/gemini.ts)
- web executor:
  - [src/gemini-web/executor.ts](/home/ecochran76/workspace.local/oracle/src/gemini-web/executor.ts)
- web client:
  - [src/gemini-web/client.ts](/home/ecochran76/workspace.local/oracle/src/gemini-web/client.ts)
- tests:
  - [tests/gemini.test.ts](/home/ecochran76/workspace.local/oracle/tests/gemini.test.ts)
  - [tests/gemini-web/executor.test.ts](/home/ecochran76/workspace.local/oracle/tests/gemini-web/executor.test.ts)
  - [tests/live/gemini-live.test.ts](/home/ecochran76/workspace.local/oracle/tests/live/gemini-live.test.ts)
  - [tests/live/gemini-web-live.test.ts](/home/ecochran76/workspace.local/oracle/tests/live/gemini-web-live.test.ts)

That means Gemini is not a greenfield implementation. The real question is how
to finish and align it.

## Working assessment

### What is already strong

- API adapter exists and is tested
- browser/web path exists and is tested
- login/profile/doctor/config surfaces already know about `gemini`
- Gemini browser mode already supports:
  - text
  - attachments
  - YouTube input
  - generate-image
  - edit-image

### What looks incomplete or structurally awkward

The Gemini web path is still more self-contained than the newer browser
service/provider architecture.

Current likely mismatch:

- Gemini web execution lives mostly under `src/gemini-web/*`
- ChatGPT/Grok browser evolution has moved more behavior into shared
  browser/config/runtime seams
- Gemini may therefore be "functional" without yet being fully aligned with:
  - browser profile ownership
  - managed browser profile semantics
  - session/provenance surfaces
  - provider-service architecture consistency

### What not to do

- do not rewrite Gemini into the latest browser architecture in one pass
- do not broaden the main service/runtime foundation into provider work
- do not let Gemini completion become a generic "clean up everything inherited
  from Oracle" effort

## Completion goals

Gemini completion should mean:

1. operator semantics are clear
2. API and web/browser capabilities are explicitly documented
3. runtime/config/profile behavior is consistent with the current Aura-Call
   architecture
4. the known supported Gemini surfaces are live-proven enough to trust
5. remaining out-of-scope gaps are documented instead of silently implied

Operational parity with ChatGPT/Grok should now be interpreted more narrowly
and more usefully:

- the same operator can reach equivalent browser CRUD/cache workflows from the
  CLI without provider-specific command surprises
- provider/account-scoped cache tooling works for Gemini anywhere Gemini now
  writes real cache state
- command help, target enums, service wrappers, and docs all agree on what
  Gemini supports today
- missing Gemini surfaces are explicit provider gaps, not stale CLI exclusions
  or undocumented target gating

That means "Gemini parity" is no longer primarily a browser-automation question.
The remaining work is mostly operational consistency and coverage around the now
real Gemini browser provider.

## Audited parity gaps (2026-04-05)

The current Gemini browser provider is materially stronger than when this plan
started:

- root prompt execution is green
- Gem CRUD is green:
  - create
  - rename
  - delete
- Gem knowledge file CRUD is green:
  - add
  - list
  - remove
- root conversation rename is green
- root conversation delete is green
- browser doctor identity and cache identity are green

The next gaps are now narrower and more operational:

1. Cache model centralization is incomplete.
   - Gemini cache parity work proved that provider-cache policy is still split
     across:
     - `LlmService`
     - cache helper modules
     - `bin/auracall.ts`
   - the CLI still reconstructs cache search context, provider URL ownership,
     identity assertion, and maintenance discovery in multiple places.
   - as long as cache policy is partially CLI-owned, provider parity will keep
     drifting command by command.

2. Some CLI target gates still lag provider reality.
   - We already fixed one live example:
     - top-level `auracall delete <id> --target gemini`
   - remaining `chatgpt|grok` gates need review so Gemini exclusions reflect
     actual provider capability rather than stale wiring.

3. Gemini CLI regression coverage is too thin.
   - current Gemini tests are mostly adapter/helper tests
   - there is not yet enough CLI coverage to stop target-enum regressions from
     silently reappearing

4. Immediate post-delete cache/list behavior still needs hardening.
   - live proof showed that Gemini conversation delete can succeed while the
     first non-refresh conversation list briefly returns an empty cache result
   - refreshed readback is currently the authoritative proof

5. Explicit provider gaps still remain and should stay visible.
   - conversation artifacts parity
   - account-level files parity
   - clone parity

These should be treated as productized backlog items, not hidden under generic
"Gemini support" wording.

## Scope split

### Shared/runtime-owned

These belong to shared Aura-Call architecture, not Gemini-specific logic:

- browser profile selection
- AuraCall runtime profile selection
- session metadata/provenance
- config/schema integration
- login/profile doctor integration
- future service/runtime orchestration

### Gemini-owned

These stay Gemini-specific unless a second provider needs the same behavior:

- Gemini API request/response mapping
- Gemini web request format and access-token fetch
- Gemini-specific model fallback rules
- Gemini upload/download/image handling
- Gemini-specific URL / Gem targeting semantics

## Recommended slice order

### Slice 1: Audit and define supported Gemini feature matrix

Goal:
- make explicit what Gemini supports today across:
  - API
  - web/browser

Deliverables:
- one matrix covering:
  - text
  - attachments
  - YouTube
  - generate image
  - edit image
  - search/tooling
  - session metadata expectations
- one list of unsupported or deliberately deferred areas

Acceptance:
- docs aligned
- no code required

Status:
- completed enough on 2026-04-03 via:
  - [docs/gemini.md](/home/ecochran76/workspace.local/oracle/docs/gemini.md)
  - [docs/testing.md](/home/ecochran76/workspace.local/oracle/docs/testing.md)

Outcome:
- the supported Gemini matrix is now explicit
- the next Gemini slice should be operator/runtime alignment, not another
  abstract support audit

### Slice 2: Align Gemini operator/runtime semantics with current Aura-Call terms

Goal:
- make sure Gemini uses the same browser profile / AuraCall runtime profile /
  managed browser profile vocabulary and reporting surfaces as the newer
  browser paths

Potential focus areas:
- `login`
- `doctor`
- session metadata
- status/session display
- config examples

Acceptance:
- focused CLI/config/session tests
- no broad Gemini-web rewrite

Status:
- completed enough on 2026-04-03 via:
  - explicit local-only Gemini doctor semantics
  - runtime-profile-first Gemini targeting docs
  - WSL runbook alignment with current `auracall` commands and target-shape
    config examples

Outcome:
- no additional concrete Gemini-specific operator/runtime drift remains obvious
  in:
  - login
  - doctor
  - session/status metadata
  - current config examples
- the next Gemini slice should now be live-proof refresh, not more alignment
  cleanup

### Slice 3: Validate Gemini web/browser proof status

Goal:
- re-establish a durable live-proof baseline for the Gemini web path

Preferred proof surfaces:
- text
- attachment
- generate-image
- edit-image
- YouTube

Acceptance:
- update `docs/testing.md`
- record known green surfaces and known fragile/deferred surfaces

Preferred execution order:
1. text
2. attachment
3. YouTube
4. generate-image
5. edit-image

Operator rule:
- run Gemini live-proof refresh against one explicit AuraCall runtime profile /
  browser profile pairing at a time
- if a failure appears, record whether it is:
  - a proof gap
  - a provider capability gap
  - or a shared browser/runtime regression

Current proof progress:
- 2026-04-03:
  - `default -> default`
  - text: green
  - attachment: green
  - YouTube: green
  - generate-image: not green on this pairing
    - classify as a provider/account capability result first, not a shared
      browser/runtime regression
  - edit-image: not green on this pairing
    - classify as a provider/account capability result first, not a shared
      browser/runtime regression
- 2026-04-04:
  - `wsl-chrome-2 -> gemini`
  - native text-file upload: green
  - native image upload: still not green
    - latest fresh rerun now commits and returns a real answer instead of
      stalling at the old composer-pending boundary
    - but the answer is still attachment-blind:
      - `Please upload the image you're referring to, and I'll describe it for you in a single sentence.`
    - active gap:
    - preserve staged image context through submit so Gemini actually consumes
      it as model input

### Slice 4: Reach Gemini CLI/operator parity for already-supported browser surfaces

Goal:
- remove stale CLI exclusions for Gemini where the provider already has a real
  implementation and live proof

Primary focus:
- target enums and help text
- cache CLI parity for Gemini cache data
- command/documentation consistency

Must-cover surfaces:
- `projects --target gemini`
- `projects remove --target gemini`
- `projects files add|list|remove --target gemini`
- `conversations --target gemini`
- `delete --target gemini`
- `cache ... --provider gemini` wherever Gemini cache is already real

Acceptance:
- no stale `chatgpt|grok` exclusions remain for Gemini-supported surfaces
- docs and help text match actual behavior
- focused CLI tests cover Gemini target acceptance on the newly supported
  command set

Status:
- mostly complete
- already completed within this slice:
  - direct-page Gem delete
  - direct-page conversation delete
  - top-level `delete --target gemini`
  - Gem knowledge `projects files add|list|remove --target gemini`
  - Gemini cache provider acceptance across the main `cache ...` command family
  - focused Gemini CLI cache parity coverage

Current boundary:
- the broad target-gate/cache-acceptance gap is no longer the main blocker
- the remaining CLI parity work should now be treated as explicit provider
  backlog, not as “Gemini still lacks basic operator parity”

### Slice 5: Harden Gemini cache freshness semantics

Goal:
- make Gemini cache behavior trustworthy enough that operators do not need to
  remember special-case refresh rules after destructive actions

Primary focus:
- post-delete conversation cache refresh
- stale-empty cache prevention
- refreshed-vs-cached read semantics in CLI output

Acceptance:
- Gemini delete flows do not leave the first ordinary list read in a misleading
  empty state
- cache behavior is documented where fresh reads are still required

Status:
- materially addressed
- remaining problem:
  - cache freshness improvements landed, but deeper cache model
    centralization still belongs to shared subsystem work, not Gemini-only
    follow-up

### Slice 5.5: Centralize provider-cache policy behind shared seams

Goal:
- move provider-cache policy out of ad hoc CLI code and into one shared cache
  context / maintenance model

Primary focus:
- one shared cache operator context resolver:
  - provider validation
  - configured URL ownership
  - cache identity resolution mode
  - deterministic operator-mode cache context
- one shared cache maintenance discovery path instead of hand-built
  provider/identity scans in `bin/auracall.ts`
- stop manually assembling cache context objects where `LlmService` or a shared
  cache helper should own the shape

Acceptance:
- cache inspection/search/export/maintenance commands use the same shared cache
  context resolution path
- CLI no longer duplicates provider-cache URL logic or cache identity policy in
  multiple command families
- future provider cache parity requires fewer command-local edits

Status:
- partially addressed
- already completed within this slice:
  - shared cache operator context resolver
  - shared cache maintenance discovery seam
  - reduced manual cache-context assembly in CLI helpers
- remaining work:
  - move more maintenance internals out of `bin/auracall.ts`
  - land artifact-first cache model improvements from:
    - [cache-artifact-projection-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/cache-artifact-projection-plan.md)

### Slice 6: Close explicit provider-surface gaps toward ChatGPT/Grok parity

Goal:
- work through the remaining Gemini gaps as explicit provider backlog, in a
  clear order

Recommended order:
1. conversation artifacts parity
2. account-level files parity
4. clone parity if Gemini exposes a real native surface

Acceptance:
- each surface should land with:
  - CLI target exposure
  - focused tests
  - live proof or explicit deferred note

Status:
- not started

### Closeout assessment for Gemini CLI parity for now

Gemini CLI parity can be treated as closed for now when all of the following
are true:

1. already-supported Gemini browser/provider surfaces have no stale target
   exclusions in the CLI
2. `cache ... --provider gemini` works across the main operator/read paths
3. focused Gemini CLI regression coverage exists for those widened paths
4. remaining gaps are tracked explicitly as provider backlog, not hidden behind
   stale CLI gates

Current assessment:
- this bar is effectively met
- the remaining work should be tracked under two different buckets:
  - shared cache architecture work:
    - [cache-artifact-projection-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/cache-artifact-projection-plan.md)
  - Gemini provider backlog:
    - conversation artifacts parity
    - account-level files parity

Practical implication:
- stop treating Gemini as blocked on generic CLI/operator parity
- keep Gemini in maintenance mode for already-green surfaces
- spend the next effort either on shared cache architecture or on one explicit
  provider gap at a time

### Current architectural audit

What is shared enough already:
- Gemini browser runs still use shared browser-service launch/session seams
- Gemini native browser runs now also use shared target ownership through:
  - `openOrReuseChromeTarget(...)`

What is still off compared with ChatGPT/Grok:
- Gemini native attachment execution is still on a bespoke path:
  - `src/gemini-web/executor.ts`
  - `src/gemini-web/browserNative.ts`
- ChatGPT/Grok attachment and browser-provider behavior instead live behind the
  browser `LlmService` provider model plus the existing browser action helpers

Current working conclusion:
- the Gemini image bug should no longer be treated as “just one more selector”
- the likely drift source is that Gemini native attachment staging/commit is
  not yet following the same mature attachment workflow model used by
  ChatGPT/Grok

### Next slice

Goal:
- audit and begin converging Gemini native attachment workflow onto the same
  phase model already proven in ChatGPT/Grok

Deferred follow-on TODO:
- make Gemini browser flows captcha-aware without promoting that work ahead of
  the current architecture/refactor line:
  - detect `google.com/sorry` and visible reCAPTCHA/human-verification
    surfaces explicitly
  - fail with a provider/operator-meaningful blocked-state error instead of a
    generic route-settle failure
  - support one bounded real-pointer assist for simple checkbox challenges
    when safe
  - otherwise leave the managed browser profile open and require manual solve
    plus resume

## Next deliberate Gemini track

The native attachment/browser workflow line is now in a better checkpoint.

The next Gemini feature-expansion track should be:

- Gemini conversation CRUD
- Gemini Gem-as-project CRUD
- Gemini cache integration

That work is planned separately in:

- [gemini-conversation-gem-cache-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/gemini-conversation-gem-cache-plan.md)

Guardrail:

- start with DOM recon only
- do not begin CRUD implementation until the authoritative Gem and
  conversation surfaces are named concretely

Focus areas:
- attachment staged/ready detection
- submit commit detection
- post-submit state transition
- attachment preservation into model-visible input

Execution rule:
- prefer reusing existing browser action helpers and browser-service workflow
  patterns before adding more Gemini-local heuristics
- keep only truly Gemini-specific selectors/page copy local
  - required exported-cookie fallback on this Linux host because direct
    keyring-backed Chrome cookie reads returned zero Gemini auth cookies
  - current preferred fallback path is the runtime-profile-scoped export:
    - `~/.auracall/browser-profiles/default/gemini/cookies.json`

Status:
- completed enough for one explicit pairing on 2026-04-04

Outcome:
- one full explicit Gemini web proof pass now exists for:
  - AuraCall runtime profile `default`
  - browser profile `default`
- current proof picture for that pairing is:
  - text: green
  - attachment: green
  - YouTube: green
  - generate-image: not green
  - edit-image: not green
- the non-green image cells are currently classified as provider/account
  capability results on this pairing, not shared browser/runtime regressions
- the next Gemini move should be chosen deliberately:
  - either prove a second explicit pairing/account
  - or take one bounded implementation gap exposed by a concrete failure
  - not more blind probing on the same `default -> default` account
- local second-pairing audit on 2026-04-04 found:
  - `wsl-chrome-2 -> gemini`: managed browser profile not initialized
  - `windows-chrome-test -> gemini`: managed browser profile not initialized
  - so there is not yet a second Gemini-ready pairing to prove without first
    doing explicit setup/login work
- follow-up on 2026-04-04:
  - `wsl-chrome-2 -> gemini` has now been seeded with a managed profile
  - login/export is now green on that pairing:
    - Gemini can click one visible `Sign in` CTA and complete cookie export
      when that is sufficient for the Google handoff
  - browser text proof is now also green:
    - a narrow Gemini text run on `wsl-chrome-2` returned the expected exact
      text output
  - browser file-input proof is also green on Aura-Call's current inline file
    bundling path:
    - the second-pairing file run returned the exact file contents
    - verbose output confirmed this path used inline file pasting, not native
      Gemini upload UI
  - native Gemini upload transport is not yet green on `wsl-chrome-2`:
    - forcing `--browser-attachments always` used the attachment path
    - but the uploaded text-file run returned `[NO CONTENT FOUND]`
    - and the uploaded image run stayed non-green even after:
      - adding upload MIME types
      - including filename/MIME metadata in the Gemini `f.req` attachment tuple
    - latest image proof now fails explicitly with:
      - `Gemini accepted the attachment request but returned control frames only and never materialized a response body.`
    - repeating the same request still returned control-only responses, so a
      naive retry is not the next fix
  - so `wsl-chrome-2` is now a real second text-green Gemini browser proof
    pairing, with file-input proof through the current Aura-Call bundling path

### Slice 4: Tighten the highest-value Gemini implementation gap

Goal:
- choose one real implementation gap exposed by the audit or live proof

Examples:
- session/provenance/reporting mismatch
- runtime/profile mismatch
- unsupported but expected feature gap
- brittle web fallback or output capture behavior

Acceptance:
- one bounded code slice
- focused tests
- one targeted live proof if behavior changed materially

Current recommendation:
- treat the raw Gemini upload protocol work as background investigation, not as
  the primary path for ordinary browser attachments
- standard Gemini browser upload-mode runs now use the live page directly
- next value should come from:
  - fresh proof on another native upload class like image, or
  - a concrete Gemini browser failure after the browser-driven pivot
- current concrete gap after the pivot:
  - first native image-upload re-proof on `wsl-chrome-2 -> gemini` did not go
    green
  - after moving the path closer to ChatGPT/Grok browser semantics:
    - exact owned target
    - competing Gemini tab trimming
    - `Enter`-first submit
    - explicit Gemini failure-copy detection
    the native image path is still not green
  - the current highest boundary is now owned-page readiness itself:
    - prompt textarea readiness can detach on the fresh owned page
    - upload-menu materialization can still fail on that owned page
  - once those are hardened enough to proceed, the latest explicit live failure
    is:
    - `Gemini prompt remained in the composer after the attachment vanished and no response materialized.`
  - a later rerun briefly fell back to a generic answer timeout because Gemini
    submit was still accepting non-authoritative "committed" hints; that has
    since been tightened so the same image path now exits with the explicit
    composer/pending failure again
  - the newest kept-browser inspection changed the highest honest boundary:
    - `--browser-keep-browser` now preserves the failed Gemini page for direct
      inspection
    - preserved failure pages show the image actually stages:
      - visible `blob:` image
      - visible `Remove file ...` affordance
      - empty prompt box
    - that means the current failing phase is still image-preview readiness
      timing/detection, not submit or answer extraction
    - current live failure:
      - `Waiting failed: 45000ms exceeded`
- the raw upload investigation note remains useful context:
  - [gemini-native-upload-investigation.md](/home/ecochran76/workspace.local/oracle/docs/dev/gemini-native-upload-investigation.md)
  - but it should not pull the next slice back into raw-protocol parity work by
    default

## Provisional feature matrix

Based on the current repo state:

### Gemini API

- text: supported
- streaming: supported
- search/tooling: partially supported via `web_search_preview -> googleSearch`
- attachments/files: not clearly first-class in the current API adapter
- image generation/editing: not clearly first-class in the current API adapter

### Gemini web

- text: supported
- attachments: supported
- YouTube: supported
- generate-image: supported
- edit-image: supported
- Gem URL targeting: supported
- cookie/login flow: supported

## Main risk

The biggest Gemini risk is probably not missing raw capability. It is
architectural drift:

- Gemini works
- but parts of it may still bypass the newer shared browser/runtime seams

That makes the best next Gemini slice an alignment-and-proof plan, not an
ambitious feature rewrite.

## Recommendation

Treat Gemini as:

- the first provider-expansion side track
- a bounded audit + alignment effort first
- not the new primary platform track

Best next implementation after this doc:

1. land the feature/proof matrix in user/dev docs
2. choose one Gemini operator/runtime alignment slice
3. only then take a targeted Gemini code fix if the audit proves a concrete
   gap
