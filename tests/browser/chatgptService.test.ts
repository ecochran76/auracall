import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LlmService } from '../../src/browser/llmService/llmService.js';
import { BrowserService } from '../../src/browser/service/browserService.js';
import type { ResolvedUserConfig } from '../../src/config.js';

const providerRunPrompt = vi.hoisted(() =>
  vi.fn(async (input: { conversationId?: string | null; targetUrl?: string | null }) => ({
    text: '',
    conversationId: input.conversationId ?? 'chatgpt-conversation-1',
    url: input.targetUrl ?? 'https://chatgpt.com/c/chatgpt-conversation-1',
    tabTargetId: 'chatgpt-tab-1',
    devtoolsHost: '127.0.0.1',
    devtoolsPort: 45011,
  })),
);

vi.mock('../../src/browser/providers/index.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/browser/providers/index.js')>();
  return {
    ...original,
    getProvider: (id: 'chatgpt' | 'gemini' | 'grok') => {
      const provider = original.getProvider(id);
      return id === 'chatgpt' ? { ...provider, runPrompt: providerRunPrompt } : provider;
    },
  };
});

const tempRoots: string[] = [];

afterEach(async () => {
  for (const root of tempRoots.splice(0)) {
    await rm(root, { recursive: true, force: true, maxRetries: 2 });
  }
  providerRunPrompt.mockClear();
  vi.restoreAllMocks();
});

describe('ChatGPT llm service', () => {
  it('passes ChatGPT image capability intent to the provider adapter', async () => {
    stubBrowserServiceTarget();
    const { ChatgptService } = await import(
      '../../src/browser/llmService/providers/chatgptService.js'
    );
    const service = ChatgptService.create({
      browser: {
        target: 'chatgpt',
        modelStrategy: 'select',
        composerTool: 'deep-research',
      },
    } as ResolvedUserConfig);

    await service.runPrompt({
      prompt: 'Generate an image of an asphalt secret agent',
      capabilityId: 'chatgpt.media.create_image',
      completionMode: 'prompt_submitted',
    });

    expect(providerRunPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        capabilityId: 'chatgpt.media.create_image',
        modelStrategy: undefined,
      }),
      expect.objectContaining({ browserService: expect.any(Object) }),
    );
  });

  it('passes configured account identity into ChatGPT browser runs', async () => {
    stubBrowserServiceTarget();
    const { ChatgptService } = await import(
      '../../src/browser/llmService/providers/chatgptService.js'
    );
    const service = ChatgptService.create({
      auracallProfile: 'wsl-chrome-2',
      services: {
        chatgpt: {
          identity: {
            email: 'consult@polymerconsultinggroup.com',
            accountLevel: 'Pro',
          },
        },
      },
      browser: {
        target: 'chatgpt',
        modelStrategy: 'select',
      },
    } as ResolvedUserConfig);

    await service.runPrompt({
      prompt: 'Say ok',
      completionMode: 'prompt_submitted',
    });

    expect(providerRunPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: 'Say ok' }),
      expect.objectContaining({
        providerSessionAuthorization: expect.objectContaining({
          expectation: expect.objectContaining({
            configuredIdentity: expect.objectContaining({
              email: 'consult@polymerconsultinggroup.com',
              accountLevel: 'Pro',
            }),
            configuredServiceAccountId:
              'service-account:chatgpt:consult@polymerconsultinggroup.com',
          }),
        }),
      }),
    );
  });

  it('passes prompt attachments into ChatGPT browser runs', async () => {
    stubBrowserServiceTarget();
    const { ChatgptService } = await import(
      '../../src/browser/llmService/providers/chatgptService.js'
    );
    const service = ChatgptService.create({
      browser: {
        target: 'chatgpt',
      },
    } as ResolvedUserConfig);

    await service.runPrompt({
      prompt: 'Continue with attached context.',
      completionMode: 'prompt_submitted',
      attachments: [{ path: '/tmp/handoff.txt', displayPath: 'handoff.txt', sizeBytes: 42 }],
    });

    expect(providerRunPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'Continue with attached context.',
        attachments: [{ path: '/tmp/handoff.txt', displayPath: 'handoff.txt', sizeBytes: 42 }],
      }),
      expect.any(Object),
    );
  });

  it('submits handoff compact context and selected files through the ChatGPT browser adapter', async () => {
    stubBrowserServiceTarget();
    const root = await tempRoot('auracall-chatgpt-handoff-adapter-');
    const selectedPath = path.join(root, 'handoff-context.txt');
    await writeFile(selectedPath, 'selected handoff context', 'utf8');
    const {
      approveHandoffTargetSubmit,
      approveHandoffTargetUpload,
      prepareCrossServiceHandoffPacket,
      recoverHandoffLive,
    } = await import('../../src/handoff/service.js');
    const { createChatgptBrowserHandoffTargetAdapter } = await import(
      '../../src/handoff/chatgptBrowserAdapter.js'
    );
    const prepared = await prepareCrossServiceHandoffPacket({
      config: fixtureConfig(),
      outputRoot: root,
      handoffId: 'chatgpt-browser-adapter-fixture',
      sourceProvider: 'gemini',
      sourceRuntimeProfile: 'target-gemini',
      sourceRef: 'https://gemini.google.com/app/source',
      targetProvider: 'chatgpt',
      targetRuntimeProfile: 'target-pro',
      targetRef: 'https://chatgpt.com/c/target-chatgpt-handoff',
      targetModelSelector: 'chatgpt:pro-extended',
      sourceContext: { messages: [{ role: 'user', content: 'handoff adapter' }] },
      sourceManifest: {
        items: [manifestItemFixture({ id: 'chatgpt_attachment', localPath: selectedPath })],
      },
      generatedAt: '2026-06-07T14:00:00.000Z',
    });
    const adapter = createChatgptBrowserHandoffTargetAdapter({
      auracallProfile: 'target-pro',
      browser: {
        target: 'chatgpt',
        keepBrowser: true,
      },
      runtimeProfiles: fixtureConfig().runtimeProfiles,
    } as ResolvedUserConfig);

    await approveHandoffTargetUpload({
      handoffId: 'chatgpt-browser-adapter-fixture',
      outputRoot: root,
      packageDigest: prepared.targetPackage.packageDigest,
    });
    const uploadRecovery = await recoverHandoffLive({
      handoffId: 'chatgpt-browser-adapter-fixture',
      outputRoot: root,
      generatedAt: '2026-06-07T14:01:00.000Z',
      targetAdapter: adapter,
    });
    expect(uploadRecovery.recovery).toMatchObject({
      executor: 'provider_native_file_prompt_adapter',
      executedAction: 'upload',
      status: 'recovered',
    });
    const uploadJson = JSON.parse(
      await readFile(
        path.join(root, 'chatgpt-browser-adapter-fixture', 'target', 'upload-result.json'),
        'utf8',
      ),
    );
    expect(uploadJson).toMatchObject({
      status: 'uploaded',
      rows: [
        expect.objectContaining({
          sourceManifestItemId: 'chatgpt_attachment',
          providerFileId: expect.stringMatching(/^chatgpt-prompt-attachment-[a-f0-9]{32}$/),
        }),
      ],
    });

    await approveHandoffTargetSubmit({
      handoffId: 'chatgpt-browser-adapter-fixture',
      outputRoot: root,
      packageDigest: prepared.targetPackage.packageDigest,
    });
    const submitRecovery = await recoverHandoffLive({
      handoffId: 'chatgpt-browser-adapter-fixture',
      outputRoot: root,
      generatedAt: '2026-06-07T14:02:00.000Z',
      targetAdapter: adapter,
    });

    expect(providerRunPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        completionMode: 'prompt_submitted',
        prompt: expect.stringContaining('## Compact Context JSON'),
        attachments: [
          expect.objectContaining({
            path: path.join(
              root,
              'chatgpt-browser-adapter-fixture',
              'target',
              'selected-files',
              '001-Selected_file-chatgpt_attachment',
            ),
            displayPath: '001-Selected_file-chatgpt_attachment',
          }),
        ],
        conversationId: 'target-chatgpt-handoff',
        targetUrl: 'https://chatgpt.com/c/target-chatgpt-handoff',
        desiredModel: 'GPT-5.6 Sol',
        thinkingTime: 'extended',
        modelStrategy: 'select',
      }),
      expect.any(Object),
    );
    expect(submitRecovery).toMatchObject({
      recovery: {
        executor: 'provider_native_file_prompt_adapter',
        executedAction: 'submit',
        status: 'recovered',
      },
      afterResumePlan: {
        nextAction: 'complete',
      },
    });
  });
});

function stubBrowserServiceTarget(): void {
  const promptGuard = LlmService.prototype as unknown as {
    enforceProviderGuard: (action: string) => Promise<void>;
    noteProviderGuardSuccess: (action: string) => Promise<void>;
  };
  vi.spyOn(promptGuard, 'enforceProviderGuard').mockResolvedValue(undefined);
  vi.spyOn(promptGuard, 'noteProviderGuardSuccess').mockResolvedValue(undefined);
  vi.spyOn(BrowserService.prototype, 'resolveServiceTarget').mockResolvedValue({
    host: '127.0.0.1',
    port: 45011,
    browserProfile: 'default',
    sourceBrowserProfile: 'Default',
    managedBrowserProfile: '/managed/default/chatgpt',
    browserProcessId: 1234,
    tab: {
      targetId: 'chatgpt-tab-1',
      url: 'https://chatgpt.com/',
    },
  } as never);
  vi.spyOn(BrowserService.prototype, 'getMutationAuditSink').mockReturnValue(undefined as never);
}

async function tempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}

function fixtureConfig(): Record<string, unknown> {
  return {
    runtimeProfiles: {
      'target-gemini': {
        browserProfile: 'gemini-browser',
        services: {
          gemini: {
            identity: {
              email: 'source@example.com',
            },
          },
        },
      },
      'target-pro': {
        browserProfile: 'pro-browser',
        services: {
          chatgpt: {
            identity: {
              email: 'target@example.com',
              accountPlanType: 'pro',
            },
          },
        },
      },
    },
  };
}

function manifestItemFixture(overrides: Partial<{ id: string; localPath: string | null }> = {}): {
  id: string;
  kind: 'file';
  title: string;
  localPath: string | null;
  archiveItemId: null;
  sourceRef: null;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
  materializationMethod: null;
  importanceHint: number;
} {
  return {
    id: overrides.id ?? 'selected',
    kind: 'file',
    title: 'Selected file',
    localPath: Object.hasOwn(overrides, 'localPath')
      ? (overrides.localPath ?? null)
      : '/tmp/selected.txt',
    archiveItemId: null,
    sourceRef: null,
    mimeType: 'text/plain',
    sizeBytes: 10,
    checksumSha256: 'e'.repeat(64),
    materializationMethod: null,
    importanceHint: 1,
  };
}
