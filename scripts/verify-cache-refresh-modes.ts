import { spawn } from 'node:child_process';
import { resolveConfig } from '../src/schema/resolver.js';
import { createLlmService } from '../src/browser/llmService/providers/index.js';
import { createCacheStore } from '../src/browser/llmService/cache/store.js';
import type { ProviderId } from '../src/browser/providers/domain.js';

type Args = {
  provider: ProviderId;
  projectId?: string;
  historyLimit: number;
  historySince?: string;
};

function parseArgs(argv: string[]): Args {
  let provider: ProviderId = 'grok';
  let projectId: string | undefined;
  let historyLimit = 200;
  let historySince: string | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--provider' && argv[i + 1]) {
      const value = argv[i + 1].trim().toLowerCase();
      if (value !== 'grok' && value !== 'chatgpt') {
        throw new Error(`Invalid provider "${value}". Use grok or chatgpt.`);
      }
      provider = value;
      i += 1;
      continue;
    }
    if (token === '--project-id' && argv[i + 1]) {
      projectId = argv[i + 1].trim();
      i += 1;
      continue;
    }
    if (token === '--history-limit' && argv[i + 1]) {
      historyLimit = Math.max(1, Number.parseInt(argv[i + 1], 10) || 200);
      i += 1;
      continue;
    }
    if (token === '--history-since' && argv[i + 1]) {
      historySince = argv[i + 1].trim();
      i += 1;
      continue;
    }
  }
  return { provider, projectId, historyLimit, historySince };
}

function setDiff(a: Set<string>, b: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const value of a) {
    if (!b.has(value)) out.add(value);
  }
  return out;
}

function setIntersect(a: Set<string>, b: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const value of a) {
    if (b.has(value)) out.add(value);
  }
  return out;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function runCliRefresh(args: Args, includeProjectOnly: boolean): Promise<void> {
  const cliArgs = [
    'tsx',
    'bin/oracle-cli.ts',
    'cache',
    '--provider',
    args.provider,
    '--refresh',
    '--include-history',
    '--history-limit',
    String(args.historyLimit),
  ];
  if (args.historySince) {
    cliArgs.push('--history-since', args.historySince);
  }
  if (includeProjectOnly) {
    cliArgs.push('--include-project-only-conversations');
  }
  await new Promise<void>((resolve, reject) => {
    const child = spawn('pnpm', cliArgs, {
      stdio: 'inherit',
      env: {
        ...process.env,
        ORACLE_NO_BANNER: '1',
        NODE_NO_WARNINGS: '1',
      },
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Refresh command failed with exit code ${code ?? -1}`));
    });
  });
}

async function readCachedConversationIds(
  provider: ProviderId,
): Promise<{ identityKey: string; ids: Set<string> }> {
  const userConfig = await resolveConfig({}, process.cwd(), process.env);
  const llmService = createLlmService(provider, userConfig);
  const listOptions = await llmService.buildListOptions({
    configuredUrl:
      provider === 'grok'
        ? userConfig.browser?.grokUrl ?? null
        : userConfig.browser?.chatgptUrl ?? userConfig.browser?.url ?? null,
  });
  const cacheContext = await llmService.resolveCacheContext(listOptions);
  const identityKey = cacheContext.identityKey;
  if (!identityKey || identityKey.trim().length === 0) {
    throw new Error('Missing cache identity key for this provider.');
  }
  const configuredStore = cacheContext.userConfig.browser?.cache?.store;
  const store = createCacheStore(
    configuredStore === 'json' || configuredStore === 'sqlite' || configuredStore === 'dual'
      ? configuredStore
      : 'dual',
  );
  const cache = await store.readConversations(cacheContext);
  const ids = new Set<string>();
  for (const item of cache.items) {
    if (item?.id) ids.add(item.id);
  }
  return { identityKey, ids };
}

async function discoverProjectOnlyIds(args: Args): Promise<{
  globalIds: Set<string>;
  scopedIds: Set<string>;
  projectOnlyIds: Set<string>;
  projectCount: number;
}> {
  const userConfig = await resolveConfig({}, process.cwd(), process.env);
  const llmService = createLlmService(args.provider, userConfig);
  const provider = llmService.provider;
  if (!provider.listConversations || !provider.listProjects) {
    throw new Error(`${args.provider} does not support listProjects/listConversations.`);
  }
  const listOptions = await llmService.buildListOptions({
    configuredUrl:
      args.provider === 'grok'
        ? userConfig.browser?.grokUrl ?? null
        : userConfig.browser?.chatgptUrl ?? userConfig.browser?.url ?? null,
    includeHistory: true,
    historyLimit: args.historyLimit,
    historySince: args.historySince,
  });
  const global = await provider.listConversations(undefined, listOptions);
  const globalList = Array.isArray(global) ? global : [];
  const globalIds = new Set<string>();
  for (const item of globalList) {
    if (item?.id) globalIds.add(item.id);
  }
  const projects = await provider.listProjects(listOptions);
  const projectList = Array.isArray(projects) ? projects : [];
  const scopedIds = new Set<string>();
  let projectCount = 0;
  for (const project of projectList) {
    if (!project?.id) continue;
    if (args.projectId && project.id !== args.projectId) continue;
    projectCount += 1;
    const scoped = await provider.listConversations(project.id, {
      ...listOptions,
      includeHistory: false,
    });
    const scopedList = Array.isArray(scoped) ? scoped : [];
    for (const item of scopedList) {
      if (item?.id) scopedIds.add(item.id);
    }
  }
  const projectOnlyIds = setDiff(scopedIds, globalIds);
  return { globalIds, scopedIds, projectOnlyIds, projectCount };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const discovery = await discoverProjectOnlyIds(args);
  assert(discovery.projectCount > 0, 'No matching projects found for scoped comparison.');
  assert(
    discovery.projectOnlyIds.size > 0,
    'No project-only conversation IDs found (increase history bounds or pick a different project).',
  );

  const before = await readCachedConversationIds(args.provider);
  await runCliRefresh(args, false);
  const afterDefault = await readCachedConversationIds(args.provider);
  await runCliRefresh(args, true);
  const afterWithFlag = await readCachedConversationIds(args.provider);

  const defaultNew = setDiff(afterDefault.ids, before.ids);
  const defaultNewProjectOnly = setIntersect(defaultNew, discovery.projectOnlyIds);
  const defaultProjectOnlyInCache = setIntersect(afterDefault.ids, discovery.projectOnlyIds);
  const withFlagProjectOnlyInCache = setIntersect(afterWithFlag.ids, discovery.projectOnlyIds);

  assert(
    defaultNewProjectOnly.size === 0,
    `Default refresh unexpectedly inserted ${defaultNewProjectOnly.size} project-only IDs.`,
  );
  assert(
    withFlagProjectOnlyInCache.size > defaultProjectOnlyInCache.size,
    `Expected --include-project-only-conversations to increase project-only IDs in cache (before=${defaultProjectOnlyInCache.size}, after=${withFlagProjectOnlyInCache.size}).`,
  );

  const summary = {
    provider: args.provider,
    identityKey: afterWithFlag.identityKey,
    projectId: args.projectId ?? null,
    projectCount: discovery.projectCount,
    historyLimit: args.historyLimit,
    historySince: args.historySince ?? null,
    discovery: {
      globalIds: discovery.globalIds.size,
      scopedIds: discovery.scopedIds.size,
      projectOnlyIds: discovery.projectOnlyIds.size,
    },
    cache: {
      before: before.ids.size,
      afterDefault: afterDefault.ids.size,
      afterWithFlag: afterWithFlag.ids.size,
      defaultNewProjectOnly: defaultNewProjectOnly.size,
      projectOnlyInCacheAfterDefault: defaultProjectOnlyInCache.size,
      projectOnlyInCacheAfterWithFlag: withFlagProjectOnlyInCache.size,
    },
  };

  console.log('✅ Refresh mode regression verified.');
  console.log(JSON.stringify(summary, null, 2));
}

void main();
