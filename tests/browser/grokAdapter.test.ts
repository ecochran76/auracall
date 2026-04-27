import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, test, vi } from 'vitest';

const grokRunPromptMocks = vi.hoisted(() => ({
  cdpList: vi.fn(),
  cdpClose: vi.fn(),
  connectToChromeTarget: vi.fn(),
  openOrReuseChromeTarget: vi.fn(),
}));

vi.mock('chrome-remote-interface', () => ({
  default: {
    List: grokRunPromptMocks.cdpList,
    Close: grokRunPromptMocks.cdpClose,
  },
}));

vi.mock('../../packages/browser-service/src/chromeLifecycle.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../packages/browser-service/src/chromeLifecycle.js')>();
  return {
    ...actual,
    connectToChromeTarget: grokRunPromptMocks.connectToChromeTarget,
    openOrReuseChromeTarget: grokRunPromptMocks.openOrReuseChromeTarget,
  };
});

import {
  buildGrokFeatureProbeExpression,
  checkGrokBrowserAuthPreflight,
  choosePreferredGrokConversation,
  createGrokAdapter,
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

function createFakeAuthRuntime(values: unknown[]): ChromeClient['Runtime'] {
  const queue = [...values];
  return {
    enable: vi.fn(async () => undefined),
    evaluate: vi.fn(async () => ({
      result: {
        value: queue.shift() ?? null,
      },
    })),
  } as unknown as ChromeClient['Runtime'];
}

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

describe('checkGrokBrowserAuthPreflight', () => {
  test('fails on Google account password challenge before Grok automation', async () => {
    const Runtime = createFakeAuthRuntime([
      {
        href: 'https://accounts.google.com/v3/signin/challenge/pwd',
        title: 'Welcome',
        bodyText: 'Welcome ecochran76@gmail.com Too many failed attempts Enter your password',
        guestAuthCta: false,
      },
    ]);

    await expect(checkGrokBrowserAuthPreflight(Runtime)).resolves.toMatchObject({
      ok: false,
      reason: 'google_account_too_many_failed_attempts',
      href: 'https://accounts.google.com/v3/signin/challenge/pwd',
      actualIdentity: null,
    });
  });

  test('fails when configured Grok identity differs from detected identity', async () => {
    const Runtime = createFakeAuthRuntime([
      {
        href: 'https://grok.com/imagine',
        title: 'Imagine - Grok',
        bodyText: 'Type to imagine',
        guestAuthCta: false,
      },
      {
        id: null,
        name: 'Other User',
        handle: '@other',
        email: 'other@example.com',
        source: 'next-data',
        guestAuthCta: false,
      },
    ]);

    await expect(checkGrokBrowserAuthPreflight(Runtime, {
      expectedUserIdentity: {
        email: 'operator@example.com',
        source: 'profile',
      },
      expectedServiceAccountId: 'service-account:grok:operator@example.com',
    })).resolves.toMatchObject({
      ok: false,
      reason: 'grok_account_mismatch',
      expectedServiceAccountId: 'service-account:grok:operator@example.com',
      actualIdentity: {
        email: 'other@example.com',
      },
    });
  });

  test('fails when no expected Grok identity is configured', async () => {
    const Runtime = createFakeAuthRuntime([
      {
        href: 'https://grok.com/imagine',
        title: 'Imagine - Grok',
        bodyText: 'Type to imagine',
        guestAuthCta: false,
      },
      {
        id: 'c4d43034-7f30-462b-918b-59779bcba208',
        name: 'Eric C',
        handle: '@SwantonDoug',
        email: 'ez86944@gmail.com',
        source: 'next-data',
        guestAuthCta: false,
      },
    ]);

    await expect(checkGrokBrowserAuthPreflight(Runtime)).resolves.toMatchObject({
      ok: false,
      reason: 'grok_expected_identity_missing',
      expectedIdentity: null,
      expectedServiceAccountId: null,
      actualIdentity: {
        email: 'ez86944@gmail.com',
      },
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

describe('Grok Imagine runPrompt mode selection', () => {
  test('emits verified Image mode selection before prompt insertion', async () => {
    const result = await runGrokImaginePromptModeSelectionTest({
      capabilityId: 'grok.media.imagine_image',
      expectedMode: 'Image',
      initialMode: 'Video',
    });

    expect(result.capabilitySelected).toMatchObject({
      phase: 'capability_selected',
      details: {
        capabilityId: 'grok.media.imagine_image',
        mode: 'Image',
        selected: true,
        clicked: true,
        modeControls: [
          {
            text: 'Image',
            role: 'radio',
            checked: 'true',
            disabled: false,
          },
          {
            text: 'Video',
            role: 'radio',
            checked: 'false',
            disabled: false,
          },
        ],
      },
    });
    expect(result.events.map((event) => event.phase)).toEqual([
      'browser_target_attached',
      'provider_auth_preflight',
      'capability_selected',
      'composer_ready',
      'prompt_inserted',
      'send_attempted',
      'submit_path_observed',
      'submitted_state_observed',
    ]);
  });

  test('emits verified Video mode selection before prompt insertion', async () => {
    const result = await runGrokImaginePromptModeSelectionTest({
      capabilityId: 'grok.media.imagine_video',
      expectedMode: 'Video',
      initialMode: 'Image',
    });

    expect(result.capabilitySelected).toMatchObject({
      phase: 'capability_selected',
      details: {
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
    });
    expect(result.events.findIndex((event) => event.phase === 'capability_selected')).toBeLessThan(
      result.events.findIndex((event) => event.phase === 'prompt_inserted'),
    );
  });
});

describe('Grok Imagine materialization', () => {
  test('captures visible image tiles and the provider download button artifact', async () => {
    const destDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-grok-adapter-materialize-'));
    try {
      grokRunPromptMocks.cdpList.mockReset();
      grokRunPromptMocks.cdpClose.mockReset();
      grokRunPromptMocks.connectToChromeTarget.mockReset();
      grokRunPromptMocks.openOrReuseChromeTarget.mockReset();
      grokRunPromptMocks.cdpList.mockResolvedValue([
        {
          id: 'grok-tab-1',
          type: 'page',
          url: 'https://grok.com/imagine',
        },
      ]);
      const client = createFakeGrokImagineMaterializationClient(destDir);
      grokRunPromptMocks.connectToChromeTarget.mockResolvedValue(client);

      const adapter = createGrokAdapter();
      expect(adapter.materializeActiveMediaArtifacts).toBeDefined();
      const files = await adapter.materializeActiveMediaArtifacts!(
        {
          capabilityId: 'grok.media.imagine_image',
          maxItems: 3,
          compareFullQuality: true,
        },
        destDir,
        {
          host: '127.0.0.1',
          port: 9222,
          configuredUrl: 'https://grok.com/imagine',
          expectedUserIdentity: {
            email: 'ez86944@gmail.com',
            source: 'profile',
          },
          expectedServiceAccountId: 'service-account:grok:ez86944@gmail.com',
        },
      );

      expect(files).toHaveLength(4);
      expect(files[0]).toMatchObject({
        id: 'grok_imagine_visible_1',
        name: 'grok-imagine-visible-1.jpg',
        provider: 'grok',
        mimeType: 'image/jpeg',
        metadata: {
          materialization: 'visible-tile-browser-capture',
          srcKind: 'data-url',
          captureMethod: 'data-url',
        },
      });
      expect(files[0]?.metadata?.grokMaterializationDiagnostics).toMatchObject({
        requestedMaxItems: 3,
        selectedTileCount: 3,
        materializedVisibleTileCount: 3,
        tileSelection: expect.arrayContaining([
          expect.objectContaining({
            ordinal: 1,
            srcKind: 'data-url',
            sourceFingerprint: expect.any(String),
          }),
        ]),
        tileMaterialization: expect.arrayContaining([
          expect.objectContaining({
            ordinal: 1,
            outcome: 'captured',
            captureMethod: 'data-url',
            fileName: 'grok-imagine-visible-1.jpg',
          }),
        ]),
        fullQualityDownload: expect.objectContaining({
          attempted: true,
          ok: true,
          clicked: true,
          tileCandidateCount: 3,
          selectedTileSourceFingerprint: 'fake-selected-tile',
          downloadButtonCandidateCount: 1,
          downloadButtonLabels: ['Download'],
          actionSurfaceButtonCount: 2,
          actionSurfaceButtonLabels: ['Download', 'Share'],
          fileName: 'grok-imagine-full-quality.jpg',
        }),
      });
      expect(files[1]).toMatchObject({
        id: 'grok_imagine_visible_2',
        name: 'grok-imagine-visible-2.jpg',
        provider: 'grok',
        mimeType: 'image/jpeg',
        metadata: {
          materialization: 'visible-tile-browser-capture',
          srcKind: 'data-url',
          captureMethod: 'data-url',
        },
      });
      expect(files[2]).toMatchObject({
        id: 'grok_imagine_visible_3',
        name: 'grok-imagine-visible-3.jpg',
        provider: 'grok',
        mimeType: 'image/jpeg',
        metadata: {
          materialization: 'visible-tile-browser-capture',
          srcKind: 'data-url',
          captureMethod: 'data-url',
        },
      });
      expect(files[3]).toMatchObject({
        id: 'grok_imagine_full_quality_1',
        name: 'grok-imagine-full-quality.jpg',
        provider: 'grok',
        mimeType: 'image/jpeg',
        metadata: {
          materialization: 'download-button',
          previewArtifactId: 'grok_imagine_visible_1',
        },
      });
      expect(files[3]?.metadata?.fullQualityDiffersFromPreview).toBe(true);
      const evalExpressions = client.Runtime.evaluate.mock.calls.map(([arg]) => String(arg.expression ?? ''));
      expect(evalExpressions.some((expression) => expression.includes('isSubstantialRemotePreview'))).toBe(true);
      expect(evalExpressions.some((expression) => expression.includes('rect.width >= 120'))).toBe(true);
      expect(evalExpressions.some((expression) => expression.includes('const allowPrimaryTileActivation = false'))).toBe(true);
      await expect(fs.stat(files[0]!.localPath!)).resolves.toMatchObject({ size: files[0]!.size });
      await expect(fs.stat(files[1]!.localPath!)).resolves.toMatchObject({ size: files[1]!.size });
      await expect(fs.stat(files[2]!.localPath!)).resolves.toMatchObject({ size: files[2]!.size });
      await expect(fs.stat(files[3]!.localPath!)).resolves.toMatchObject({ size: files[3]!.size });
    } finally {
      await fs.rm(destDir, { recursive: true, force: true });
    }
  });
});

async function runGrokImaginePromptModeSelectionTest(input: {
  capabilityId: 'grok.media.imagine_image' | 'grok.media.imagine_video';
  expectedMode: 'Image' | 'Video';
  initialMode: 'Image' | 'Video';
}): Promise<{
  events: Array<{ phase: string; details?: Record<string, unknown> }>;
  capabilitySelected: { phase: string; details?: Record<string, unknown> } | undefined;
}> {
  grokRunPromptMocks.cdpList.mockReset();
  grokRunPromptMocks.cdpClose.mockReset();
  grokRunPromptMocks.connectToChromeTarget.mockReset();
  grokRunPromptMocks.openOrReuseChromeTarget.mockReset();
  grokRunPromptMocks.cdpList.mockResolvedValue([
    {
      id: 'grok-tab-1',
      type: 'page',
      url: 'https://grok.com/imagine',
    },
  ]);
  const client = createFakeGrokImaginePromptClient(input.initialMode);
  grokRunPromptMocks.connectToChromeTarget.mockResolvedValue(client);
  const events: Array<{ phase: string; details?: Record<string, unknown> }> = [];

  const adapter = createGrokAdapter();
  expect(adapter.runPrompt).toBeDefined();
  await adapter.runPrompt!(
    {
      prompt: 'Generate an asphalt secret agent',
      capabilityId: input.capabilityId,
      timeoutMs: 10_000,
      onProgress: (event) => {
        events.push(event as { phase: string; details?: Record<string, unknown> });
      },
    },
    {
      host: '127.0.0.1',
      port: 9222,
      configuredUrl: 'https://grok.com/imagine',
      expectedUserIdentity: {
        email: 'ez86944@gmail.com',
        source: 'profile',
      },
      expectedServiceAccountId: 'service-account:grok:ez86944@gmail.com',
    },
  );

  expect(grokRunPromptMocks.connectToChromeTarget).toHaveBeenCalledWith({
    host: '127.0.0.1',
    port: 9222,
    target: 'grok-tab-1',
  });
  expect(client.close).toHaveBeenCalledTimes(1);
  expect(client.currentMode).toBe(input.expectedMode);
  return {
    events,
    capabilitySelected: events.find((event) => event.phase === 'capability_selected'),
  };
}

function createFakeGrokImagineMaterializationClient(destDir: string) {
  let downloadName: string | null = null;
  const visibleBytes = [
    Buffer.from('visible tile one jpeg bytes'),
    Buffer.from('visible tile two jpeg bytes'),
    Buffer.from('visible tile three jpeg bytes'),
  ];
  const fullQualityBytes = Buffer.from('full quality jpeg bytes are different');
  const visibleDataUrls = visibleBytes.map((bytes) => `data:image/jpeg;base64,${bytes.toString('base64')}`);
  const evaluate = vi.fn(async ({ expression }: { expression: string }) => {
    if (expression.includes('Browser.setDownloadBehavior') || expression.includes('Page.setDownloadBehavior')) {
      return { result: { value: true } };
    }
    if (expression.includes('document.readyState')) {
      return { result: { value: { readyState: 'complete' } } };
    }
    if (expression.includes('new URL(location.href)')) {
      return { result: { value: { href: 'https://grok.com/imagine', title: 'Imagine - Grok' } } };
    }
    if (expression.includes('const identity = { id: null, name: null, handle: null, email: null, source: null }')) {
      return {
        result: {
          value: {
            id: 'c4d43034-7f30-462b-918b-59779bcba208',
            name: 'Eric C',
            handle: '@SwantonDoug',
            email: 'ez86944@gmail.com',
            source: 'next-data',
            guestAuthCta: false,
          },
        },
      };
    }
    if (expression.includes('const maxItems =') && expression.includes('const selectors =')) {
      const maxItemsMatch = expression.match(/const maxItems = ([0-9]+)/);
      const maxItems = maxItemsMatch ? Number(maxItemsMatch[1]) : 1;
      return {
        result: {
          value: {
            tiles: visibleDataUrls.slice(0, maxItems).map((dataUrl, index) => ({
              ordinal: index + 1,
              src: dataUrl,
              srcKind: 'data-url',
              x: 10 + index * 20,
              y: 20 + index * 20,
              width: 256,
              height: 256,
              naturalWidth: 512,
              naturalHeight: 512,
              selected: index === 0,
              dataUrl,
              error: null,
            })),
          },
        },
      };
    }
    if (expression.includes('__auracallGrokImagineDownloadCapture') && expression.includes('originalAnchorClick')) {
      downloadName = null;
      return { result: { value: true } };
    }
    if (expression.includes('firstTile') && expression.includes('Download')) {
      downloadName = 'grok-imagine-full-quality.jpg';
      await fs.writeFile(path.join(destDir, downloadName), fullQualityBytes);
      return {
        result: {
          value: {
            ok: true,
            tileCandidateCount: 3,
            selectedTileSourceFingerprint: 'fake-selected-tile',
            downloadButtonCandidateCount: 1,
            downloadButtonLabels: ['Download'],
            actionSurfaceButtonCount: 2,
            actionSurfaceButtonLabels: ['Download', 'Share'],
          },
        },
      };
    }
    if (expression.includes('downloadName')) {
      return {
        result: {
          value: {
            href: null,
            downloadName,
          },
        },
      };
    }
    return { result: { value: true } };
  });
  return {
    Page: {
      enable: vi.fn(async () => undefined),
      captureScreenshot: vi.fn(async () => ({ data: visibleBytes[0]!.toString('base64') })),
    },
    Runtime: {
      enable: vi.fn(async () => undefined),
      evaluate,
    },
    send: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
  };
}

function createFakeGrokImaginePromptClient(initialMode: 'Image' | 'Video') {
  let currentMode = initialMode;
  let submitted = false;
  const targetUrl = 'https://grok.com/imagine';
  const modeControls = () => [
    {
      text: 'Image',
      role: 'radio',
      checked: currentMode === 'Image' ? 'true' : 'false',
      disabled: false,
    },
    {
      text: 'Video',
      role: 'radio',
      checked: currentMode === 'Video' ? 'true' : 'false',
      disabled: false,
    },
  ];
  const featureProbe = () => ({
    imagine: {
      href: targetUrl,
      title: 'Imagine - Grok',
      run_state: submitted ? 'pending' : 'idle',
      account_gated: false,
      blocked: false,
      pending: submitted,
      terminal_image: false,
      terminal_video: false,
      media: {
        images: [],
        videos: [],
        visible_tiles: [],
        urls: [],
      },
    },
  });
  const evaluate = vi.fn(async ({ expression }: { expression: string }) => {
    const targetMode = expression.includes('const targetMode = "Video"') ? 'Video' :
      expression.includes('const targetMode = "Image"') ? 'Image' :
        null;
    if (targetMode && expression.includes('target.click()')) {
      const clicked = currentMode !== targetMode;
      currentMode = targetMode;
      return { result: { value: { clicked, mode: targetMode } } };
    }
    if (targetMode && expression.includes('const summarize = (node) =>')) {
      return {
        result: {
          value: currentMode === targetMode
            ? { mode: targetMode, selected: true, controls: modeControls() }
            : null,
        },
      };
    }
    if (expression.includes("detector: 'grok-feature-probe-v1'")) {
      return { result: { value: featureProbe() } };
    }
    if (expression.includes('document.readyState')) {
      return { result: { value: { readyState: 'complete' } } };
    }
    if (expression.includes('new URL(location.href)')) {
      return { result: { value: { href: targetUrl, title: 'Imagine - Grok' } } };
    }
    if (expression.includes('const identity = { id: null, name: null, handle: null, email: null, source: null }')) {
      return {
        result: {
          value: {
            id: 'c4d43034-7f30-462b-918b-59779bcba208',
            name: 'Eric C',
            handle: '@SwantonDoug',
            email: 'ez86944@gmail.com',
            source: 'next-data',
            guestAuthCta: false,
          },
        },
      };
    }
    if (expression.includes('const prompt = ')) {
      return { result: { value: { ok: true } } };
    }
    if (expression.includes('preferred.dispatchEvent')) {
      submitted = true;
      return { result: { value: { ok: true, label: 'submit' } } };
    }
    if (expression.includes('main textarea, main [contenteditable="true"]') && expression.includes('placeholder')) {
      return {
        result: {
          value: {
            tag: 'DIV',
            text: 'Type to imagine',
            placeholder: 'Type to imagine',
          },
        },
      };
    }
    if (expression.includes("const form = composer?.closest?.('form')")) {
      return { result: { value: { ok: true } } };
    }
    return { result: { value: true } };
  });
  return {
    get currentMode() {
      return currentMode;
    },
    Page: {
      enable: vi.fn(async () => undefined),
    },
    Runtime: {
      enable: vi.fn(async () => undefined),
      evaluate,
    },
    close: vi.fn(async () => undefined),
  };
}
