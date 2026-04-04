import { afterEach, describe, expect, it, vi } from 'vitest';

const {
  bootstrapManagedProfileMock,
  runBrowserLoginCoreMock,
  registerInstanceMock,
  findChromePidUsingUserDataDirMock,
  findWindowsChromePidUsingTasklistMock,
} = vi.hoisted(() => ({
  bootstrapManagedProfileMock: vi.fn(async () => ({
    cloned: false,
    reseeded: false,
    skippedReason: null,
  })),
  runBrowserLoginCoreMock: vi.fn(async () => undefined),
  registerInstanceMock: vi.fn(async () => undefined),
  findChromePidUsingUserDataDirMock: vi.fn(async () => 1234),
  findWindowsChromePidUsingTasklistMock: vi.fn(async () => undefined),
}));

vi.mock('../../src/browser/profileStore.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/browser/profileStore.js')>();
  return {
    ...actual,
    bootstrapManagedProfile: bootstrapManagedProfileMock,
    resolveManagedProfileCookieExportPath: (dir: string) => `${dir}/cookies.json`,
  };
});

vi.mock('../../packages/browser-service/src/login.js', () => ({
  runBrowserLogin: runBrowserLoginCoreMock,
}));

vi.mock('../../src/browser/service/stateRegistry.js', () => ({
  registerInstance: registerInstanceMock,
}));

vi.mock('../../src/browser/processCheck.js', () => ({
  findChromePidUsingUserDataDir: findChromePidUsingUserDataDirMock,
  findWindowsChromePidUsingTasklist: findWindowsChromePidUsingTasklistMock,
}));

describe('Gemini browser login', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('wires a Gemini signed-out probe into cookie export', async () => {
    const { runBrowserLogin } = await import('../../src/browser/login.js');

    await runBrowserLogin({
      target: 'gemini',
      chromePath: '/usr/bin/google-chrome',
      chromeProfile: 'Default',
      manualLoginProfileDir: '/home/ecochran76/.auracall/browser-profiles/wsl-chrome-2/gemini',
      cookiePath: '/home/ecochran76/.config/google-chrome/Default/Cookies',
      exportCookies: true,
    });

    expect(runBrowserLoginCoreMock).toHaveBeenCalledWith(
      expect.objectContaining({
        loginLabel: 'gemini',
        exportCookies: true,
        cookieExport: expect.objectContaining({
          requiredCookies: ['__Secure-1PSID', '__Secure-1PSIDTS'],
          signedOutProbe: expect.objectContaining({
            errorMessage: expect.stringContaining('visible Sign in state'),
            expression: expect.stringContaining('sign in'),
          }),
          signedOutRecovery: expect.objectContaining({
            attemptLimit: 1,
            graceMs: 20_000,
            expression: expect.stringContaining('candidate.click'),
          }),
        }),
      }),
    );
  });
});
