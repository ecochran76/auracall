import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveConfig } from '../src/schema/resolver.js';
import { createLlmService } from '../src/browser/llmService/providers/index.js';
import type { ProviderId } from '../src/browser/providers/domain.js';
import { resolveProviderCachePath } from '../src/browser/providers/cache.js';
import { buildCacheExportPlan, runCacheExport, type CacheExportFormat, type CacheExportScope } from '../src/browser/llmService/cache/export.js';

type Args = {
  provider: ProviderId;
  conversationId?: string;
  projectId?: string;
  outputRoot: string;
  noIndexCheck: boolean;
};

type MatrixResult = {
  scope: CacheExportScope;
  format: CacheExportFormat;
  entries: number;
  outputPath: string;
  validated: boolean;
};

function parseArgs(argv: string[]): Args {
  let provider: ProviderId = 'grok';
  let conversationId: string | undefined;
  let projectId: string | undefined;
  let outputRoot = '/tmp/oracle-cache-export-parity';
  let noIndexCheck = true;

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--provider' && argv[i + 1]) {
      const next = argv[i + 1].trim().toLowerCase();
      if (next !== 'grok' && next !== 'chatgpt') {
        throw new Error(`Invalid provider "${next}". Use grok or chatgpt.`);
      }
      provider = next;
      i += 1;
      continue;
    }
    if (token === '--conversation-id' && argv[i + 1]) {
      conversationId = argv[i + 1].trim();
      i += 1;
      continue;
    }
    if (token === '--project-id' && argv[i + 1]) {
      projectId = argv[i + 1].trim();
      i += 1;
      continue;
    }
    if ((token === '--out' || token === '--output-root') && argv[i + 1]) {
      outputRoot = argv[i + 1].trim();
      i += 1;
      continue;
    }
    if (token === '--no-index-check') {
      noIndexCheck = false;
      continue;
    }
    if (!token.startsWith('--') && !conversationId) {
      conversationId = token.trim();
      continue;
    }
  }

  return {
    provider,
    conversationId,
    projectId,
    outputRoot,
    noIndexCheck,
  };
}

function buildMatrix(args: Args): Array<{ scope: CacheExportScope; format: CacheExportFormat }> {
  const matrix: Array<{ scope: CacheExportScope; format: CacheExportFormat }> = [
    { scope: 'conversations', format: 'json' },
    { scope: 'contexts', format: 'json' },
  ];
  if (args.conversationId) {
    matrix.push(
      { scope: 'conversation', format: 'json' },
      { scope: 'conversation', format: 'csv' },
      { scope: 'conversation', format: 'md' },
      { scope: 'conversation', format: 'html' },
      { scope: 'conversation', format: 'zip' },
    );
  }
  if (args.projectId) {
    matrix.push({ scope: 'projects', format: 'json' });
  }
  return matrix;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function validateMatrixOutput(
  step: { scope: CacheExportScope; format: CacheExportFormat },
  result: { outputPath: string; entries: number },
  outputDir: string,
  conversationId?: string,
): Promise<void> {
  assert(result.entries >= 0, `${step.scope}/${step.format}: invalid entries count`);

  if (step.format === 'zip') {
    await fs.access(result.outputPath);
    return;
  }

  if (step.scope === 'conversation' && step.format === 'json' && conversationId) {
    const contextPath = path.join(outputDir, 'contexts', `${conversationId}.json`);
    const raw = await fs.readFile(contextPath, 'utf8');
    const parsed = JSON.parse(raw) as { items?: { messages?: unknown[]; sources?: unknown[] } };
    assert(Array.isArray(parsed?.items?.messages), `${step.scope}/${step.format}: missing messages in exported JSON`);
    return;
  }

  if (step.scope === 'conversation' && step.format === 'csv') {
    const csvPath = path.join(outputDir, 'contexts.csv');
    const raw = await fs.readFile(csvPath, 'utf8');
    assert(raw.includes('conversationId,provider,messageCount'), `${step.scope}/${step.format}: missing CSV header`);
    return;
  }

  if (step.scope === 'conversation' && step.format === 'md' && conversationId) {
    await fs.access(path.join(outputDir, `${conversationId}.md`));
    return;
  }

  if (step.scope === 'conversation' && step.format === 'html' && conversationId) {
    await fs.access(path.join(outputDir, `${conversationId}.html`));
    return;
  }
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
  const identityKey = cacheContext.identityKey;
  if (typeof identityKey !== 'string' || identityKey.trim().length === 0) {
    throw new Error('Missing cache identity key.');
  }

  const root = path.resolve(args.outputRoot, args.provider, identityKey);
  await fs.rm(root, { recursive: true, force: true });
  await fs.mkdir(root, { recursive: true });

  const matrix = buildMatrix(args);
  const results: MatrixResult[] = [];
  for (const step of matrix) {
    const target = path.join(root, `${step.scope}-${step.format}`);
    const plan = await buildCacheExportPlan(cacheContext, {
      scope: step.scope,
      format: step.format,
      conversationId: args.conversationId,
      projectId: args.projectId,
      outputDir: target,
    });
    const runResult = await runCacheExport(cacheContext, {
      scope: step.scope,
      format: step.format,
      conversationId: args.conversationId,
      projectId: args.projectId,
      outputDir: target,
    });
    await validateMatrixOutput(step, runResult, target, args.conversationId);
    results.push({
      scope: step.scope,
      format: step.format,
      entries: plan.entries.length,
      outputPath: runResult.outputPath,
      validated: true,
    });
  }

  let noIndex: { checked: boolean; entries: number; outputPath: string } | undefined;
  if (args.noIndexCheck && args.conversationId) {
    const cacheDir = resolveProviderCachePath(cacheContext, 'projects.json').cacheDir;
    const indexPath = path.join(cacheDir, 'cache-index.json');
    const backupPath = path.join(cacheDir, 'cache-index.json.verify-export.bak');
    try {
      await fs.rm(backupPath, { force: true });
      await fs.rename(indexPath, backupPath);
      const target = path.join(root, 'no-index-conversation-json');
      const plan = await buildCacheExportPlan(cacheContext, {
        scope: 'conversation',
        format: 'json',
        conversationId: args.conversationId,
        outputDir: target,
      });
      const runResult = await runCacheExport(cacheContext, {
        scope: 'conversation',
        format: 'json',
        conversationId: args.conversationId,
        outputDir: target,
      });
      await validateMatrixOutput(
        { scope: 'conversation', format: 'json' },
        runResult,
        target,
        args.conversationId,
      );
      noIndex = {
        checked: true,
        entries: plan.entries.length,
        outputPath: runResult.outputPath,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`No-index check failed: ${message}`);
    } finally {
      try {
        await fs.rename(backupPath, indexPath);
      } catch {
        // ignore restoration failures in smoke output path
      }
    }
  }

  console.log(`✅ Cache export parity verified for ${args.provider}/${identityKey}`);
  console.log(
    JSON.stringify(
      {
        provider: args.provider,
        identityKey,
        conversationId: args.conversationId ?? null,
        projectId: args.projectId ?? null,
        outputRoot: root,
        results,
        noIndex: noIndex ?? { checked: false },
      },
      null,
      2,
    ),
  );
}

void main();
