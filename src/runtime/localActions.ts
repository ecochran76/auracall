import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import type { ExecuteLocalActionRequestContext, ExecuteLocalActionRequestResult } from './runner.js';

const execFileAsync = promisify(execFile);

export type LocalActionComplexityStage = 'bounded-command' | 'repo-automation' | 'extended';

export interface LocalActionExecutionPolicy {
  complexityStage: LocalActionComplexityStage;
  allowedShellCommands: string[];
  allowedCwdRoots: string[];
  defaultShellActionTimeoutMs: number;
  maxShellActionTimeoutMs: number;
  maxCaptureChars: number;
}

export const DEFAULT_LOCAL_ACTION_EXECUTION_POLICY: LocalActionExecutionPolicy = {
  complexityStage: 'bounded-command',
  allowedShellCommands: ['node', 'npm', 'pnpm', 'git'],
  allowedCwdRoots: [process.cwd()],
  defaultShellActionTimeoutMs: 15_000,
  maxShellActionTimeoutMs: 120_000,
  maxCaptureChars: 8_000,
};

export async function executeBuiltInLocalActionRequest(
  context: ExecuteLocalActionRequestContext,
  policy: LocalActionExecutionPolicy = DEFAULT_LOCAL_ACTION_EXECUTION_POLICY,
): Promise<ExecuteLocalActionRequestResult> {
  const resolvedPolicy = resolveShellExecutionPolicy(context, policy);
  const request = context.request;
  if (request.kind !== 'shell') {
    return {
      status: 'rejected',
      summary: `built-in executor does not support local action kind ${request.kind}`,
      payload: {
        supportedKinds: ['shell'],
      },
    };
  }

  if (!request.command) {
    return {
      status: 'rejected',
      summary: 'shell local action requires a command',
      payload: null,
    };
  }

  const payload = request.structuredPayload;
  if (!isAllowedShellCommand(request.command, resolvedPolicy.allowedShellCommands)) {
    return {
      status: 'rejected',
      summary: `shell local action command is not allowed: ${request.command}`,
      payload: {
        allowedShellCommands: resolvedPolicy.allowedShellCommands,
        complexityStage: resolvedPolicy.complexityStage,
      },
    };
  }

  const cwdResolution = resolveAllowedCwd(payload.cwd, resolvedPolicy.allowedCwdRoots);
  if (!cwdResolution.ok) {
    return {
      status: 'rejected',
      summary: cwdResolution.summary,
      payload: {
        allowedCwdRoots: resolvedPolicy.allowedCwdRoots,
        complexityStage: resolvedPolicy.complexityStage,
      },
    };
  }

  const cwd = cwdResolution.cwd;
  const timeoutMs = clampTimeoutMs(payload.timeoutMs, resolvedPolicy);

  try {
    const { stdout, stderr } = await execFileAsync(request.command, request.args, {
      cwd,
      timeout: timeoutMs,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });
    const truncatedStdout = truncate(stdout, resolvedPolicy.maxCaptureChars);
    const truncatedStderr = truncate(stderr, resolvedPolicy.maxCaptureChars);
    return {
      status: 'executed',
      summary: `shell action executed: ${request.command}`,
      payload: {
        command: request.command,
        args: request.args,
        cwd: cwd ?? null,
        timeoutMs,
        exitCode: 0,
        stdout: truncatedStdout.value,
        stderr: truncatedStderr.value,
        stdoutTruncated: truncatedStdout.truncated,
        stderrTruncated: truncatedStderr.truncated,
      },
      sharedState: {
        notes: [`local shell action executed: ${request.command}`],
      },
    };
  } catch (error) {
    const details = normalizeExecError(error, resolvedPolicy.maxCaptureChars);
    return {
      status: 'failed',
      summary: `shell action failed: ${request.command}`,
      payload: {
        command: request.command,
        args: request.args,
        cwd: cwd ?? null,
        timeoutMs,
        ...details,
      },
      sharedState: {
        notes: [`local shell action failed: ${request.command}`],
      },
    };
  }
}

function resolveShellExecutionPolicy(
  context: ExecuteLocalActionRequestContext,
  basePolicy: LocalActionExecutionPolicy,
): LocalActionExecutionPolicy {
  const localActionPolicy = context.step.input.structuredData.localActionPolicy;
  if (!localActionPolicy || typeof localActionPolicy !== 'object' || Array.isArray(localActionPolicy)) {
    return basePolicy;
  }

  const allowedCommands = Array.isArray((localActionPolicy as { allowedCommands?: unknown }).allowedCommands)
    ? ((localActionPolicy as { allowedCommands: unknown[] }).allowedCommands.filter(
        (value): value is string => typeof value === 'string' && value.length > 0,
      ))
    : basePolicy.allowedShellCommands;
  const allowedCwdRoots = Array.isArray((localActionPolicy as { allowedCwdRoots?: unknown }).allowedCwdRoots)
    ? ((localActionPolicy as { allowedCwdRoots: unknown[] }).allowedCwdRoots.filter(
        (value): value is string => typeof value === 'string' && value.length > 0,
      ))
    : basePolicy.allowedCwdRoots;
  const complexityStage = isLocalActionComplexityStage(
    (localActionPolicy as { complexityStage?: unknown }).complexityStage,
  )
    ? (localActionPolicy as { complexityStage: LocalActionComplexityStage }).complexityStage
    : basePolicy.complexityStage;

  return {
    ...basePolicy,
    complexityStage,
    allowedShellCommands: allowedCommands,
    allowedCwdRoots,
  };
}

function clampTimeoutMs(value: unknown, policy: LocalActionExecutionPolicy): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return policy.defaultShellActionTimeoutMs;
  }
  return Math.max(1, Math.min(policy.maxShellActionTimeoutMs, Math.trunc(value)));
}

function truncate(value: string, maxCaptureChars = DEFAULT_LOCAL_ACTION_EXECUTION_POLICY.maxCaptureChars): {
  value: string;
  truncated: boolean;
} {
  if (value.length <= maxCaptureChars) {
    return { value, truncated: false };
  }
  return {
    value: value.slice(0, maxCaptureChars),
    truncated: true,
  };
}

function normalizeExecError(error: unknown, maxCaptureChars: number): Record<string, unknown> {
  if (!(error instanceof Error)) {
    return {
      message: String(error),
      exitCode: null,
      signal: null,
      timedOut: false,
      stdout: '',
      stderr: '',
      stdoutTruncated: false,
      stderrTruncated: false,
    };
  }

  const candidate = error as Error & {
    code?: string | number;
    signal?: string;
    killed?: boolean;
    stdout?: string;
    stderr?: string;
  };
  const truncatedStdout = truncate(candidate.stdout ?? '', maxCaptureChars);
  const truncatedStderr = truncate(candidate.stderr ?? '', maxCaptureChars);
  return {
    message: candidate.message,
    exitCode: typeof candidate.code === 'number' ? candidate.code : null,
    code: candidate.code ?? null,
    signal: candidate.signal ?? null,
    timedOut: candidate.killed ?? false,
    stdout: truncatedStdout.value,
    stderr: truncatedStderr.value,
    stdoutTruncated: truncatedStdout.truncated,
    stderrTruncated: truncatedStderr.truncated,
  };
}

function isAllowedShellCommand(command: string, allowedShellCommands: string[]): boolean {
  const normalized = path.basename(command).toLowerCase();
  const exact = command.toLowerCase();
  return allowedShellCommands.some((candidate) => {
    const normalizedCandidate = candidate.toLowerCase();
    return normalizedCandidate === normalized || normalizedCandidate === exact;
  });
}

function resolveAllowedCwd(
  value: unknown,
  allowedCwdRoots: string[],
): { ok: true; cwd: string } | { ok: false; summary: string } {
  const cwd = typeof value === 'string' && value.length > 0 ? value : process.cwd();
  if (!path.isAbsolute(cwd)) {
    return {
      ok: false,
      summary: 'shell local action cwd must be an absolute path',
    };
  }

  const normalizedCwd = path.resolve(cwd);
  const allowed = allowedCwdRoots.some((root) => {
    const normalizedRoot = path.resolve(root);
    return normalizedCwd === normalizedRoot || normalizedCwd.startsWith(`${normalizedRoot}${path.sep}`);
  });
  if (!allowed) {
    return {
      ok: false,
      summary: `shell local action cwd is outside allowed roots: ${normalizedCwd}`,
    };
  }

  return {
    ok: true,
    cwd: normalizedCwd,
  };
}

function isLocalActionComplexityStage(value: unknown): value is LocalActionComplexityStage {
  return value === 'bounded-command' || value === 'repo-automation' || value === 'extended';
}
