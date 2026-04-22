import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { isProcessAlive } from '../processCheck.js';

export type BrowserOperationClass =
  | 'exclusive-human'
  | 'exclusive-mutating'
  | 'exclusive-probe'
  | 'shared-read';

export type BrowserOperationKind =
  | 'login'
  | 'setup'
  | 'doctor'
  | 'features'
  | 'browser-execution'
  | 'browser-tools'
  | 'unknown';

export interface BrowserOperationKeyInput {
  managedProfileDir?: string;
  serviceTarget?: string;
  rawDevTools?: BrowserOperationDevTools;
}

export interface BrowserOperationDevTools {
  host?: string;
  port?: number;
  targetId?: string;
  url?: string;
}

export interface BrowserOperationRecord extends BrowserOperationKeyInput {
  id: string;
  key: string;
  kind: BrowserOperationKind;
  operationClass: BrowserOperationClass;
  ownerPid: number;
  ownerCommand?: string;
  startedAt: string;
  updatedAt: string;
  devTools?: BrowserOperationDevTools;
}

export interface BrowserOperationAcquireInput extends BrowserOperationKeyInput {
  kind: BrowserOperationKind;
  operationClass: BrowserOperationClass;
  ownerPid?: number;
  ownerCommand?: string;
  devTools?: BrowserOperationDevTools;
}

export interface BrowserOperationBusyResult {
  acquired: false;
  key: string;
  blockedBy: BrowserOperationRecord;
  recovery: string;
}

export interface BrowserOperationAcquiredResult {
  acquired: true;
  operation: BrowserOperationRecord;
  release: () => Promise<void>;
}

export type BrowserOperationAcquireResult =
  | BrowserOperationAcquiredResult
  | BrowserOperationBusyResult;

export interface BrowserOperationDispatcher {
  acquire(input: BrowserOperationAcquireInput): Promise<BrowserOperationAcquireResult>;
  getActive(key: string): Promise<BrowserOperationRecord | null>;
}

export interface BrowserOperationDispatcherOptions {
  now?: () => Date;
  isOwnerAlive?: (pid: number) => boolean;
}

export interface FileBackedBrowserOperationDispatcherOptions extends BrowserOperationDispatcherOptions {
  lockRoot: string;
}

const BUSY_RECOVERY =
  'Wait for the active browser operation to finish, or close the stale browser/service process before retrying.';

export function buildBrowserOperationKey(input: BrowserOperationKeyInput): string {
  if (input.managedProfileDir) {
    const managedProfileDir = path.resolve(input.managedProfileDir);
    const serviceTarget = normalizeServiceTarget(input.serviceTarget ?? 'unknown');
    return `managed-profile:${managedProfileDir}::service:${serviceTarget}`;
  }
  if (input.rawDevTools?.port) {
    const host = normalizeDevToolsHost(input.rawDevTools.host);
    return `devtools:${host}:${input.rawDevTools.port}`;
  }
  const serviceTarget = normalizeServiceTarget(input.serviceTarget ?? 'unknown');
  const managedProfileDir = path.resolve('unknown');
  return `managed-profile:${managedProfileDir}::service:${serviceTarget}`;
}

export function normalizeServiceTarget(serviceTarget: string): string {
  const normalized = serviceTarget.trim().toLowerCase();
  return normalized || 'unknown';
}

export function normalizeDevToolsHost(host: string | null | undefined): string {
  const normalized = String(host ?? '').trim().toLowerCase();
  return normalized || '127.0.0.1';
}

export function createBrowserOperationDispatcher(
  options: BrowserOperationDispatcherOptions = {},
): BrowserOperationDispatcher {
  return new InMemoryBrowserOperationDispatcher(options);
}

export function createFileBackedBrowserOperationDispatcher(
  options: FileBackedBrowserOperationDispatcherOptions,
): BrowserOperationDispatcher {
  return new FileBackedBrowserOperationDispatcher(options);
}

export function formatBrowserOperationBusyResult(result: BrowserOperationBusyResult): string {
  const active = result.blockedBy;
  const devTools = active.devTools?.port
    ? ` devtools=${active.devTools.host ?? '127.0.0.1'}:${active.devTools.port}`
    : '';
  return [
    `Browser operation busy for ${result.key}.`,
    `Active operation: id=${active.id} kind=${active.kind} class=${active.operationClass} pid=${active.ownerPid}${devTools}.`,
    result.recovery,
  ].join(' ');
}

export function isBrowserOperationConflict(
  active: BrowserOperationRecord,
  requested: BrowserOperationAcquireInput,
): boolean {
  return active.operationClass !== 'shared-read' || requested.operationClass !== 'shared-read';
}

class InMemoryBrowserOperationDispatcher implements BrowserOperationDispatcher {
  private readonly active = new Map<string, BrowserOperationRecord>();
  private readonly now: () => Date;
  private readonly isOwnerAlive: (pid: number) => boolean;

  constructor(options: BrowserOperationDispatcherOptions) {
    this.now = options.now ?? (() => new Date());
    this.isOwnerAlive = options.isOwnerAlive ?? isProcessAlive;
  }

  async acquire(input: BrowserOperationAcquireInput): Promise<BrowserOperationAcquireResult> {
    const key = buildBrowserOperationKey(input);
    const existing = this.active.get(key);
    if (existing && this.isOwnerAlive(existing.ownerPid) && isBrowserOperationConflict(existing, input)) {
      return busyResult(key, existing);
    }
    if (existing && !this.isOwnerAlive(existing.ownerPid)) {
      this.active.delete(key);
    }

    const operation = buildOperationRecord(input, key, this.now());
    this.active.set(key, operation);
    return {
      acquired: true,
      operation,
      release: async () => {
        if (this.active.get(key)?.id === operation.id) {
          this.active.delete(key);
        }
      },
    };
  }

  async getActive(key: string): Promise<BrowserOperationRecord | null> {
    const existing = this.active.get(key) ?? null;
    if (existing && !this.isOwnerAlive(existing.ownerPid)) {
      this.active.delete(key);
      return null;
    }
    return existing;
  }
}

class FileBackedBrowserOperationDispatcher implements BrowserOperationDispatcher {
  private readonly lockRoot: string;
  private readonly now: () => Date;
  private readonly isOwnerAlive: (pid: number) => boolean;

  constructor(options: FileBackedBrowserOperationDispatcherOptions) {
    this.lockRoot = options.lockRoot;
    this.now = options.now ?? (() => new Date());
    this.isOwnerAlive = options.isOwnerAlive ?? isProcessAlive;
  }

  async acquire(input: BrowserOperationAcquireInput): Promise<BrowserOperationAcquireResult> {
    const key = buildBrowserOperationKey(input);
    const lockPath = this.lockPathForKey(key);
    await fs.mkdir(this.lockRoot, { recursive: true });

    while (true) {
      const operation = buildOperationRecord(input, key, this.now());
      try {
        const handle = await fs.open(lockPath, 'wx');
        await handle.writeFile(JSON.stringify(operation, null, 2), 'utf8');
        await handle.close();
        return {
          acquired: true,
          operation,
          release: async () => {
            await this.release(lockPath, operation.id);
          },
        };
      } catch (error) {
        if (!isNodeError(error, 'EEXIST')) {
          throw error;
        }
        const existing = await this.readLock(lockPath);
        if (!existing) {
          await fs.rm(lockPath, { force: true });
          continue;
        }
        if (!this.isOwnerAlive(existing.ownerPid)) {
          await fs.rm(lockPath, { force: true });
          continue;
        }
        if (isBrowserOperationConflict(existing, input)) {
          return busyResult(key, existing);
        }
        return busyResult(key, existing);
      }
    }
  }

  async getActive(key: string): Promise<BrowserOperationRecord | null> {
    const lockPath = this.lockPathForKey(key);
    const existing = await this.readLock(lockPath);
    if (!existing) return null;
    if (!this.isOwnerAlive(existing.ownerPid)) {
      await fs.rm(lockPath, { force: true });
      return null;
    }
    return existing;
  }

  private async release(lockPath: string, operationId: string): Promise<void> {
    const existing = await this.readLock(lockPath);
    if (existing?.id === operationId) {
      await fs.rm(lockPath, { force: true });
    }
  }

  private async readLock(lockPath: string): Promise<BrowserOperationRecord | null> {
    try {
      const raw = await fs.readFile(lockPath, 'utf8');
      return JSON.parse(raw) as BrowserOperationRecord;
    } catch {
      return null;
    }
  }

  private lockPathForKey(key: string): string {
    const digest = crypto.createHash('sha256').update(key).digest('hex');
    return path.join(this.lockRoot, `${digest}.json`);
  }
}

function buildOperationRecord(
  input: BrowserOperationAcquireInput,
  key: string,
  now: Date,
): BrowserOperationRecord {
  const timestamp = now.toISOString();
  return {
    id: crypto.randomUUID(),
    key,
    kind: input.kind,
    operationClass: input.operationClass,
    managedProfileDir: input.managedProfileDir ? path.resolve(input.managedProfileDir) : undefined,
    serviceTarget: normalizeServiceTarget(input.serviceTarget ?? (input.rawDevTools ? 'raw-devtools' : 'unknown')),
    rawDevTools: input.rawDevTools,
    ownerPid: input.ownerPid ?? process.pid,
    ownerCommand: input.ownerCommand,
    startedAt: timestamp,
    updatedAt: timestamp,
    devTools: input.devTools,
  };
}

function busyResult(key: string, blockedBy: BrowserOperationRecord): BrowserOperationBusyResult {
  return {
    acquired: false,
    key,
    blockedBy,
    recovery: BUSY_RECOVERY,
  };
}

function isNodeError(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === code);
}
