export const LIVE_FOLLOW_SEVERITIES = [
  'healthy',
  'backpressured',
  'paused',
  'attention-needed',
] as const;

export type LiveFollowSeverity = typeof LIVE_FOLLOW_SEVERITIES[number];

export interface LiveFollowLatestYieldSummary {
  completedAt: string | null;
  provider: string | null;
  runtimeProfileId: string | null;
  queuedOwnerCommand: string | null;
  remainingDetailSurfaces: number | null;
}

export interface LiveFollowHealthInput {
  schedulerPosture: string | null;
  schedulerState: string | null;
  backpressureReason: string | null;
  activeCompletions: number | null;
  pausedCompletions: number | null;
  failedCompletions: number | null;
  cancelledCompletions: number | null;
  latestYield?: LiveFollowLatestYieldSummary | null;
}

export interface LiveFollowHealthSummary {
  line: string;
  severity: LiveFollowSeverity;
  schedulerPosture: string;
  schedulerState: string | null;
  backpressureReason: string;
  activeCompletions: number | null;
  pausedCompletions: number | null;
  failedCompletions: number | null;
  cancelledCompletions: number | null;
  latestYield: LiveFollowLatestYieldSummary | null;
}

export function summarizeLiveFollowHealth(input: LiveFollowHealthInput): LiveFollowHealthSummary {
  const schedulerPosture = normalizeLabel(input.schedulerPosture);
  const backpressureReason = normalizeLabel(input.backpressureReason);
  const summary: Omit<LiveFollowHealthSummary, 'line'> = {
    severity: deriveLiveFollowSeverity({
      schedulerPosture,
      backpressureReason,
      activeCompletions: input.activeCompletions,
      pausedCompletions: input.pausedCompletions,
      failedCompletions: input.failedCompletions,
      cancelledCompletions: input.cancelledCompletions,
    }),
    schedulerPosture,
    schedulerState: input.schedulerState,
    backpressureReason,
    activeCompletions: input.activeCompletions,
    pausedCompletions: input.pausedCompletions,
    failedCompletions: input.failedCompletions,
    cancelledCompletions: input.cancelledCompletions,
    latestYield: input.latestYield ?? null,
  };
  const yieldText = summary.latestYield
    ? `${summary.latestYield.provider ?? 'unknown'}/${summary.latestYield.runtimeProfileId ?? 'unknown'} remaining=${summary.latestYield.remainingDetailSurfaces ?? 'unknown'} queued=${summary.latestYield.queuedOwnerCommand ?? 'unknown'}`
    : 'none';
  return {
    ...summary,
    line: [
      'Live follow health:',
      `severity=${summary.severity}`,
      `posture=${summary.schedulerPosture}`,
      `state=${summary.schedulerState ?? 'unknown'}`,
      `active=${formatNullableNumber(summary.activeCompletions)}`,
      `paused=${formatNullableNumber(summary.pausedCompletions)}`,
      `failed=${formatNullableNumber(summary.failedCompletions)}`,
      `cancelled=${formatNullableNumber(summary.cancelledCompletions)}`,
      `backpressure=${summary.backpressureReason}`,
      `latestYield=${yieldText}`,
    ].join(' '),
  };
}

export function deriveLiveFollowSeverity(input: {
  schedulerPosture: string | null;
  backpressureReason: string | null;
  activeCompletions?: number | null;
  pausedCompletions: number | null;
  failedCompletions: number | null;
  cancelledCompletions: number | null;
}): LiveFollowSeverity {
  const failedCompletions = input.failedCompletions ?? 0;
  const cancelledCompletions = input.cancelledCompletions ?? 0;
  const pausedCompletions = input.pausedCompletions ?? 0;
  const activeCompletions = input.activeCompletions ?? 0;
  const schedulerPosture = normalizeLabel(input.schedulerPosture);
  const backpressureReason = normalizeLabel(input.backpressureReason);
  if (
    failedCompletions > 0
    || cancelledCompletions > 0
  ) {
    return 'attention-needed';
  }
  if (pausedCompletions > 0 || schedulerPosture === 'paused') {
    return 'paused';
  }
  if (activeCompletions > 0 && schedulerPosture === 'scheduled' && backpressureReason === 'unknown') {
    return 'healthy';
  }
  if (activeCompletions > 0 && backpressureReason === 'routine-delayed') {
    return 'healthy';
  }
  if (schedulerPosture === 'unknown' || backpressureReason === 'unknown') {
    return 'attention-needed';
  }
  if (schedulerPosture === 'backpressured' || backpressureReason !== 'none') {
    return 'backpressured';
  }
  return 'healthy';
}

function normalizeLabel(value: string | null | undefined): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : 'unknown';
}

function formatNullableNumber(value: number | null): string {
  return value === null ? 'unknown' : String(value);
}
