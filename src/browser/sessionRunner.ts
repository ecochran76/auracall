import chalk from 'chalk';
import type { RunOracleOptions } from '../oracle.js';
import { formatTokenCount } from '../oracle/runUtils.js';
import { formatFinishLine } from '../oracle/finishLine.js';
import type { BrowserSessionConfig, BrowserRuntimeMetadata } from '../sessionStore.js';
import { runBrowserMode } from '../browserMode.js';
import { assembleBrowserPrompt } from './prompt.js';
import { BrowserAutomationError } from '../oracle/errors.js';
import {
  runBrowserSessionExecutionCore,
  type BrowserExecutionResult,
  type BrowserSessionRunnerDeps,
} from '../../packages/browser-service/src/sessionRunner.js';

interface RunBrowserSessionArgs {
  runOptions: RunOracleOptions;
  browserConfig: BrowserSessionConfig;
  cwd: string;
  log: (message?: string) => void;
}

export async function runBrowserSessionExecution(
  { runOptions, browserConfig, cwd, log }: RunBrowserSessionArgs,
  deps: BrowserSessionRunnerDeps = {},
): Promise<BrowserExecutionResult> {
  const assemblePrompt = deps.assemblePrompt ?? assembleBrowserPrompt;
  const executeBrowser = deps.executeBrowser ?? runBrowserMode;
  const persistRuntimeHint = deps.persistRuntimeHint;

  return runBrowserSessionExecutionCore(
    { runOptions, browserConfig, cwd, log },
    {
      assemblePrompt,
      executeBrowser,
      formatTokenCount,
      formatFinishLine,
      runtimeExtras: (result) => ({
        conversationId: (result as { conversationId?: string }).conversationId,
      }),
      persistRuntimeHint,
      errorWrapper: (message, cause) => new BrowserAutomationError(message, { stage: 'execute-browser' }, cause),
      color: {
        dim: chalk.dim,
        bold: chalk.bold,
        blue: chalk.blue,
        yellow: chalk.yellow,
      },
    },
  );
}
