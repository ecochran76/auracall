import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserPassiveObservation, BrowserRunOptions } from '../src/browser/types.js';
import { createConfiguredStoredStepExecutor } from '../src/runtime/configuredExecutor.js';
import { readLiveRuntimeRunServiceState, resetLiveRuntimeRunServiceStateRegistryForTests } from '../src/runtime/liveServiceStateRegistry.js';
import { AURACALL_STEP_OUTPUT_CONTRACT_VERSION } from '../src/runtime/stepOutputContract.js';

describe('configured stored-step executor', () => {
  beforeEach(() => {
    resetLiveRuntimeRunServiceStateRegistryForTests();
  });

  it('executes a Grok browser-backed step from runtime-profile config and returns response output', async () => {
    const runBrowserModeImpl = vi.fn(async (_options) => ({
      answerText: 'AURACALL_TEAM_SMOKE_OK',
      answerMarkdown: 'AURACALL_TEAM_SMOKE_OK',
      tookMs: 1200,
      answerTokens: 17,
      answerChars: 22,
      tabUrl: 'https://grok.com/c/mock-conversation',
      conversationId: 'mock-conversation',
    }));

    const executeStoredRunStep = createConfiguredStoredStepExecutor(
      {
        browser: {
          chromePath: '/usr/bin/google-chrome',
          chromeProfile: 'Default',
          chromeCookiePath: '/tmp/source/Cookies',
          bootstrapCookiePath: '/tmp/source/Cookies',
          managedProfileRoot: '/tmp/auracall/browser-profiles',
        },
        services: {
          grok: {
            url: 'https://grok.com/',
          },
        },
        runtimeProfiles: {
          'auracall-grok-auto': {
            engine: 'browser',
            defaultService: 'grok',
            browserProfile: 'default',
            browser: {
              hideWindow: true,
            },
            services: {
              grok: {
                model: 'Auto',
                projectId: 'project_123',
                manualLoginProfileDir: '/tmp/auracall/browser-profiles/default/grok',
              },
            },
          },
        },
      },
      { runBrowserModeImpl },
    );

    const result = await executeStoredRunStep?.({
      record: {
        runId: 'teamrun_1',
        revision: 1,
        bundle: {
          run: {
            id: 'teamrun_1',
          },
        },
      } as never,
      step: {
        id: 'teamrun_1:step:1',
        agentId: 'auracall-orchestrator',
        runtimeProfileId: 'auracall-grok-auto',
        browserProfileId: 'default',
        service: 'grok',
        input: {
          prompt: 'Reply exactly with AURACALL_TEAM_SMOKE_OK',
          artifacts: [],
          structuredData: {},
          notes: [],
        },
      } as never,
    });

    expect(runBrowserModeImpl).toHaveBeenCalledTimes(1);
    expect(runBrowserModeImpl.mock.calls[0]?.[0]).toMatchObject({
      prompt: 'Reply exactly with AURACALL_TEAM_SMOKE_OK',
      browserOperationOwnerCommand: 'response-run:teamrun_1:auracall-orchestrator',
      config: {
        auracallProfileName: 'default',
        target: 'grok',
        projectId: 'project_123',
        desiredModel: 'Auto',
        modelStrategy: 'select',
      },
    });
    expect(result).toMatchObject({
      output: {
        summary: 'AURACALL_TEAM_SMOKE_OK',
        notes: ['browser conversation: https://grok.com/c/mock-conversation'],
        structuredData: {
          browserRun: {
            provider: 'grok',
            service: 'grok',
            conversationId: 'mock-conversation',
            tabUrl: 'https://grok.com/c/mock-conversation',
            runtimeProfileId: 'auracall-grok-auto',
            browserProfileId: 'default',
            agentId: 'auracall-orchestrator',
            projectId: 'project_123',
            configuredUrl: 'https://grok.com/',
            desiredModel: 'Auto',
            cachePath: null,
            cachePathStatus: 'unavailable',
            cachePathReason: 'provider cache identity is not resolved during stored-step execution',
          },
        },
      },
      sharedState: {
        structuredOutputs: [
          {
            key: 'response.output',
          },
        ],
      },
    });
    expect(result?.sharedState?.structuredOutputs?.[0]?.value).toEqual([
      {
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'output_text',
            text: 'AURACALL_TEAM_SMOKE_OK',
          },
        ],
      },
    ]);
  });

  it('extracts one bounded local shell action request from a JSON tool envelope', async () => {
    const runBrowserModeImpl = vi.fn(async () => ({
      answerText: JSON.stringify({
        localActionRequests: [
          {
            actionType: 'shell',
            command: 'node',
            args: ['-e', "process.stdout.write('tool-ok')"],
            structuredPayload: {
              cwd: process.cwd(),
            },
          },
        ],
      }),
      answerMarkdown: JSON.stringify({
        localActionRequests: [
          {
            actionType: 'shell',
            command: 'node',
            args: ['-e', "process.stdout.write('tool-ok')"],
            structuredPayload: {
              cwd: process.cwd(),
            },
          },
        ],
      }),
      tookMs: 1200,
      answerTokens: 17,
      answerChars: 22,
      tabUrl: 'https://grok.com/c/mock-conversation',
      conversationId: 'mock-conversation',
    }));

    const executeStoredRunStep = createConfiguredStoredStepExecutor(
      {
        browser: {
          chromePath: '/usr/bin/google-chrome',
          chromeProfile: 'Default',
          chromeCookiePath: '/tmp/source/Cookies',
          bootstrapCookiePath: '/tmp/source/Cookies',
          managedProfileRoot: '/tmp/auracall/browser-profiles',
        },
        services: {
          grok: {
            url: 'https://grok.com/',
          },
        },
        runtimeProfiles: {
          'auracall-grok-auto': {
            engine: 'browser',
            defaultService: 'grok',
            browserProfile: 'default',
            browser: {
              hideWindow: true,
            },
            services: {
              grok: {
                model: 'Auto',
                projectId: 'project_123',
                manualLoginProfileDir: '/tmp/auracall/browser-profiles/default/grok',
              },
            },
          },
        },
      },
      { runBrowserModeImpl },
    );

    const result = await executeStoredRunStep?.({
      record: {
        runId: 'teamrun_tool_1',
        revision: 1,
        bundle: {
          run: {
            id: 'teamrun_tool_1',
          },
        },
      } as never,
      step: {
        id: 'teamrun_tool_1:step:1',
        agentId: 'auracall-tool-requester',
        runtimeProfileId: 'auracall-grok-auto',
        browserProfileId: 'default',
        service: 'grok',
        input: {
          prompt: 'Emit one bounded tool envelope.',
          artifacts: [],
          structuredData: {},
          notes: [],
        },
      } as never,
    });

    expect(result?.output?.structuredData.localActionRequests).toEqual([
      {
        kind: 'shell',
        summary: 'Run bounded shell action: node',
        command: 'node',
        args: ['-e', "process.stdout.write('tool-ok')"],
        structuredPayload: {
          cwd: process.cwd(),
        },
        notes: [],
      },
    ]);
  });

  it('enforces opt-in AuraCall step output contract for browser-backed steps', async () => {
    const runBrowserModeImpl = vi.fn(async () => ({
      answerText: JSON.stringify({
        version: AURACALL_STEP_OUTPUT_CONTRACT_VERSION,
        status: 'needs_local_action',
        routing: { action: 'local_action' },
        message: { markdown: 'Need one host command.' },
        localActionRequests: [
          {
            kind: 'shell',
            summary: 'Print contract token',
            command: 'node',
            args: ['-e', "process.stdout.write('contract-ok')"],
            structuredPayload: {
              cwd: process.cwd(),
            },
          },
        ],
        artifacts: [],
        handoffs: [],
      }),
      answerMarkdown: JSON.stringify({
        version: AURACALL_STEP_OUTPUT_CONTRACT_VERSION,
        status: 'needs_local_action',
        routing: { action: 'local_action' },
        message: { markdown: 'Need one host command.' },
        localActionRequests: [
          {
            kind: 'shell',
            summary: 'Print contract token',
            command: 'node',
            args: ['-e', "process.stdout.write('contract-ok')"],
            structuredPayload: {
              cwd: process.cwd(),
            },
          },
        ],
        artifacts: [],
        handoffs: [],
      }),
      tookMs: 1200,
      answerTokens: 21,
      answerChars: 331,
      tabUrl: 'https://grok.com/c/contract-conversation',
      conversationId: 'contract-conversation',
    }));

    const executeStoredRunStep = createConfiguredStoredStepExecutor(
      {
        browser: {
          chromePath: '/usr/bin/google-chrome',
          chromeProfile: 'Default',
          chromeCookiePath: '/tmp/source/Cookies',
          bootstrapCookiePath: '/tmp/source/Cookies',
          managedProfileRoot: '/tmp/auracall/browser-profiles',
        },
        services: {
          grok: {
            url: 'https://grok.com/',
          },
        },
        runtimeProfiles: {
          'auracall-grok-auto': {
            engine: 'browser',
            defaultService: 'grok',
            browserProfile: 'default',
            browser: {
              hideWindow: true,
            },
            services: {
              grok: {
                model: 'Auto',
                projectId: 'project_123',
                manualLoginProfileDir: '/tmp/auracall/browser-profiles/default/grok',
              },
            },
          },
        },
      },
      { runBrowserModeImpl },
    );

    const result = await executeStoredRunStep?.({
      record: {
        runId: 'teamrun_contract_1',
        revision: 1,
        bundle: {
          run: {
            id: 'teamrun_contract_1',
          },
        },
      } as never,
      step: {
        id: 'teamrun_contract_1:step:1',
        agentId: 'auracall-contract-agent',
        runtimeProfileId: 'auracall-grok-auto',
        browserProfileId: 'default',
        service: 'grok',
        input: {
          prompt: 'Use the contract.',
          artifacts: [],
          structuredData: {
            responseShape: {
              contract: AURACALL_STEP_OUTPUT_CONTRACT_VERSION,
            },
          },
          notes: [],
        },
      } as never,
    });

    expect(runBrowserModeImpl).toHaveBeenCalledTimes(1);
    const browserOptions = (runBrowserModeImpl as unknown as { mock: { calls: Array<[{ prompt: string }]> } }).mock
      .calls[0]?.[0];
    expect(browserOptions?.prompt).toContain(`version "${AURACALL_STEP_OUTPUT_CONTRACT_VERSION}"`);
    expect(browserOptions?.prompt).toContain('User assignment:\nUse the contract.');
    expect(result?.output).toMatchObject({
      summary: 'Need one host command.',
      structuredData: {
        routing: { action: 'local_action' },
        localActionRequests: [
          {
            kind: 'shell',
            summary: 'Print contract token',
            command: 'node',
            args: ['-e', "process.stdout.write('contract-ok')"],
            structuredPayload: {
              cwd: process.cwd(),
            },
          },
        ],
        browserRun: {
          provider: 'grok',
          conversationId: 'contract-conversation',
        },
      },
    });
    expect(result?.sharedState?.structuredOutputs).toContainEqual({
      key: 'response.output',
      value: [
        {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'Need one host command.' }],
        },
      ],
    });
  });

  it('executes a Gemini browser-backed step through the Gemini web executor path', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-gemini-executor-'));
    const managedProfileDir = path.join(tmpDir, 'browser-profiles', 'default', 'gemini');
    await fs.mkdir(managedProfileDir, { recursive: true });
    await fs.writeFile(
      path.join(managedProfileDir, 'cookies.json'),
      JSON.stringify([
        { name: '__Secure-1PSID', value: 'psid', domain: '.google.com', path: '/' },
        { name: '__Secure-1PSIDTS', value: 'psidts', domain: '.google.com', path: '/' },
      ]),
      'utf8',
    );

    const runBrowserModeImpl = vi.fn(async () => {
      throw new Error('chatgpt/grok executor should not be used for Gemini');
    });
    const runGeminiBrowserModeImpl = vi.fn(async (_options) => ({
      answerText: 'AURACALL_GEMINI_TEAM_SMOKE_OK',
      answerMarkdown: 'AURACALL_GEMINI_TEAM_SMOKE_OK',
      tookMs: 900,
      answerTokens: 12,
      answerChars: 29,
      conversationId: 'mock-conversation',
      tabUrl: 'https://gemini.google.com/app',
    }));

    const executeStoredRunStep = createConfiguredStoredStepExecutor(
      {
        browserProfiles: {
          default: {
            chromePath: '/usr/bin/google-chrome',
            sourceProfileName: 'Default',
            sourceCookiePath: '/tmp/source/Cookies',
            bootstrapCookiePath: '/tmp/source/Cookies',
            managedProfileRoot: '/tmp/auracall/browser-profiles',
          },
        },
        services: {
          gemini: {
            url: 'https://gemini.google.com/app',
          },
        },
        runtimeProfiles: {
          'auracall-gemini-pro': {
            engine: 'browser',
            defaultService: 'gemini',
            browserProfile: 'default',
            browser: {
              hideWindow: true,
            },
            services: {
              gemini: {
                model: 'Gemini 3 Pro',
                manualLoginProfileDir: managedProfileDir,
              },
            },
          },
        },
      },
      { runBrowserModeImpl, runGeminiBrowserModeImpl },
    );

    const result = await executeStoredRunStep?.({
      record: {
        runId: 'teamrun_gemini_1',
        revision: 1,
        bundle: {
          run: {
            id: 'teamrun_gemini_1',
          },
        },
      } as never,
      step: {
        id: 'teamrun_gemini_1:step:1',
        agentId: 'auracall-gemini-tool-requester',
        runtimeProfileId: 'auracall-gemini-pro',
        browserProfileId: 'default',
        service: 'gemini',
        input: {
          prompt: 'Reply exactly with AURACALL_GEMINI_TEAM_SMOKE_OK',
          artifacts: [],
          structuredData: {},
          notes: [],
        },
      } as never,
    });

    expect(runGeminiBrowserModeImpl).toHaveBeenCalledTimes(1);
    expect(runBrowserModeImpl).not.toHaveBeenCalled();
    expect(runGeminiBrowserModeImpl.mock.calls[0]?.[0]).toMatchObject({
      prompt: 'Reply exactly with AURACALL_GEMINI_TEAM_SMOKE_OK',
      config: {
        auracallProfileName: 'default',
        target: 'gemini',
        desiredModel: 'Gemini 3 Pro',
        modelStrategy: 'select',
        chromeProfile: 'Default',
        chromeCookiePath: '/tmp/source/Cookies',
        bootstrapCookiePath: '/tmp/source/Cookies',
        inlineCookiesSource: 'scoped:cookies.json',
      },
    });
    expect(runGeminiBrowserModeImpl.mock.calls[0]?.[0]?.config?.inlineCookies).toMatchObject([
      { name: '__Secure-1PSID', value: 'psid' },
      { name: '__Secure-1PSIDTS', value: 'psidts' },
    ]);
    expect(result?.output?.summary).toBe('AURACALL_GEMINI_TEAM_SMOKE_OK');
    expect(result?.output?.structuredData?.browserRun).toMatchObject({
      provider: 'gemini',
      conversationId: 'mock-conversation',
      tabUrl: 'https://gemini.google.com/app',
      service: 'gemini',
      runtimeProfileId: 'auracall-gemini-pro',
      browserProfileId: 'default',
      agentId: 'auracall-gemini-tool-requester',
      configuredUrl: 'https://gemini.google.com/app',
      desiredModel: 'Gemini 3 Pro',
      cachePath: null,
      cachePathStatus: 'unavailable',
    });
  });

  it('publishes transient Gemini live thinking state while the browser-backed executor is in flight', async () => {
    let resolveGeminiRun: ((value: {
      answerText: string;
      answerMarkdown: string;
      tookMs: number;
      answerTokens: number;
      answerChars: number;
    }) => void) | null = null;
    const runGeminiBrowserModeImpl = vi.fn(
      () =>
        new Promise<{
          answerText: string;
          answerMarkdown: string;
          tookMs: number;
          answerTokens: number;
          answerChars: number;
        }>((resolve) => {
          resolveGeminiRun = resolve;
        }),
    );

    const executeStoredRunStep = createConfiguredStoredStepExecutor(
      {
        browserProfiles: {
          default: {},
        },
        runtimeProfiles: {
          'auracall-gemini-pro': {
            engine: 'browser',
            defaultService: 'gemini',
            browserProfile: 'default',
          },
        },
      },
      { runGeminiBrowserModeImpl },
    );
    if (!executeStoredRunStep) {
      throw new Error('expected configured stored-step executor to be defined');
    }

    const executionPromise = executeStoredRunStep({
      record: {
        runId: 'teamrun_gemini_live_1',
        revision: 1,
        bundle: {
          run: {
            id: 'teamrun_gemini_live_1',
          },
        },
      } as never,
      step: {
        id: 'teamrun_gemini_live_1:step:1',
        agentId: 'auracall-gemini-finisher',
        runtimeProfileId: 'auracall-gemini-pro',
        browserProfileId: 'default',
        service: 'gemini',
        input: {
          prompt: 'Reply exactly with AURACALL_GEMINI_LIVE_STATE_OK',
          artifacts: [],
          structuredData: {},
          notes: [],
        },
      } as never,
    });

    await vi.waitFor(() => {
      expect(
        readLiveRuntimeRunServiceState({
          runId: 'teamrun_gemini_live_1',
          stepId: 'teamrun_gemini_live_1:step:1',
          service: 'gemini',
        }),
      ).toMatchObject({
        state: 'thinking',
        source: 'browser-service',
        evidenceRef: 'gemini-web-request-started',
        confidence: 'medium',
      });
    });

    const settleGeminiRun = resolveGeminiRun as
      | ((value: {
          answerText: string;
          answerMarkdown: string;
          tookMs: number;
          answerTokens: number;
          answerChars: number;
        }) => void)
      | null;
    if (!settleGeminiRun) {
      throw new Error('Gemini browser run resolver was not captured');
    }
    settleGeminiRun({
      answerText: 'AURACALL_GEMINI_LIVE_STATE_OK',
      answerMarkdown: 'AURACALL_GEMINI_LIVE_STATE_OK',
      tookMs: 250,
      answerTokens: 8,
      answerChars: 30,
    });

    await executionPromise;

    expect(
      readLiveRuntimeRunServiceState({
        runId: 'teamrun_gemini_live_1',
        stepId: 'teamrun_gemini_live_1:step:1',
        service: 'gemini',
      }),
    ).toBeNull();
  });

  it('publishes transient Grok live thinking state while the browser-backed executor is in flight', async () => {
    let resolveGrokRun: ((value: {
      answerText: string;
      answerMarkdown: string;
      tookMs: number;
      answerTokens: number;
      answerChars: number;
    }) => void) | null = null;
    const runBrowserModeImpl = vi.fn(
      () =>
        new Promise<{
          answerText: string;
          answerMarkdown: string;
          tookMs: number;
          answerTokens: number;
          answerChars: number;
        }>((resolve) => {
          resolveGrokRun = resolve;
        }),
    );

    const executeStoredRunStep = createConfiguredStoredStepExecutor(
      {
        browserProfiles: {
          default: {},
        },
        runtimeProfiles: {
          'auracall-grok-auto': {
            engine: 'browser',
            defaultService: 'grok',
            browserProfile: 'default',
          },
        },
      },
      { runBrowserModeImpl },
    );
    if (!executeStoredRunStep) {
      throw new Error('expected configured stored-step executor to be defined');
    }

    const executionPromise = executeStoredRunStep({
      record: {
        runId: 'teamrun_grok_live_1',
        revision: 1,
        bundle: {
          run: {
            id: 'teamrun_grok_live_1',
          },
        },
      } as never,
      step: {
        id: 'teamrun_grok_live_1:step:1',
        agentId: 'auracall-grok-finisher',
        runtimeProfileId: 'auracall-grok-auto',
        browserProfileId: 'default',
        service: 'grok',
        input: {
          prompt: 'Reply exactly with AURACALL_GROK_LIVE_STATE_OK',
          artifacts: [],
          structuredData: {},
          notes: [],
        },
      } as never,
    });

    await vi.waitFor(() => {
      expect(
        readLiveRuntimeRunServiceState({
          runId: 'teamrun_grok_live_1',
          stepId: 'teamrun_grok_live_1:step:1',
          service: 'grok',
        }),
      ).toMatchObject({
        state: 'thinking',
        source: 'browser-service',
        evidenceRef: 'grok-prompt-submitted',
        confidence: 'medium',
      });
    });

    const settleGrokRun = resolveGrokRun as
      | ((value: {
          answerText: string;
          answerMarkdown: string;
          tookMs: number;
          answerTokens: number;
          answerChars: number;
        }) => void)
      | null;
    if (!settleGrokRun) {
      throw new Error('Grok browser run resolver was not captured');
    }
    settleGrokRun({
      answerText: 'AURACALL_GROK_LIVE_STATE_OK',
      answerMarkdown: 'AURACALL_GROK_LIVE_STATE_OK',
      tookMs: 250,
      answerTokens: 8,
      answerChars: 28,
    });

    await executionPromise;

    expect(
      readLiveRuntimeRunServiceState({
        runId: 'teamrun_grok_live_1',
        stepId: 'teamrun_grok_live_1:step:1',
        service: 'grok',
      }),
    ).toBeNull();
  });

  it('persists ChatGPT passive observations from browser execution metadata', async () => {
    const passiveObservations: BrowserPassiveObservation[] = [
      {
        state: 'thinking',
        source: 'browser-service',
        observedAt: '2026-04-15T21:20:00.000Z',
        evidenceRef: 'Thinking about response',
        confidence: 'medium',
      },
      {
        state: 'response-incoming',
        source: 'browser-service',
        observedAt: '2026-04-15T21:20:04.000Z',
        evidenceRef: 'chatgpt-assistant-snapshot',
        confidence: 'high',
      },
      {
        state: 'response-complete',
        source: 'browser-service',
        observedAt: '2026-04-15T21:20:07.000Z',
        evidenceRef: 'chatgpt-response-finished',
        confidence: 'high',
      },
    ];
    const runBrowserModeImpl = vi.fn(async () => ({
      answerText: 'AURACALL_CHATGPT_OBS_OK',
      answerMarkdown: 'AURACALL_CHATGPT_OBS_OK',
      tookMs: 800,
      answerTokens: 9,
      answerChars: 24,
      tabUrl: 'https://chatgpt.com/c/mock-chatgpt-observation',
      conversationId: 'mock-chatgpt-observation',
      chatgptDeepResearchStage: 'plan-edit-opened',
      chatgptDeepResearchPlanAction: 'edit',
      chatgptDeepResearchStartMethod: null,
      chatgptDeepResearchModifyPlanLabel: 'Update',
      chatgptDeepResearchModifyPlanVisible: true,
      chatgptDeepResearchReviewEvidence: {
        stage: 'plan-edit-opened',
        screenshotPath: '/tmp/deep-research-review.png',
      },
      passiveObservations,
    }));

    const executeStoredRunStep = createConfiguredStoredStepExecutor(
      {
        browserProfiles: {
          default: {
            chromePath: '/usr/bin/google-chrome',
            sourceProfileName: 'Default',
            sourceCookiePath: '/tmp/source/Cookies',
            bootstrapCookiePath: '/tmp/source/Cookies',
            managedProfileRoot: '/tmp/auracall/browser-profiles',
          },
        },
        services: {
          chatgpt: {
            url: 'https://chatgpt.com/g/g-p-observations',
          },
        },
        runtimeProfiles: {
          'auracall-chatgpt-observations': {
            engine: 'browser',
            defaultService: 'chatgpt',
            browserProfile: 'default',
            browser: {
              hideWindow: true,
            },
            services: {
              chatgpt: {
                model: 'GPT-5.2',
                projectId: 'g-p-observations',
                manualLoginProfileDir: '/tmp/auracall/browser-profiles/default/chatgpt',
              },
            },
          },
        },
      },
      { runBrowserModeImpl },
    );

    const result = await executeStoredRunStep?.({
      record: {
        runId: 'teamrun_chatgpt_obs_1',
        revision: 1,
        bundle: {
          run: {
            id: 'teamrun_chatgpt_obs_1',
            initialInputs: {
              auracall: {
                composerTool: 'deep-research',
                deepResearchPlanAction: 'edit',
              },
            },
          },
        },
      } as never,
      step: {
        id: 'teamrun_chatgpt_obs_1:step:1',
        agentId: 'auracall-chatgpt-observer',
        runtimeProfileId: 'auracall-chatgpt-observations',
        browserProfileId: 'default',
        service: 'chatgpt',
        input: {
          prompt: 'Reply exactly with AURACALL_CHATGPT_OBS_OK',
          artifacts: [],
          structuredData: {},
          notes: [],
        },
      } as never,
    });

    expect(runBrowserModeImpl).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          manualLogin: true,
          manualLoginWaitForSession: false,
          composerTool: 'deep-research',
          deepResearchPlanAction: 'edit',
        }),
      }),
    );
    expect(result?.output?.structuredData?.browserRun).toMatchObject({
      provider: 'chatgpt',
      service: 'chatgpt',
      conversationId: 'mock-chatgpt-observation',
      tabUrl: 'https://chatgpt.com/c/mock-chatgpt-observation',
      runtimeProfileId: 'auracall-chatgpt-observations',
      browserProfileId: 'default',
      agentId: 'auracall-chatgpt-observer',
      projectId: 'g-p-observations',
      configuredUrl: 'https://chatgpt.com/g/g-p-observations',
      desiredModel: 'GPT-5.2',
      chatgptDeepResearchStage: 'plan-edit-opened',
      chatgptDeepResearchPlanAction: 'edit',
      chatgptDeepResearchModifyPlanLabel: 'Update',
      chatgptDeepResearchModifyPlanVisible: true,
      chatgptDeepResearchReviewEvidence: {
        stage: 'plan-edit-opened',
        screenshotPath: '/tmp/deep-research-review.png',
      },
      passiveObservations: [
        {
          state: 'thinking',
          source: 'browser-service',
          observedAt: '2026-04-15T21:20:00.000Z',
        },
        {
          state: 'response-incoming',
          source: 'browser-service',
          observedAt: '2026-04-15T21:20:04.000Z',
        },
        {
          state: 'response-complete',
          source: 'browser-service',
          observedAt: '2026-04-15T21:20:07.000Z',
        },
      ],
    });
  });

  it('resolves ChatGPT semantic agent model selectors into browser model and thinking controls', async () => {
    const runBrowserModeImpl = vi.fn(async () => ({
      answerText: 'AURACALL_CHATGPT_SELECTOR_OK',
      answerMarkdown: 'AURACALL_CHATGPT_SELECTOR_OK',
      tookMs: 700,
      answerTokens: 8,
      answerChars: 28,
      tabUrl: 'https://chatgpt.com/c/mock-chatgpt-selector',
      conversationId: 'mock-chatgpt-selector',
    }));

    const executeStoredRunStep = createConfiguredStoredStepExecutor(
      {
        browserProfiles: {
          default: {
            chromePath: '/usr/bin/google-chrome',
            sourceProfileName: 'Default',
            managedProfileRoot: '/tmp/auracall/browser-profiles',
          },
        },
        runtimeProfiles: {
          'auracall-chatgpt-selector': {
            engine: 'browser',
            defaultService: 'chatgpt',
            browserProfile: 'default',
            services: {
              chatgpt: {
                manualLoginProfileDir: '/tmp/auracall/browser-profiles/default/chatgpt',
              },
            },
          },
        },
        agents: {
          'pro-researcher': {
            runtimeProfile: 'auracall-chatgpt-selector',
            service: 'chatgpt',
            modelSelector: 'chatgpt:pro-extended',
            projectId: 'proj_semantic',
          },
        },
      },
      { runBrowserModeImpl },
    );

    const result = await executeStoredRunStep?.({
      record: {
        runId: 'teamrun_chatgpt_selector_1',
        revision: 1,
        bundle: {
          run: {
            id: 'teamrun_chatgpt_selector_1',
          },
        },
      } as never,
      step: {
        id: 'teamrun_chatgpt_selector_1:step:1',
        agentId: 'pro-researcher',
        runtimeProfileId: 'auracall-chatgpt-selector',
        browserProfileId: 'default',
        service: 'chatgpt',
        input: {
          prompt: 'Reply exactly with AURACALL_CHATGPT_SELECTOR_OK',
          artifacts: [],
          structuredData: {},
          notes: [],
        },
      } as never,
    });

    expect(runBrowserModeImpl).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          target: 'chatgpt',
          selectedAgentId: 'pro-researcher',
          desiredModel: 'Pro',
          thinkingTime: 'extended',
          projectId: 'proj_semantic',
        }),
      }),
    );
    expect(result?.output?.structuredData?.browserRun).toMatchObject({
      provider: 'chatgpt',
      service: 'chatgpt',
      agentId: 'pro-researcher',
      projectId: 'proj_semantic',
      desiredModel: 'Pro',
      modelSelector: 'chatgpt:pro-extended',
      thinkingTime: 'extended',
    });
  });

  it('resolves agents from an effective registry-backed config provider', async () => {
    const runBrowserModeImpl = vi.fn(async () => ({
      answerText: 'AURACALL_REGISTRY_AGENT_OK',
      answerMarkdown: 'AURACALL_REGISTRY_AGENT_OK',
      tookMs: 700,
      answerTokens: 8,
      answerChars: 26,
      tabUrl: 'https://chatgpt.com/c/mock-registry-agent',
      conversationId: 'mock-registry-agent',
    }));
    const effectiveConfigProvider = vi.fn(async () => ({
      browserProfiles: {
        default: {
          chromePath: '/usr/bin/google-chrome',
          sourceProfileName: 'Default',
          managedProfileRoot: '/tmp/auracall/browser-profiles',
        },
      },
      runtimeProfiles: {
        'registry-chatgpt-profile': {
          engine: 'browser',
          defaultService: 'chatgpt',
          browserProfile: 'default',
          services: {
            chatgpt: {
              manualLoginProfileDir: '/tmp/auracall/browser-profiles/default/chatgpt',
            },
          },
        },
      },
      agents: {
        'registry-pro-researcher': {
          runtimeProfile: 'registry-chatgpt-profile',
          service: 'chatgpt',
          modelSelector: 'chatgpt:pro-standard',
          projectId: 'proj_registry',
        },
      },
    }));

    const executeStoredRunStep = createConfiguredStoredStepExecutor(
      {
        browserProfiles: {},
        runtimeProfiles: {},
      },
      {
        runBrowserModeImpl,
        effectiveConfigProvider,
      },
    );

    await executeStoredRunStep?.({
      record: {
        runId: 'teamrun_registry_agent_1',
        revision: 1,
        bundle: {
          run: {
            id: 'teamrun_registry_agent_1',
          },
        },
      } as never,
      step: {
        id: 'teamrun_registry_agent_1:step:1',
        agentId: 'registry-pro-researcher',
        runtimeProfileId: null,
        browserProfileId: null,
        service: null,
        input: {
          prompt: 'Reply exactly with AURACALL_REGISTRY_AGENT_OK',
          artifacts: [],
          structuredData: {},
          notes: [],
        },
      } as never,
    });

    expect(effectiveConfigProvider).toHaveBeenCalledTimes(1);
    expect(runBrowserModeImpl).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          target: 'chatgpt',
          auracallProfileName: 'default',
          selectedAgentId: 'registry-pro-researcher',
          desiredModel: 'Pro',
          thinkingTime: 'standard',
          projectId: 'proj_registry',
        }),
      }),
    );
  });

  it('keeps exact ChatGPT agent model pins ahead of semantic selector defaults', async () => {
    const runBrowserModeImpl = vi.fn(async (_options: BrowserRunOptions) => ({
      answerText: 'AURACALL_CHATGPT_PIN_OK',
      answerMarkdown: 'AURACALL_CHATGPT_PIN_OK',
      tookMs: 700,
      answerTokens: 8,
      answerChars: 23,
      tabUrl: 'https://chatgpt.com/c/mock-chatgpt-pin',
      conversationId: 'mock-chatgpt-pin',
    }));

    const executeStoredRunStep = createConfiguredStoredStepExecutor(
      {
        browserProfiles: {
          default: {
            chromePath: '/usr/bin/google-chrome',
            sourceProfileName: 'Default',
            managedProfileRoot: '/tmp/auracall/browser-profiles',
          },
        },
        runtimeProfiles: {
          'auracall-chatgpt-pin': {
            engine: 'browser',
            defaultService: 'chatgpt',
            browserProfile: 'default',
            services: {
              chatgpt: {
                manualLoginProfileDir: '/tmp/auracall/browser-profiles/default/chatgpt',
              },
            },
          },
        },
        agents: {
          pinned: {
            runtimeProfile: 'auracall-chatgpt-pin',
            service: 'chatgpt',
            model: 'GPT-5.2',
            modelSelector: 'chatgpt:pro-extended',
          },
        },
      },
      { runBrowserModeImpl },
    );

    await executeStoredRunStep?.({
      record: {
        runId: 'teamrun_chatgpt_pin_1',
        revision: 1,
        bundle: {
          run: {
            id: 'teamrun_chatgpt_pin_1',
          },
        },
      } as never,
      step: {
        id: 'teamrun_chatgpt_pin_1:step:1',
        agentId: 'pinned',
        runtimeProfileId: 'auracall-chatgpt-pin',
        browserProfileId: 'default',
        service: 'chatgpt',
        input: {
          prompt: 'Reply exactly with AURACALL_CHATGPT_PIN_OK',
          artifacts: [],
          structuredData: {},
          notes: [],
        },
      } as never,
    });

    expect(runBrowserModeImpl).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          desiredModel: 'GPT-5.2',
        }),
      }),
    );
    const callOptions = runBrowserModeImpl.mock.calls.at(0)?.[0] as { config?: { thinkingTime?: string } } | undefined;
    expect(callOptions?.config?.thinkingTime).toBeUndefined();
  });

  it('persists Gemini passive observations from browser execution metadata', async () => {
    const passiveObservations: BrowserPassiveObservation[] = [
      {
        state: 'thinking',
        source: 'browser-service',
        observedAt: '2026-04-16T16:20:00.000Z',
        evidenceRef: 'gemini-thoughts',
        confidence: 'medium',
      },
      {
        state: 'response-incoming',
        source: 'browser-service',
        observedAt: '2026-04-16T16:20:04.000Z',
        evidenceRef: 'gemini-web-response-text',
        confidence: 'medium',
      },
      {
        state: 'response-complete',
        source: 'browser-service',
        observedAt: '2026-04-16T16:20:06.000Z',
        evidenceRef: 'gemini-web-response-finished',
        confidence: 'high',
      },
    ];
    const runGeminiBrowserModeImpl = vi.fn(async () => ({
      answerText: 'AURACALL_GEMINI_OBS_OK',
      answerMarkdown: 'AURACALL_GEMINI_OBS_OK',
      tookMs: 800,
      answerTokens: 9,
      answerChars: 23,
      tabUrl: 'https://gemini.google.com/app/mock-gemini-observation',
      conversationId: 'mock-gemini-observation',
      passiveObservations,
    }));

    const executeStoredRunStep = createConfiguredStoredStepExecutor(
      {
        browserProfiles: {
          default: {
            chromePath: '/usr/bin/google-chrome',
            sourceProfileName: 'Default',
            sourceCookiePath: '/tmp/source/Cookies',
            bootstrapCookiePath: '/tmp/source/Cookies',
            managedProfileRoot: '/tmp/auracall/browser-profiles',
          },
        },
        services: {
          gemini: {
            url: 'https://gemini.google.com/app',
          },
        },
        runtimeProfiles: {
          'auracall-gemini-observations': {
            engine: 'browser',
            defaultService: 'gemini',
            browserProfile: 'default',
            browser: {
              hideWindow: true,
            },
            services: {
              gemini: {
                model: 'Gemini 3 Pro',
                manualLoginProfileDir: '/tmp/auracall/browser-profiles/default/gemini',
              },
            },
          },
        },
      },
      { runGeminiBrowserModeImpl },
    );

    const result = await executeStoredRunStep?.({
      record: {
        runId: 'teamrun_gemini_obs_1',
        revision: 1,
        bundle: {
          run: {
            id: 'teamrun_gemini_obs_1',
          },
        },
      } as never,
      step: {
        id: 'teamrun_gemini_obs_1:step:1',
        agentId: 'auracall-gemini-observer',
        runtimeProfileId: 'auracall-gemini-observations',
        browserProfileId: 'default',
        service: 'gemini',
        input: {
          prompt: 'Reply exactly with AURACALL_GEMINI_OBS_OK',
          artifacts: [],
          structuredData: {},
          notes: [],
        },
      } as never,
    });

    expect(result?.output?.structuredData?.browserRun).toMatchObject({
      provider: 'gemini',
      service: 'gemini',
      conversationId: 'mock-gemini-observation',
      tabUrl: 'https://gemini.google.com/app/mock-gemini-observation',
      runtimeProfileId: 'auracall-gemini-observations',
      browserProfileId: 'default',
      agentId: 'auracall-gemini-observer',
      configuredUrl: 'https://gemini.google.com/app',
      desiredModel: 'Gemini 3 Pro',
      passiveObservations: [
        {
          state: 'thinking',
          source: 'browser-service',
          observedAt: '2026-04-16T16:20:00.000Z',
        },
        {
          state: 'response-incoming',
          source: 'browser-service',
          observedAt: '2026-04-16T16:20:04.000Z',
        },
        {
          state: 'response-complete',
          source: 'browser-service',
          observedAt: '2026-04-16T16:20:06.000Z',
        },
      ],
    });
  });

  it('persists Grok passive observations from browser execution metadata', async () => {
    const passiveObservations: BrowserPassiveObservation[] = [
      {
        state: 'thinking',
        source: 'browser-service',
        observedAt: '2026-04-16T17:00:00.000Z',
        evidenceRef: 'grok-prompt-submitted',
        confidence: 'medium',
      },
      {
        state: 'response-incoming',
        source: 'browser-service',
        observedAt: '2026-04-16T17:00:03.000Z',
        evidenceRef: 'grok-assistant-visible',
        confidence: 'high',
      },
      {
        state: 'response-complete',
        source: 'browser-service',
        observedAt: '2026-04-16T17:00:07.000Z',
        evidenceRef: 'grok-response-finished',
        confidence: 'high',
      },
    ];
    const runBrowserModeImpl = vi.fn(async () => ({
      answerText: 'AURACALL_GROK_OBS_OK',
      answerMarkdown: 'AURACALL_GROK_OBS_OK',
      tookMs: 800,
      answerTokens: 9,
      answerChars: 21,
      tabUrl: 'https://grok.com/c/mock-grok-observation',
      conversationId: 'mock-grok-observation',
      passiveObservations,
    }));

    const executeStoredRunStep = createConfiguredStoredStepExecutor(
      {
        browserProfiles: {
          default: {
            chromePath: '/usr/bin/google-chrome',
            sourceProfileName: 'Default',
            sourceCookiePath: '/tmp/source/Cookies',
            bootstrapCookiePath: '/tmp/source/Cookies',
            managedProfileRoot: '/tmp/auracall/browser-profiles',
          },
        },
        services: {
          grok: {
            url: 'https://grok.com/',
          },
        },
        runtimeProfiles: {
          'auracall-grok-observations': {
            engine: 'browser',
            defaultService: 'grok',
            browserProfile: 'default',
            browser: {
              hideWindow: true,
            },
            services: {
              grok: {
                model: 'Grok 4.1',
                manualLoginProfileDir: '/tmp/auracall/browser-profiles/default/grok',
              },
            },
          },
        },
      },
      { runBrowserModeImpl },
    );

    const result = await executeStoredRunStep?.({
      record: {
        runId: 'teamrun_grok_obs_1',
        revision: 1,
        bundle: {
          run: {
            id: 'teamrun_grok_obs_1',
          },
        },
      } as never,
      step: {
        id: 'teamrun_grok_obs_1:step:1',
        agentId: 'auracall-grok-observer',
        runtimeProfileId: 'auracall-grok-observations',
        browserProfileId: 'default',
        service: 'grok',
        input: {
          prompt: 'Reply exactly with AURACALL_GROK_OBS_OK',
          artifacts: [],
          structuredData: {},
          notes: [],
        },
      } as never,
    });

    expect(result?.output?.structuredData?.browserRun).toMatchObject({
      provider: 'grok',
      service: 'grok',
      conversationId: 'mock-grok-observation',
      tabUrl: 'https://grok.com/c/mock-grok-observation',
      runtimeProfileId: 'auracall-grok-observations',
      browserProfileId: 'default',
      agentId: 'auracall-grok-observer',
      configuredUrl: 'https://grok.com/',
      desiredModel: 'Grok 4.1',
      passiveObservations: [
        {
          state: 'thinking',
          source: 'browser-service',
          observedAt: '2026-04-16T17:00:00.000Z',
        },
        {
          state: 'response-incoming',
          source: 'browser-service',
          observedAt: '2026-04-16T17:00:03.000Z',
        },
        {
          state: 'response-complete',
          source: 'browser-service',
          observedAt: '2026-04-16T17:00:07.000Z',
        },
      ],
    });
  });
});
