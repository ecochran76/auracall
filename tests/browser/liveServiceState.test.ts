import { describe, expect, it } from 'vitest';
import {
  probeChatgptBrowserServiceState,
  probeGeminiBrowserServiceState,
  probeGrokBrowserServiceState,
} from '../../src/browser/liveServiceState.js';

function createRuntime(values: Array<unknown>) {
  const queue = [...values];
  return {
    enable: async () => undefined,
    evaluate: async () => ({
      result: {
        value: queue.shift(),
      },
    }),
  };
}

describe('probeChatgptBrowserServiceState', () => {
  it('returns thinking when the placeholder assistant turn is visible', async () => {
    const runtime = createRuntime([
      { hasCaptcha: false, loginRequired: false },
      'ChatGPT said:Thinking',
    ]);
    const result = await probeChatgptBrowserServiceState(
      {
        auracallProfile: 'default',
        services: {
          chatgpt: {
            url: 'https://chatgpt.com/',
          },
        },
      } as never,
      {
        createBrowserService: () =>
          ({
            resolveServiceTarget: async () => ({
              host: '127.0.0.1',
              port: 9222,
              tab: { targetId: 'tab-1' },
            }),
          }) as never,
        connectToTarget: async () =>
          ({
            Runtime: runtime,
            close: async () => undefined,
          }) as never,
      },
    );

    expect(result).toMatchObject({
      state: 'thinking',
      source: 'provider-adapter',
      evidenceRef: 'chatgpt-placeholder-turn',
      confidence: 'high',
    });
  });

  it('returns response-incoming while assistant text exists and stop is visible', async () => {
    const runtime = createRuntime([
      { hasCaptcha: false, loginRequired: false },
      null,
      { text: 'Partial answer', turnIndex: 3 },
      true,
    ]);
    const result = await probeChatgptBrowserServiceState(
      {
        auracallProfile: 'default',
        services: {
          chatgpt: {
            url: 'https://chatgpt.com/',
          },
        },
      } as never,
      {
        createBrowserService: () =>
          ({
            resolveServiceTarget: async () => ({
              host: '127.0.0.1',
              port: 9222,
              tab: { targetId: 'tab-1' },
            }),
          }) as never,
        connectToTarget: async () =>
          ({
            Runtime: runtime,
            close: async () => undefined,
          }) as never,
      },
    );

    expect(result).toMatchObject({
      state: 'response-incoming',
      source: 'provider-adapter',
      evidenceRef: 'chatgpt-streaming-visible',
      confidence: 'high',
    });
  });

  it('returns login-required when the probe lands on an auth surface', async () => {
    const runtime = createRuntime([{ hasCaptcha: false, loginRequired: true }]);
    const result = await probeChatgptBrowserServiceState(
      {
        auracallProfile: 'default',
        services: {
          chatgpt: {
            url: 'https://chatgpt.com/',
          },
        },
      } as never,
      {
        createBrowserService: () =>
          ({
            resolveServiceTarget: async () => ({
              host: '127.0.0.1',
              port: 9222,
              tab: { targetId: 'tab-1' },
            }),
          }) as never,
        connectToTarget: async () =>
          ({
            Runtime: runtime,
            close: async () => undefined,
          }) as never,
      },
    );

    expect(result).toMatchObject({
      state: 'login-required',
      source: 'provider-adapter',
      evidenceRef: 'chatgpt-login-surface',
      confidence: 'high',
    });
  });
});

describe('probeGeminiBrowserServiceState', () => {
  it('returns thinking when the prompt is committed into Gemini history without answer text yet', async () => {
    const runtime = createRuntime([
      { blocked: false, loginRequired: false },
      {
        historyText: 'Compare merge sort and quicksort in 6 bullet points',
        promptText: '',
        sendReady: false,
        hasPendingBlob: false,
        hasRemoveButton: false,
      },
    ]);

    const result = await probeGeminiBrowserServiceState(
      {
        auracallProfile: 'auracall-gemini-pro',
        services: {
          gemini: {
            url: 'https://gemini.google.com/app',
          },
        },
      } as never,
      { prompt: 'Compare merge sort and quicksort in 6 bullet points' },
      {
        createBrowserService: () =>
          ({
            resolveServiceTarget: async () => ({
              host: '127.0.0.1',
              port: 9222,
              tab: { targetId: 'gemini-tab-1' },
            }),
          }) as never,
        connectToTarget: async () =>
          ({
            Runtime: runtime,
            close: async () => undefined,
          }) as never,
      },
    );

    expect(result).toMatchObject({
      state: 'thinking',
      source: 'provider-adapter',
      evidenceRef: 'gemini-native-prompt-committed',
      confidence: 'medium',
    });
  });

  it('returns thinking when Gemini exposes the active avatar spinner', async () => {
    const runtime = createRuntime([
      { blocked: false, loginRequired: false },
      {
        historyText: 'Generate an image of an asphalt secret agent',
        promptText: '',
        sendReady: false,
        hasPendingBlob: false,
        hasRemoveButton: false,
        hasActiveAvatarSpinner: true,
        hasGeneratedMedia: false,
        hasStopControl: true,
        isGenerating: true,
      },
    ]);

    const result = await probeGeminiBrowserServiceState(
      {
        auracallProfile: 'auracall-gemini-pro',
        services: {
          gemini: {
            url: 'https://gemini.google.com/app',
          },
        },
      } as never,
      { prompt: 'Generate an image of an asphalt secret agent' },
      {
        createBrowserService: () =>
          ({
            resolveServiceTarget: async () => ({
              host: '127.0.0.1',
              port: 9222,
              tab: { targetId: 'gemini-tab-1' },
            }),
          }) as never,
        connectToTarget: async () =>
          ({
            Runtime: runtime,
            close: async () => undefined,
          }) as never,
      },
    );

    expect(result).toMatchObject({
      state: 'thinking',
      source: 'provider-adapter',
      evidenceRef: 'gemini-active-avatar-spinner',
      confidence: 'high',
    });
  });

  it('returns response-incoming when answer text is visible before Gemini looks complete', async () => {
    const runtime = createRuntime([
      { blocked: false, loginRequired: false },
      {
        historyText:
          'Compare merge sort and quicksort in 6 bullet points Gemini is stable and predictable during merging.',
        promptText: '',
        sendReady: false,
        hasPendingBlob: false,
        hasRemoveButton: false,
      },
    ]);

    const result = await probeGeminiBrowserServiceState(
      {
        auracallProfile: 'auracall-gemini-pro',
        services: {
          gemini: {
            url: 'https://gemini.google.com/app',
          },
        },
      } as never,
      { prompt: 'Compare merge sort and quicksort in 6 bullet points' },
      {
        createBrowserService: () =>
          ({
            resolveServiceTarget: async () => ({
              host: '127.0.0.1',
              port: 9222,
              tab: { targetId: 'gemini-tab-1' },
            }),
          }) as never,
        connectToTarget: async () =>
          ({
            Runtime: runtime,
            close: async () => undefined,
          }) as never,
      },
    );

    expect(result).toMatchObject({
      state: 'response-incoming',
      source: 'provider-adapter',
      evidenceRef: 'gemini-native-answer-visible',
      confidence: 'high',
    });
  });

  it('does not treat a stale Gemini stop control as active once media is visible', async () => {
    const runtime = createRuntime([
      { blocked: false, loginRequired: false },
      {
        historyText:
          'Generate an image of an asphalt secret agent A rendered asphalt secret agent image is visible.',
        promptText: '',
        sendReady: true,
        hasPendingBlob: false,
        hasRemoveButton: false,
        hasActiveAvatarSpinner: false,
        hasGeneratedMedia: true,
        hasStopControl: true,
        isGenerating: false,
      },
    ]);

    const result = await probeGeminiBrowserServiceState(
      {
        auracallProfile: 'auracall-gemini-pro',
        services: {
          gemini: {
            url: 'https://gemini.google.com/app',
          },
        },
      } as never,
      { prompt: 'Generate an image of an asphalt secret agent' },
      {
        createBrowserService: () =>
          ({
            resolveServiceTarget: async () => ({
              host: '127.0.0.1',
              port: 9222,
              tab: { targetId: 'gemini-tab-1' },
            }),
          }) as never,
        connectToTarget: async () =>
          ({
            Runtime: runtime,
            close: async () => undefined,
          }) as never,
      },
    );

    expect(result).toMatchObject({
      state: 'response-complete',
      source: 'provider-adapter',
      evidenceRef: 'gemini-native-response-finished',
      confidence: 'medium',
    });
  });

  it('returns response-complete when answer text is visible and Gemini looks quiescent', async () => {
    const runtime = createRuntime([
      { blocked: false, loginRequired: false },
      {
        historyText:
          'Compare merge sort and quicksort in 6 bullet points Gemini is stable and predictable during merging.',
        promptText: '',
        sendReady: true,
        hasPendingBlob: false,
        hasRemoveButton: false,
      },
    ]);

    const result = await probeGeminiBrowserServiceState(
      {
        auracallProfile: 'auracall-gemini-pro',
        services: {
          gemini: {
            url: 'https://gemini.google.com/app',
          },
        },
      } as never,
      { prompt: 'Compare merge sort and quicksort in 6 bullet points' },
      {
        createBrowserService: () =>
          ({
            resolveServiceTarget: async () => ({
              host: '127.0.0.1',
              port: 9222,
              tab: { targetId: 'gemini-tab-1' },
            }),
          }) as never,
        connectToTarget: async () =>
          ({
            Runtime: runtime,
            close: async () => undefined,
          }) as never,
      },
    );

    expect(result).toMatchObject({
      state: 'response-complete',
      source: 'provider-adapter',
      evidenceRef: 'gemini-native-response-finished',
      confidence: 'medium',
    });
  });

  it('returns login-required when Gemini is on a signed-out surface', async () => {
    const runtime = createRuntime([{ blocked: false, loginRequired: true }]);

    const result = await probeGeminiBrowserServiceState(
      {
        auracallProfile: 'auracall-gemini-pro',
        services: {
          gemini: {
            url: 'https://gemini.google.com/app',
          },
        },
      } as never,
      { prompt: 'hello' },
      {
        createBrowserService: () =>
          ({
            resolveServiceTarget: async () => ({
              host: '127.0.0.1',
              port: 9222,
              tab: { targetId: 'gemini-tab-1' },
            }),
          }) as never,
        connectToTarget: async () =>
          ({
            Runtime: runtime,
            close: async () => undefined,
          }) as never,
      },
    );

    expect(result).toMatchObject({
      state: 'login-required',
      source: 'provider-adapter',
      evidenceRef: 'gemini-login-surface',
      confidence: 'high',
    });
  });
});

describe('probeGrokBrowserServiceState', () => {
  it('returns response-incoming when Grok assistant text is visible', async () => {
    const runtime = createRuntime([
      { blocked: false, loginRequired: false },
      {
        count: 1,
        lastText: 'Partial Grok answer',
        lastMarkdown: 'Partial Grok answer',
        lastHtml: '<p>Partial Grok answer</p>',
        toastText: '',
      },
    ]);

    const result = await probeGrokBrowserServiceState(
      {
        auracallProfile: 'auracall-grok-auto',
        services: {
          grok: {
            url: 'https://grok.com/',
          },
        },
      } as never,
      {
        createBrowserService: () =>
          ({
            resolveServiceTarget: async () => ({
              host: '127.0.0.1',
              port: 9222,
              tab: { targetId: 'grok-tab-1' },
            }),
          }) as never,
        connectToTarget: async () =>
          ({
            Runtime: runtime,
            close: async () => undefined,
          }) as never,
      },
    );

    expect(result).toMatchObject({
      state: 'response-incoming',
      source: 'provider-adapter',
      evidenceRef: 'grok-assistant-visible',
      confidence: 'high',
    });
  });

  it('returns provider-error when Grok shows a visible rate-limit toast', async () => {
    const runtime = createRuntime([
      { blocked: false, loginRequired: false },
      {
        count: 0,
        lastText: '',
        lastMarkdown: '',
        lastHtml: '',
        toastText: 'Query limit reached for Auto. Try again in 4 minutes.',
      },
    ]);

    const result = await probeGrokBrowserServiceState(
      {
        auracallProfile: 'auracall-grok-auto',
        services: {
          grok: {
            url: 'https://grok.com/',
          },
        },
      } as never,
      {
        createBrowserService: () =>
          ({
            resolveServiceTarget: async () => ({
              host: '127.0.0.1',
              port: 9222,
              tab: { targetId: 'grok-tab-1' },
            }),
          }) as never,
        connectToTarget: async () =>
          ({
            Runtime: runtime,
            close: async () => undefined,
          }) as never,
      },
    );

    expect(result).toMatchObject({
      state: 'provider-error',
      source: 'provider-adapter',
      evidenceRef: 'grok-rate-limit-toast',
      confidence: 'high',
    });
  });

  it('returns login-required when Grok is on a signed-out surface', async () => {
    const runtime = createRuntime([{ blocked: false, loginRequired: true }]);

    const result = await probeGrokBrowserServiceState(
      {
        auracallProfile: 'auracall-grok-auto',
        services: {
          grok: {
            url: 'https://grok.com/',
          },
        },
      } as never,
      {
        createBrowserService: () =>
          ({
            resolveServiceTarget: async () => ({
              host: '127.0.0.1',
              port: 9222,
              tab: { targetId: 'grok-tab-1' },
            }),
          }) as never,
        connectToTarget: async () =>
          ({
            Runtime: runtime,
            close: async () => undefined,
          }) as never,
      },
    );

    expect(result).toMatchObject({
      state: 'login-required',
      source: 'provider-adapter',
      evidenceRef: 'grok-login-surface',
      confidence: 'high',
    });
  });
});
