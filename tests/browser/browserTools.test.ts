import { describe, expect, test, vi } from 'vitest';
import {
  BROWSER_TOOLS_CONTRACT_VERSION,
  browserToolsReportRequiresManualClear,
  classifyBrowserToolsBlockingState,
  collectBrowserToolsDomSearch,
  collectBrowserToolsUiList,
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

  test('prefers a visible url match over a focused hidden tab', () => {
    const pages = [
      {
        url: 'https://gemini.google.com/app',
        focused: true,
        title: 'Google Gemini',
        visibilityState: 'hidden',
      },
      {
        url: 'https://gemini.google.com/app/ab30a4a92e4b65a9',
        focused: false,
        title: 'Google Gemini',
        visibilityState: 'visible',
      },
    ];

    const result = explainBrowserToolsPageSelection(pages, {
      urlContains: '/app/ab30a4a92e4b65a9',
    });

    expect(result.selectedIndex).toBe(1);
    expect(result.selectedReason).toBe('url-contains');
    expect(result.candidates[0]).toMatchObject({
      selected: false,
      focused: true,
      visibilityState: 'hidden',
    });
    expect(result.candidates[1]).toMatchObject({
      selected: true,
      matchesUrlContains: true,
      visibilityState: 'visible',
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
      blockingState: null,
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
        blockingState: null,
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
      uiList: null,
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
        bodyText: 'Normal Grok page',
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
    expect(result.blockingState).toBeNull();
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

  test('collectBrowserToolsDomSearch returns structured DOM matches', async () => {
    const fakePage = {
      url: () => 'https://gemini.google.com/app',
      title: async () => 'Gemini',
      evaluate: async () => ({
        totalScanned: 42,
        matched: [
          {
            tag: 'button',
            id: null,
            role: 'menuitemcheckbox',
            text: 'Create music',
            ariaLabel: null,
            title: null,
            dataTestId: null,
            className: 'toolbox-drawer-item-list-button',
            href: null,
            checked: false,
            expanded: null,
            visible: true,
          },
        ],
      }),
    };

    const result = await collectBrowserToolsDomSearch(fakePage as never, {
      role: ['menuitemcheckbox'],
      text: ['Create music'],
    });

    expect(result).toEqual({
      url: 'https://gemini.google.com/app',
      title: 'Gemini',
      totalScanned: 42,
      matched: [
        expect.objectContaining({
          tag: 'button',
          role: 'menuitemcheckbox',
          text: 'Create music',
          className: 'toolbox-drawer-item-list-button',
          checked: false,
          visible: true,
        }),
      ],
    });
  });

  test('collectBrowserToolsUiList returns grouped visible interactive controls', async () => {
    const fakePage = {
      url: () => 'https://gemini.google.com/app',
      title: async () => 'Gemini',
      evaluate: async () => ({
        totalScanned: 88,
        summary: {
          buttons: 1,
          menuItems: 2,
          switches: 1,
          inputs: 1,
          links: 0,
          dialogs: 0,
          menus: 1,
          fileInputs: 1,
          uploadCandidates: 2,
        },
        sections: {
          buttons: [
            {
              tag: 'button',
              role: null,
              text: 'Tools',
              ariaLabel: null,
              title: null,
              dataTestId: null,
              className: 'toolbox-drawer-button',
              href: null,
              checked: null,
              expanded: false,
              disabled: false,
              visible: true,
              inputType: null,
              widgetType: 'button',
              pathHint: 'body > button.toolbox-drawer-button',
              interactionHints: ['hard-click-preferred', 'keyboard-activatable', 'soft-js-events-possible'],
            },
          ],
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
              pathHint: 'body > div[role=menu] > button.toolbox-drawer-item-list-button',
              interactionHints: ['hard-click-preferred', 'keyboard-activatable', 'soft-js-events-possible'],
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
              pathHint: 'body > div[role=menu] > button.toolbox-drawer-item-list-button',
              interactionHints: ['hard-click-preferred', 'keyboard-activatable', 'soft-js-events-possible'],
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
              pathHint: 'body > button.mdc-switch',
              interactionHints: ['hard-click-preferred', 'keyboard-activatable', 'pointer-gesture-preferred'],
            },
          ],
          inputs: [
            {
              tag: 'div',
              role: 'textbox',
              text: null,
              ariaLabel: 'Enter a prompt for Gemini',
              title: null,
              dataTestId: null,
              className: 'ql-editor',
              href: null,
              checked: null,
              expanded: null,
              disabled: false,
              visible: true,
              inputType: null,
              widgetType: 'input',
              pathHint: 'body > div[role=textbox]',
              interactionHints: ['keyboard-activatable'],
            },
          ],
          links: [],
          dialogs: [],
          menus: [
            {
              tag: 'div',
              role: 'menu',
              text: 'Canvas Deep research',
              ariaLabel: null,
              title: null,
              dataTestId: null,
              className: 'cdk-overlay-pane',
              href: null,
              checked: null,
              expanded: null,
              disabled: null,
              visible: true,
              inputType: null,
              widgetType: 'menu',
              pathHint: 'body > div[role=menu]',
              interactionHints: [],
            },
          ],
          fileInputs: [
            {
              tag: 'input',
              role: null,
              text: null,
              ariaLabel: null,
              title: null,
              dataTestId: 'hidden-local-file-upload-input',
              className: 'hidden-file-input',
              href: null,
              checked: null,
              expanded: null,
              disabled: false,
              visible: false,
              inputType: 'file',
              widgetType: 'file-input',
              pathHint: 'body > input#upload-file.hidden-file-input',
              interactionHints: ['file-chooser-candidate', 'hidden-native-file-input'],
            },
          ],
          uploadCandidates: [
            {
              tag: 'button',
              role: null,
              text: 'Upload files',
              ariaLabel: 'Upload files. Documents, data, code files',
              title: null,
              dataTestId: 'local-images-files-uploader-button',
              className: 'toolbox-drawer-item-list-button',
              href: null,
              checked: null,
              expanded: null,
              disabled: false,
              visible: true,
              inputType: null,
              widgetType: 'upload-trigger',
              pathHint: 'body > div[role=menu] > button.toolbox-drawer-item-list-button',
              interactionHints: ['hard-click-preferred', 'keyboard-activatable', 'soft-js-events-possible', 'file-chooser-candidate'],
            },
            {
              tag: 'input',
              role: null,
              text: null,
              ariaLabel: null,
              title: null,
              dataTestId: 'hidden-local-file-upload-input',
              className: 'hidden-file-input',
              href: null,
              checked: null,
              expanded: null,
              disabled: false,
              visible: false,
              inputType: 'file',
              widgetType: 'file-input',
              pathHint: 'body > input#upload-file.hidden-file-input',
              interactionHints: ['file-chooser-candidate', 'hidden-native-file-input'],
            },
          ],
        },
      }),
    };

    const result = await collectBrowserToolsUiList(fakePage as never, {
      limitPerKind: 10,
    });

    expect(result).toEqual({
      url: 'https://gemini.google.com/app',
      title: 'Gemini',
      totalScanned: 88,
      summary: {
        buttons: 1,
        menuItems: 2,
        switches: 1,
        inputs: 1,
        links: 0,
        dialogs: 0,
        menus: 1,
        fileInputs: 1,
        uploadCandidates: 2,
      },
      sections: {
        buttons: [expect.objectContaining({ text: 'Tools', expanded: false, widgetType: 'button' })],
        menuItems: [
          expect.objectContaining({ text: 'Canvas', role: 'menuitemcheckbox' }),
          expect.objectContaining({ text: 'Deep research', role: 'menuitemcheckbox' }),
        ],
        switches: [expect.objectContaining({ ariaLabel: 'Personal Intelligence', checked: true, widgetType: 'switch' })],
        inputs: [expect.objectContaining({ role: 'textbox', ariaLabel: 'Enter a prompt for Gemini', widgetType: 'input' })],
        links: [],
        dialogs: [],
        menus: [expect.objectContaining({ role: 'menu' })],
        fileInputs: [expect.objectContaining({ inputType: 'file', visible: false })],
        uploadCandidates: [
          expect.objectContaining({ widgetType: 'upload-trigger', interactionHints: expect.arrayContaining(['file-chooser-candidate']) }),
          expect.objectContaining({ inputType: 'file', interactionHints: expect.arrayContaining(['hidden-native-file-input']) }),
        ],
      },
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
        uiList: null,
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

  test('classifies google sorry and cloudflare blocking pages explicitly', () => {
    expect(classifyBrowserToolsBlockingState({
      url: 'https://www.google.com/sorry/index?continue=https://gemini.google.com/app',
      title: 'About this page',
      bodyText:
        'Our systems have detected unusual traffic from your computer network. This page checks to see if it is really you sending the requests, and not a robot.',
    })).toEqual({
      kind: 'google-sorry',
      summary: 'Google unusual-traffic interstitial detected (google.com/sorry).',
      requiresHuman: true,
    });

    expect(classifyBrowserToolsBlockingState({
      url: 'https://chat.openai.com/',
      title: 'Just a moment...',
      bodyText: 'Cloudflare verify you are human before continuing.',
    })).toEqual({
      kind: 'cloudflare',
      summary: 'Cloudflare anti-bot interstitial detected.',
      requiresHuman: true,
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
      uiList: null,
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

  test('flags doctor reports that require manual clearance', () => {
    expect(browserToolsReportRequiresManualClear({
      census: {
        selectedIndex: 0,
        selectedReason: 'url-contains',
        selectedTab: null,
        tabs: [],
        candidates: [],
      },
      pageProbe: {
        document: {
          url: 'https://www.google.com/sorry/index',
          title: 'About this page',
          readyState: 'complete',
          visibilityState: 'visible',
          focused: true,
          scriptCount: 0,
          bodyTextLength: 120,
          visibleCounts: {
            buttons: 0,
            links: 0,
            inputs: 0,
            textareas: 0,
            contenteditables: 0,
          },
        },
        blockingState: {
          kind: 'google-sorry',
          summary: 'Google unusual-traffic interstitial detected (google.com/sorry).',
          requiresHuman: true,
        },
        selectors: [],
        storage: null,
        cookies: null,
        scriptText: null,
      },
      uiList: null,
    })).toBe(true);

    expect(browserToolsReportRequiresManualClear({
      census: {
        selectedIndex: 0,
        selectedReason: 'url-contains',
        selectedTab: null,
        tabs: [],
        candidates: [],
      },
      pageProbe: null,
      uiList: null,
    })).toBe(false);
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

  test('browser-tools search forwards AuraCall runtime profile and browser target to the resolver', async () => {
    const resolvePortOrLaunch = vi.fn(async () => 45013);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const program = createBrowserToolsProgram({
      resolvePortOrLaunch,
      argv: ['node', 'browser-tools', '--auracall-profile', 'default', '--browser-target', 'gemini', 'search', '--text', 'Tools'],
      defaultChromeBin: 'google-chrome',
      defaultProfileDir: '/tmp/browser-tools',
    });

    try {
      await program.parseAsync(['node', 'browser-tools', '--auracall-profile', 'default', '--browser-target', 'gemini', 'search', '--text', 'Tools']);
    } catch {
      // the command will fail later without a real browser, but resolver wiring should still be exercised
    } finally {
      log.mockRestore();
    }

    expect(resolvePortOrLaunch).toHaveBeenCalledWith(
      expect.objectContaining({
        auracallProfile: 'default',
        browserTarget: 'gemini',
      }),
    );
  });

  test('browser-tools ls forwards AuraCall runtime profile and browser target to the resolver', async () => {
    const resolvePortOrLaunch = vi.fn(async () => 45013);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const program = createBrowserToolsProgram({
      resolvePortOrLaunch,
      argv: ['node', 'browser-tools', '--auracall-profile', 'default', '--browser-target', 'gemini', 'ls'],
      defaultChromeBin: 'google-chrome',
      defaultProfileDir: '/tmp/browser-tools',
    });

    try {
      await program.parseAsync(['node', 'browser-tools', '--auracall-profile', 'default', '--browser-target', 'gemini', 'ls']);
    } catch {
      // the command will fail later without a real browser, but resolver wiring should still be exercised
    } finally {
      log.mockRestore();
    }

    expect(resolvePortOrLaunch).toHaveBeenCalledWith(
      expect.objectContaining({
        auracallProfile: 'default',
        browserTarget: 'gemini',
      }),
    );
  });
});
