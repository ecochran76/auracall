import type {
  AccountMirrorStatusEntry,
  AccountMirrorStatusRegistry,
  AccountMirrorStatusState,
} from './statusRegistry.js';
import type { AccountMirrorProvider } from './politePolicy.js';

export const DEFAULT_ACCOUNT_MIRROR_PROVIDER_GUARD_CLEAR_COOLDOWN_MS = 30 * 60_000;

export interface ClearAccountMirrorProviderGuardInput {
  registry: AccountMirrorStatusRegistry;
  provider: AccountMirrorProvider;
  runtimeProfileId: string;
  cooldownMs?: number | null;
  now?: () => Date;
}

export interface ClearAccountMirrorProviderGuardResult {
  kind: 'account-mirror-provider-guard';
  action: 'clear';
  provider: AccountMirrorProvider;
  runtimeProfileId: string;
  cooldownUntil: string | null;
  statusEntry: AccountMirrorStatusEntry | null;
}

export function clearAccountMirrorProviderGuard(
  input: ClearAccountMirrorProviderGuardInput,
): ClearAccountMirrorProviderGuardResult {
  const nowDate = input.now?.() ?? new Date();
  const nowMs = nowDate.getTime();
  const cooldownMs = normalizeCooldownMs(input.cooldownMs);
  const cooldownUntilMs = cooldownMs > 0 ? nowMs + cooldownMs : null;
  const prior = input.registry.readStatus({
    provider: input.provider,
    runtimeProfileId: input.runtimeProfileId,
  }).entries[0]?.providerGuard;
  const priorDetectedAtMs = prior?.detectedAt ? Date.parse(prior.detectedAt) : NaN;
  const providerGuard: AccountMirrorStatusState['providerGuard'] = cooldownUntilMs
    ? {
        state: 'cooldown',
        kind: prior?.kind ?? 'unknown',
        summary: 'Operator cleared provider guard; quiet cooldown before automation resumes.',
        detectedAtMs: Number.isFinite(priorDetectedAtMs) ? priorDetectedAtMs : nowMs,
        clearedAtMs: nowMs,
        cooldownUntilMs,
        url: prior?.url ?? null,
        action: 'operator-clear',
      }
    : null;
  input.registry.mergeState(
    {
      provider: input.provider,
      runtimeProfileId: input.runtimeProfileId,
    },
    {
      providerGuard,
      providerHardStopAtMs: null,
      providerCooldownUntilMs: cooldownUntilMs,
      queued: false,
      running: false,
    },
  );
  const statusEntry = input.registry.readStatus({
    provider: input.provider,
    runtimeProfileId: input.runtimeProfileId,
  }).entries[0] ?? null;
  return {
    kind: 'account-mirror-provider-guard',
    action: 'clear',
    provider: input.provider,
    runtimeProfileId: input.runtimeProfileId,
    cooldownUntil: cooldownUntilMs ? new Date(cooldownUntilMs).toISOString() : null,
    statusEntry,
  };
}

function normalizeCooldownMs(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_ACCOUNT_MIRROR_PROVIDER_GUARD_CLEAR_COOLDOWN_MS;
  }
  return Math.max(0, Math.trunc(value));
}
