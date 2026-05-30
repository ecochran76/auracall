import { describe, expect, test, vi } from 'vitest';
import {
  formatApiMirrorRecoveryCandidatesCliSummary,
  readApiMirrorRecoveryCandidatesForCli,
} from '../../src/cli/apiMirrorRecoveryCommand.js';

describe('api mirror recovery CLI helpers', () => {
  test('reads recovery candidates through the local API', async () => {
    const fetchImpl = vi.fn(async (url: URL) => {
      expect(url.toString()).toBe(
        'http://127.0.0.1:18095/v1/account-mirrors/recovery-candidates?provider=chatgpt&runtimeProfile=default&tenant=operator%40example.com&status=eligible&action=queue_history_materialization&includeSearchRows=false&limit=2',
      );
      return new Response(JSON.stringify({
        object: 'account_mirror_artifact_recovery_plan',
        generatedAt: '2026-05-30T16:40:00.000Z',
        query: {
          provider: 'chatgpt',
          runtimeProfileId: 'default',
          tenantKey: 'operator@example.com',
          limit: 2,
        },
        candidates: [{
          provider: 'chatgpt',
          runtimeProfileId: 'default',
          status: 'eligible',
          action: 'queue_history_materialization',
          reason: 'Target has remote-known missing local assets.',
          counts: {
            remoteKnownMissingLocal: {
              artifacts: 4,
              files: 2,
              media: 0,
              total: 6,
            },
          },
        }],
        omitted: {
          candidates: 1,
        },
        metrics: {
          total: 2,
          returned: 1,
          remoteKnownMissingLocal: {
            artifacts: 4,
            files: 2,
            media: 0,
            total: 6,
          },
          unknownOrDeferred: {
            artifacts: 0,
            files: 0,
            media: 0,
            total: 0,
          },
        },
      }));
    });

    const result = await readApiMirrorRecoveryCandidatesForCli({
      port: 18095,
      provider: 'chatgpt',
      runtimeProfile: 'default',
      tenant: 'operator@example.com',
      status: 'eligible',
      action: 'queue_history_materialization',
      includeSearchRows: false,
      limit: 2,
    }, fetchImpl as never);

    const summary = formatApiMirrorRecoveryCandidatesCliSummary(result);
    expect(summary).toContain('Mirror recovery candidates: 1/2');
    expect(summary).toContain('Omitted: 1');
    expect(summary).toContain('Remote-known missing local: 6 total');
    expect(summary).toContain('chatgpt/default eligible action=queue_history_materialization');
  });
});
