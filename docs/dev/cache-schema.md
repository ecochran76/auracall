# Cache Schema (Phase 7)

This document defines the on-disk cache layout and index structure for LLM services.

## Root Layout

All cache data is keyed by provider + identity.

```
~/.oracle/cache/providers/<provider>/<identityKey>/
  cache-index.json
  projects.json
  conversations.json
  contexts/
    <conversationId>.json
  conversation-files/
    <conversationId>.json
  project-files/
    <projectId>.json
  project-instructions/
    <projectId>.md
```

Notes:
- `identityKey` is derived from service identity (email/handle/name) or configured override.
- `project-files/` and `project-instructions/` are reserved for Phase 7 project knowledge CRUD.
- `contexts/` stores full conversation transcripts.

## Index File

`cache-index.json` is a lightweight manifest to accelerate listing and exports.

```json
{
  "version": 1,
  "updatedAt": "2026-01-14T02:00:00.000Z",
  "entries": [
    {
      "kind": "projects",
      "path": "projects.json",
      "updatedAt": "2026-01-14T02:00:00.000Z",
      "sourceUrl": "https://grok.com/"
    },
    {
      "kind": "context",
      "path": "contexts/abc.json",
      "updatedAt": "2026-01-14T02:02:00.000Z",
      "conversationId": "abc"
    }
  ]
}
```

## Cache Entry Formats

All cache files are stored as `ProviderCache<T>`:

```json
{
  "fetchedAt": "2026-01-14T02:00:00.000Z",
  "items": [],
  "sourceUrl": "https://grok.com/",
  "userIdentity": { "email": "user@example.com", "source": "config" },
  "identityKey": "user@example.com"
}
```

- `projects.json`: `Project[]` wrapped in cache metadata.
- `conversations.json`: `Conversation[]` wrapped in cache metadata.
- `contexts/<id>.json`: `ConversationContext` wrapped in cache metadata.
- `conversation-files/<id>.json`: `FileRef[]` wrapped in cache metadata.

## Export Targets

Export tooling should use the index file to enumerate content and emit:
- `json`: raw structures
- `md`: transcript rendering
- `html`: rendered transcript view
- `csv`: metadata listings
- `zip`: bundle with attachments
