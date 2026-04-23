import { describe, expect, it } from 'vitest';
import { createWorkbenchCapabilityService } from '../src/workbench/service.js';

describe('workbench capability service', () => {
  it('reports static workbench capabilities with bounded availability summary', async () => {
    const service = createWorkbenchCapabilityService({
      now: () => new Date('2026-04-23T12:00:00.000Z'),
    });

    const report = await service.listCapabilities({ provider: 'gemini' });

    expect(report).toMatchObject({
      object: 'workbench_capability_report',
      generatedAt: '2026-04-23T12:00:00.000Z',
      provider: 'gemini',
      summary: {
        total: 4,
        available: 0,
        accountGated: 0,
        unknown: 4,
        blocked: 0,
      },
    });
    expect(report.capabilities.map((capability) => capability.id)).toEqual([
      'gemini.media.create_image',
      'gemini.media.create_music',
      'gemini.media.create_video',
      'gemini.research.deep_research',
    ]);
  });

  it('merges discovered capabilities over the static catalog', async () => {
    const service = createWorkbenchCapabilityService({
      now: () => new Date('2026-04-23T12:00:00.000Z'),
      discoverCapabilities: async () => [
        {
          id: 'gemini.media.create_image',
          provider: 'gemini',
          providerLabels: ['Create image', 'Image creation'],
          category: 'media',
          invocationMode: 'tool_drawer_selection',
          surfaces: ['browser_service'],
          availability: 'available',
          stability: 'observed',
          requiredInputs: [
            {
              name: 'prompt',
              required: true,
            },
          ],
          output: {
            artifactTypes: ['image'],
          },
          safety: {},
          source: 'browser_discovery',
          observedAt: '2026-04-23T12:00:00.000Z',
        },
      ],
    });

    const report = await service.listCapabilities({ provider: 'gemini', category: 'media' });

    expect(report.capabilities[0]).toMatchObject({
      id: 'gemini.media.create_image',
      availability: 'available',
      source: 'browser_discovery',
      providerLabels: ['Create image', 'Create Image', 'Image creation'],
    });
    expect(report.summary.available).toBe(1);
  });
});
