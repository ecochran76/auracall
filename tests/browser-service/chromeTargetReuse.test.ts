import { afterEach, describe, expect, it, vi } from 'vitest';

const {
  client,
  cdpMock,
  resolveChromeEndpointMock,
} = vi.hoisted(() => {
  const client = {
    Browser: {
      getWindowForTarget: vi.fn(async ({ targetId }: { targetId: string }) => ({ windowId: 1 })),
      setWindowBounds: vi.fn(async () => undefined),
    },
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
      List: vi.fn(),
      New: vi.fn(),
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

vi.mock('../../packages/browser-service/src/windowsLoopbackRelay.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../packages/browser-service/src/windowsLoopbackRelay.js')>();
  return {
    ...actual,
    resolveChromeEndpoint: resolveChromeEndpointMock,
    isWindowsLoopbackRemoteHost: vi.fn(() => false),
  };
});

import {
  connectToRemoteChrome,
  openOrReuseChromeTarget,
} from '../../packages/browser-service/src/chromeLifecycle.js';
import { createInMemoryBrowserMutationLog } from '../../packages/browser-service/src/service/mutationDispatcher.js';

describe('chrome target reuse policy', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('reuses the most recent exact URL match before opening a new tab', async () => {
    cdpMock.List.mockResolvedValue([
      { id: 'older-grok', type: 'page', url: 'https://grok.com/' },
      { id: 'newer-grok', type: 'page', url: 'https://grok.com/' },
    ]);

    const result = await openOrReuseChromeTarget(45920, 'https://grok.com/', {
      host: '127.0.0.1',
      reusePolicy: 'same-origin',
    });

    expect(result).toMatchObject({
      reused: true,
      reason: 'exact',
      target: { id: 'newer-grok' },
    });
    expect(cdpMock).toHaveBeenCalledWith({ host: '127.0.0.1', port: 45920, target: 'newer-grok' });
    expect(client.Page.navigate).not.toHaveBeenCalled();
    expect(cdpMock.New).not.toHaveBeenCalled();
  });

  it('does not raise the tab when suppressFocus is enabled', async () => {
    cdpMock.List.mockResolvedValue([
      { id: 'newer-grok', type: 'page', url: 'https://grok.com/' },
    ]);

    await openOrReuseChromeTarget(45920, 'https://grok.com/', {
      host: '127.0.0.1',
      reusePolicy: 'same-origin',
      suppressFocus: true,
    });

    expect(client.Page.bringToFront).not.toHaveBeenCalled();
  });

  it('reuses an existing same-origin page when no exact or blank target exists', async () => {
    cdpMock.List.mockResolvedValue([
      { id: 'existing-project', type: 'page', url: 'https://grok.com/project/abc123' },
    ]);
    const mutationLog = createInMemoryBrowserMutationLog();

    const result = await openOrReuseChromeTarget(45920, 'https://grok.com/project/def456', {
      host: '127.0.0.1',
      reusePolicy: 'same-origin',
      mutationAudit: mutationLog.record,
      mutationSource: 'test:target-reuse',
    });

    expect(result).toMatchObject({
      reused: true,
      reason: 'same-origin',
      target: { id: 'existing-project' },
    });
    expect(client.Page.navigate).toHaveBeenCalledWith({ url: 'https://grok.com/project/def456' });
    expect(cdpMock.New).not.toHaveBeenCalled();
    expect(mutationLog.list()).toEqual([
      expect.objectContaining({
        phase: 'start',
        kind: 'target-open-or-reuse',
        source: 'test:target-reuse',
        requestedUrl: 'https://grok.com/project/def456',
        fromUrl: 'https://grok.com/project/abc123',
        reused: true,
        reason: 'same-origin',
        targetId: 'existing-project',
      }),
      expect.objectContaining({
        phase: 'complete',
        kind: 'target-open-or-reuse',
        source: 'test:target-reuse',
        toUrl: 'https://grok.com/project/def456',
        outcome: 'succeeded',
        reused: true,
        reason: 'same-origin',
        targetId: 'existing-project',
      }),
    ]);
  });

  it('reuses a compatible host family page when the service moved hosts', async () => {
    cdpMock.List.mockResolvedValue([
      { id: 'chat-openai-tab', type: 'page', url: 'https://chat.openai.com/c/abc123' },
    ]);

    const result = await openOrReuseChromeTarget(45920, 'https://chatgpt.com/', {
      host: '127.0.0.1',
      reusePolicy: 'same-origin',
      compatibleHosts: ['chatgpt.com', 'chat.openai.com'],
    });

    expect(result).toMatchObject({
      reused: true,
      reason: 'compatible-host',
      target: { id: 'chat-openai-tab' },
    });
    expect(client.Page.navigate).toHaveBeenCalledWith({ url: 'https://chatgpt.com/' });
    expect(cdpMock.New).not.toHaveBeenCalled();
  });

  it('opens a fresh tab when reusePolicy is new', async () => {
    cdpMock.List.mockResolvedValue([
      { id: 'existing-project', type: 'page', url: 'https://grok.com/project/abc123' },
    ]);
    cdpMock.New.mockResolvedValue({ id: 'fresh-tab', type: 'page', url: 'https://grok.com/project/def456' });
    const mutationLog = createInMemoryBrowserMutationLog();

    const result = await openOrReuseChromeTarget(45920, 'https://grok.com/project/def456', {
      host: '127.0.0.1',
      reusePolicy: 'new',
      mutationAudit: mutationLog.record,
      mutationSource: 'test:target-new',
    });

    expect(result).toMatchObject({
      reused: false,
      reason: 'new',
      target: { id: 'fresh-tab' },
    });
    expect(cdpMock.New).toHaveBeenCalledWith({
      host: '127.0.0.1',
      port: 45920,
      url: 'https://grok.com/project/def456',
    });
    expect(mutationLog.list()).toEqual([
      expect.objectContaining({
        phase: 'start',
        kind: 'target-open-or-reuse',
        source: 'test:target-new',
        requestedUrl: 'https://grok.com/project/def456',
        reused: false,
        reason: 'new',
      }),
      expect.objectContaining({
        phase: 'complete',
        kind: 'target-open-or-reuse',
        source: 'test:target-new',
        requestedUrl: 'https://grok.com/project/def456',
        toUrl: 'https://grok.com/project/def456',
        reused: false,
        reason: 'new',
        outcome: 'succeeded',
        targetId: 'fresh-tab',
      }),
    ]);
  });

  it('connectToRemoteChrome reuses same-origin tabs instead of creating duplicates', async () => {
    cdpMock.List.mockResolvedValue([
      { id: 'existing-project', type: 'page', url: 'https://grok.com/project/abc123' },
    ]);

    const connection = await connectToRemoteChrome('127.0.0.1', 45920, () => undefined, 'https://grok.com/project/def456');

    expect(cdpMock.New).not.toHaveBeenCalled();
    expect(cdpMock).toHaveBeenCalledWith({ host: '127.0.0.1', port: 45920, target: 'existing-project' });
    expect(connection.targetId).toBe('existing-project');
  });

  it('connectToRemoteChrome reuses compatible-host tabs instead of opening a sibling host tab', async () => {
    cdpMock.List.mockResolvedValue([
      { id: 'chat-openai-tab', type: 'page', url: 'https://chat.openai.com/c/abc123' },
    ]);

    const connection = await connectToRemoteChrome('127.0.0.1', 45920, () => undefined, 'https://chatgpt.com/', {
      compatibleHosts: ['chatgpt.com', 'chat.openai.com'],
    });

    expect(cdpMock.New).not.toHaveBeenCalled();
    expect(cdpMock).toHaveBeenCalledWith({ host: '127.0.0.1', port: 45920, target: 'chat-openai-tab' });
    expect(connection.targetId).toBe('chat-openai-tab');
  });

  it('closes older matching-family tabs beyond the default cap while keeping the selected tab', async () => {
    cdpMock.List.mockResolvedValue([
      { id: 'older-1', type: 'page', url: 'https://grok.com/project/a' },
      { id: 'older-2', type: 'page', url: 'https://grok.com/project/b' },
      { id: 'keep-1', type: 'page', url: 'https://grok.com/project/c' },
      { id: 'selected', type: 'page', url: 'https://grok.com/project/d' },
    ]);
    client.Browser.getWindowForTarget.mockImplementation(async ({ targetId }: { targetId: string }) => ({
      windowId: 1,
    }));

    await openOrReuseChromeTarget(45920, 'https://grok.com/project/d', {
      host: '127.0.0.1',
      reusePolicy: 'same-origin',
    });

    expect(cdpMock.Close).toHaveBeenCalledTimes(1);
    expect(cdpMock.Close).toHaveBeenCalledWith({ host: '127.0.0.1', port: 45920, id: 'older-1' });
  });

  it('respects an explicit matching-tab cap override', async () => {
    cdpMock.List.mockResolvedValue([
      { id: 'older-1', type: 'page', url: 'https://grok.com/project/a' },
      { id: 'older-2', type: 'page', url: 'https://grok.com/project/b' },
      { id: 'selected', type: 'page', url: 'https://grok.com/project/c' },
    ]);
    client.Browser.getWindowForTarget.mockImplementation(async () => ({ windowId: 1 }));

    await openOrReuseChromeTarget(45920, 'https://grok.com/project/c', {
      host: '127.0.0.1',
      reusePolicy: 'same-origin',
      matchingTabLimit: 2,
    });

    expect(cdpMock.Close).toHaveBeenCalledTimes(1);
    expect(cdpMock.Close).toHaveBeenCalledWith({ host: '127.0.0.1', port: 45920, id: 'older-1' });
  });

  it('closes extra blank tabs beyond the default cap', async () => {
    cdpMock.List.mockResolvedValue([
      { id: 'blank-1', type: 'page', url: 'about:blank' },
      { id: 'blank-2', type: 'page', url: 'about:blank' },
      { id: 'blank-3', type: 'page', url: 'about:blank' },
    ]);
    client.Browser.getWindowForTarget.mockImplementation(async ({ targetId }: { targetId: string }) => ({
      windowId: 1,
    }));

    await openOrReuseChromeTarget(45920, 'https://grok.com/', {
      host: '127.0.0.1',
      reusePolicy: 'same-origin',
    });

    expect(cdpMock.Close).toHaveBeenCalledTimes(2);
    expect(cdpMock.Close).toHaveBeenNthCalledWith(1, { host: '127.0.0.1', port: 45920, id: 'blank-1' });
    expect(cdpMock.Close).toHaveBeenNthCalledWith(2, { host: '127.0.0.1', port: 45920, id: 'blank-2' });
  });

  it('closes an extra disposable window for the same profile while preserving the selected window', async () => {
    cdpMock.List.mockResolvedValue([
      { id: 'selected', type: 'page', url: 'https://grok.com/project/current' },
      { id: 'other-window-tab', type: 'page', url: 'https://grok.com/project/old' },
      { id: 'other-window-blank', type: 'page', url: 'about:blank' },
    ]);
    client.Browser.getWindowForTarget.mockImplementation(async ({ targetId }: { targetId: string }) => ({
      windowId: targetId === 'selected' ? 1 : 2,
    }));

    await openOrReuseChromeTarget(45920, 'https://grok.com/project/current', {
      host: '127.0.0.1',
      reusePolicy: 'same-origin',
    });

    expect(cdpMock.Close).toHaveBeenCalledTimes(2);
    expect(cdpMock.Close).toHaveBeenCalledWith({ host: '127.0.0.1', port: 45920, id: 'other-window-tab' });
    expect(cdpMock.Close).toHaveBeenCalledWith({ host: '127.0.0.1', port: 45920, id: 'other-window-blank' });
  });

  it('does not close an extra window if it contains a non-disposable tab', async () => {
    cdpMock.List.mockResolvedValue([
      { id: 'selected', type: 'page', url: 'https://grok.com/project/current' },
      { id: 'unrelated', type: 'page', url: 'https://example.com/docs' },
      { id: 'other-window-grok', type: 'page', url: 'https://grok.com/project/old' },
    ]);
    client.Browser.getWindowForTarget.mockImplementation(async ({ targetId }: { targetId: string }) => ({
      windowId: targetId === 'selected' ? 1 : 2,
    }));

    await openOrReuseChromeTarget(45920, 'https://grok.com/project/current', {
      host: '127.0.0.1',
      reusePolicy: 'same-origin',
    });

    expect(cdpMock.Close).not.toHaveBeenCalled();
  });

  it('skips disposable window cleanup when collapseDisposableWindows is false', async () => {
    cdpMock.List.mockResolvedValue([
      { id: 'selected', type: 'page', url: 'https://grok.com/project/current' },
      { id: 'other-window-tab', type: 'page', url: 'https://grok.com/project/old' },
      { id: 'other-window-blank', type: 'page', url: 'about:blank' },
    ]);
    client.Browser.getWindowForTarget.mockImplementation(async ({ targetId }: { targetId: string }) => ({
      windowId: targetId === 'selected' ? 1 : 2,
    }));

    await openOrReuseChromeTarget(45920, 'https://grok.com/project/current', {
      host: '127.0.0.1',
      reusePolicy: 'same-origin',
      collapseDisposableWindows: false,
    });

    expect(cdpMock.Close).not.toHaveBeenCalled();
  });
});
