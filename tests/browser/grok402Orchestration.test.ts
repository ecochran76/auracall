// biome-ignore-all lint/style/useNamingConvention: CDP domain names retain platform spelling.
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import { setAuracallHomeDirOverrideForTest } from '../../src/auracallHome.js';

const boundary = vi.hoisted(() => ({
  events: [] as string[],
  select: vi.fn(async () => undefined),
  preserve: vi.fn(async () => 'Fast'),
  prompt: vi.fn(async () => undefined),
  submit: vi.fn(async () => undefined),
  connectionOptions: undefined as Record<string, unknown> | undefined,
  annotation: undefined as Record<string, unknown> | undefined,
}));
vi.mock('../../src/browser/actions/grok.js', () => ({
  navigateToGrok: async () => {
    boundary.events.push('navigate');
  },
  ensureGrokLoggedIn: async () => undefined,
  ensureGrokPromptReady: async () => undefined,
  selectGrokMode: boundary.select,
  verifyGrokCurrentModel: boundary.preserve,
  setGrokPrompt: boundary.prompt,
  submitGrokPrompt: boundary.submit,
  uploadGrokAttachments: async () => undefined,
  readGrokAssistantSnapshotForRuntime: async () => ({
    count: 0,
    lastText: '',
    lastMarkdown: '',
    lastHtml: '',
  }),
  waitForGrokAssistantResult: async () => ({ text: 'completed', markdown: 'completed' }),
}));
vi.mock('../../src/browser/pageActions.js', async (original) => ({
  ...(await original<typeof import('../../src/browser/pageActions.js')>()),
  ensureNotBlocked: async () => undefined,
  installJavaScriptDialogAutoDismissal: () => undefined,
}));
vi.mock('../../src/browser/providers/mutationAudit.js', async (original) => ({
  ...(await original<typeof import('../../src/browser/providers/mutationAudit.js')>()),
  annotateClientMutationContext: async (_client: unknown, context: Record<string, unknown>) => {
    boundary.annotation = context;
    boundary.events.push('authority');
  },
}));
vi.mock('../../src/browser/chromeLifecycle.js', async (original) => ({
  ...(await original<typeof import('../../src/browser/chromeLifecycle.js')>()),
  connectToRemoteChrome: async (
    _host: string,
    _port: number,
    _logger: unknown,
    _url: string,
    options: Record<string, unknown>,
  ) => {
    boundary.connectionOptions = options;
    return {
      targetId: 'grok-fixture-target',
      host: '127.0.0.1',
      port: 9222,
      client: {
        on: vi.fn(),
        close: vi.fn(),
        Input: {},
        Network: { enable: vi.fn() },
        Page: { enable: vi.fn() },
        Runtime: {
          enable: vi.fn(),
          evaluate: async ({ expression }: { expression: string }) => ({
            result: { value: expression === 'location.href' ? 'https://grok.com/c/fixture' : {} },
          }),
        },
      },
    };
  },
  closeRemoteChromeTarget: async () => undefined,
}));
import { runBrowserMode } from '../../src/browser/index.js';
const roots: string[] = [];
afterEach(async () => {
  setAuracallHomeDirOverrideForTest(null);
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  vi.clearAllMocks();
  boundary.events.length = 0;
  boundary.annotation = undefined;
  boundary.connectionOptions = undefined;
});

test('public Grok text preserves prompt boundaries and current model while attaching admission before effects', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'grok402-public-'));
  roots.push(root);
  setAuracallHomeDirOverrideForTest(root);
  const result = await runBrowserMode({
    tabAffinityUserConfig: {auracallProfile:"fixture",services:{grok:{identity:{email:"operator@example.test"}}}} as never,
    prompt: '  first\nlast  ',
    config: {
      target: 'grok',
      remoteChrome: { host: '127.0.0.1', port: 9222 },
      desiredModel: 'Heavy',
      modelStrategy: 'current',
      managedProfileRoot: path.join(root, 'profiles'),
    },
    log: vi.fn(),
  } as never);
  expect(result.answerText).toBe('completed');
  expect(boundary.prompt).toHaveBeenCalledWith(
    expect.anything(),
    expect.anything(),
    '  first\nlast  ',
  );
  expect(boundary.select).not.toHaveBeenCalled();
  expect(boundary.preserve).toHaveBeenCalledOnce();
  expect(boundary.connectionOptions).toMatchObject({
    providerTrafficRequired: true,
    providerTrafficAuthorityFactory: expect.anything(),
  });
  expect(boundary.annotation).toMatchObject({
    providerTrafficRequired: true,
    providerTrafficAuthorityFactory: expect.anything(),
  });
  expect(boundary.events).toEqual(['authority', 'navigate']);
  expect(boundary.submit).toHaveBeenCalledOnce();
});

test('Grok refuses to infer shared-account authority from partial direct-call configuration',async()=>{
 boundary.events.length=0;const {runBrowserMode}=await import('../../src/browser/index.js');
 await expect(runBrowserMode({prompt:'Fixture',config:{target:'grok',remoteChrome:{host:'127.0.0.1',port:9222}}})).rejects.toThrow('resolved account configuration');
 expect(boundary.events).not.toContain('navigate');
});
