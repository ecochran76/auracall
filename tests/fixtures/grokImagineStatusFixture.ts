import type { MediaGenerationResponse } from '../../src/media/types.js';

export function createGrokImagineVideoResponse(
  id = 'medgen_grok_imagine_video_1',
): MediaGenerationResponse {
  return {
    id,
    object: 'media_generation',
    status: 'succeeded',
    provider: 'grok',
    mediaType: 'video',
    prompt: 'Generate a video of an asphalt secret agent',
    createdAt: '2026-04-25T17:20:00.000Z',
    updatedAt: '2026-04-25T17:20:44.000Z',
    completedAt: '2026-04-25T17:20:44.000Z',
    artifacts: [
      {
        id: 'grok_imagine_video_1',
        type: 'video',
        fileName: 'grok-imagine-video-1.mp4',
        path: '/tmp/grok-imagine-video-1.mp4',
        uri: 'file:///tmp/grok-imagine-video-1.mp4',
        mimeType: 'video/mp4',
        metadata: {
          materialization: 'remote-media-fetch',
          materializationSource: 'generated-video',
          remoteUrl: 'https://assets.grok.com/users/test/generated/video-1.mp4',
          selected: true,
        },
      },
    ],
    timeline: [
      {
        event: 'running_persisted',
        at: '2026-04-25T17:20:00.000Z',
        details: { status: 'running' },
      },
      {
        event: 'capability_discovered',
        at: '2026-04-25T17:20:01.000Z',
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
        at: '2026-04-25T17:20:02.000Z',
        details: {
          targetId: 'grok-video-tab-1',
          targetUrl: 'https://grok.com/imagine',
        },
      },
      {
        event: 'prompt_submitted',
        at: '2026-04-25T17:20:05.000Z',
        details: {
          capabilityId: 'grok.media.imagine_video',
          tabTargetId: 'grok-video-tab-1',
          url: 'https://grok.com/imagine/post/video-1',
        },
      },
      {
        event: 'run_state_observed',
        at: '2026-04-25T17:20:30.000Z',
        details: {
          pollCount: 3,
          runState: 'terminal_video',
          pending: false,
          terminalVideo: true,
          generatedVideoCount: 1,
          selectedGeneratedVideoCount: 1,
          publicGalleryVideoCount: 0,
          downloadControlCount: 1,
          materializationCandidateCount: 2,
          materializationCandidateSource: 'generated-video',
          mediaUrlCount: 1,
          visibleTileCount: 0,
          providerHref: 'https://grok.com/imagine/post/video-1',
          decision: 'ready',
          failureReason: null,
        },
      },
      {
        event: 'video_visible',
        at: '2026-04-25T17:20:30.100Z',
        details: {
          pollCount: 3,
          generatedVideoCount: 1,
          selectedGeneratedVideoCount: 1,
          materializationCandidateCount: 2,
          materializationCandidateSource: 'generated-video',
          mediaUrlCount: 1,
          visibleTileCount: 0,
          providerHref: 'https://grok.com/imagine/post/video-1',
        },
      },
      {
        event: 'artifact_materialized',
        at: '2026-04-25T17:20:44.000Z',
        details: {
          providerArtifactId: 'grok_imagine_video_1',
          path: '/tmp/grok-imagine-video-1.mp4',
          uri: 'file:///tmp/grok-imagine-video-1.mp4',
          mimeType: 'video/mp4',
          materialization: 'remote-media-fetch',
          materializationSource: 'generated-video',
        },
      },
      {
        event: 'completed',
        at: '2026-04-25T17:20:44.000Z',
        details: {
          status: 'succeeded',
          artifactCount: 1,
        },
      },
    ],
    metadata: {
      source: 'api',
      transport: 'browser',
      runtimeProfile: 'default',
      tabUrl: 'https://grok.com/imagine/post/video-1',
      tabTargetId: 'grok-video-tab-1',
      capabilityId: 'grok.media.imagine_video',
      artifactPollCount: 3,
      generatedArtifactCount: 1,
      materializationCandidateSource: 'generated-video',
    },
  };
}
