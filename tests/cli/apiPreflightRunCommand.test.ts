import { describe, expect, it } from 'vitest';
import {
  formatApiPreflightRunCliSummary,
  readApiPreflightRunForCli,
} from '../../src/cli/apiPreflightRunCommand.js';
import type { LazyLiveFollowPreflightRun } from '../../src/preflightStatus.js';

const preflightRunPayload: LazyLiveFollowPreflightRun = {
  object: 'auracall_preflight_run',
  id: 'preflight_lazy_live_follow_route_test',
  name: 'lazy-live-follow',
  status: 'running',
  command: 'pnpm',
  args: ['run', 'preflight:lazy-live-follow'],
  cwd: '/home/ecochran76/workspace.local/auracall',
  logPath: '/home/ecochran76/.auracall/logs/preflight-lazy-live-follow-test.log',
  startedAt: '2026-05-08T20:00:00.000Z',
  completedAt: null,
  durationMs: null,
  exitCode: null,
  signal: null,
  errorMessage: null,
  steps: [
    {
      label: 'operator dashboard',
      status: 'running',
      command: 'pnpm vitest run tests/http.responsesServer.test.ts',
      startedAt: '2026-05-08T20:00:00.000Z',
      completedAt: null,
      durationMs: null,
      errorMessage: null,
    },
  ],
};

describe('api preflight run command helpers', () => {
  it('reads one preflight run from the local API', async () => {
    const fetchImpl = async (url: string | URL | Request) => {
      expect(String(url)).toBe(
        'http://127.0.0.1:18080/v1/preflight/lazy-live-follow/runs/preflight_lazy_live_follow_route_test',
      );
      return Response.json(preflightRunPayload);
    };

    const summary = await readApiPreflightRunForCli({
      port: 18080,
      id: 'preflight_lazy_live_follow_route_test',
    }, fetchImpl);

    expect(summary).toEqual({
      host: '127.0.0.1',
      port: 18080,
      run: preflightRunPayload,
    });
  });

  it('formats compact preflight run output', () => {
    expect(formatApiPreflightRunCliSummary({
      host: '127.0.0.1',
      port: 18080,
      run: preflightRunPayload,
    })).toBe([
      'AuraCall preflight run preflight_lazy_live_follow_route_test (127.0.0.1:18080)',
      'Status: running durationMs=pending exitCode=pending',
      'Log: /home/ecochran76/.auracall/logs/preflight-lazy-live-follow-test.log',
      'Steps: 1 latest="operator dashboard" status=running',
    ].join('\n'));
  });
});
