import crypto from 'node:crypto';

export type BrowserMutationKind =
  | 'navigate'
  | 'reload'
  | 'location-assign'
  | 'target-open-or-reuse';

export type BrowserMutationPhase = 'start' | 'complete';

export type BrowserMutationOutcome = 'succeeded' | 'failed';

export interface BrowserMutationRecord {
  id: string;
  phase: BrowserMutationPhase;
  kind: BrowserMutationKind;
  source: string;
  at: string;
  requestedUrl?: string | null;
  fromUrl?: string | null;
  toUrl?: string | null;
  targetId?: string | null;
  reused?: boolean;
  reason?: string | null;
  fallbackUsed?: boolean;
  outcome?: BrowserMutationOutcome;
  error?: string | null;
}

export type BrowserMutationAuditSink = (record: BrowserMutationRecord) => void | Promise<void>;

export interface BrowserMutationLog {
  record: BrowserMutationAuditSink;
  list: () => BrowserMutationRecord[];
  clear: () => void;
}

export interface BeginBrowserMutationInput {
  kind: BrowserMutationKind;
  source: string;
  requestedUrl?: string | null;
  fromUrl?: string | null;
  toUrl?: string | null;
  targetId?: string | null;
  reused?: boolean;
  reason?: string | null;
  fallbackUsed?: boolean;
}

export function createInMemoryBrowserMutationLog(limit = 200): BrowserMutationLog {
  const history: BrowserMutationRecord[] = [];
  return {
    record: (record) => {
      history.push(record);
      if (history.length > limit) {
        history.splice(0, history.length - limit);
      }
    },
    list: () => history.slice(),
    clear: () => {
      history.length = 0;
    },
  };
}

export function beginBrowserMutation(
  sink: BrowserMutationAuditSink | null | undefined,
  input: BeginBrowserMutationInput,
): {
  id: string;
  complete: (details?: Partial<Omit<BrowserMutationRecord, 'id' | 'phase' | 'kind' | 'source' | 'at'>>) => Promise<void>;
} {
  const id = crypto.randomUUID();
  void emitBrowserMutationRecord(sink, {
    id,
    phase: 'start',
    kind: input.kind,
    source: input.source,
    at: new Date().toISOString(),
    requestedUrl: input.requestedUrl ?? null,
    fromUrl: input.fromUrl ?? null,
    toUrl: input.toUrl ?? null,
    targetId: input.targetId ?? null,
    reused: input.reused,
    reason: input.reason ?? null,
    fallbackUsed: input.fallbackUsed,
  });
  return {
    id,
    complete: async (details = {}) => {
      await emitBrowserMutationRecord(sink, {
        id,
        phase: 'complete',
        kind: input.kind,
        source: input.source,
        at: new Date().toISOString(),
        requestedUrl: input.requestedUrl ?? null,
        fromUrl: details.fromUrl ?? input.fromUrl ?? null,
        toUrl: details.toUrl ?? input.toUrl ?? null,
        targetId: details.targetId ?? input.targetId ?? null,
        reused: details.reused ?? input.reused,
        reason: details.reason ?? input.reason ?? null,
        fallbackUsed: details.fallbackUsed ?? input.fallbackUsed,
        outcome: details.outcome,
        error: details.error ?? null,
      });
    },
  };
}

async function emitBrowserMutationRecord(
  sink: BrowserMutationAuditSink | null | undefined,
  record: BrowserMutationRecord,
): Promise<void> {
  if (!sink) return;
  try {
    await sink(record);
  } catch {
    // Mutation auditing must never break the browser action itself.
  }
}
