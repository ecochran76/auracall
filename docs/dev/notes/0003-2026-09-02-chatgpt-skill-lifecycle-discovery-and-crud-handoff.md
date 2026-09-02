# ChatGPT skill lifecycle discovery and CRUD handoff

## Product need

LitScout is planning reusable ChatGPT-side research skills that teach models
how to coordinate multi-turn campaigns, choose search strategies, manage
evidence, synthesize and draft, audit citations and completion claims, and
recover long-running work. Development can proceed by bundling versioned skills
as ZIP files, attaching them through the ChatGPT composer, and explicitly
instructing ChatGPT to use the attached skills.

Mature skills should instead be installed through ChatGPT's plugins/skills
interface. AuraCall may need new discovery and lifecycle capabilities so those
installations are repeatable, account-bound, versioned, inspectable, and
reversible rather than manual UI folklore.

The LitScout design authority is
`docs/dev/notes/0125-2026-09-02-experiment-51-research-coordination-boundary.md`
in the sibling `litscout` repository. Parent Plan 0493 sequences LitScout
machinery, ChatGPT skills, operator prompting, and joined evaluation.

## Current AuraCall foundation

AuraCall already has useful adjacent seams:

- workbench capability discovery represents ChatGPT `skills` as an
  account-gated, observed, tool-drawer capability;
- feature-signature discovery can report observed skill labels;
- ChatGPT developer-app lifecycle code provides guarded list, create, test,
  refresh/replacement, and uninstall patterns with expected-account binding;
- browser attachments and deterministic ZIP packaging already support the
  development delivery path;
- conversation context/artifact extraction can preserve returned ZIP artifacts;
- the browser-service dispatcher, selector manifests, mutation audit, and
  human-gate handling provide reusable control-plane primitives.

Current capability discovery does not prove skill invocation, installation,
identity, version, configuration, or CRUD readiness. Existing documentation
also classifies Deep Research/app/skill invocation as future per-capability
work. Do not promote a visible `Skills` label into a lifecycle claim.

## Discovery-first objective

Before implementing mutations, inspect the current authenticated ChatGPT
plugins/skills interface and its underlying network/state contracts. Establish:

- account and plan availability;
- entry routes and navigation surfaces;
- installed-skill inventory and stable identity fields;
- skill name, description, instructions, files, manifest, icon, permissions,
  version, status, and ownership representations actually exposed;
- create/install-from-ZIP behavior;
- read/detail and version/readback behavior;
- edit/update or replacement semantics;
- enable/disable, uninstall, and permanent-delete distinctions;
- confirmation, OAuth, MFA, CAPTCHA, safety review, and other human gates;
- composer invocation/selection evidence;
- whether network endpoints offer a more stable readback than DOM labels.

Use static/read-only capability reporting first. Keep raw payloads bounded and
private, and record only the minimum fixtures needed for provider-free tests.

## Candidate AuraCall lifecycle contract

The smallest useful managed surface is:

1. `skills list` — read-only exact-account inventory with stable IDs and
   installed/enabled/version state;
2. `skills show` — bounded metadata, manifest/file inventory, hashes, and
   invocation availability;
3. `skills install` or `skills create` — exact ZIP/manifest hash, expected
   account, explicit confirmation, and postcondition readback;
4. `skills update` — optimistic concurrency against the observed installed
   identity/version/hash; use explicit replacement semantics if ChatGPT has no
   in-place update;
5. `skills disable/enable` when the provider distinguishes activation from
   installation;
6. `skills uninstall` and, only if distinct and justified, `skills delete` —
   exact identity, confirmation, absence proof, and no name-only targeting;
7. `skills invoke` or composer selection proof only after discovery establishes
   a stable surface; invocation is separate from CRUD.

Every mutation should return the exact before/after skill identity, version or
content hash, account binding, observed UI/network postcondition, and a typed
human-gate or partial-replacement recovery state. Never retry an uncertain
mutation by name.

## Development ZIP bridge

Skill CRUD is not a prerequisite for LitScout skill development. AuraCall's
existing composer attachment path should support one deterministic ZIP bundle
plus an explicit primer such as:

> Use the attached LitScout skill bundle for this task. Inspect its manifest,
> load the applicable shared skills and workflow overlay, preserve the stated
> version in your completion report, and do not treat the skill as authority
> for external effects.

The attachment path should record bundle filename, SHA-256, size, manifest
identity/version, exact conversation/turn identity, uploaded file-tile proof,
and the prompt instruction that activates it. This supports controlled skill
iteration before managed installation exists.

## Safety and ownership boundaries

- Bind every discovery or mutation to the exact AuraCall runtime profile,
  managed browser profile, ChatGPT account, and skill identity.
- Treat skill instructions and files as sensitive user content.
- Require explicit confirmation for install, update/replacement, uninstall, or
  delete. Human verification remains a hard stop.
- A skill never grants authority to send external communications, widen a
  research budget, mutate LitScout state, or take another consequential action.
- Keep developer-app CRUD and skill CRUD separate even if they reuse browser
  primitives; their identities, provider semantics, and failure recovery are
  different.
- Preserve a rollback artifact before replacement when the provider exposes
  sufficient source bytes; otherwise report rollback as unavailable.
- Do not infer successful installation or activation from a skill label alone.

## Provider-free acceptance cases

1. Inventory distinguishes absent, installed-disabled, installed-enabled,
   account-gated, and unknown state without mutating ChatGPT.
2. Exact IDs disambiguate duplicate skill names.
3. Install/create binds the submitted ZIP/manifest hash to postcondition
   readback.
4. Update rejects stale expected identity/version and records recoverable
   replacement-pending state when deletion succeeds but recreation fails.
5. Uninstall/delete never targets by ambiguous name and proves exact absence.
6. ZIP composer delivery proves one intended attachment and one intended Send,
   with no duplicate upload or prompt concatenation.
7. Invocation proof distinguishes installed availability from actual selection
   and use in the submitted turn.

## Scope boundary

This is a discovery and implementation handoff, not mutation authority. It
authorizes no ChatGPT navigation, skill creation, installation, update,
invocation, removal, browser launch, prompt Send, runtime installation, or
service restart. Open a bounded AuraCall plan with read-only discovery first;
gate each live mutation class separately after provider-free fixtures exist.
