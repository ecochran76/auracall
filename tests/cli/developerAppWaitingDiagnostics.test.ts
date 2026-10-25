import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { expect, it, vi } from 'vitest';
import { createFileBackedBrowserOperationDispatcher } from '../../packages/browser-service/src/service/operationDispatcher.js';
import { formatChatgptDeveloperAppListFailure, runChatgptDeveloperAppOperationForCli } from '../../src/cli/chatgptDeveloperAppsCommand.js';

it.each([false, true])('reports a pending app-list stage with verbose=%s while keeping JSON stdout terminal-only', async (verbose) => {
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
    path, program: { opts: () => ({ json: true, verbose }) },
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
  const running = action({ opts: () => ({}) }, () => ({ action: 'list' }));
  try {
    await readingIdentity;
    await vi.advanceTimersByTimeAsync(30000);
    expect(output).toEqual([]);
    expect(diagnostics.join('\n')).toContain('stage=identity');
    expect(diagnostics.join('\n')).toContain('645000');
  } finally {
    try {
      failIdentity?.(new Error('fixture completed'));
      await running;
      expect(output).toHaveLength(1);
      expect(JSON.parse(output[0])).toMatchObject({ action: 'list', status: 'failed', stage: 'identity' });
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
