import { describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import { promisify } from 'node:util';
import path from 'node:path';
import { acquireLiveTestLock, releaseLiveTestLock } from './liveLock.js';
import { enqueueLiveConversationCleanup } from './liveConversationCleanup.js';
import { createExecutionRuntimeControl } from '../../src/runtime/control.js';
import { createExecutionServiceHost } from '../../src/runtime/serviceHost.js';
import { createResponsesHttpServer } from '../../src/http/responsesServer.js';
import { createConfiguredStoredStepExecutor } from '../../src/runtime/configuredExecutor.js';
import { resolveConfig } from '../../src/schema/resolver.js';

const execFileAsync = promisify(execFile);
// Extended matrix only: this file carries the broader mixed-provider
// happy-path/operator-control matrix and is intentionally excluded from the
// routine live baseline. Keep all cases opt-in behind explicit env gates.
const LIVE = process.env.AURACALL_LIVE_TEST === '1';
const MULTISERVICE_LIVE = process.env.AURACALL_MULTISERVICE_TEAM_LIVE_TEST === '1';
const MULTISERVICE_APPROVAL_LIVE = process.env.AURACALL_MULTISERVICE_APPROVAL_LIVE_TEST === '1';
const MULTISERVICE_REVERSE_CANCELLATION_LIVE =
  process.env.AURACALL_MULTISERVICE_REVERSE_CANCELLATION_LIVE_TEST === '1';
const MULTISERVICE_REVERSE_REJECTION_LIVE =
  process.env.AURACALL_MULTISERVICE_REVERSE_REJECTION_LIVE_TEST === '1';
const MULTISERVICE_REVERSE_APPROVAL_LIVE = process.env.AURACALL_MULTISERVICE_REVERSE_APPROVAL_LIVE_TEST === '1';
const MULTISERVICE_REVERSE_GEMINI_APPROVAL_LIVE =
  process.env.AURACALL_MULTISERVICE_REVERSE_GEMINI_APPROVAL_LIVE_TEST === '1';
const MULTISERVICE_REVERSE_GEMINI_CANCELLATION_LIVE =
  process.env.AURACALL_MULTISERVICE_REVERSE_GEMINI_CANCELLATION_LIVE_TEST === '1';
const MULTISERVICE_REVERSE_GEMINI_REJECTION_LIVE =
  process.env.AURACALL_MULTISERVICE_REVERSE_GEMINI_REJECTION_LIVE_TEST === '1';
const MULTISERVICE_GEMINI_TO_CHATGPT_APPROVAL_LIVE =
  process.env.AURACALL_MULTISERVICE_GEMINI_TO_CHATGPT_APPROVAL_LIVE_TEST === '1';
const MULTISERVICE_GEMINI_TO_CHATGPT_CANCELLATION_LIVE =
  process.env.AURACALL_MULTISERVICE_GEMINI_TO_CHATGPT_CANCELLATION_LIVE_TEST === '1';
const MULTISERVICE_GEMINI_TO_CHATGPT_REJECTION_LIVE =
  process.env.AURACALL_MULTISERVICE_GEMINI_TO_CHATGPT_REJECTION_LIVE_TEST === '1';
const MULTISERVICE_GEMINI_APPROVAL_LIVE = process.env.AURACALL_MULTISERVICE_GEMINI_APPROVAL_LIVE_TEST === '1';
const MULTISERVICE_GEMINI_CANCELLATION_LIVE =
  process.env.AURACALL_MULTISERVICE_GEMINI_CANCELLATION_LIVE_TEST === '1';
const MULTISERVICE_GEMINI_REJECTION_LIVE = process.env.AURACALL_MULTISERVICE_GEMINI_REJECTION_LIVE_TEST === '1';
const MULTISERVICE_CANCELLATION_LIVE = process.env.AURACALL_MULTISERVICE_CANCELLATION_LIVE_TEST === '1';
const MULTISERVICE_REJECTION_LIVE = process.env.AURACALL_MULTISERVICE_REJECTION_LIVE_TEST === '1';
const TSX_BIN = path.join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs');
const CLI_ENTRY = path.join(process.cwd(), 'bin', 'auracall.ts');
const SMOKE_TOKEN = 'AURACALL_CROSS_SERVICE_LIVE_SMOKE_OK';
const GEMINI_SMOKE_TOKEN = 'AURACALL_CROSS_SERVICE_GEMINI_LIVE_SMOKE_OK';
const APPROVAL_SMOKE_TOKEN = 'AURACALL_CROSS_SERVICE_APPROVAL_LIVE_SMOKE_OK';
const REVERSE_CANCELLATION_SMOKE_TOKEN = 'AURACALL_REVERSE_CROSS_SERVICE_CANCELLATION_LIVE_SMOKE_OK';
const REVERSE_REJECTION_SMOKE_TOKEN = 'AURACALL_REVERSE_CROSS_SERVICE_REJECTION_LIVE_SMOKE_OK';
const REVERSE_APPROVAL_SMOKE_TOKEN = 'AURACALL_REVERSE_CROSS_SERVICE_APPROVAL_LIVE_SMOKE_OK';
const REVERSE_GEMINI_APPROVAL_SMOKE_TOKEN = 'AURACALL_REVERSE_CROSS_SERVICE_GEMINI_APPROVAL_LIVE_SMOKE_OK';
const REVERSE_GEMINI_CANCELLATION_SMOKE_TOKEN =
  'AURACALL_REVERSE_CROSS_SERVICE_GEMINI_CANCELLATION_LIVE_SMOKE_OK';
const REVERSE_GEMINI_REJECTION_SMOKE_TOKEN = 'AURACALL_REVERSE_CROSS_SERVICE_GEMINI_REJECTION_LIVE_SMOKE_OK';
const GEMINI_TO_CHATGPT_APPROVAL_SMOKE_TOKEN = 'AURACALL_GEMINI_TO_CHATGPT_APPROVAL_LIVE_SMOKE_OK';
const GEMINI_TO_CHATGPT_CANCELLATION_SMOKE_TOKEN =
  'AURACALL_GEMINI_TO_CHATGPT_CANCELLATION_LIVE_SMOKE_OK';
const GEMINI_TO_CHATGPT_REJECTION_SMOKE_TOKEN = 'AURACALL_GEMINI_TO_CHATGPT_REJECTION_LIVE_SMOKE_OK';
const GEMINI_APPROVAL_SMOKE_TOKEN = 'AURACALL_CROSS_SERVICE_GEMINI_APPROVAL_LIVE_SMOKE_OK';
const GEMINI_CANCELLATION_SMOKE_TOKEN = 'AURACALL_CROSS_SERVICE_GEMINI_CANCELLATION_LIVE_SMOKE_OK';
const GEMINI_REJECTION_SMOKE_TOKEN = 'AURACALL_CROSS_SERVICE_GEMINI_REJECTION_LIVE_SMOKE_OK';
const CANCELLATION_SMOKE_TOKEN = 'AURACALL_CROSS_SERVICE_CANCELLATION_LIVE_SMOKE_OK';
const REJECTION_SMOKE_TOKEN = 'AURACALL_CROSS_SERVICE_REJECTION_LIVE_SMOKE_OK';
const GEMINI_SCOPED_COOKIE_PATH = path.join(
  process.env.HOME ?? '',
  '.auracall',
  'browser-profiles',
  'default',
  'gemini',
  'cookies.json',
);

type TeamRunLivePayload = {
  taskRunSpec: {
    id: string;
    teamId: string;
  };
  execution: {
    teamId: string;
    taskRunSpecId: string;
    runtimeRunId: string;
    runtimeSourceKind: string;
    runtimeRunStatus: string;
    terminalStepCount: number;
    finalOutputSummary: string | null;
    sharedStateNotes: string[];
    stepSummaries: Array<{
      teamStepOrder: number;
      teamStepStatus: string | null;
      runtimeStepStatus: string | null;
      runtimeProfileId: string | null;
      browserProfileId: string | null;
      service: string | null;
    }>;
  };
};

function hasDisplay(): boolean {
  const display = process.env.DISPLAY;
  return typeof display === 'string' && display.trim().length > 0;
}

async function acquireCrossServiceLocks(): Promise<void> {
  await acquireLiveTestLock('chatgpt-browser');
  try {
    await acquireLiveTestLock('grok-browser');
  } catch (error) {
    await releaseLiveTestLock('chatgpt-browser');
    throw error;
  }
}

async function releaseCrossServiceLocks(): Promise<void> {
  await releaseLiveTestLock('grok-browser');
  await releaseLiveTestLock('chatgpt-browser');
}

async function acquireReverseCrossServiceGeminiLocks(): Promise<void> {
  await acquireLiveTestLock('grok-browser');
  try {
    await acquireLiveTestLock('gemini-browser');
  } catch (error) {
    await releaseLiveTestLock('grok-browser');
    throw error;
  }
}

async function releaseReverseCrossServiceGeminiLocks(): Promise<void> {
  await releaseLiveTestLock('gemini-browser');
  await releaseLiveTestLock('grok-browser');
}

async function acquireCrossServiceGeminiLocks(): Promise<void> {
  await acquireLiveTestLock('chatgpt-browser');
  try {
    await acquireLiveTestLock('gemini-browser');
  } catch (error) {
    await releaseLiveTestLock('chatgpt-browser');
    throw error;
  }
}

async function releaseCrossServiceGeminiLocks(): Promise<void> {
  await releaseLiveTestLock('gemini-browser');
  await releaseLiveTestLock('chatgpt-browser');
}

async function acquireGeminiToChatgptLocks(): Promise<void> {
  await acquireLiveTestLock('gemini-browser');
  try {
    await acquireLiveTestLock('chatgpt-browser');
  } catch (error) {
    await releaseLiveTestLock('gemini-browser');
    throw error;
  }
}

async function releaseGeminiToChatgptLocks(): Promise<void> {
  await releaseLiveTestLock('chatgpt-browser');
  await releaseLiveTestLock('gemini-browser');
}

async function assertHasGeminiExportedCookies(): Promise<void> {
  let raw: string;
  try {
    raw = await fs.readFile(GEMINI_SCOPED_COOKIE_PATH, 'utf8');
  } catch (error) {
    throw new Error(
      `Cross-service Gemini live smoke requires exported cookies at ${GEMINI_SCOPED_COOKIE_PATH}. Run "pnpm tsx bin/auracall.ts login --target gemini --profile auracall-gemini-pro --export-cookies" first. (${error instanceof Error ? error.message : String(error)})`,
    );
  }

  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`Cross-service Gemini live smoke expected a cookie array in ${GEMINI_SCOPED_COOKIE_PATH}.`);
  }
  const names = new Set(
    parsed
      .map((cookie) =>
        cookie && typeof cookie === 'object' && typeof (cookie as { name?: unknown }).name === 'string'
          ? (cookie as { name: string }).name
          : null,
      )
      .filter((name): name is string => Boolean(name)),
  );
  if (!names.has('__Secure-1PSID') || !names.has('__Secure-1PSIDTS')) {
    throw new Error(
      `Cross-service Gemini live smoke requires exported __Secure-1PSID and __Secure-1PSIDTS cookies in ${GEMINI_SCOPED_COOKIE_PATH}. Re-run Gemini cookie export first.`,
    );
  }
}

async function runTeamSmoke(): Promise<TeamRunLivePayload> {
  const { stdout } = await execFileAsync(
    process.execPath,
    [
      TSX_BIN,
      CLI_ENTRY,
      'teams',
      'run',
      'auracall-cross-service',
      `Reply exactly with: ${SMOKE_TOKEN}`,
      '--title',
      'AuraCall cross-service team live smoke',
      '--prompt-append',
      `Do not use tools. Reply with exactly ${SMOKE_TOKEN} and nothing else.`,
      '--max-turns',
      '2',
      '--json',
    ],
    {
      env: {
        ...process.env,
        ORACLE_NO_BANNER: '1',
        NODE_NO_WARNINGS: '1',
      },
      timeout: 12 * 60 * 1000,
      maxBuffer: 1024 * 1024,
    },
  );

  return JSON.parse(stdout.trim()) as TeamRunLivePayload;
}

async function runGeminiTeamSmoke(): Promise<TeamRunLivePayload> {
  const { stdout } = await execFileAsync(
    process.execPath,
    [
      TSX_BIN,
      CLI_ENTRY,
      'teams',
      'run',
      'auracall-cross-service-gemini',
      `Reply exactly with: ${GEMINI_SMOKE_TOKEN}`,
      '--title',
      'AuraCall cross-service Gemini team live smoke',
      '--prompt-append',
      `Do not use tools. Reply with exactly ${GEMINI_SMOKE_TOKEN} and nothing else.`,
      '--max-turns',
      '2',
      '--json',
    ],
    {
      env: {
        ...process.env,
        ORACLE_NO_BANNER: '1',
        NODE_NO_WARNINGS: '1',
      },
      timeout: 12 * 60 * 1000,
      maxBuffer: 1024 * 1024,
    },
  );

  return JSON.parse(stdout.trim()) as TeamRunLivePayload;
}

async function runCancellationTeamSmoke(): Promise<TeamRunLivePayload> {
  const { stdout } = await execFileAsync(
    process.execPath,
    [
      TSX_BIN,
      CLI_ENTRY,
      'teams',
      'run',
      'auracall-cross-service-tooling',
      'Use the provided toolEnvelope structured context to request one bounded shell action. If the run is later resumed after the local action is cancelled, ignore the cancelled local action and return the provided finalToken exactly.',
      '--title',
      'AuraCall cross-service cancellation team live smoke',
      '--prompt-append',
      'Requester must emit exactly one JSON object with top-level localActionRequests containing the provided toolEnvelope unchanged. Do not rename fields, add markdown fences, or add prose. Finisher must not emit any output before resume if dependency host-action guidance escalates. After a human resume override is provided following cancellation, finisher must output only the final token.',
      '--structured-context-json',
      JSON.stringify({
        toolEnvelope: {
          kind: 'shell',
          summary: 'Request one approval-gated deterministic node command',
          command: 'node',
          args: ['-e', "process.stdout.write('AURACALL_TOOL_ACTION_OK')"],
          structuredPayload: {
            cwd: process.cwd(),
          },
        },
        finalToken: CANCELLATION_SMOKE_TOKEN,
      }),
      '--max-turns',
      '2',
      '--allow-local-shell-command',
      'node',
      '--allow-local-cwd-root',
      process.cwd(),
      '--require-local-action-approval',
      '--json',
    ],
    {
      env: {
        ...process.env,
        ORACLE_NO_BANNER: '1',
        NODE_NO_WARNINGS: '1',
      },
      timeout: 14 * 60 * 1000,
      maxBuffer: 1024 * 1024,
    },
  );

  return JSON.parse(stdout.trim()) as TeamRunLivePayload;
}

async function runApprovalTeamSmoke(): Promise<TeamRunLivePayload> {
  const { stdout } = await execFileAsync(
    process.execPath,
    [
      TSX_BIN,
      CLI_ENTRY,
      'teams',
      'run',
      'auracall-cross-service-tooling',
      'Use the provided toolEnvelope structured context to request one bounded shell action. If the run is later resumed after human escalation, ignore the blocked local action and return the provided finalToken exactly.',
      '--title',
      'AuraCall cross-service approval team live smoke',
      '--prompt-append',
      'Requester must emit exactly one JSON object with top-level localActionRequests containing the provided toolEnvelope unchanged. Do not rename fields, add markdown fences, or add prose. Finisher must not emit any output before resume if dependency host-action guidance escalates. After a human resume override is provided, finisher must output only the final token.',
      '--structured-context-json',
      JSON.stringify({
        toolEnvelope: {
          kind: 'shell',
          summary: 'Request one intentionally forbidden deterministic node command',
          command: 'node',
          args: ['-e', "process.stdout.write('AURACALL_TOOL_ACTION_OK')"],
          structuredPayload: {
            cwd: process.cwd(),
          },
        },
        finalToken: APPROVAL_SMOKE_TOKEN,
      }),
      '--max-turns',
      '2',
      '--json',
    ],
    {
      env: {
        ...process.env,
        ORACLE_NO_BANNER: '1',
        NODE_NO_WARNINGS: '1',
      },
      timeout: 14 * 60 * 1000,
      maxBuffer: 1024 * 1024,
    },
  );

  return JSON.parse(stdout.trim()) as TeamRunLivePayload;
}

async function runReverseApprovalTeamSmoke(): Promise<TeamRunLivePayload> {
  const { stdout } = await execFileAsync(
    process.execPath,
    [
      TSX_BIN,
      CLI_ENTRY,
      'teams',
      'run',
      'auracall-reverse-cross-service-tooling',
      'Use the provided toolEnvelope structured context to request one bounded shell action. If the run is later resumed after human escalation, ignore the blocked local action and return the provided finalToken exactly.',
      '--title',
      'AuraCall reverse cross-service approval team live smoke',
      '--prompt-append',
      'Requester must emit exactly one JSON object of the form {"localActionRequests":[toolEnvelope]}. Use only the task structured context key toolEnvelope as the localActionRequests item. Do not include finalToken or any other sibling fields inside localActionRequests. Do not rename fields, add markdown fences, or add prose. Finisher must not emit any output before resume if dependency host-action guidance escalates. After a human resume override is provided, finisher must output only the final token.',
      '--structured-context-json',
      JSON.stringify({
        toolEnvelope: {
          kind: 'shell',
          summary: 'Request one intentionally forbidden deterministic node command',
          command: 'node',
          args: ['-e', "process.stdout.write('AURACALL_TOOL_ACTION_OK')"],
          structuredPayload: {
            cwd: process.cwd(),
          },
        },
        finalToken: REVERSE_APPROVAL_SMOKE_TOKEN,
      }),
      '--max-turns',
      '2',
      '--json',
    ],
    {
      env: {
        ...process.env,
        ORACLE_NO_BANNER: '1',
        NODE_NO_WARNINGS: '1',
      },
      timeout: 14 * 60 * 1000,
      maxBuffer: 1024 * 1024,
    },
  );

  return JSON.parse(stdout.trim()) as TeamRunLivePayload;
}

async function runReverseCancellationTeamSmoke(): Promise<TeamRunLivePayload> {
  const { stdout } = await execFileAsync(
    process.execPath,
    [
      TSX_BIN,
      CLI_ENTRY,
      'teams',
      'run',
      'auracall-reverse-cross-service-tooling',
      'Use the provided toolEnvelope structured context to request one bounded shell action. If the run is later resumed after the local action is cancelled, ignore the cancelled local action and return the provided finalToken exactly.',
      '--title',
      'AuraCall reverse cross-service cancellation team live smoke',
      '--prompt-append',
      'Requester must emit exactly one JSON object of the form {"localActionRequests":[toolEnvelope]}. Use only the task structured context key toolEnvelope as the localActionRequests item. Do not include finalToken or any other sibling fields inside localActionRequests. Do not rename fields, add markdown fences, or add prose. Finisher must not emit any output before resume if dependency host-action guidance escalates. After a human resume override is provided following cancellation, finisher must output only the final token.',
      '--structured-context-json',
      JSON.stringify({
        toolEnvelope: {
          kind: 'shell',
          summary: 'Request one approval-gated deterministic node command',
          command: 'node',
          args: ['-e', "process.stdout.write('AURACALL_TOOL_ACTION_OK')"],
          structuredPayload: {
            cwd: process.cwd(),
          },
        },
        finalToken: REVERSE_CANCELLATION_SMOKE_TOKEN,
      }),
      '--max-turns',
      '2',
      '--allow-local-shell-command',
      'node',
      '--allow-local-cwd-root',
      process.cwd(),
      '--require-local-action-approval',
      '--json',
    ],
    {
      env: {
        ...process.env,
        ORACLE_NO_BANNER: '1',
        NODE_NO_WARNINGS: '1',
      },
      timeout: 14 * 60 * 1000,
      maxBuffer: 1024 * 1024,
    },
  );

  return JSON.parse(stdout.trim()) as TeamRunLivePayload;
}

async function runReverseRejectionTeamSmoke(): Promise<TeamRunLivePayload> {
  const { stdout } = await execFileAsync(
    process.execPath,
    [
      TSX_BIN,
      CLI_ENTRY,
      'teams',
      'run',
      'auracall-reverse-cross-service-tooling',
      'Use the provided toolEnvelope structured context to request one bounded shell action. If the run is later resumed after the local action is rejected, ignore the rejected local action and return the provided finalToken exactly.',
      '--title',
      'AuraCall reverse cross-service rejection team live smoke',
      '--prompt-append',
      'Requester must emit exactly one JSON object of the form {"localActionRequests":[toolEnvelope]}. Use only the task structured context key toolEnvelope as the localActionRequests item. Do not include finalToken or any other sibling fields inside localActionRequests. Do not rename fields, add markdown fences, or add prose. Finisher must not emit any output before resume if dependency host-action guidance escalates. After a human resume override is provided following rejection, finisher must output only the final token.',
      '--structured-context-json',
      JSON.stringify({
        toolEnvelope: {
          kind: 'shell',
          summary: 'Request one approval-gated deterministic node command',
          command: 'node',
          args: ['-e', "process.stdout.write('AURACALL_TOOL_ACTION_OK')"],
          structuredPayload: {
            cwd: process.cwd(),
          },
        },
        finalToken: REVERSE_REJECTION_SMOKE_TOKEN,
      }),
      '--max-turns',
      '2',
      '--allow-local-shell-command',
      'node',
      '--allow-local-cwd-root',
      process.cwd(),
      '--require-local-action-approval',
      '--json',
    ],
    {
      env: {
        ...process.env,
        ORACLE_NO_BANNER: '1',
        NODE_NO_WARNINGS: '1',
      },
      timeout: 14 * 60 * 1000,
      maxBuffer: 1024 * 1024,
    },
  );

  return JSON.parse(stdout.trim()) as TeamRunLivePayload;
}

async function runReverseGeminiApprovalTeamSmoke(): Promise<TeamRunLivePayload> {
  const { stdout } = await execFileAsync(
    process.execPath,
    [
      TSX_BIN,
      CLI_ENTRY,
      'teams',
      'run',
      'auracall-reverse-cross-service-gemini-tooling',
      'Use the provided toolEnvelope structured context to request one bounded shell action. If the run is later resumed after human escalation, ignore the blocked local action and return the provided finalToken exactly.',
      '--title',
      'AuraCall reverse cross-service Gemini approval team live smoke',
      '--prompt-append',
      'Requester must emit exactly one JSON object of the form {"localActionRequests":[toolEnvelope]}. Use only the task structured context key toolEnvelope as the localActionRequests item. Do not include finalToken or any other sibling fields inside localActionRequests. Do not rename fields, add markdown fences, or add prose. Finisher must not emit any output before resume if dependency host-action guidance escalates. After a human resume override is provided, finisher must output only the final token.',
      '--structured-context-json',
      JSON.stringify({
        toolEnvelope: {
          kind: 'shell',
          summary: 'Request one intentionally forbidden deterministic node command',
          command: 'node',
          args: ['-e', "process.stdout.write('AURACALL_TOOL_ACTION_OK')"],
          structuredPayload: {
            cwd: process.cwd(),
          },
        },
        finalToken: REVERSE_GEMINI_APPROVAL_SMOKE_TOKEN,
      }),
      '--max-turns',
      '2',
      '--json',
    ],
    {
      env: {
        ...process.env,
        ORACLE_NO_BANNER: '1',
        NODE_NO_WARNINGS: '1',
      },
      timeout: 14 * 60 * 1000,
      maxBuffer: 1024 * 1024,
    },
  );

  return JSON.parse(stdout.trim()) as TeamRunLivePayload;
}

async function runReverseGeminiCancellationTeamSmoke(): Promise<TeamRunLivePayload> {
  const { stdout } = await execFileAsync(
    process.execPath,
    [
      TSX_BIN,
      CLI_ENTRY,
      'teams',
      'run',
      'auracall-reverse-cross-service-gemini-tooling',
      'Use the provided toolEnvelope structured context to request one bounded shell action. If the run is later resumed after the local action is cancelled, ignore the cancelled local action and return the provided finalToken exactly.',
      '--title',
      'AuraCall reverse cross-service Gemini cancellation team live smoke',
      '--prompt-append',
      'Requester must emit exactly one JSON object of the form {"localActionRequests":[toolEnvelope]}. Use only the task structured context key toolEnvelope as the localActionRequests item. Do not include finalToken or any other sibling fields inside localActionRequests. Do not rename fields, add markdown fences, or add prose. Finisher must not emit any output before resume if dependency host-action guidance escalates. After a human resume override is provided following cancellation, finisher must output only the final token.',
      '--structured-context-json',
      JSON.stringify({
        toolEnvelope: {
          kind: 'shell',
          summary: 'Request one approval-gated deterministic node command',
          command: 'node',
          args: ['-e', "process.stdout.write('AURACALL_TOOL_ACTION_OK')"],
          structuredPayload: {
            cwd: process.cwd(),
          },
        },
        finalToken: REVERSE_GEMINI_CANCELLATION_SMOKE_TOKEN,
      }),
      '--max-turns',
      '2',
      '--allow-local-shell-command',
      'node',
      '--allow-local-cwd-root',
      process.cwd(),
      '--require-local-action-approval',
      '--json',
    ],
    {
      env: {
        ...process.env,
        ORACLE_NO_BANNER: '1',
        NODE_NO_WARNINGS: '1',
      },
      timeout: 14 * 60 * 1000,
      maxBuffer: 1024 * 1024,
    },
  );

  return JSON.parse(stdout.trim()) as TeamRunLivePayload;
}

async function runReverseGeminiRejectionTeamSmoke(): Promise<TeamRunLivePayload> {
  const { stdout } = await execFileAsync(
    process.execPath,
    [
      TSX_BIN,
      CLI_ENTRY,
      'teams',
      'run',
      'auracall-reverse-cross-service-gemini-tooling',
      'Use the provided toolEnvelope structured context to request one bounded shell action. If the run is later resumed after the local action is rejected, ignore the rejected local action and return the provided finalToken exactly.',
      '--title',
      'AuraCall reverse cross-service Gemini rejection team live smoke',
      '--prompt-append',
      'Requester must emit exactly one JSON object of the form {"localActionRequests":[toolEnvelope]}. Use only the task structured context key toolEnvelope as the localActionRequests item. Do not include finalToken or any other sibling fields inside localActionRequests. Do not rename fields, add markdown fences, or add prose. Finisher must not emit any output before resume if dependency host-action guidance escalates. After a human resume override is provided following rejection, finisher must output only the final token.',
      '--structured-context-json',
      JSON.stringify({
        toolEnvelope: {
          kind: 'shell',
          summary: 'Request one approval-gated deterministic node command',
          command: 'node',
          args: ['-e', "process.stdout.write('AURACALL_TOOL_ACTION_OK')"],
          structuredPayload: {
            cwd: process.cwd(),
          },
        },
        finalToken: REVERSE_GEMINI_REJECTION_SMOKE_TOKEN,
      }),
      '--max-turns',
      '2',
      '--allow-local-shell-command',
      'node',
      '--allow-local-cwd-root',
      process.cwd(),
      '--require-local-action-approval',
      '--json',
    ],
    {
      env: {
        ...process.env,
        ORACLE_NO_BANNER: '1',
        NODE_NO_WARNINGS: '1',
      },
      timeout: 14 * 60 * 1000,
      maxBuffer: 1024 * 1024,
    },
  );

  return JSON.parse(stdout.trim()) as TeamRunLivePayload;
}

async function runGeminiToChatgptApprovalTeamSmoke(): Promise<TeamRunLivePayload> {
  const { stdout } = await execFileAsync(
    process.execPath,
    [
      TSX_BIN,
      CLI_ENTRY,
      'teams',
      'run',
      'auracall-reverse-cross-service-chatgpt-tooling',
      'Use the provided toolEnvelope structured context to request one bounded shell action. If the run is later resumed after human escalation, ignore the blocked local action and return the provided finalToken exactly.',
      '--title',
      'AuraCall Gemini to ChatGPT approval team live smoke',
      '--prompt-append',
      'Requester must emit exactly one JSON object of the form {"localActionRequests":[toolEnvelope]}. Use only the task structured context key toolEnvelope as the localActionRequests item. Do not include finalToken or any other sibling fields inside localActionRequests. Do not rename fields, add markdown fences, or add prose. Finisher must not emit any output before resume if dependency host-action guidance escalates. After a human resume override is provided, finisher must output only the final token.',
      '--structured-context-json',
      JSON.stringify({
        toolEnvelope: {
          kind: 'shell',
          summary: 'Request one intentionally forbidden deterministic node command',
          command: 'node',
          args: ['-e', "process.stdout.write('AURACALL_TOOL_ACTION_OK')"],
          structuredPayload: {
            cwd: process.cwd(),
          },
        },
        finalToken: GEMINI_TO_CHATGPT_APPROVAL_SMOKE_TOKEN,
      }),
      '--max-turns',
      '2',
      '--json',
    ],
    {
      env: {
        ...process.env,
        ORACLE_NO_BANNER: '1',
        NODE_NO_WARNINGS: '1',
      },
      timeout: 14 * 60 * 1000,
      maxBuffer: 1024 * 1024,
    },
  );

  return JSON.parse(stdout.trim()) as TeamRunLivePayload;
}

async function runGeminiToChatgptCancellationTeamSmoke(): Promise<TeamRunLivePayload> {
  const { stdout } = await execFileAsync(
    process.execPath,
    [
      TSX_BIN,
      CLI_ENTRY,
      'teams',
      'run',
      'auracall-reverse-cross-service-chatgpt-tooling',
      'Use the provided toolEnvelope structured context to request one bounded shell action. If the run is later resumed after the local action is cancelled, ignore the cancelled local action and return the provided finalToken exactly.',
      '--title',
      'AuraCall Gemini to ChatGPT cancellation team live smoke',
      '--prompt-append',
      'Requester must emit exactly one JSON object of the form {"localActionRequests":[toolEnvelope]}. Use only the task structured context key toolEnvelope as the localActionRequests item. Do not include finalToken or any other sibling fields inside localActionRequests. Do not rename fields, add markdown fences, or add prose. Finisher must not emit any output before resume if dependency host-action guidance escalates. After a human resume override is provided following cancellation, finisher must output only the final token.',
      '--structured-context-json',
      JSON.stringify({
        toolEnvelope: {
          kind: 'shell',
          summary: 'Request one approval-gated deterministic node command',
          command: 'node',
          args: ['-e', "process.stdout.write('AURACALL_TOOL_ACTION_OK')"],
          structuredPayload: {
            cwd: process.cwd(),
          },
        },
        finalToken: GEMINI_TO_CHATGPT_CANCELLATION_SMOKE_TOKEN,
      }),
      '--max-turns',
      '2',
      '--allow-local-shell-command',
      'node',
      '--allow-local-cwd-root',
      process.cwd(),
      '--require-local-action-approval',
      '--json',
    ],
    {
      env: {
        ...process.env,
        ORACLE_NO_BANNER: '1',
        NODE_NO_WARNINGS: '1',
      },
      timeout: 14 * 60 * 1000,
      maxBuffer: 1024 * 1024,
    },
  );

  return JSON.parse(stdout.trim()) as TeamRunLivePayload;
}

async function runGeminiToChatgptRejectionTeamSmoke(): Promise<TeamRunLivePayload> {
  const { stdout } = await execFileAsync(
    process.execPath,
    [
      TSX_BIN,
      CLI_ENTRY,
      'teams',
      'run',
      'auracall-reverse-cross-service-chatgpt-tooling',
      'Use the provided toolEnvelope structured context to request one bounded shell action. If the run is later resumed after the local action is rejected, ignore the rejected local action and return the provided finalToken exactly.',
      '--title',
      'AuraCall Gemini to ChatGPT rejection team live smoke',
      '--prompt-append',
      'Requester must emit exactly one JSON object of the form {"localActionRequests":[toolEnvelope]}. Use only the task structured context key toolEnvelope as the localActionRequests item. Do not include finalToken or any other sibling fields inside localActionRequests. Do not rename fields, add markdown fences, or add prose. Finisher must not emit any output before resume if dependency host-action guidance escalates. After a human resume override is provided following rejection, finisher must output only the final token.',
      '--structured-context-json',
      JSON.stringify({
        toolEnvelope: {
          kind: 'shell',
          summary: 'Request one approval-gated deterministic node command',
          command: 'node',
          args: ['-e', "process.stdout.write('AURACALL_TOOL_ACTION_OK')"],
          structuredPayload: {
            cwd: process.cwd(),
          },
        },
        finalToken: GEMINI_TO_CHATGPT_REJECTION_SMOKE_TOKEN,
      }),
      '--max-turns',
      '2',
      '--allow-local-shell-command',
      'node',
      '--allow-local-cwd-root',
      process.cwd(),
      '--require-local-action-approval',
      '--json',
    ],
    {
      env: {
        ...process.env,
        ORACLE_NO_BANNER: '1',
        NODE_NO_WARNINGS: '1',
      },
      timeout: 14 * 60 * 1000,
      maxBuffer: 1024 * 1024,
    },
  );

  return JSON.parse(stdout.trim()) as TeamRunLivePayload;
}

async function runGeminiApprovalTeamSmoke(): Promise<TeamRunLivePayload> {
  const { stdout } = await execFileAsync(
    process.execPath,
    [
      TSX_BIN,
      CLI_ENTRY,
      'teams',
      'run',
      'auracall-cross-service-gemini-tooling',
      'Use the provided toolEnvelope structured context to request one bounded shell action. If the run is later resumed after human escalation, ignore the blocked local action and return the provided finalToken exactly.',
      '--title',
      'AuraCall cross-service Gemini approval team live smoke',
      '--prompt-append',
      'Requester must emit exactly one JSON object with top-level localActionRequests containing the provided toolEnvelope unchanged. Do not rename fields, add markdown fences, or add prose. Finisher must not emit any output before resume if dependency host-action guidance escalates. After a human resume override is provided, finisher must output only the final token.',
      '--structured-context-json',
      JSON.stringify({
        toolEnvelope: {
          kind: 'shell',
          summary: 'Request one intentionally forbidden deterministic node command',
          command: 'node',
          args: ['-e', "process.stdout.write('AURACALL_TOOL_ACTION_OK')"],
          structuredPayload: {
            cwd: process.cwd(),
          },
        },
        finalToken: GEMINI_APPROVAL_SMOKE_TOKEN,
      }),
      '--max-turns',
      '2',
      '--json',
    ],
    {
      env: {
        ...process.env,
        ORACLE_NO_BANNER: '1',
        NODE_NO_WARNINGS: '1',
      },
      timeout: 14 * 60 * 1000,
      maxBuffer: 1024 * 1024,
    },
  );

  return JSON.parse(stdout.trim()) as TeamRunLivePayload;
}

async function runGeminiRejectionTeamSmoke(): Promise<TeamRunLivePayload> {
  const { stdout } = await execFileAsync(
    process.execPath,
    [
      TSX_BIN,
      CLI_ENTRY,
      'teams',
      'run',
      'auracall-cross-service-gemini-tooling',
      'Use the provided toolEnvelope structured context to request one bounded shell action. If the run is later resumed after the local action is rejected, ignore the rejected local action and return the provided finalToken exactly.',
      '--title',
      'AuraCall cross-service Gemini rejection team live smoke',
      '--prompt-append',
      'Requester must emit exactly one JSON object with top-level localActionRequests containing the provided toolEnvelope unchanged. Do not rename fields, add markdown fences, or add prose. Finisher must not emit any output before resume if dependency host-action guidance escalates. After a human resume override is provided following rejection, finisher must output only the final token.',
      '--structured-context-json',
      JSON.stringify({
        toolEnvelope: {
          kind: 'shell',
          summary: 'Request one approval-gated deterministic node command',
          command: 'node',
          args: ['-e', "process.stdout.write('AURACALL_TOOL_ACTION_OK')"],
          structuredPayload: {
            cwd: process.cwd(),
          },
        },
        finalToken: GEMINI_REJECTION_SMOKE_TOKEN,
      }),
      '--max-turns',
      '2',
      '--allow-local-shell-command',
      'node',
      '--allow-local-cwd-root',
      process.cwd(),
      '--require-local-action-approval',
      '--json',
    ],
    {
      env: {
        ...process.env,
        ORACLE_NO_BANNER: '1',
        NODE_NO_WARNINGS: '1',
      },
      timeout: 14 * 60 * 1000,
      maxBuffer: 1024 * 1024,
    },
  );

  return JSON.parse(stdout.trim()) as TeamRunLivePayload;
}

async function runGeminiCancellationTeamSmoke(): Promise<TeamRunLivePayload> {
  const { stdout } = await execFileAsync(
    process.execPath,
    [
      TSX_BIN,
      CLI_ENTRY,
      'teams',
      'run',
      'auracall-cross-service-gemini-tooling',
      'Use the provided toolEnvelope structured context to request one bounded shell action. If the run is later resumed after the local action is cancelled, ignore the cancelled local action and return the provided finalToken exactly.',
      '--title',
      'AuraCall cross-service Gemini cancellation team live smoke',
      '--prompt-append',
      'Requester must emit exactly one JSON object with top-level localActionRequests containing the provided toolEnvelope unchanged. Do not rename fields, add markdown fences, or add prose. Finisher must not emit any output before resume if dependency host-action guidance escalates. After a human resume override is provided following cancellation, finisher must output only the final token.',
      '--structured-context-json',
      JSON.stringify({
        toolEnvelope: {
          kind: 'shell',
          summary: 'Request one approval-gated deterministic node command',
          command: 'node',
          args: ['-e', "process.stdout.write('AURACALL_TOOL_ACTION_OK')"],
          structuredPayload: {
            cwd: process.cwd(),
          },
        },
        finalToken: GEMINI_CANCELLATION_SMOKE_TOKEN,
      }),
      '--max-turns',
      '2',
      '--allow-local-shell-command',
      'node',
      '--allow-local-cwd-root',
      process.cwd(),
      '--require-local-action-approval',
      '--json',
    ],
    {
      env: {
        ...process.env,
        ORACLE_NO_BANNER: '1',
        NODE_NO_WARNINGS: '1',
      },
      timeout: 14 * 60 * 1000,
      maxBuffer: 1024 * 1024,
    },
  );

  return JSON.parse(stdout.trim()) as TeamRunLivePayload;
}

async function runRejectionTeamSmoke(): Promise<TeamRunLivePayload> {
  const { stdout } = await execFileAsync(
    process.execPath,
    [
      TSX_BIN,
      CLI_ENTRY,
      'teams',
      'run',
      'auracall-cross-service-tooling',
      'Use the provided toolEnvelope structured context to request one bounded shell action. If the run is later resumed after the local action is rejected, ignore the rejected local action and return the provided finalToken exactly.',
      '--title',
      'AuraCall cross-service rejection team live smoke',
      '--prompt-append',
      'Requester must emit exactly one JSON object with top-level localActionRequests containing the provided toolEnvelope unchanged. Do not rename fields, add markdown fences, or add prose. Finisher must not emit any output before resume if dependency host-action guidance escalates. After a human resume override is provided following rejection, finisher must output only the final token.',
      '--structured-context-json',
      JSON.stringify({
        toolEnvelope: {
          kind: 'shell',
          summary: 'Request one approval-gated deterministic node command',
          command: 'node',
          args: ['-e', "process.stdout.write('AURACALL_TOOL_ACTION_OK')"],
          structuredPayload: {
            cwd: process.cwd(),
          },
        },
        finalToken: REJECTION_SMOKE_TOKEN,
      }),
      '--max-turns',
      '2',
      '--allow-local-shell-command',
      'node',
      '--allow-local-cwd-root',
      process.cwd(),
      '--require-local-action-approval',
      '--json',
    ],
    {
      env: {
        ...process.env,
        ORACLE_NO_BANNER: '1',
        NODE_NO_WARNINGS: '1',
      },
      timeout: 14 * 60 * 1000,
      maxBuffer: 1024 * 1024,
    },
  );

  return JSON.parse(stdout.trim()) as TeamRunLivePayload;
}

async function assertStoredReadbacks(payload: TeamRunLivePayload) {
  const control = createExecutionRuntimeControl();
  const host = createExecutionServiceHost({
    control,
    ownerId: 'live-test:cross-service-team',
  });
  const detail = await host.readRecoveryDetail(payload.execution.runtimeRunId);

  expect(detail).not.toBeNull();
  expect(detail).toMatchObject({
    runId: payload.execution.runtimeRunId,
    sourceKind: 'team-run',
    taskRunSpecId: payload.taskRunSpec.id,
  });
  expect(detail?.orchestrationTimelineSummary?.total ?? 0).toBeGreaterThan(0);
  expect(
    detail?.orchestrationTimelineSummary?.items.filter((item) => item.type === 'step-succeeded').length ?? 0,
  ).toBeGreaterThanOrEqual(2);
  expect(
    detail?.orchestrationTimelineSummary?.items.filter((item) => item.type === 'handoff-consumed').length ?? 0,
  ).toBeGreaterThanOrEqual(1);

  const server = await createResponsesHttpServer(
    { host: '127.0.0.1', port: 0 },
    { control },
  );
  try {
    const recoveryResponse = await fetch(`http://127.0.0.1:${server.port}/status/recovery/${payload.execution.runtimeRunId}`);
    expect(recoveryResponse.status).toBe(200);
    const recoveryBody = (await recoveryResponse.json()) as {
      object: string;
      detail: {
        runId: string;
        sourceKind: string;
        taskRunSpecId: string | null;
        orchestrationTimelineSummary: {
          total: number;
          items: Array<{ type: string | null }>;
        } | null;
      };
    };
    expect(recoveryBody.object).toBe('recovery_detail');
    expect(recoveryBody.detail).toMatchObject({
      runId: payload.execution.runtimeRunId,
      sourceKind: 'team-run',
      taskRunSpecId: payload.taskRunSpec.id,
    });
    expect(recoveryBody.detail.orchestrationTimelineSummary?.total ?? 0).toBeGreaterThan(0);
    expect(
      recoveryBody.detail.orchestrationTimelineSummary?.items.filter((item) => item.type === 'step-succeeded').length ?? 0,
    ).toBeGreaterThanOrEqual(2);
    expect(
      recoveryBody.detail.orchestrationTimelineSummary?.items.filter((item) => item.type === 'handoff-consumed').length ?? 0,
    ).toBeGreaterThanOrEqual(1);

    const responseRead = await fetch(`http://127.0.0.1:${server.port}/v1/responses/${payload.execution.runtimeRunId}`);
    expect(responseRead.status).toBe(200);
    const responseBody = (await responseRead.json()) as {
      id: string;
      object: string;
      status: string;
      metadata?: {
        runId?: string | null;
        taskRunSpecId?: string | null;
        runtimeProfile?: string | null;
        service?: string | null;
        executionSummary?: {
          stepSummaries?: Array<{
            stepId?: string | null;
            order?: number;
            agentId?: string | null;
            status?: string | null;
            runtimeProfileId?: string | null;
            browserProfileId?: string | null;
            service?: string | null;
          }> | null;
          orchestrationTimelineSummary?: {
            total: number;
            items: Array<{ type: string | null }>;
          } | null;
        } | null;
      } | null;
    };
    expect(responseBody).toMatchObject({
      id: payload.execution.runtimeRunId,
      object: 'response',
      status: 'completed',
      metadata: {
        runId: payload.execution.runtimeRunId,
        taskRunSpecId: payload.taskRunSpec.id,
        runtimeProfile: payload.execution.stepSummaries[0]?.runtimeProfileId ?? null,
        service: payload.execution.stepSummaries[0]?.service ?? null,
        executionSummary: {
          stepSummaries: payload.execution.stepSummaries.map((step) => ({
            stepId: null,
            order: step.teamStepOrder,
            agentId: null,
            status: step.runtimeStepStatus,
            runtimeProfileId: step.runtimeProfileId,
            browserProfileId: step.browserProfileId,
            service: step.service,
          })),
        },
      },
    });
    expect(responseBody.metadata?.executionSummary?.orchestrationTimelineSummary?.total ?? 0).toBeGreaterThan(0);
    expect(
      responseBody.metadata?.executionSummary?.orchestrationTimelineSummary?.items.filter(
        (item) => item.type === 'step-succeeded',
      ).length ?? 0,
    ).toBeGreaterThanOrEqual(2);
    expect(
      responseBody.metadata?.executionSummary?.orchestrationTimelineSummary?.items.filter(
        (item) => item.type === 'handoff-consumed',
      ).length ?? 0,
    ).toBeGreaterThanOrEqual(1);
  } finally {
    await server.close();
  }
}

async function assertGeminiStoredReadbacks(payload: TeamRunLivePayload) {
  const control = createExecutionRuntimeControl();
  const host = createExecutionServiceHost({
    control,
    ownerId: 'live-test:cross-service-gemini-team',
  });
  const detail = await host.readRecoveryDetail(payload.execution.runtimeRunId);

  expect(detail).not.toBeNull();
  expect(detail).toMatchObject({
    runId: payload.execution.runtimeRunId,
    sourceKind: 'team-run',
    taskRunSpecId: payload.taskRunSpec.id,
  });
  expect(detail?.orchestrationTimelineSummary?.total ?? 0).toBeGreaterThan(0);
  expect(
    detail?.orchestrationTimelineSummary?.items.filter((item) => item.type === 'step-succeeded').length ?? 0,
  ).toBeGreaterThanOrEqual(2);
  expect(
    detail?.orchestrationTimelineSummary?.items.filter((item) => item.type === 'handoff-consumed').length ?? 0,
  ).toBeGreaterThanOrEqual(1);

  const server = await createResponsesHttpServer(
    { host: '127.0.0.1', port: 0 },
    { control },
  );
  try {
    const recoveryResponse = await fetch(`http://127.0.0.1:${server.port}/status/recovery/${payload.execution.runtimeRunId}`);
    expect(recoveryResponse.status).toBe(200);
    const recoveryBody = (await recoveryResponse.json()) as {
      object: string;
      detail: {
        runId: string;
        sourceKind: string;
        taskRunSpecId: string | null;
        orchestrationTimelineSummary: {
          total: number;
          items: Array<{ type: string | null }>;
        } | null;
      };
    };
    expect(recoveryBody.object).toBe('recovery_detail');
    expect(recoveryBody.detail).toMatchObject({
      runId: payload.execution.runtimeRunId,
      sourceKind: 'team-run',
      taskRunSpecId: payload.taskRunSpec.id,
    });
    expect(recoveryBody.detail.orchestrationTimelineSummary?.total ?? 0).toBeGreaterThan(0);
    expect(
      recoveryBody.detail.orchestrationTimelineSummary?.items.filter((item) => item.type === 'step-succeeded').length ?? 0,
    ).toBeGreaterThanOrEqual(2);
    expect(
      recoveryBody.detail.orchestrationTimelineSummary?.items.filter((item) => item.type === 'handoff-consumed').length ?? 0,
    ).toBeGreaterThanOrEqual(1);

    const responseRead = await fetch(`http://127.0.0.1:${server.port}/v1/responses/${payload.execution.runtimeRunId}`);
    expect(responseRead.status).toBe(200);
    const responseBody = (await responseRead.json()) as {
      id: string;
      object: string;
      status: string;
      metadata?: {
        runId?: string | null;
        taskRunSpecId?: string | null;
        runtimeProfile?: string | null;
        service?: string | null;
        executionSummary?: {
          stepSummaries?: Array<{
            stepId?: string | null;
            order?: number;
            agentId?: string | null;
            status?: string | null;
            runtimeProfileId?: string | null;
            browserProfileId?: string | null;
            service?: string | null;
          }> | null;
          orchestrationTimelineSummary?: {
            total: number;
            items: Array<{ type: string | null }>;
          } | null;
        } | null;
      } | null;
    };
    expect(responseBody).toMatchObject({
      id: payload.execution.runtimeRunId,
      object: 'response',
      status: 'completed',
      metadata: {
        runId: payload.execution.runtimeRunId,
        taskRunSpecId: payload.taskRunSpec.id,
        runtimeProfile: payload.execution.stepSummaries[0]?.runtimeProfileId ?? null,
        service: payload.execution.stepSummaries[0]?.service ?? null,
        executionSummary: {
          stepSummaries: payload.execution.stepSummaries.map((step) => ({
            stepId: null,
            order: step.teamStepOrder,
            agentId: null,
            status: step.runtimeStepStatus,
            runtimeProfileId: step.runtimeProfileId,
            browserProfileId: step.browserProfileId,
            service: step.service,
          })),
        },
      },
    });
    expect(responseBody.metadata?.executionSummary?.orchestrationTimelineSummary?.total ?? 0).toBeGreaterThan(0);
    expect(
      responseBody.metadata?.executionSummary?.orchestrationTimelineSummary?.items.filter(
        (item) => item.type === 'step-succeeded',
      ).length ?? 0,
    ).toBeGreaterThanOrEqual(2);
    expect(
      responseBody.metadata?.executionSummary?.orchestrationTimelineSummary?.items.filter(
        (item) => item.type === 'handoff-consumed',
      ).length ?? 0,
    ).toBeGreaterThanOrEqual(1);
  } finally {
    await server.close();
  }
}

async function assertCancelledOperatorControlledCrossServiceReadbacks(payload: TeamRunLivePayload) {
  const control = createExecutionRuntimeControl();
  const storedPausedRecord = await control.readRun(payload.execution.runtimeRunId);
  const requestedRequest =
    storedPausedRecord?.bundle.localActionRequests.find((request) => request.status === 'requested') ?? null;
  expect(requestedRequest).not.toBeNull();
  const requestId = requestedRequest?.id ?? null;

  const config = await resolveConfig({}, process.cwd(), process.env);
  const executionHost = createExecutionServiceHost({
    control,
    ownerId: 'live-test:cross-service-cancellation',
    executeStoredRunStep: createConfiguredStoredStepExecutor(config),
  });
  const server = await createResponsesHttpServer(
    { host: '127.0.0.1', port: 0 },
    {
      control,
      executionHost,
    },
  );

  try {
    const resolveResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        localActionControl: {
          action: 'resolve-request',
          runId: payload.execution.runtimeRunId,
          requestId,
          resolution: 'cancelled',
          note: 'human cancelled requested cross-service local action',
        },
      }),
    });
    expect(resolveResponse.status).toBe(200);
    const resolvePayload = (await resolveResponse.json()) as Record<string, any>;
    expect(resolvePayload).toMatchObject({
      controlResult: {
        kind: 'local-action-control',
        action: 'resolve-local-action-request',
        runId: payload.execution.runtimeRunId,
        requestId,
        resolution: 'cancelled',
        status: 'resolved',
        resolved: true,
        reason: 'human cancelled requested cross-service local action',
      },
    });

    const resumeResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runControl: {
          action: 'resume-human-escalation',
          runId: payload.execution.runtimeRunId,
          note: 'human resumed cross-service team run after cancelling local action',
          guidance: {
            action: 'continue',
            instruction: 'the requested local shell action was cancelled; continue directly to the final response',
          },
          override: {
            promptAppend: `The requested local shell action was cancelled by the operator. Reply exactly with ${CANCELLATION_SMOKE_TOKEN} and nothing else.`,
            structuredContext: {
              cancelledRequestedLocalAction: true,
              finalToken: CANCELLATION_SMOKE_TOKEN,
            },
          },
        },
      }),
    });
    expect(resumeResponse.status).toBe(200);
    const resumePayload = (await resumeResponse.json()) as Record<string, any>;
    expect(resumePayload).toMatchObject({
      controlResult: {
        kind: 'run-control',
        action: 'resume-human-escalation',
        runId: payload.execution.runtimeRunId,
        status: 'resumed',
        resumed: true,
        reason: 'human resumed cross-service team run after cancelling local action',
      },
    });

    const drainResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runControl: {
          action: 'drain-run',
          runId: payload.execution.runtimeRunId,
        },
      }),
    });
    expect(drainResponse.status).toBe(200);
    const drainPayload = (await drainResponse.json()) as Record<string, any>;
    expect(drainPayload).toMatchObject({
      controlResult: {
        kind: 'run-control',
        action: 'drain-run',
        runId: payload.execution.runtimeRunId,
        status: 'executed',
        drained: true,
        reason: 'run executed through targeted host drain',
        skipReason: null,
      },
    });

    const recoveryResponse = await fetch(`http://127.0.0.1:${server.port}/status/recovery/${payload.execution.runtimeRunId}`);
    expect(recoveryResponse.status).toBe(200);
    const recoveryBody = (await recoveryResponse.json()) as {
      object: string;
      detail: {
        runId: string;
        sourceKind: string;
        taskRunSpecId: string | null;
        orchestrationTimelineSummary: {
          total: number;
          items: Array<{
            type: string | null;
            note: string | null;
            stepId: string | null;
          }>;
        } | null;
      };
    };
    expect(recoveryBody.object).toBe('recovery_detail');
    expect(recoveryBody.detail).toMatchObject({
      runId: payload.execution.runtimeRunId,
      sourceKind: 'team-run',
      taskRunSpecId: payload.taskRunSpec.id,
    });
    expect(recoveryBody.detail.orchestrationTimelineSummary?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'note-added',
          note: 'human resumed cross-service team run after cancelling local action',
        }),
        expect.objectContaining({
          type: 'step-succeeded',
        }),
        expect.objectContaining({
          type: 'note-added',
          note: 'run executed through targeted host drain',
          stepId: null,
        }),
      ]),
    );

    const responseRead = await fetch(`http://127.0.0.1:${server.port}/v1/responses/${payload.execution.runtimeRunId}`);
    expect(responseRead.status).toBe(200);
    const responseBody = (await responseRead.json()) as {
      id: string;
      object: string;
      status: string;
      metadata?: {
        runId?: string | null;
        taskRunSpecId?: string | null;
        executionSummary?: {
          operatorControlSummary?: {
            humanEscalationResume?: {
              note?: string | null;
            } | null;
            targetedDrain?: {
              status?: string | null;
              reason?: string | null;
              skipReason?: string | null;
            } | null;
          } | null;
          localActionSummary?: {
            counts?: {
              requested?: number | null;
              cancelled?: number | null;
            } | null;
            items?: Array<{
              requestId?: string | null;
              status?: string | null;
            }>;
          } | null;
        } | null;
      } | null;
    };
    expect(responseBody).toMatchObject({
      id: payload.execution.runtimeRunId,
      object: 'response',
      status: 'completed',
      metadata: {
        runId: payload.execution.runtimeRunId,
        taskRunSpecId: payload.taskRunSpec.id,
        executionSummary: {
          operatorControlSummary: {
            humanEscalationResume: {
              note: 'human resumed cross-service team run after cancelling local action',
            },
            targetedDrain: {
              status: 'executed',
              reason: 'run executed through targeted host drain',
              skipReason: null,
            },
          },
          localActionSummary: {
            counts: {
              requested: 0,
              cancelled: 1,
            },
          },
        },
      },
    });
    expect(
      responseBody.metadata?.executionSummary?.localActionSummary?.items?.some(
        (item) => item.requestId === requestId && item.status === 'cancelled',
      ) ?? false,
    ).toBe(true);

    const storedRecord = await control.readRun(payload.execution.runtimeRunId);
    expect(storedRecord?.bundle.run.status).toBe('succeeded');
    expect(
      storedRecord?.bundle.localActionRequests.some(
        (request) =>
          request.id === requestId &&
          request.status === 'cancelled' &&
          request.resultSummary === 'human cancelled requested cross-service local action',
      ) ?? false,
    ).toBe(true);
    expect(storedRecord?.bundle.steps.at(-1)?.output?.summary).toBe(CANCELLATION_SMOKE_TOKEN);
  } finally {
    await server.close();
  }
}

async function assertApprovedOperatorControlledCrossServiceReadbacks(payload: TeamRunLivePayload) {
  const control = createExecutionRuntimeControl();
  const config = await resolveConfig({}, process.cwd(), process.env);
  const executionHost = createExecutionServiceHost({
    control,
    ownerId: 'live-test:cross-service-approval',
    executeStoredRunStep: createConfiguredStoredStepExecutor(config),
  });
  const server = await createResponsesHttpServer(
    { host: '127.0.0.1', port: 0 },
    {
      control,
      executionHost,
    },
  );

  try {
    const resumeResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runControl: {
          action: 'resume-human-escalation',
          runId: payload.execution.runtimeRunId,
          note: 'human approved cross-service team resume',
          guidance: {
            action: 'continue',
            instruction: 'the human approved skipping the blocked local shell action and continuing directly to the final response',
          },
          override: {
            promptAppend: `The human approved skipping the blocked local shell action. Reply exactly with ${APPROVAL_SMOKE_TOKEN} and nothing else.`,
            structuredContext: {
              approvedToSkipBlockedLocalAction: true,
              finalToken: APPROVAL_SMOKE_TOKEN,
            },
          },
        },
      }),
    });
    expect(resumeResponse.status).toBe(200);
    const resumePayload = (await resumeResponse.json()) as Record<string, any>;
    expect(resumePayload).toMatchObject({
      controlResult: {
        kind: 'run-control',
        action: 'resume-human-escalation',
        runId: payload.execution.runtimeRunId,
        status: 'resumed',
        resumed: true,
        reason: 'human approved cross-service team resume',
      },
    });

    const drainResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runControl: {
          action: 'drain-run',
          runId: payload.execution.runtimeRunId,
        },
      }),
    });
    expect(drainResponse.status).toBe(200);
    const drainPayload = (await drainResponse.json()) as Record<string, any>;
    expect(drainPayload).toMatchObject({
      controlResult: {
        kind: 'run-control',
        action: 'drain-run',
        runId: payload.execution.runtimeRunId,
        status: 'executed',
        drained: true,
        reason: 'run executed through targeted host drain',
        skipReason: null,
      },
    });

    const recoveryResponse = await fetch(`http://127.0.0.1:${server.port}/status/recovery/${payload.execution.runtimeRunId}`);
    expect(recoveryResponse.status).toBe(200);
    const recoveryBody = (await recoveryResponse.json()) as {
      object: string;
      detail: {
        runId: string;
        sourceKind: string;
        taskRunSpecId: string | null;
        orchestrationTimelineSummary: {
          total: number;
          items: Array<{
            type: string | null;
            note: string | null;
            stepId: string | null;
          }>;
        } | null;
      };
    };
    expect(recoveryBody.object).toBe('recovery_detail');
    expect(recoveryBody.detail).toMatchObject({
      runId: payload.execution.runtimeRunId,
      sourceKind: 'team-run',
      taskRunSpecId: payload.taskRunSpec.id,
    });
    expect(recoveryBody.detail.orchestrationTimelineSummary?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'note-added',
          note: 'human approved cross-service team resume',
        }),
        expect.objectContaining({
          type: 'step-succeeded',
        }),
        expect.objectContaining({
          type: 'note-added',
          note: 'run executed through targeted host drain',
          stepId: null,
        }),
      ]),
    );

    const responseRead = await fetch(`http://127.0.0.1:${server.port}/v1/responses/${payload.execution.runtimeRunId}`);
    expect(responseRead.status).toBe(200);
    const responseBody = (await responseRead.json()) as {
      id: string;
      object: string;
      status: string;
      metadata?: {
        runId?: string | null;
        taskRunSpecId?: string | null;
        executionSummary?: {
          operatorControlSummary?: {
            humanEscalationResume?: {
              note?: string | null;
            } | null;
            targetedDrain?: {
              status?: string | null;
              reason?: string | null;
              skipReason?: string | null;
            } | null;
          } | null;
          localActionSummary?: {
            counts?: {
              approved?: number | null;
            } | null;
          } | null;
        } | null;
      } | null;
    };
    expect(responseBody).toMatchObject({
      id: payload.execution.runtimeRunId,
      object: 'response',
      status: 'completed',
      metadata: {
        runId: payload.execution.runtimeRunId,
        taskRunSpecId: payload.taskRunSpec.id,
        executionSummary: {
          operatorControlSummary: {
            humanEscalationResume: {
              note: 'human approved cross-service team resume',
            },
            targetedDrain: {
              status: 'executed',
              reason: 'run executed through targeted host drain',
              skipReason: null,
            },
          },
          localActionSummary: {
            counts: {
              approved: 0,
            },
          },
        },
      },
    });

    const storedRecord = await control.readRun(payload.execution.runtimeRunId);
    expect(storedRecord?.bundle.run.status).toBe('succeeded');
    expect(storedRecord?.bundle.steps.at(-1)?.output?.summary).toBe(APPROVAL_SMOKE_TOKEN);
  } finally {
    await server.close();
  }
}

async function assertApprovedOperatorControlledReverseCrossServiceReadbacks(payload: TeamRunLivePayload) {
  const control = createExecutionRuntimeControl();
  const config = await resolveConfig({}, process.cwd(), process.env);
  const executionHost = createExecutionServiceHost({
    control,
    ownerId: 'live-test:reverse-cross-service-approval',
    executeStoredRunStep: createConfiguredStoredStepExecutor(config),
  });
  const server = await createResponsesHttpServer(
    { host: '127.0.0.1', port: 0 },
    {
      control,
      executionHost,
    },
  );

  try {
    const resumeResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runControl: {
          action: 'resume-human-escalation',
          runId: payload.execution.runtimeRunId,
          note: 'human approved reverse cross-service team resume',
          guidance: {
            action: 'continue',
            instruction: 'the human approved skipping the blocked local shell action and continuing directly to the final response',
          },
          override: {
            promptAppend: `The human approved skipping the blocked local shell action. Reply exactly with ${REVERSE_APPROVAL_SMOKE_TOKEN} and nothing else.`,
            structuredContext: {
              approvedToSkipBlockedLocalAction: true,
              finalToken: REVERSE_APPROVAL_SMOKE_TOKEN,
            },
          },
        },
      }),
    });
    expect(resumeResponse.status).toBe(200);
    const resumePayload = (await resumeResponse.json()) as Record<string, any>;
    expect(resumePayload).toMatchObject({
      controlResult: {
        kind: 'run-control',
        action: 'resume-human-escalation',
        runId: payload.execution.runtimeRunId,
        status: 'resumed',
        resumed: true,
        reason: 'human approved reverse cross-service team resume',
      },
    });

    const drainResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runControl: {
          action: 'drain-run',
          runId: payload.execution.runtimeRunId,
        },
      }),
    });
    expect(drainResponse.status).toBe(200);
    const drainPayload = (await drainResponse.json()) as Record<string, any>;
    expect(drainPayload).toMatchObject({
      controlResult: {
        kind: 'run-control',
        action: 'drain-run',
        runId: payload.execution.runtimeRunId,
        status: 'executed',
        drained: true,
        reason: 'run executed through targeted host drain',
        skipReason: null,
      },
    });

    const recoveryResponse = await fetch(`http://127.0.0.1:${server.port}/status/recovery/${payload.execution.runtimeRunId}`);
    expect(recoveryResponse.status).toBe(200);
    const recoveryBody = (await recoveryResponse.json()) as {
      object: string;
      detail: {
        runId: string;
        sourceKind: string;
        taskRunSpecId: string | null;
        orchestrationTimelineSummary: {
          total: number;
          items: Array<{
            type: string | null;
            note: string | null;
            stepId: string | null;
          }>;
        } | null;
      };
    };
    expect(recoveryBody.object).toBe('recovery_detail');
    expect(recoveryBody.detail).toMatchObject({
      runId: payload.execution.runtimeRunId,
      sourceKind: 'team-run',
      taskRunSpecId: payload.taskRunSpec.id,
    });
    expect(recoveryBody.detail.orchestrationTimelineSummary?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'note-added',
          note: 'human approved reverse cross-service team resume',
        }),
        expect.objectContaining({
          type: 'step-succeeded',
        }),
        expect.objectContaining({
          type: 'note-added',
          note: 'run executed through targeted host drain',
          stepId: null,
        }),
      ]),
    );

    const responseRead = await fetch(`http://127.0.0.1:${server.port}/v1/responses/${payload.execution.runtimeRunId}`);
    expect(responseRead.status).toBe(200);
    const responseBody = (await responseRead.json()) as {
      id: string;
      object: string;
      status: string;
      metadata?: {
        runId?: string | null;
        taskRunSpecId?: string | null;
        executionSummary?: {
          operatorControlSummary?: {
            humanEscalationResume?: {
              note?: string | null;
            } | null;
            targetedDrain?: {
              status?: string | null;
              reason?: string | null;
              skipReason?: string | null;
            } | null;
          } | null;
        } | null;
      } | null;
    };
    expect(responseBody).toMatchObject({
      id: payload.execution.runtimeRunId,
      object: 'response',
      status: 'completed',
      metadata: {
        runId: payload.execution.runtimeRunId,
        taskRunSpecId: payload.taskRunSpec.id,
        executionSummary: {
          operatorControlSummary: {
            humanEscalationResume: {
              note: 'human approved reverse cross-service team resume',
            },
            targetedDrain: {
              status: 'executed',
              reason: 'run executed through targeted host drain',
              skipReason: null,
            },
          },
        },
      },
    });

    const storedRecord = await control.readRun(payload.execution.runtimeRunId);
    expect(storedRecord?.bundle.run.status).toBe('succeeded');
    expect(
      storedRecord?.bundle.localActionRequests.some(
        (request) => request.status === 'rejected' && request.resultSummary === 'local action rejected because step policy forbids host actions',
      ) ?? false,
    ).toBe(true);
    expect(storedRecord?.bundle.steps.at(-1)?.output?.summary).toBe(REVERSE_APPROVAL_SMOKE_TOKEN);
  } finally {
    await server.close();
  }
}

async function assertCancelledOperatorControlledReverseCrossServiceReadbacks(payload: TeamRunLivePayload) {
  const control = createExecutionRuntimeControl();
  const storedPausedRecord = await control.readRun(payload.execution.runtimeRunId);
  const requestedRequest =
    storedPausedRecord?.bundle.localActionRequests.find((request) => request.status === 'requested') ?? null;
  expect(requestedRequest).not.toBeNull();
  const requestId = requestedRequest?.id ?? null;

  const config = await resolveConfig({}, process.cwd(), process.env);
  const executionHost = createExecutionServiceHost({
    control,
    ownerId: 'live-test:reverse-cross-service-cancellation',
    executeStoredRunStep: createConfiguredStoredStepExecutor(config),
  });
  const server = await createResponsesHttpServer(
    { host: '127.0.0.1', port: 0 },
    {
      control,
      executionHost,
    },
  );

  try {
    const resolveResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        localActionControl: {
          action: 'resolve-request',
          runId: payload.execution.runtimeRunId,
          requestId,
          resolution: 'cancelled',
          note: 'human cancelled requested reverse cross-service local action',
        },
      }),
    });
    expect(resolveResponse.status).toBe(200);
    const resolvePayload = (await resolveResponse.json()) as Record<string, any>;
    expect(resolvePayload).toMatchObject({
      controlResult: {
        kind: 'local-action-control',
        action: 'resolve-local-action-request',
        runId: payload.execution.runtimeRunId,
        requestId,
        resolution: 'cancelled',
        status: 'resolved',
        resolved: true,
        reason: 'human cancelled requested reverse cross-service local action',
      },
    });

    const resumeResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runControl: {
          action: 'resume-human-escalation',
          runId: payload.execution.runtimeRunId,
          note: 'human resumed reverse cross-service team run after cancelling local action',
          guidance: {
            action: 'continue',
            instruction: 'the requested local shell action was cancelled; continue directly to the final response',
          },
          override: {
            promptAppend: `The requested local shell action was cancelled by the operator. Reply exactly with ${REVERSE_CANCELLATION_SMOKE_TOKEN} and nothing else.`,
            structuredContext: {
              cancelledRequestedLocalAction: true,
              finalToken: REVERSE_CANCELLATION_SMOKE_TOKEN,
            },
          },
        },
      }),
    });
    expect(resumeResponse.status).toBe(200);
    const resumePayload = (await resumeResponse.json()) as Record<string, any>;
    expect(resumePayload).toMatchObject({
      controlResult: {
        kind: 'run-control',
        action: 'resume-human-escalation',
        runId: payload.execution.runtimeRunId,
        status: 'resumed',
        resumed: true,
        reason: 'human resumed reverse cross-service team run after cancelling local action',
      },
    });

    const drainResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runControl: {
          action: 'drain-run',
          runId: payload.execution.runtimeRunId,
        },
      }),
    });
    expect(drainResponse.status).toBe(200);
    const drainPayload = (await drainResponse.json()) as Record<string, any>;
    expect(drainPayload).toMatchObject({
      controlResult: {
        kind: 'run-control',
        action: 'drain-run',
        runId: payload.execution.runtimeRunId,
        status: 'executed',
        drained: true,
        reason: 'run executed through targeted host drain',
        skipReason: null,
      },
    });

    const recoveryResponse = await fetch(`http://127.0.0.1:${server.port}/status/recovery/${payload.execution.runtimeRunId}`);
    expect(recoveryResponse.status).toBe(200);
    const recoveryBody = (await recoveryResponse.json()) as {
      object: string;
      detail: {
        runId: string;
        sourceKind: string;
        taskRunSpecId: string | null;
        orchestrationTimelineSummary: {
          total: number;
          items: Array<{
            type: string | null;
            note: string | null;
            stepId: string | null;
          }>;
        } | null;
      };
    };
    expect(recoveryBody.object).toBe('recovery_detail');
    expect(recoveryBody.detail).toMatchObject({
      runId: payload.execution.runtimeRunId,
      sourceKind: 'team-run',
      taskRunSpecId: payload.taskRunSpec.id,
    });
    expect(recoveryBody.detail.orchestrationTimelineSummary?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'note-added',
          note: 'human resumed reverse cross-service team run after cancelling local action',
        }),
        expect.objectContaining({
          type: 'step-succeeded',
        }),
        expect.objectContaining({
          type: 'note-added',
          note: 'run executed through targeted host drain',
          stepId: null,
        }),
      ]),
    );

    const responseRead = await fetch(`http://127.0.0.1:${server.port}/v1/responses/${payload.execution.runtimeRunId}`);
    expect(responseRead.status).toBe(200);
    const responseBody = (await responseRead.json()) as {
      id: string;
      object: string;
      status: string;
      metadata?: {
        runId?: string | null;
        taskRunSpecId?: string | null;
        executionSummary?: {
          operatorControlSummary?: {
            humanEscalationResume?: {
              note?: string | null;
            } | null;
            targetedDrain?: {
              status?: string | null;
              reason?: string | null;
              skipReason?: string | null;
            } | null;
          } | null;
          localActionSummary?: {
            counts?: {
              requested?: number | null;
              cancelled?: number | null;
            } | null;
            items?: Array<{
              requestId?: string | null;
              status?: string | null;
            }>;
          } | null;
        } | null;
      } | null;
    };
    expect(responseBody).toMatchObject({
      id: payload.execution.runtimeRunId,
      object: 'response',
      status: 'completed',
      metadata: {
        runId: payload.execution.runtimeRunId,
        taskRunSpecId: payload.taskRunSpec.id,
        executionSummary: {
          operatorControlSummary: {
            humanEscalationResume: {
              note: 'human resumed reverse cross-service team run after cancelling local action',
            },
            targetedDrain: {
              status: 'executed',
              reason: 'run executed through targeted host drain',
              skipReason: null,
            },
          },
          localActionSummary: {
            counts: {
              requested: 0,
              cancelled: 1,
            },
          },
        },
      },
    });
    expect(
      responseBody.metadata?.executionSummary?.localActionSummary?.items?.some(
        (item) => item.requestId === requestId && item.status === 'cancelled',
      ) ?? false,
    ).toBe(true);

    const storedRecord = await control.readRun(payload.execution.runtimeRunId);
    expect(storedRecord?.bundle.run.status).toBe('succeeded');
    expect(
      storedRecord?.bundle.localActionRequests.some(
        (request) =>
          request.id === requestId &&
          request.status === 'cancelled' &&
          request.resultSummary === 'human cancelled requested reverse cross-service local action',
      ) ?? false,
    ).toBe(true);
    expect(storedRecord?.bundle.steps.at(-1)?.output?.summary).toBe(REVERSE_CANCELLATION_SMOKE_TOKEN);
  } finally {
    await server.close();
  }
}

async function assertRejectedOperatorControlledReverseCrossServiceReadbacks(payload: TeamRunLivePayload) {
  const control = createExecutionRuntimeControl();
  const storedPausedRecord = await control.readRun(payload.execution.runtimeRunId);
  const requestedRequest =
    storedPausedRecord?.bundle.localActionRequests.find((request) => request.status === 'requested') ?? null;
  expect(requestedRequest).not.toBeNull();
  const requestId = requestedRequest?.id ?? null;

  const config = await resolveConfig({}, process.cwd(), process.env);
  const executionHost = createExecutionServiceHost({
    control,
    ownerId: 'live-test:reverse-cross-service-rejection',
    executeStoredRunStep: createConfiguredStoredStepExecutor(config),
  });
  const server = await createResponsesHttpServer(
    { host: '127.0.0.1', port: 0 },
    {
      control,
      executionHost,
    },
  );

  try {
    const resolveResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        localActionControl: {
          action: 'resolve-request',
          runId: payload.execution.runtimeRunId,
          requestId,
          resolution: 'rejected',
          note: 'human rejected requested reverse cross-service local action',
        },
      }),
    });
    expect(resolveResponse.status).toBe(200);
    const resolvePayload = (await resolveResponse.json()) as Record<string, any>;
    expect(resolvePayload).toMatchObject({
      controlResult: {
        kind: 'local-action-control',
        action: 'resolve-local-action-request',
        runId: payload.execution.runtimeRunId,
        requestId,
        resolution: 'rejected',
        status: 'resolved',
        resolved: true,
        reason: 'human rejected requested reverse cross-service local action',
      },
    });

    const resumeResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runControl: {
          action: 'resume-human-escalation',
          runId: payload.execution.runtimeRunId,
          note: 'human resumed reverse cross-service team run after rejecting local action',
          guidance: {
            action: 'continue',
            instruction: 'the requested local shell action was rejected; continue directly to the final response',
          },
          override: {
            promptAppend: `The requested local shell action was rejected by the operator. Reply exactly with ${REVERSE_REJECTION_SMOKE_TOKEN} and nothing else.`,
            structuredContext: {
              rejectedRequestedLocalAction: true,
              finalToken: REVERSE_REJECTION_SMOKE_TOKEN,
            },
          },
        },
      }),
    });
    expect(resumeResponse.status).toBe(200);
    const resumePayload = (await resumeResponse.json()) as Record<string, any>;
    expect(resumePayload).toMatchObject({
      controlResult: {
        kind: 'run-control',
        action: 'resume-human-escalation',
        runId: payload.execution.runtimeRunId,
        status: 'resumed',
        resumed: true,
        reason: 'human resumed reverse cross-service team run after rejecting local action',
      },
    });

    const drainResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runControl: {
          action: 'drain-run',
          runId: payload.execution.runtimeRunId,
        },
      }),
    });
    expect(drainResponse.status).toBe(200);
    const drainPayload = (await drainResponse.json()) as Record<string, any>;
    expect(drainPayload).toMatchObject({
      controlResult: {
        kind: 'run-control',
        action: 'drain-run',
        runId: payload.execution.runtimeRunId,
        status: 'executed',
        drained: true,
        reason: 'run executed through targeted host drain',
        skipReason: null,
      },
    });

    const recoveryResponse = await fetch(`http://127.0.0.1:${server.port}/status/recovery/${payload.execution.runtimeRunId}`);
    expect(recoveryResponse.status).toBe(200);
    const recoveryBody = (await recoveryResponse.json()) as {
      object: string;
      detail: {
        runId: string;
        sourceKind: string;
        taskRunSpecId: string | null;
        orchestrationTimelineSummary: {
          total: number;
          items: Array<{
            type: string | null;
            note: string | null;
            stepId: string | null;
          }>;
        } | null;
      };
    };
    expect(recoveryBody.object).toBe('recovery_detail');
    expect(recoveryBody.detail).toMatchObject({
      runId: payload.execution.runtimeRunId,
      sourceKind: 'team-run',
      taskRunSpecId: payload.taskRunSpec.id,
    });
    expect(recoveryBody.detail.orchestrationTimelineSummary?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'note-added',
          note: 'human resumed reverse cross-service team run after rejecting local action',
        }),
        expect.objectContaining({
          type: 'step-succeeded',
        }),
        expect.objectContaining({
          type: 'note-added',
          note: 'run executed through targeted host drain',
          stepId: null,
        }),
      ]),
    );

    const responseRead = await fetch(`http://127.0.0.1:${server.port}/v1/responses/${payload.execution.runtimeRunId}`);
    expect(responseRead.status).toBe(200);
    const responseBody = (await responseRead.json()) as {
      id: string;
      object: string;
      status: string;
      metadata?: {
        runId?: string | null;
        taskRunSpecId?: string | null;
        executionSummary?: {
          operatorControlSummary?: {
            humanEscalationResume?: {
              note?: string | null;
            } | null;
            targetedDrain?: {
              status?: string | null;
              reason?: string | null;
              skipReason?: string | null;
            } | null;
          } | null;
          localActionSummary?: {
            counts?: {
              requested?: number | null;
              rejected?: number | null;
            } | null;
            items?: Array<{
              requestId?: string | null;
              status?: string | null;
            }>;
          } | null;
        } | null;
      } | null;
    };
    expect(responseBody).toMatchObject({
      id: payload.execution.runtimeRunId,
      object: 'response',
      status: 'completed',
      metadata: {
        runId: payload.execution.runtimeRunId,
        taskRunSpecId: payload.taskRunSpec.id,
        executionSummary: {
          operatorControlSummary: {
            humanEscalationResume: {
              note: 'human resumed reverse cross-service team run after rejecting local action',
            },
            targetedDrain: {
              status: 'executed',
              reason: 'run executed through targeted host drain',
              skipReason: null,
            },
          },
          localActionSummary: {
            counts: {
              requested: 0,
              rejected: 1,
            },
          },
        },
      },
    });
    expect(
      responseBody.metadata?.executionSummary?.localActionSummary?.items?.some(
        (item) => item.requestId === requestId && item.status === 'rejected',
      ) ?? false,
    ).toBe(true);

    const storedRecord = await control.readRun(payload.execution.runtimeRunId);
    expect(storedRecord?.bundle.run.status).toBe('succeeded');
    expect(
      storedRecord?.bundle.localActionRequests.some(
        (request) =>
          request.id === requestId &&
          request.status === 'rejected' &&
          request.resultSummary === 'human rejected requested reverse cross-service local action',
      ) ?? false,
    ).toBe(true);
    expect(storedRecord?.bundle.steps.at(-1)?.output?.summary).toBe(REVERSE_REJECTION_SMOKE_TOKEN);
  } finally {
    await server.close();
  }
}

async function assertApprovedOperatorControlledReverseCrossServiceGeminiReadbacks(payload: TeamRunLivePayload) {
  const control = createExecutionRuntimeControl();
  const config = await resolveConfig({}, process.cwd(), process.env);
  const executionHost = createExecutionServiceHost({
    control,
    ownerId: 'live-test:reverse-cross-service-gemini-approval',
    executeStoredRunStep: createConfiguredStoredStepExecutor(config),
  });
  const server = await createResponsesHttpServer(
    { host: '127.0.0.1', port: 0 },
    {
      control,
      executionHost,
    },
  );

  try {
    const resumeResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runControl: {
          action: 'resume-human-escalation',
          runId: payload.execution.runtimeRunId,
          note: 'human approved reverse cross-service gemini team resume',
          guidance: {
            action: 'continue',
            instruction: 'the human approved skipping the blocked local shell action and continuing directly to the final response',
          },
          override: {
            promptAppend: `The human approved skipping the blocked local shell action. Reply exactly with ${REVERSE_GEMINI_APPROVAL_SMOKE_TOKEN} and nothing else.`,
            structuredContext: {
              approvedToSkipBlockedLocalAction: true,
              finalToken: REVERSE_GEMINI_APPROVAL_SMOKE_TOKEN,
            },
          },
        },
      }),
    });
    expect(resumeResponse.status).toBe(200);
    const resumePayload = (await resumeResponse.json()) as Record<string, any>;
    expect(resumePayload).toMatchObject({
      controlResult: {
        kind: 'run-control',
        action: 'resume-human-escalation',
        runId: payload.execution.runtimeRunId,
        status: 'resumed',
        resumed: true,
        reason: 'human approved reverse cross-service gemini team resume',
      },
    });

    const drainResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runControl: {
          action: 'drain-run',
          runId: payload.execution.runtimeRunId,
        },
      }),
    });
    expect(drainResponse.status).toBe(200);
    const drainPayload = (await drainResponse.json()) as Record<string, any>;
    expect(drainPayload).toMatchObject({
      controlResult: {
        kind: 'run-control',
        action: 'drain-run',
        runId: payload.execution.runtimeRunId,
        status: 'executed',
        drained: true,
        reason: 'run executed through targeted host drain',
        skipReason: null,
      },
    });

    const recoveryResponse = await fetch(`http://127.0.0.1:${server.port}/status/recovery/${payload.execution.runtimeRunId}`);
    expect(recoveryResponse.status).toBe(200);
    const recoveryBody = (await recoveryResponse.json()) as {
      object: string;
      detail: {
        runId: string;
        sourceKind: string;
        taskRunSpecId: string | null;
        orchestrationTimelineSummary: {
          total: number;
          items: Array<{
            type: string | null;
            note: string | null;
            stepId: string | null;
          }>;
        } | null;
      };
    };
    expect(recoveryBody.object).toBe('recovery_detail');
    expect(recoveryBody.detail).toMatchObject({
      runId: payload.execution.runtimeRunId,
      sourceKind: 'team-run',
      taskRunSpecId: payload.taskRunSpec.id,
    });
    expect(recoveryBody.detail.orchestrationTimelineSummary?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'note-added',
          note: 'human approved reverse cross-service gemini team resume',
        }),
        expect.objectContaining({
          type: 'step-succeeded',
        }),
        expect.objectContaining({
          type: 'note-added',
          note: 'run executed through targeted host drain',
          stepId: null,
        }),
      ]),
    );

    const responseRead = await fetch(`http://127.0.0.1:${server.port}/v1/responses/${payload.execution.runtimeRunId}`);
    expect(responseRead.status).toBe(200);
    const responseBody = (await responseRead.json()) as {
      id: string;
      object: string;
      status: string;
      metadata?: {
        runId?: string | null;
        taskRunSpecId?: string | null;
        executionSummary?: {
          operatorControlSummary?: {
            humanEscalationResume?: {
              note?: string | null;
            } | null;
            targetedDrain?: {
              status?: string | null;
              reason?: string | null;
              skipReason?: string | null;
            } | null;
          } | null;
        } | null;
      } | null;
    };
    expect(responseBody).toMatchObject({
      id: payload.execution.runtimeRunId,
      object: 'response',
      status: 'completed',
      metadata: {
        runId: payload.execution.runtimeRunId,
        taskRunSpecId: payload.taskRunSpec.id,
        executionSummary: {
          operatorControlSummary: {
            humanEscalationResume: {
              note: 'human approved reverse cross-service gemini team resume',
            },
            targetedDrain: {
              status: 'executed',
              reason: 'run executed through targeted host drain',
              skipReason: null,
            },
          },
        },
      },
    });

    const storedRecord = await control.readRun(payload.execution.runtimeRunId);
    expect(storedRecord?.bundle.run.status).toBe('succeeded');
    expect(
      storedRecord?.bundle.localActionRequests.some(
        (request) => request.status === 'rejected' && request.resultSummary === 'local action rejected because step policy forbids host actions',
      ) ?? false,
    ).toBe(true);
    expect(storedRecord?.bundle.steps.at(-1)?.output?.summary).toBe(REVERSE_GEMINI_APPROVAL_SMOKE_TOKEN);
  } finally {
    await server.close();
  }
}

async function assertCancelledOperatorControlledReverseCrossServiceGeminiReadbacks(payload: TeamRunLivePayload) {
  const control = createExecutionRuntimeControl();
  const storedPausedRecord = await control.readRun(payload.execution.runtimeRunId);
  const requestedRequest =
    storedPausedRecord?.bundle.localActionRequests.find((request) => request.status === 'requested') ?? null;
  expect(requestedRequest).not.toBeNull();
  const requestId = requestedRequest?.id ?? null;

  const config = await resolveConfig({}, process.cwd(), process.env);
  const executionHost = createExecutionServiceHost({
    control,
    ownerId: 'live-test:reverse-cross-service-gemini-cancellation',
    executeStoredRunStep: createConfiguredStoredStepExecutor(config),
  });
  const server = await createResponsesHttpServer(
    { host: '127.0.0.1', port: 0 },
    {
      control,
      executionHost,
    },
  );

  try {
    const resolveResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        localActionControl: {
          action: 'resolve-request',
          runId: payload.execution.runtimeRunId,
          requestId,
          resolution: 'cancelled',
          note: 'human cancelled requested reverse cross-service gemini local action',
        },
      }),
    });
    expect(resolveResponse.status).toBe(200);
    const resolvePayload = (await resolveResponse.json()) as Record<string, any>;
    expect(resolvePayload).toMatchObject({
      controlResult: {
        kind: 'local-action-control',
        action: 'resolve-local-action-request',
        runId: payload.execution.runtimeRunId,
        requestId,
        resolution: 'cancelled',
        status: 'resolved',
        resolved: true,
        reason: 'human cancelled requested reverse cross-service gemini local action',
      },
    });

    const resumeResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runControl: {
          action: 'resume-human-escalation',
          runId: payload.execution.runtimeRunId,
          note: 'human resumed reverse cross-service gemini team run after cancelling local action',
          guidance: {
            action: 'continue',
            instruction: 'the requested local shell action was cancelled; continue directly to the final response',
          },
          override: {
            promptAppend: `The requested local shell action was cancelled by the operator. Reply exactly with ${REVERSE_GEMINI_CANCELLATION_SMOKE_TOKEN} and nothing else.`,
            structuredContext: {
              cancelledRequestedLocalAction: true,
              finalToken: REVERSE_GEMINI_CANCELLATION_SMOKE_TOKEN,
            },
          },
        },
      }),
    });
    expect(resumeResponse.status).toBe(200);
    const resumePayload = (await resumeResponse.json()) as Record<string, any>;
    expect(resumePayload).toMatchObject({
      controlResult: {
        kind: 'run-control',
        action: 'resume-human-escalation',
        runId: payload.execution.runtimeRunId,
        status: 'resumed',
        resumed: true,
        reason: 'human resumed reverse cross-service gemini team run after cancelling local action',
      },
    });

    const drainResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runControl: {
          action: 'drain-run',
          runId: payload.execution.runtimeRunId,
        },
      }),
    });
    expect(drainResponse.status).toBe(200);
    const drainPayload = (await drainResponse.json()) as Record<string, any>;
    expect(drainPayload).toMatchObject({
      controlResult: {
        kind: 'run-control',
        action: 'drain-run',
        runId: payload.execution.runtimeRunId,
        status: 'executed',
        drained: true,
        reason: 'run executed through targeted host drain',
        skipReason: null,
      },
    });

    const recoveryResponse = await fetch(`http://127.0.0.1:${server.port}/status/recovery/${payload.execution.runtimeRunId}`);
    expect(recoveryResponse.status).toBe(200);
    const recoveryBody = (await recoveryResponse.json()) as {
      object: string;
      detail: {
        runId: string;
        sourceKind: string;
        taskRunSpecId: string | null;
        orchestrationTimelineSummary: {
          total: number;
          items: Array<{
            type: string | null;
            note: string | null;
            stepId: string | null;
          }>;
        } | null;
      };
    };
    expect(recoveryBody.object).toBe('recovery_detail');
    expect(recoveryBody.detail).toMatchObject({
      runId: payload.execution.runtimeRunId,
      sourceKind: 'team-run',
      taskRunSpecId: payload.taskRunSpec.id,
    });
    expect(recoveryBody.detail.orchestrationTimelineSummary?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'note-added',
          note: 'human resumed reverse cross-service gemini team run after cancelling local action',
        }),
        expect.objectContaining({
          type: 'step-succeeded',
        }),
        expect.objectContaining({
          type: 'note-added',
          note: 'run executed through targeted host drain',
          stepId: null,
        }),
      ]),
    );

    const responseRead = await fetch(`http://127.0.0.1:${server.port}/v1/responses/${payload.execution.runtimeRunId}`);
    expect(responseRead.status).toBe(200);
    const responseBody = (await responseRead.json()) as {
      id: string;
      object: string;
      status: string;
      metadata?: {
        runId?: string | null;
        taskRunSpecId?: string | null;
        executionSummary?: {
          operatorControlSummary?: {
            humanEscalationResume?: {
              note?: string | null;
            } | null;
            targetedDrain?: {
              status?: string | null;
              reason?: string | null;
              skipReason?: string | null;
            } | null;
          } | null;
          localActionSummary?: {
            counts?: {
              requested?: number | null;
              cancelled?: number | null;
            } | null;
            items?: Array<{
              requestId?: string | null;
              status?: string | null;
            }>;
          } | null;
        } | null;
      } | null;
    };
    expect(responseBody).toMatchObject({
      id: payload.execution.runtimeRunId,
      object: 'response',
      status: 'completed',
      metadata: {
        runId: payload.execution.runtimeRunId,
        taskRunSpecId: payload.taskRunSpec.id,
        executionSummary: {
          operatorControlSummary: {
            humanEscalationResume: {
              note: 'human resumed reverse cross-service gemini team run after cancelling local action',
            },
            targetedDrain: {
              status: 'executed',
              reason: 'run executed through targeted host drain',
              skipReason: null,
            },
          },
          localActionSummary: {
            counts: {
              requested: 0,
              cancelled: 1,
            },
          },
        },
      },
    });
    expect(
      responseBody.metadata?.executionSummary?.localActionSummary?.items?.some(
        (item) => item.requestId === requestId && item.status === 'cancelled',
      ) ?? false,
    ).toBe(true);

    const storedRecord = await control.readRun(payload.execution.runtimeRunId);
    expect(storedRecord?.bundle.run.status).toBe('succeeded');
    expect(
      storedRecord?.bundle.localActionRequests.some(
        (request) =>
          request.id === requestId &&
          request.status === 'cancelled' &&
          request.resultSummary === 'human cancelled requested reverse cross-service gemini local action',
      ) ?? false,
    ).toBe(true);
    expect(storedRecord?.bundle.steps.at(-1)?.output?.summary).toBe(REVERSE_GEMINI_CANCELLATION_SMOKE_TOKEN);
  } finally {
    await server.close();
  }
}

async function assertRejectedOperatorControlledReverseCrossServiceGeminiReadbacks(payload: TeamRunLivePayload) {
  const control = createExecutionRuntimeControl();
  const storedPausedRecord = await control.readRun(payload.execution.runtimeRunId);
  const requestedRequest =
    storedPausedRecord?.bundle.localActionRequests.find((request) => request.status === 'requested') ?? null;
  expect(requestedRequest).not.toBeNull();
  const requestId = requestedRequest?.id ?? null;

  const config = await resolveConfig({}, process.cwd(), process.env);
  const executionHost = createExecutionServiceHost({
    control,
    ownerId: 'live-test:reverse-cross-service-gemini-rejection',
    executeStoredRunStep: createConfiguredStoredStepExecutor(config),
  });
  const server = await createResponsesHttpServer(
    { host: '127.0.0.1', port: 0 },
    {
      control,
      executionHost,
    },
  );

  try {
    const resolveResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        localActionControl: {
          action: 'resolve-request',
          runId: payload.execution.runtimeRunId,
          requestId,
          resolution: 'rejected',
          note: 'human rejected requested reverse cross-service gemini local action',
        },
      }),
    });
    expect(resolveResponse.status).toBe(200);
    const resolvePayload = (await resolveResponse.json()) as Record<string, any>;
    expect(resolvePayload).toMatchObject({
      controlResult: {
        kind: 'local-action-control',
        action: 'resolve-local-action-request',
        runId: payload.execution.runtimeRunId,
        requestId,
        resolution: 'rejected',
        status: 'resolved',
        resolved: true,
        reason: 'human rejected requested reverse cross-service gemini local action',
      },
    });

    const resumeResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runControl: {
          action: 'resume-human-escalation',
          runId: payload.execution.runtimeRunId,
          note: 'human resumed reverse cross-service gemini team run after rejecting local action',
          guidance: {
            action: 'continue',
            instruction: 'the requested local shell action was rejected; continue directly to the final response',
          },
          override: {
            promptAppend: `The requested local shell action was rejected by the operator. Reply exactly with ${REVERSE_GEMINI_REJECTION_SMOKE_TOKEN} and nothing else.`,
            structuredContext: {
              rejectedRequestedLocalAction: true,
              finalToken: REVERSE_GEMINI_REJECTION_SMOKE_TOKEN,
            },
          },
        },
      }),
    });
    expect(resumeResponse.status).toBe(200);
    const resumePayload = (await resumeResponse.json()) as Record<string, any>;
    expect(resumePayload).toMatchObject({
      controlResult: {
        kind: 'run-control',
        action: 'resume-human-escalation',
        runId: payload.execution.runtimeRunId,
        status: 'resumed',
        resumed: true,
        reason: 'human resumed reverse cross-service gemini team run after rejecting local action',
      },
    });

    const drainResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runControl: {
          action: 'drain-run',
          runId: payload.execution.runtimeRunId,
        },
      }),
    });
    expect(drainResponse.status).toBe(200);
    const drainPayload = (await drainResponse.json()) as Record<string, any>;
    expect(drainPayload).toMatchObject({
      controlResult: {
        kind: 'run-control',
        action: 'drain-run',
        runId: payload.execution.runtimeRunId,
        status: 'executed',
        drained: true,
        reason: 'run executed through targeted host drain',
        skipReason: null,
      },
    });

    const recoveryResponse = await fetch(`http://127.0.0.1:${server.port}/status/recovery/${payload.execution.runtimeRunId}`);
    expect(recoveryResponse.status).toBe(200);
    const recoveryBody = (await recoveryResponse.json()) as {
      object: string;
      detail: {
        runId: string;
        sourceKind: string;
        taskRunSpecId: string | null;
        orchestrationTimelineSummary: {
          total: number;
          items: Array<{
            type: string | null;
            note: string | null;
            stepId: string | null;
          }>;
        } | null;
      };
    };
    expect(recoveryBody.object).toBe('recovery_detail');
    expect(recoveryBody.detail).toMatchObject({
      runId: payload.execution.runtimeRunId,
      sourceKind: 'team-run',
      taskRunSpecId: payload.taskRunSpec.id,
    });
    expect(recoveryBody.detail.orchestrationTimelineSummary?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'note-added',
          note: 'human resumed reverse cross-service gemini team run after rejecting local action',
        }),
        expect.objectContaining({
          type: 'step-succeeded',
        }),
        expect.objectContaining({
          type: 'note-added',
          note: 'run executed through targeted host drain',
          stepId: null,
        }),
      ]),
    );

    const responseRead = await fetch(`http://127.0.0.1:${server.port}/v1/responses/${payload.execution.runtimeRunId}`);
    expect(responseRead.status).toBe(200);
    const responseBody = (await responseRead.json()) as {
      id: string;
      object: string;
      status: string;
      metadata?: {
        runId?: string | null;
        taskRunSpecId?: string | null;
        executionSummary?: {
          operatorControlSummary?: {
            humanEscalationResume?: {
              note?: string | null;
            } | null;
            targetedDrain?: {
              status?: string | null;
              reason?: string | null;
              skipReason?: string | null;
            } | null;
          } | null;
          localActionSummary?: {
            counts?: {
              requested?: number | null;
              rejected?: number | null;
            } | null;
            items?: Array<{
              requestId?: string | null;
              status?: string | null;
            }>;
          } | null;
        } | null;
      } | null;
    };
    expect(responseBody).toMatchObject({
      id: payload.execution.runtimeRunId,
      object: 'response',
      status: 'completed',
      metadata: {
        runId: payload.execution.runtimeRunId,
        taskRunSpecId: payload.taskRunSpec.id,
        executionSummary: {
          operatorControlSummary: {
            humanEscalationResume: {
              note: 'human resumed reverse cross-service gemini team run after rejecting local action',
            },
            targetedDrain: {
              status: 'executed',
              reason: 'run executed through targeted host drain',
              skipReason: null,
            },
          },
          localActionSummary: {
            counts: {
              requested: 0,
              rejected: 1,
            },
          },
        },
      },
    });
    expect(
      responseBody.metadata?.executionSummary?.localActionSummary?.items?.some(
        (item) => item.requestId === requestId && item.status === 'rejected',
      ) ?? false,
    ).toBe(true);

    const storedRecord = await control.readRun(payload.execution.runtimeRunId);
    expect(storedRecord?.bundle.run.status).toBe('succeeded');
    expect(
      storedRecord?.bundle.localActionRequests.some(
        (request) =>
          request.id === requestId &&
          request.status === 'rejected' &&
          request.resultSummary === 'human rejected requested reverse cross-service gemini local action',
      ) ?? false,
    ).toBe(true);
    expect(storedRecord?.bundle.steps.at(-1)?.output?.summary).toBe(REVERSE_GEMINI_REJECTION_SMOKE_TOKEN);
  } finally {
    await server.close();
  }
}

async function assertApprovedOperatorControlledGeminiToChatgptReadbacks(payload: TeamRunLivePayload) {
  const control = createExecutionRuntimeControl();
  const config = await resolveConfig({}, process.cwd(), process.env);
  const executionHost = createExecutionServiceHost({
    control,
    ownerId: 'live-test:gemini-to-chatgpt-approval',
    executeStoredRunStep: createConfiguredStoredStepExecutor(config),
  });
  const server = await createResponsesHttpServer(
    { host: '127.0.0.1', port: 0 },
    {
      control,
      executionHost,
    },
  );

  try {
    const resumeResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runControl: {
          action: 'resume-human-escalation',
          runId: payload.execution.runtimeRunId,
          note: 'human approved gemini to chatgpt team resume',
          guidance: {
            action: 'continue',
            instruction: 'the human approved skipping the blocked local shell action and continuing directly to the final response',
          },
          override: {
            promptAppend: `The human approved skipping the blocked local shell action. Reply exactly with ${GEMINI_TO_CHATGPT_APPROVAL_SMOKE_TOKEN} and nothing else.`,
            structuredContext: {
              approvedToSkipBlockedLocalAction: true,
              finalToken: GEMINI_TO_CHATGPT_APPROVAL_SMOKE_TOKEN,
            },
          },
        },
      }),
    });
    expect(resumeResponse.status).toBe(200);
    const resumePayload = (await resumeResponse.json()) as Record<string, any>;
    expect(resumePayload).toMatchObject({
      controlResult: {
        kind: 'run-control',
        action: 'resume-human-escalation',
        runId: payload.execution.runtimeRunId,
        status: 'resumed',
        resumed: true,
        reason: 'human approved gemini to chatgpt team resume',
      },
    });

    const drainResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runControl: {
          action: 'drain-run',
          runId: payload.execution.runtimeRunId,
        },
      }),
    });
    expect(drainResponse.status).toBe(200);
    const drainPayload = (await drainResponse.json()) as Record<string, any>;
    expect(drainPayload).toMatchObject({
      controlResult: {
        kind: 'run-control',
        action: 'drain-run',
        runId: payload.execution.runtimeRunId,
        status: 'executed',
        drained: true,
        reason: 'run executed through targeted host drain',
        skipReason: null,
      },
    });

    const recoveryResponse = await fetch(`http://127.0.0.1:${server.port}/status/recovery/${payload.execution.runtimeRunId}`);
    expect(recoveryResponse.status).toBe(200);
    const recoveryBody = (await recoveryResponse.json()) as {
      object: string;
      detail: {
        runId: string;
        sourceKind: string;
        taskRunSpecId: string | null;
        orchestrationTimelineSummary: {
          total: number;
          items: Array<{
            type: string | null;
            note: string | null;
            stepId: string | null;
          }>;
        } | null;
      };
    };
    expect(recoveryBody.object).toBe('recovery_detail');
    expect(recoveryBody.detail).toMatchObject({
      runId: payload.execution.runtimeRunId,
      sourceKind: 'team-run',
      taskRunSpecId: payload.taskRunSpec.id,
    });
    expect(recoveryBody.detail.orchestrationTimelineSummary?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'note-added',
          note: 'human approved gemini to chatgpt team resume',
        }),
        expect.objectContaining({
          type: 'step-succeeded',
        }),
        expect.objectContaining({
          type: 'note-added',
          note: 'run executed through targeted host drain',
          stepId: null,
        }),
      ]),
    );

    const responseRead = await fetch(`http://127.0.0.1:${server.port}/v1/responses/${payload.execution.runtimeRunId}`);
    expect(responseRead.status).toBe(200);
    const responseBody = (await responseRead.json()) as {
      id: string;
      object: string;
      status: string;
      metadata?: {
        runId?: string | null;
        taskRunSpecId?: string | null;
        executionSummary?: {
          operatorControlSummary?: {
            humanEscalationResume?: {
              note?: string | null;
            } | null;
            targetedDrain?: {
              status?: string | null;
              reason?: string | null;
              skipReason?: string | null;
            } | null;
          } | null;
        } | null;
      } | null;
    };
    expect(responseBody).toMatchObject({
      id: payload.execution.runtimeRunId,
      object: 'response',
      status: 'completed',
      metadata: {
        runId: payload.execution.runtimeRunId,
        taskRunSpecId: payload.taskRunSpec.id,
        executionSummary: {
          operatorControlSummary: {
            humanEscalationResume: {
              note: 'human approved gemini to chatgpt team resume',
            },
            targetedDrain: {
              status: 'executed',
              reason: 'run executed through targeted host drain',
              skipReason: null,
            },
          },
        },
      },
    });

    const storedRecord = await control.readRun(payload.execution.runtimeRunId);
    expect(storedRecord?.bundle.run.status).toBe('succeeded');
    expect(
      storedRecord?.bundle.localActionRequests.some(
        (request) => request.status === 'rejected' && request.resultSummary === 'local action rejected because step policy forbids host actions',
      ) ?? false,
    ).toBe(true);
    expect(storedRecord?.bundle.steps.at(-1)?.output?.summary).toBe(GEMINI_TO_CHATGPT_APPROVAL_SMOKE_TOKEN);
  } finally {
    await server.close();
  }
}

async function assertCancelledOperatorControlledGeminiToChatgptReadbacks(payload: TeamRunLivePayload) {
  const control = createExecutionRuntimeControl();
  const storedPausedRecord = await control.readRun(payload.execution.runtimeRunId);
  const requestedRequest =
    storedPausedRecord?.bundle.localActionRequests.find((request) => request.status === 'requested') ?? null;
  expect(requestedRequest).not.toBeNull();
  const requestId = requestedRequest?.id ?? null;

  const config = await resolveConfig({}, process.cwd(), process.env);
  const executionHost = createExecutionServiceHost({
    control,
    ownerId: 'live-test:gemini-to-chatgpt-cancellation',
    executeStoredRunStep: createConfiguredStoredStepExecutor(config),
  });
  const server = await createResponsesHttpServer(
    { host: '127.0.0.1', port: 0 },
    {
      control,
      executionHost,
    },
  );

  try {
    const resolveResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        localActionControl: {
          action: 'resolve-request',
          runId: payload.execution.runtimeRunId,
          requestId,
          resolution: 'cancelled',
          note: 'human cancelled requested gemini to chatgpt local action',
        },
      }),
    });
    expect(resolveResponse.status).toBe(200);
    const resolvePayload = (await resolveResponse.json()) as Record<string, any>;
    expect(resolvePayload).toMatchObject({
      controlResult: {
        kind: 'local-action-control',
        action: 'resolve-local-action-request',
        runId: payload.execution.runtimeRunId,
        requestId,
        resolution: 'cancelled',
        status: 'resolved',
        resolved: true,
        reason: 'human cancelled requested gemini to chatgpt local action',
      },
    });

    const resumeResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runControl: {
          action: 'resume-human-escalation',
          runId: payload.execution.runtimeRunId,
          note: 'human resumed gemini to chatgpt team run after cancelling local action',
          guidance: {
            action: 'continue',
            instruction: 'the requested local shell action was cancelled; continue directly to the final response',
          },
          override: {
            promptAppend: `The requested local shell action was cancelled by the operator. Reply exactly with ${GEMINI_TO_CHATGPT_CANCELLATION_SMOKE_TOKEN} and nothing else.`,
            structuredContext: {
              cancelledRequestedLocalAction: true,
              finalToken: GEMINI_TO_CHATGPT_CANCELLATION_SMOKE_TOKEN,
            },
          },
        },
      }),
    });
    expect(resumeResponse.status).toBe(200);
    const resumePayload = (await resumeResponse.json()) as Record<string, any>;
    expect(resumePayload).toMatchObject({
      controlResult: {
        kind: 'run-control',
        action: 'resume-human-escalation',
        runId: payload.execution.runtimeRunId,
        status: 'resumed',
        resumed: true,
        reason: 'human resumed gemini to chatgpt team run after cancelling local action',
      },
    });

    const drainResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runControl: {
          action: 'drain-run',
          runId: payload.execution.runtimeRunId,
        },
      }),
    });
    expect(drainResponse.status).toBe(200);
    const drainPayload = (await drainResponse.json()) as Record<string, any>;
    expect(drainPayload).toMatchObject({
      controlResult: {
        kind: 'run-control',
        action: 'drain-run',
        runId: payload.execution.runtimeRunId,
        status: 'executed',
        drained: true,
        reason: 'run executed through targeted host drain',
        skipReason: null,
      },
    });

    const recoveryResponse = await fetch(`http://127.0.0.1:${server.port}/status/recovery/${payload.execution.runtimeRunId}`);
    expect(recoveryResponse.status).toBe(200);
    const recoveryBody = (await recoveryResponse.json()) as {
      object: string;
      detail: {
        runId: string;
        sourceKind: string;
        taskRunSpecId: string | null;
        orchestrationTimelineSummary: {
          total: number;
          items: Array<{
            type: string | null;
            note: string | null;
            stepId: string | null;
          }>;
        } | null;
      };
    };
    expect(recoveryBody.object).toBe('recovery_detail');
    expect(recoveryBody.detail).toMatchObject({
      runId: payload.execution.runtimeRunId,
      sourceKind: 'team-run',
      taskRunSpecId: payload.taskRunSpec.id,
    });
    expect(recoveryBody.detail.orchestrationTimelineSummary?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'note-added',
          note: 'human resumed gemini to chatgpt team run after cancelling local action',
        }),
        expect.objectContaining({
          type: 'step-succeeded',
        }),
        expect.objectContaining({
          type: 'note-added',
          note: 'run executed through targeted host drain',
          stepId: null,
        }),
      ]),
    );

    const responseRead = await fetch(`http://127.0.0.1:${server.port}/v1/responses/${payload.execution.runtimeRunId}`);
    expect(responseRead.status).toBe(200);
    const responseBody = (await responseRead.json()) as {
      id: string;
      object: string;
      status: string;
      metadata?: {
        runId?: string | null;
        taskRunSpecId?: string | null;
        executionSummary?: {
          operatorControlSummary?: {
            humanEscalationResume?: {
              note?: string | null;
            } | null;
            targetedDrain?: {
              status?: string | null;
              reason?: string | null;
              skipReason?: string | null;
            } | null;
          } | null;
          localActionSummary?: {
            counts?: {
              requested?: number | null;
              cancelled?: number | null;
            } | null;
            items?: Array<{
              requestId?: string | null;
              status?: string | null;
            }>;
          } | null;
        } | null;
      } | null;
    };
    expect(responseBody).toMatchObject({
      id: payload.execution.runtimeRunId,
      object: 'response',
      status: 'completed',
      metadata: {
        runId: payload.execution.runtimeRunId,
        taskRunSpecId: payload.taskRunSpec.id,
        executionSummary: {
          operatorControlSummary: {
            humanEscalationResume: {
              note: 'human resumed gemini to chatgpt team run after cancelling local action',
            },
            targetedDrain: {
              status: 'executed',
              reason: 'run executed through targeted host drain',
              skipReason: null,
            },
          },
          localActionSummary: {
            counts: {
              requested: 0,
              cancelled: 1,
            },
          },
        },
      },
    });
    expect(
      responseBody.metadata?.executionSummary?.localActionSummary?.items?.some(
        (item) => item.requestId === requestId && item.status === 'cancelled',
      ) ?? false,
    ).toBe(true);

    const storedRecord = await control.readRun(payload.execution.runtimeRunId);
    expect(storedRecord?.bundle.run.status).toBe('succeeded');
    expect(
      storedRecord?.bundle.localActionRequests.some(
        (request) =>
          request.id === requestId &&
          request.status === 'cancelled' &&
          request.resultSummary === 'human cancelled requested gemini to chatgpt local action',
      ) ?? false,
    ).toBe(true);
    expect(storedRecord?.bundle.steps.at(-1)?.output?.summary).toBe(GEMINI_TO_CHATGPT_CANCELLATION_SMOKE_TOKEN);
  } finally {
    await server.close();
  }
}

async function assertRejectedOperatorControlledGeminiToChatgptReadbacks(payload: TeamRunLivePayload) {
  const control = createExecutionRuntimeControl();
  const storedPausedRecord = await control.readRun(payload.execution.runtimeRunId);
  const requestedRequest =
    storedPausedRecord?.bundle.localActionRequests.find((request) => request.status === 'requested') ?? null;
  expect(requestedRequest).not.toBeNull();
  const requestId = requestedRequest?.id ?? null;

  const config = await resolveConfig({}, process.cwd(), process.env);
  const executionHost = createExecutionServiceHost({
    control,
    ownerId: 'live-test:gemini-to-chatgpt-rejection',
    executeStoredRunStep: createConfiguredStoredStepExecutor(config),
  });
  const server = await createResponsesHttpServer(
    { host: '127.0.0.1', port: 0 },
    {
      control,
      executionHost,
    },
  );

  try {
    const resolveResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        localActionControl: {
          action: 'resolve-request',
          runId: payload.execution.runtimeRunId,
          requestId,
          resolution: 'rejected',
          note: 'human rejected requested gemini to chatgpt local action',
        },
      }),
    });
    expect(resolveResponse.status).toBe(200);
    const resolvePayload = (await resolveResponse.json()) as Record<string, any>;
    expect(resolvePayload).toMatchObject({
      controlResult: {
        kind: 'local-action-control',
        action: 'resolve-local-action-request',
        runId: payload.execution.runtimeRunId,
        requestId,
        resolution: 'rejected',
        status: 'resolved',
        resolved: true,
        reason: 'human rejected requested gemini to chatgpt local action',
      },
    });

    const resumeResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runControl: {
          action: 'resume-human-escalation',
          runId: payload.execution.runtimeRunId,
          note: 'human resumed gemini to chatgpt team run after rejecting local action',
          guidance: {
            action: 'continue',
            instruction: 'the requested local shell action was rejected; continue directly to the final response',
          },
          override: {
            promptAppend: `The requested local shell action was rejected by the operator. Reply exactly with ${GEMINI_TO_CHATGPT_REJECTION_SMOKE_TOKEN} and nothing else.`,
            structuredContext: {
              rejectedRequestedLocalAction: true,
              finalToken: GEMINI_TO_CHATGPT_REJECTION_SMOKE_TOKEN,
            },
          },
        },
      }),
    });
    expect(resumeResponse.status).toBe(200);
    const resumePayload = (await resumeResponse.json()) as Record<string, any>;
    expect(resumePayload).toMatchObject({
      controlResult: {
        kind: 'run-control',
        action: 'resume-human-escalation',
        runId: payload.execution.runtimeRunId,
        status: 'resumed',
        resumed: true,
        reason: 'human resumed gemini to chatgpt team run after rejecting local action',
      },
    });

    const drainResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runControl: {
          action: 'drain-run',
          runId: payload.execution.runtimeRunId,
        },
      }),
    });
    expect(drainResponse.status).toBe(200);
    const drainPayload = (await drainResponse.json()) as Record<string, any>;
    expect(drainPayload).toMatchObject({
      controlResult: {
        kind: 'run-control',
        action: 'drain-run',
        runId: payload.execution.runtimeRunId,
        status: 'executed',
        drained: true,
        reason: 'run executed through targeted host drain',
        skipReason: null,
      },
    });

    const recoveryResponse = await fetch(`http://127.0.0.1:${server.port}/status/recovery/${payload.execution.runtimeRunId}`);
    expect(recoveryResponse.status).toBe(200);
    const recoveryBody = (await recoveryResponse.json()) as {
      object: string;
      detail: {
        runId: string;
        sourceKind: string;
        taskRunSpecId: string | null;
        orchestrationTimelineSummary: {
          total: number;
          items: Array<{
            type: string | null;
            note: string | null;
            stepId: string | null;
          }>;
        } | null;
      };
    };
    expect(recoveryBody.object).toBe('recovery_detail');
    expect(recoveryBody.detail).toMatchObject({
      runId: payload.execution.runtimeRunId,
      sourceKind: 'team-run',
      taskRunSpecId: payload.taskRunSpec.id,
    });
    expect(recoveryBody.detail.orchestrationTimelineSummary?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'note-added',
          note: 'human resumed gemini to chatgpt team run after rejecting local action',
        }),
        expect.objectContaining({
          type: 'step-succeeded',
        }),
        expect.objectContaining({
          type: 'note-added',
          note: 'run executed through targeted host drain',
          stepId: null,
        }),
      ]),
    );

    const responseRead = await fetch(`http://127.0.0.1:${server.port}/v1/responses/${payload.execution.runtimeRunId}`);
    expect(responseRead.status).toBe(200);
    const responseBody = (await responseRead.json()) as {
      id: string;
      object: string;
      status: string;
      metadata?: {
        runId?: string | null;
        taskRunSpecId?: string | null;
        executionSummary?: {
          operatorControlSummary?: {
            humanEscalationResume?: {
              note?: string | null;
            } | null;
            targetedDrain?: {
              status?: string | null;
              reason?: string | null;
              skipReason?: string | null;
            } | null;
          } | null;
          localActionSummary?: {
            counts?: {
              requested?: number | null;
              rejected?: number | null;
            } | null;
            items?: Array<{
              requestId?: string | null;
              status?: string | null;
            }>;
          } | null;
        } | null;
      } | null;
    };
    expect(responseBody).toMatchObject({
      id: payload.execution.runtimeRunId,
      object: 'response',
      status: 'completed',
      metadata: {
        runId: payload.execution.runtimeRunId,
        taskRunSpecId: payload.taskRunSpec.id,
        executionSummary: {
          operatorControlSummary: {
            humanEscalationResume: {
              note: 'human resumed gemini to chatgpt team run after rejecting local action',
            },
            targetedDrain: {
              status: 'executed',
              reason: 'run executed through targeted host drain',
              skipReason: null,
            },
          },
          localActionSummary: {
            counts: {
              requested: 0,
              rejected: 1,
            },
          },
        },
      },
    });
    expect(
      responseBody.metadata?.executionSummary?.localActionSummary?.items?.some(
        (item) => item.requestId === requestId && item.status === 'rejected',
      ) ?? false,
    ).toBe(true);

    const storedRecord = await control.readRun(payload.execution.runtimeRunId);
    expect(storedRecord?.bundle.run.status).toBe('succeeded');
    expect(
      storedRecord?.bundle.localActionRequests.some(
        (request) =>
          request.id === requestId &&
          request.status === 'rejected' &&
          request.resultSummary === 'human rejected requested gemini to chatgpt local action',
      ) ?? false,
    ).toBe(true);
    expect(storedRecord?.bundle.steps.at(-1)?.output?.summary).toBe(GEMINI_TO_CHATGPT_REJECTION_SMOKE_TOKEN);
  } finally {
    await server.close();
  }
}

async function assertApprovedOperatorControlledCrossServiceGeminiReadbacks(payload: TeamRunLivePayload) {
  const control = createExecutionRuntimeControl();
  const config = await resolveConfig({}, process.cwd(), process.env);
  const executionHost = createExecutionServiceHost({
    control,
    ownerId: 'live-test:cross-service-gemini-approval',
    executeStoredRunStep: createConfiguredStoredStepExecutor(config),
  });
  const server = await createResponsesHttpServer(
    { host: '127.0.0.1', port: 0 },
    {
      control,
      executionHost,
    },
  );

  try {
    const resumeResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runControl: {
          action: 'resume-human-escalation',
          runId: payload.execution.runtimeRunId,
          note: 'human approved cross-service gemini team resume',
          guidance: {
            action: 'continue',
            instruction: 'the human approved skipping the blocked local shell action and continuing directly to the final response',
          },
          override: {
            promptAppend: `The human approved skipping the blocked local shell action. Reply exactly with ${GEMINI_APPROVAL_SMOKE_TOKEN} and nothing else.`,
            structuredContext: {
              approvedToSkipBlockedLocalAction: true,
              finalToken: GEMINI_APPROVAL_SMOKE_TOKEN,
            },
          },
        },
      }),
    });
    expect(resumeResponse.status).toBe(200);
    const resumePayload = (await resumeResponse.json()) as Record<string, any>;
    expect(resumePayload).toMatchObject({
      controlResult: {
        kind: 'run-control',
        action: 'resume-human-escalation',
        runId: payload.execution.runtimeRunId,
        status: 'resumed',
        resumed: true,
        reason: 'human approved cross-service gemini team resume',
      },
    });

    const drainResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runControl: {
          action: 'drain-run',
          runId: payload.execution.runtimeRunId,
        },
      }),
    });
    expect(drainResponse.status).toBe(200);
    const drainPayload = (await drainResponse.json()) as Record<string, any>;
    expect(drainPayload).toMatchObject({
      controlResult: {
        kind: 'run-control',
        action: 'drain-run',
        runId: payload.execution.runtimeRunId,
        status: 'executed',
        drained: true,
        reason: 'run executed through targeted host drain',
        skipReason: null,
      },
    });

    const recoveryResponse = await fetch(`http://127.0.0.1:${server.port}/status/recovery/${payload.execution.runtimeRunId}`);
    expect(recoveryResponse.status).toBe(200);
    const recoveryBody = (await recoveryResponse.json()) as {
      object: string;
      detail: {
        runId: string;
        sourceKind: string;
        taskRunSpecId: string | null;
        orchestrationTimelineSummary: {
          total: number;
          items: Array<{
            type: string | null;
            note: string | null;
            stepId: string | null;
          }>;
        } | null;
      };
    };
    expect(recoveryBody.object).toBe('recovery_detail');
    expect(recoveryBody.detail).toMatchObject({
      runId: payload.execution.runtimeRunId,
      sourceKind: 'team-run',
      taskRunSpecId: payload.taskRunSpec.id,
    });
    expect(recoveryBody.detail.orchestrationTimelineSummary?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'note-added',
          note: 'human approved cross-service gemini team resume',
        }),
        expect.objectContaining({
          type: 'step-succeeded',
        }),
        expect.objectContaining({
          type: 'note-added',
          note: 'run executed through targeted host drain',
          stepId: null,
        }),
      ]),
    );

    const responseRead = await fetch(`http://127.0.0.1:${server.port}/v1/responses/${payload.execution.runtimeRunId}`);
    expect(responseRead.status).toBe(200);
    const responseBody = (await responseRead.json()) as {
      id: string;
      object: string;
      status: string;
      metadata?: {
        runId?: string | null;
        taskRunSpecId?: string | null;
        executionSummary?: {
          operatorControlSummary?: {
            humanEscalationResume?: {
              note?: string | null;
            } | null;
            targetedDrain?: {
              status?: string | null;
              reason?: string | null;
              skipReason?: string | null;
            } | null;
          } | null;
        } | null;
      } | null;
    };
    expect(responseBody).toMatchObject({
      id: payload.execution.runtimeRunId,
      object: 'response',
      status: 'completed',
      metadata: {
        runId: payload.execution.runtimeRunId,
        taskRunSpecId: payload.taskRunSpec.id,
        executionSummary: {
          operatorControlSummary: {
            humanEscalationResume: {
              note: 'human approved cross-service gemini team resume',
            },
            targetedDrain: {
              status: 'executed',
              reason: 'run executed through targeted host drain',
              skipReason: null,
            },
          },
        },
      },
    });

    const storedRecord = await control.readRun(payload.execution.runtimeRunId);
    expect(storedRecord?.bundle.run.status).toBe('succeeded');
    expect(
      storedRecord?.bundle.localActionRequests.some(
        (request) => request.status === 'rejected' && request.resultSummary === 'local action rejected because step policy forbids host actions',
      ) ?? false,
    ).toBe(true);
    expect(storedRecord?.bundle.steps.at(-1)?.output?.summary).toBe(GEMINI_APPROVAL_SMOKE_TOKEN);
  } finally {
    await server.close();
  }
}

async function assertRejectedOperatorControlledCrossServiceGeminiReadbacks(payload: TeamRunLivePayload) {
  const control = createExecutionRuntimeControl();
  const storedPausedRecord = await control.readRun(payload.execution.runtimeRunId);
  const requestedRequest =
    storedPausedRecord?.bundle.localActionRequests.find((request) => request.status === 'requested') ?? null;
  expect(requestedRequest).not.toBeNull();
  const requestId = requestedRequest?.id ?? null;

  const config = await resolveConfig({}, process.cwd(), process.env);
  const executionHost = createExecutionServiceHost({
    control,
    ownerId: 'live-test:cross-service-gemini-rejection',
    executeStoredRunStep: createConfiguredStoredStepExecutor(config),
  });
  const server = await createResponsesHttpServer(
    { host: '127.0.0.1', port: 0 },
    {
      control,
      executionHost,
    },
  );

  try {
    const resolveResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        localActionControl: {
          action: 'resolve-request',
          runId: payload.execution.runtimeRunId,
          requestId,
          resolution: 'rejected',
          note: 'human rejected requested cross-service gemini local action',
        },
      }),
    });
    expect(resolveResponse.status).toBe(200);
    const resolvePayload = (await resolveResponse.json()) as Record<string, any>;
    expect(resolvePayload).toMatchObject({
      controlResult: {
        kind: 'local-action-control',
        action: 'resolve-local-action-request',
        runId: payload.execution.runtimeRunId,
        requestId,
        resolution: 'rejected',
        status: 'resolved',
        resolved: true,
        reason: 'human rejected requested cross-service gemini local action',
      },
    });

    const resumeResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runControl: {
          action: 'resume-human-escalation',
          runId: payload.execution.runtimeRunId,
          note: 'human resumed cross-service gemini team run after rejecting local action',
          guidance: {
            action: 'continue',
            instruction: 'the requested local shell action was rejected; continue directly to the final response',
          },
          override: {
            promptAppend: `The requested local shell action was rejected by the operator. Reply exactly with ${GEMINI_REJECTION_SMOKE_TOKEN} and nothing else.`,
            structuredContext: {
              rejectedRequestedLocalAction: true,
              finalToken: GEMINI_REJECTION_SMOKE_TOKEN,
            },
          },
        },
      }),
    });
    expect(resumeResponse.status).toBe(200);
    const resumePayload = (await resumeResponse.json()) as Record<string, any>;
    expect(resumePayload).toMatchObject({
      controlResult: {
        kind: 'run-control',
        action: 'resume-human-escalation',
        runId: payload.execution.runtimeRunId,
        status: 'resumed',
        resumed: true,
        reason: 'human resumed cross-service gemini team run after rejecting local action',
      },
    });

    const drainResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runControl: {
          action: 'drain-run',
          runId: payload.execution.runtimeRunId,
        },
      }),
    });
    expect(drainResponse.status).toBe(200);
    const drainPayload = (await drainResponse.json()) as Record<string, any>;
    expect(drainPayload).toMatchObject({
      controlResult: {
        kind: 'run-control',
        action: 'drain-run',
        runId: payload.execution.runtimeRunId,
        status: 'executed',
        drained: true,
        reason: 'run executed through targeted host drain',
        skipReason: null,
      },
    });

    const recoveryResponse = await fetch(`http://127.0.0.1:${server.port}/status/recovery/${payload.execution.runtimeRunId}`);
    expect(recoveryResponse.status).toBe(200);
    const recoveryBody = (await recoveryResponse.json()) as {
      object: string;
      detail: {
        runId: string;
        sourceKind: string;
        taskRunSpecId: string | null;
        orchestrationTimelineSummary: {
          total: number;
          items: Array<{
            type: string | null;
            note: string | null;
            stepId: string | null;
          }>;
        } | null;
      };
    };
    expect(recoveryBody.object).toBe('recovery_detail');
    expect(recoveryBody.detail).toMatchObject({
      runId: payload.execution.runtimeRunId,
      sourceKind: 'team-run',
      taskRunSpecId: payload.taskRunSpec.id,
    });
    expect(recoveryBody.detail.orchestrationTimelineSummary?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'note-added',
          note: 'human resumed cross-service gemini team run after rejecting local action',
        }),
        expect.objectContaining({
          type: 'step-succeeded',
        }),
        expect.objectContaining({
          type: 'note-added',
          note: 'run executed through targeted host drain',
          stepId: null,
        }),
      ]),
    );

    const responseRead = await fetch(`http://127.0.0.1:${server.port}/v1/responses/${payload.execution.runtimeRunId}`);
    expect(responseRead.status).toBe(200);
    const responseBody = (await responseRead.json()) as {
      id: string;
      object: string;
      status: string;
      metadata?: {
        runId?: string | null;
        taskRunSpecId?: string | null;
        executionSummary?: {
          operatorControlSummary?: {
            humanEscalationResume?: {
              note?: string | null;
            } | null;
            targetedDrain?: {
              status?: string | null;
              reason?: string | null;
              skipReason?: string | null;
            } | null;
          } | null;
          localActionSummary?: {
            counts?: {
              requested?: number | null;
              rejected?: number | null;
            } | null;
            items?: Array<{
              requestId?: string | null;
              status?: string | null;
            }>;
          } | null;
        } | null;
      } | null;
    };
    expect(responseBody).toMatchObject({
      id: payload.execution.runtimeRunId,
      object: 'response',
      status: 'completed',
      metadata: {
        runId: payload.execution.runtimeRunId,
        taskRunSpecId: payload.taskRunSpec.id,
        executionSummary: {
          operatorControlSummary: {
            humanEscalationResume: {
              note: 'human resumed cross-service gemini team run after rejecting local action',
            },
            targetedDrain: {
              status: 'executed',
              reason: 'run executed through targeted host drain',
              skipReason: null,
            },
          },
          localActionSummary: {
            counts: {
              requested: 0,
              rejected: 1,
            },
          },
        },
      },
    });
    expect(
      responseBody.metadata?.executionSummary?.localActionSummary?.items?.some(
        (item) => item.requestId === requestId && item.status === 'rejected',
      ) ?? false,
    ).toBe(true);

    const storedRecord = await control.readRun(payload.execution.runtimeRunId);
    expect(storedRecord?.bundle.run.status).toBe('succeeded');
    expect(
      storedRecord?.bundle.localActionRequests.some(
        (request) =>
          request.id === requestId &&
          request.status === 'rejected' &&
          request.resultSummary === 'human rejected requested cross-service gemini local action',
      ) ?? false,
    ).toBe(true);
    expect(storedRecord?.bundle.steps.at(-1)?.output?.summary).toBe(GEMINI_REJECTION_SMOKE_TOKEN);
  } finally {
    await server.close();
  }
}

async function assertCancelledOperatorControlledCrossServiceGeminiReadbacks(payload: TeamRunLivePayload) {
  const control = createExecutionRuntimeControl();
  const storedPausedRecord = await control.readRun(payload.execution.runtimeRunId);
  const requestedRequest =
    storedPausedRecord?.bundle.localActionRequests.find((request) => request.status === 'requested') ?? null;
  expect(requestedRequest).not.toBeNull();
  const requestId = requestedRequest?.id ?? null;

  const config = await resolveConfig({}, process.cwd(), process.env);
  const executionHost = createExecutionServiceHost({
    control,
    ownerId: 'live-test:cross-service-gemini-cancellation',
    executeStoredRunStep: createConfiguredStoredStepExecutor(config),
  });
  const server = await createResponsesHttpServer(
    { host: '127.0.0.1', port: 0 },
    {
      control,
      executionHost,
    },
  );

  try {
    const resolveResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        localActionControl: {
          action: 'resolve-request',
          runId: payload.execution.runtimeRunId,
          requestId,
          resolution: 'cancelled',
          note: 'human cancelled requested cross-service gemini local action',
        },
      }),
    });
    expect(resolveResponse.status).toBe(200);
    const resolvePayload = (await resolveResponse.json()) as Record<string, any>;
    expect(resolvePayload).toMatchObject({
      controlResult: {
        kind: 'local-action-control',
        action: 'resolve-local-action-request',
        runId: payload.execution.runtimeRunId,
        requestId,
        resolution: 'cancelled',
        status: 'resolved',
        resolved: true,
        reason: 'human cancelled requested cross-service gemini local action',
      },
    });

    const resumeResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runControl: {
          action: 'resume-human-escalation',
          runId: payload.execution.runtimeRunId,
          note: 'human resumed cross-service gemini team run after cancelling local action',
          guidance: {
            action: 'continue',
            instruction: 'the requested local shell action was cancelled; continue directly to the final response',
          },
          override: {
            promptAppend: `The requested local shell action was cancelled by the operator. Reply exactly with ${GEMINI_CANCELLATION_SMOKE_TOKEN} and nothing else.`,
            structuredContext: {
              cancelledRequestedLocalAction: true,
              finalToken: GEMINI_CANCELLATION_SMOKE_TOKEN,
            },
          },
        },
      }),
    });
    expect(resumeResponse.status).toBe(200);
    const resumePayload = (await resumeResponse.json()) as Record<string, any>;
    expect(resumePayload).toMatchObject({
      controlResult: {
        kind: 'run-control',
        action: 'resume-human-escalation',
        runId: payload.execution.runtimeRunId,
        status: 'resumed',
        resumed: true,
        reason: 'human resumed cross-service gemini team run after cancelling local action',
      },
    });

    const drainResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runControl: {
          action: 'drain-run',
          runId: payload.execution.runtimeRunId,
        },
      }),
    });
    expect(drainResponse.status).toBe(200);
    const drainPayload = (await drainResponse.json()) as Record<string, any>;
    expect(drainPayload).toMatchObject({
      controlResult: {
        kind: 'run-control',
        action: 'drain-run',
        runId: payload.execution.runtimeRunId,
        status: 'executed',
        drained: true,
        reason: 'run executed through targeted host drain',
        skipReason: null,
      },
    });

    const recoveryResponse = await fetch(`http://127.0.0.1:${server.port}/status/recovery/${payload.execution.runtimeRunId}`);
    expect(recoveryResponse.status).toBe(200);
    const recoveryBody = (await recoveryResponse.json()) as {
      object: string;
      detail: {
        runId: string;
        sourceKind: string;
        taskRunSpecId: string | null;
        orchestrationTimelineSummary: {
          total: number;
          items: Array<{
            type: string | null;
            note: string | null;
            stepId: string | null;
          }>;
        } | null;
      };
    };
    expect(recoveryBody.object).toBe('recovery_detail');
    expect(recoveryBody.detail).toMatchObject({
      runId: payload.execution.runtimeRunId,
      sourceKind: 'team-run',
      taskRunSpecId: payload.taskRunSpec.id,
    });
    expect(recoveryBody.detail.orchestrationTimelineSummary?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'note-added',
          note: 'human resumed cross-service gemini team run after cancelling local action',
        }),
        expect.objectContaining({
          type: 'step-succeeded',
        }),
        expect.objectContaining({
          type: 'note-added',
          note: 'run executed through targeted host drain',
          stepId: null,
        }),
      ]),
    );

    const responseRead = await fetch(`http://127.0.0.1:${server.port}/v1/responses/${payload.execution.runtimeRunId}`);
    expect(responseRead.status).toBe(200);
    const responseBody = (await responseRead.json()) as {
      id: string;
      object: string;
      status: string;
      metadata?: {
        runId?: string | null;
        taskRunSpecId?: string | null;
        executionSummary?: {
          operatorControlSummary?: {
            humanEscalationResume?: {
              note?: string | null;
            } | null;
            targetedDrain?: {
              status?: string | null;
              reason?: string | null;
              skipReason?: string | null;
            } | null;
          } | null;
          localActionSummary?: {
            counts?: {
              requested?: number | null;
              cancelled?: number | null;
            } | null;
            items?: Array<{
              requestId?: string | null;
              status?: string | null;
            }>;
          } | null;
        } | null;
      } | null;
    };
    expect(responseBody).toMatchObject({
      id: payload.execution.runtimeRunId,
      object: 'response',
      status: 'completed',
      metadata: {
        runId: payload.execution.runtimeRunId,
        taskRunSpecId: payload.taskRunSpec.id,
        executionSummary: {
          operatorControlSummary: {
            humanEscalationResume: {
              note: 'human resumed cross-service gemini team run after cancelling local action',
            },
            targetedDrain: {
              status: 'executed',
              reason: 'run executed through targeted host drain',
              skipReason: null,
            },
          },
          localActionSummary: {
            counts: {
              requested: 0,
              cancelled: 1,
            },
          },
        },
      },
    });
    expect(
      responseBody.metadata?.executionSummary?.localActionSummary?.items?.some(
        (item) => item.requestId === requestId && item.status === 'cancelled',
      ) ?? false,
    ).toBe(true);

    const storedRecord = await control.readRun(payload.execution.runtimeRunId);
    expect(storedRecord?.bundle.run.status).toBe('succeeded');
    expect(
      storedRecord?.bundle.localActionRequests.some(
        (request) =>
          request.id === requestId &&
          request.status === 'cancelled' &&
          request.resultSummary === 'human cancelled requested cross-service gemini local action',
      ) ?? false,
    ).toBe(true);
    expect(storedRecord?.bundle.steps.at(-1)?.output?.summary).toBe(GEMINI_CANCELLATION_SMOKE_TOKEN);
  } finally {
    await server.close();
  }
}

async function assertRejectedOperatorControlledCrossServiceReadbacks(payload: TeamRunLivePayload) {
  const control = createExecutionRuntimeControl();
  const storedPausedRecord = await control.readRun(payload.execution.runtimeRunId);
  const requestedRequest =
    storedPausedRecord?.bundle.localActionRequests.find((request) => request.status === 'requested') ?? null;
  expect(requestedRequest).not.toBeNull();
  const requestId = requestedRequest?.id ?? null;

  const config = await resolveConfig({}, process.cwd(), process.env);
  const executionHost = createExecutionServiceHost({
    control,
    ownerId: 'live-test:cross-service-rejection',
    executeStoredRunStep: createConfiguredStoredStepExecutor(config),
  });
  const server = await createResponsesHttpServer(
    { host: '127.0.0.1', port: 0 },
    {
      control,
      executionHost,
    },
  );

  try {
    const resolveResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        localActionControl: {
          action: 'resolve-request',
          runId: payload.execution.runtimeRunId,
          requestId,
          resolution: 'rejected',
          note: 'human rejected requested cross-service local action',
        },
      }),
    });
    expect(resolveResponse.status).toBe(200);
    const resolvePayload = (await resolveResponse.json()) as Record<string, any>;
    expect(resolvePayload).toMatchObject({
      controlResult: {
        kind: 'local-action-control',
        action: 'resolve-local-action-request',
        runId: payload.execution.runtimeRunId,
        requestId,
        resolution: 'rejected',
        status: 'resolved',
        resolved: true,
        reason: 'human rejected requested cross-service local action',
      },
    });

    const resumeResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runControl: {
          action: 'resume-human-escalation',
          runId: payload.execution.runtimeRunId,
          note: 'human resumed cross-service team run after rejecting local action',
          guidance: {
            action: 'continue',
            instruction: 'the requested local shell action was rejected; continue directly to the final response',
          },
          override: {
            promptAppend: `The requested local shell action was rejected by the operator. Reply exactly with ${REJECTION_SMOKE_TOKEN} and nothing else.`,
            structuredContext: {
              rejectedRequestedLocalAction: true,
              finalToken: REJECTION_SMOKE_TOKEN,
            },
          },
        },
      }),
    });
    expect(resumeResponse.status).toBe(200);
    const resumePayload = (await resumeResponse.json()) as Record<string, any>;
    expect(resumePayload).toMatchObject({
      controlResult: {
        kind: 'run-control',
        action: 'resume-human-escalation',
        runId: payload.execution.runtimeRunId,
        status: 'resumed',
        resumed: true,
        reason: 'human resumed cross-service team run after rejecting local action',
      },
    });

    const drainResponse = await fetch(`http://127.0.0.1:${server.port}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runControl: {
          action: 'drain-run',
          runId: payload.execution.runtimeRunId,
        },
      }),
    });
    expect(drainResponse.status).toBe(200);
    const drainPayload = (await drainResponse.json()) as Record<string, any>;
    expect(drainPayload).toMatchObject({
      controlResult: {
        kind: 'run-control',
        action: 'drain-run',
        runId: payload.execution.runtimeRunId,
        status: 'executed',
        drained: true,
        reason: 'run executed through targeted host drain',
        skipReason: null,
      },
    });

    const recoveryResponse = await fetch(`http://127.0.0.1:${server.port}/status/recovery/${payload.execution.runtimeRunId}`);
    expect(recoveryResponse.status).toBe(200);
    const recoveryBody = (await recoveryResponse.json()) as {
      object: string;
      detail: {
        runId: string;
        sourceKind: string;
        taskRunSpecId: string | null;
        orchestrationTimelineSummary: {
          total: number;
          items: Array<{
            type: string | null;
            note: string | null;
            stepId: string | null;
          }>;
        } | null;
      };
    };
    expect(recoveryBody.object).toBe('recovery_detail');
    expect(recoveryBody.detail).toMatchObject({
      runId: payload.execution.runtimeRunId,
      sourceKind: 'team-run',
      taskRunSpecId: payload.taskRunSpec.id,
    });
    expect(recoveryBody.detail.orchestrationTimelineSummary?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'note-added',
          note: 'human resumed cross-service team run after rejecting local action',
        }),
        expect.objectContaining({
          type: 'step-succeeded',
        }),
        expect.objectContaining({
          type: 'note-added',
          note: 'run executed through targeted host drain',
          stepId: null,
        }),
      ]),
    );

    const responseRead = await fetch(`http://127.0.0.1:${server.port}/v1/responses/${payload.execution.runtimeRunId}`);
    expect(responseRead.status).toBe(200);
    const responseBody = (await responseRead.json()) as {
      id: string;
      object: string;
      status: string;
      metadata?: {
        runId?: string | null;
        taskRunSpecId?: string | null;
        executionSummary?: {
          operatorControlSummary?: {
            humanEscalationResume?: {
              note?: string | null;
            } | null;
            targetedDrain?: {
              status?: string | null;
              reason?: string | null;
              skipReason?: string | null;
            } | null;
          } | null;
          localActionSummary?: {
            counts?: {
              requested?: number | null;
              rejected?: number | null;
            } | null;
            items?: Array<{
              requestId?: string | null;
              status?: string | null;
            }>;
          } | null;
        } | null;
      } | null;
    };
    expect(responseBody).toMatchObject({
      id: payload.execution.runtimeRunId,
      object: 'response',
      status: 'completed',
      metadata: {
        runId: payload.execution.runtimeRunId,
        taskRunSpecId: payload.taskRunSpec.id,
        executionSummary: {
          operatorControlSummary: {
            humanEscalationResume: {
              note: 'human resumed cross-service team run after rejecting local action',
            },
            targetedDrain: {
              status: 'executed',
              reason: 'run executed through targeted host drain',
              skipReason: null,
            },
          },
          localActionSummary: {
            counts: {
              requested: 0,
              rejected: 1,
            },
          },
        },
      },
    });
    expect(
      responseBody.metadata?.executionSummary?.localActionSummary?.items?.some(
        (item) => item.requestId === requestId && item.status === 'rejected',
      ) ?? false,
    ).toBe(true);

    const storedRecord = await control.readRun(payload.execution.runtimeRunId);
    expect(storedRecord?.bundle.run.status).toBe('succeeded');
    expect(
      storedRecord?.bundle.localActionRequests.some(
        (request) =>
          request.id === requestId &&
          request.status === 'rejected' &&
          request.resultSummary === 'human rejected requested cross-service local action',
      ) ?? false,
    ).toBe(true);
    expect(storedRecord?.bundle.steps.at(-1)?.output?.summary).toBe(REJECTION_SMOKE_TOKEN);
  } finally {
    await server.close();
  }
}

(LIVE ? describe : describe.skip)('Cross-service team live smoke', () => {
  (MULTISERVICE_LIVE ? it : it.skip)(
    'executes auracall-cross-service through the real ChatGPT-to-Grok CLI path',
    async () => {
      if (!hasDisplay()) {
        console.warn('Skipping cross-service team live smoke (missing DISPLAY for browser-backed run).');
        return;
      }

      await acquireCrossServiceLocks();
      try {
        const payload = await runTeamSmoke();

        expect(payload.taskRunSpec.teamId).toBe('auracall-cross-service');
        expect(payload.execution.teamId).toBe('auracall-cross-service');
        expect(payload.execution.taskRunSpecId).toBe(payload.taskRunSpec.id);
        expect(payload.execution.runtimeSourceKind).toBe('team-run');
        expect(payload.execution.runtimeRunStatus).toBe('succeeded');
        expect(payload.execution.finalOutputSummary).toBe(SMOKE_TOKEN);
        expect(payload.execution.stepSummaries).toHaveLength(2);
        expect(payload.execution.stepSummaries[0]).toMatchObject({
          teamStepOrder: 1,
          runtimeProfileId: 'wsl-chrome-2',
          browserProfileId: 'wsl-chrome-2',
          service: 'chatgpt',
          teamStepStatus: 'succeeded',
          runtimeStepStatus: 'succeeded',
        });
        expect(payload.execution.stepSummaries[1]).toMatchObject({
          teamStepOrder: 2,
          runtimeProfileId: 'auracall-grok-auto',
          browserProfileId: 'default',
          service: 'grok',
          teamStepStatus: 'succeeded',
          runtimeStepStatus: 'succeeded',
        });

        await assertStoredReadbacks(payload);
        await enqueueLiveConversationCleanup({
          provider: 'chatgpt',
          runId: payload.execution.runtimeRunId,
        });
        await enqueueLiveConversationCleanup({
          provider: 'grok',
          runId: payload.execution.runtimeRunId,
        });
      } finally {
        await releaseCrossServiceLocks();
      }
    },
    14 * 60 * 1000,
  );

  (MULTISERVICE_LIVE ? it : it.skip)(
    'executes auracall-cross-service-gemini through the real ChatGPT-to-Gemini CLI path',
    async () => {
      if (!hasDisplay()) {
        console.warn('Skipping cross-service Gemini team live smoke (missing DISPLAY for browser-backed run).');
        return;
      }
      await assertHasGeminiExportedCookies();

      await acquireCrossServiceGeminiLocks();
      try {
        const payload = await runGeminiTeamSmoke();

        expect(payload.taskRunSpec.teamId).toBe('auracall-cross-service-gemini');
        expect(payload.execution.teamId).toBe('auracall-cross-service-gemini');
        expect(payload.execution.taskRunSpecId).toBe(payload.taskRunSpec.id);
        expect(payload.execution.runtimeSourceKind).toBe('team-run');
        expect(payload.execution.runtimeRunStatus).toBe('succeeded');
        expect(payload.execution.finalOutputSummary).toBe(GEMINI_SMOKE_TOKEN);
        expect(payload.execution.stepSummaries).toHaveLength(2);
        expect(payload.execution.stepSummaries[0]).toMatchObject({
          teamStepOrder: 1,
          runtimeProfileId: 'wsl-chrome-2',
          browserProfileId: 'wsl-chrome-2',
          service: 'chatgpt',
          teamStepStatus: 'succeeded',
          runtimeStepStatus: 'succeeded',
        });
        expect(payload.execution.stepSummaries[1]).toMatchObject({
          teamStepOrder: 2,
          runtimeProfileId: 'auracall-gemini-pro',
          browserProfileId: 'default',
          service: 'gemini',
          teamStepStatus: 'succeeded',
          runtimeStepStatus: 'succeeded',
        });

        await assertGeminiStoredReadbacks(payload);
        await enqueueLiveConversationCleanup({
          provider: 'chatgpt',
          runId: payload.execution.runtimeRunId,
        });
        await enqueueLiveConversationCleanup({
          provider: 'gemini',
          runId: payload.execution.runtimeRunId,
        });
      } finally {
        await releaseCrossServiceGeminiLocks();
      }
    },
    14 * 60 * 1000,
  );

  (MULTISERVICE_CANCELLATION_LIVE ? it : it.skip)(
    'cancels auracall-cross-service-tooling local action and completes through the real /status operator path',
    async () => {
      if (!hasDisplay()) {
        console.warn('Skipping cross-service cancellation live smoke (missing DISPLAY for browser-backed run).');
        return;
      }

      await acquireCrossServiceLocks();
      try {
        const payload = await runCancellationTeamSmoke();

        expect(payload.taskRunSpec.teamId).toBe('auracall-cross-service-tooling');
        expect(payload.execution.teamId).toBe('auracall-cross-service-tooling');
        expect(payload.execution.taskRunSpecId).toBe(payload.taskRunSpec.id);
        expect(payload.execution.runtimeSourceKind).toBe('team-run');
        expect(payload.execution.runtimeRunStatus).toBe('cancelled');
        expect(payload.execution.finalOutputSummary).toBe('paused for human escalation');
        expect(payload.execution.stepSummaries).toHaveLength(2);
        expect(payload.execution.sharedStateNotes).toContain('run paused for human escalation');
        expect(payload.execution.stepSummaries[0]).toMatchObject({
          teamStepOrder: 1,
          runtimeProfileId: 'wsl-chrome-2',
          browserProfileId: 'wsl-chrome-2',
          service: 'chatgpt',
          teamStepStatus: 'succeeded',
          runtimeStepStatus: 'succeeded',
        });
        expect(payload.execution.stepSummaries[1]).toMatchObject({
          teamStepOrder: 2,
          runtimeProfileId: 'auracall-grok-auto',
          browserProfileId: 'default',
          service: 'grok',
          teamStepStatus: 'cancelled',
          runtimeStepStatus: 'cancelled',
        });

        await assertCancelledOperatorControlledCrossServiceReadbacks(payload);
        await enqueueLiveConversationCleanup({
          provider: 'chatgpt',
          runId: payload.execution.runtimeRunId,
        });
        await enqueueLiveConversationCleanup({
          provider: 'grok',
          runId: payload.execution.runtimeRunId,
        });
      } finally {
        await releaseCrossServiceLocks();
      }
    },
    18 * 60 * 1000,
  );

  (MULTISERVICE_APPROVAL_LIVE ? it : it.skip)(
    'approves auracall-cross-service-tooling human escalation and completes through the real /status operator path',
    async () => {
      if (!hasDisplay()) {
        console.warn('Skipping cross-service approval live smoke (missing DISPLAY for browser-backed run).');
        return;
      }

      await acquireCrossServiceLocks();
      try {
        const payload = await runApprovalTeamSmoke();

        expect(payload.taskRunSpec.teamId).toBe('auracall-cross-service-tooling');
        expect(payload.execution.teamId).toBe('auracall-cross-service-tooling');
        expect(payload.execution.taskRunSpecId).toBe(payload.taskRunSpec.id);
        expect(payload.execution.runtimeSourceKind).toBe('team-run');
        expect(payload.execution.runtimeRunStatus).toBe('cancelled');
        expect(payload.execution.finalOutputSummary).toBe('paused for human escalation');
        expect(payload.execution.stepSummaries).toHaveLength(2);
        expect(payload.execution.sharedStateNotes).toContain('run paused for human escalation');
        expect(payload.execution.stepSummaries[0]).toMatchObject({
          teamStepOrder: 1,
          runtimeProfileId: 'wsl-chrome-2',
          browserProfileId: 'wsl-chrome-2',
          service: 'chatgpt',
          teamStepStatus: 'succeeded',
          runtimeStepStatus: 'succeeded',
        });
        expect(payload.execution.stepSummaries[1]).toMatchObject({
          teamStepOrder: 2,
          runtimeProfileId: 'auracall-grok-auto',
          browserProfileId: 'default',
          service: 'grok',
          teamStepStatus: 'cancelled',
          runtimeStepStatus: 'cancelled',
        });

        await assertApprovedOperatorControlledCrossServiceReadbacks(payload);
        await enqueueLiveConversationCleanup({
          provider: 'chatgpt',
          runId: payload.execution.runtimeRunId,
        });
        await enqueueLiveConversationCleanup({
          provider: 'grok',
          runId: payload.execution.runtimeRunId,
        });
      } finally {
        await releaseCrossServiceLocks();
      }
    },
    18 * 60 * 1000,
  );

  (MULTISERVICE_REVERSE_APPROVAL_LIVE ? it : it.skip)(
    'approves auracall-reverse-cross-service-tooling human escalation and completes through the real /status operator path',
    async () => {
      if (!hasDisplay()) {
        console.warn('Skipping reverse cross-service approval live smoke (missing DISPLAY for browser-backed run).');
        return;
      }

      await acquireCrossServiceLocks();
      try {
        const payload = await runReverseApprovalTeamSmoke();

        expect(payload.taskRunSpec.teamId).toBe('auracall-reverse-cross-service-tooling');
        expect(payload.execution.teamId).toBe('auracall-reverse-cross-service-tooling');
        expect(payload.execution.taskRunSpecId).toBe(payload.taskRunSpec.id);
        expect(payload.execution.runtimeSourceKind).toBe('team-run');
        expect(payload.execution.runtimeRunStatus).toBe('cancelled');
        expect(payload.execution.finalOutputSummary).toBe('paused for human escalation');
        expect(payload.execution.stepSummaries).toHaveLength(2);
        expect(payload.execution.sharedStateNotes).toContain('run paused for human escalation');
        expect(payload.execution.stepSummaries[0]).toMatchObject({
          teamStepOrder: 1,
          runtimeProfileId: 'auracall-grok-auto',
          browserProfileId: 'default',
          service: 'grok',
          teamStepStatus: 'succeeded',
          runtimeStepStatus: 'succeeded',
        });
        expect(payload.execution.stepSummaries[1]).toMatchObject({
          teamStepOrder: 2,
          runtimeProfileId: 'wsl-chrome-2',
          browserProfileId: 'wsl-chrome-2',
          service: 'chatgpt',
          teamStepStatus: 'cancelled',
          runtimeStepStatus: 'cancelled',
        });

        await assertApprovedOperatorControlledReverseCrossServiceReadbacks(payload);
        await enqueueLiveConversationCleanup({
          provider: 'grok',
          runId: payload.execution.runtimeRunId,
        });
        await enqueueLiveConversationCleanup({
          provider: 'chatgpt',
          runId: payload.execution.runtimeRunId,
        });
      } finally {
        await releaseCrossServiceLocks();
      }
    },
    18 * 60 * 1000,
  );

  (MULTISERVICE_REVERSE_CANCELLATION_LIVE ? it : it.skip)(
    'cancels auracall-reverse-cross-service-tooling local action and completes through the real /status operator path',
    async () => {
      if (!hasDisplay()) {
        console.warn('Skipping reverse cross-service cancellation live smoke (missing DISPLAY for browser-backed run).');
        return;
      }

      await acquireCrossServiceLocks();
      try {
        const payload = await runReverseCancellationTeamSmoke();

        expect(payload.taskRunSpec.teamId).toBe('auracall-reverse-cross-service-tooling');
        expect(payload.execution.teamId).toBe('auracall-reverse-cross-service-tooling');
        expect(payload.execution.taskRunSpecId).toBe(payload.taskRunSpec.id);
        expect(payload.execution.runtimeSourceKind).toBe('team-run');
        expect(payload.execution.runtimeRunStatus).toBe('cancelled');
        expect(payload.execution.finalOutputSummary).toBe('paused for human escalation');
        expect(payload.execution.stepSummaries).toHaveLength(2);
        expect(payload.execution.sharedStateNotes).toContain('run paused for human escalation');
        expect(payload.execution.stepSummaries[0]).toMatchObject({
          teamStepOrder: 1,
          runtimeProfileId: 'auracall-grok-auto',
          browserProfileId: 'default',
          service: 'grok',
          teamStepStatus: 'succeeded',
          runtimeStepStatus: 'succeeded',
        });
        expect(payload.execution.stepSummaries[1]).toMatchObject({
          teamStepOrder: 2,
          runtimeProfileId: 'wsl-chrome-2',
          browserProfileId: 'wsl-chrome-2',
          service: 'chatgpt',
          teamStepStatus: 'cancelled',
          runtimeStepStatus: 'cancelled',
        });

        await assertCancelledOperatorControlledReverseCrossServiceReadbacks(payload);
        await enqueueLiveConversationCleanup({
          provider: 'grok',
          runId: payload.execution.runtimeRunId,
        });
        await enqueueLiveConversationCleanup({
          provider: 'chatgpt',
          runId: payload.execution.runtimeRunId,
        });
      } finally {
        await releaseCrossServiceLocks();
      }
    },
    18 * 60 * 1000,
  );

  (MULTISERVICE_REVERSE_REJECTION_LIVE ? it : it.skip)(
    'rejects auracall-reverse-cross-service-tooling local action and completes through the real /status operator path',
    async () => {
      if (!hasDisplay()) {
        console.warn('Skipping reverse cross-service rejection live smoke (missing DISPLAY for browser-backed run).');
        return;
      }

      await acquireCrossServiceLocks();
      try {
        const payload = await runReverseRejectionTeamSmoke();

        expect(payload.taskRunSpec.teamId).toBe('auracall-reverse-cross-service-tooling');
        expect(payload.execution.teamId).toBe('auracall-reverse-cross-service-tooling');
        expect(payload.execution.taskRunSpecId).toBe(payload.taskRunSpec.id);
        expect(payload.execution.runtimeSourceKind).toBe('team-run');
        expect(payload.execution.runtimeRunStatus).toBe('cancelled');
        expect(payload.execution.finalOutputSummary).toBe('paused for human escalation');
        expect(payload.execution.stepSummaries).toHaveLength(2);
        expect(payload.execution.sharedStateNotes).toContain('run paused for human escalation');
        expect(payload.execution.stepSummaries[0]).toMatchObject({
          teamStepOrder: 1,
          runtimeProfileId: 'auracall-grok-auto',
          browserProfileId: 'default',
          service: 'grok',
          teamStepStatus: 'succeeded',
          runtimeStepStatus: 'succeeded',
        });
        expect(payload.execution.stepSummaries[1]).toMatchObject({
          teamStepOrder: 2,
          runtimeProfileId: 'wsl-chrome-2',
          browserProfileId: 'wsl-chrome-2',
          service: 'chatgpt',
          teamStepStatus: 'cancelled',
          runtimeStepStatus: 'cancelled',
        });

        await assertRejectedOperatorControlledReverseCrossServiceReadbacks(payload);
        await enqueueLiveConversationCleanup({
          provider: 'grok',
          runId: payload.execution.runtimeRunId,
        });
        await enqueueLiveConversationCleanup({
          provider: 'chatgpt',
          runId: payload.execution.runtimeRunId,
        });
      } finally {
        await releaseCrossServiceLocks();
      }
    },
    18 * 60 * 1000,
  );

  (MULTISERVICE_REVERSE_GEMINI_APPROVAL_LIVE ? it : it.skip)(
    'approves auracall-reverse-cross-service-gemini-tooling human escalation and completes through the real /status operator path',
    async () => {
      if (!hasDisplay()) {
        console.warn('Skipping reverse cross-service Gemini approval live smoke (missing DISPLAY for browser-backed run).');
        return;
      }
      await assertHasGeminiExportedCookies();

      await acquireReverseCrossServiceGeminiLocks();
      try {
        const payload = await runReverseGeminiApprovalTeamSmoke();

        expect(payload.taskRunSpec.teamId).toBe('auracall-reverse-cross-service-gemini-tooling');
        expect(payload.execution.teamId).toBe('auracall-reverse-cross-service-gemini-tooling');
        expect(payload.execution.taskRunSpecId).toBe(payload.taskRunSpec.id);
        expect(payload.execution.runtimeSourceKind).toBe('team-run');
        expect(payload.execution.runtimeRunStatus).toBe('cancelled');
        expect(payload.execution.finalOutputSummary).toBe('paused for human escalation');
        expect(payload.execution.stepSummaries).toHaveLength(2);
        expect(payload.execution.sharedStateNotes).toContain('run paused for human escalation');
        expect(payload.execution.stepSummaries[0]).toMatchObject({
          teamStepOrder: 1,
          runtimeProfileId: 'auracall-grok-auto',
          browserProfileId: 'default',
          service: 'grok',
          teamStepStatus: 'succeeded',
          runtimeStepStatus: 'succeeded',
        });
        expect(payload.execution.stepSummaries[1]).toMatchObject({
          teamStepOrder: 2,
          runtimeProfileId: 'auracall-gemini-pro',
          browserProfileId: 'default',
          service: 'gemini',
          teamStepStatus: 'cancelled',
          runtimeStepStatus: 'cancelled',
        });

        await assertApprovedOperatorControlledReverseCrossServiceGeminiReadbacks(payload);
        await enqueueLiveConversationCleanup({
          provider: 'grok',
          runId: payload.execution.runtimeRunId,
        });
        await enqueueLiveConversationCleanup({
          provider: 'gemini',
          runId: payload.execution.runtimeRunId,
        });
      } finally {
        await releaseReverseCrossServiceGeminiLocks();
      }
    },
    18 * 60 * 1000,
  );

  (MULTISERVICE_REVERSE_GEMINI_CANCELLATION_LIVE ? it : it.skip)(
    'cancels auracall-reverse-cross-service-gemini-tooling local action and completes through the real /status operator path',
    async () => {
      if (!hasDisplay()) {
        console.warn('Skipping reverse cross-service Gemini cancellation live smoke (missing DISPLAY for browser-backed run).');
        return;
      }
      await assertHasGeminiExportedCookies();

      await acquireReverseCrossServiceGeminiLocks();
      try {
        const payload = await runReverseGeminiCancellationTeamSmoke();

        expect(payload.taskRunSpec.teamId).toBe('auracall-reverse-cross-service-gemini-tooling');
        expect(payload.execution.teamId).toBe('auracall-reverse-cross-service-gemini-tooling');
        expect(payload.execution.taskRunSpecId).toBe(payload.taskRunSpec.id);
        expect(payload.execution.runtimeSourceKind).toBe('team-run');
        expect(payload.execution.runtimeRunStatus).toBe('cancelled');
        expect(payload.execution.finalOutputSummary).toBe('paused for human escalation');
        expect(payload.execution.stepSummaries).toHaveLength(2);
        expect(payload.execution.sharedStateNotes).toContain('run paused for human escalation');
        expect(payload.execution.stepSummaries[0]).toMatchObject({
          teamStepOrder: 1,
          runtimeProfileId: 'auracall-grok-auto',
          browserProfileId: 'default',
          service: 'grok',
          teamStepStatus: 'succeeded',
          runtimeStepStatus: 'succeeded',
        });
        expect(payload.execution.stepSummaries[1]).toMatchObject({
          teamStepOrder: 2,
          runtimeProfileId: 'auracall-gemini-pro',
          browserProfileId: 'default',
          service: 'gemini',
          teamStepStatus: 'cancelled',
          runtimeStepStatus: 'cancelled',
        });

        await assertCancelledOperatorControlledReverseCrossServiceGeminiReadbacks(payload);
        await enqueueLiveConversationCleanup({
          provider: 'grok',
          runId: payload.execution.runtimeRunId,
        });
        await enqueueLiveConversationCleanup({
          provider: 'gemini',
          runId: payload.execution.runtimeRunId,
        });
      } finally {
        await releaseReverseCrossServiceGeminiLocks();
      }
    },
    18 * 60 * 1000,
  );

  (MULTISERVICE_REVERSE_GEMINI_REJECTION_LIVE ? it : it.skip)(
    'rejects auracall-reverse-cross-service-gemini-tooling local action and completes through the real /status operator path',
    async () => {
      if (!hasDisplay()) {
        console.warn('Skipping reverse cross-service Gemini rejection live smoke (missing DISPLAY for browser-backed run).');
        return;
      }
      await assertHasGeminiExportedCookies();

      await acquireReverseCrossServiceGeminiLocks();
      try {
        const payload = await runReverseGeminiRejectionTeamSmoke();

        expect(payload.taskRunSpec.teamId).toBe('auracall-reverse-cross-service-gemini-tooling');
        expect(payload.execution.teamId).toBe('auracall-reverse-cross-service-gemini-tooling');
        expect(payload.execution.taskRunSpecId).toBe(payload.taskRunSpec.id);
        expect(payload.execution.runtimeSourceKind).toBe('team-run');
        expect(payload.execution.runtimeRunStatus).toBe('cancelled');
        expect(payload.execution.finalOutputSummary).toBe('paused for human escalation');
        expect(payload.execution.stepSummaries).toHaveLength(2);
        expect(payload.execution.sharedStateNotes).toContain('run paused for human escalation');
        expect(payload.execution.stepSummaries[0]).toMatchObject({
          teamStepOrder: 1,
          runtimeProfileId: 'auracall-grok-auto',
          browserProfileId: 'default',
          service: 'grok',
          teamStepStatus: 'succeeded',
          runtimeStepStatus: 'succeeded',
        });
        expect(payload.execution.stepSummaries[1]).toMatchObject({
          teamStepOrder: 2,
          runtimeProfileId: 'auracall-gemini-pro',
          browserProfileId: 'default',
          service: 'gemini',
          teamStepStatus: 'cancelled',
          runtimeStepStatus: 'cancelled',
        });

        await assertRejectedOperatorControlledReverseCrossServiceGeminiReadbacks(payload);
        await enqueueLiveConversationCleanup({
          provider: 'grok',
          runId: payload.execution.runtimeRunId,
        });
        await enqueueLiveConversationCleanup({
          provider: 'gemini',
          runId: payload.execution.runtimeRunId,
        });
      } finally {
        await releaseReverseCrossServiceGeminiLocks();
      }
    },
    18 * 60 * 1000,
  );

  (MULTISERVICE_GEMINI_TO_CHATGPT_APPROVAL_LIVE ? it : it.skip)(
    'approves auracall-reverse-cross-service-chatgpt-tooling human escalation and completes through the real /status operator path',
    async () => {
      if (!hasDisplay()) {
        console.warn('Skipping Gemini to ChatGPT approval live smoke (missing DISPLAY for browser-backed run).');
        return;
      }
      await assertHasGeminiExportedCookies();

      await acquireGeminiToChatgptLocks();
      try {
        const payload = await runGeminiToChatgptApprovalTeamSmoke();

        expect(payload.taskRunSpec.teamId).toBe('auracall-reverse-cross-service-chatgpt-tooling');
        expect(payload.execution.teamId).toBe('auracall-reverse-cross-service-chatgpt-tooling');
        expect(payload.execution.taskRunSpecId).toBe(payload.taskRunSpec.id);
        expect(payload.execution.runtimeSourceKind).toBe('team-run');
        expect(payload.execution.runtimeRunStatus).toBe('cancelled');
        expect(payload.execution.finalOutputSummary).toBe('paused for human escalation');
        expect(payload.execution.stepSummaries).toHaveLength(2);
        expect(payload.execution.sharedStateNotes).toContain('run paused for human escalation');
        expect(payload.execution.stepSummaries[0]).toMatchObject({
          teamStepOrder: 1,
          runtimeProfileId: 'auracall-gemini-pro',
          browserProfileId: 'default',
          service: 'gemini',
          teamStepStatus: 'succeeded',
          runtimeStepStatus: 'succeeded',
        });
        expect(payload.execution.stepSummaries[1]).toMatchObject({
          teamStepOrder: 2,
          runtimeProfileId: 'wsl-chrome-2',
          browserProfileId: 'wsl-chrome-2',
          service: 'chatgpt',
          teamStepStatus: 'cancelled',
          runtimeStepStatus: 'cancelled',
        });

        await assertApprovedOperatorControlledGeminiToChatgptReadbacks(payload);
        await enqueueLiveConversationCleanup({
          provider: 'gemini',
          runId: payload.execution.runtimeRunId,
        });
        await enqueueLiveConversationCleanup({
          provider: 'chatgpt',
          runId: payload.execution.runtimeRunId,
        });
      } finally {
        await releaseGeminiToChatgptLocks();
      }
    },
    18 * 60 * 1000,
  );

  (MULTISERVICE_GEMINI_TO_CHATGPT_CANCELLATION_LIVE ? it : it.skip)(
    'cancels auracall-reverse-cross-service-chatgpt-tooling local action and completes through the real /status operator path',
    async () => {
      if (!hasDisplay()) {
        console.warn('Skipping Gemini to ChatGPT cancellation live smoke (missing DISPLAY for browser-backed run).');
        return;
      }
      await assertHasGeminiExportedCookies();

      await acquireGeminiToChatgptLocks();
      try {
        const payload = await runGeminiToChatgptCancellationTeamSmoke();

        expect(payload.taskRunSpec.teamId).toBe('auracall-reverse-cross-service-chatgpt-tooling');
        expect(payload.execution.teamId).toBe('auracall-reverse-cross-service-chatgpt-tooling');
        expect(payload.execution.taskRunSpecId).toBe(payload.taskRunSpec.id);
        expect(payload.execution.runtimeSourceKind).toBe('team-run');
        expect(payload.execution.runtimeRunStatus).toBe('cancelled');
        expect(payload.execution.finalOutputSummary).toBe('paused for human escalation');
        expect(payload.execution.stepSummaries).toHaveLength(2);
        expect(payload.execution.sharedStateNotes).toContain('run paused for human escalation');
        expect(payload.execution.stepSummaries[0]).toMatchObject({
          teamStepOrder: 1,
          runtimeProfileId: 'auracall-gemini-pro',
          browserProfileId: 'default',
          service: 'gemini',
          teamStepStatus: 'succeeded',
          runtimeStepStatus: 'succeeded',
        });
        expect(payload.execution.stepSummaries[1]).toMatchObject({
          teamStepOrder: 2,
          runtimeProfileId: 'wsl-chrome-2',
          browserProfileId: 'wsl-chrome-2',
          service: 'chatgpt',
          teamStepStatus: 'cancelled',
          runtimeStepStatus: 'cancelled',
        });

        await assertCancelledOperatorControlledGeminiToChatgptReadbacks(payload);
        await enqueueLiveConversationCleanup({
          provider: 'gemini',
          runId: payload.execution.runtimeRunId,
        });
        await enqueueLiveConversationCleanup({
          provider: 'chatgpt',
          runId: payload.execution.runtimeRunId,
        });
      } finally {
        await releaseGeminiToChatgptLocks();
      }
    },
    18 * 60 * 1000,
  );

  (MULTISERVICE_GEMINI_TO_CHATGPT_REJECTION_LIVE ? it : it.skip)(
    'rejects auracall-reverse-cross-service-chatgpt-tooling local action and completes through the real /status operator path',
    async () => {
      if (!hasDisplay()) {
        console.warn('Skipping Gemini to ChatGPT rejection live smoke (missing DISPLAY for browser-backed run).');
        return;
      }
      await assertHasGeminiExportedCookies();

      await acquireGeminiToChatgptLocks();
      try {
        const payload = await runGeminiToChatgptRejectionTeamSmoke();

        expect(payload.taskRunSpec.teamId).toBe('auracall-reverse-cross-service-chatgpt-tooling');
        expect(payload.execution.teamId).toBe('auracall-reverse-cross-service-chatgpt-tooling');
        expect(payload.execution.taskRunSpecId).toBe(payload.taskRunSpec.id);
        expect(payload.execution.runtimeSourceKind).toBe('team-run');
        expect(payload.execution.runtimeRunStatus).toBe('cancelled');
        expect(payload.execution.finalOutputSummary).toBe('paused for human escalation');
        expect(payload.execution.stepSummaries).toHaveLength(2);
        expect(payload.execution.sharedStateNotes).toContain('run paused for human escalation');
        expect(payload.execution.stepSummaries[0]).toMatchObject({
          teamStepOrder: 1,
          runtimeProfileId: 'auracall-gemini-pro',
          browserProfileId: 'default',
          service: 'gemini',
          teamStepStatus: 'succeeded',
          runtimeStepStatus: 'succeeded',
        });
        expect(payload.execution.stepSummaries[1]).toMatchObject({
          teamStepOrder: 2,
          runtimeProfileId: 'wsl-chrome-2',
          browserProfileId: 'wsl-chrome-2',
          service: 'chatgpt',
          teamStepStatus: 'cancelled',
          runtimeStepStatus: 'cancelled',
        });

        await assertRejectedOperatorControlledGeminiToChatgptReadbacks(payload);
        await enqueueLiveConversationCleanup({
          provider: 'gemini',
          runId: payload.execution.runtimeRunId,
        });
        await enqueueLiveConversationCleanup({
          provider: 'chatgpt',
          runId: payload.execution.runtimeRunId,
        });
      } finally {
        await releaseGeminiToChatgptLocks();
      }
    },
    18 * 60 * 1000,
  );

  (MULTISERVICE_GEMINI_APPROVAL_LIVE ? it : it.skip)(
    'approves auracall-cross-service-gemini-tooling human escalation and completes through the real /status operator path',
    async () => {
      if (!hasDisplay()) {
        console.warn('Skipping cross-service Gemini approval live smoke (missing DISPLAY for browser-backed run).');
        return;
      }
      await assertHasGeminiExportedCookies();

      await acquireCrossServiceGeminiLocks();
      try {
        const payload = await runGeminiApprovalTeamSmoke();

        expect(payload.taskRunSpec.teamId).toBe('auracall-cross-service-gemini-tooling');
        expect(payload.execution.teamId).toBe('auracall-cross-service-gemini-tooling');
        expect(payload.execution.taskRunSpecId).toBe(payload.taskRunSpec.id);
        expect(payload.execution.runtimeSourceKind).toBe('team-run');
        expect(payload.execution.runtimeRunStatus).toBe('cancelled');
        expect(payload.execution.finalOutputSummary).toBe('paused for human escalation');
        expect(payload.execution.stepSummaries).toHaveLength(2);
        expect(payload.execution.sharedStateNotes).toContain('run paused for human escalation');
        expect(payload.execution.stepSummaries[0]).toMatchObject({
          teamStepOrder: 1,
          runtimeProfileId: 'wsl-chrome-2',
          browserProfileId: 'wsl-chrome-2',
          service: 'chatgpt',
          teamStepStatus: 'succeeded',
          runtimeStepStatus: 'succeeded',
        });
        expect(payload.execution.stepSummaries[1]).toMatchObject({
          teamStepOrder: 2,
          runtimeProfileId: 'auracall-gemini-pro',
          browserProfileId: 'default',
          service: 'gemini',
          teamStepStatus: 'cancelled',
          runtimeStepStatus: 'cancelled',
        });

        await assertApprovedOperatorControlledCrossServiceGeminiReadbacks(payload);
        await enqueueLiveConversationCleanup({
          provider: 'chatgpt',
          runId: payload.execution.runtimeRunId,
        });
        await enqueueLiveConversationCleanup({
          provider: 'gemini',
          runId: payload.execution.runtimeRunId,
        });
      } finally {
        await releaseCrossServiceGeminiLocks();
      }
    },
    18 * 60 * 1000,
  );

  (MULTISERVICE_GEMINI_CANCELLATION_LIVE ? it : it.skip)(
    'cancels auracall-cross-service-gemini-tooling local action and completes through the real /status operator path',
    async () => {
      if (!hasDisplay()) {
        console.warn('Skipping cross-service Gemini cancellation live smoke (missing DISPLAY for browser-backed run).');
        return;
      }
      await assertHasGeminiExportedCookies();

      await acquireCrossServiceGeminiLocks();
      try {
        const payload = await runGeminiCancellationTeamSmoke();

        expect(payload.taskRunSpec.teamId).toBe('auracall-cross-service-gemini-tooling');
        expect(payload.execution.teamId).toBe('auracall-cross-service-gemini-tooling');
        expect(payload.execution.taskRunSpecId).toBe(payload.taskRunSpec.id);
        expect(payload.execution.runtimeSourceKind).toBe('team-run');
        expect(payload.execution.runtimeRunStatus).toBe('cancelled');
        expect(payload.execution.finalOutputSummary).toBe('paused for human escalation');
        expect(payload.execution.stepSummaries).toHaveLength(2);
        expect(payload.execution.sharedStateNotes).toContain('run paused for human escalation');
        expect(payload.execution.stepSummaries[0]).toMatchObject({
          teamStepOrder: 1,
          runtimeProfileId: 'wsl-chrome-2',
          browserProfileId: 'wsl-chrome-2',
          service: 'chatgpt',
          teamStepStatus: 'succeeded',
          runtimeStepStatus: 'succeeded',
        });
        expect(payload.execution.stepSummaries[1]).toMatchObject({
          teamStepOrder: 2,
          runtimeProfileId: 'auracall-gemini-pro',
          browserProfileId: 'default',
          service: 'gemini',
          teamStepStatus: 'cancelled',
          runtimeStepStatus: 'cancelled',
        });

        await assertCancelledOperatorControlledCrossServiceGeminiReadbacks(payload);
        await enqueueLiveConversationCleanup({
          provider: 'chatgpt',
          runId: payload.execution.runtimeRunId,
        });
        await enqueueLiveConversationCleanup({
          provider: 'gemini',
          runId: payload.execution.runtimeRunId,
        });
      } finally {
        await releaseCrossServiceGeminiLocks();
      }
    },
    18 * 60 * 1000,
  );

  (MULTISERVICE_GEMINI_REJECTION_LIVE ? it : it.skip)(
    'rejects auracall-cross-service-gemini-tooling local action and completes through the real /status operator path',
    async () => {
      if (!hasDisplay()) {
        console.warn('Skipping cross-service Gemini rejection live smoke (missing DISPLAY for browser-backed run).');
        return;
      }
      await assertHasGeminiExportedCookies();

      await acquireCrossServiceGeminiLocks();
      try {
        const payload = await runGeminiRejectionTeamSmoke();

        expect(payload.taskRunSpec.teamId).toBe('auracall-cross-service-gemini-tooling');
        expect(payload.execution.teamId).toBe('auracall-cross-service-gemini-tooling');
        expect(payload.execution.taskRunSpecId).toBe(payload.taskRunSpec.id);
        expect(payload.execution.runtimeSourceKind).toBe('team-run');
        expect(payload.execution.runtimeRunStatus).toBe('cancelled');
        expect(payload.execution.finalOutputSummary).toBe('paused for human escalation');
        expect(payload.execution.stepSummaries).toHaveLength(2);
        expect(payload.execution.sharedStateNotes).toContain('run paused for human escalation');
        expect(payload.execution.stepSummaries[0]).toMatchObject({
          teamStepOrder: 1,
          runtimeProfileId: 'wsl-chrome-2',
          browserProfileId: 'wsl-chrome-2',
          service: 'chatgpt',
          teamStepStatus: 'succeeded',
          runtimeStepStatus: 'succeeded',
        });
        expect(payload.execution.stepSummaries[1]).toMatchObject({
          teamStepOrder: 2,
          runtimeProfileId: 'auracall-gemini-pro',
          browserProfileId: 'default',
          service: 'gemini',
          teamStepStatus: 'cancelled',
          runtimeStepStatus: 'cancelled',
        });

        await assertRejectedOperatorControlledCrossServiceGeminiReadbacks(payload);
        await enqueueLiveConversationCleanup({
          provider: 'chatgpt',
          runId: payload.execution.runtimeRunId,
        });
        await enqueueLiveConversationCleanup({
          provider: 'gemini',
          runId: payload.execution.runtimeRunId,
        });
      } finally {
        await releaseCrossServiceGeminiLocks();
      }
    },
    18 * 60 * 1000,
  );

  (MULTISERVICE_REJECTION_LIVE ? it : it.skip)(
    'rejects auracall-cross-service-tooling local action and completes through the real /status operator path',
    async () => {
      if (!hasDisplay()) {
        console.warn('Skipping cross-service rejection live smoke (missing DISPLAY for browser-backed run).');
        return;
      }

      await acquireCrossServiceLocks();
      try {
        const payload = await runRejectionTeamSmoke();

        expect(payload.taskRunSpec.teamId).toBe('auracall-cross-service-tooling');
        expect(payload.execution.teamId).toBe('auracall-cross-service-tooling');
        expect(payload.execution.taskRunSpecId).toBe(payload.taskRunSpec.id);
        expect(payload.execution.runtimeSourceKind).toBe('team-run');
        expect(payload.execution.runtimeRunStatus).toBe('cancelled');
        expect(payload.execution.finalOutputSummary).toBe('paused for human escalation');
        expect(payload.execution.stepSummaries).toHaveLength(2);
        expect(payload.execution.sharedStateNotes).toContain('run paused for human escalation');
        expect(payload.execution.stepSummaries[0]).toMatchObject({
          teamStepOrder: 1,
          runtimeProfileId: 'wsl-chrome-2',
          browserProfileId: 'wsl-chrome-2',
          service: 'chatgpt',
          teamStepStatus: 'succeeded',
          runtimeStepStatus: 'succeeded',
        });
        expect(payload.execution.stepSummaries[1]).toMatchObject({
          teamStepOrder: 2,
          runtimeProfileId: 'auracall-grok-auto',
          browserProfileId: 'default',
          service: 'grok',
          teamStepStatus: 'cancelled',
          runtimeStepStatus: 'cancelled',
        });

        await assertRejectedOperatorControlledCrossServiceReadbacks(payload);
        await enqueueLiveConversationCleanup({
          provider: 'chatgpt',
          runId: payload.execution.runtimeRunId,
        });
        await enqueueLiveConversationCleanup({
          provider: 'grok',
          runId: payload.execution.runtimeRunId,
        });
      } finally {
        await releaseCrossServiceLocks();
      }
    },
    18 * 60 * 1000,
  );
});
