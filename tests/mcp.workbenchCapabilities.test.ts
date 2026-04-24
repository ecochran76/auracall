import { describe, expect, it } from 'vitest';
import { createWorkbenchCapabilitiesToolHandler } from '../src/mcp/tools/workbenchCapabilities.js';

describe('mcp workbench_capabilities tool', () => {
  it('returns structured workbench capability reports', async () => {
    const handler = createWorkbenchCapabilitiesToolHandler({
      listCapabilities: async (request) => ({
        object: 'workbench_capability_report',
        generatedAt: '2026-04-23T12:00:00.000Z',
        provider: request?.provider ?? null,
        category: request?.category ?? null,
        runtimeProfile: request?.runtimeProfile ?? null,
        browserDiagnostics: request?.diagnostics === 'browser-state'
          ? {
              probeStatus: 'observed',
              service: request.provider ?? null,
              ownerStepId: 'workbench-capabilities-grok',
              observedAt: '2026-04-24T12:00:00.000Z',
              source: 'browser-service',
              reason: null,
              target: {
                host: '127.0.0.1',
                port: 45000,
                targetId: 'target-1',
                url: 'https://grok.com/imagine',
                title: 'Grok',
              },
              document: null,
              visibleCounts: null,
              providerEvidence: {
                detector: 'grok-feature-probe-v1',
              },
              screenshot: null,
            }
          : null,
        capabilities: [
          {
            id: 'chatgpt.research.deep_research',
            provider: 'chatgpt',
            providerLabels: ['Deep research'],
            category: 'research',
            invocationMode: 'tool_drawer_selection',
            surfaces: ['browser_service', 'local_api', 'mcp'],
            availability: 'unknown',
            stability: 'observed',
            requiredInputs: [{ name: 'prompt', required: true }],
            output: { artifactTypes: ['document'] },
            safety: { mayTakeMinutes: true },
            source: 'test_fixture',
          },
        ],
        summary: {
          total: 1,
          available: 0,
          accountGated: 0,
          unknown: 1,
          blocked: 0,
        },
      }),
    });

    const result = await handler({
      provider: 'grok',
      category: 'research',
      runtimeProfile: 'default',
      diagnostics: 'browser-state',
    });

    expect(result).toMatchObject({
      structuredContent: {
        object: 'workbench_capability_report',
        provider: 'grok',
        category: 'research',
        runtimeProfile: 'default',
        browserDiagnostics: {
          probeStatus: 'observed',
          service: 'grok',
          providerEvidence: {
            detector: 'grok-feature-probe-v1',
          },
        },
        capabilities: [
          {
            id: 'chatgpt.research.deep_research',
            category: 'research',
          },
        ],
      },
    });
  });
});
