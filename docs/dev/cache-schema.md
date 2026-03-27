# Cache Schema (Phase 7)

This document defines the on-disk cache layout and index structure for LLM services.

## Root Layout

All cache data is keyed by provider + identity.

```
~/.auracall/cache/providers/<provider>/<identityKey>/
  cache-index.json
  projects.json
  conversations.json
  contexts/
    <conversationId>.json
  conversation-files/
    <conversationId>.json
  project-instructions/
    <projectId>.md
    <projectId>.json
  project-knowledge/
    <projectId>/
      manifest.json
      files/
        <fileId>/<originalName>
  conversation-attachments/
    <conversationId>/
      manifest.json
      files/
        <fileId>/<originalName>
  exports/
    conversations/
      <conversationId>/
        transcript.md
        transcript.html
        metadata.csv
```

Notes:
- `identityKey` is derived from service identity (email/handle/name) or configured override.
- `project-instructions/<projectId>.md` is the canonical sync target for instructions.
- `project-instructions/<projectId>.json` stores cache metadata for the instruction file.
- `project-knowledge/` and `conversation-attachments/` store manifests + binary files.
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

JSON cache files are stored as `ProviderCache<T>`:

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
- `project-instructions/<projectId>.json`: `{ content: string, format: "md" }` wrapped in cache metadata.
- `project-knowledge/<projectId>/manifest.json`: `FileRef[]` wrapped in cache metadata.
- `conversation-attachments/<conversationId>/manifest.json`: `FileRef[]` wrapped in cache metadata.

Binary files (knowledge/attachments) are stored under `files/` using the file ID as the directory name; the original filename is preserved as the leaf.

## Export Targets

Export tooling should use the index file to enumerate content and emit:
- `json`: raw structures
- `md`: transcript rendering
- `html`: rendered transcript view
- `csv`: metadata listings
- `zip`: bundle with attachments
