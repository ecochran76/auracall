import { describe, expect, it } from 'vitest';
import { summarizeMediaGenerationStatus } from '../src/media/statusSummary.js';
import type { MediaGenerationResponse } from '../src/media/types.js';
import { createGeminiMusicVariantResponse } from './fixtures/geminiMusicStatusFixture.js';
import { createGrokImagineVideoResponse } from './fixtures/grokImagineStatusFixture.js';

describe('media generation status summary', () => {
  it('preserves Gemini music MP4 and MP3 variant status from persisted state', () => {
    const summary = summarizeMediaGenerationStatus(createGeminiMusicVariantResponse());

    expect(summary).toMatchObject({
      id: 'medgen_gemini_music_variants_1',
      object: 'media_generation_status',
      status: 'succeeded',
      provider: 'gemini',
      mediaType: 'music',
      artifactCount: 2,
      lastEvent: {
        event: 'completed',
      },
      artifacts: [
        {
          id: 'gemini-artifact:62dd6ff9d85218b1:1:1:video_with_album_art',
          type: 'music',
          fileName: 'Midnight_at_the_Harbor.mp4',
          path: '/tmp/Midnight_at_the_Harbor.mp4',
          mimeType: 'video/mp4',
          materialization: 'generated-media-download-variant',
          downloadLabel: 'VideoAudio with cover art',
          downloadVariant: 'video_with_album_art',
          downloadOptions: ['Download track'],
        },
        {
          id: 'gemini-artifact:62dd6ff9d85218b1:1:1:mp3',
          type: 'music',
          fileName: 'Midnight_at_the_Harbor.mp3',
          path: '/tmp/Midnight_at_the_Harbor.mp3',
          mimeType: 'audio/mpeg',
          materialization: 'generated-media-download-variant',
          downloadLabel: 'Audio onlyMP3 track',
          downloadVariant: 'mp3',
          downloadOptions: ['Download track'],
        },
      ],
      diagnostics: {
        capability: {
          id: 'gemini.media.create_music',
          availability: 'available',
          source: 'browser_discovery',
        },
        submittedTab: {
          targetId: 'gemini-tab-1',
          initialUrl: 'https://gemini.google.com/app',
          submittedUrl: 'https://gemini.google.com/app/62dd6ff9d85218b1',
        },
        provider: {
          latestHref: 'https://gemini.google.com/app/62dd6ff9d85218b1',
          routeProgression: [
            'https://gemini.google.com/app',
            'https://gemini.google.com/app/62dd6ff9d85218b1',
          ],
        },
        runState: {
          pollCount: 5,
          runState: 'terminal_music',
          terminalMusic: true,
          generatedMusicCount: 1,
          generatedArtifactCount: 1,
        },
        materialization: {
          artifactId: 'gemini-artifact:62dd6ff9d85218b1:1:1:mp3',
          path: '/tmp/Midnight_at_the_Harbor.mp3',
          mimeType: 'audio/mpeg',
          materialization: 'generated-media-download-variant',
        },
      },
      metadata: {
        source: 'api',
        transport: 'browser',
        runtimeProfile: 'default',
        conversationId: '62dd6ff9d85218b1',
        tabTargetId: 'gemini-tab-1',
        capabilityId: 'gemini.media.create_music',
        artifactPollCount: 5,
        generatedArtifactCount: 1,
      },
    });
  });

  it('preserves Grok Imagine video materialization status from persisted state', () => {
    const summary = summarizeMediaGenerationStatus(createGrokImagineVideoResponse());

    expect(summary).toMatchObject({
      id: 'medgen_grok_imagine_video_1',
      object: 'media_generation_status',
      status: 'succeeded',
      provider: 'grok',
      mediaType: 'video',
      artifactCount: 1,
      lastEvent: {
        event: 'completed',
      },
      artifacts: [
        {
          id: 'grok_imagine_video_1',
          type: 'video',
          fileName: 'grok-imagine-video-1.mp4',
          path: '/tmp/grok-imagine-video-1.mp4',
          mimeType: 'video/mp4',
          materialization: 'remote-media-fetch',
          remoteUrl: 'https://assets.grok.com/users/test/generated/video-1.mp4',
        },
      ],
      diagnostics: {
        capability: {
          id: 'grok.media.imagine_video',
          availability: 'available',
          source: 'browser_discovery',
          discoveryAction: 'grok-imagine-video-mode',
        },
        capabilitySelection: {
          capabilityId: 'grok.media.imagine_video',
          mode: 'Video',
          selected: true,
          clicked: true,
          modeControls: [
            {
              text: 'Image',
              role: 'radio',
              checked: 'false',
              disabled: false,
            },
            {
              text: 'Video',
              role: 'radio',
              checked: 'true',
              disabled: false,
            },
          ],
        },
        submittedTab: {
          targetId: 'grok-video-tab-1',
          initialUrl: 'https://grok.com/imagine',
          submittedUrl: 'https://grok.com/imagine/post/video-1',
        },
        provider: {
          latestHref: 'https://grok.com/imagine/post/video-1',
          routeProgression: [
            'https://grok.com/imagine/post/video-1',
          ],
        },
        runState: {
          pollCount: 3,
          runState: 'terminal_video',
          pending: false,
          terminalVideo: true,
          generatedVideoCount: 1,
          generatedArtifactCount: 1,
          materializationCandidateSource: 'generated-video',
          decision: 'ready',
        },
        materialization: {
          artifactId: 'grok_imagine_video_1',
          path: '/tmp/grok-imagine-video-1.mp4',
          mimeType: 'video/mp4',
          materialization: 'remote-media-fetch',
          materializationSource: 'generated-video',
        },
      },
      metadata: {
        source: 'api',
        transport: 'browser',
        runtimeProfile: 'default',
        tabTargetId: 'grok-video-tab-1',
        capabilityId: 'grok.media.imagine_video',
        artifactPollCount: 3,
        generatedArtifactCount: 1,
      },
    });
  });

  it('preserves Grok Imagine visible tile request limits in compact status metadata', () => {
    const response: MediaGenerationResponse = {
      id: 'medgen_grok_image_visible_tiles_1',
      object: 'media_generation',
      status: 'succeeded',
      provider: 'grok',
      mediaType: 'image',
      prompt: 'Generate images of an asphalt secret agent',
      createdAt: '2026-04-25T18:06:42.573Z',
      updatedAt: '2026-04-25T18:06:56.312Z',
      completedAt: '2026-04-25T18:06:56.312Z',
      artifacts: [
        {
          id: 'grok_imagine_visible_1',
          type: 'image',
          fileName: 'grok-imagine-visible-1.png',
          path: '/tmp/grok-imagine-visible-1.png',
          mimeType: 'image/png',
          metadata: {
            materialization: 'visible-tile-browser-capture',
            checksumSha256: 'preview-sha',
          },
        },
        {
          id: 'grok_imagine_full_quality_1',
          type: 'image',
          fileName: 'grok-imagine-full-quality.jpg',
          path: '/tmp/grok-imagine-full-quality.jpg',
          mimeType: 'image/jpeg',
          metadata: {
            materialization: 'download-button',
            checksumSha256: 'full-sha',
            previewArtifactId: 'grok_imagine_visible_1',
            previewSize: 12345,
            previewChecksumSha256: 'preview-sha',
            fullQualityDiffersFromPreview: true,
          },
        },
      ],
      metadata: {
        source: 'api',
        transport: 'browser',
        runtimeProfile: 'default',
        tabTargetId: 'grok-tab-1',
        capabilityId: 'grok.media.imagine_image',
        artifactPollCount: 1,
        generatedArtifactCount: 3,
        requestedVisibleTileCount: 8,
        visibleTileMaterializationLimit: 8,
        grokMaterializationDiagnostics: {
          requestedMaxItems: 8,
          selectedTileCount: 4,
          materializedVisibleTileCount: 3,
          fullQualityDownload: {
            attempted: true,
            ok: false,
            reason: 'download-button-missing',
          },
        },
      },
      timeline: [
        {
          event: 'completed',
          at: '2026-04-25T18:06:56.312Z',
          details: {
            status: 'succeeded',
            artifactCount: 1,
          },
        },
      ],
    };

    const summary = summarizeMediaGenerationStatus(response);

    expect(summary.metadata).toMatchObject({
      requestedVisibleTileCount: 8,
      visibleTileMaterializationLimit: 8,
      generatedArtifactCount: 3,
      grokMaterializationDiagnostics: {
        requestedMaxItems: 8,
        selectedTileCount: 4,
        materializedVisibleTileCount: 3,
      },
      tabTargetId: 'grok-tab-1',
      capabilityId: 'grok.media.imagine_image',
    });
    expect(summary.artifacts).toMatchObject([
      {
        id: 'grok_imagine_visible_1',
        materialization: 'visible-tile-browser-capture',
        checksumSha256: 'preview-sha',
      },
      {
        id: 'grok_imagine_full_quality_1',
        materialization: 'download-button',
        checksumSha256: 'full-sha',
        previewArtifactId: 'grok_imagine_visible_1',
        previewSize: 12345,
        previewChecksumSha256: 'preview-sha',
        fullQualityDiffersFromPreview: true,
      },
    ]);
  });

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
            downloadLabel: 'Download as MP3',
            downloadVariant: 'mp3',
            downloadOptions: ['Download as video with album art', 'Download as MP3'],
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

    expect(summary.artifacts).toEqual([
      expect.objectContaining({
        id: 'grok_imagine_video_1',
        downloadLabel: 'Download as MP3',
        downloadVariant: 'mp3',
        downloadOptions: ['Download as video with album art', 'Download as MP3'],
      }),
    ]);
    expect(summary.diagnostics).toEqual({
      capability: {
        id: 'grok.media.imagine_video',
        availability: 'available',
        source: 'browser_discovery',
        discoveryAction: 'grok-imagine-video-mode',
      },
      capabilitySelection: {
        capabilityId: null,
        mode: null,
        selected: null,
        clicked: null,
        modeControls: null,
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
        terminalMusic: null,
        terminalVideo: true,
        generatedImageCount: null,
        generatedMusicCount: null,
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

  it('summarizes Gemini artifact polling as an actionable in-progress run state', () => {
    const response: MediaGenerationResponse = {
      id: 'medgen_gemini_polling_1',
      object: 'media_generation',
      status: 'running',
      provider: 'gemini',
      mediaType: 'image',
      prompt: 'Generate an image of an asphalt secret agent',
      createdAt: '2026-04-25T14:05:56.715Z',
      updatedAt: '2026-04-25T14:06:19.890Z',
      completedAt: null,
      artifacts: [],
      timeline: [
        {
          event: 'capability_discovered',
          at: '2026-04-25T14:05:58.995Z',
          details: {
            id: 'gemini.media.create_image',
            availability: 'available',
            source: 'browser_discovery',
          },
        },
        {
          event: 'browser_target_attached',
          at: '2026-04-25T14:05:59.476Z',
          details: {
            targetId: 'gemini-tab-1',
            targetUrl: 'https://gemini.google.com/app',
          },
        },
        {
          event: 'composer_ready',
          at: '2026-04-25T14:06:02.757Z',
          details: {
            href: 'https://gemini.google.com/app',
            tabTargetId: 'gemini-tab-1',
          },
        },
        {
          event: 'prompt_submitted',
          at: '2026-04-25T14:06:03.940Z',
          details: {
            capabilityId: 'gemini.media.create_image',
            conversationId: 'b0450d66b9120b2b',
            tabTargetId: 'gemini-tab-1',
            url: 'https://gemini.google.com/app/b0450d66b9120b2b',
          },
        },
        {
          event: 'artifact_poll',
          at: '2026-04-25T14:06:09.685Z',
          details: {
            pollCount: 1,
            artifactCount: 0,
            imageArtifactCount: 0,
            lastReadbackError: null,
          },
        },
      ],
      metadata: {
        tabTargetId: 'gemini-tab-1',
      },
    };

    const summary = summarizeMediaGenerationStatus(response);

    expect(summary.diagnostics.runState).toEqual({
      pollCount: 1,
      runState: 'artifact_polling',
      pending: true,
      terminalImage: null,
      terminalMusic: null,
      terminalVideo: null,
      generatedImageCount: 0,
      generatedMusicCount: null,
      generatedVideoCount: null,
      generatedArtifactCount: 0,
      materializationCandidateSource: null,
      decision: null,
    });
    expect(summary.diagnostics.provider).toEqual({
      latestHref: 'https://gemini.google.com/app/b0450d66b9120b2b',
      routeProgression: [
        'https://gemini.google.com/app',
        'https://gemini.google.com/app/b0450d66b9120b2b',
      ],
    });
  });
});
