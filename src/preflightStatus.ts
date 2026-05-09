import fs from 'node:fs/promises';
import path from 'node:path';
import { getAuracallHomeDir } from './auracallHome.js';

export interface LazyLiveFollowPreflightStatus {
  object: 'auracall_preflight_status';
  name: 'lazy-live-follow';
  status: 'passed' | 'failed';
  startedAt: string;
  completedAt: string;
  durationMs: number;
  failedStep: string | null;
  errorMessage: string | null;
}

export interface PreflightStatusSummary {
  lazyLiveFollow: LazyLiveFollowPreflightStatus | null;
}

export function getLazyLiveFollowPreflightStatusPath(): string {
  return path.join(getAuracallHomeDir(), 'preflight', 'lazy-live-follow.json');
}

export async function readPreflightStatusSummary(): Promise<PreflightStatusSummary> {
  return {
    lazyLiveFollow: await readLazyLiveFollowPreflightStatus(),
  };
}

export async function readLazyLiveFollowPreflightStatus(): Promise<LazyLiveFollowPreflightStatus | null> {
  try {
    const raw = await fs.readFile(getLazyLiveFollowPreflightStatusPath(), 'utf8');
    return parseLazyLiveFollowPreflightStatus(JSON.parse(raw));
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? String((error as NodeJS.ErrnoException).code) : '';
    if (code === 'ENOENT' || error instanceof SyntaxError) return null;
    throw error;
  }
}

export async function writeLazyLiveFollowPreflightStatus(
  status: LazyLiveFollowPreflightStatus,
): Promise<void> {
  const statusPath = getLazyLiveFollowPreflightStatusPath();
  await fs.mkdir(path.dirname(statusPath), { recursive: true });
  await fs.writeFile(statusPath, `${JSON.stringify(status, null, 2)}\n`, 'utf8');
}

function parseLazyLiveFollowPreflightStatus(raw: unknown): LazyLiveFollowPreflightStatus | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const status = readEnum(record.status, ['passed', 'failed']);
  const startedAt = readString(record.startedAt);
  const completedAt = readString(record.completedAt);
  if (
    record.object !== 'auracall_preflight_status' ||
    record.name !== 'lazy-live-follow' ||
    !status ||
    !startedAt ||
    !completedAt
  ) {
    return null;
  }
  return {
    object: 'auracall_preflight_status',
    name: 'lazy-live-follow',
    status,
    startedAt,
    completedAt,
    durationMs: readNumber(record.durationMs) ?? 0,
    failedStep: readString(record.failedStep),
    errorMessage: readString(record.errorMessage),
  };
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readEnum<const T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === 'string' && allowed.includes(value as T) ? value as T : null;
}
