import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createConfiguredStoredStepExecutor } from '../src/runtime/configuredExecutor.js';

describe('configured stored-step executor', () => {
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
      conversationId: 'mock-conversation',
      tabUrl: 'https://gemini.google.com/app',
      service: 'gemini',
    });
  });
});
