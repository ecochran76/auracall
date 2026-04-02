import { describe, expect, test, vi } from 'vitest';
import { resumeBrowserSession, describeReattachFailure, ReattachFailure, __test__ } from '../../src/browser/reattach.js';
import { resumeBrowserSessionCore } from '../../src/browser/reattachCore.js';
import type { BrowserLogger, ChromeClient } from '../../src/browser/types.js';

type FakeTarget = { targetId?: string; type?: string; url?: string };
type FakeClient = {
  // biome-ignore lint/style/useNamingConvention: mirrors DevTools protocol domain names
  Runtime: {
    enable: () => void;
    evaluate: (params: { expression: string; returnByValue?: boolean }) => Promise<{ result: { value: unknown } }>;
  };
  // biome-ignore lint/style/useNamingConvention: mirrors DevTools protocol domain names
  DOM: { enable: () => void };
  close: () => Promise<void> | void;
};

describe('resumeBrowserSession', () => {
  test('selects target and captures markdown via stubs', async () => {
    const runtime = {
      chromePort: 51559,
      chromeHost: '127.0.0.1',
      chromeTargetId: 'target-1',
      tabUrl: 'https://chatgpt.com/c/abc',
    };
    const listTargets = vi.fn(async () =>
      [
        { targetId: 'target-1', type: 'page', url: runtime.tabUrl },
        { targetId: 'target-2', type: 'page', url: 'about:blank' },
      ] satisfies FakeTarget[],
    ) as unknown as () => Promise<FakeTarget[]>;
    const evaluate = vi.fn(async ({ expression }: { expression: string }) => {
      if (expression === 'location.href') {
        return { result: { value: runtime.tabUrl } };
      }
      if (expression === '1+1') {
        return { result: { value: 2 } };
      }
      return { result: { value: null } };
    });
    const connect = vi.fn(async () =>
      ({
        // biome-ignore lint/style/useNamingConvention: mirrors DevTools protocol domain names
        Runtime: { enable: vi.fn(), evaluate },
        // biome-ignore lint/style/useNamingConvention: mirrors DevTools protocol domain names
        DOM: { enable: vi.fn() },
        close: vi.fn(async () => {}),
      } satisfies FakeClient),
    ) as unknown as (options?: unknown) => Promise<ChromeClient>;
    const waitForAssistantResponse = vi.fn(async () => ({
      text: 'Hello PATH plan',
      html: '',
      meta: { messageId: 'm1', turnId: 'conversation-turn-1' },
    }));
    const captureAssistantMarkdown = vi.fn(async () => 'markdown response');
    const logger = vi.fn() as BrowserLogger;
    logger.verbose = true;

    const result = await resumeBrowserSession(
      runtime,
      { timeoutMs: 2000 },
      logger,
      { listTargets, connect, waitForAssistantResponse, captureAssistantMarkdown },
    );

    expect(result.answerMarkdown).toBe('markdown response');
    expect(waitForAssistantResponse).toHaveBeenCalled();
    expect(captureAssistantMarkdown).toHaveBeenCalled();
  });

  test('falls back to recovery when chrome port is missing', async () => {
    const runtime = {
      tabUrl: 'https://chatgpt.com/c/abc',
    };
    const recoverSession = vi.fn(async () => ({
      answerText: 'fallback',
      answerMarkdown: 'fallback-md',
    }));
    const logger = vi.fn() as BrowserLogger;

    const result = await resumeBrowserSession(runtime, {}, logger, { recoverSession });

    expect(result.answerMarkdown).toBe('fallback-md');
    expect(recoverSession).toHaveBeenCalled();
  });

  test('logs classified target-missing reattach failures before recovery', async () => {
    const runtime = {
      chromePort: 51559,
      chromeHost: '127.0.0.1',
      tabUrl: 'https://chatgpt.com/c/demo',
    };
    const listTargets = vi.fn(async () => [] satisfies FakeTarget[]) as unknown as () => Promise<FakeTarget[]>;
    const recoverSession = vi.fn(async () => ({
      answerText: 'fallback',
      answerMarkdown: 'fallback-md',
    }));
    const logger = vi.fn() as BrowserLogger;

    const result = await resumeBrowserSession(runtime, {}, logger, { listTargets, recoverSession });

    expect(result.answerText).toBe('fallback');
    expect(recoverSession).toHaveBeenCalled();
    expect(logger).toHaveBeenCalledWith(
      expect.stringContaining('target-missing: Existing Chrome no longer exposes the prior ChatGPT tab or conversation target.'),
    );
  });

  test('logs classified ambiguous reattach failures before recovery', async () => {
    const runtime = {
      chromePort: 51559,
      chromeHost: '127.0.0.1',
      tabUrl: 'https://chatgpt.com/c/original',
    };
    const listTargets = vi.fn(async () =>
      [
        { targetId: 'target-1', type: 'page', url: 'https://chatgpt.com/c/other-1' },
        { targetId: 'target-2', type: 'page', url: 'https://chatgpt.com/c/other-2' },
      ] satisfies FakeTarget[],
    ) as unknown as () => Promise<FakeTarget[]>;
    const recoverSession = vi.fn(async () => ({
      answerText: 'fallback',
      answerMarkdown: 'fallback-md',
    }));
    const logger = vi.fn() as BrowserLogger;

    const result = await resumeBrowserSession(runtime, {}, logger, { listTargets, recoverSession });

    expect(result.answerText).toBe('fallback');
    expect(recoverSession).toHaveBeenCalled();
    expect(logger).toHaveBeenCalledWith(
      expect.stringContaining(
        'ambiguous: Existing Chrome exposes multiple possible ChatGPT pages for the prior browser profile; refusing to guess.',
      ),
    );
  });

  test('classifies same-origin live wrong browser profile before target matching', async () => {
    const runtime = {
      chromePort: 45013,
      chromeHost: '127.0.0.1',
      tabUrl: 'https://chatgpt.com/c/original',
    };
    const listTargets = vi.fn(async () =>
      [
        { targetId: 'target-1', type: 'page', url: 'https://chatgpt.com/' },
        { targetId: 'target-2', type: 'page', url: 'https://chatgpt.com/gpts' },
      ] satisfies FakeTarget[],
    ) as unknown as () => Promise<FakeTarget[]>;
    const recoverSession = vi.fn(async () => ({
      answerText: 'fallback',
      answerMarkdown: 'fallback-md',
    }));
    const logger = vi.fn() as BrowserLogger;

    const result = await resumeBrowserSession(
      runtime,
      { target: 'chatgpt', manualLoginProfileDir: '/tmp/default/chatgpt', chromeProfile: 'Default' },
      logger,
      {
        listTargets,
        recoverSession,
        classifyBrowserProfileFailure: async () => ({
          kind: 'wrong-browser-profile',
          message: 'Existing Chrome no longer exposes the expected ChatGPT browser profile.',
          chromePort: 45013,
        }),
      },
    );

    expect(result.answerText).toBe('fallback');
    expect(recoverSession).toHaveBeenCalled();
    expect(logger).toHaveBeenCalledWith(
      expect.stringContaining(
        'wrong-browser-profile: Existing Chrome no longer exposes the expected ChatGPT browser profile.',
      ),
    );
  });

  test('treats generic root tabs as ambiguous instead of suppressing ambiguity', async () => {
    const runtime = {
      chromePort: 51559,
      chromeHost: '127.0.0.1',
      tabUrl: 'https://chatgpt.com/c/original',
    };
    const listTargets = vi.fn(async () =>
      [
        { targetId: 'target-1', type: 'page', url: 'https://chatgpt.com/' },
        { targetId: 'target-2', type: 'page', url: 'https://chatgpt.com/gpts' },
      ] satisfies FakeTarget[],
    ) as unknown as () => Promise<FakeTarget[]>;
    const recoverSession = vi.fn(async () => ({
      answerText: 'fallback',
      answerMarkdown: 'fallback-md',
    }));
    const logger = vi.fn() as BrowserLogger;

    const result = await resumeBrowserSession(runtime, {}, logger, { listTargets, recoverSession });

    expect(result.answerText).toBe('fallback');
    expect(recoverSession).toHaveBeenCalled();
    expect(logger).toHaveBeenCalledWith(
      expect.stringContaining(
        'ambiguous: Existing Chrome exposes multiple possible ChatGPT pages for the prior browser profile; refusing to guess.',
      ),
    );
  });

  test('describeReattachFailure formats classified errors', () => {
    const error = new ReattachFailure({
      kind: 'target-missing',
      message: 'Unable to locate the prior ChatGPT conversation in the expected browser profile.',
      chromePort: 51559,
      pageTargetCount: 3,
    });
    expect(describeReattachFailure(error)).toBe(
      'target-missing: Unable to locate the prior ChatGPT conversation in the expected browser profile. (port=51559, pageTargets=3)',
    );
  });

  test('falls back to recovery when existing chrome attach fails', async () => {
    const runtime = {
      chromePort: 51559,
      chromeHost: '127.0.0.1',
    };
    const listTargets = vi.fn(async () => {
      throw new Error('no targets');
    }) as unknown as () => Promise<FakeTarget[]>;
    const recoverSession = vi.fn(async () => ({
      answerText: 'fallback',
      answerMarkdown: 'fallback-md',
    }));
    const logger = vi.fn() as BrowserLogger;

    const result = await resumeBrowserSession(runtime, {}, logger, { listTargets, recoverSession });

    expect(result.answerText).toBe('fallback');
    expect(recoverSession).toHaveBeenCalled();
  });

  test('retries fresh devtools attach once after a successful liveness probe', async () => {
    const runtime = {
      chromePort: 51559,
      chromeHost: '127.0.0.1',
      tabUrl: 'https://chatgpt.com/c/demo',
    };
    const logger = vi.fn() as BrowserLogger;
    const launchChrome = vi.fn(async () => ({
      port: 51559,
      host: '127.0.0.1',
      launchedByAuracall: true,
      kill: async () => undefined,
    }));
    const connect = vi
      .fn()
      .mockRejectedValueOnce(new Error('connect ECONNREFUSED 127.0.0.1:51559'))
      .mockResolvedValueOnce({
        Runtime: {
          enable: vi.fn(),
          evaluate: vi.fn(async ({ expression }: { expression: string }) => {
            if (expression === 'location.href') {
              return { result: { type: 'string', value: runtime.tabUrl } };
            }
            return { result: { type: 'object', value: null } };
          }),
        },
        DOM: { enable: vi.fn() },
        Network: {},
        Page: {},
        close: vi.fn(async () => {}),
      } as any);
    const waitForAssistantResponse = vi.fn(async () => ({
      text: 'Recovered after retry',
      meta: { messageId: 'm1', turnId: 'conversation-turn-1' },
    }));
    const captureAssistantMarkdown = vi.fn(async () => 'Recovered after retry');
    const result = await resumeBrowserSessionCore(
      runtime,
        { manualLogin: true, manualLoginProfileDir: '/tmp/profile', target: 'chatgpt' } as any,
        logger,
        {
          listTargets: async () => [],
          waitForAssistantResponse,
          captureAssistantMarkdown,
          helpers: {
          pickTarget: (targets) => targets[0],
          extractConversationIdFromUrl: () => 'demo',
          buildConversationUrl: () => runtime.tabUrl,
          withTimeout: async (promise) => promise,
          openConversationFromSidebar: async () => true,
          openConversationFromSidebarWithRetry: async () => true,
          waitForLocationChange: async () => undefined,
          readConversationTurnIndex: async () => null,
          buildPromptEchoMatcher: () => null,
          recoverPromptEcho: async (_Runtime, answer) => answer as any,
          alignPromptEchoMarkdown: (text, markdown) => ({ answerText: text, answerMarkdown: markdown }),
        },
      },
      {
        resolveBrowserConfig: (config: any) => ({
          ...config,
          headless: false,
          hideWindow: true,
          keepBrowser: true,
          inputTimeoutMs: 60000,
          timeoutMs: 120000,
          url: 'https://chatgpt.com/',
          target: 'chatgpt',
        }),
        launchChrome: launchChrome as any,
        connectToChrome: connect as any,
        hideChromeWindow: async () => undefined,
        syncCookies: async () => 0,
        cleanupStaleProfileState: async () => undefined,
        navigateToChatGPT: async () => undefined,
        ensureNotBlocked: async () => undefined,
        ensureLoggedIn: async () => undefined,
        ensurePromptReady: async () => undefined,
        probeDevToolsResponsive: async () => true,
      },
    );

    expect(result.answerText).toBe('Recovered after retry');
    expect(connect).toHaveBeenCalledTimes(2);
    expect(logger).toHaveBeenCalledWith(
      expect.stringContaining(
        'Fresh DevTools connection failed (connect ECONNREFUSED 127.0.0.1:51559); retrying attach once after probe.',
      ),
    );
  });

  test('fresh reattach launch keeps the AuraCall runtime profile managed browser directory', async () => {
    const runtime = {
      chromePort: 45013,
      chromeHost: '127.0.0.1',
      tabUrl: 'https://chatgpt.com/c/demo',
      conversationId: 'demo',
    };
    const logger = vi.fn() as BrowserLogger;
    const launchChrome = vi.fn(async () => {
      throw new Error('stop-after-launch');
    });

    await expect(
      resumeBrowserSessionCore(
        runtime,
        {
          auracallProfileName: 'wsl-chrome-2',
          manualLogin: true,
          manualLoginProfileDir: '/tmp/auracall/browser-profiles/wsl-chrome-2/chatgpt',
          managedProfileRoot: '/tmp/auracall/browser-profiles',
          target: 'chatgpt',
          chromeProfile: 'Profile 1',
        } as any,
        logger,
        {
          listTargets: async () => [],
          waitForAssistantResponse: async () => ({ text: 'unused', meta: {} }),
          captureAssistantMarkdown: async () => 'unused',
          helpers: {
            pickTarget: (targets) => targets[0],
            extractConversationIdFromUrl: () => 'demo',
            buildConversationUrl: () => runtime.tabUrl,
            withTimeout: async (promise) => promise,
            openConversationFromSidebar: async () => true,
            openConversationFromSidebarWithRetry: async () => true,
            waitForLocationChange: async () => undefined,
            readConversationTurnIndex: async () => null,
            buildPromptEchoMatcher: () => null,
            recoverPromptEcho: async (_Runtime, answer) => answer as any,
            alignPromptEchoMarkdown: (text, markdown) => ({ answerText: text, answerMarkdown: markdown }),
          },
        },
        {
          resolveBrowserConfig: (config: any) => ({
            ...config,
            auracallProfileName: 'wsl-chrome-2',
            chromeProfile: 'Profile 1',
            manualLoginProfileDir: '/tmp/auracall/browser-profiles/wsl-chrome-2/chatgpt',
            managedProfileRoot: '/tmp/auracall/browser-profiles',
            headless: false,
            hideWindow: true,
            keepBrowser: true,
            inputTimeoutMs: 60000,
            timeoutMs: 120000,
            url: 'https://chatgpt.com/',
            target: 'chatgpt',
          }),
          launchChrome: launchChrome as any,
          connectToChrome: async () => {
            throw new Error('unreachable');
          },
          hideChromeWindow: async () => undefined,
          syncCookies: async () => 0,
          cleanupStaleProfileState: async () => undefined,
          navigateToChatGPT: async () => undefined,
          ensureNotBlocked: async () => undefined,
          ensureLoggedIn: async () => undefined,
          ensurePromptReady: async () => undefined,
          probeDevToolsResponsive: async () => true,
        },
      ),
    ).rejects.toThrow('stop-after-launch');

    expect(launchChrome).toHaveBeenCalledWith(
      expect.anything(),
      '/tmp/auracall/browser-profiles/wsl-chrome-2/chatgpt',
      logger,
    );
  });
});

describe('reattach helpers', () => {
  const { pickTarget, extractConversationIdFromUrl, buildConversationUrl, openConversationFromSidebar } = __test__;
  type EvaluateParams = { expression: string };
  type EvaluateResult<T> = { result: { value: T } };

  test('extracts conversation id from a chat URL', () => {
    expect(extractConversationIdFromUrl('https://chatgpt.com/c/abc-123')).toBe('abc-123');
    expect(extractConversationIdFromUrl('')).toBeNull();
  });

  test('builds conversation URL from tabUrl or conversationId', () => {
    expect(
      buildConversationUrl({ tabUrl: 'https://chatgpt.com/c/live', conversationId: 'ignored' }, 'https://chatgpt.com/'),
    ).toBe('https://chatgpt.com/c/live');
    expect(buildConversationUrl({ conversationId: 'abc' }, 'https://chatgpt.com/')).toBe('https://chatgpt.com/c/abc');
  });

  test('pickTarget prefers chromeTargetId, then tabUrl, then first page', () => {
    const targets = [
      { targetId: 't-1', type: 'page', url: 'https://chatgpt.com/c/first' },
      { targetId: 't-2', type: 'page', url: 'https://chatgpt.com/c/second' },
      { targetId: 't-3', type: 'page', url: 'about:blank' },
    ];
    expect(pickTarget(targets, { chromeTargetId: 't-2' })).toEqual(targets[1]);
    expect(pickTarget(targets, { tabUrl: 'https://chatgpt.com/c/first' })).toEqual(targets[0]);
    expect(pickTarget(targets, {})).toEqual(targets[0]);
  });

  test('openConversationFromSidebar passes conversationId and projects preference', async () => {
    const evaluate = vi.fn<
      (params: EvaluateParams) => Promise<EvaluateResult<{ ok: boolean; href?: string; count: number }>>
    >(async () => ({
      result: { value: { ok: true, href: 'https://chatgpt.com/c/abc', count: 3 } },
    }));
    const runtime = { evaluate } as unknown as ChromeClient['Runtime'];

    const ok = await openConversationFromSidebar(runtime, { conversationId: 'abc', preferProjects: true });

    expect(ok).toBe(true);
    const call = evaluate.mock.calls[0]?.[0] as EvaluateParams | undefined;
    expect(call?.expression).toContain('const conversationId = "abc"');
    expect(call?.expression).toContain('const preferProjects = true');
  });

  test('openConversationFromSidebar handles missing conversationId', async () => {
    const evaluate = vi.fn<(params: EvaluateParams) => Promise<EvaluateResult<{ ok: boolean; count: number }>>>(
      async () => ({
        result: { value: { ok: false, count: 0 } },
      }),
    );
    const runtime = { evaluate } as unknown as ChromeClient['Runtime'];

    const ok = await openConversationFromSidebar(runtime, { preferProjects: false });

    expect(ok).toBe(false);
    const call = evaluate.mock.calls[0]?.[0] as EvaluateParams | undefined;
    expect(call?.expression).toContain('const conversationId = null');
    expect(call?.expression).toContain('const preferProjects = false');
  });
});
