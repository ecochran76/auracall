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
  lazyLiveFollowRunHistory: LazyLiveFollowPreflightRun[];
}

export type LazyLiveFollowPreflightRunStatus = 'queued' | 'running' | 'passed' | 'failed';
export type LazyLiveFollowPreflightRunStepStatus = 'running' | 'passed' | 'failed';

export interface LazyLiveFollowPreflightRunStep {
  label: string;
  status: LazyLiveFollowPreflightRunStepStatus;
  command: string | null;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  errorMessage: string | null;
}

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
  steps: LazyLiveFollowPreflightRunStep[];
}

interface LazyLiveFollowPreflightRunHistoryFile {
  object: 'auracall_preflight_run_history';
  name: 'lazy-live-follow';
  runs: LazyLiveFollowPreflightRun[];
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

export function getLazyLiveFollowPreflightRunHistoryPath(): string {
  return path.join(getAuracallHomeDir(), 'preflight', 'lazy-live-follow-runs.json');
}

export async function readPreflightStatusSummary(
  runner?: Pick<LazyLiveFollowPreflightRunner, 'readRun'>,
): Promise<PreflightStatusSummary> {
  const activeRun = runner?.readRun() ?? null;
  return {
    lazyLiveFollow: await readLazyLiveFollowPreflightStatus(),
    lazyLiveFollowRun: activeRun,
    lazyLiveFollowRunHistory: mergeActivePreflightRunHistory(
      await readLazyLiveFollowPreflightRunHistory(),
      activeRun,
    ),
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

export async function readLazyLiveFollowPreflightRunHistory(
  limit = 10,
): Promise<LazyLiveFollowPreflightRun[]> {
  try {
    const raw = await fs.readFile(getLazyLiveFollowPreflightRunHistoryPath(), 'utf8');
    const parsed = parseLazyLiveFollowPreflightRunHistory(JSON.parse(raw));
    return parsed.slice(0, Math.max(1, limit));
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? String((error as NodeJS.ErrnoException).code) : '';
    if (code === 'ENOENT' || error instanceof SyntaxError) return [];
    throw error;
  }
}

export async function recordLazyLiveFollowPreflightRun(
  run: LazyLiveFollowPreflightRun,
): Promise<void> {
  const historyPath = getLazyLiveFollowPreflightRunHistoryPath();
  const existing = await readLazyLiveFollowPreflightRunHistory(25);
  const runs = [cloneLazyLiveFollowPreflightRun(run), ...existing.filter((entry) => entry.id !== run.id)]
    .sort((left, right) => comparePreflightRunsNewestFirst(left, right))
    .slice(0, 20);
  const payload: LazyLiveFollowPreflightRunHistoryFile = {
    object: 'auracall_preflight_run_history',
    name: 'lazy-live-follow',
    runs,
  };
  await fs.mkdir(path.dirname(historyPath), { recursive: true });
  await fs.writeFile(historyPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
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
        steps: [],
      };
      latestRun = run;
      await recordLazyLiveFollowPreflightRun(run);
      queueMicrotask(() => {
        startLazyLiveFollowPreflightProcess(run, () => active, (next) => {
          active = next;
        }).catch((error) => {
          completePreflightRun(run, startedAt, {
            status: 'failed',
            errorMessage: error instanceof Error ? error.message : String(error),
          });
          recordLazyLiveFollowPreflightRun(run).catch(() => null);
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
  await recordLazyLiveFollowPreflightRun(run);
  const child = spawn(run.command, run.args, {
    cwd: run.cwd,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  setActive(child);
  const observer = createPreflightStepObserver(run);
  child.stdout?.on('data', (chunk: Buffer) => {
    logStream.write(chunk);
    observer.observe(String(chunk));
    recordLazyLiveFollowPreflightRun(run).catch(() => null);
  });
  child.stderr?.on('data', (chunk: Buffer) => {
    logStream.write(chunk);
  });
  child.on('error', (error) => {
    failActivePreflightStep(run, error.message);
    completePreflightRun(run, new Date(run.startedAt), {
      status: 'failed',
      errorMessage: error.message,
    });
    recordLazyLiveFollowPreflightRun(run).catch(() => null);
    setActive(null);
    logStream.end(`\npreflight process error: ${error.message}\n`);
  });
  child.on('exit', (code, signal) => {
    if (code === 0) {
      completeActivePreflightStep(run, 'passed');
    } else {
      failActivePreflightStep(run, `preflight exited with code=${code ?? 'null'} signal=${signal ?? 'null'}`);
    }
    completePreflightRun(run, new Date(run.startedAt), {
      status: code === 0 ? 'passed' : 'failed',
      exitCode: code,
      signal,
      errorMessage: code === 0 ? null : `preflight exited with code=${code ?? 'null'} signal=${signal ?? 'null'}`,
    });
    recordLazyLiveFollowPreflightRun(run).catch(() => null);
    setActive(null);
    logStream.end(`\npreflight ${run.status}: code=${code ?? 'null'} signal=${signal ?? 'null'}\n`);
  });
}

function createPreflightStepObserver(run: LazyLiveFollowPreflightRun): { observe(text: string): void } {
  let pending = '';
  return {
    observe(text: string): void {
      pending += text;
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? '';
      for (const line of lines) {
        observePreflightOutputLine(run, line);
      }
    },
  };
}

function observePreflightOutputLine(run: LazyLiveFollowPreflightRun, line: string): void {
  const stepMatch = /^====\s+(.+?)\s+====$/.exec(line.trim());
  if (stepMatch?.[1]) {
    completeActivePreflightStep(run, 'passed');
    run.steps.push({
      label: stepMatch[1],
      status: 'running',
      command: null,
      startedAt: new Date().toISOString(),
      completedAt: null,
      durationMs: null,
      errorMessage: null,
    });
    return;
  }
  const commandMatch = /^>>\s+(.+)$/.exec(line.trim());
  if (commandMatch?.[1]) {
    const activeStep = findActivePreflightStep(run);
    if (activeStep) activeStep.command = commandMatch[1];
  }
}

export function observeLazyLiveFollowPreflightRunOutput(
  run: LazyLiveFollowPreflightRun,
  text: string,
): void {
  for (const line of text.split(/\r?\n/)) {
    if (line) observePreflightOutputLine(run, line);
  }
}

function findActivePreflightStep(run: LazyLiveFollowPreflightRun): LazyLiveFollowPreflightRunStep | null {
  for (let index = run.steps.length - 1; index >= 0; index -= 1) {
    const step = run.steps[index];
    if (step?.status === 'running') return step;
  }
  return null;
}

function completeActivePreflightStep(
  run: LazyLiveFollowPreflightRun,
  status: Extract<LazyLiveFollowPreflightRunStepStatus, 'passed' | 'failed'>,
  errorMessage: string | null = null,
): void {
  const activeStep = findActivePreflightStep(run);
  if (!activeStep) return;
  const completedAt = new Date();
  activeStep.status = status;
  activeStep.completedAt = completedAt.toISOString();
  activeStep.durationMs = completedAt.getTime() - Date.parse(activeStep.startedAt);
  activeStep.errorMessage = errorMessage;
}

function failActivePreflightStep(run: LazyLiveFollowPreflightRun, errorMessage: string): void {
  completeActivePreflightStep(run, 'failed', errorMessage);
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

function parseLazyLiveFollowPreflightRunHistory(raw: unknown): LazyLiveFollowPreflightRun[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  const record = raw as Record<string, unknown>;
  if (record.object !== 'auracall_preflight_run_history' || record.name !== 'lazy-live-follow') {
    return [];
  }
  if (!Array.isArray(record.runs)) return [];
  return record.runs
    .map(parseLazyLiveFollowPreflightRun)
    .filter((run): run is LazyLiveFollowPreflightRun => Boolean(run))
    .sort((left, right) => comparePreflightRunsNewestFirst(left, right));
}

function parseLazyLiveFollowPreflightRun(raw: unknown): LazyLiveFollowPreflightRun | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const id = readString(record.id);
  const status = readEnum(record.status, ['queued', 'running', 'passed', 'failed']);
  const command = readString(record.command);
  const cwd = readString(record.cwd);
  const logPath = readString(record.logPath);
  const startedAt = readString(record.startedAt);
  if (
    record.object !== 'auracall_preflight_run' ||
    record.name !== 'lazy-live-follow' ||
    !id ||
    !status ||
    !command ||
    !cwd ||
    !logPath ||
    !startedAt ||
    !Array.isArray(record.args)
  ) {
    return null;
  }
  return {
    object: 'auracall_preflight_run',
    id,
    name: 'lazy-live-follow',
    status,
    command,
    args: record.args.filter((entry): entry is string => typeof entry === 'string'),
    cwd,
    logPath,
    startedAt,
    completedAt: readString(record.completedAt),
    durationMs: readNumber(record.durationMs),
    exitCode: readNumber(record.exitCode),
    signal: readString(record.signal),
    errorMessage: readString(record.errorMessage),
    steps: Array.isArray(record.steps)
      ? record.steps.map(parseLazyLiveFollowPreflightRunStep).filter((step): step is LazyLiveFollowPreflightRunStep => Boolean(step))
      : [],
  };
}

function parseLazyLiveFollowPreflightRunStep(raw: unknown): LazyLiveFollowPreflightRunStep | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const label = readString(record.label);
  const status = readEnum(record.status, ['running', 'passed', 'failed']);
  const startedAt = readString(record.startedAt);
  if (!label || !status || !startedAt) return null;
  return {
    label,
    status,
    command: readString(record.command),
    startedAt,
    completedAt: readString(record.completedAt),
    durationMs: readNumber(record.durationMs),
    errorMessage: readString(record.errorMessage),
  };
}

function mergeActivePreflightRunHistory(
  history: LazyLiveFollowPreflightRun[],
  activeRun: LazyLiveFollowPreflightRun | null,
): LazyLiveFollowPreflightRun[] {
  if (!activeRun) return history;
  return [cloneLazyLiveFollowPreflightRun(activeRun), ...history.filter((entry) => entry.id !== activeRun.id)]
    .sort((left, right) => comparePreflightRunsNewestFirst(left, right))
    .slice(0, 10);
}

function cloneLazyLiveFollowPreflightRun(run: LazyLiveFollowPreflightRun): LazyLiveFollowPreflightRun {
  return {
    ...run,
    args: [...run.args],
    steps: run.steps.map((step) => ({ ...step })),
  };
}

function comparePreflightRunsNewestFirst(
  left: LazyLiveFollowPreflightRun,
  right: LazyLiveFollowPreflightRun,
): number {
  return Date.parse(right.startedAt) - Date.parse(left.startedAt);
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
