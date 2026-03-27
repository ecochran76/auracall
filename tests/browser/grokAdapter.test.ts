import { describe, expect, test, vi } from 'vitest';
import {
  choosePreferredGrokConversation,
  ensureGrokTabVisible,
  extractGrokProjectIdFromUrl,
  extractGrokIdentityFromSerializedScripts,
  grokUrlMatchesPreference,
  grokConversationTitleQuality,
  isGrokMainSidebarOpenProbe,
  parseGrokWorkspaceCreateError,
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

describe('grokUrlMatchesPreference', () => {
  test('requires an exact project index path match for /project', () => {
    expect(grokUrlMatchesPreference('https://grok.com/project', 'https://grok.com/project')).toBe(true);
    expect(grokUrlMatchesPreference('https://grok.com/project/abc123', 'https://grok.com/project')).toBe(false);
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
});
