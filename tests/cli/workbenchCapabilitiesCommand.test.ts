import { describe, expect, it } from 'vitest';
import {
  buildWorkbenchCapabilityReportForCli,
  formatWorkbenchCapabilityReport,
  normalizeWorkbenchCapabilityDiagnostics,
  normalizeWorkbenchCapabilityCategory,
  normalizeWorkbenchCapabilityProvider,
} from '../../src/cli/workbenchCapabilitiesCommand.js';
import type { WorkbenchCapabilityReport } from '../../src/workbench/types.js';

describe('workbench capabilities CLI helpers', () => {
  it('normalizes provider and category filters', () => {
    expect(normalizeWorkbenchCapabilityProvider('Gemini')).toBe('gemini');
    expect(normalizeWorkbenchCapabilityCategory('Media')).toBe('media');
    expect(() => normalizeWorkbenchCapabilityProvider('claude')).toThrow(
      'Invalid provider "claude". Use "chatgpt", "gemini", or "grok".',
    );
    expect(normalizeWorkbenchCapabilityDiagnostics('browser-state')).toBe('browser-state');
    expect(() => normalizeWorkbenchCapabilityDiagnostics('raw-cdp')).toThrow(
      'Invalid diagnostics "raw-cdp". Use "browser-state".',
    );
  });

  it('builds a bounded report request for the reporter', async () => {
    const calls: unknown[] = [];
    const report = await buildWorkbenchCapabilityReportForCli(
      {
        async listCapabilities(request) {
          calls.push(request);
          return sampleReport;
        },
      },
      {
        target: 'gemini',
        category: 'media',
        availableOnly: true,
        runtimeProfile: 'default',
      },
    );

    expect(calls).toEqual([
      {
        provider: 'gemini',
        category: 'media',
        runtimeProfile: 'default',
        diagnostics: null,
        includeUnavailable: false,
      },
    ]);
    expect(report).toBe(sampleReport);
  });

  it('formats a compact operator-readable capability report', () => {
    expect(formatWorkbenchCapabilityReport(sampleReport)).toContain(
      'Workbench capabilities (provider gemini, category media, AuraCall runtime profile default)',
    );
    expect(formatWorkbenchCapabilityReport(sampleReport)).toContain(
      '- gemini.media.create_image [media] available via tool_drawer_selection (browser_discovery): Create image',
    );
    expect(formatWorkbenchCapabilityReport(sampleReport)).toContain(
      'output: image; surfaces: browser_service, cli, local_api, mcp',
    );
  });

  it('formats opt-in browser diagnostics in capability reports', () => {
    const report: WorkbenchCapabilityReport = {
      ...sampleReport,
      browserDiagnostics: {
        probeStatus: 'observed',
        service: 'grok',
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
        document: {
          url: 'https://grok.com/imagine',
          title: 'Grok',
          readyState: 'complete',
          visibilityState: 'visible',
          focused: true,
          bodyTextLength: 1200,
        },
        visibleCounts: {
          buttons: 4,
          links: 2,
          inputs: 0,
          textareas: 1,
          contenteditables: 0,
          modelResponses: 0,
        },
        providerEvidence: {
          detector: 'grok-feature-probe-v1',
          imagine: {
            visible: true,
            account_gated: true,
          },
        },
        screenshot: {
          path: '/tmp/auracall-diagnostics/grok.png',
          mimeType: 'image/png',
          bytes: 1234,
        },
      },
    };

    const formatted = formatWorkbenchCapabilityReport(report);

    expect(formatted).toContain('Browser diagnostics: observed grok');
    expect(formatted).toContain('target: https://grok.com/imagine');
    expect(formatted).toContain('screenshot: /tmp/auracall-diagnostics/grok.png (1234 bytes)');
    expect(formatted).toContain('"detector":"grok-feature-probe-v1"');
  });
});

const sampleReport: WorkbenchCapabilityReport = {
  object: 'workbench_capability_report',
  generatedAt: '2026-04-23T12:00:00.000Z',
  provider: 'gemini',
  category: 'media',
  runtimeProfile: 'default',
  capabilities: [
    {
      id: 'gemini.media.create_image',
      provider: 'gemini',
      providerLabels: ['Create image'],
      category: 'media',
      invocationMode: 'tool_drawer_selection',
      surfaces: ['browser_service', 'cli', 'local_api', 'mcp'],
      availability: 'available',
      stability: 'observed',
      requiredInputs: [{ name: 'prompt', required: true }],
      output: { artifactTypes: ['image'] },
      safety: {},
      source: 'browser_discovery',
      observedAt: '2026-04-23T12:00:00.000Z',
    },
  ],
  summary: {
    total: 1,
    available: 1,
    accountGated: 0,
    unknown: 0,
    blocked: 0,
  },
};
