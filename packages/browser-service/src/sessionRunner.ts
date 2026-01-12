import type { BrowserAttachment, BrowserLogger, BrowserRunResult, BrowserRuntimeMetadata } from './types.js';

export interface BrowserPromptArtifacts {
  composerText: string;
  attachments: BrowserAttachment[];
  fallback?: {
    composerText: string;
    attachments: BrowserAttachment[];
  };
  bundled?: {
    originalCount: number;
    bundlePath: string;
  };
  estimatedInputTokens: number;
  attachmentMode: 'inline' | 'upload';
}

export interface RunOptionsLike {
  model: string;
  verbose?: boolean;
  silent?: boolean;
  file?: string[];
  heartbeatIntervalMs?: number;
}

export interface BrowserSessionConfigLike {
  timeoutMs?: number | null;
}

export interface BrowserExecutionResult<TRuntime extends BrowserRuntimeMetadata = BrowserRuntimeMetadata> {
  usage: {
    inputTokens: number;
    outputTokens: number;
    reasoningTokens: number;
    totalTokens: number;
  };
  elapsedMs: number;
  runtime: TRuntime;
  answerText: string;
}

export interface BrowserSessionRunnerDeps {
  assemblePrompt: (options: RunOptionsLike, context: { cwd: string }) => Promise<BrowserPromptArtifacts>;
  executeBrowser: (options: {
    prompt: string;
    attachments: BrowserAttachment[];
    fallbackSubmission?: { prompt: string; attachments: BrowserAttachment[] };
    config: BrowserSessionConfigLike;
    log: BrowserLogger;
    heartbeatIntervalMs?: number;
    verbose?: boolean;
    runtimeHintCb?: (hint: BrowserRuntimeMetadata) => void | Promise<void>;
  }) => Promise<BrowserRunResult>;
  formatTokenCount: (value: number) => string;
  formatFinishLine: (options: {
    elapsedMs: number;
    model: string;
    tokensPart: string;
    detailParts: Array<string | null>;
  }) => { line1: string; line2?: string };
  runtimeExtras?: (result: BrowserRunResult) => Partial<BrowserRuntimeMetadata>;
  color?: {
    dim?: (value: string) => string;
    bold?: (value: string) => string;
    blue?: (value: string) => string;
    yellow?: (value: string) => string;
  };
  persistRuntimeHint?: (runtime: BrowserRuntimeMetadata) => Promise<void> | void;
  errorWrapper?: (message: string, cause: unknown) => Error;
}

export async function runBrowserSessionExecutionCore(
  options: {
    runOptions: RunOptionsLike;
    browserConfig: BrowserSessionConfigLike;
    cwd: string;
    log: (message?: string) => void;
  },
  deps: BrowserSessionRunnerDeps,
): Promise<BrowserExecutionResult> {
  const { runOptions, browserConfig, cwd, log } = options;
  const promptArtifacts = await deps.assemblePrompt(runOptions, { cwd });
  const color = deps.color ?? {};
  const dim = color.dim ?? ((value: string) => value);
  const bold = color.bold ?? ((value: string) => value);
  const blue = color.blue ?? ((value: string) => value);
  const yellow = color.yellow ?? ((value: string) => value);
  if (runOptions.verbose) {
    log(dim(`[verbose] Browser config: ${JSON.stringify({ ...browserConfig })}`));
    log(dim(`[verbose] Browser prompt length: ${promptArtifacts.composerText.length} chars`));
    if (promptArtifacts.attachments.length > 0) {
      const attachmentList = promptArtifacts.attachments.map((attachment) => attachment.displayPath).join(', ');
      log(dim(`[verbose] Browser attachments: ${attachmentList}`));
      if (promptArtifacts.bundled) {
        log(
          yellow(
            `[browser] Bundled ${promptArtifacts.bundled.originalCount} files into ${promptArtifacts.bundled.bundlePath}.`,
          ),
        );
      }
    } else if (runOptions.file && runOptions.file.length > 0 && promptArtifacts.attachmentMode === 'inline') {
      log(dim('[verbose] Browser will paste file contents inline (no uploads).'));
    }
  }
  if (promptArtifacts.bundled) {
    log(
      dim(
        `Packed ${promptArtifacts.bundled.originalCount} files into 1 bundle (contents counted in token estimate).`,
      ),
    );
  }
  const headerLine = `Launching browser mode (${runOptions.model}) with ~${promptArtifacts.estimatedInputTokens.toLocaleString()} tokens.`;
  const automationLogger: BrowserLogger = ((message?: string) => {
    if (typeof message !== 'string') return;
    const shouldAlwaysPrint = message.startsWith('[browser] ') && /fallback|retry/i.test(message);
    if (!runOptions.verbose && !shouldAlwaysPrint) return;
    log(message);
  }) as BrowserLogger;
  automationLogger.verbose = Boolean(runOptions.verbose);
  automationLogger.sessionLog = runOptions.verbose ? log : (() => {});

  log(headerLine);
  log(dim('This run can take up to an hour (usually ~10 minutes).'));
  if (runOptions.verbose) {
    log(dim('Chrome automation does not stream output; this may take a minute...'));
  }

  const persistRuntimeHint = deps.persistRuntimeHint ?? (() => {});
  let browserResult: BrowserRunResult;
  try {
    browserResult = await deps.executeBrowser({
      prompt: promptArtifacts.composerText,
      attachments: promptArtifacts.attachments,
      fallbackSubmission: promptArtifacts.fallback
        ? { prompt: promptArtifacts.fallback.composerText, attachments: promptArtifacts.fallback.attachments }
        : undefined,
      config: browserConfig,
      log: automationLogger,
      heartbeatIntervalMs: runOptions.heartbeatIntervalMs,
      verbose: runOptions.verbose,
      runtimeHintCb: async (runtime) => {
        await persistRuntimeHint({ ...runtime, controllerPid: runtime.controllerPid ?? process.pid });
      },
    });
  } catch (error) {
    if (deps.errorWrapper) {
      throw deps.errorWrapper(error instanceof Error ? error.message : 'Browser automation failed.', error);
    }
    throw error;
  }

  if (!runOptions.silent) {
    log(bold('Answer:'));
    log(browserResult.answerMarkdown || browserResult.answerText || dim('(no text output)'));
    log('');
  }

  const answerText = browserResult.answerMarkdown || browserResult.answerText || '';
  const usage = {
    inputTokens: promptArtifacts.estimatedInputTokens,
    outputTokens: browserResult.answerTokens,
    reasoningTokens: 0,
    totalTokens: promptArtifacts.estimatedInputTokens + browserResult.answerTokens,
  };
  const tokensDisplay = [
    usage.inputTokens,
    usage.outputTokens,
    usage.reasoningTokens,
    usage.totalTokens,
  ]
    .map((value) => deps.formatTokenCount(value))
    .join('/');
  const tokensPart = (() => {
    const parts = tokensDisplay.split('/');
    if (parts.length !== 4) return tokensDisplay;
    return `↑${parts[0]} ↓${parts[1]} ↻${parts[2]} Δ${parts[3]}`;
  })();
  const { line1, line2 } = deps.formatFinishLine({
    elapsedMs: browserResult.tookMs,
    model: `${runOptions.model}[browser]`,
    tokensPart,
    detailParts: [runOptions.file && runOptions.file.length > 0 ? `files=${runOptions.file.length}` : null],
  });
  log(blue(line1));
  if (line2) {
    log(dim(line2));
  }
  const baseRuntime = {
    chromePid: browserResult.chromePid,
    chromePort: browserResult.chromePort,
    chromeHost: browserResult.chromeHost,
    userDataDir: browserResult.userDataDir,
    controllerPid: browserResult.controllerPid ?? process.pid,
    tabUrl: browserResult.tabUrl,
  };
  const runtimeExtras = deps.runtimeExtras?.(browserResult) ?? {};
  return {
    usage,
    elapsedMs: browserResult.tookMs,
    runtime: { ...baseRuntime, ...runtimeExtras },
    answerText,
  };
}
