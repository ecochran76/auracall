import { describe, expect, it } from 'vitest';
import { createPreflightRunToolHandler } from '../src/mcp/tools/preflightRun.js';
import type { LazyLiveFollowPreflightRun } from '../src/preflightStatus.js';

const preflightRunPayload: LazyLiveFollowPreflightRun = {
  object: 'auracall_preflight_run',
  id: 'preflight_lazy_live_follow_mcp_test',
  name: 'lazy-live-follow',
  status: 'passed',
  command: 'pnpm',
  args: ['run', 'preflight:lazy-live-follow'],
  cwd: '/home/ecochran76/workspace.local/auracall',
  logPath: '/home/ecochran76/.auracall/logs/preflight-lazy-live-follow-mcp.log',
  startedAt: '2026-05-08T20:00:00.000Z',
  completedAt: '2026-05-08T20:00:02.000Z',
  durationMs: 2000,
  exitCode: 0,
  signal: null,
  errorMessage: null,
  steps: [
    {
      label: 'operator dashboard',
      status: 'passed',
      command: 'pnpm vitest run tests/http.responsesServer.test.ts',
      startedAt: '2026-05-08T20:00:00.000Z',
      completedAt: '2026-05-08T20:00:02.000Z',
      durationMs: 2000,
      errorMessage: null,
    },
  ],
};

describe('mcp preflight_run tool', () => {
  it('reads structured preflight run progress from the local API', async () => {
    const handler = createPreflightRunToolHandler({
      fetchImpl: async (url: string | URL | Request) => {
        expect(String(url)).toBe(
          'http://127.0.0.1:18080/v1/preflight/lazy-live-follow/runs/preflight_lazy_live_follow_mcp_test',
        );
        return Response.json(preflightRunPayload);
      },
    });

    const result = await handler({
      port: 18080,
      id: 'preflight_lazy_live_follow_mcp_test',
    });

    expect(result).toMatchObject({
      isError: false,
      content: [
        {
          type: 'text',
          text: 'AuraCall preflight run preflight_lazy_live_follow_mcp_test: status=passed; steps=1; latest=operator dashboard/passed; log=/home/ecochran76/.auracall/logs/preflight-lazy-live-follow-mcp.log',
        },
      ],
      structuredContent: {
        host: '127.0.0.1',
        port: 18080,
        run: {
          id: 'preflight_lazy_live_follow_mcp_test',
          status: 'passed',
          steps: [
            {
              label: 'operator dashboard',
              status: 'passed',
            },
          ],
        },
      },
    });
  });
});
