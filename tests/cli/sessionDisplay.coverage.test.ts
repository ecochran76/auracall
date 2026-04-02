import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionMetadata } from '../../src/sessionStore.js';

const mockCollectReattachRegistryDiagnostics = vi.hoisted(() => vi.fn(async () => null));

const mockSessionStore = {
  listSessions: vi.fn(),
  filterSessions: vi.fn(),
  sessionsDir: vi.fn(() => '/tmp/sessions'),
  readSession: vi.fn(),
  readModelLog: vi.fn(),
  readLog: vi.fn(),
  readRequest: vi.fn(),
  updateSession: vi.fn(),
};

vi.mock('../../src/sessionStore.js', () => ({
  sessionStore: mockSessionStore,
  wait: vi.fn(async () => {}),
}));

vi.mock('../../src/browser/service/registryDiagnostics.js', () => ({
  collectReattachRegistryDiagnostics: mockCollectReattachRegistryDiagnostics,
}));

describe('sessionDisplay helpers', () => {
  beforeEach(() => {
    mockCollectReattachRegistryDiagnostics.mockReset();
    mockCollectReattachRegistryDiagnostics.mockResolvedValue(null as any);
    Object.values(mockSessionStore).forEach((fn) => {
      if ('mockReset' in fn) {
        (fn as unknown as { mockReset: () => void }).mockReset();
      }
    });
  });

  it('prints classified reattach failures for browser sessions', async () => {
    vi.resetModules();
    const mockResumeBrowserSession = vi.fn();
    vi.doMock('../../src/browser/reattach.js', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../../src/browser/reattach.js')>();
      return {
        ...actual,
        resumeBrowserSession: mockResumeBrowserSession,
      };
    });
    const { ReattachFailure } = await import('../../src/browser/reattach.js');
    const createdAt = new Date().toISOString();
    mockSessionStore.readSession.mockResolvedValue({
      id: 'sess-browser',
      createdAt,
      status: 'error',
      mode: 'browser',
      options: {},
      browser: {
        config: {},
        runtime: {
          chromePort: 51559,
          chromeHost: '127.0.0.1',
          chromeTargetId: 't-1',
          tabUrl: 'https://chatgpt.com/c/demo',
        },
      },
      response: { status: 'running', incompleteReason: 'chrome-disconnected' },
    });
    mockSessionStore.readLog.mockResolvedValue('Answer:\nreattach log');
    mockSessionStore.readRequest.mockResolvedValue({ prompt: 'Prompt here' });
    mockCollectReattachRegistryDiagnostics.mockResolvedValue({
      capturedAt: '2026-04-02T02:20:00.000Z',
      discardedRegistryCandidates: [
        {
          key: '/tmp/profile::default::selected-port-stale',
          profilePath: '/tmp/profile',
          profileName: 'Default',
          port: 51559,
          host: '127.0.0.1',
          liveness: 'dead-port',
          actualPid: 9001,
          reason: 'selected-port-stale',
        },
      ],
    } as any);
    mockResumeBrowserSession.mockRejectedValue(
      new ReattachFailure({
        kind: 'wrong-browser-profile',
        message: 'Existing Chrome no longer exposes the expected ChatGPT browser profile.',
        chromePort: 51559,
        pageTargetCount: 2,
        matchingOriginTargetCount: 0,
      }),
    );
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const { attachSession } = await import('../../src/cli/sessionDisplay.js');
    await attachSession('sess-browser', { suppressMetadata: true, renderPrompt: false, renderMarkdown: false });

    expect(log).toHaveBeenCalledWith(
      expect.stringContaining(
        'Reattach failed: wrong-browser-profile: Existing Chrome no longer exposes the expected ChatGPT browser profile.',
      ),
    );
    expect(write).toHaveBeenCalledWith(expect.stringContaining('Answer:\nreattach log'));
    expect(mockSessionStore.updateSession).toHaveBeenCalledWith(
      'sess-browser',
      expect.objectContaining({
        browser: expect.objectContaining({
          runtime: expect.objectContaining({
            reattachDiagnostics: expect.objectContaining({
              failureKind: 'wrong-browser-profile',
              discardedRegistryCandidates: [expect.objectContaining({ reason: 'selected-port-stale' })],
            }),
          }),
        }),
      }),
    );
  }, 15_000);

  it('prints cleanup tip and examples when no sessions are found', async () => {
    mockSessionStore.listSessions.mockResolvedValue([]);
    mockSessionStore.filterSessions.mockReturnValue({ entries: [], truncated: false, total: 0 });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    const { showStatus } = await import('../../src/cli/sessionDisplay.js');
    await showStatus({ hours: 24, includeAll: false, limit: 10, showExamples: true });

    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('Tip: Run "auracall session --clear --hours 24" to prune cached runs'),
    );
    log.mockRestore();
  }, 15_000);

  it('prints reattach diagnostics under status rows when present', async () => {
    const entry = {
      id: 'sess-reattach',
      status: 'error',
      createdAt: '2025-11-20T00:00:00.000Z',
      model: 'gpt-5.1',
      options: { prompt: 'hi' },
      browser: {
        runtime: {
          reattachDiagnostics: {
            capturedAt: '2026-04-02T02:30:00.000Z',
            failureKind: 'wrong-browser-profile',
            failureMessage: 'wrong browser',
            discardedRegistryCandidates: [
              {
                key: 'k1',
                profilePath: '/tmp/profile',
                profileName: 'Default',
                port: 1,
                host: '127.0.0.1',
                liveness: 'dead-port',
                reason: 'selected-port-stale',
              },
            ],
          },
        },
      },
    };
    mockSessionStore.listSessions.mockResolvedValue([entry]);
    mockSessionStore.filterSessions.mockReturnValue({ entries: [entry], truncated: false, total: 1 });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    const { showStatus } = await import('../../src/cli/sessionDisplay.js');
    await showStatus({ hours: 24, includeAll: false, limit: 5 });

    expect(log).toHaveBeenCalledWith(expect.stringContaining('reattach: wrong-browser-profile'));
  }, 15_000);

  it('prints a status table with cost info and truncation notice', async () => {
    const entry = {
      id: 'sess-123',
      status: 'completed',
      createdAt: '2025-11-20T00:00:00.000Z',
      model: 'gpt-5.1',
      options: { prompt: 'hi' },
      usage: { cost: 0.123 },
    };
    mockSessionStore.listSessions.mockResolvedValue([entry]);
    mockSessionStore.filterSessions.mockReturnValue({ entries: [entry], truncated: true, total: 2 });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    const { showStatus } = await import('../../src/cli/sessionDisplay.js');
    await showStatus({ hours: 24, includeAll: false, limit: 5 });

    expect(log).toHaveBeenCalledWith(expect.stringContaining('Recent Sessions'));
    expect(log).toHaveBeenCalledWith(expect.stringContaining('sess-123'));
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Showing 1 of 2 sessions'));
    log.mockRestore();
  }, 15_000);

  it('formats metadata and completion summaries', async () => {
    const {
      formatResponseMetadata,
      formatTransportMetadata,
      formatUserErrorMetadata,
      formatReattachDiagnostics,
      buildReattachLine,
      trimBeforeFirstAnswer,
      formatCompletionSummary,
    } = await import('../../src/cli/sessionDisplay.js');

    expect(
      formatResponseMetadata({
        responseId: 'resp',
        requestId: 'req',
        status: 'completed',
        incompleteReason: 'timeout',
      }),
    ).toContain('response=resp');
    expect(formatTransportMetadata({ reason: 'client-timeout' })).toContain('client timeout');
    expect(formatTransportMetadata({ reason: 'unknown' })).toContain('unknown transport failure');
    expect(formatUserErrorMetadata({ category: 'input', message: 'bad', details: { field: 'prompt' } })).toContain(
      'details',
    );
    const started = new Date(Date.now() - 1500).toISOString();
    expect(
      formatReattachDiagnostics({
        capturedAt: started,
        failureKind: 'wrong-browser-profile',
        failureMessage: 'wrong browser',
        discardedRegistryCandidates: [
          {
            key: 'k1',
            profilePath: '/tmp/profile',
            profileName: 'Default',
            port: 1,
            host: '127.0.0.1',
            liveness: 'dead-port',
            reason: 'selected-port-stale',
          },
        ],
      }),
    ).toContain('stale=selected-port-stale/dead-port x1');

    const reattachMeta: SessionMetadata = {
      id: 's1',
      status: 'running',
      createdAt: started,
      startedAt: started,
      options: {},
    };
    expect(buildReattachLine(reattachMeta)).toContain('reattached');
    expect(trimBeforeFirstAnswer('Intro\nAnswer: final')).toBe('Answer: final');

    const summaryMeta: SessionMetadata = {
      id: 's2',
      status: 'completed',
      createdAt: started,
      model: 'gpt-5.1',
      mode: 'api',
      elapsedMs: 1500,
      usage: { inputTokens: 10, outputTokens: 20, reasoningTokens: 0, totalTokens: 30, cost: 0.02 },
      options: { file: ['a'] },
    };
    const summary = formatCompletionSummary(summaryMeta, { includeSlug: true });
    expect(summary).toContain('↑10 ↓20 ↻0 Δ30');
    expect(summary).toContain('slug=s2');
  });
});
