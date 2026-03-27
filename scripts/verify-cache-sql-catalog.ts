import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { resolveConfig } from '../src/schema/resolver.js';
import { createLlmService } from '../src/browser/llmService/providers/index.js';
import type { ProviderId } from '../src/browser/providers/domain.js';
import { resolveProviderCachePath } from '../src/browser/providers/cache.js';
import { createCacheStore } from '../src/browser/llmService/cache/store.js';

type Args = {
  provider: ProviderId;
  conversationId?: string;
};

function parseArgs(argv: string[]): Args {
  let provider: ProviderId = 'grok';
  let conversationId: string | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--provider' && argv[i + 1]) {
      const raw = argv[i + 1].trim().toLowerCase();
      if (raw !== 'grok' && raw !== 'chatgpt') {
        throw new Error(`Invalid provider "${raw}". Use grok or chatgpt.`);
      }
      provider = raw;
      i += 1;
      continue;
    }
    if (!conversationId && !token.startsWith('--')) {
      conversationId = token.trim();
    }
  }
  return { provider, conversationId };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const userConfig = await resolveConfig({}, process.cwd(), process.env);
  const llmService = createLlmService(args.provider, userConfig);
  const listOptions = await llmService.buildListOptions({
    configuredUrl:
      args.provider === 'grok'
        ? userConfig.browser?.grokUrl ?? null
        : userConfig.browser?.chatgptUrl ?? userConfig.browser?.url ?? null,
  });
  const cacheContext = await llmService.resolveCacheContext(listOptions);
  const sqliteStore = createCacheStore('sqlite');
  await sqliteStore.readProjects(cacheContext);
  const dbPath = path.join(resolveProviderCachePath(cacheContext, 'projects.json').cacheDir, 'cache.sqlite');

  if (args.conversationId) {
    await llmService.getConversationContext(args.conversationId, {
      cacheOnly: true,
      refresh: false,
      listOptions,
    });
  }

  const db = new DatabaseSync(dbPath);
  try {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((row) => String(row.name));
    const requiredTables = ['cache_entries', 'meta', 'schema_migrations', 'file_assets', 'file_bindings', 'source_links'];
    const missingTables = requiredTables.filter((name) => !tables.includes(name));
    if (missingTables.length > 0) {
      throw new Error(`Missing tables: ${missingTables.join(', ')}`);
    }

    const globalCounts = {
      cache_entries: Number(
        (db.prepare('SELECT COUNT(*) AS c FROM cache_entries').get() as { c?: number }).c ?? 0,
      ),
      source_links: Number(
        (db.prepare('SELECT COUNT(*) AS c FROM source_links').get() as { c?: number }).c ?? 0,
      ),
      file_bindings: Number(
        (db.prepare('SELECT COUNT(*) AS c FROM file_bindings').get() as { c?: number }).c ?? 0,
      ),
      file_assets: Number(
        (db.prepare('SELECT COUNT(*) AS c FROM file_assets').get() as { c?: number }).c ?? 0,
      ),
    };

    const payload: Record<string, unknown> = {
      provider: args.provider,
      identityKey: cacheContext.identityKey,
      dbPath,
      counts: globalCounts,
      tables,
    };

    if (args.conversationId) {
      payload.conversation = {
        id: args.conversationId,
        sourceLinks: Number(
          (db
            .prepare('SELECT COUNT(*) AS c FROM source_links WHERE conversation_id = ?')
            .get(args.conversationId) as { c?: number }).c ?? 0,
        ),
        contextBindings: Number(
          (db
            .prepare(
              "SELECT COUNT(*) AS c FROM file_bindings WHERE dataset = 'conversation-context' AND entity_id = ?",
            )
            .get(args.conversationId) as { c?: number }).c ?? 0,
        ),
        attachmentBindings: Number(
          (db
            .prepare(
              "SELECT COUNT(*) AS c FROM file_bindings WHERE dataset = 'conversation-attachments' AND entity_id = ?",
            )
            .get(args.conversationId) as { c?: number }).c ?? 0,
        ),
      };
    }

    console.log(`✅ SQL catalog verified for ${args.provider}/${cacheContext.identityKey}`);
    console.log(JSON.stringify(payload, null, 2));
  } finally {
    db.close();
  }
}

void main();
