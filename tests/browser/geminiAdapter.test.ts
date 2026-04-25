import { describe, expect, test } from 'vitest';
import {
  classifyGeminiBlockingState,
  canReuseGeminiResolvedTabTarget,
  createGeminiAdapter,
  deriveGeminiFeatureProbeFromUiList,
  geminiGeneratedImageDownloadButtonTagExpression,
  inferGeminiGeneratedArtifactMediaType,
  geminiConversationSurfaceReadyExpression,
  extractGeminiProjectIdFromUrl,
  mergeGeminiFeatureProbes,
  geminiUrlMatchesPreference,
  normalizeGeminiConversationArtifacts,
  normalizeGeminiConversationFiles,
  normalizeGeminiConversationId,
  normalizeGeminiFeatureSignature,
  normalizeGeminiProjectId,
  resolveGeminiConfiguredUrl,
  resolveGeminiCreateProjectUrl,
  resolveGeminiEditProjectUrl,
  resolveGeminiConversationUrl,
  resolveGeminiProjectMenuAriaLabel,
  resolveGeminiProjectUrl,
  selectNewestGeminiAssistantText,
  selectPreferredGeminiTarget,
} from '../../src/browser/providers/geminiAdapter.js';

describe('geminiAdapter id helpers', () => {
  test('normalizes Gemini Gem ids from raw ids and URLs', () => {
    expect(normalizeGeminiProjectId('3bfcda98acf4')).toBe('3bfcda98acf4');
    expect(normalizeGeminiProjectId('https://gemini.google.com/gem/3bfcda98acf4')).toBe('3bfcda98acf4');
    expect(normalizeGeminiProjectId('https://gemini.google.com/gems/edit/3bfcda98acf4')).toBe('3bfcda98acf4');
    expect(extractGeminiProjectIdFromUrl('https://gemini.google.com/gem/3bfcda98acf4')).toBe('3bfcda98acf4');
    expect(extractGeminiProjectIdFromUrl('https://gemini.google.com/gems/edit/3bfcda98acf4')).toBe('3bfcda98acf4');
  });

  test('normalizes Gemini conversation ids from raw ids and app URLs', () => {
    expect(normalizeGeminiConversationId('ab30a4a92e4b65a9')).toBe('ab30a4a92e4b65a9');
    expect(normalizeGeminiConversationId('https://gemini.google.com/app/ab30a4a92e4b65a9')).toBe('ab30a4a92e4b65a9');
  });

  test('resolves Gemini project and conversation URLs', () => {
    expect(resolveGeminiProjectUrl('3bfcda98acf4')).toBe('https://gemini.google.com/gem/3bfcda98acf4');
    expect(resolveGeminiCreateProjectUrl()).toBe('https://gemini.google.com/gems/create');
    expect(resolveGeminiEditProjectUrl('3bfcda98acf4')).toBe('https://gemini.google.com/gems/edit/3bfcda98acf4');
    expect(resolveGeminiConversationUrl('ab30a4a92e4b65a9')).toBe('https://gemini.google.com/app/ab30a4a92e4b65a9');
  });

  test('resolves Gemini Gem manager row menu labels', () => {
    expect(resolveGeminiProjectMenuAriaLabel('Oracle')).toBe('More options for "Oracle" Gem');
  });

  test('ignores non-Gemini configured URLs for Gemini browser surfaces', () => {
    expect(resolveGeminiConfiguredUrl('https://chatgpt.com/')).toBe('https://gemini.google.com/app');
    expect(resolveGeminiConfiguredUrl('https://gemini.google.com/gem/3bfcda98acf4')).toBe('https://gemini.google.com/gem/3bfcda98acf4');
  });

  test('matches Gemini tab URLs by exact route preference', () => {
    expect(geminiUrlMatchesPreference(
      'https://gemini.google.com/app/17ecd216fc87eacf',
      'https://gemini.google.com/app/17ecd216fc87eacf',
    )).toBe(true);
    expect(geminiUrlMatchesPreference(
      'https://gemini.google.com/app/17ecd216fc87eacf',
      'https://gemini.google.com/app/f626d2f5da22efee',
    )).toBe(false);
    expect(geminiUrlMatchesPreference(
      'https://gemini.google.com/app',
      'https://gemini.google.com/app/',
    )).toBe(true);
  });

  test('prefers exact Gemini tab matches instead of the first same-origin candidate', () => {
    const first = { url: 'https://gemini.google.com/app/f626d2f5da22efee' };
    const second = { url: 'https://gemini.google.com/app/17ecd216fc87eacf' };
    expect(selectPreferredGeminiTarget([first, second], 'https://gemini.google.com/app/17ecd216fc87eacf')).toBe(second);
    expect(selectPreferredGeminiTarget([first, second], 'https://gemini.google.com/app')).toBeUndefined();
  });

  test('does not reuse a resolved Gemini tab target for the wrong conversation route', () => {
    expect(canReuseGeminiResolvedTabTarget(
      'https://gemini.google.com/app/06ebd4699b387019',
      'https://gemini.google.com/app/ab30a4a92e4b65a9',
    )).toBe(false);
    expect(canReuseGeminiResolvedTabTarget(
      'https://gemini.google.com/app/ab30a4a92e4b65a9',
      'https://gemini.google.com/app/ab30a4a92e4b65a9',
    )).toBe(true);
    expect(canReuseGeminiResolvedTabTarget(
      undefined,
      'https://gemini.google.com/app/ab30a4a92e4b65a9',
    )).toBe(true);
  });

  test('classifies Google unusual-traffic interstitials explicitly', () => {
    expect(classifyGeminiBlockingState({
      href: 'https://www.google.com/sorry/index?continue=https://gemini.google.com/app',
      title: 'https://gemini.google.com/app',
      bodyText: "About this page Our systems have detected unusual traffic from your computer network. This page checks to see if it's really you sending the requests, and not a robot.",
    })).toContain('unusual-traffic interstitial');
    expect(classifyGeminiBlockingState({
      href: 'https://gemini.google.com/app',
      title: 'Gemini',
      bodyText: 'Normal Gemini content',
    })).toBeNull();
  });

  test('extracts the newest Gemini assistant text while ignoring prompt echo and baseline content', () => {
    expect(selectNewestGeminiAssistantText(
      ['Older answer'],
      ['Older answer', 'Describe the uploaded image in one short sentence.', 'The image shows a yellow flower.'],
      'Describe the uploaded image in one short sentence.',
    )).toBe('The image shows a yellow flower.');
  });

  test('strips Gemini response chrome from extracted assistant text', () => {
    expect(selectNewestGeminiAssistantText(
      [],
      ['Show thinking Gemini said ACK smoke-1775434174360'],
      'Disposable CRUD smoke smoke-1775434174360: reply with exactly ACK smoke-1775434174360',
    )).toBe('ACK smoke-1775434174360');
  });

  test('infers Gemini generated media type from assistant media controls', () => {
    expect(inferGeminiGeneratedArtifactMediaType({
      kind: 'generated',
      uri: 'https://contribution.usercontent.google.com/download?filename=before_the_tide_returns.mp4',
      metadata: {
        shareLabel: 'Share track',
        downloadLabel: 'Download track',
      },
    })).toBe('music');
    expect(inferGeminiGeneratedArtifactMediaType({
      kind: 'generated',
      uri: 'https://contribution.usercontent.google.com/download?filename=video.mp4',
      metadata: {
        shareLabel: 'Share video',
        downloadLabel: 'Download video',
      },
    })).toBe('video');
    expect(inferGeminiGeneratedArtifactMediaType({
      kind: 'generated',
      uri: 'https://contribution.usercontent.google.com/download?filename=spy_theme.mp3',
      metadata: {
        downloadLabel: 'Download as MP3',
      },
    })).toBe('music');
    expect(inferGeminiGeneratedArtifactMediaType({
      kind: 'generated',
      uri: 'https://contribution.usercontent.google.com/download?filename=video.mp4',
      metadata: {
        downloadLabel: 'Download',
        downloadOptions: ['Download as video with album art', 'Download as MP3'],
      },
    })).toBe('music');
    expect(inferGeminiGeneratedArtifactMediaType({
      kind: 'generated',
      uri: 'https://contribution.usercontent.google.com/download?filename=pavement_espionage.mp4',
      metadata: {
        downloadLabel: 'Download track',
        downloadOptions: ['VideoAudio with cover art', 'Audio onlyMP3 track'],
      },
    })).toBe('music');
    expect(inferGeminiGeneratedArtifactMediaType({
      kind: 'generated',
      uri: 'https://contribution.usercontent.google.com/download?filename=pavement_espionage.mp4',
      metadata: {
        downloadLabel: 'Download track',
        downloadOptions: ['VideoAudio with cover artAudio onlyMP3 track'],
      },
    })).toBe('music');
  });

  test('normalizes Gemini generated media artifacts into stable titles and metadata', () => {
    expect(normalizeGeminiConversationArtifacts([
      {
        id: 'artifact-1',
        title: 'Generated media 1',
        kind: 'generated',
        uri: 'https://contribution.usercontent.google.com/download?filename=before_the_tide_returns.mp4',
        metadata: {
          shareLabel: 'Share track',
          downloadLabel: 'Download track',
          downloadOptions: ['VideoAudio with cover art', 'Audio onlyMP3 track'],
        },
      },
      {
        id: 'artifact-2',
        title: 'Generated media 2',
        kind: 'generated',
        uri: 'https://contribution.usercontent.google.com/download?filename=video.mp4',
        metadata: {
          shareLabel: 'Share video',
          downloadLabel: 'Download video',
        },
      },
    ])).toEqual([
      {
        id: 'artifact-1',
        title: 'Before The Tide Returns',
        kind: 'generated',
        uri: 'https://contribution.usercontent.google.com/download?filename=before_the_tide_returns.mp4',
        metadata: {
          shareLabel: 'Share track',
          downloadLabel: 'Download track',
          downloadOptions: ['VideoAudio with cover art', 'Audio onlyMP3 track'],
          mediaType: 'music',
          fileName: 'before_the_tide_returns.mp4',
        },
      },
      {
        id: 'artifact-2',
        title: 'Generated video 2',
        kind: 'generated',
        uri: 'https://contribution.usercontent.google.com/download?filename=video.mp4',
        metadata: {
          shareLabel: 'Share video',
          downloadLabel: 'Download video',
          mediaType: 'video',
          fileName: 'video.mp4',
        },
      },
    ]);
  });

  test('normalizes Gemini deep research document artifacts to the document title', () => {
    expect(normalizeGeminiConversationArtifacts([
      {
        id: 'artifact-document-1',
        title: 'Researching FreshRoof Soy Technology Claims',
        kind: 'document',
        uri: 'gemini://document/06ebd4699b387019',
        metadata: {
          documentTitle: 'Advanced Biomolecular Rejuvenation of Asphalt Roofing Systems: An Exhaustive Analysis of Fresh Roof and GreenSoy Technology',
          taskTitle: 'Researching FreshRoof Soy Technology Claims',
          documentType: 'deep-research',
        },
      },
    ])).toEqual([
      {
        id: 'artifact-document-1',
        title: 'Advanced Biomolecular Rejuvenation of Asphalt Roofing Systems: An Exhaustive Analysis of Fresh Roof and GreenSoy Technology',
        kind: 'document',
        uri: 'gemini://document/06ebd4699b387019',
        metadata: {
          documentTitle: 'Advanced Biomolecular Rejuvenation of Asphalt Roofing Systems: An Exhaustive Analysis of Fresh Roof and GreenSoy Technology',
          taskTitle: 'Researching FreshRoof Soy Technology Claims',
          documentType: 'deep-research',
        },
      },
    ]);
  });

  test('deduplicates Gemini conversation files that resolve to the same upload chip semantics', () => {
    expect(normalizeGeminiConversationFiles([
      {
        id: 'gemini-conversation-file:ab30a4a92e4b65a9:0:AGENTS.md',
        name: 'AGENTS.md',
        provider: 'gemini',
        source: 'conversation',
        mimeType: 'text/markdown',
        metadata: {
          messageIndex: 2,
          kind: 'uploaded-file',
          hasDirectUrl: false,
        },
      },
      {
        id: 'gemini-conversation-file:ab30a4a92e4b65a9:1:AGENTS.md',
        name: 'AGENTS.md',
        provider: 'gemini',
        source: 'conversation',
        mimeType: 'text/markdown',
        metadata: {
          messageIndex: 2,
          kind: 'uploaded-file',
          hasDirectUrl: false,
        },
      },
      {
        id: 'gemini-conversation-file:ab30a4a92e4b65a9:0:uploaded-image-1',
        name: 'uploaded-image-1',
        provider: 'gemini',
        source: 'conversation',
        remoteUrl: 'https://lh3.googleusercontent.com/example',
        metadata: {
          messageIndex: 0,
          kind: 'uploaded-image',
          hasDirectUrl: true,
        },
      },
      {
        id: 'gemini-conversation-file:ab30a4a92e4b65a9:1:uploaded-image-1',
        name: 'uploaded-image-1',
        provider: 'gemini',
        source: 'conversation',
        remoteUrl: 'https://lh3.googleusercontent.com/example',
        metadata: {
          messageIndex: 0,
          kind: 'uploaded-image',
          hasDirectUrl: true,
        },
      },
    ])).toEqual([
      {
        id: 'gemini-conversation-file:ab30a4a92e4b65a9:0:AGENTS.md',
        name: 'AGENTS.md',
        provider: 'gemini',
        source: 'conversation',
        mimeType: 'text/markdown',
        metadata: {
          messageIndex: 2,
          kind: 'uploaded-file',
          hasDirectUrl: false,
        },
      },
      {
        id: 'gemini-conversation-file:ab30a4a92e4b65a9:0:uploaded-image-1',
        name: 'uploaded-image-1',
        provider: 'gemini',
        source: 'conversation',
        remoteUrl: 'https://lh3.googleusercontent.com/example',
        metadata: {
          messageIndex: 0,
          kind: 'uploaded-image',
          hasDirectUrl: true,
        },
      },
    ]);
  });

  test('treats collapsed Gemini root app state as a ready conversation surface', () => {
    const expression = geminiConversationSurfaceReadyExpression();
    expect(expression).toContain('button[aria-label="Main menu"]');
    expect(expression).toContain('conversation with gemini');
    expect(expression).toContain('what can we get done');
  });

  test('tags Gemini generated-image download buttons by artifact uri before ordinal fallback', () => {
    const expression = geminiGeneratedImageDownloadButtonTagExpression({
      id: 'gemini-artifact:514daf6556ba1dd5:1:0',
      uri: 'https://lh3.googleusercontent.com/generated-image',
      messageIndex: 1,
    });
    expect(expression).toContain('button[data-test-id="download-generated-image-button"]');
    expect(expression).toContain('https://lh3.googleusercontent.com/generated-image');
    expect(expression).toContain("strategy: 'uri-match'");
    expect(expression).toContain("strategy: 'ordinal-fallback'");
  });

  test('exposes direct conversation rename support on the Gemini provider surface', () => {
    const adapter = createGeminiAdapter();
    expect(typeof adapter.renameConversation).toBe('function');
    expect(typeof adapter.deleteConversation).toBe('function');
    expect(typeof adapter.readConversationContext).toBe('function');
    expect(typeof adapter.downloadConversationFile).toBe('function');
    expect(typeof adapter.materializeConversationArtifact).toBe('function');
    expect(typeof adapter.getFeatureSignature).toBe('function');
  });

  test('normalizes Gemini feature signatures from drawer choices and toggles', () => {
    expect(JSON.parse(normalizeGeminiFeatureSignature({
      detector: 'gemini-feature-probe-v1',
      deep_research: true,
      personal_intelligence: true,
      active_mode: ' Fast ',
      modes: ['Create video', 'Canvas', 'Create music', 'Deep research', 'Create video'],
      toggles: {
        'Personal intelligence': true,
      },
    }) ?? 'null')).toEqual({
      detector: 'gemini-feature-probe-v1',
      deep_research: true,
      personal_intelligence: true,
      active_mode: 'fast',
      modes: ['canvas', 'create music', 'create video', 'deep research'],
      toggles: {
        'personal intelligence': true,
      },
    });
  });

  test('derives Gemini feature probe evidence from browser-tools uiList output', () => {
    expect(deriveGeminiFeatureProbeFromUiList({
      url: 'https://gemini.google.com/app',
      title: 'Gemini',
      totalScanned: 42,
      summary: {
        buttons: 1,
        menuItems: 2,
        switches: 1,
        inputs: 1,
        links: 0,
        dialogs: 0,
        menus: 1,
        fileInputs: 0,
        uploadCandidates: 0,
      },
      sections: {
        buttons: [],
        menuItems: [
          {
            tag: 'button',
            role: 'menuitemcheckbox',
            text: 'Canvas',
            ariaLabel: null,
            title: null,
            dataTestId: null,
            className: 'toolbox-drawer-item-list-button',
            href: null,
            checked: false,
            expanded: null,
            disabled: false,
            visible: true,
            inputType: null,
            widgetType: 'menu-item',
            pathHint: null,
            interactionHints: ['hard-click-preferred'],
          },
          {
            tag: 'button',
            role: 'menuitemcheckbox',
            text: 'Deep research',
            ariaLabel: null,
            title: null,
            dataTestId: null,
            className: 'toolbox-drawer-item-list-button',
            href: null,
            checked: false,
            expanded: null,
            disabled: false,
            visible: true,
            inputType: null,
            widgetType: 'menu-item',
            pathHint: null,
            interactionHints: ['hard-click-preferred'],
          },
        ],
        switches: [
          {
            tag: 'button',
            role: 'switch',
            text: null,
            ariaLabel: 'Personal Intelligence',
            title: null,
            dataTestId: null,
            className: 'mdc-switch mdc-switch--checked',
            href: null,
            checked: true,
            expanded: null,
            disabled: false,
            visible: true,
            inputType: null,
            widgetType: 'switch',
            pathHint: null,
            interactionHints: ['pointer-gesture-preferred'],
          },
        ],
        inputs: [],
        links: [],
        dialogs: [],
        menus: [],
        fileInputs: [],
        uploadCandidates: [],
      },
    }) ?? null).toEqual({
      detector: 'gemini-feature-probe-v1',
      deep_research: true,
      personal_intelligence: true,
      modes: ['canvas', 'deep research'],
      toggles: {
        'personal intelligence': true,
      },
      active_mode: null,
    });
  });

  test('merges Gemini provider and browser-tools feature probes', () => {
    expect(mergeGeminiFeatureProbes(
      {
        detector: 'gemini-feature-probe-v1',
        search: true,
        modes: ['create image'],
      },
      {
        detector: 'gemini-feature-probe-v1',
        deep_research: true,
        personal_intelligence: true,
        modes: ['canvas', 'deep research'],
        toggles: {
          'personal intelligence': true,
        },
      },
    )).toEqual({
      detector: 'gemini-feature-probe-v1',
      search: true,
      grounding: undefined,
      deep_research: true,
      personal_intelligence: true,
      modes: ['canvas', 'create image', 'deep research'],
      toggles: {
        'personal intelligence': true,
      },
      active_mode: null,
    });
  });

  test('does not treat arbitrary Gemini project names as normalized ids', () => {
    expect(normalizeGeminiProjectId('AuraCall Gemini Cache Smoke 1775435764170')).toBeNull();
    expect(normalizeGeminiProjectId('84a7f7d4768c')).toBe('84a7f7d4768c');
    expect(normalizeGeminiProjectId('https://gemini.google.com/gems/edit/84a7f7d4768c')).toBe('84a7f7d4768c');
  });
});
