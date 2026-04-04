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
- do not take Slice 4 by momentum alone
- first decide whether the next value is:
  - a native Gemini upload-ui proof if that distinction matters
  - or a real implementation gap with a concrete operator or runtime failure

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
