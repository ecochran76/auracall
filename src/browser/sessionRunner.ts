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
  type BrowserSessionRunnerDeps as CoreBrowserSessionRunnerDeps,
} from '../../packages/browser-service/src/sessionRunner.js';
import type { BrowserRunOptions, BrowserRunResult } from './types.js';

interface RunBrowserSessionArgs {
  runOptions: RunOracleOptions;
  browserConfig: BrowserSessionConfig;
  cwd: string;
  log: (message?: string) => void;
}

type ExecuteBrowserInput = Parameters<typeof runBrowserMode>[0] | Parameters<CoreBrowserSessionRunnerDeps['executeBrowser']>[0];

export type BrowserSessionRunnerDeps = {
  assemblePrompt?: typeof assembleBrowserPrompt;
  executeBrowser?: (options: ExecuteBrowserInput) => Promise<BrowserRunResult>;
  persistRuntimeHint?: (runtime: BrowserRuntimeMetadata) => Promise<void> | void;
};

export async function runBrowserSessionExecution(
  { runOptions, browserConfig, cwd, log }: RunBrowserSessionArgs,
  deps: BrowserSessionRunnerDeps = {},
): Promise<BrowserExecutionResult> {
  const assemblePrompt = async (
    options: { runLabel: string; verbose?: boolean; silent?: boolean; file?: string[]; heartbeatIntervalMs?: number },
    context: { cwd: string },
  ) => {
    const assembledOptions: RunOracleOptions = {
      ...runOptions,
      model: options.runLabel,
      verbose: options.verbose ?? runOptions.verbose,
      silent: options.silent ?? runOptions.silent,
      file: options.file ?? runOptions.file,
      heartbeatIntervalMs: options.heartbeatIntervalMs ?? runOptions.heartbeatIntervalMs,
    };
    return (deps.assemblePrompt ?? assembleBrowserPrompt)(assembledOptions, { cwd: context.cwd });
  };
  const executeBrowser = async (options: {
    prompt: string;
    attachments: Array<{ path: string; displayPath: string; sizeBytes?: number }>;
    fallbackSubmission?: { prompt: string; attachments: Array<{ path: string; displayPath: string; sizeBytes?: number }> };
    config: { timeoutMs?: number | null };
    log: typeof runBrowserMode extends (args: infer A) => Promise<unknown> ? A extends { log?: infer L } ? L : never : never;
    heartbeatIntervalMs?: number;
    verbose?: boolean;
    runtimeHintCb?: (hint: BrowserRuntimeMetadata) => void | Promise<void>;
  }) => {
    const config = options.config && options.config.timeoutMs == null
      ? { ...options.config, timeoutMs: undefined }
      : options.config;
    return (deps.executeBrowser ?? runBrowserMode)({
      ...options,
      config,
    } as Parameters<typeof runBrowserMode>[0]);
  };
  const persistRuntimeHint = deps.persistRuntimeHint;
  const runOptionsForCore = { ...runOptions, runLabel: runOptions.model };

  return runBrowserSessionExecutionCore(
    { runOptions: runOptionsForCore, browserConfig, cwd, log },
    {
      assemblePrompt,
      executeBrowser,
      formatTokenCount,
      formatFinishLine: (options) => formatFinishLine({ ...options, model: options.label }),
      runtimeExtras: (result) => ({
        conversationId: (result as { conversationId?: string }).conversationId,
        composerTool: (result as { composerTool?: string | null }).composerTool ?? undefined,
        thinkingTime: (result as { thinkingTime?: string }).thinkingTime,
        chatgptProMode: (result as { chatgptProMode?: string }).chatgptProMode,
        chatgptAccountLevel: (result as { chatgptAccountLevel?: string }).chatgptAccountLevel,
        chatgptAccountPlanType: (result as { chatgptAccountPlanType?: string }).chatgptAccountPlanType,
        chatgptAccountStructure: (result as { chatgptAccountStructure?: string }).chatgptAccountStructure,
        chatgptDeepResearchStage: (result as { chatgptDeepResearchStage?: string }).chatgptDeepResearchStage,
        chatgptDeepResearchStartMethod:
          (result as { chatgptDeepResearchStartMethod?: string }).chatgptDeepResearchStartMethod,
        chatgptDeepResearchStartLabel:
          (result as { chatgptDeepResearchStartLabel?: string | null }).chatgptDeepResearchStartLabel,
        chatgptDeepResearchModifyPlanVisible:
          (result as { chatgptDeepResearchModifyPlanVisible?: boolean }).chatgptDeepResearchModifyPlanVisible,
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
