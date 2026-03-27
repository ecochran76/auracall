# Aura-Call Browser Onboarding Backlog

Purpose: track browser automation features that are specific to Aura-Call’s
chatbot-in-browser product shape, not generic browser-service infrastructure.

These items build on browser-service. They should stay in Aura-Call because they
encode provider semantics, managed-profile policy, and LLM CRUD expectations.

## Order of work

1. Service auth contracts
2. Doctor/setup auth + account verification
3. Managed-profile reseed and drift reporting
4. Provider-specific evidence capture
5. CRUD-capable verification

## 1. Service auth contracts

Status: partially landed

Why:
- “Prompt works” is not the same as “signed in”.
- Each provider needs explicit negative and positive auth signals.

Files:
- `configs/oracle.services.json`
- `src/browser/providers/*.ts`
- `src/services/registry.ts`

Acceptance:
- ChatGPT, Grok, and Gemini define auth markers, identity extractors, and
  hydration rules in one service-owned place.
- Aura-Call auth checks stop relying on prompt success.

## 2. Doctor/setup auth + account verification

Status: partially landed

Why:
- First-time setup needs to prove whose account owns the managed profile.

Files:
- `bin/auracall.ts`
- `src/browser/profileDoctor.ts`
- `src/cli/browserSetup.ts`

Acceptance:
- `auracall doctor` and `auracall setup` print managed profile path, source
  profile path, account identity, and the signal used to prove it.
- Failures distinguish guest, signed-in, and unknown states.

Progress:
- `auracall doctor` now has a versioned JSON surface:
  - `contract: "auracall.browser-doctor"`
  - `version: 1`
- The doctor JSON embeds the stable browser-service contract
  `browser-tools.doctor-report` when a managed browser instance is alive, so
  host-app automation can consume browser-service facts without scraping
  Aura-Call's human-readable output.
- `auracall setup` now has a versioned JSON surface:
  - `contract: "auracall.browser-setup"`
  - `version: 1`
- The setup JSON embeds the before/after `auracall.browser-doctor` contracts
  and records explicit login/verification step status, model, prompt, and
  verification session id.

## 3. Managed-profile reseed and drift reporting

Status: partially landed

Why:
- First-time launch should bootstrap from existing Chrome state, and later runs
  should explain when the managed profile is stale.

Files:
- `src/browser/profileStore.ts`
- `src/browser/profileDoctor.ts`
- `bin/auracall.ts`

Acceptance:
- Aura-Call can compare source and managed profile freshness.
- Reseed is explicit, safe, and visible in doctor/setup output.

## 4. Provider-specific evidence capture

Status: next

Why:
- Raw DOM snapshots are expensive to interpret and often overkill.

Files:
- `src/browser/providers/*.ts`
- `src/browser/profileDoctor.ts`
- `src/browser/actions/*.ts`

Acceptance:
- Failure reports capture compact provider facts: auth CTAs, selected model,
  composer readiness, visible conversation state, and detected identity.

## 5. CRUD-capable verification

Status: planned

Why:
- Some providers allow guest prompting but not history/project/file operations.

Files:
- `src/cli/browserSetup.ts`
- `src/browser/providers/grokAdapter.ts`
- `src/browser/providers/chatgptAdapter.ts`
- `tests/browser/*`

Acceptance:
- Setup can optionally verify more than “ping”.
- Aura-Call distinguishes guest chat capability from authenticated CRUD-ready
  capability.
