export type BrowserResponseProgressEvidence = {
  state?: unknown;
  assistantTextChars?: unknown;
  stopVisible?: unknown;
  completionVisible?: unknown;
  dialogVisible?: unknown;
  connectionInterrupted?: unknown;
  assistantMessageId?: unknown;
  assistantTextFingerprint?: unknown;
};

export class BrowserObservationLeaseExpiredError extends Error {
  readonly browserResponseProgress: BrowserResponseProgressEvidence;

  constructor(progress: BrowserResponseProgressEvidence, cause?: unknown) {
    super('ChatGPT observation lease expired while the exact assistant turn was still generating', {
      cause,
    });
    this.name = 'BrowserObservationLeaseExpiredError';
    this.browserResponseProgress = progress;
  }
}

export const CHATGPT_OBSERVATION_RECOVERY_COOLDOWN_MS = 15 * 60_000;

export type ChatgptObservationRecoveryDecision =
  | { action: 'heartbeat'; reason: 'progress-current' }
  | { action: 'refresh'; reason: 'connection-interrupted' | 'progress-stale' }
  | { action: 'wait'; reason: 'recovery-cooldown' }
  | { action: 'none'; reason: 'generation-not-active' };

export function decideChatgptObservationRecovery(input: {
  progress: BrowserResponseProgressEvidence | null | undefined;
  nowMs: number;
  lastProgressChangeAtMs: number | null;
  lastRecoveryAtMs: number | null;
  recoveryCooldownMs?: number;
}): ChatgptObservationRecoveryDecision {
  const recoveryCooldownMs = input.recoveryCooldownMs ?? CHATGPT_OBSERVATION_RECOVERY_COOLDOWN_MS;
  const progress = input.progress;
  if (
    !progress ||
    progress.state !== 'assistant-text' ||
    typeof progress.assistantTextChars !== 'number' ||
    progress.assistantTextChars <= 0 ||
    progress.stopVisible !== true ||
    progress.completionVisible === true ||
    progress.dialogVisible === true
  ) {
    return { action: 'none', reason: 'generation-not-active' };
  }

  const progressStale =
    input.lastProgressChangeAtMs !== null &&
    input.nowMs - input.lastProgressChangeAtMs >= recoveryCooldownMs;
  const recoveryNeeded = progress.connectionInterrupted === true || progressStale;
  if (!recoveryNeeded) {
    return { action: 'heartbeat', reason: 'progress-current' };
  }
  if (
    input.lastRecoveryAtMs !== null &&
    input.nowMs - input.lastRecoveryAtMs < recoveryCooldownMs
  ) {
    return { action: 'wait', reason: 'recovery-cooldown' };
  }
  return {
    action: 'refresh',
    reason: progress.connectionInterrupted === true ? 'connection-interrupted' : 'progress-stale',
  };
}

export function readBrowserResponseProgressEvidence(
  error: unknown,
): BrowserResponseProgressEvidence | undefined {
  if (!error || typeof error !== 'object' || !('browserResponseProgress' in error)) {
    return undefined;
  }
  const progress = (error as { browserResponseProgress?: unknown }).browserResponseProgress;
  return progress && typeof progress === 'object'
    ? (progress as BrowserResponseProgressEvidence)
    : undefined;
}

export function isActiveGenerationObservationExpiry(error: unknown): boolean {
  if (
    !(error instanceof Error) ||
    (error.name !== 'SessionRunTimeoutError' && error.name !== 'BrowserObservationLeaseExpiredError')
  ) {
    return false;
  }
  const progress = readBrowserResponseProgressEvidence(error);
  return Boolean(
    progress &&
      progress.state === 'assistant-text' &&
      typeof progress.assistantTextChars === 'number' &&
      progress.assistantTextChars > 0 &&
      progress.stopVisible === true &&
      progress.completionVisible !== true &&
      progress.dialogVisible !== true,
  );
}
