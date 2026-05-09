import { describe, expect, it } from 'vitest';
import {
  formatApiSchedulerDiagnosticsCliSummary,
  readApiSchedulerDiagnosticsForCli,
} from '../../src/cli/apiSchedulerDiagnosticsCommand.js';

const diagnosticsPayload = {
  object: 'account_mirror_scheduler_diagnostics_bundle',
  target: {
    provider: 'chatgpt',
    runtimeProfileId: 'default',
    cachePath: '/account-mirror?provider=chatgpt&runtimeProfile=default&kind=all',
  },
  wait: {
    kind: 'active',
    label: 'active',
    activeCompletionId: 'acctmirror_diagnostics_1',
  },
  completion: {
    id: 'acctmirror_diagnostics_1',
    status: 'running',
    phase: 'backfill_history',
  },
};

describe('api scheduler-diagnostics CLI helpers', () => {
  it('reads scheduler diagnostics through fetch', async () => {
    const fetchImpl = async (url: string | URL | Request) => {
      expect(String(url)).toBe(
        'http://127.0.0.1:18080/v1/account-mirrors/scheduler/diagnostics?provider=chatgpt&runtimeProfile=default&completionId=acctmirror_diagnostics_1',
      );
      return new Response(JSON.stringify(diagnosticsPayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    await expect(readApiSchedulerDiagnosticsForCli({
      port: 18080,
      timeoutMs: 1000,
      provider: 'chatgpt',
      runtimeProfile: 'default',
      completionId: 'acctmirror_diagnostics_1',
    }, fetchImpl)).resolves.toMatchObject({
      host: '127.0.0.1',
      port: 18080,
      diagnostics: diagnosticsPayload,
    });
  });

  it('formats the compact scheduler diagnostics bundle', () => {
    const output = formatApiSchedulerDiagnosticsCliSummary({
      host: '127.0.0.1',
      port: 18080,
      diagnostics: diagnosticsPayload,
    });

    expect(output).toContain('AuraCall account mirror scheduler diagnostics (127.0.0.1:18080)');
    expect(output).toContain('Target: chatgpt/default');
    expect(output).toContain('Wait: active');
    expect(output).toContain('Completion: acctmirror_diagnostics_1 running backfill_history');
  });
});
