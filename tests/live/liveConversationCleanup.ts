import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getAuracallHomeDir } from '../../src/auracallHome.js';
import { createExecutionRuntimeControl } from '../../src/runtime/control.js';

const execFileAsync = promisify(execFile);
const TSX_BIN = path.join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs');
const CLI_ENTRY = path.join(process.cwd(), 'bin', 'auracall.ts');
const LIVE_CONVERSATION_CLEANUP_THRESHOLD = 6;
const LIVE_CONVERSATION_CLEANUP_RETAIN_NEWEST = 3;
const LIVE_CONVERSATION_CLEANUP_MAX_DELETES_PER_ENQUEUE = 2;
const LIVE_CONVERSATION_DELETE_TIMEOUT_MS = 30 * 1000;

export type LiveCleanupProvider = 'chatgpt' | 'gemini' | 'grok';

export type LiveConversationCleanupEntry = {
  provider: LiveCleanupProvider;
  conversationId: string;
  runId: string;
  stepId: string;
  tabUrl: string | null;
  capturedAt: string;
};

type LiveConversationCleanupLedger = {
  provider: LiveCleanupProvider;
  threshold: number;
  retainNewest: number;
  items: LiveConversationCleanupEntry[];
};

type ExecutionRuntimeLike = Pick<ReturnType<typeof createExecutionRuntimeControl>, 'readRun'>;

export type EnqueueLiveConversationCleanupInput = {
  provider: LiveCleanupProvider;
  runId: string;
  control?: ExecutionRuntimeLike;
  threshold?: number;
  retainNewest?: number;
  now?: Date;
  deleteConversation?: (entry: LiveConversationCleanupEntry) => Promise<void>;
};

export type EnqueueLiveConversationCleanupResult = {
  enqueuedConversationIds: string[];
  deletedConversationIds: string[];
  retainedConversationIds: string[];
};

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function cleanupRootDir(): string {
  return path.join(getAuracallHomeDir(), 'live-test-cleanup');
}

function cleanupLedgerPath(provider: LiveCleanupProvider): string {
  return path.join(cleanupRootDir(), `${provider}-team-conversations.json`);
}

async function readCleanupLedger(
  provider: LiveCleanupProvider,
  threshold: number,
  retainNewest: number,
): Promise<LiveConversationCleanupLedger> {
  const ledgerPath = cleanupLedgerPath(provider);
  try {
    const raw = await fs.readFile(ledgerPath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<LiveConversationCleanupLedger>;
    const items = Array.isArray(parsed.items)
      ? parsed.items.flatMap((candidate) => {
          if (!candidate || typeof candidate !== 'object') return [];
          const item = candidate as Partial<LiveConversationCleanupEntry>;
          const conversationId = asNonEmptyString(item.conversationId);
          const runId = asNonEmptyString(item.runId);
          const stepId = asNonEmptyString(item.stepId);
          const capturedAt = asNonEmptyString(item.capturedAt);
          if (!conversationId || !runId || !stepId || !capturedAt) {
            return [];
          }
          return [{
            provider,
            conversationId,
            runId,
            stepId,
            tabUrl: asNonEmptyString(item.tabUrl),
            capturedAt,
          } satisfies LiveConversationCleanupEntry];
        })
      : [];
    return { provider, threshold, retainNewest, items };
  } catch {
    return { provider, threshold, retainNewest, items: [] };
  }
}

async function writeCleanupLedger(ledger: LiveConversationCleanupLedger): Promise<void> {
  await fs.mkdir(cleanupRootDir(), { recursive: true });
  await fs.writeFile(cleanupLedgerPath(ledger.provider), JSON.stringify(ledger, null, 2), 'utf8');
}

export async function readDisposableLiveTeamConversations(
  provider: LiveCleanupProvider,
  runId: string,
  control: ExecutionRuntimeLike = createExecutionRuntimeControl(),
  now: Date = new Date(),
): Promise<LiveConversationCleanupEntry[]> {
  const record = await control.readRun(runId);
  if (!record) return [];
  const capturedAt = now.toISOString();
  return record.bundle.steps.flatMap((step) => {
    const browserRun = step.output?.structuredData?.browserRun;
    if (!browserRun || typeof browserRun !== 'object') return [];
    const browserProvider = asNonEmptyString((browserRun as Record<string, unknown>).service);
    const conversationId = asNonEmptyString((browserRun as Record<string, unknown>).conversationId);
    if (browserProvider !== provider || !conversationId) return [];
    return [{
      provider,
      conversationId,
      runId,
      stepId: step.id,
      tabUrl: asNonEmptyString((browserRun as Record<string, unknown>).tabUrl),
      capturedAt,
    } satisfies LiveConversationCleanupEntry];
  });
}

async function deleteConversationViaCli(entry: LiveConversationCleanupEntry): Promise<void> {
  await execFileAsync(
    process.execPath,
    [
      TSX_BIN,
      CLI_ENTRY,
      'delete',
      entry.conversationId,
      '--target',
      entry.provider,
      '--yes',
    ],
    {
      env: {
        ...process.env,
        ORACLE_NO_BANNER: '1',
        NODE_NO_WARNINGS: '1',
      },
      timeout: LIVE_CONVERSATION_DELETE_TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
    },
  );
}

export async function enqueueLiveConversationCleanup(
  input: EnqueueLiveConversationCleanupInput,
): Promise<EnqueueLiveConversationCleanupResult> {
  const threshold = input.threshold ?? LIVE_CONVERSATION_CLEANUP_THRESHOLD;
  const retainNewest = input.retainNewest ?? LIVE_CONVERSATION_CLEANUP_RETAIN_NEWEST;
  const now = input.now ?? new Date();
  const deleteConversation = input.deleteConversation ?? deleteConversationViaCli;
  const control = input.control ?? createExecutionRuntimeControl();

  const discovered = await readDisposableLiveTeamConversations(input.provider, input.runId, control, now);
  if (discovered.length === 0) {
    return {
      enqueuedConversationIds: [],
      deletedConversationIds: [],
      retainedConversationIds: [],
    };
  }

  const ledger = await readCleanupLedger(input.provider, threshold, retainNewest);
  const seen = new Set(ledger.items.map((item) => item.conversationId));
  const enqueued = discovered.filter((item) => {
    if (seen.has(item.conversationId)) return false;
    seen.add(item.conversationId);
    return true;
  });
  ledger.items.push(...enqueued);

  const deletedConversationIds: string[] = [];
  if (ledger.items.length > threshold) {
    const deleteCount = Math.max(0, ledger.items.length - retainNewest);
    const cappedDeleteCount = Math.min(deleteCount, LIVE_CONVERSATION_CLEANUP_MAX_DELETES_PER_ENQUEUE);
    const candidates = ledger.items.slice(0, cappedDeleteCount);
    const retained = ledger.items.slice(cappedDeleteCount);
    const failed: LiveConversationCleanupEntry[] = [];
    for (const entry of candidates) {
      try {
        await deleteConversation(entry);
        deletedConversationIds.push(entry.conversationId);
      } catch {
        failed.push(entry);
      }
    }
    ledger.items = [...failed, ...retained];
  }

  await writeCleanupLedger(ledger);
  return {
    enqueuedConversationIds: enqueued.map((item) => item.conversationId),
    deletedConversationIds,
    retainedConversationIds: ledger.items.map((item) => item.conversationId),
  };
}
