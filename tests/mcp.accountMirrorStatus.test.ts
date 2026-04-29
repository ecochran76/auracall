import { describe, expect, it } from 'vitest';
import { createAccountMirrorStatusRegistry } from '../src/accountMirror/statusRegistry.js';
import { createAccountMirrorStatusToolHandler } from '../src/mcp/tools/accountMirrorStatus.js';

describe('mcp account_mirror_status tool', () => {
  it('returns read-only account mirror status from the shared registry', async () => {
    const registry = createAccountMirrorStatusRegistry({
      config: {
        runtimeProfiles: {
          default: {
            browserProfile: 'default',
            defaultService: 'chatgpt',
            services: {
              chatgpt: {
                identity: {
                  email: 'ecochran76@gmail.com',
                  accountLevel: 'Business',
                },
              },
            },
          },
        },
      },
      now: () => new Date('2026-04-29T12:00:00.000Z'),
    });
    const handler = createAccountMirrorStatusToolHandler({ registry });

    const result = await handler({
      provider: 'chatgpt',
      runtimeProfile: 'default',
      explicitRefresh: true,
    });

    expect(result).toMatchObject({
      isError: false,
      structuredContent: {
        object: 'account_mirror_status',
        generatedAt: '2026-04-29T12:00:00.000Z',
        metrics: {
          total: 1,
          eligible: 1,
        },
        entries: [
          {
            provider: 'chatgpt',
            runtimeProfileId: 'default',
            browserProfileId: 'default',
            expectedIdentityKey: 'ecochran76@gmail.com',
            accountLevel: 'Business',
            status: 'eligible',
            reason: 'eligible',
          },
        ],
      },
    });
  });
});
