import { afterEach, describe, expect, it, vi } from 'vitest';

const {
  client,
  cdpMock,
  resolveChromeEndpointMock,
} = vi.hoisted(() => {
  const client = {
    Network: {
      enable: vi.fn(async () => undefined),
      getCookies: vi.fn(async () => ({ cookies: [] })),
    },
    Runtime: {
      enable: vi.fn(async () => undefined),
      evaluate: vi.fn(async () => ({ result: { value: false } })),
    },
    close: vi.fn(async () => undefined),
  };

  const cdpMock = vi.fn(async () => client);
  const resolveChromeEndpointMock = vi.fn(async () => ({
    host: '127.0.0.1',
    port: 45000,
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

describe('exportCookiesFromCdp', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns cookies when required names are present', async () => {
    const { exportCookiesFromCdp } = await import('../../packages/browser-service/src/loginHelpers.js');

    client.Network.getCookies.mockResolvedValueOnce({
      cookies: [
        { name: '__Secure-1PSID', value: 'psid', domain: '.google.com', path: '/' } as never,
        { name: '__Secure-1PSIDTS', value: 'psidts', domain: '.google.com', path: '/' } as never,
      ],
    });

    const cookies = await exportCookiesFromCdp({
      port: 45000,
      host: '127.0.0.1',
      urls: ['https://gemini.google.com', 'https://accounts.google.com'],
      requiredNames: ['__Secure-1PSID', '__Secure-1PSIDTS'],
      timeoutMs: 1_000,
    });

    expect(cookies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: '__Secure-1PSID', value: 'psid' }),
        expect.objectContaining({ name: '__Secure-1PSIDTS', value: 'psidts' }),
      ]),
    );
    expect(client.Runtime.evaluate).not.toHaveBeenCalled();
  });

  it('throws the signed-out probe error before timing out', async () => {
    const { exportCookiesFromCdp } = await import('../../packages/browser-service/src/loginHelpers.js');

    client.Network.getCookies.mockResolvedValue({
      cookies: [],
    });
    client.Runtime.evaluate.mockResolvedValue({
      result: { value: true },
    });

    await expect(
      exportCookiesFromCdp({
        port: 45000,
        host: '127.0.0.1',
        urls: ['https://gemini.google.com', 'https://accounts.google.com'],
        requiredNames: ['__Secure-1PSID', '__Secure-1PSIDTS'],
        timeoutMs: 1_000,
        signedOutProbe: {
          expression: '(() => true)()',
          errorMessage: 'Gemini login required; visible Sign in state detected.',
        },
      }),
    ).rejects.toThrow('Gemini login required; visible Sign in state detected.');

    expect(client.Runtime.evaluate).toHaveBeenCalledWith({
      expression: '(() => true)()',
      returnByValue: true,
    });
  });

  it('attempts one signed-out recovery action before failing', async () => {
    const { exportCookiesFromCdp } = await import('../../packages/browser-service/src/loginHelpers.js');

    client.Network.getCookies.mockResolvedValue({
      cookies: [],
    });
    client.Runtime.evaluate
      .mockResolvedValueOnce({ result: { value: true } })
      .mockResolvedValueOnce({ result: { value: true } })
      .mockResolvedValueOnce({ result: { value: true } });

    await expect(
      exportCookiesFromCdp({
        port: 45000,
        host: '127.0.0.1',
        urls: ['https://gemini.google.com', 'https://accounts.google.com'],
        requiredNames: ['__Secure-1PSID', '__Secure-1PSIDTS'],
        timeoutMs: 25_000,
        signedOutProbe: {
          expression: '(() => true)()',
          errorMessage: 'Gemini login required; visible Sign in state detected.',
        },
        signedOutRecovery: {
          expression: '(() => true)()',
          attemptLimit: 1,
          graceMs: 0,
        },
      }),
    ).rejects.toThrow('Gemini login required; visible Sign in state detected.');

    expect(client.Runtime.evaluate).toHaveBeenNthCalledWith(1, {
      expression: '(() => true)()',
      returnByValue: true,
    });
    expect(client.Runtime.evaluate).toHaveBeenNthCalledWith(2, {
      expression: '(() => true)()',
      returnByValue: true,
    });
    expect(client.Runtime.evaluate).toHaveBeenNthCalledWith(3, {
      expression: '(() => true)()',
      returnByValue: true,
    });
  });
});
