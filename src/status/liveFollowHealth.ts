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
  targets?: LiveFollowTargetRollup | null;
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
  targets: LiveFollowTargetRollup | null;
}

export interface LiveFollowTargetRollup {
  total: number;
  enabled: number;
  disabled: number;
  unconfigured: number;
  missingIdentity: number;
  unsupported: number;
  active: number;
  queued: number;
  running: number;
  paused: number;
  attentionNeeded: number;
  complete: number;
  inProgress: number;
  none: number;
  unknown: number;
  desired: LiveFollowDesiredTargetRollup;
  actual: LiveFollowActualTargetRollup;
  accounts: LiveFollowTargetAccountSummary[];
}

export interface LiveFollowDesiredTargetRollup {
  total: number;
  enabled: number;
  disabled: number;
  unconfigured: number;
  missingIdentity: number;
  unsupported: number;
}

export interface LiveFollowActualTargetRollup {
  active: number;
  queued: number;
  running: number;
  paused: number;
  attentionNeeded: number;
  complete: number;
  inProgress: number;
  none: number;
  unknown: number;
}

export interface LiveFollowTargetAccountSummary {
  provider: string;
  runtimeProfileId: string;
  desiredState: string;
  desiredEnabled: boolean;
  actualStatus: string | null;
  phase: string | null;
  passCount: number | null;
  routineEligibleAt: string | null;
  activeCompletionNextAttemptAt: string | null;
  nextAttemptAt: string | null;
  mirrorCompleteness: string | null;
  latestLifecycleEvent: {
    at: string | null;
    type: string | null;
    message: string | null;
  } | null;
  metadataCounts: {
    projects: number;
    conversations: number;
    artifacts: number;
    files: number;
    media: number;
  } | null;
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
      targets: input.targets ?? null,
    }),
    schedulerPosture,
    schedulerState: input.schedulerState,
    backpressureReason,
    activeCompletions: input.activeCompletions,
    pausedCompletions: input.pausedCompletions,
    failedCompletions: input.failedCompletions,
    cancelledCompletions: input.cancelledCompletions,
    latestYield: input.latestYield ?? null,
    targets: input.targets ?? null,
  };
  const yieldText = summary.latestYield
    ? `${summary.latestYield.provider ?? 'unknown'}/${summary.latestYield.runtimeProfileId ?? 'unknown'} remaining=${summary.latestYield.remainingDetailSurfaces ?? 'unknown'} queued=${summary.latestYield.queuedOwnerCommand ?? 'unknown'}`
    : 'none';
  const activityFields = summary.targets
    ? [
        `enabled=${summary.targets.enabled}`,
        `active=${summary.targets.active}`,
        `paused=${summary.targets.paused}`,
        `attention=${summary.targets.attentionNeeded}`,
      ]
    : [
        `active=${formatNullableNumber(summary.activeCompletions)}`,
        `paused=${formatNullableNumber(summary.pausedCompletions)}`,
        `failed=${formatNullableNumber(summary.failedCompletions)}`,
        `cancelled=${formatNullableNumber(summary.cancelledCompletions)}`,
      ];
  return {
    ...summary,
    line: [
      'Live follow health:',
      `severity=${summary.severity}`,
      `posture=${summary.schedulerPosture}`,
      `state=${summary.schedulerState ?? 'unknown'}`,
      ...activityFields,
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
  targets?: LiveFollowTargetRollup | null;
}): LiveFollowSeverity {
  const failedCompletions = input.failedCompletions ?? 0;
  const cancelledCompletions = input.cancelledCompletions ?? 0;
  const pausedCompletions = input.pausedCompletions ?? 0;
  const activeCompletions = input.activeCompletions ?? 0;
  const schedulerPosture = normalizeLabel(input.schedulerPosture);
  const backpressureReason = normalizeLabel(input.backpressureReason);
  if (input.targets && input.targets.enabled > 0) {
    if (input.targets.attentionNeeded > 0 || input.targets.missingIdentity > 0) {
      return 'attention-needed';
    }
    if (input.targets.paused > 0 || schedulerPosture === 'paused') {
      return 'paused';
    }
    if (input.targets.active > 0 || input.targets.complete + input.targets.inProgress >= input.targets.enabled) {
      return 'healthy';
    }
  }
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
