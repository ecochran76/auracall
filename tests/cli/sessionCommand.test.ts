import { afterEach, describe, expect, test, vi } from 'vitest';
import { Command } from 'commander';
import { handleSessionCommand, type StatusOptions } from '../../src/cli/sessionCommand.ts';

function createCommandWithOptions(options: StatusOptions): Command {
  const command = new Command();
  command.setOptionValueWithSource('hours', options.hours, 'cli');
  command.setOptionValueWithSource('limit', options.limit, 'cli');
  command.setOptionValueWithSource('all', options.all, 'cli');
  if (options.path !== undefined) {
    command.setOptionValueWithSource('path', options.path, 'cli');
  }
  if (options.json !== undefined) {
    command.setOptionValueWithSource('json', options.json, 'cli');
  }
  if (options.jsonOnly !== undefined) {
    command.setOptionValueWithSource('jsonOnly', options.jsonOnly, 'cli');
  }
  if (options.model !== undefined) {
    command.setOptionValueWithSource('model', options.model, 'cli');
  }
  if (options.clear !== undefined) {
    command.setOptionValueWithSource('clear', options.clear, 'cli');
  }
  if (options.clean !== undefined) {
    command.setOptionValueWithSource('clean', options.clean, 'cli');
  }
  return command;
}

describe('handleSessionCommand', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  test('lists sessions when no id provided', async () => {
    const command = createCommandWithOptions({ hours: 12, limit: 5, all: false });
    const showStatus = vi.fn();
    await handleSessionCommand(undefined, command, {
      showStatus,
      attachSession: vi.fn(),
      usesDefaultStatusFilters: vi.fn().mockReturnValue(true),
      deleteSessionsOlderThan: vi.fn(),
      getSessionPaths: vi.fn(),
      readSession: vi.fn(),
      listSessions: vi.fn(),
      filterSessions: vi.fn(),
    });
    expect(showStatus).toHaveBeenCalledWith({
      hours: 12,
      includeAll: false,
      limit: 5,
      showExamples: true,
    });
  });

  test('prints filtered status JSON when --json is provided without an id', async () => {
    const command = createCommandWithOptions({ hours: 12, limit: 5, all: false, json: true, model: 'gpt-5.1' } as StatusOptions);
    const listSessions = vi.fn().mockResolvedValue([
      { id: 'sess-1', createdAt: '2025-11-20T00:00:00.000Z', status: 'completed', model: 'gpt-5.1', options: {} },
      { id: 'sess-2', createdAt: '2025-11-20T00:00:00.000Z', status: 'completed', model: 'grok', options: {} },
    ]);
    const filterSessions = vi.fn().mockReturnValue({
      entries: [
        { id: 'sess-1', createdAt: '2025-11-20T00:00:00.000Z', status: 'completed', model: 'gpt-5.1', options: {} },
        { id: 'sess-2', createdAt: '2025-11-20T00:00:00.000Z', status: 'completed', model: 'grok', options: {} },
      ],
      truncated: false,
      total: 2,
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await handleSessionCommand(undefined, command, {
      showStatus: vi.fn(),
      attachSession: vi.fn(),
      usesDefaultStatusFilters: vi.fn(),
      deleteSessionsOlderThan: vi.fn(),
      getSessionPaths: vi.fn(),
      readSession: vi.fn(),
      listSessions,
      filterSessions,
    });

    expect(logSpy).toHaveBeenCalledWith(
      JSON.stringify(
        {
          entries: [{ id: 'sess-1', createdAt: '2025-11-20T00:00:00.000Z', status: 'completed', model: 'gpt-5.1', options: {}, selectedAgentId: null, runtimeSelectedAgentId: null, reattachSummary: null }],
          truncated: false,
          total: 2,
        },
        null,
        2,
      ),
    );
  });

  test('attaches when id provided', async () => {
    const command = createCommandWithOptions({ hours: 24, limit: 10, all: false });
    const attachSession = vi.fn();
    await handleSessionCommand('abc', command, {
      showStatus: vi.fn(),
      attachSession,
      usesDefaultStatusFilters: vi.fn(),
      deleteSessionsOlderThan: vi.fn(),
      getSessionPaths: vi.fn(),
      readSession: vi.fn(),
      listSessions: vi.fn(),
      filterSessions: vi.fn(),
    });
    expect(attachSession).toHaveBeenCalledWith('abc', expect.objectContaining({ renderMarkdown: false }));
  });

  test('prints session JSON with reattach diagnostics when --json is provided with an id', async () => {
    const command = createCommandWithOptions({ hours: 24, limit: 10, all: false, json: true } as StatusOptions);
    const readSession = vi.fn().mockResolvedValue({
      id: 'abc',
      createdAt: '2025-11-20T00:00:00.000Z',
      status: 'error',
      options: { selectedAgentId: 'analyst' },
      browser: {
        runtime: {
          reattachDiagnostics: {
            capturedAt: '2026-04-02T03:00:00.000Z',
            failureKind: 'wrong-browser-profile',
            failureMessage: 'wrong browser',
          },
        },
      },
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await handleSessionCommand('abc', command, {
      showStatus: vi.fn(),
      attachSession: vi.fn(),
      usesDefaultStatusFilters: vi.fn(),
      deleteSessionsOlderThan: vi.fn(),
      getSessionPaths: vi.fn(),
      readSession,
      listSessions: vi.fn(),
      filterSessions: vi.fn(),
    });

    expect(logSpy).toHaveBeenCalledWith(
      JSON.stringify(
        {
          id: 'abc',
          createdAt: '2025-11-20T00:00:00.000Z',
          status: 'error',
          options: { selectedAgentId: 'analyst' },
          browser: {
            runtime: {
              reattachDiagnostics: {
                capturedAt: '2026-04-02T03:00:00.000Z',
                failureKind: 'wrong-browser-profile',
                failureMessage: 'wrong browser',
              },
            },
          },
          selectedAgentId: 'analyst',
          runtimeSelectedAgentId: null,
          reattachSummary: {
            capturedAt: '2026-04-02T03:00:00.000Z',
            failureKind: 'wrong-browser-profile',
            failureMessage: 'wrong browser',
            discardedCandidateCount: 0,
            discardedCandidateCounts: [],
            summary: 'wrong-browser-profile | message=wrong browser',
          },
        },
        null,
        2,
      ),
    );
  });

  test('adds normalized reattach summaries to list JSON entries', async () => {
    const command = createCommandWithOptions({ hours: 12, limit: 5, all: false, json: true } as StatusOptions);
    const listSessions = vi.fn().mockResolvedValue([]);
    const filterSessions = vi.fn().mockReturnValue({
      entries: [
        {
          id: 'sess-reattach',
          createdAt: '2025-11-20T00:00:00.000Z',
          status: 'error',
          options: { selectedAgentId: 'analyst' },
          browser: {
            runtime: {
              reattachDiagnostics: {
                capturedAt: '2026-04-02T03:00:00.000Z',
                failureKind: 'wrong-browser-profile',
                failureMessage: 'wrong browser',
                discardedRegistryCandidates: [
                  {
                    key: 'a',
                    profilePath: '/tmp/p',
                    profileName: 'Default',
                    port: 1,
                    host: '127.0.0.1',
                    liveness: 'dead-port',
                    reason: 'selected-port-stale',
                  },
                  {
                    key: 'b',
                    profilePath: '/tmp/p',
                    profileName: 'Default',
                    port: 2,
                    host: '127.0.0.1',
                    liveness: 'dead-port',
                    reason: 'selected-port-stale',
                  },
                ],
              },
            },
          },
        },
      ],
      truncated: false,
      total: 1,
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await handleSessionCommand(undefined, command, {
      showStatus: vi.fn(),
      attachSession: vi.fn(),
      usesDefaultStatusFilters: vi.fn(),
      deleteSessionsOlderThan: vi.fn(),
      getSessionPaths: vi.fn(),
      readSession: vi.fn(),
      listSessions,
      filterSessions,
    });

    expect(logSpy).toHaveBeenCalledWith(
      JSON.stringify(
        {
          entries: [
            {
              id: 'sess-reattach',
              createdAt: '2025-11-20T00:00:00.000Z',
              status: 'error',
              options: { selectedAgentId: 'analyst' },
              browser: {
                runtime: {
                  reattachDiagnostics: {
                    capturedAt: '2026-04-02T03:00:00.000Z',
                    failureKind: 'wrong-browser-profile',
                    failureMessage: 'wrong browser',
                    discardedRegistryCandidates: [
                      {
                        key: 'a',
                        profilePath: '/tmp/p',
                        profileName: 'Default',
                        port: 1,
                        host: '127.0.0.1',
                        liveness: 'dead-port',
                        reason: 'selected-port-stale',
                      },
                      {
                        key: 'b',
                        profilePath: '/tmp/p',
                        profileName: 'Default',
                        port: 2,
                        host: '127.0.0.1',
                        liveness: 'dead-port',
                        reason: 'selected-port-stale',
                      },
                    ],
                  },
                },
              },
              selectedAgentId: 'analyst',
              runtimeSelectedAgentId: null,
              reattachSummary: {
                capturedAt: '2026-04-02T03:00:00.000Z',
                failureKind: 'wrong-browser-profile',
                failureMessage: 'wrong browser',
                discardedCandidateCount: 2,
                discardedCandidateCounts: [
                  { reason: 'selected-port-stale', liveness: 'dead-port', count: 2 },
                ],
                summary: 'wrong-browser-profile | message=wrong browser | stale=selected-port-stale/dead-port x2',
              },
            },
          ],
          truncated: false,
          total: 1,
        },
        null,
        2,
      ),
    );
  });

  test('adds normalized runtime-selected agent ids to session JSON entries', async () => {
    const command = createCommandWithOptions({ hours: 24, limit: 10, all: false, json: true } as StatusOptions);
    const readSession = vi.fn().mockResolvedValue({
      id: 'abc',
      createdAt: '2025-11-20T00:00:00.000Z',
      status: 'running',
      options: { selectedAgentId: 'analyst' },
      browser: {
        runtime: {
          selectedAgentId: 'runtime-analyst',
        },
      },
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await handleSessionCommand('abc', command, {
      showStatus: vi.fn(),
      attachSession: vi.fn(),
      usesDefaultStatusFilters: vi.fn(),
      deleteSessionsOlderThan: vi.fn(),
      getSessionPaths: vi.fn(),
      readSession,
      listSessions: vi.fn(),
      filterSessions: vi.fn(),
    });

    expect(logSpy).toHaveBeenCalledWith(
      JSON.stringify(
        {
          id: 'abc',
          createdAt: '2025-11-20T00:00:00.000Z',
          status: 'running',
          options: { selectedAgentId: 'analyst' },
          browser: {
            runtime: {
              selectedAgentId: 'runtime-analyst',
            },
          },
          selectedAgentId: 'analyst',
          runtimeSelectedAgentId: 'runtime-analyst',
          reattachSummary: null,
        },
        null,
        2,
      ),
    );
  });

  test('does not report --json-only as an ignored flag on attach', async () => {
    const command = createCommandWithOptions({ hours: 24, limit: 400, all: false, jsonOnly: true } as StatusOptions);

    const attachSession = vi.fn();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await handleSessionCommand('swiftui-menubarextra-on-macos-15', command, {
      showStatus: vi.fn(),
      attachSession,
      usesDefaultStatusFilters: vi.fn(),
      deleteSessionsOlderThan: vi.fn(),
      getSessionPaths: vi.fn(),
      readSession: vi.fn(),
      listSessions: vi.fn(),
      filterSessions: vi.fn(),
    });

    expect(attachSession).toHaveBeenCalledWith(
      'swiftui-menubarextra-on-macos-15',
      expect.objectContaining({ renderMarkdown: false }),
    );
    expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('Ignoring flags on session attach'));
  });

  test('ignores unrelated root-only flags and logs a note when attaching by id', async () => {
    const command = createCommandWithOptions({ hours: 24, limit: 400, all: false });
    // Simulate passing a root-only flag (preview) that the session handler should ignore.
    command.setOptionValueWithSource('preview', true, 'cli');

    const attachSession = vi.fn();
    const showStatus = vi.fn();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await handleSessionCommand('swiftui-menubarextra-on-macos-15', command, {
      showStatus,
      attachSession,
      usesDefaultStatusFilters: vi.fn(),
      deleteSessionsOlderThan: vi.fn(),
      getSessionPaths: vi.fn(),
      readSession: vi.fn(),
      listSessions: vi.fn(),
      filterSessions: vi.fn(),
    });

    expect(attachSession).toHaveBeenCalledWith(
      'swiftui-menubarextra-on-macos-15',
      expect.objectContaining({ renderMarkdown: false }),
    );
    expect(showStatus).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith('Ignoring flags on session attach: preview');
    expect(process.exitCode).toBeUndefined();
  });

  test('prints paths when --path is provided with an id', async () => {
    const command = createCommandWithOptions({ hours: 24, limit: 10, all: false, path: true } as StatusOptions);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const getSessionPaths = vi.fn().mockResolvedValue({
      dir: '/tmp/.auracall/sessions/abc',
      metadata: '/tmp/.auracall/sessions/abc/meta.json',
      request: '/tmp/.auracall/sessions/abc/request.json',
      log: '/tmp/.auracall/sessions/abc/output.log',
    });

    await handleSessionCommand('abc', command, {
      showStatus: vi.fn(),
      attachSession: vi.fn(),
      usesDefaultStatusFilters: vi.fn(),
      deleteSessionsOlderThan: vi.fn(),
      getSessionPaths,
      readSession: vi.fn(),
      listSessions: vi.fn(),
      filterSessions: vi.fn(),
    });

    expect(getSessionPaths).toHaveBeenCalledWith('abc');
    expect(logSpy).toHaveBeenCalledWith('Session dir: /tmp/.auracall/sessions/abc');
    expect(logSpy).toHaveBeenCalledWith('Metadata: /tmp/.auracall/sessions/abc/meta.json');
    expect(logSpy).toHaveBeenCalledWith('Request: /tmp/.auracall/sessions/abc/request.json');
    expect(logSpy).toHaveBeenCalledWith('Log: /tmp/.auracall/sessions/abc/output.log');
    expect(process.exitCode).toBeUndefined();
  });

  test('errors when --path is provided without an id', async () => {
    const command = createCommandWithOptions({ hours: 24, limit: 10, all: false, path: true } as StatusOptions);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await handleSessionCommand(undefined, command, {
      showStatus: vi.fn(),
      attachSession: vi.fn(),
      usesDefaultStatusFilters: vi.fn(),
      deleteSessionsOlderThan: vi.fn(),
      getSessionPaths: vi.fn(),
      readSession: vi.fn(),
      listSessions: vi.fn(),
      filterSessions: vi.fn(),
    });

    expect(errorSpy).toHaveBeenCalledWith('The --path flag requires a session ID.');
    expect(process.exitCode).toBe(1);
  });

  test('errors when session files are missing', async () => {
    const command = createCommandWithOptions({ hours: 24, limit: 10, all: false, path: true } as StatusOptions);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const getSessionPaths = vi.fn().mockRejectedValue(new Error('Session "abc" is missing: meta.json'));

    await handleSessionCommand('abc', command, {
      showStatus: vi.fn(),
      attachSession: vi.fn(),
      usesDefaultStatusFilters: vi.fn(),
      deleteSessionsOlderThan: vi.fn(),
      getSessionPaths,
      readSession: vi.fn(),
      listSessions: vi.fn(),
      filterSessions: vi.fn(),
    });

    expect(errorSpy).toHaveBeenCalledWith('Session "abc" is missing: meta.json');
    expect(process.exitCode).toBe(1);
  });

  test('passes render flag through to attachSession', async () => {
    const command = createCommandWithOptions({ hours: 24, limit: 10, all: false });
    command.setOptionValueWithSource('render', true, 'cli');

    const attachSession = vi.fn();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await handleSessionCommand('abc', command, {
      showStatus: vi.fn(),
      attachSession,
      usesDefaultStatusFilters: vi.fn(),
      deleteSessionsOlderThan: vi.fn(),
      getSessionPaths: vi.fn(),
      readSession: vi.fn(),
      listSessions: vi.fn(),
      filterSessions: vi.fn(),
    });
    expect(attachSession).toHaveBeenCalledWith('abc', expect.objectContaining({ renderMarkdown: true }));
    expect(logSpy).not.toHaveBeenCalled();
  });

  test('forces infinite range when --all set', async () => {
    const command = createCommandWithOptions({ hours: 1, limit: 25, all: true });
    const showStatus = vi.fn();
    await handleSessionCommand(undefined, command, {
      showStatus,
      attachSession: vi.fn(),
      usesDefaultStatusFilters: vi.fn().mockReturnValue(false),
      deleteSessionsOlderThan: vi.fn(),
      getSessionPaths: vi.fn(),
      readSession: vi.fn(),
      listSessions: vi.fn(),
      filterSessions: vi.fn(),
    });
    expect(showStatus).toHaveBeenCalledWith({
      hours: Infinity,
      includeAll: true,
      limit: 25,
      showExamples: false,
    });
  });

  test('clears sessions when --clear is provided', async () => {
    const command = createCommandWithOptions({ hours: 6, limit: 5, all: false, clear: true });
    const deleteSessionsOlderThan = vi.fn().mockResolvedValue({ deleted: 3, remaining: 2 });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await handleSessionCommand(undefined, command, {
      showStatus: vi.fn(),
      attachSession: vi.fn(),
      usesDefaultStatusFilters: vi.fn(),
      deleteSessionsOlderThan,
      getSessionPaths: vi.fn(),
      readSession: vi.fn(),
      listSessions: vi.fn(),
      filterSessions: vi.fn(),
    });
    expect(deleteSessionsOlderThan).toHaveBeenCalledWith({ hours: 6, includeAll: false });
    expect(logSpy).toHaveBeenCalledWith(
      'Deleted 3 sessions (sessions older than 6h). 2 sessions remain.\nRun "auracall session --clear --all" to delete everything.',
    );
  });

  test('rejects slug-style "clear" ids with guidance', async () => {
    const command = createCommandWithOptions({ hours: 24, limit: 10, all: false });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await handleSessionCommand('clear', command, {
      showStatus: vi.fn(),
      attachSession: vi.fn(),
      usesDefaultStatusFilters: vi.fn(),
      deleteSessionsOlderThan: vi.fn(),
      getSessionPaths: vi.fn(),
      readSession: vi.fn(),
      listSessions: vi.fn(),
      filterSessions: vi.fn(),
    });
    expect(errorSpy).toHaveBeenCalledWith(
      'Session cleanup now uses --clear. Run "auracall session --clear --hours <n>" instead.',
    );
    expect(process.exitCode).toBe(1);
  });
});
