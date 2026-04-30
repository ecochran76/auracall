import path from 'node:path';

import type {
  BrowserOperationAcquireInput,
  BrowserOperationRecord,
  BrowserOperationKeyInput,
} from '../../packages/browser-service/src/service/operationDispatcher.js';
import { buildBrowserOperationKey } from '../../packages/browser-service/src/service/operationDispatcher.js';

export type BrowserOperationQueueObservationEvent =
  | 'queued'
  | 'acquired'
  | 'busy-timeout';

export interface BrowserOperationQueueObservation {
  event: BrowserOperationQueueObservationEvent;
  at: string;
  key: string;
  requested?: BrowserOperationQueueRequestSummary | null;
  operation: BrowserOperationQueueRecordSummary | null;
  blockedBy: BrowserOperationQueueRecordSummary | null;
  attempt: number | null;
  elapsedMs: number | null;
}

export interface BrowserOperationQueueRequestSummary {
  kind: BrowserOperationRecord['kind'];
  operationClass: BrowserOperationRecord['operationClass'];
  ownerPid: number;
  ownerCommand: string | null;
  managedProfileDir: string | null;
  serviceTarget: string | null;
}

export interface BrowserOperationQueueRecordSummary {
  id: string;
  kind: BrowserOperationRecord['kind'];
  operationClass: BrowserOperationRecord['operationClass'];
  ownerPid: number;
  ownerCommand: string | null;
  startedAt: string;
  updatedAt: string;
}

export interface BrowserOperationQueueObservationSummary {
  total: number;
  items: BrowserOperationQueueObservation[];
  latest: BrowserOperationQueueObservation | null;
}

const MAX_OBSERVATIONS_PER_KEY = 50;
const observationsByKey = new Map<string, BrowserOperationQueueObservation[]>();

export function recordBrowserOperationQueueObservation(input: {
  event: BrowserOperationQueueObservationEvent;
  key: string;
  requested?: BrowserOperationAcquireInput | null;
  operation?: BrowserOperationRecord | null;
  blockedBy?: BrowserOperationRecord | null;
  attempt?: number | null;
  elapsedMs?: number | null;
  at?: string;
}): BrowserOperationQueueObservation {
  const observation: BrowserOperationQueueObservation = {
    event: input.event,
    at: input.at ?? new Date().toISOString(),
    key: input.key,
    requested: summarizeOperationRequest(input.requested ?? null),
    operation: summarizeOperationRecord(input.operation ?? null),
    blockedBy: summarizeOperationRecord(input.blockedBy ?? null),
    attempt: typeof input.attempt === 'number' && Number.isFinite(input.attempt) ? Math.trunc(input.attempt) : null,
    elapsedMs: typeof input.elapsedMs === 'number' && Number.isFinite(input.elapsedMs) ? Math.max(0, Math.trunc(input.elapsedMs)) : null,
  };
  const observations = observationsByKey.get(input.key) ?? [];
  observations.push(observation);
  if (observations.length > MAX_OBSERVATIONS_PER_KEY) {
    observations.splice(0, observations.length - MAX_OBSERVATIONS_PER_KEY);
  }
  observationsByKey.set(input.key, observations);
  return observation;
}

export function summarizeBrowserOperationQueueObservations(
  keyInput: BrowserOperationKeyInput,
  limit = 20,
): BrowserOperationQueueObservationSummary {
  return summarizeBrowserOperationQueueObservationsByKey(buildBrowserOperationKey(keyInput), limit);
}

export function summarizeBrowserOperationQueueObservationsByKey(
  key: string,
  limit = 20,
): BrowserOperationQueueObservationSummary {
  const normalizedLimit = Number.isFinite(limit) ? Math.max(0, Math.trunc(limit)) : 20;
  const items = normalizedLimit > 0
    ? [...(observationsByKey.get(key) ?? [])].slice(-normalizedLimit)
    : [];
  return {
    total: items.length,
    items,
    latest: items.at(-1) ?? null,
  };
}

export function clearBrowserOperationQueueObservationsForTest(): void {
  observationsByKey.clear();
}

function summarizeOperationRequest(input: BrowserOperationAcquireInput | null): BrowserOperationQueueRequestSummary | null {
  if (!input) {
    return null;
  }
  return {
    kind: input.kind,
    operationClass: input.operationClass,
    ownerPid: input.ownerPid ?? process.pid,
    ownerCommand: input.ownerCommand ?? null,
    managedProfileDir: input.managedProfileDir ? path.resolve(input.managedProfileDir) : null,
    serviceTarget: input.serviceTarget ?? null,
  };
}

function summarizeOperationRecord(record: BrowserOperationRecord | null): BrowserOperationQueueRecordSummary | null {
  if (!record) {
    return null;
  }
  return {
    id: record.id,
    kind: record.kind,
    operationClass: record.operationClass,
    ownerPid: record.ownerPid,
    ownerCommand: record.ownerCommand ?? null,
    startedAt: record.startedAt,
    updatedAt: record.updatedAt,
  };
}
