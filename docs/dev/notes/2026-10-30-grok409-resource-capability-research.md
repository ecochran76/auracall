# Grok409 resource capabilities: documentation and scope

Research date:2026-10-30. Question: which Connector/tool, Skill and knowledge
capabilities are documented per Bot, and what is actually qualified for AuraCall's
current `grok.com/bot/...` browser target?

Sources: first-party xAI documentation/news, current repo spec/source and retained
native evidence. Bound: four successful focused searches and eight official pages;
local read-only evidence review delegated once. No new browser/provider operation,
configuration write, authentication, installation or code change was performed.
Stop: each resource has a documented scope plus an explicit native-web evidence gap.

## Product boundary comes first

The [official FAQ](https://docs.x.ai/grok-bot/faq#is-grok-bot-the-same-as-the-grok-app)
distinguishes the Grok chat app from the Grok Bot application and identifies desktop/
mobile clients and Cursor authentication for the latter. The
[overview](https://docs.x.ai/grok-bot/overview) describes its persistent-computer
agent model. These names do not by themselves identify which features a particular
web route, account or client version exposes. Do not assume equivalence merely
because AuraCall's entity and the documented product both use the word Bot.

This is not evidence that the capabilities cannot exist on the web. xAI's
[news index](https://x.ai/news) separately announces Skills for web/iOS/Android
(May19,2026) and Connectors for those clients (May2026). Those announcements establish
web feature existence, not a per-Bot persistence contract or an API schema.

## Findings by resource

| Resource | Officially documented behavior | Qualification for the current web Bot |
| --- | --- | --- |
| Apps/Connectors | In the Grok Bot app, connections belong to the account and are available across its Bots. Installation and successful sign-in are distinct. | Existing Plugins/Connector work does not prove a separate saved grant on each web Bot. |
| Tool controls | Installed apps and individual tool switches are managed outside Settings. The cited settings page does not settle every switch's persistence scope. | Native identities, current selection and saved readback still need qualification. |
| Private Skills | One shared library; documented enablement for the current Bot through app management. | A concrete candidate discovery path exists, but its mapping to this web client/account has not been tested. |
| Team Bot resources | Owner/manager setup supports shared plugins, reusable instructions and reference files on the Team Bot. | Requires qualifying Bot type, team eligibility, ownership and client surface; do not assume the original synthetic web Bot is a Team Bot. |
| Personal shared files | The Grok Bot computer/workspace is shared across that user's Bots. | Workspace files or conversation attachments are not automatically isolated, saved Bot knowledge. |

Account connection/shared-computer scope comes from
[Use the computer and apps](https://docs.x.ai/grok-bot/computer-and-apps#connect-an-app).
The separate management surface and tool switches are described in
[Settings: Connected apps](https://docs.x.ai/grok-bot/settings-and-notifications#connected-apps).
Neither source supplies a saved per-web-Bot Connector grant schema.

### Exact candidate surfaces

- **Apps and private Skills:** the documented Grok Bot path is Connect apps,
  then the connected-count control beside its title. Private skill enablement
  targets the current Bot; the library itself is shared. See
  [Skills and routines](https://docs.x.ai/grok-bot/skills-routines-and-automations#save-a-skill).
- **Team resources:** conversation details → Setup exposes resource cards;
  owner/manager controls shared configuration. OAuth still uses the person
  interacting with the Bot. Reference files are managed through the file card.
  See [Team Bots](https://docs.x.ai/grok-bot/team-bots#set-up-what-the-bot-needs).
  Remembered personal-connector approvals in shared conversations are a further
  distinct permission scope on that page, not the installation record.

These are documented candidate paths, not claims that the currently observed
web UI exposes them. No Team Bot, file, app, skill or permission was created or
changed to test them. Secrets, routines and publishing remain outside409's scope.

## Why the previous Settings observation is insufficient

The official management docs place apps elsewhere. In addition,
[Create/manage Bots](https://docs.x.ai/grok-bot/bots#edit-a-bot) describes current
personal Bots without a Description/Settings editor, whereas our retained web
observation has Name, optional Title and Description. That difference requires
product/client/Bot-kind/rollout qualification; it does not establish an account
entitlement cause, and it does not justify silently switching products.

At local source d5a1293cc, [inspect](../../../src/browser/providers/grokBotLifecycle.ts#L112)
binds the exact route and name. The [resources reader](../../../src/browser/providers/grokBotLifecycle.ts#L137)
then scans labels only inside that Settings editor. Matching terminology yields
unknown, no match yields unavailable, and choices/granted are always null. It does
not enumerate the documented management surfaces. Its scope declaration is truthful;
it is not complete resource discovery. Primary retained public receipt SHA256:
`0b9ac16164dbf98b039690f2e4a405918c69326916d337ae2a4588e31914b5b9`.

The [native identity/entry report](2026-10-30-grok409-identity-and-native-entry.md)
qualifies current original-Bot access and scoped control absence. It does not
qualify provider-wide absence. The delegated local review reached that same narrow
conclusion; primary checked the source scope and retained receipt binding.

## Decision and next step

**The resource concepts are real; their scopes are different, and409's native
management discovery is unfinished.** Preserve the ticket's original acceptance
criteria; do not close it as implemented or universally unsupported. Its
[specification](https://github.com/ecochran76/auracall/issues/409) requests supported
persistent configuration and exact saved identities, not a guarantee every
resource exists on every Bot.

Next, perform read-only capability discovery on the current web client: qualify
product/client and Bot kind, identify the app/skill management surface, and inspect
actual per-Bot association and saved-readback semantics. Team setup is a separate
candidate only when team availability and ownership are observed. Implement only
a qualified contract; do not guess setters, reinterpret a global catalog as grants,
or broaden the task to another app or Team Bot creation by implication.

No live acceptance follows from public docs alone. No new broad review/findings
phase or resource-counter reset. Memory disposition:forbidden; no explicit user
memory-write request exists.
