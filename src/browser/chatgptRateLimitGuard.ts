import fs from 'node:fs/promises';
import path from 'node:path';
import { getAuracallHomeDir } from '../auracallHome.js';
import { resolveManagedProfileRoot } from './profileStore.js';

export const CHATGPT_MUTATION_MIN_INTERVAL_MS = 15_000;
export const CHATGPT_RATE_LIMIT_COOLDOWN_MS = 5 * 60_000;
export const CHATGPT_RATE_LIMIT_AUTO_WAIT_MAX_MS = 30_000;
export const CHATGPT_MUTATION_WINDOW_MS = 2 * 60_000;
export const CHATGPT_MUTATION_MAX_WEIGHT = 5;
export const CHATGPT_MUTATION_BUDGET_AUTO_WAIT_MAX_MS = 2 * 60_000;
export const CHATGPT_POST_COMMIT_BASE_QUIET_MS = 12_000;
export const CHATGPT_POST_COMMIT_AUTO_WAIT_MAX_MS = 45_000;
export const CHATGPT_POST_COMMIT_JITTER_MAX_MS = 1_500;

export type ChatgptMutationRecord = {
  at: number;
  action?: string;
  weight?: number;
  quietMs?: number;
};

export type ChatgptRateLimitGuardState = {
  provider: 'chatgpt';
  profile: string;
  updatedAt: number;
  lastMutationAt?: number;
  recentMutationAts?: number[];
  recentMutations?: ChatgptMutationRecord[];
  cooldownUntil?: number;
  cooldownDetectedAt?: number;
  cooldownReason?: string;
  cooldownAction?: string;
};

function sanitizeProfileSegment(value: string | null | undefined): string {
  const trimmed = String(value ?? '').trim();
  const normalized = trimmed.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '');
  return normalized || 'default';
}

export function resolveChatgptRateLimitProfileName(options: {
  profileName?: string | null;
  managedProfileDir?: string | null;
  managedProfileRoot?: string | null;
} = {}): string {
  if (options.profileName?.trim()) {
    return sanitizeProfileSegment(options.profileName);
  }
  if (options.managedProfileDir?.trim()) {
    const managedRoot = resolveManagedProfileRoot(options.managedProfileRoot ?? null);
    const relative = path.relative(managedRoot, path.resolve(options.managedProfileDir.trim()));
    if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
      const segments = relative.split(path.sep).filter(Boolean);
      if (segments.length >= 2) {
        return sanitizeProfileSegment(segments[0]);
      }
    }
  }
  return 'default';
}

export function resolveChatgptRateLimitGuardPath(options: {
  profileName?: string | null;
  managedProfileDir?: string | null;
  managedProfileRoot?: string | null;
  cacheRoot?: string | null;
} = {}): string {
  const cacheRoot = options.cacheRoot?.trim()
    ? path.resolve(options.cacheRoot.trim())
    : path.join(getAuracallHomeDir(), 'cache', 'providers');
  const profile = resolveChatgptRateLimitProfileName(options);
  return path.join(cacheRoot, 'chatgpt', '__runtime__', `rate-limit-${profile}.json`);
}

export async function readChatgptRateLimitGuardState(options: {
  profileName?: string | null;
  managedProfileDir?: string | null;
  managedProfileRoot?: string | null;
  cacheRoot?: string | null;
} = {}): Promise<ChatgptRateLimitGuardState | null> {
  const statePath = resolveChatgptRateLimitGuardPath(options);
  try {
    const raw = await fs.readFile(statePath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<ChatgptRateLimitGuardState>;
    return {
      provider: 'chatgpt',
      profile: resolveChatgptRateLimitProfileName(options),
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0,
      lastMutationAt: typeof parsed.lastMutationAt === 'number' ? parsed.lastMutationAt : undefined,
      recentMutationAts: Array.isArray(parsed.recentMutationAts)
        ? parsed.recentMutationAts.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
        : undefined,
      recentMutations: Array.isArray(parsed.recentMutations)
        ? parsed.recentMutations
            .filter((value): value is ChatgptMutationRecord => Boolean(value) && typeof value === 'object')
            .map((value) => ({
              at: typeof value.at === 'number' && Number.isFinite(value.at) ? value.at : 0,
              action: typeof value.action === 'string' ? value.action : undefined,
              weight:
                typeof value.weight === 'number' && Number.isFinite(value.weight) ? value.weight : undefined,
              quietMs:
                typeof value.quietMs === 'number' && Number.isFinite(value.quietMs) ? value.quietMs : undefined,
            }))
            .filter((value) => value.at > 0)
        : undefined,
      cooldownUntil: typeof parsed.cooldownUntil === 'number' ? parsed.cooldownUntil : undefined,
      cooldownDetectedAt: typeof parsed.cooldownDetectedAt === 'number' ? parsed.cooldownDetectedAt : undefined,
      cooldownReason: typeof parsed.cooldownReason === 'string' ? parsed.cooldownReason : undefined,
      cooldownAction: typeof parsed.cooldownAction === 'string' ? parsed.cooldownAction : undefined,
    };
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function writeChatgptRateLimitGuardState(
  state: ChatgptRateLimitGuardState,
  options: {
    profileName?: string | null;
    managedProfileDir?: string | null;
    managedProfileRoot?: string | null;
    cacheRoot?: string | null;
  } = {},
): Promise<void> {
  const statePath = resolveChatgptRateLimitGuardPath(options);
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

export function isChatgptRateLimitMessage(message: string): boolean {
  return /too many requests|too quickly|rate limit/i.test(message);
}

export function extractChatgptRateLimitSummary(message: string): string | null {
  const normalized = message.replace(/\s+/g, ' ').trim();
  const direct = normalized.match(/(too many requests[^.]*\.?|you(?:'|’)re making requests too quickly[^.]*\.?)/i);
  if (direct?.[1]) {
    return direct[1].trim();
  }
  const generic = normalized.match(/(rate limit[^.]*\.?)/i);
  return generic?.[1]?.trim() ?? null;
}

export function pruneChatgptMutationHistory(
  history: readonly number[] | null | undefined,
  now = Date.now(),
  windowMs = CHATGPT_MUTATION_WINDOW_MS,
): number[] {
  if (!Array.isArray(history) || history.length === 0) {
    return [];
  }
  const cutoff = now - Math.max(0, windowMs);
  return history
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > cutoff)
    .sort((left, right) => left - right);
}

export function getChatgptMutationWeight(action?: string | null): number {
  switch (String(action ?? '').trim()) {
    case 'browserRun':
      return 2.5;
    case 'createProject':
    case 'clickCreateProjectConfirm':
    case 'cloneProject':
    case 'uploadProjectFiles':
    case 'uploadAccountFiles':
      return 2;
    case 'deleteConversation':
    case 'pushProjectRemoveConfirmation':
    case 'deleteProjectFile':
    case 'deleteAccountFile':
      return 1.5;
    case 'renameConversation':
    case 'renameProject':
    case 'updateProjectInstructions':
      return 1;
    default:
      return 1;
  }
}

export function getChatgptMutationQuietMs(action?: string | null): number {
  switch (String(action ?? '').trim()) {
    case 'browserRun':
      return 18_000;
    case 'createProject':
    case 'clickCreateProjectConfirm':
    case 'cloneProject':
    case 'uploadProjectFiles':
    case 'uploadAccountFiles':
      return 15_000;
    case 'deleteConversation':
    case 'pushProjectRemoveConfirmation':
      return 15_000;
    case 'deleteProjectFile':
    case 'deleteAccountFile':
    case 'renameConversation':
    case 'renameProject':
    case 'updateProjectInstructions':
      return CHATGPT_POST_COMMIT_BASE_QUIET_MS;
    default:
      return CHATGPT_POST_COMMIT_BASE_QUIET_MS;
  }
}

function hashForJitter(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

export function getChatgptMutationQuietJitterMs(
  action?: string | null,
  recentCount = 0,
  maxMs = CHATGPT_POST_COMMIT_JITTER_MAX_MS,
): number {
  if (!Number.isFinite(maxMs) || maxMs <= 0) {
    return 0;
  }
  const key = `${String(action ?? '').trim().toLowerCase()}#${Math.max(0, Math.trunc(recentCount))}`;
  return hashForJitter(key) % (Math.floor(maxMs) + 1);
}

export function normalizeChatgptMutationRecords(
  state:
    | Pick<ChatgptRateLimitGuardState, 'recentMutations' | 'recentMutationAts'>
    | null
    | undefined,
): ChatgptMutationRecord[] {
  if (Array.isArray(state?.recentMutations) && state.recentMutations.length > 0) {
    return state.recentMutations
      .filter((value): value is ChatgptMutationRecord => Boolean(value) && typeof value === 'object')
      .map((value) => ({
        at: typeof value.at === 'number' && Number.isFinite(value.at) ? value.at : 0,
        action: typeof value.action === 'string' ? value.action : undefined,
        weight:
          typeof value.weight === 'number' && Number.isFinite(value.weight)
            ? value.weight
            : getChatgptMutationWeight(value.action),
        quietMs:
          typeof value.quietMs === 'number' && Number.isFinite(value.quietMs)
            ? value.quietMs
            : getChatgptMutationQuietMs(value.action),
      }))
      .filter((value) => value.at > 0);
  }
  if (Array.isArray(state?.recentMutationAts) && state.recentMutationAts.length > 0) {
    return state.recentMutationAts
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
      .map((at) => ({
        at,
        weight: 1,
        quietMs: CHATGPT_POST_COMMIT_BASE_QUIET_MS,
      }));
  }
  return [];
}

export function pruneChatgptMutationRecords(
  history:
    | readonly ChatgptMutationRecord[]
    | readonly number[]
    | null
    | undefined,
  now = Date.now(),
  windowMs = CHATGPT_MUTATION_WINDOW_MS,
): ChatgptMutationRecord[] {
  const cutoff = now - Math.max(0, windowMs);
  const normalized = Array.isArray(history)
    ? history.map((value) =>
        typeof value === 'number'
          ? { at: value, weight: 1, quietMs: CHATGPT_POST_COMMIT_BASE_QUIET_MS }
          : {
              at: typeof value.at === 'number' && Number.isFinite(value.at) ? value.at : 0,
              action: typeof value.action === 'string' ? value.action : undefined,
              weight:
                typeof value.weight === 'number' && Number.isFinite(value.weight)
                  ? value.weight
                  : getChatgptMutationWeight(value.action),
              quietMs:
                typeof value.quietMs === 'number' && Number.isFinite(value.quietMs)
                  ? value.quietMs
                  : getChatgptMutationQuietMs(value.action),
            },
      )
    : [];
  return normalized
    .filter((value) => value.at > cutoff && Number.isFinite(value.at))
    .sort((left, right) => left.at - right.at);
}

export function appendChatgptMutationTimestamp(
  history: readonly number[] | null | undefined,
  now = Date.now(),
  windowMs = CHATGPT_MUTATION_WINDOW_MS,
): number[] {
  return pruneChatgptMutationHistory([...(history ?? []), now], now, windowMs);
}

export function appendChatgptMutationRecord(
  history:
    | readonly ChatgptMutationRecord[]
    | readonly number[]
    | null
    | undefined,
  action?: string | null,
  now = Date.now(),
  windowMs = CHATGPT_MUTATION_WINDOW_MS,
): ChatgptMutationRecord[] {
  const normalizedHistory = pruneChatgptMutationRecords(history, now, windowMs);
  return pruneChatgptMutationRecords(
    [
      ...normalizedHistory,
      {
        at: now,
        action: typeof action === 'string' ? action : undefined,
        weight: getChatgptMutationWeight(action),
        quietMs: getChatgptMutationQuietMs(action),
      },
    ],
    now,
    windowMs,
  );
}

export function getChatgptMutationBudgetWaitMs(
  state: Pick<ChatgptRateLimitGuardState, 'recentMutations' | 'recentMutationAts'> | null | undefined,
  now = Date.now(),
  options: {
    windowMs?: number;
    maxWeight?: number;
  } = {},
): number {
  const windowMs = options.windowMs ?? CHATGPT_MUTATION_WINDOW_MS;
  const maxWeight = options.maxWeight ?? CHATGPT_MUTATION_MAX_WEIGHT;
  if (maxWeight <= 0) {
    return 0;
  }
  const history = pruneChatgptMutationRecords(normalizeChatgptMutationRecords(state), now, windowMs);
  if (history.length === 0) {
    return 0;
  }
  let totalWeight = history.reduce((sum, record) => sum + (record.weight ?? 1), 0);
  if (totalWeight <= maxWeight) {
    return 0;
  }
  for (const record of history) {
    totalWeight -= record.weight ?? 1;
    if (totalWeight <= maxWeight) {
      return Math.max(0, record.at + windowMs - now);
    }
  }
  const lastRecord = history[history.length - 1];
  return lastRecord ? Math.max(0, lastRecord.at + windowMs - now) : 0;
}

export function getChatgptPostCommitQuietWaitMs(
  state: Pick<ChatgptRateLimitGuardState, 'recentMutations' | 'recentMutationAts'> | null | undefined,
  now = Date.now(),
  options: {
    windowMs?: number;
    jitterMaxMs?: number;
    quietScale?: number;
  } = {},
): number {
  const windowMs = options.windowMs ?? CHATGPT_MUTATION_WINDOW_MS;
  const jitterMaxMs = options.jitterMaxMs ?? CHATGPT_POST_COMMIT_JITTER_MAX_MS;
  const quietScale =
    typeof options.quietScale === 'number' && Number.isFinite(options.quietScale) && options.quietScale > 0
      ? options.quietScale
      : 1;
  const history = pruneChatgptMutationRecords(normalizeChatgptMutationRecords(state), now, windowMs);
  const lastRecord = history[history.length - 1];
  if (!lastRecord) {
    return 0;
  }
  const baseQuietMs =
    (typeof lastRecord.quietMs === 'number' ? lastRecord.quietMs : CHATGPT_POST_COMMIT_BASE_QUIET_MS) * quietScale;
  const totalWeight = history.reduce((sum, record) => sum + (record.weight ?? 1), 0);
  let extraQuietMs = 0;
  if (totalWeight > 2) extraQuietMs += 4_000;
  if (totalWeight > 4) extraQuietMs += 10_000;
  if (totalWeight > 6) extraQuietMs += 20_000;
  extraQuietMs *= quietScale;
  const jitterMs = getChatgptMutationQuietJitterMs(lastRecord.action, history.length, jitterMaxMs);
  return Math.max(0, lastRecord.at + baseQuietMs + extraQuietMs + jitterMs - now);
}
