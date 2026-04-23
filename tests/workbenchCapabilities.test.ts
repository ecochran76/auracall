import { describe, expect, it } from 'vitest';
import { createWorkbenchCapabilityService } from '../src/workbench/service.js';
import { deriveGeminiWorkbenchCapabilitiesFromFeatureSignature } from '../src/workbench/geminiDiscovery.js';

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
        total: 5,
        available: 0,
        accountGated: 0,
        unknown: 5,
        blocked: 0,
      },
    });
    expect(report.capabilities.map((capability) => capability.id)).toEqual([
      'gemini.canvas',
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
      providerLabels: ['Create image', 'Create Image', 'Images', 'Image creation'],
    });
    expect(report.summary.available).toBe(1);
  });

  it('derives available Gemini capabilities from a live feature signature', () => {
    const capabilities = deriveGeminiWorkbenchCapabilitiesFromFeatureSignature(
      JSON.stringify({
        detector: 'gemini-feature-probe-v1',
        modes: ['Images', 'Music', 'Videos', 'Canvas', 'Deep research'],
      }),
      '2026-04-23T12:00:00.000Z',
    );

    expect(capabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'gemini.canvas',
        provider: 'gemini',
        availability: 'available',
        source: 'browser_discovery',
      }),
      expect.objectContaining({
        id: 'gemini.media.create_image',
        availability: 'available',
        providerLabels: ['Images'],
      }),
      expect.objectContaining({
        id: 'gemini.media.create_music',
        availability: 'available',
        providerLabels: ['Music'],
        output: expect.objectContaining({
          artifactTypes: ['music', 'video/mp4'],
        }),
      }),
      expect.objectContaining({
        id: 'gemini.media.create_video',
        availability: 'available',
        providerLabels: ['Videos'],
      }),
      expect.objectContaining({
        id: 'gemini.research.deep_research',
        availability: 'available',
      }),
    ]));
  });
});
