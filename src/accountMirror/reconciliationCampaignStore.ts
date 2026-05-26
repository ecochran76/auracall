import fs from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getAuracallHomeDir } from '../auracallHome.js';
import type {
  AccountMirrorReconciliationCampaign,
  AccountMirrorReconciliationCampaignStatus,
} from './reconciliationCampaignService.js';

const RECONCILIATIONS_DIRNAME = 'reconciliations';

export interface AccountMirrorReconciliationCampaignStoredRecord {
  object: 'account_mirror_reconciliation_campaign_record';
  version: 1;
  id: string;
  revision: number;
  persistedAt: string;
  campaign: AccountMirrorReconciliationCampaign;
}

export interface AccountMirrorReconciliationCampaignStore {
  ensureStorage(): Promise<void>;
  readCampaign(id: string): Promise<AccountMirrorReconciliationCampaign | null>;
  writeCampaign(
    campaign: AccountMirrorReconciliationCampaign,
    options?: { persistedAt?: string },
  ): Promise<AccountMirrorReconciliationCampaignStoredRecord>;
  listCampaigns(options?: {
    status?: AccountMirrorReconciliationCampaignStatus | 'active' | null;
    limit?: number | null;
  }): Promise<AccountMirrorReconciliationCampaign[]>;
}

export function createAccountMirrorReconciliationCampaignStore(input: {
  config: Record<string, unknown> | null | undefined;
}): AccountMirrorReconciliationCampaignStore {
  const rootDir = resolveAccountMirrorReconciliationsDir(input.config);
  return {
    async ensureStorage() {
      await fs.mkdir(rootDir, { recursive: true });
    },
    async readCampaign(id) {
      const record = await readStoredRecord(rootDir, id);
      return record?.campaign ?? null;
    },
    async writeCampaign(campaign, options = {}) {
      const existing = await readStoredRecord(rootDir, campaign.id);
      const record: AccountMirrorReconciliationCampaignStoredRecord = {
        object: 'account_mirror_reconciliation_campaign_record',
        version: 1,
        id: campaign.id,
        revision: (existing?.revision ?? 0) + 1,
        persistedAt: options.persistedAt ?? campaign.updatedAt,
        campaign,
      };
      const parsed = parseStoredRecord(record);
      await fs.mkdir(rootDir, { recursive: true });
      const recordPath = resolveCampaignRecordPath(rootDir, campaign.id);
      const tempPath = `${recordPath}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
      await fs.writeFile(tempPath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
      await fs.rename(tempPath, recordPath);
      return parsed;
    },
    async listCampaigns(options = {}) {
      let entries: Dirent[];
      try {
        entries = await fs.readdir(rootDir, { withFileTypes: true });
      } catch (error) {
        if (isMissingFileError(error)) return [];
        throw error;
      }
      const records = (
        await Promise.all(
          entries
            .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
            .map(async (entry) => readStoredRecordFile(path.join(rootDir, entry.name))),
        )
      ).filter((record): record is AccountMirrorReconciliationCampaignStoredRecord => record !== null);
      const status = options.status ?? null;
      const campaigns = records
        .map((record) => record.campaign)
        .filter((campaign) => !status || (status === 'active' ? isActiveCampaign(campaign.status) : campaign.status === status))
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
      const limit = normalizeLimit(options.limit);
      return limit === null ? campaigns : campaigns.slice(0, limit);
    },
  };
}

function resolveAccountMirrorReconciliationsDir(config: Record<string, unknown> | null | undefined): string {
  const cacheRoot = readNestedString(config, ['browser', 'cache', 'rootDir'])
    ?? path.join(getAuracallHomeDir(), 'cache');
  return path.join(cacheRoot, 'account-mirror', RECONCILIATIONS_DIRNAME);
}

function resolveCampaignRecordPath(rootDir: string, id: string): string {
  return path.join(rootDir, `${encodeURIComponent(id)}.json`);
}

async function readStoredRecord(
  rootDir: string,
  id: string,
): Promise<AccountMirrorReconciliationCampaignStoredRecord | null> {
  return readStoredRecordFile(resolveCampaignRecordPath(rootDir, id));
}

async function readStoredRecordFile(recordPath: string): Promise<AccountMirrorReconciliationCampaignStoredRecord | null> {
  try {
    const raw = await fs.readFile(recordPath, 'utf8');
    return parseStoredRecord(JSON.parse(raw));
  } catch (error) {
    if (isMissingFileError(error)) return null;
    throw error;
  }
}

function parseStoredRecord(value: unknown): AccountMirrorReconciliationCampaignStoredRecord {
  const record = isRecord(value) ? value : {};
  const campaign = parseCampaign(record.campaign);
  return {
    object: 'account_mirror_reconciliation_campaign_record',
    version: 1,
    id: readRequiredString(record.id, 'id'),
    revision: normalizeRevision(record.revision),
    persistedAt: normalizeIsoString(record.persistedAt) ?? campaign.updatedAt,
    campaign,
  };
}

function parseCampaign(value: unknown): AccountMirrorReconciliationCampaign {
  if (!isRecord(value) || value.object !== 'account_mirror_reconciliation_campaign') {
    throw new Error('Invalid account mirror reconciliation campaign record.');
  }
  return value as unknown as AccountMirrorReconciliationCampaign;
}

function normalizeLimit(value: number | null | undefined): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) return 100;
  return Math.max(1, Math.min(500, Math.floor(value)));
}

function normalizeRevision(value: unknown): number {
  return Math.max(1, Math.floor(readNumber(value) ?? 1));
}

function normalizeIsoString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && !Number.isNaN(Date.parse(trimmed)) ? trimmed : null;
}

function readRequiredString(value: unknown, field: string): string {
  const parsed = typeof value === 'string' ? value.trim() : '';
  if (!parsed) throw new Error(`Invalid account mirror reconciliation campaign record: missing ${field}.`);
  return parsed;
}

function readNestedString(value: Record<string, unknown> | null | undefined, segments: string[]): string | null {
  let current: unknown = value;
  for (const segment of segments) {
    if (!isRecord(current)) return null;
    current = current[segment];
  }
  return typeof current === 'string' && current.trim() ? current.trim() : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isActiveCampaign(status: AccountMirrorReconciliationCampaignStatus): boolean {
  return status === 'queued' || status === 'running' || status === 'idle_waiting' || status === 'paused';
}

function isMissingFileError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
