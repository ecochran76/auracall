# Issue 409 native Bot resource boundary

Issue: https://github.com/ecochran76/auracall/issues/409

Source base: `4a3d63d1845e97b8f5d954b6b555919141cf93ad`.
Branch: `feat/grok409-spec-20261028`.

A bounded read on 2026-10-28 UTC qualified the existing owned synthetic Bot
through the configured Grok account, exact retained target and provider traffic
governor. The same historical account reference was verified before and after.
The current browser process, managed browser directory and CDP endpoint were
checked before execution. No installed-runtime acceptance is implied.

The active Plugins dialog first required focus on its exact owned dialog root,
verified through active-element containment, before one trusted Escape dismissed
it. Focusing the page alone had left the underlying composer focused and did not
close that dialog. Dismissal was observed before opening the already observed
exact-name Bot header through the existing lifecycle client.

The exact Bot Settings dialog exposed Name, Title (optional), Description, Save,
Close and Edit bot avatar. It exposed no Connector/tool-permission, Skill or
knowledge-source controls. The existing public resource observation returned:

```json
{
  "status": "unavailable",
  "code": "grok_bot_resource_controls_unavailable",
  "effectState": "none",
  "resources": {
    "scope": "exact-bot-settings",
    "connectors": { "status": "unavailable", "choices": null, "granted": null },
    "skills": { "status": "unavailable", "choices": null, "granted": null },
    "knowledge": { "status": "unavailable", "choices": null, "granted": null }
  }
}
```

This is absence evidence for that qualified Settings surface, not a claim that
Grok universally lacks these capabilities or that an account entitlement caused
the absence. Global Plugins catalogs do not prove grants to this Bot. Persistent
choice identities, saved grants and independent saved readback remain unmet;
issue 409 stays open. No Save, grant, prompt, creation, deletion or appearance
mutation occurred. The existing Settings dialog was retained.

Private raw evidence (outside Git, mode 0600):
`~/.auracall/private/grok/implementation-native/20261028-409-focused-settings-read.json`.
Earlier failed dismissal observations remain separate historical evidence.

Validation: `pnpm vitest run tests/browser/grok409BotResources.test.ts --maxWorkers=1`
passed 3/3 tests. The existing tests cover exact settings scope, unknown controls,
wrong Bot identity and CLI/HTTP/MCP parity. No source behavior changed and no new
RED/GREEN claim is made. Admissions settled and transport cleanup completed.

Tracker dependency readback: 403, 404 and 408 are CLOSED. Their closure removes
the recorded dependency block; it does not supply the missing provider controls.
Root owns consolidated journal, plan and integration updates.
