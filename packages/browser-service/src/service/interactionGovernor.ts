export type BrowserInteractionClass =
  | 'conversation-read'
  | 'page-refresh'
  | 'renavigation'
  | 'upload-submit'
  | 'provider-recovery'
  | 'generic';

export interface BrowserInteractionGovernor {
  beforeInteraction(kind?: BrowserInteractionClass): Promise<void>;
}

export interface BrowserInteractionGovernorPolicy {
  maxInteractionsPerMinute?: number | null;
  cooldownsByClass?: Partial<Record<BrowserInteractionClass, number | null | undefined>>;
  abortSignal?: AbortSignal | null;
  now?: () => number;
  sleep?: (ms: number, signal?: AbortSignal | null) => Promise<void>;
}

export function createBrowserInteractionGovernor(
  policy: BrowserInteractionGovernorPolicy = {},
): BrowserInteractionGovernor {
  const maxPerMinute =
    typeof policy.maxInteractionsPerMinute === 'number' &&
    Number.isFinite(policy.maxInteractionsPerMinute)
      ? Math.max(1, Math.floor(policy.maxInteractionsPerMinute))
      : 20;
  const minSpacingMs = Math.ceil(60_000 / maxPerMinute);
  const now = policy.now ?? Date.now;
  const sleep = policy.sleep ?? sleepWithAbort;
  let lastInteractionAtMs = 0;
  const lastByClass = new Map<BrowserInteractionClass, number>();

  return {
    async beforeInteraction(kind = 'generic') {
      throwIfAborted(policy.abortSignal);
      const nowMs = now();
      const globalWaitMs =
        lastInteractionAtMs > 0 ? Math.max(0, lastInteractionAtMs + minSpacingMs - nowMs) : 0;
      const classCooldownMs = normalizeCooldownMs(policy.cooldownsByClass?.[kind]);
      const lastClassInteractionAtMs = lastByClass.get(kind);
      const classWaitMs =
        lastClassInteractionAtMs === undefined
          ? 0
          : Math.max(0, lastClassInteractionAtMs + classCooldownMs - nowMs);
      const waitMs = Math.max(globalWaitMs, classWaitMs);
      if (waitMs > 0) {
        await sleep(waitMs, policy.abortSignal);
      }
      const observedAtMs = now();
      lastInteractionAtMs = observedAtMs;
      lastByClass.set(kind, observedAtMs);
    },
  };
}

function normalizeCooldownMs(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function throwIfAborted(signal: AbortSignal | null | undefined): void {
  if (!signal?.aborted) return;
  const reason = signal.reason;
  throw reason instanceof Error ? reason : new Error('Browser interaction was aborted.');
}

function sleepWithAbort(ms: number, signal?: AbortSignal | null): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const onAbort = () => {
      cleanup();
      const reason = signal?.reason;
      reject(reason instanceof Error ? reason : new Error('Browser interaction was aborted.'));
    };
    const cleanup = () => {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) {
      onAbort();
    }
  });
}
