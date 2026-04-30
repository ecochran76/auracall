import { afterEach, describe, expect, it, vi } from 'vitest';

const {
  client,
  cdpMock,
  resolveChromeEndpointMock,
} = vi.hoisted(() => {
  const client = {
    // biome-ignore lint/style/useNamingConvention: mirrors DevTools protocol domain names.
    Browser: {
      getWindowForTarget: vi.fn(async () => ({ windowId: 1 })),
      setWindowBounds: vi.fn(async () => undefined),
    },
    // biome-ignore lint/style/useNamingConvention: mirrors DevTools protocol domain names.
    Page: {
      enable: vi.fn(async () => undefined),
      navigate: vi.fn(async () => undefined),
      bringToFront: vi.fn(async () => undefined),
    },
    close: vi.fn(async () => undefined),
  };

  const cdpMock = Object.assign(
    vi.fn(async () => client),
    {
      // biome-ignore lint/style/useNamingConvention: chrome-remote-interface static API uses PascalCase.
      List: vi.fn(),
      // biome-ignore lint/style/useNamingConvention: chrome-remote-interface static API uses PascalCase.
      New: vi.fn(),
      // biome-ignore lint/style/useNamingConvention: chrome-remote-interface static API uses PascalCase.
      Close: vi.fn(),
    },
  );

  const resolveChromeEndpointMock = vi.fn(async () => ({
    host: '127.0.0.1',
    port: 45920,
    dispose: vi.fn(async () => undefined),
  }));

  return {
    client,
    cdpMock,
    resolveChromeEndpointMock,
  };
});

vi.mock('chrome-remote-interface', () => ({
  default: cdpMock,
}));

vi.mock('../../packages/browser-service/src/windowsLoopbackRelay.js', () => ({
  resolveChromeEndpoint: resolveChromeEndpointMock,
}));

import { openLoginUrl } from '../../packages/browser-service/src/manualLogin.js';

describe('manual login tab reuse', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('reuses an existing matching page target', async () => {
    cdpMock.List.mockResolvedValue([
      { id: 'existing-grok', type: 'page', url: 'https://grok.com/' },
    ]);

    await openLoginUrl('windows-loopback', 45920, 'https://grok.com/');

    expect(cdpMock.List).toHaveBeenCalledWith({ host: '127.0.0.1', port: 45920 });
    expect(cdpMock).toHaveBeenCalledWith({ host: '127.0.0.1', port: 45920, target: 'existing-grok' });
    expect(client.Page.navigate).not.toHaveBeenCalled();
    expect(cdpMock.New).not.toHaveBeenCalled();
  });

  it('navigates an existing about:blank page instead of opening a new tab', async () => {
    cdpMock.List.mockResolvedValue([
      { id: 'blank-tab', type: 'page', url: 'about:blank' },
    ]);

    await openLoginUrl('windows-loopback', 45920, 'https://grok.com/');

    expect(cdpMock).toHaveBeenCalledWith({ host: '127.0.0.1', port: 45920, target: 'blank-tab' });
    expect(client.Page.navigate).toHaveBeenCalledWith({ url: 'https://grok.com/' });
    expect(cdpMock.New).not.toHaveBeenCalled();
  });

  it('opens a new tab when no reusable page target exists', async () => {
    cdpMock.List.mockResolvedValue([
      { id: 'worker-1', type: 'service_worker', url: 'chrome-extension://abc/background.js' },
    ]);

    await openLoginUrl('windows-loopback', 45920, 'https://grok.com/');

    expect(cdpMock.New).toHaveBeenCalledWith({ host: '127.0.0.1', port: 45920, url: 'https://grok.com/' });
  });

  it('reuses an existing same-origin page before opening a fresh login tab', async () => {
    cdpMock.List.mockResolvedValue([
      { id: 'existing-project', type: 'page', url: 'https://grok.com/project/abc123' },
    ]);

    await openLoginUrl('windows-loopback', 45920, 'https://grok.com/');

    expect(cdpMock).toHaveBeenCalledWith({ host: '127.0.0.1', port: 45920, target: 'existing-project' });
    expect(client.Page.navigate).toHaveBeenCalledWith({ url: 'https://grok.com/' });
    expect(cdpMock.New).not.toHaveBeenCalled();
  });

  it('reuses a compatible ChatGPT host before opening a new login tab', async () => {
    cdpMock.List.mockResolvedValue([
      { id: 'chat-openai-tab', type: 'page', url: 'https://chat.openai.com/c/abc123' },
    ]);

    await openLoginUrl('windows-loopback', 45920, 'https://chatgpt.com/', {
      compatibleHosts: ['chatgpt.com', 'chat.openai.com'],
    });

    expect(cdpMock).toHaveBeenCalledWith({ host: '127.0.0.1', port: 45920, target: 'chat-openai-tab' });
    expect(client.Page.navigate).toHaveBeenCalledWith({ url: 'https://chatgpt.com/' });
    expect(cdpMock.New).not.toHaveBeenCalled();
  });
});
