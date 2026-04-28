import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserPassiveObservation } from '../src/browser/types.js';
import { createConfiguredStoredStepExecutor } from '../src/runtime/configuredExecutor.js';
import { readLiveRuntimeRunServiceState, resetLiveRuntimeRunServiceStateRegistryForTests } from '../src/runtime/liveServiceStateRegistry.js';
import { AURACALL_STEP_OUTPUT_CONTRACT_VERSION } from '../src/runtime/stepOutputContract.js';

describe('configured stored-step executor', () => {
  beforeEach(() => {
    resetLiveRuntimeRunServiceStateRegistryForTests();
  });

  it('executes a Grok browser-backed step from runtime-profile config and returns response output', async () => {
    const runBrowserModeImpl = vi.fn(async (options) => ({
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
    const runGeminiBrowserModeImpl = vi.fn(async (options) => ({
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

    expect(resolveGeminiRun).not.toBeNull();
    resolveGeminiRun!({
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

    expect(resolveGrokRun).not.toBeNull();
    resolveGrokRun!({
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
