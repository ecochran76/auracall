import fs from 'node:fs/promises';
import path from 'node:path';
import { getAuracallHomeDir } from '../auracallHome.js';
import { resolveManagedProfileRoot } from './profileStore.js';

export type SimpleProviderGuardProvider = 'gemini' | 'grok';

export type SimpleProviderGuardState = {
  provider: SimpleProviderGuardProvider;
  profile: string;
  updatedAt: number;
  lastMutationAt?: number;
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

export function resolveSimpleProviderGuardProfileName(options: {
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

export function resolveSimpleProviderGuardStatePath(options: {
  provider: SimpleProviderGuardProvider;
  profileName?: string | null;
  managedProfileDir?: string | null;
  managedProfileRoot?: string | null;
  cacheRoot?: string | null;
}): string {
  const cacheRoot = options.cacheRoot?.trim()
    ? path.resolve(options.cacheRoot.trim())
    : path.join(getAuracallHomeDir(), 'cache', 'providers');
  const profile = resolveSimpleProviderGuardProfileName(options);
  return path.join(cacheRoot, options.provider, '__runtime__', `rate-limit-${profile}.json`);
}

export async function readSimpleProviderGuardState(options: {
  provider: SimpleProviderGuardProvider;
  profileName?: string | null;
  managedProfileDir?: string | null;
  managedProfileRoot?: string | null;
  cacheRoot?: string | null;
}): Promise<SimpleProviderGuardState | null> {
  const statePath = resolveSimpleProviderGuardStatePath(options);
  try {
    const raw = await fs.readFile(statePath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<SimpleProviderGuardState>;
    return {
      provider: options.provider,
      profile: resolveSimpleProviderGuardProfileName(options),
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0,
      lastMutationAt: typeof parsed.lastMutationAt === 'number' ? parsed.lastMutationAt : undefined,
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

export async function writeSimpleProviderGuardState(
  state: SimpleProviderGuardState,
  options: {
    provider: SimpleProviderGuardProvider;
    profileName?: string | null;
    managedProfileDir?: string | null;
    managedProfileRoot?: string | null;
    cacheRoot?: string | null;
  },
): Promise<void> {
  const statePath = resolveSimpleProviderGuardStatePath(options);
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}
