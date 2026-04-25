import { describe, expect, it } from 'vitest';
import { summarizeMediaGenerationStatus } from '../src/media/statusSummary.js';
import type { MediaGenerationResponse } from '../src/media/types.js';

describe('media generation status summary', () => {
  it('summarizes provider path, run state, and materialization diagnostics from persisted timeline', () => {
    const response: MediaGenerationResponse = {
      id: 'medgen_status_diagnostics_1',
      object: 'media_generation',
      status: 'succeeded',
      provider: 'grok',
      mediaType: 'video',
      prompt: 'Generate a short video of an asphalt secret agent',
      createdAt: '2026-04-25T04:44:13.690Z',
      updatedAt: '2026-04-25T04:44:47.486Z',
      completedAt: '2026-04-25T04:44:47.486Z',
      artifacts: [
        {
          id: 'grok_imagine_video_1',
          type: 'video',
          fileName: 'grok-imagine-video-1.mp4',
          path: '/tmp/grok-imagine-video-1.mp4',
          uri: 'file:///tmp/grok-imagine-video-1.mp4',
          mimeType: 'video/mp4',
          metadata: {
            materialization: 'download-button',
            materializationSource: 'generated-video',
          },
        },
      ],
      timeline: [
        {
          event: 'running_persisted',
          at: '2026-04-25T04:44:13.690Z',
          details: { status: 'running' },
        },
        {
          event: 'capability_discovered',
          at: '2026-04-25T04:44:14.115Z',
          details: {
            id: 'grok.media.imagine_video',
            availability: 'available',
            source: 'browser_discovery',
            metadata: {
              discoveryAction: {
                action: 'grok-imagine-video-mode',
              },
            },
          },
        },
        {
          event: 'browser_target_attached',
          at: '2026-04-25T04:44:14.528Z',
          details: {
            targetId: 'grok-tab-1',
            targetUrl: 'https://grok.com/imagine',
          },
        },
        {
          event: 'prompt_submitted',
          at: '2026-04-25T04:44:20.017Z',
          details: {
            tabTargetId: 'grok-tab-1',
            url: 'https://grok.com/imagine',
          },
        },
        {
          event: 'run_state_observed',
          at: '2026-04-25T04:44:33.117Z',
          details: {
            pollCount: 2,
            runState: 'pending',
            pending: true,
            terminalVideo: false,
            generatedVideoCount: 0,
            materializationCandidateSource: 'download-control',
            providerHref: 'https://grok.com/imagine/post/post-1',
            decision: 'pending',
          },
        },
        {
          event: 'run_state_observed',
          at: '2026-04-25T04:44:46.392Z',
          details: {
            pollCount: 3,
            runState: 'terminal_video',
            pending: false,
            terminalVideo: true,
            generatedVideoCount: 1,
            materializationCandidateSource: 'generated-video',
            providerHref: 'https://grok.com/imagine/post/post-1',
            decision: 'ready',
          },
        },
        {
          event: 'video_visible',
          at: '2026-04-25T04:44:46.394Z',
          details: {
            pollCount: 3,
            generatedVideoCount: 1,
            materializationCandidateSource: 'generated-video',
            providerHref: 'https://grok.com/imagine/post/post-1',
          },
        },
        {
          event: 'artifact_materialized',
          at: '2026-04-25T04:44:47.437Z',
          details: {
            providerArtifactId: 'grok_imagine_video_1',
            path: '/tmp/grok-imagine-video-1.mp4',
            mimeType: 'video/mp4',
            materialization: 'download-button',
            materializationSource: 'generated-video',
          },
        },
      ],
      metadata: {
        tabTargetId: 'grok-tab-1',
        generatedArtifactCount: 1,
      },
    };

    const summary = summarizeMediaGenerationStatus(response);

    expect(summary.diagnostics).toEqual({
      capability: {
        id: 'grok.media.imagine_video',
        availability: 'available',
        source: 'browser_discovery',
        discoveryAction: 'grok-imagine-video-mode',
      },
      submittedTab: {
        targetId: 'grok-tab-1',
        initialUrl: 'https://grok.com/imagine',
        submittedUrl: 'https://grok.com/imagine',
      },
      provider: {
        latestHref: 'https://grok.com/imagine/post/post-1',
        routeProgression: [
          'https://grok.com/imagine',
          'https://grok.com/imagine/post/post-1',
        ],
      },
      runState: {
        pollCount: 3,
        runState: 'terminal_video',
        pending: false,
        terminalImage: null,
        terminalVideo: true,
        generatedImageCount: null,
        generatedVideoCount: 1,
        generatedArtifactCount: 1,
        materializationCandidateSource: 'generated-video',
        decision: 'ready',
      },
      materialization: {
        artifactId: 'grok_imagine_video_1',
        path: '/tmp/grok-imagine-video-1.mp4',
        mimeType: 'video/mp4',
        materialization: 'download-button',
        materializationSource: 'generated-video',
      },
    });
  });
});
