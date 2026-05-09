import fs from 'node:fs/promises';
import path from 'node:path';
import { createWriteStream, existsSync } from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { getAuracallHomeDir } from './auracallHome.js';

export interface LazyLiveFollowPreflightStatus {
  object: 'auracall_preflight_status';
  name: 'lazy-live-follow';
  status: 'passed' | 'failed';
  startedAt: string;
  completedAt: string;
  durationMs: number;
  failedStep: string | null;
  errorMessage: string | null;
}

export interface PreflightStatusSummary {
  lazyLiveFollow: LazyLiveFollowPreflightStatus | null;
  lazyLiveFollowRun: LazyLiveFollowPreflightRun | null;
}

export type LazyLiveFollowPreflightRunStatus = 'queued' | 'running' | 'passed' | 'failed';

export interface LazyLiveFollowPreflightRun {
  object: 'auracall_preflight_run';
  id: string;
  name: 'lazy-live-follow';
  status: LazyLiveFollowPreflightRunStatus;
  command: string;
  args: string[];
  cwd: string;
  logPath: string;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  exitCode: number | null;
  signal: string | null;
  errorMessage: string | null;
}

export interface LazyLiveFollowPreflightStartResult {
  object: 'auracall_preflight_start_result';
  accepted: boolean;
  reason: 'started' | 'already-running';
  run: LazyLiveFollowPreflightRun;
}

export interface LazyLiveFollowPreflightRunner {
  start(): Promise<LazyLiveFollowPreflightStartResult>;
  readRun(): LazyLiveFollowPreflightRun | null;
}

export function getLazyLiveFollowPreflightStatusPath(): string {
  return path.join(getAuracallHomeDir(), 'preflight', 'lazy-live-follow.json');
}

export async function readPreflightStatusSummary(
  runner?: Pick<LazyLiveFollowPreflightRunner, 'readRun'>,
): Promise<PreflightStatusSummary> {
  return {
    lazyLiveFollow: await readLazyLiveFollowPreflightStatus(),
    lazyLiveFollowRun: runner?.readRun() ?? null,
  };
}

export async function readLazyLiveFollowPreflightStatus(): Promise<LazyLiveFollowPreflightStatus | null> {
  try {
    const raw = await fs.readFile(getLazyLiveFollowPreflightStatusPath(), 'utf8');
    return parseLazyLiveFollowPreflightStatus(JSON.parse(raw));
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? String((error as NodeJS.ErrnoException).code) : '';
    if (code === 'ENOENT' || error instanceof SyntaxError) return null;
    throw error;
  }
}

export async function writeLazyLiveFollowPreflightStatus(
  status: LazyLiveFollowPreflightStatus,
): Promise<void> {
  const statusPath = getLazyLiveFollowPreflightStatusPath();
  await fs.mkdir(path.dirname(statusPath), { recursive: true });
  await fs.writeFile(statusPath, `${JSON.stringify(status, null, 2)}\n`, 'utf8');
}

export function createLazyLiveFollowPreflightRunner(): LazyLiveFollowPreflightRunner {
  let active: ChildProcess | null = null;
  let latestRun: LazyLiveFollowPreflightRun | null = null;

  return {
    async start(): Promise<LazyLiveFollowPreflightStartResult> {
      if (active && latestRun && (latestRun.status === 'queued' || latestRun.status === 'running')) {
        return {
          object: 'auracall_preflight_start_result',
          accepted: false,
          reason: 'already-running',
          run: latestRun,
        };
      }
      const command = resolveLazyLiveFollowPreflightCommand();
      const startedAt = new Date();
      const run: LazyLiveFollowPreflightRun = {
        object: 'auracall_preflight_run',
        id: `preflight_lazy_live_follow_${startedAt.toISOString().replace(/[^0-9]/g, '')}_${randomUUID().slice(0, 8)}`,
        name: 'lazy-live-follow',
        status: 'queued',
        command: command.command,
        args: command.args,
        cwd: command.cwd,
        logPath: getLazyLiveFollowPreflightRunLogPath(startedAt),
        startedAt: startedAt.toISOString(),
        completedAt: null,
        durationMs: null,
        exitCode: null,
        signal: null,
        errorMessage: null,
      };
      latestRun = run;
      queueMicrotask(() => {
        startLazyLiveFollowPreflightProcess(run, () => active, (next) => {
          active = next;
        }).catch((error) => {
          completePreflightRun(run, startedAt, {
            status: 'failed',
            errorMessage: error instanceof Error ? error.message : String(error),
          });
          active = null;
        });
      });
      return {
        object: 'auracall_preflight_start_result',
        accepted: true,
        reason: 'started',
        run,
      };
    },
    readRun(): LazyLiveFollowPreflightRun | null {
      return latestRun;
    },
  };
}

function getLazyLiveFollowPreflightRunLogPath(startedAt: Date): string {
  const stamp = startedAt.toISOString().replace(/[^0-9]/g, '');
  return path.join(getAuracallHomeDir(), 'logs', `preflight-lazy-live-follow-${stamp}.log`);
}

async function startLazyLiveFollowPreflightProcess(
  run: LazyLiveFollowPreflightRun,
  readActive: () => ChildProcess | null,
  setActive: (child: ChildProcess | null) => void,
): Promise<void> {
  if (readActive()) return;
  await fs.mkdir(path.dirname(run.logPath), { recursive: true });
  const logStream = createWriteStream(run.logPath, { flags: 'a' });
  logStream.write(`AuraCall lazy-live-follow preflight ${run.id}\n`);
  logStream.write(`$ ${[run.command, ...run.args].join(' ')}\n`);
  run.status = 'running';
  const child = spawn(run.command, run.args, {
    cwd: run.cwd,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  setActive(child);
  child.stdout?.pipe(logStream, { end: false });
  child.stderr?.pipe(logStream, { end: false });
  child.on('error', (error) => {
    completePreflightRun(run, new Date(run.startedAt), {
      status: 'failed',
      errorMessage: error.message,
    });
    setActive(null);
    logStream.end(`\npreflight process error: ${error.message}\n`);
  });
  child.on('exit', (code, signal) => {
    completePreflightRun(run, new Date(run.startedAt), {
      status: code === 0 ? 'passed' : 'failed',
      exitCode: code,
      signal,
      errorMessage: code === 0 ? null : `preflight exited with code=${code ?? 'null'} signal=${signal ?? 'null'}`,
    });
    setActive(null);
    logStream.end(`\npreflight ${run.status}: code=${code ?? 'null'} signal=${signal ?? 'null'}\n`);
  });
}

function completePreflightRun(
  run: LazyLiveFollowPreflightRun,
  startedAt: Date,
  result: {
    status: LazyLiveFollowPreflightRunStatus;
    exitCode?: number | null;
    signal?: NodeJS.Signals | string | null;
    errorMessage?: string | null;
  },
): void {
  const completedAt = new Date();
  run.status = result.status;
  run.completedAt = completedAt.toISOString();
  run.durationMs = completedAt.getTime() - startedAt.getTime();
  run.exitCode = result.exitCode ?? null;
  run.signal = result.signal ? String(result.signal) : null;
  run.errorMessage = result.errorMessage ?? null;
}

function resolveLazyLiveFollowPreflightCommand(): { command: string; args: string[]; cwd: string } {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const builtScript = path.resolve(moduleDir, '..', 'scripts', 'preflight-lazy-live-follow.js');
  if (existsSync(builtScript)) {
    return {
      command: process.execPath,
      args: [builtScript],
      cwd: path.resolve(moduleDir, '..', '..'),
    };
  }
  return {
    command: 'pnpm',
    args: ['run', 'preflight:lazy-live-follow'],
    cwd: path.resolve(moduleDir, '..'),
  };
}

function parseLazyLiveFollowPreflightStatus(raw: unknown): LazyLiveFollowPreflightStatus | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const status = readEnum(record.status, ['passed', 'failed']);
  const startedAt = readString(record.startedAt);
  const completedAt = readString(record.completedAt);
  if (
    record.object !== 'auracall_preflight_status' ||
    record.name !== 'lazy-live-follow' ||
    !status ||
    !startedAt ||
    !completedAt
  ) {
    return null;
  }
  return {
    object: 'auracall_preflight_status',
    name: 'lazy-live-follow',
    status,
    startedAt,
    completedAt,
    durationMs: readNumber(record.durationMs) ?? 0,
    failedStep: readString(record.failedStep),
    errorMessage: readString(record.errorMessage),
  };
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readEnum<const T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === 'string' && allowed.includes(value as T) ? value as T : null;
}
