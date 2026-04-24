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

  test('normalizes Imagine browser discovery evidence into a stable signature', () => {
    const signature = normalizeGrokFeatureSignature({
      detector: 'ignored',
      imagine: {
        visible: true,
        account_gated: false,
        blocked: false,
        modes: ['Image', 'image-to-video', 'Image'],
        labels: [' Imagine ', 'Create with Imagine', 'Imagine'],
        routes: ['https://grok.com/imagine', 'https://grok.com/imagine'],
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
        modes: ['image', 'image-to-video'],
        labels: ['Create with Imagine', 'Imagine'],
        routes: ['https://grok.com/imagine'],
        href: 'https://grok.com/imagine',
        title: 'Grok',
      },
    });
  });

  test('returns null when no Imagine signal is present', () => {
    expect(normalizeGrokFeatureSignature({ detector: 'grok-feature-probe-v1', imagine: {} })).toBeNull();
  });
});

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
