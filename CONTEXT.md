# Aura-Call

Aura-Call coordinates model requests through configured provider accounts and browser runtimes while preserving explicit identity, execution, and artifact ownership.

## Language

**AuraCall runtime profile**:
A named Aura-Call configuration entry that selects execution defaults and provider bindings for one operator context.
_Avoid_: Profile, runtime config

**Browser profile**:
A browser-runtime and account-family configuration referenced by an AuraCall runtime profile.
_Avoid_: Profile, Chrome profile

**Source browser profile**:
A native Chromium profile used only as the source for bootstrap state such as cookies.
_Avoid_: Browser profile, managed profile

**Managed browser profile**:
An Aura-Call-owned browser state directory used for automation.
_Avoid_: Source profile, user profile

**Provider binding**:
The provider-specific account, target, model, and workflow defaults selected for an AuraCall runtime profile.
_Avoid_: Service binding, provider config

**Browser launch plan**:
The fully resolved, immutable description of one browser launch, including its browser profile, managed browser profile, provider binding, and launch policy.
_Avoid_: Browser config, launch profile

**Provider prompt**:
One requested model interaction routed through a provider binding, including its target, attachments, completion posture, and progress evidence.
_Avoid_: Browser prompt, request

**Materialization attempt**:
One bounded effort to turn a selected provider asset into a verified local artifact and durable receipt.
_Avoid_: Download attempt, materialization run

**Acceptance run**:
A bounded provider-specific verification workflow that produces operator-readable evidence about an Aura-Call behavior.
_Avoid_: Smoke, acceptance script
