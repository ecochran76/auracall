import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ResolvedUserConfig } from '../../src/config.js';

const runBrowserMode = vi.fn(async () => ({
  answerMarkdown: '',
  answerText: '',
  conversationId: 'chatgpt-conversation-1',
  tabUrl: 'https://chatgpt.com/c/chatgpt-conversation-1',
  chromeTargetId: 'chatgpt-tab-1',
  chromeHost: '127.0.0.1',
  chromePort: 45011,
}));

vi.mock('../../src/browser/index.js', () => ({
  runBrowserMode,
}));

const tempRoots: string[] = [];

afterEach(async () => {
  for (const root of tempRoots.splice(0)) {
    await rm(root, { recursive: true, force: true, maxRetries: 2 });
  }
  runBrowserMode.mockClear();
});

describe('ChatGPT llm service', () => {
  it('skips model switching for ChatGPT image media runs before selecting Create image', async () => {
    const { ChatgptService } = await import('../../src/browser/llmService/providers/chatgptService.js');
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

    expect(runBrowserMode).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          target: 'chatgpt',
          modelStrategy: 'ignore',
          composerTool: 'create image',
        }),
      }),
    );
  });

  it('passes configured account identity into ChatGPT browser runs', async () => {
    runBrowserMode.mockClear();
    const { ChatgptService } = await import('../../src/browser/llmService/providers/chatgptService.js');
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

    expect(runBrowserMode).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          expectedUserIdentity: expect.objectContaining({
            email: 'consult@polymerconsultinggroup.com',
            accountLevel: 'Pro',
          }),
          expectedServiceAccountId: 'service-account:chatgpt:consult@polymerconsultinggroup.com',
        }),
      }),
    );
  });

  it('passes prompt attachments into ChatGPT browser runs', async () => {
    const { ChatgptService } = await import('../../src/browser/llmService/providers/chatgptService.js');
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

    expect(runBrowserMode).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'Continue with attached context.',
        attachments: [{ path: '/tmp/handoff.txt', displayPath: 'handoff.txt', sizeBytes: 42 }],
      }),
    );
  });

  it('submits handoff compact context and selected files through the ChatGPT browser adapter', async () => {
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

    expect(runBrowserMode).toHaveBeenCalledWith(
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
        config: expect.objectContaining({
          target: 'chatgpt',
          conversationId: 'target-chatgpt-handoff',
          chatgptUrl: 'https://chatgpt.com/c/target-chatgpt-handoff',
          desiredModel: 'Pro',
          thinkingTime: 'extended',
          modelStrategy: 'select',
        }),
      }),
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

function manifestItemFixture(
  overrides: Partial<{ id: string; localPath: string | null }> = {},
): {
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
    localPath: Object.hasOwn(overrides, 'localPath') ? (overrides.localPath ?? null) : '/tmp/selected.txt',
    archiveItemId: null,
    sourceRef: null,
    mimeType: 'text/plain',
    sizeBytes: 10,
    checksumSha256: 'e'.repeat(64),
    materializationMethod: null,
    importanceHint: 1,
  };
}
