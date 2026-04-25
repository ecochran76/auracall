import type { MediaGenerationResponse } from '../../src/media/types.js';

export function createGeminiMusicVariantResponse(
  id = 'medgen_gemini_music_variants_1',
): MediaGenerationResponse {
  return {
    id,
    object: 'media_generation',
    status: 'succeeded',
    provider: 'gemini',
    mediaType: 'music',
    prompt: 'Create a very short instrumental spy theme with brushed drums and muted guitar.',
    createdAt: '2026-04-25T16:49:10.979Z',
    updatedAt: '2026-04-25T16:50:02.035Z',
    completedAt: '2026-04-25T16:50:02.035Z',
    artifacts: [
      {
        id: 'gemini-artifact:62dd6ff9d85218b1:1:1:video_with_album_art',
        type: 'music',
        fileName: 'Midnight_at_the_Harbor.mp4',
        path: '/tmp/Midnight_at_the_Harbor.mp4',
        uri: 'file:///tmp/Midnight_at_the_Harbor.mp4',
        mimeType: 'video/mp4',
        metadata: {
          materialization: 'generated-media-download-variant',
          downloadLabel: 'VideoAudio with cover art',
          downloadVariant: 'video_with_album_art',
          downloadOptions: ['Download track'],
          remoteUrl: 'https://contribution.usercontent.google.com/download?filename=midnight_at_the_harbor.mp4',
        },
      },
      {
        id: 'gemini-artifact:62dd6ff9d85218b1:1:1:mp3',
        type: 'music',
        fileName: 'Midnight_at_the_Harbor.mp3',
        path: '/tmp/Midnight_at_the_Harbor.mp3',
        uri: 'file:///tmp/Midnight_at_the_Harbor.mp3',
        mimeType: 'audio/mpeg',
        metadata: {
          materialization: 'generated-media-download-variant',
          downloadLabel: 'Audio onlyMP3 track',
          downloadVariant: 'mp3',
          downloadOptions: ['Download track'],
          remoteUrl: 'https://contribution.usercontent.google.com/download?filename=midnight_at_the_harbor.mp4',
        },
      },
    ],
    timeline: [
      {
        event: 'running_persisted',
        at: '2026-04-25T16:49:10.979Z',
        details: { status: 'running' },
      },
      {
        event: 'capability_discovered',
        at: '2026-04-25T16:49:13.464Z',
        details: {
          id: 'gemini.media.create_music',
          availability: 'available',
          source: 'browser_discovery',
        },
      },
      {
        event: 'browser_target_attached',
        at: '2026-04-25T16:49:13.651Z',
        details: {
          targetId: 'gemini-tab-1',
          targetUrl: 'https://gemini.google.com/app',
        },
      },
      {
        event: 'submitted_state_observed',
        at: '2026-04-25T16:49:16.913Z',
        details: {
          href: 'https://gemini.google.com/app',
          conversationId: null,
          targetId: 'gemini-tab-1',
          isGenerating: true,
          hasGeneratedMedia: false,
          tabTargetId: 'gemini-tab-1',
        },
      },
      {
        event: 'prompt_submitted',
        at: '2026-04-25T16:49:18.925Z',
        details: {
          capabilityId: 'gemini.media.create_music',
          conversationId: '62dd6ff9d85218b1',
          tabTargetId: 'gemini-tab-1',
          url: 'https://gemini.google.com/app/62dd6ff9d85218b1',
        },
      },
      {
        event: 'artifact_poll',
        at: '2026-04-25T16:49:57.359Z',
        details: {
          pollCount: 5,
          artifactCount: 2,
          imageArtifactCount: 1,
          musicArtifactCount: 1,
          videoArtifactCount: 0,
          lastReadbackError: null,
        },
      },
      {
        event: 'music_visible',
        at: '2026-04-25T16:49:57.362Z',
        details: {
          pollCount: 5,
          generatedArtifactCount: 1,
          generatedMusicCount: 1,
          artifactIds: ['gemini-artifact:62dd6ff9d85218b1:1:1'],
        },
      },
      {
        event: 'artifact_materialized',
        at: '2026-04-25T16:49:59.767Z',
        details: {
          providerArtifactId: 'gemini-artifact:62dd6ff9d85218b1:1:1:video_with_album_art',
          fileName: 'Midnight_at_the_Harbor.mp4',
          path: '/tmp/Midnight_at_the_Harbor.mp4',
          mimeType: 'video/mp4',
          materialization: 'generated-media-download-variant',
          downloadLabel: 'VideoAudio with cover art',
          downloadVariant: 'video_with_album_art',
        },
      },
      {
        event: 'artifact_materialized',
        at: '2026-04-25T16:50:02.033Z',
        details: {
          providerArtifactId: 'gemini-artifact:62dd6ff9d85218b1:1:1:mp3',
          fileName: 'Midnight_at_the_Harbor.mp3',
          path: '/tmp/Midnight_at_the_Harbor.mp3',
          mimeType: 'audio/mpeg',
          materialization: 'generated-media-download-variant',
          downloadLabel: 'Audio onlyMP3 track',
          downloadVariant: 'mp3',
        },
      },
      {
        event: 'completed',
        at: '2026-04-25T16:50:02.035Z',
        details: {
          status: 'succeeded',
          artifactCount: 2,
        },
      },
    ],
    metadata: {
      source: 'api',
      transport: 'browser',
      runtimeProfile: 'default',
      conversationId: '62dd6ff9d85218b1',
      tabTargetId: 'gemini-tab-1',
      capabilityId: 'gemini.media.create_music',
      generatedArtifactCount: 1,
      artifactPollCount: 5,
    },
  };
}
