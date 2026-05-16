import { createRunArchiveService } from './archiveService.js';

let refreshInFlight: Promise<void> | null = null;
let refreshQueue: Promise<void> = Promise.resolve();

export interface RefreshRunArchiveIndexOptions {
  responseId?: string | null;
  batchId?: string | null;
  mediaGenerationId?: string | null;
  onError?: (error: unknown) => void;
}

export function refreshRunArchiveIndexBestEffort(options: RefreshRunArchiveIndexOptions = {}): Promise<void> {
  const targetedRefresh = createTargetedRefreshTask(options);
  if (targetedRefresh) {
    return enqueueArchiveRefresh(targetedRefresh, options.onError);
  }
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = enqueueArchiveRefresh(
    () => createRunArchiveService().backfillIndex().then(() => undefined),
    options.onError,
  ).finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

function enqueueArchiveRefresh(task: () => Promise<void>, onError?: (error: unknown) => void): Promise<void> {
  const queued = refreshQueue
    .then(task, task)
    .catch((error) => {
      onError?.(error);
    });
  refreshQueue = queued.catch(() => undefined);
  return queued;
}

function createTargetedRefreshTask(options: RefreshRunArchiveIndexOptions): (() => Promise<void>) | null {
  if (options.responseId) {
    return () => createRunArchiveService().upsertResponseItems(options.responseId as string).then(() => undefined);
  }
  if (options.batchId) {
    return () => createRunArchiveService().upsertBatchItems(options.batchId as string).then(() => undefined);
  }
  if (options.mediaGenerationId) {
    return () =>
      createRunArchiveService().upsertMediaGenerationItems(options.mediaGenerationId as string).then(() => undefined);
  }
  return null;
}
