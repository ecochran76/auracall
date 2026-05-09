import { describe, expect, it } from 'vitest';
import {
  createAccountMirrorSchedulerDiagnosticsToolHandler,
} from '../src/mcp/tools/accountMirrorSchedulerDiagnostics.js';

const diagnosticsPayload = {
  object: 'account_mirror_scheduler_diagnostics_bundle',
  capturedAt: '2026-05-09T12:00:00.000Z',
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
  latestSchedulerEvent: {
    event: 'refresh-completed',
  },
};

describe('mcp account_mirror_scheduler_diagnostics tool', () => {
  it('reads scheduler diagnostics from the local API', async () => {
    const fetchImpl = async (url: string | URL | Request) => {
      expect(String(url)).toBe(
        'http://127.0.0.1:18080/v1/account-mirrors/scheduler/diagnostics?provider=chatgpt&runtimeProfile=default&completionId=acctmirror_diagnostics_1',
      );
      return new Response(JSON.stringify(diagnosticsPayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };
    const handler = createAccountMirrorSchedulerDiagnosticsToolHandler({ fetchImpl });

    const result = await handler({
      port: 18080,
      provider: 'chatgpt',
      runtimeProfile: 'default',
      completionId: 'acctmirror_diagnostics_1',
    });

    expect(result).toMatchObject({
      isError: false,
      content: [
        {
          type: 'text',
          text: 'Account mirror scheduler diagnostics: chatgpt/default wait=active completion=acctmirror_diagnostics_1.',
        },
      ],
      structuredContent: {
        host: '127.0.0.1',
        port: 18080,
        diagnostics: diagnosticsPayload,
      },
    });
  });
});
