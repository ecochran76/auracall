# Cache Schema (Phase 7)

Architecture reference:
- [0007-2026-04-08-cache-architecture-plan.md](/home/ecochran76/workspace.local/auracall/docs/dev/plans/legacy-archive/0007-2026-04-08-cache-architecture-plan.md)
  defines the anti-drift subsystem model. This schema doc describes the current
  concrete layout and should evolve in step with that architecture plan.

This document defines the on-disk cache layout and index structure for LLM services.

The default migration mode is `cache.store = "dual"`:
- SQLite (`cache.sqlite`) is used as the primary structured store.
- JSON cache files remain as a compatibility mirror.
- `cache-index.json` remains the export/listing manifest.

## Root Layout

All cache data is keyed by provider + identity.

```
~/.auracall/cache/providers/<provider>/<identityKey>/
  cache-index.json
  cache.sqlite
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
- `cache.sqlite` stores normalized cache entries by dataset/entity.
- JSON files remain canonical compatibility artifacts for export/debug and rollback.
- SQL catalog tables (`source_links`, `file_bindings`, `file_assets`) capture normalized
  source/file relations for agent lookups.

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
  - Includes `messages[]` plus optional:
    - `sources[]` (consulted URLs/citations, optional `sourceGroup`)
    - `files[]`
    - `artifacts[]`
- `conversation-files/<id>.json`: `FileRef[]` wrapped in cache metadata.
- `project-instructions/<projectId>.json`: `{ content: string, format: "md" }` wrapped in cache metadata.
- `project-knowledge/<projectId>/manifest.json`: `FileRef[]` wrapped in cache metadata.
- `conversation-attachments/<conversationId>/manifest.json`: `FileRef[]` wrapped in cache metadata.

`FileRef` may include optional metadata fields:
- `mimeType`
- `remoteUrl`
- `localPath`
- `checksumSha256`
- `metadata` (provider-specific key/value)

Binary files (knowledge/attachments) are stored under `files/` using the file ID as the directory name; the original filename is preserved as the leaf.

## SQLite Schema (v2)

SQLite store uses:

- `cache_entries`
  - `dataset TEXT`
  - `entity_id TEXT`
  - `items_json TEXT`
  - `fetched_at TEXT`
  - `source_url TEXT`
  - `user_identity_json TEXT`
  - `identity_key TEXT`
  - `updated_at TEXT`
  - `PRIMARY KEY(dataset, entity_id)`
- `meta`
  - migration sentinels (`backfill_v1`)
- `schema_migrations`
  - schema migration ledger (`version`, `description`, `applied_at`)
- `source_links`
  - normalized context citations:
    - `conversation_id`, `message_index`, `url`, `domain`, `title`, `source_group`
- `file_bindings`
  - normalized file references bound to cache datasets/entities:
    - `dataset`, `entity_id`, `conversation_id`, `project_id`, `provider_file_id`,
      `display_name`, `source`, `size_bytes`, `remote_url`, `asset_id`, `metadata_json`
- `file_assets`
  - local/remote asset pointers:
    - `asset_id`, `provider`, `identity_key`, `size_bytes`, `mime_type`,
      `storage_relpath`, `status`, `checksum_sha256`
- `artifact_bindings`
  - normalized conversation artifact references:
    - `artifact_id`, `conversation_id`, `message_index`, `message_id`,
      `title`, `kind`, `uri`, `provider`, `metadata_json`

## Export Targets

Export tooling should use the index file to enumerate content and emit:
- `json`: raw structures
- `md`: transcript rendering
- `html`: rendered transcript view
- `csv`: metadata listings
- `zip`: bundle with attachments
