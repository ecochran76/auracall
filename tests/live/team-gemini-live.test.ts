import { describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { acquireLiveTestLock, releaseLiveTestLock } from './liveLock.js';
import { enqueueLiveConversationCleanup } from './liveConversationCleanup.js';
import { createExecutionRuntimeControl } from '../../src/runtime/control.js';
import { createExecutionServiceHost } from '../../src/runtime/serviceHost.js';
import { createResponsesHttpServer } from '../../src/http/responsesServer.js';

const execFileAsync = promisify(execFile);
// Extended matrix only: Gemini team live coverage stays opt-in because this
// machine still requires exported-cookie preflight and stricter browser/session
// conditions than the routine Grok/ChatGPT baseline.
const LIVE = process.env.AURACALL_LIVE_TEST === '1';
const GEMINI_TEAM_LIVE = process.env.AURACALL_GEMINI_TEAM_LIVE_TEST === '1';
const TSX_BIN = path.join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs');
const CLI_ENTRY = path.join(process.cwd(), 'bin', 'auracall.ts');
const GEMINI_TOOL_TEAM_SMOKE_TOKEN = 'AURACALL_GEMINI_TOOL_TEAM_SMOKE_OK';
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

async function assertHasGeminiExportedCookies(): Promise<void> {
  let raw: string;
  try {
    raw = await fs.readFile(GEMINI_SCOPED_COOKIE_PATH, 'utf8');
  } catch (error) {
    throw new Error(
      `Gemini team live smoke requires exported cookies at ${GEMINI_SCOPED_COOKIE_PATH}. Run "pnpm tsx bin/auracall.ts login --target gemini --profile auracall-gemini-pro --export-cookies" first. (${error instanceof Error ? error.message : String(error)})`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `Gemini team live smoke found invalid exported cookies JSON at ${GEMINI_SCOPED_COOKIE_PATH}. (${error instanceof Error ? error.message : String(error)})`,
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`Gemini team live smoke expected a cookie array in ${GEMINI_SCOPED_COOKIE_PATH}.`);
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
      `Gemini team live smoke requires exported __Secure-1PSID and __Secure-1PSIDTS cookies in ${GEMINI_SCOPED_COOKIE_PATH}. Re-run Gemini cookie export first.`,
    );
  }
}

async function runGeminiToolingSmoke(): Promise<TeamRunLivePayload> {
  const { stdout } = await execFileAsync(
    process.execPath,
    [
      TSX_BIN,
      CLI_ENTRY,
      'teams',
      'run',
      'auracall-gemini-tooling',
      'Use the provided toolEnvelope structured context to request one bounded shell action, then use the resulting tool outcome to return the provided finalToken exactly.',
      '--title',
      'AuraCall Gemini tooling team live smoke',
      '--prompt-append',
      'Requester must emit exactly one JSON object with top-level localActionRequests containing the provided toolEnvelope unchanged. Do not rename fields, add markdown fences, or add prose. Finisher must output only the final token after a successful executed tool outcome.',
      '--structured-context-json',
      JSON.stringify({
        toolEnvelope: {
          kind: 'shell',
          summary: 'Run one bounded deterministic node command',
          command: 'node',
          args: ['-e', "process.stdout.write('AURACALL_TOOL_ACTION_OK')"],
          structuredPayload: {
            cwd: process.cwd(),
          },
        },
        finalToken: GEMINI_TOOL_TEAM_SMOKE_TOKEN,
      }),
      '--max-turns',
      '2',
      '--allow-local-shell-command',
      'node',
      '--allow-local-cwd-root',
      process.cwd(),
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

async function assertStoredReadbacks(payload: TeamRunLivePayload) {
  const control = createExecutionRuntimeControl();
  const host = createExecutionServiceHost({
    control,
    ownerId: 'live-test:gemini-team',
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
        service?: string | null;
        runtimeProfile?: string | null;
        executionSummary?: {
          localActionSummary?: {
            counts?: { executed?: number | null } | null;
            items?: Array<{ command?: string | null; status?: string | null }>;
          } | null;
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
        service: 'gemini',
        runtimeProfile: 'auracall-gemini-pro',
      },
    });
    expect(responseBody.metadata?.executionSummary?.localActionSummary?.counts?.executed ?? 0).toBeGreaterThanOrEqual(1);
    expect(
      responseBody.metadata?.executionSummary?.localActionSummary?.items?.some(
        (item) => item.command === 'node' && item.status === 'executed',
      ) ?? false,
    ).toBe(true);
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

(LIVE ? describe : describe.skip)('Gemini team live smoke', () => {
  (GEMINI_TEAM_LIVE ? it : it.skip)(
    'executes auracall-gemini-tooling through the real Gemini-backed CLI path',
    async () => {
      if (!hasDisplay()) {
        console.warn('Skipping Gemini team live smoke (missing DISPLAY for browser-backed Gemini run).');
        return;
      }

      await assertHasGeminiExportedCookies();

      await acquireLiveTestLock('gemini-browser');
      try {
        const payload = await runGeminiToolingSmoke();

        expect(payload.taskRunSpec.teamId).toBe('auracall-gemini-tooling');
        expect(payload.execution.teamId).toBe('auracall-gemini-tooling');
        expect(payload.execution.taskRunSpecId).toBe(payload.taskRunSpec.id);
        expect(payload.execution.runtimeSourceKind).toBe('team-run');
        expect(payload.execution.runtimeRunStatus).toBe('succeeded');
        expect(payload.execution.finalOutputSummary).toBe(GEMINI_TOOL_TEAM_SMOKE_TOKEN);
        expect(payload.execution.stepSummaries).toHaveLength(2);
        expect(payload.execution.sharedStateNotes).toContain('local shell action executed: node');
        expect(payload.execution.stepSummaries[0]).toMatchObject({
          teamStepOrder: 1,
          teamStepStatus: 'succeeded',
          runtimeStepStatus: 'succeeded',
          runtimeProfileId: 'auracall-gemini-pro',
          browserProfileId: 'default',
          service: 'gemini',
        });
        expect(payload.execution.stepSummaries[1]).toMatchObject({
          teamStepOrder: 2,
          teamStepStatus: 'succeeded',
          runtimeStepStatus: 'succeeded',
          runtimeProfileId: 'auracall-gemini-pro',
          browserProfileId: 'default',
          service: 'gemini',
        });

        await assertStoredReadbacks(payload);
        await enqueueLiveConversationCleanup({
          provider: 'gemini',
          runId: payload.execution.runtimeRunId,
        });
      } finally {
        await releaseLiveTestLock('gemini-browser');
      }
    },
    18 * 60 * 1000,
  );
});
