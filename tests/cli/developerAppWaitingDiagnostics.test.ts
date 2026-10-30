import { BrowserPerformanceDiagnostics } from "../../src/browser/browserPerformanceDiagnostics.js";
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { expect, it, vi } from 'vitest';
import { createFileBackedBrowserOperationDispatcher } from '../../packages/browser-service/src/service/operationDispatcher.js';
import { formatChatgptDeveloperAppListFailure, runChatgptDeveloperAppOperationForCli } from '../../src/cli/chatgptDeveloperAppsCommand.js';

it.each([{ action: 'list', verbose: false, performance: false }, { action: 'list', verbose: true, performance: false }, { action: 'list', verbose: false, performance: true }, { action: 'list', verbose: true, performance: true }, { action: 'test', verbose: false, performance: false }, { action: 'refresh-tools', verbose: false, performance: false }])('reports pending app utility stages with %j while keeping JSON stdout terminal-only', async ({ action: requestedAction, verbose, performance }) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'auracall-app-wait-'));
  const source = await fs.readFile('bin/auracall.ts', 'utf8');
  const ast = ts.createSourceFile('auracall.ts', source, ts.ScriptTarget.Latest, true);
  const fn = ast.statements.find(s => ts.isFunctionDeclaration(s) && s.name?.text === 'runChatgptDeveloperAppsCliAction');
  if (!fn) throw new Error('Missing apps command entrypoint');
  const output: string[] = [];
  const diagnostics: string[] = [];
  const process = { exitCode: 0, cwd: () => home, env: {} };
  let entered!: () => void;
  let failIdentity!: (error: Error) => void;
  const readingIdentity = new Promise<void>(resolve => { entered = resolve; });
  const userConfig = { services: { chatgpt: { backendRequestBudgetWaitMs: 600000 } } };
  const deps = {
    path,
    // biome-ignore lint/style/useNamingConvention: Extracted CLI action resolves its imported constructor by name.
    BrowserPerformanceDiagnostics,
    program: { opts: () => ({ json: true, verbose, performance }) },
    resolveConfig: async () => userConfig,
    getAuracallHomeDir: () => home,
    resolveManagedProfileDirForUserConfig: () => path.join(home, 'managed-browser'),
    createFileBackedBrowserOperationDispatcher,
    runChatgptDeveloperAppOperationForCli: (config: never, input: never, options: object) => runChatgptDeveloperAppOperationForCli(config, input, {
      ...options,
      createBrowser: async () => ({
        userConfig,
        getUserIdentity: () => {
          entered();
          return new Promise<never>((_resolve, reject) => { failIdentity = reject; });
        },
      }) as never,
    }),
    formatChatgptDeveloperAppListFailure,
    formatBrowserOperationBusyResult: () => 'busy',
    exitAfterCompletedBrowserUtilityCommand: async () => undefined,
    process,
    console: { log: (v: string) => output.push(v), error: (v: string) => diagnostics.push(v) },
  };
  const compiled = ts.transpile(fn.getText(ast), { target: ts.ScriptTarget.ES2022 });
  const action = new Function(...Object.keys(deps), `${compiled};return runChatgptDeveloperAppsCliAction;`)(...Object.values(deps));
  vi.useFakeTimers();
  const request = requestedAction === 'list' ? { action: 'list' } : requestedAction === 'test' ? { action: 'test', app: 'fixture', submit: false, confirmed: false, expectedAccount: 'fixture@example.invalid' } : { action: 'refresh-tools', app: 'fixture', serverUrl: 'https://fixture.example/mcp', confirmed: true, expectedAccount: 'fixture@example.invalid' };
  const running = action({ opts: () => ({}) }, () => request);
  try {
    await readingIdentity;
    await vi.advanceTimersByTimeAsync(30000);
    expect(output).toEqual([]);
    expect(diagnostics.join('\n')).toContain('stage=identity');
    expect(diagnostics.join('\n')).toContain(requestedAction === 'refresh-tools' ? '690000' : '645000');
  } finally {
    try {
      failIdentity?.(new Error('fixture completed'));
      await running;
      expect(output).toHaveLength(1);
      expect(JSON.parse(output[0])).toMatchObject({ action: requestedAction, status: requestedAction === 'refresh-tools' ? 'unconfirmed' : 'failed', stage: 'identity' });
      const reports = diagnostics.filter(line => line.startsWith('[browser-performance] '));
      expect(reports).toHaveLength(performance ? 1 : 0);
      if (performance) {
        const report = JSON.parse(reports[0].slice('[browser-performance] '.length));
        expect(report.stages).toContainEqual(expect.objectContaining({ stage: 'identity', durationMs: expect.any(Number) }));
        expect(report.backendRequests.total).toBe(0);
        expect(JSON.stringify(report)).not.toContain(home);
      }
      const diagnosticCount = diagnostics.length;
      await vi.advanceTimersByTimeAsync(30000);
      expect(diagnostics).toHaveLength(diagnosticCount);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
      await fs.rm(home, { recursive: true, force: true });
    }
  }
});
