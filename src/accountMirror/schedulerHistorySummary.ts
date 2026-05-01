import type { AccountMirrorSchedulerPassHistory } from './schedulerLedger.js';
import type { AccountMirrorSchedulerPassResult } from './schedulerService.js';

export interface AccountMirrorSchedulerCompactHistory {
  object: 'account_mirror_scheduler_history';
  updatedAt: string | null;
  limit: number;
  entries: AccountMirrorSchedulerCompactEntry[];
  latestYield: AccountMirrorSchedulerYieldEvent | null;
  yieldEvents: AccountMirrorSchedulerYieldEvent[];
}

export interface AccountMirrorSchedulerCompactEntry {
  completedAt: string;
  startedAt: string;
  mode: AccountMirrorSchedulerPassResult['mode'];
  action: AccountMirrorSchedulerPassResult['action'];
  provider: string | null;
  runtimeProfileId: string | null;
  backpressureReason: string;
  backpressureMessage: string | null;
  remainingDetailSurfaces: number | null;
  yielded: boolean;
}

export interface AccountMirrorSchedulerYieldEvent {
  completedAt: string;
  provider: string | null;
  runtimeProfileId: string | null;
  backpressureMessage: string | null;
  queuedWork: {
    observedAt: string | null;
    ownerCommand: string | null;
    kind: string | null;
    operationClass: string | null;
  };
  resumeCursor: {
    nextProjectIndex: number;
    nextConversationIndex: number;
    detailReadLimit: number;
    scannedProjects: number;
    scannedConversations: number;
  } | null;
  remainingDetailSurfaces: {
    projects: number;
    conversations: number;
    total: number;
  } | null;
}

export function summarizeAccountMirrorSchedulerHistory(
  history: AccountMirrorSchedulerPassHistory,
  options: { limit?: number | null } = {},
): AccountMirrorSchedulerCompactHistory {
  const limit = normalizeLimit(options.limit, history.limit);
  const entries = history.entries.slice(0, limit).map(summarizePass);
  const yieldEvents = history.entries
    .map(createYieldEvent)
    .filter((event): event is AccountMirrorSchedulerYieldEvent => event !== null)
    .slice(0, limit);
  return {
    object: 'account_mirror_scheduler_history',
    updatedAt: history.updatedAt,
    limit,
    entries,
    latestYield: yieldEvents[0] ?? null,
    yieldEvents,
  };
}

function summarizePass(pass: AccountMirrorSchedulerPassResult): AccountMirrorSchedulerCompactEntry {
  return {
    completedAt: pass.completedAt,
    startedAt: pass.startedAt,
    mode: pass.mode,
    action: pass.action,
    provider: pass.selectedTarget?.provider ?? pass.refresh?.provider ?? null,
    runtimeProfileId: pass.selectedTarget?.runtimeProfileId ?? pass.refresh?.runtimeProfileId ?? null,
    backpressureReason: pass.backpressure.reason,
    backpressureMessage: pass.backpressure.message,
    remainingDetailSurfaces: pass.refresh?.mirrorCompleteness.remainingDetailSurfaces?.total
      ?? pass.selectedTarget?.mirrorCompleteness.remainingDetailSurfaces?.total
      ?? null,
    yielded: pass.backpressure.reason === 'yielded-to-queued-work',
  };
}

function createYieldEvent(pass: AccountMirrorSchedulerPassResult): AccountMirrorSchedulerYieldEvent | null {
  if (pass.backpressure.reason !== 'yielded-to-queued-work') {
    return null;
  }
  const inventory = pass.refresh?.metadataEvidence?.attachmentInventory ?? null;
  const remaining = pass.refresh?.mirrorCompleteness.remainingDetailSurfaces ?? null;
  return {
    completedAt: pass.completedAt,
    provider: pass.selectedTarget?.provider ?? pass.refresh?.provider ?? null,
    runtimeProfileId: pass.selectedTarget?.runtimeProfileId ?? pass.refresh?.runtimeProfileId ?? null,
    backpressureMessage: pass.backpressure.message,
    queuedWork: {
      observedAt: inventory?.yieldCause?.observedAt ?? null,
      ownerCommand: inventory?.yieldCause?.ownerCommand ?? null,
      kind: inventory?.yieldCause?.kind ?? null,
      operationClass: inventory?.yieldCause?.operationClass ?? null,
    },
    resumeCursor: inventory
      ? {
          nextProjectIndex: inventory.nextProjectIndex,
          nextConversationIndex: inventory.nextConversationIndex,
          detailReadLimit: inventory.detailReadLimit,
          scannedProjects: inventory.scannedProjects,
          scannedConversations: inventory.scannedConversations,
        }
      : null,
    remainingDetailSurfaces: remaining
      ? {
          projects: remaining.projects,
          conversations: remaining.conversations,
          total: remaining.total,
        }
      : null,
  };
}

function normalizeLimit(value: number | null | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return Math.max(1, Math.min(50, fallback));
  }
  return Math.max(1, Math.min(50, Math.floor(value)));
}
