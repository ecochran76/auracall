import { describe, expect, test, vi } from 'vitest';
import {
  buildGrokFeatureProbeExpression,
  choosePreferredGrokConversation,
  ensureGrokTabVisible,
  extractGrokAccountFileIdFromUrl,
  mapGrokConversationFileProbes,
  extractGrokProjectIdFromUrl,
  extractGrokIdentityFromSerializedScripts,
  findGrokProjectByName,
  grokUrlMatchesPreference,
  grokConversationTitleQuality,
  isGrokMainSidebarOpenProbe,
  normalizeGrokFeatureSignature,
  parseGrokPersonalFilesRowTexts,
  parseGrokWorkspaceCreateError,
  resolveGrokConversationUrl,
  resolveGrokProjectConversationsUrl,
  resolveGrokProjectSourcesUrl,
  resolveGrokProjectUrl,
} from '../../src/browser/providers/grokAdapter.js';
import type { ChromeClient } from '../../src/browser/types.js';

describe('extractGrokIdentityFromSerializedScripts', () => {
  test('parses Grok user identity from Next flight data', () => {
    const scriptText =
      'self.__next_f.push([1,"3b:[\\"$\\",\\"$L45\\",null,{\\"initialData\\":{\\"user\\":{\\"sessionId\\":\\"35c7ff0f-d69a-460c-b160-1197fdeaa47f\\",\\"userId\\":\\"c4d43034-7f30-462b-918b-59779bcba208\\",\\"email\\":\\"ez86944@gmail.com\\",\\"familyName\\":\\"C\\",\\"givenName\\":\\"Eric\\",\\"xUsername\\":\\"SwantonDoug\\"}}}"])';

    expect(extractGrokIdentityFromSerializedScripts([scriptText])).toEqual({
      id: 'c4d43034-7f30-462b-918b-59779bcba208',
      name: 'Eric C',
      email: 'ez86944@gmail.com',
      handle: '@SwantonDoug',
      source: 'next-flight',
    });
  });
});

describe('extractGrokProjectIdFromUrl', () => {
  test('returns the project id for concrete project URLs', () => {
    expect(extractGrokProjectIdFromUrl('https://grok.com/project/abc123?tab=conversations')).toBe('abc123');
  });

  test('does not treat the project index as a concrete project', () => {
    expect(extractGrokProjectIdFromUrl('https://grok.com/project')).toBeNull();
  });
});

describe('grok route helpers', () => {
  test('builds project and sources URLs from manifest-backed templates', () => {
    expect(resolveGrokProjectUrl('abc123')).toBe('https://grok.com/project/abc123');
    expect(resolveGrokProjectConversationsUrl('abc123')).toBe('https://grok.com/project/abc123?tab=conversations');
    expect(resolveGrokProjectSourcesUrl('abc123')).toBe('https://grok.com/project/abc123?tab=sources');
  });

  test('builds root and project conversation URLs from manifest-backed templates', () => {
    expect(resolveGrokConversationUrl('conv-1')).toBe('https://grok.com/c/conv-1');
    expect(resolveGrokConversationUrl('conv-1', 'proj-1')).toBe('https://grok.com/project/proj-1?chat=conv-1');
  });
});

describe('normalizeGrokFeatureSignature', () => {
  test('builds a syntactically valid Imagine feature probe expression', () => {
    expect(() => new Function(`return ${buildGrokFeatureProbeExpression()};`)).not.toThrow();
  });

  test('does not classify a passive SuperGrok upsell as an Imagine account gate', () => {
    const probe = evaluateGrokFeatureProbeWithFakeDom({
      bodyText: 'Discover kittens Think Harder Image Video Speed Quality 2:3 Upgrade to SuperGrok',
      controls: [
        fakeElement('button', { text: 'Image', width: 80, height: 32 }),
        fakeElement('button', { text: 'Video', width: 80, height: 32 }),
        fakeElement('button', { ariaLabel: 'Submit', width: 40, height: 40 }),
        fakeElement('button', { text: 'Upgrade to SuperGrok', width: 160, height: 40 }),
      ],
      composerInputs: [
        fakeElement('div', { text: 'Type to imagine', placeholder: 'Type to imagine', width: 400, height: 48 }),
      ],
      images: [
        fakeImage({
          src: `data:image/jpeg;base64,${Buffer.from('preview image bytes').toString('base64')}`,
          alt: 'Generated image',
          width: 277,
          height: 413,
        }),
      ],
    });

    expect(probe.imagine.account_gated).toBe(false);
    expect(probe.imagine.run_state).toBe('terminal_image');
    expect(probe.imagine.terminal_image).toBe(true);
  });

  test('keeps contextual Imagine generation gates when no ready composer or media is visible', () => {
    const probe = evaluateGrokFeatureProbeWithFakeDom({
      bodyText: 'Image generation limit reached. Upgrade to generate more images.',
      controls: [
        fakeElement('button', { text: 'Upgrade to SuperGrok', width: 160, height: 40 }),
      ],
      composerInputs: [],
      images: [],
    });

    expect(probe.imagine.account_gated).toBe(true);
    expect(probe.imagine.run_state).toBe('account_gated');
    expect(probe.imagine.terminal_image).toBe(false);
  });

  test('normalizes Imagine browser discovery evidence into a stable signature', () => {
    const signature = normalizeGrokFeatureSignature({
      detector: 'ignored',
      imagine: {
        visible: true,
        account_gated: false,
        blocked: false,
        run_state: 'terminal_image',
        terminal_image: true,
        modes: ['Image', 'image-to-video', 'Image'],
        labels: [' Imagine ', 'Create with Imagine', 'Imagine'],
        routes: ['https://grok.com/imagine', 'https://grok.com/imagine'],
        controls: [
          {
            tag: 'button',
            text: 'Video',
            role: 'radio',
            checked: 'true',
            visible: true,
          },
        ],
        discovery_action: {
          action: 'grok-imagine-video-mode',
          status: 'observed_video_mode',
          clicked: true,
          beforeMode: 'Image',
          afterMode: 'Video',
          observedAt: '2026-04-24T12:00:00.000Z',
          controlsBefore: [{ text: 'Image', checked: 'true' }],
          controlsAfter: [{ text: 'Video', checked: 'true' }],
          videoModeAudit: {
            mode: 'Video',
            href: 'https://grok.com/imagine',
            title: 'Imagine - Grok',
            composer: [{ tag: 'div', contenteditable: 'true', placeholder: 'Type to imagine' }],
            submitControls: [{ tag: 'button', ariaLabel: 'Submit', disabled: true }],
            uploadControls: [{ tag: 'button', ariaLabel: 'Upload' }],
            aspectControls: [{ tag: 'button', ariaLabel: 'Aspect Ratio', text: '2:3' }],
            modeControls: [{ text: 'Video', checked: 'true' }],
            filmstrip: [{ tag: 'button', selected: true, imageSrc: 'https://assets.grok.com/users/u/generated/a/image.jpg' }],
            downloadControls: [{ tag: 'button', ariaLabel: 'Download' }],
            visibleMedia: [{ tag: 'img', src: 'https://assets.grok.com/users/u/generated/a/image.jpg', generated: true, selected: true }],
            generatedMediaSelectorCount: 1,
            selectedGeneratedMediaCount: 1,
            observedAt: '2026-04-24T12:00:01.000Z',
          },
        },
        materialization_controls: [
          {
            tag: 'button',
            ariaLabel: 'Download',
            visible: true,
          },
        ],
        media: {
          images: [
            {
              kind: 'image',
              src: 'blob:https://grok.com/image-1',
              srcKind: 'blob-url',
              width: 512,
              height: 512,
            },
          ],
          visible_tiles: [
            {
              kind: 'image',
              src: `data:image/jpeg;base64,${'a'.repeat(220)}`,
              selected: true,
              tileSurface: 'masonry',
              generated: true,
              width: 512,
              height: 512,
            },
          ],
          urls: ['blob:https://grok.com/image-1', 'blob:https://grok.com/image-1'],
        },
        href: 'https://grok.com/imagine',
        title: 'Grok',
      },
    });

    expect(JSON.parse(signature ?? 'null')).toEqual({
      detector: 'grok-feature-probe-v1',
      imagine: {
        visible: true,
        account_gated: false,
        blocked: false,
        moderation_blocked: false,
        rate_limited: false,
        run_state: 'terminal_image',
        pending: false,
        terminal_image: true,
        terminal_video: false,
        modes: ['image', 'image-to-video'],
        labels: ['Create with Imagine', 'Imagine'],
        routes: ['https://grok.com/imagine'],
        href: 'https://grok.com/imagine',
        title: 'Grok',
        controls: [
          {
            tag: 'button',
            text: 'Video',
            role: 'radio',
            checked: 'true',
            visible: true,
          },
        ],
        discovery_action: {
          action: 'grok-imagine-video-mode',
          status: 'observed_video_mode',
          clicked: true,
          beforeMode: 'Image',
          afterMode: 'Video',
          observedAt: '2026-04-24T12:00:00.000Z',
          controlsBefore: [{ text: 'Image', checked: 'true' }],
          controlsAfter: [{ text: 'Video', checked: 'true' }],
          videoModeAudit: {
            mode: 'Video',
            href: 'https://grok.com/imagine',
            title: 'Imagine - Grok',
            composer: [{ tag: 'div', contenteditable: 'true', placeholder: 'Type to imagine' }],
            submitControls: [{ tag: 'button', ariaLabel: 'Submit', disabled: true }],
            uploadControls: [{ tag: 'button', ariaLabel: 'Upload' }],
            aspectControls: [{ tag: 'button', ariaLabel: 'Aspect Ratio', text: '2:3' }],
            modeControls: [{ text: 'Video', checked: 'true' }],
            filmstrip: [
              {
                tag: 'button',
                selected: true,
                imageSrc: 'https://assets.grok.com/users/u/generated/a/image.jpg',
              },
            ],
            downloadControls: [{ tag: 'button', ariaLabel: 'Download' }],
            visibleMedia: [
              {
                tag: 'img',
                src: 'https://assets.grok.com/users/u/generated/a/image.jpg',
                srcKind: 'remote-url',
                generated: true,
                selected: true,
              },
            ],
            generatedMediaSelectorCount: 1,
            selectedGeneratedMediaCount: 1,
            observedAt: '2026-04-24T12:00:01.000Z',
          },
        },
        materialization_controls: [
          {
            tag: 'button',
            ariaLabel: 'Download',
            visible: true,
          },
        ],
        media: {
          images: [
            {
              kind: 'image',
              src: 'blob:https://grok.com/image-1',
              srcKind: 'blob-url',
              width: 512,
              height: 512,
            },
          ],
          videos: [],
          visible_tiles: [
            {
              kind: 'image',
              src: 'data:image/jpeg;base64,<omitted 243 chars>',
              srcBytesApprox: 165,
              srcKind: 'data-url',
              selected: true,
              tileSurface: 'masonry',
              generated: true,
              width: 512,
              height: 512,
            },
          ],
          urls: ['blob:https://grok.com/image-1'],
        },
      },
    });
  });

  test('returns null when no Imagine signal is present', () => {
    expect(normalizeGrokFeatureSignature({ detector: 'grok-feature-probe-v1', imagine: {} })).toBeNull();
  });
});

type FakeDomInput = {
  bodyText: string;
  controls: FakeElement[];
  composerInputs: FakeElement[];
  images: FakeElement[];
};

class FakeElement {
  tagName: string;
  textContent: string;
  currentSrc: string;
  src: string;
  disabled: boolean;
  private attrs: Map<string, string>;
  private width: number;
  private height: number;

  constructor(tagName: string, options: {
    text?: string;
    ariaLabel?: string;
    title?: string;
    href?: string;
    placeholder?: string;
    src?: string;
    alt?: string;
    width?: number;
    height?: number;
    disabled?: boolean;
  } = {}) {
    this.tagName = tagName.toUpperCase();
    this.textContent = options.text ?? '';
    this.currentSrc = options.src ?? '';
    this.src = options.src ?? '';
    this.disabled = options.disabled ?? false;
    this.width = options.width ?? 1;
    this.height = options.height ?? 1;
    this.attrs = new Map();
    if (options.ariaLabel) this.attrs.set('aria-label', options.ariaLabel);
    if (options.title) this.attrs.set('title', options.title);
    if (options.href) this.attrs.set('href', options.href);
    if (options.placeholder) this.attrs.set('placeholder', options.placeholder);
    if (options.alt) this.attrs.set('alt', options.alt);
  }

  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null;
  }

  getBoundingClientRect(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  closest(): null {
    return null;
  }

  matches(): boolean {
    return false;
  }
}

function fakeElement(tagName: string, options?: ConstructorParameters<typeof FakeElement>[1]): FakeElement {
  return new FakeElement(tagName, options);
}

function fakeImage(options: ConstructorParameters<typeof FakeElement>[1]): FakeElement {
  return new FakeElement('img', options);
}

function evaluateGrokFeatureProbeWithFakeDom(input: FakeDomInput): { imagine: Record<string, unknown> } {
  const previous = {
    document: globalThis.document,
    window: globalThis.window,
    location: globalThis.location,
    HTMLElement: globalThis.HTMLElement,
    SVGElement: globalThis.SVGElement,
    HTMLImageElement: globalThis.HTMLImageElement,
  };
  const querySelectorAll = vi.fn((selector: string) => {
    if (selector.includes('textarea') || selector.includes('[contenteditable="true"]')) {
      return input.composerInputs;
    }
    if (selector.includes('[aria-busy') || selector.includes('progressbar')) {
      return [];
    }
    if (selector.includes('video')) {
      return [];
    }
    if (selector.includes('img')) {
      return input.images;
    }
    return input.controls;
  });
  try {
    Object.assign(globalThis, {
      HTMLElement: FakeElement,
      SVGElement: FakeElement,
      HTMLImageElement: FakeElement,
      window: {
        getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }),
      },
      document: {
        body: { innerText: input.bodyText },
        querySelectorAll,
      },
      location: {
        href: 'https://grok.com/imagine',
      },
    });
    return new Function(`return ${buildGrokFeatureProbeExpression()};`)() as { imagine: Record<string, unknown> };
  } finally {
    Object.assign(globalThis, previous);
  }
}

describe('findGrokProjectByName', () => {
  test('finds the created project by normalized exact name', () => {
    expect(
      findGrokProjectByName(
        [
          { id: 'alpha', name: 'Oracle', url: 'https://grok.com/project/alpha?tab=conversations' },
          { id: 'beta', name: '  AuraCall   Cedar Atlas bfxirt  ', url: 'https://grok.com/project/beta' },
        ],
        'AuraCall Cedar Atlas bfxirt',
      ),
    ).toEqual({
      id: 'beta',
      name: '  AuraCall   Cedar Atlas bfxirt  ',
      url: 'https://grok.com/project/beta',
    });
  });
});

describe('extractGrokAccountFileIdFromUrl', () => {
  test('returns the file id for Grok account file URLs', () => {
    expect(extractGrokAccountFileIdFromUrl('https://grok.com/files?file=6d5ea327-6e9c-4e3d-a290-2c7fc59b3546')).toBe(
      '6d5ea327-6e9c-4e3d-a290-2c7fc59b3546',
    );
  });

  test('returns null for non-file URLs', () => {
    expect(extractGrokAccountFileIdFromUrl('https://grok.com/files')).toBeNull();
  });
});

describe('grokUrlMatchesPreference', () => {
  test('requires an exact project index path match for /project', () => {
    expect(grokUrlMatchesPreference('https://grok.com/project', 'https://grok.com/project')).toBe(true);
    expect(grokUrlMatchesPreference('https://grok.com/project/abc123', 'https://grok.com/project')).toBe(false);
  });

  test('treats a live conversation rid URL as matching the bare conversation URL', () => {
    expect(
      grokUrlMatchesPreference(
        'https://grok.com/c/20a14419-5d0c-422d-931f-73f2f4fbce02?rid=e2f484b9-ae0c-4dcf-b900-102e1f24c9c7',
        'https://grok.com/c/20a14419-5d0c-422d-931f-73f2f4fbce02',
      ),
    ).toBe(true);
  });

  test('ignores Grok rid when matching a project chat URL', () => {
    expect(
      grokUrlMatchesPreference(
        'https://grok.com/project/4022aaed-827b-41d6-aaf8-7f9f1ad77fd3?chat=d563e2ea-05c7-4463-af28-062ab8f3b5a5&rid=65a3062d-77d6-42fb-ab78-b8021260ce0b',
        'https://grok.com/project/4022aaed-827b-41d6-aaf8-7f9f1ad77fd3?chat=d563e2ea-05c7-4463-af28-062ab8f3b5a5',
      ),
    ).toBe(true);
  });

  test('requires matching query parameters when the preferred Grok URL includes them', () => {
    expect(
      grokUrlMatchesPreference(
        'https://grok.com/project/abc123?tab=sources',
        'https://grok.com/project/abc123?tab=sources',
      ),
    ).toBe(true);
    expect(
      grokUrlMatchesPreference(
        'https://grok.com/project/abc123',
        'https://grok.com/project/abc123?tab=sources',
      ),
    ).toBe(false);
  });
});

describe('parseGrokWorkspaceCreateError', () => {
  test('extracts the backend validation message from Grok workspace create responses', () => {
    expect(
      parseGrokWorkspaceCreateError(
        '{"code":3,"message":"name: Value contains phone number. [WKE=form-invalid:contains-phone-number:name]\\n","details":[]}',
      ),
    ).toBe('name: Value contains phone number. [WKE=form-invalid:contains-phone-number:name]');
  });
});

describe('parseGrokPersonalFilesRowTexts', () => {
  test('normalizes plain file rows and parses trailing sizes', () => {
    expect(
      parseGrokPersonalFilesRowTexts([
        ' notes.txt ',
        'spec.md 47 B',
        'medium.jsonl 257 KB',
      ]),
    ).toEqual([
      { name: 'notes.txt', size: undefined },
      { name: 'spec.md', size: 47 },
      { name: 'medium.jsonl', size: 257 * 1024 },
    ]);
  });

  test('ignores empty row text', () => {
    expect(parseGrokPersonalFilesRowTexts(['', '   ', '\n'])).toEqual([]);
  });
});

describe('mapGrokConversationFileProbes', () => {
  test('maps visible conversation file chips into stable FileRef rows', () => {
    expect(
      mapGrokConversationFileProbes('conv-123', [
        {
          rowId: 'response-a',
          rowIndex: 0,
          chipIndex: 0,
          name: 'notes.txt',
          fileTypeLabel: 'Text File',
        },
        {
          rowId: 'response-a',
          rowIndex: 0,
          chipIndex: 0,
          name: 'notes.txt',
          fileTypeLabel: 'Text File',
        },
        {
          rowId: 'response-b',
          rowIndex: 2,
          chipIndex: 0,
          name: 'diagram.png',
          fileTypeLabel: 'Image File',
          remoteUrl: 'https://grok.com/files?file=abc',
        },
      ]),
    ).toEqual([
      {
        id: 'grok-conversation-file:conv-123:response-a:0:notes.txt',
        name: 'notes.txt',
        provider: 'grok',
        source: 'conversation',
        metadata: {
          conversationId: 'conv-123',
          rowId: 'response-a',
          rowIndex: 0,
          chipIndex: 0,
          fileTypeLabel: 'Text File',
        },
      },
      {
        id: 'grok-conversation-file:conv-123:response-b:0:diagram.png',
        name: 'diagram.png',
        provider: 'grok',
        source: 'conversation',
        remoteUrl: 'https://grok.com/files?file=abc',
        metadata: {
          conversationId: 'conv-123',
          rowId: 'response-b',
          rowIndex: 2,
          chipIndex: 0,
          fileTypeLabel: 'Image File',
        },
      },
    ]);
  });
});

describe('grok conversation title quality', () => {
  test('treats generic conversation labels as lower quality than specific titles', () => {
    expect(grokConversationTitleQuality('Chat', 'abc123')).toBeLessThan(
      grokConversationTitleQuality('AuraCall Maple Ledger', 'abc123'),
    );
  });
});

describe('choosePreferredGrokConversation', () => {
  test('prefers a specific history title over a generic raw title for the same id', () => {
    expect(
      choosePreferredGrokConversation(
        {
          id: 'abc123',
          title: 'Chat',
          provider: 'grok',
        },
        {
          id: 'abc123',
          title: 'AuraCall Maple Ledger',
          provider: 'grok',
          updatedAt: '2026-03-27T12:00:00.000Z',
        },
      ),
    ).toMatchObject({
      id: 'abc123',
      title: 'AuraCall Maple Ledger',
    });
  });
});

describe('isGrokMainSidebarOpenProbe', () => {
  test('treats data-state=open as open', () => {
    expect(
      isGrokMainSidebarOpenProbe({
        triggerDataState: 'open',
        sidebarWidth: 56,
        sidebarRight: 56,
      }),
    ).toBe(true);
  });

  test('treats data-state=closed with narrow sidebar as closed', () => {
    expect(
      isGrokMainSidebarOpenProbe({
        triggerDataState: 'closed',
        triggerIconRotated: false,
        sidebarWidth: 56,
        sidebarRight: 56,
      }),
    ).toBe(false);
  });
});

describe('ensureGrokTabVisible', () => {
  test('brings the Grok tab to front before interactive flows', async () => {
    const bringToFront = vi.fn().mockResolvedValue(undefined);
    const evaluate = vi
      .fn()
      .mockResolvedValueOnce({
        result: {
          value: {
            visibilityState: 'visible',
            hasFocus: true,
            href: 'https://grok.com/',
            title: 'Grok',
          },
        },
      });
    const client = {
      Page: { bringToFront },
      Runtime: { evaluate },
    } as unknown as ChromeClient;

    await expect(ensureGrokTabVisible(client)).resolves.toBeUndefined();
    expect(bringToFront).toHaveBeenCalledTimes(1);
    expect(evaluate).toHaveBeenCalledTimes(1);
  });

  test('does not raise the Grok tab when focus suppression is enabled on the client', async () => {
    const bringToFront = vi.fn().mockResolvedValue(undefined);
    const evaluate = vi.fn();
    const client = {
      Page: { bringToFront },
      Runtime: { evaluate },
      __auracallSuppressFocus: true,
    } as unknown as ChromeClient;

    await expect(ensureGrokTabVisible(client)).resolves.toBeUndefined();
    expect(bringToFront).not.toHaveBeenCalled();
    expect(evaluate).not.toHaveBeenCalled();
  });
});
