import { describe, expect, it } from 'vitest';
import { probeMediaGenerationBrowserDiagnostics } from '../src/media/browserDiagnostics.js';

describe('media browser diagnostics', () => {
  it('uses running Gemini media metadata and timeline target id for browser diagnostics', async () => {
    const diagnostics = await probeMediaGenerationBrowserDiagnostics(
      {
        id: 'medgen_browser_diag_1',
        object: 'media_generation',
        status: 'running',
        provider: 'gemini',
        mediaType: 'image',
        prompt: 'Generate an image of an asphalt secret agent',
        createdAt: '2026-04-23T15:00:00.000Z',
        updatedAt: '2026-04-23T15:00:04.000Z',
        completedAt: null,
        artifacts: [],
        metadata: {
          transport: 'browser',
          runtimeProfile: 'auracall-gemini-pro',
        },
        timeline: [
          {
            event: 'prompt_submitted',
            at: '2026-04-23T15:00:02.000Z',
            details: {
              tabTargetId: 'gemini-media-tab-1',
              conversationId: 'gemini-media-conversation-1',
            },
          },
        ],
      },
      {
        cwd: '/tmp/auracall-media-diag-cwd',
        env: { TEST_ENV: '1' },
        resolveConfigImpl: async (cliOptions, cwd, env) => {
          expect(cliOptions).toEqual({ profile: 'auracall-gemini-pro' });
          expect(cwd).toBe('/tmp/auracall-media-diag-cwd');
          expect(env).toMatchObject({ TEST_ENV: '1' });
          return {
            auracallProfile: 'auracall-gemini-pro',
            engine: 'browser',
            services: {
              gemini: {
                url: 'https://gemini.google.com/app',
              },
            },
          } as never;
        },
        probeBrowserRunDiagnosticsImpl: async (_config, input) => {
          expect(input).toMatchObject({
            service: 'gemini',
            runId: 'medgen_browser_diag_1',
            stepId: 'medgen_browser_diag_1:media',
            preferredTargetId: 'gemini-media-tab-1',
          });
          return {
            service: 'gemini',
            ownerStepId: 'medgen_browser_diag_1:media',
            observedAt: '2026-04-23T15:00:05.000Z',
            source: 'browser-service',
            target: {
              host: '127.0.0.1',
              port: 9222,
              targetId: 'gemini-media-tab-1',
              url: 'https://gemini.google.com/app/gemini-media-conversation-1',
              title: 'Google Gemini',
            },
            document: {
              url: 'https://gemini.google.com/app/gemini-media-conversation-1',
              title: 'Google Gemini',
              readyState: 'complete',
              visibilityState: 'visible',
              focused: true,
              bodyTextLength: 1200,
            },
            visibleCounts: {
              buttons: 12,
              links: 2,
              inputs: 0,
              textareas: 1,
              contenteditables: 1,
              modelResponses: 1,
            },
            providerEvidence: {
              hasActiveAvatarSpinner: true,
              isGenerating: true,
            },
            browserMutations: {
              total: 1,
              items: [
                {
                  id: 'mutation-media-1',
                  phase: 'complete',
                  kind: 'navigate',
                  source: 'provider:gemini:navigate-conversation-surface',
                  at: '2026-04-23T15:00:04.500Z',
                  requestedUrl: 'https://gemini.google.com/app/gemini-media-conversation-1',
                  fromUrl: 'https://gemini.google.com/app',
                  toUrl: 'https://gemini.google.com/app/gemini-media-conversation-1',
                  targetId: 'gemini-media-tab-1',
                  outcome: 'succeeded',
                },
              ],
            },
            screenshot: {
              path: '/tmp/gemini-media-diag.png',
              mimeType: 'image/png',
              bytes: 4096,
            },
          };
        },
      },
    );

    expect(diagnostics).toMatchObject({
      probeStatus: 'observed',
      service: 'gemini',
      ownerStepId: 'medgen_browser_diag_1:media',
      target: {
        targetId: 'gemini-media-tab-1',
      },
      providerEvidence: {
        hasActiveAvatarSpinner: true,
      },
      browserMutations: {
        total: 1,
        items: [
          {
            id: 'mutation-media-1',
            source: 'provider:gemini:navigate-conversation-surface',
          },
        ],
      },
      screenshot: {
        path: '/tmp/gemini-media-diag.png',
      },
    });
  });

  it('returns unavailable diagnostics for terminal media generations', async () => {
    const diagnostics = await probeMediaGenerationBrowserDiagnostics({
      id: 'medgen_terminal_diag_1',
      object: 'media_generation',
      status: 'succeeded',
      provider: 'gemini',
      mediaType: 'image',
      prompt: 'Generate an image.',
      createdAt: '2026-04-23T15:00:00.000Z',
      updatedAt: '2026-04-23T15:00:10.000Z',
      completedAt: '2026-04-23T15:00:10.000Z',
      artifacts: [],
      metadata: {
        transport: 'browser',
      },
    });

    expect(diagnostics).toMatchObject({
      probeStatus: 'unavailable',
      service: 'gemini',
      reason: 'media generation medgen_terminal_diag_1 is not actively running',
    });
  });

  it('uses an attached pre-submission media target for browser diagnostics', async () => {
    const diagnostics = await probeMediaGenerationBrowserDiagnostics(
      {
        id: 'medgen_presubmit_target_diag_1',
        object: 'media_generation',
        status: 'running',
        provider: 'gemini',
        mediaType: 'image',
        prompt: 'Generate an image.',
        createdAt: '2026-04-23T15:00:00.000Z',
        updatedAt: '2026-04-23T15:00:01.000Z',
        completedAt: null,
        artifacts: [],
        metadata: {
          transport: 'browser',
          runtimeProfile: 'auracall-gemini-pro',
        },
        timeline: [
          {
            event: 'browser_target_attached',
            at: '2026-04-23T15:00:01.000Z',
            details: {
              targetId: 'gemini-presubmit-tab-1',
            },
          },
        ],
      },
      {
        resolveConfigImpl: async () =>
          ({
            auracallProfile: 'auracall-gemini-pro',
            engine: 'browser',
          }) as never,
        probeBrowserRunDiagnosticsImpl: async (_config, input) => {
          expect(input.preferredTargetId).toBe('gemini-presubmit-tab-1');
          return {
            service: 'gemini',
            ownerStepId: 'medgen_presubmit_target_diag_1:media',
            observedAt: '2026-04-23T15:00:02.000Z',
            source: 'browser-service',
            target: {
              host: '127.0.0.1',
              port: 9222,
              targetId: 'gemini-presubmit-tab-1',
              url: 'https://gemini.google.com/app',
              title: 'Google Gemini',
            },
            document: {
              url: 'https://gemini.google.com/app',
              title: 'Google Gemini',
              readyState: 'complete',
              visibilityState: 'visible',
              focused: true,
              bodyTextLength: 1000,
            },
            visibleCounts: {
              buttons: 10,
              links: 2,
              inputs: 0,
              textareas: 1,
              contenteditables: 1,
              modelResponses: 0,
            },
            providerEvidence: {
              isGenerating: false,
            },
            screenshot: null,
          };
        },
      },
    );

    expect(diagnostics).toMatchObject({
      probeStatus: 'observed',
      service: 'gemini',
      target: {
        targetId: 'gemini-presubmit-tab-1',
      },
    });
  });

  it('does not treat a pre-submission media run without target identity as observed', async () => {
    const diagnostics = await probeMediaGenerationBrowserDiagnostics(
      {
        id: 'medgen_presubmit_diag_1',
        object: 'media_generation',
        status: 'running',
        provider: 'gemini',
        mediaType: 'image',
        prompt: 'Generate an image.',
        createdAt: '2026-04-23T15:00:00.000Z',
        updatedAt: '2026-04-23T15:00:01.000Z',
        completedAt: null,
        artifacts: [],
        metadata: {
          transport: 'browser',
          runtimeProfile: 'auracall-gemini-pro',
        },
        timeline: [
          {
            event: 'executor_started',
            at: '2026-04-23T15:00:01.000Z',
          },
        ],
      },
      {
        resolveConfigImpl: async () =>
          ({
            auracallProfile: 'auracall-gemini-pro',
            engine: 'browser',
          }) as never,
        probeBrowserRunDiagnosticsImpl: async () => {
          throw new Error('pre-submission media diagnostics should not probe a generic provider tab');
        },
      },
    );

    expect(diagnostics).toMatchObject({
      probeStatus: 'unavailable',
      service: 'gemini',
      ownerStepId: 'medgen_presubmit_diag_1:media',
      reason: 'media generation medgen_presubmit_diag_1 has no browser tab target yet',
    });
  });
});
