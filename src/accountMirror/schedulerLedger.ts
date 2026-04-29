import fs from 'node:fs/promises';
import path from 'node:path';
import { getAuracallHomeDir } from '../auracallHome.js';
import type { AccountMirrorSchedulerPassResult } from './schedulerService.js';

export interface AccountMirrorSchedulerPassHistory {
  object: 'account_mirror_scheduler_pass_history';
  version: 1;
  updatedAt: string | null;
  limit: number;
  entries: AccountMirrorSchedulerPassResult[];
}

export interface AccountMirrorSchedulerPassLedger {
  appendPass(pass: AccountMirrorSchedulerPassResult): Promise<AccountMirrorSchedulerPassHistory>;
  readHistory(): Promise<AccountMirrorSchedulerPassHistory>;
}

export function createAccountMirrorSchedulerPassLedger(input: {
  config: Record<string, unknown> | null | undefined;
  maxEntries?: number | null;
}): AccountMirrorSchedulerPassLedger {
  const limit = normalizeLimit(input.maxEntries);
  const historyPath = resolveSchedulerPassHistoryPath(input.config);
  return {
    async appendPass(pass) {
      const current = await readHistoryFile(historyPath, limit);
      const entries = [pass, ...current.entries]
        .sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt))
        .slice(0, limit);
      const history: AccountMirrorSchedulerPassHistory = {
        object: 'account_mirror_scheduler_pass_history',
        version: 1,
        updatedAt: pass.completedAt,
        limit,
        entries,
      };
      await fs.mkdir(path.dirname(historyPath), { recursive: true });
      await fs.writeFile(historyPath, JSON.stringify(history, null, 2), 'utf8');
      return history;
    },
    async readHistory() {
      return readHistoryFile(historyPath, limit);
    },
  };
}

async function readHistoryFile(
  historyPath: string,
  limit: number,
): Promise<AccountMirrorSchedulerPassHistory> {
  try {
    const raw = await fs.readFile(historyPath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<AccountMirrorSchedulerPassHistory>;
    const entries = Array.isArray(parsed.entries)
      ? parsed.entries.filter(isSchedulerPass).slice(0, limit)
      : [];
    return {
      object: 'account_mirror_scheduler_pass_history',
      version: 1,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : entries[0]?.completedAt ?? null,
      limit,
      entries,
    };
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code !== 'ENOENT') {
      throw error;
    }
    return {
      object: 'account_mirror_scheduler_pass_history',
      version: 1,
      updatedAt: null,
      limit,
      entries: [],
    };
  }
}

function isSchedulerPass(value: unknown): value is AccountMirrorSchedulerPassResult {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<AccountMirrorSchedulerPassResult>;
  return (
    record.object === 'account_mirror_scheduler_pass' &&
    typeof record.startedAt === 'string' &&
    typeof record.completedAt === 'string'
  );
}

function resolveSchedulerPassHistoryPath(
  config: Record<string, unknown> | null | undefined,
): string {
  const cacheRoot = readNestedString(config, ['browser', 'cache', 'rootDir'])
    ?? path.join(getAuracallHomeDir(), 'cache');
  return path.join(cacheRoot, 'account-mirror', 'scheduler-passes.json');
}

function readNestedString(
  value: Record<string, unknown> | null | undefined,
  segments: string[],
): string | null {
  let current: unknown = value;
  for (const segment of segments) {
    if (!current || typeof current !== 'object') return null;
    current = (current as Record<string, unknown>)[segment];
  }
  const trimmed = typeof current === 'string' ? current.trim() : '';
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeLimit(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 50;
  return Math.max(1, Math.min(500, Math.floor(value)));
}
