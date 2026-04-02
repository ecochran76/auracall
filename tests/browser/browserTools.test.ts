import { describe, expect, test, vi } from 'vitest';
import {
  BROWSER_TOOLS_CONTRACT_VERSION,
  collectBrowserToolsPageProbe,
  createBrowserToolsProgram,
  createBrowserToolsDoctorContract,
  createBrowserToolsProbeContract,
  explainBrowserToolsPageSelection,
  selectBrowserToolsPageIndex,
  summarizeBrowserToolsDoctorReport,
  summarizeBrowserToolsPageProbe,
} from '../../packages/browser-service/src/browserTools.js';

describe('selectBrowserToolsPageIndex', () => {
  test('prefers explicit urlContains match over focused tab', () => {
    const pages = [
      { url: 'https://accounts.x.ai/sign-in', focused: true },
      { url: 'https://grok.com/c/abc123', focused: false },
      { url: 'about:blank', focused: false },
    ];

    expect(selectBrowserToolsPageIndex(pages, { urlContains: '/c/' })).toBe(1);
  });

  test('falls back to focused tab when no url match exists', () => {
    const pages = [
      { url: 'https://accounts.x.ai/sign-in', focused: true },
      { url: 'https://grok.com/', focused: false },
    ];

    expect(selectBrowserToolsPageIndex(pages, { urlContains: '/settings' })).toBe(0);
  });

  test('falls back to last page when only chrome and blank tabs remain', () => {
    const pages = [
      { url: 'chrome://omnibox-popup.top-chrome/', focused: false },
      { url: 'about:blank', focused: false },
    ];

    expect(selectBrowserToolsPageIndex(pages)).toBe(1);
  });

  test('explains why a url match wins over the focused tab', () => {
    const pages = [
      { url: 'https://accounts.x.ai/sign-in', focused: true, title: 'Sign in' },
      { url: 'https://grok.com/c/abc123', focused: false, title: 'Grok chat' },
    ];

    const result = explainBrowserToolsPageSelection(pages, { urlContains: '/c/' });

    expect(result.selectedIndex).toBe(1);
    expect(result.selectedReason).toBe('url-contains');
    expect(result.candidates[0]).toMatchObject({
      selected: false,
      focused: true,
      selectionReasons: ['focused', 'non-internal-page'],
    });
    expect(result.candidates[1]).toMatchObject({
      selected: true,
      matchesUrlContains: true,
      selectionReasons: ['url-contains', 'non-internal-page', 'last-page'],
    });
  });

  test('explains non-internal fallback when no focused or matched tab exists', () => {
    const pages = [
      { url: 'chrome://newtab', focused: false, title: 'New Tab' },
      { url: 'https://example.com/docs', focused: false, title: 'Docs' },
      { url: 'about:blank', focused: false, title: null },
    ];

    const result = explainBrowserToolsPageSelection(pages, { urlContains: '/missing' });

    expect(result.selectedIndex).toBe(1);
    expect(result.selectedReason).toBe('non-internal-page');
    expect(result.candidates[1]).toMatchObject({
      selected: true,
      isBrowserInternal: false,
      isBlank: false,
      selectionReasons: ['non-internal-page'],
    });
    expect(result.candidates[2]).toMatchObject({
      selected: false,
      isBlank: true,
      selectionReasons: ['last-page'],
    });
  });

  test('summarizeBrowserToolsPageProbe includes document, selector, and script facts', () => {
    const lines = summarizeBrowserToolsPageProbe({
      document: {
        url: 'https://grok.com/c/abc123',
        title: 'Grok',
        readyState: 'complete',
        visibilityState: 'visible',
        focused: true,
        scriptCount: 12,
        bodyTextLength: 240,
        visibleCounts: {
          buttons: 4,
          links: 3,
          inputs: 1,
          textareas: 1,
          contenteditables: 0,
        },
      },
      selectors: [
        {
          selector: 'textarea',
          matched: 2,
          visible: 1,
          firstVisibleTag: 'textarea',
          firstVisibleText: 'ping',
        },
      ],
      storage: {
        localStorageCount: 2,
        sessionStorageCount: 1,
        sampleLocalStorageKeys: ['AF_SESSION', 'user'],
        sampleSessionStorageKeys: ['draft'],
        matchedAny: ['AF_SESSION'],
        missingAll: ['missing-storage-key'],
      },
      cookies: {
        cookieCount: 3,
        sampleNames: ['session', 'cf_clearance', 'theme'],
        domains: ['grok.com'],
        matchedAny: ['session'],
        missingAll: ['missing-cookie'],
      },
      scriptText: {
        enabled: true,
        scriptSelector: 'script',
        scriptCount: 12,
        matched: true,
        matchedAny: ['__NEXT_DATA__'],
        missingAll: [],
        preview: 'window.__NEXT_DATA__={"user":{"name":"Eric"}}',
      },
    });

    expect(lines.join('\n')).toContain('Selected page: Grok');
    expect(lines.join('\n')).toContain('Storage: local=2, session=1');
    expect(lines.join('\n')).toContain('Cookies: count=3');
    expect(lines.join('\n')).toContain('textarea: matched=2, visible=1');
    expect(lines.join('\n')).toContain('matched=yes');
  });

  test('summarizeBrowserToolsDoctorReport includes selection headline', () => {
    const lines = summarizeBrowserToolsDoctorReport({
      census: {
        selectedIndex: 1,
        selectedReason: 'url-contains',
        selectedTab: {
          index: 1,
          url: 'https://grok.com/c/abc123',
          focused: false,
          title: 'Grok',
          readyState: 'complete',
          visibilityState: 'visible',
          selected: true,
          matchesUrlContains: true,
          selectionReasons: ['url-contains', 'non-internal-page'],
          isBlank: false,
          isBrowserInternal: false,
        },
        tabs: [],
        candidates: [],
      },
      pageProbe: {
        document: {
          url: 'https://grok.com/c/abc123',
          title: 'Grok',
          readyState: 'complete',
          visibilityState: 'visible',
          focused: false,
          scriptCount: 5,
          bodyTextLength: 100,
          visibleCounts: {
            buttons: 2,
            links: 1,
            inputs: 1,
            textareas: 0,
            contenteditables: 0,
          },
        },
        selectors: [],
        storage: {
          localStorageCount: 1,
          sessionStorageCount: 0,
          sampleLocalStorageKeys: ['AF_SESSION'],
          sampleSessionStorageKeys: [],
          matchedAny: [],
          missingAll: [],
        },
        cookies: {
          cookieCount: 1,
          sampleNames: ['session'],
          domains: ['grok.com'],
          matchedAny: [],
          missingAll: [],
        },
        scriptText: null,
      },
    });

    expect(lines[0]).toBe('Doctor selection: tab 2 (url-contains)');
    expect(lines.join('\n')).toContain('Selected page: Grok');
  });

  test('collectBrowserToolsPageProbe merges page state with cookie and storage probes', async () => {
    const fakePage = {
      url: () => 'https://grok.com/c/abc123',
      title: async () => 'Grok',
      cookies: async () => [
        { name: 'session', domain: 'grok.com' },
        { name: 'cf_clearance', domain: 'grok.com' },
      ],
      evaluate: async () => ({
        document: {
          readyState: 'complete',
          visibilityState: 'visible',
          focused: true,
          scriptCount: 5,
          bodyTextLength: 120,
          visibleCounts: {
            buttons: 2,
            links: 1,
            inputs: 1,
            textareas: 0,
            contenteditables: 0,
          },
        },
        selectors: [
          {
            selector: 'textarea',
            matched: 1,
            visible: 1,
            firstVisibleTag: 'textarea',
            firstVisibleText: 'ping',
          },
        ],
        storage: {
          localStorageCount: 2,
          sessionStorageCount: 1,
          sampleLocalStorageKeys: ['AF_SESSION', 'user'],
          sampleSessionStorageKeys: ['draft'],
          matchedAny: ['AF_SESSION'],
          missingAll: ['missing-storage-key'],
        },
        scriptText: {
          enabled: true,
          scriptSelector: 'script',
          scriptCount: 5,
          matched: true,
          matchedAny: ['__NEXT_DATA__'],
          missingAll: [],
          preview: 'window.__NEXT_DATA__={\"user\":{\"name\":\"Eric\"}}',
        },
      }),
    };

    const result = await collectBrowserToolsPageProbe(fakePage as never, {
      selectors: ['textarea'],
      scriptAny: ['__NEXT_DATA__'],
      storageAny: ['AF_SESSION'],
      storageAll: ['AF_SESSION', 'missing-storage-key'],
      cookieAny: ['session'],
      cookieAll: ['session', 'missing-cookie'],
    });

    expect(result.document.url).toBe('https://grok.com/c/abc123');
    expect(result.storage).toEqual({
      localStorageCount: 2,
      sessionStorageCount: 1,
      sampleLocalStorageKeys: ['AF_SESSION', 'user'],
      sampleSessionStorageKeys: ['draft'],
      matchedAny: ['AF_SESSION'],
      missingAll: ['missing-storage-key'],
    });
    expect(result.cookies).toEqual({
      cookieCount: 2,
      sampleNames: ['session', 'cf_clearance'],
      domains: ['grok.com'],
      matchedAny: ['session'],
      missingAll: ['missing-cookie'],
    });
  });

  test('createBrowserToolsProbeContract wraps probe output in a versioned envelope', () => {
    const contract = createBrowserToolsProbeContract(
      {
        census: {
          selectedIndex: 1,
          selectedReason: 'url-contains',
          selectedTab: {
            index: 1,
            url: 'https://grok.com/c/abc123',
            focused: false,
            title: 'Grok',
            readyState: 'complete',
            visibilityState: 'visible',
            selected: true,
            matchesUrlContains: true,
            selectionReasons: ['url-contains', 'non-internal-page'],
            isBlank: false,
            isBrowserInternal: false,
          },
          tabs: [],
          candidates: [],
        },
        pageProbe: null,
      },
      { generatedAt: '2026-03-25T20:30:00.000Z' },
    );

    expect(contract).toEqual({
      contract: 'browser-tools.page-probe',
      version: BROWSER_TOOLS_CONTRACT_VERSION,
      generatedAt: '2026-03-25T20:30:00.000Z',
      selection: {
        selectedIndex: 1,
        selectedReason: 'url-contains',
        selectedTab: {
          index: 1,
          url: 'https://grok.com/c/abc123',
          focused: false,
          title: 'Grok',
          readyState: 'complete',
          visibilityState: 'visible',
          selected: true,
          matchesUrlContains: true,
          selectionReasons: ['url-contains', 'non-internal-page'],
          isBlank: false,
          isBrowserInternal: false,
        },
      },
      pageProbe: null,
    });
  });

  test('createBrowserToolsDoctorContract wraps doctor output in a versioned envelope', () => {
    const report = {
      census: {
        selectedIndex: -1,
        selectedReason: null,
        selectedTab: null,
        tabs: [],
        candidates: [],
      },
      pageProbe: null,
    };

    const contract = createBrowserToolsDoctorContract(report, {
      generatedAt: '2026-03-25T20:31:00.000Z',
    });

    expect(contract).toEqual({
      contract: 'browser-tools.doctor-report',
      version: BROWSER_TOOLS_CONTRACT_VERSION,
      generatedAt: '2026-03-25T20:31:00.000Z',
      report,
    });
  });

  test('browser-tools start forwards AuraCall runtime profile and browser target to the resolver', async () => {
    const resolvePortOrLaunch = vi.fn(async () => 45013);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const program = createBrowserToolsProgram({
      resolvePortOrLaunch,
      argv: ['node', 'browser-tools', '--auracall-profile', 'wsl-chrome-2', '--browser-target', 'chatgpt', 'start'],
      defaultChromeBin: 'google-chrome',
      defaultProfileDir: '/tmp/browser-tools',
    });

    try {
      await program.parseAsync(['node', 'browser-tools', '--auracall-profile', 'wsl-chrome-2', '--browser-target', 'chatgpt', 'start']);
    } finally {
      log.mockRestore();
    }

    expect(resolvePortOrLaunch).toHaveBeenCalledWith(
      expect.objectContaining({
        auracallProfile: 'wsl-chrome-2',
        browserTarget: 'chatgpt',
        profileDir: undefined,
        chromePath: undefined,
      }),
    );
  });
});
