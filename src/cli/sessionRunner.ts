import kleur from 'kleur';
import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  SessionMetadata,
  SessionMode,
  BrowserSessionConfig,
  BrowserRuntimeMetadata,
} from '../sessionStore.js';
import type { RunOracleOptions, UsageSummary } from '../oracle.js';
import {
  runOracle,
  OracleResponseError,
  OracleTransportError,
  extractResponseMetadata,
  asOracleUserError,
  extractTextOutput,
} from '../oracle.js';
import { runBrowserSessionExecution, type BrowserSessionRunnerDeps } from '../browser/sessionRunner.js';
import {
  isActiveGenerationObservationExpiry,
  readBrowserResponseProgressEvidence,
  reconcileBrowserRuntimeWithResponseProgress,
} from '../browser/observationLease.js';
import { renderMarkdownAnsi } from './markdownRenderer.js';
import { formatResponseMetadata, formatTransportMetadata } from './sessionDisplay.js';
import { markErrorLogged } from './errorUtils.js';
import {
  type NotificationSettings,
  sendSessionNotification,
  deriveNotificationSettingsFromMetadata,
} from './notifier.js';
import { sessionStore } from '../sessionStore.js';
import { runMultiModelApiSession } from '../oracle/multiModelRunner.js';
import { MODEL_CONFIGS, DEFAULT_SYSTEM_PROMPT } from '../oracle/config.js';
import { isKnownModel } from '../oracle/modelResolver.js';
import { resolveModelConfig } from '../oracle/modelResolver.js';
import { buildPrompt, buildRequestBody } from '../oracle/request.js';
import { estimateRequestTokens } from '../oracle/tokenEstimate.js';
import { formatTokenEstimate, formatTokenValue } from '../oracle/runUtils.js';
import { formatFinishLine } from '../oracle/finishLine.js';
import { sanitizeOscProgress } from './oscUtils.js';
import { readFiles } from '../oracle/files.js';
import { cwd as getCwd } from 'node:process';

const isTty = process.stdout.isTTY;
const dim = (text: string): string => (isTty ? kleur.dim(text) : text);
const DEFAULT_BROWSER_OVERALL_TIMEOUT_SECONDS = 60 * 60;

export interface SessionRunParams {
  sessionMeta: SessionMetadata;
  runOptions: RunOracleOptions;
  mode: SessionMode;
  browserConfig?: BrowserSessionConfig;
  cwd: string;
  log: (message?: string) => void;
  write: (chunk: string) => boolean;
  version: string;
  notifications?: NotificationSettings;
  browserDeps?: BrowserSessionRunnerDeps;
  muteStdout?: boolean;
  abortSignal?: AbortSignal;
}
export class SessionRunTimeoutError extends Error {
  readonly timeoutSeconds: number;

  constructor(timeoutSeconds: number) {
    super(`AuraCall session timed out after ${timeoutSeconds} seconds.`);
    this.name = 'SessionRunTimeoutError';
    this.timeoutSeconds = timeoutSeconds;
  }
}

export class SessionRunCancelledError extends Error {
  readonly signal: NodeJS.Signals;

  constructor(signal: NodeJS.Signals) {
    super(`AuraCall session cancelled by ${signal}.`);
    this.name = 'SessionRunCancelledError';
    this.signal = signal;
  }
}

export async function performSessionRun({
  sessionMeta,
  runOptions,
  mode,
  browserConfig,
  cwd,
  log,
  write,
  version,
  notifications,
  browserDeps,
  muteStdout = false,
  abortSignal,
}: SessionRunParams): Promise<void> {
  const browserAbortController = mode === 'browser' ? new AbortController() : null;
  const forwardAbort = (): void => {
    if (!browserAbortController || browserAbortController.signal.aborted) {
      return;
    }
    browserAbortController.abort(abortSignal?.reason ?? new SessionRunCancelledError('SIGINT'));
  };
  if (abortSignal?.aborted) {
    forwardAbort();
  } else {
    abortSignal?.addEventListener('abort', forwardAbort, { once: true });
  }
  const processSignals: NodeJS.Signals[] = mode === 'browser' ? ['SIGINT', 'SIGTERM', 'SIGQUIT'] : [];
  const handleProcessSignal = (signal: NodeJS.Signals): void => {
    if (!browserAbortController?.signal.aborted) {
      browserAbortController?.abort(new SessionRunCancelledError(signal));
    }
  };
  const processSignalHandlers = new Map<NodeJS.Signals, () => void>();
  for (const signal of processSignals) {
    const handler = (): void => handleProcessSignal(signal);
    processSignalHandlers.set(signal, handler);
    process.on(signal, handler);
  }
  const overallTimeoutSeconds = mode === 'browser'
    ? typeof runOptions.timeoutSeconds === 'number' && runOptions.timeoutSeconds > 0
      ? runOptions.timeoutSeconds
      : DEFAULT_BROWSER_OVERALL_TIMEOUT_SECONDS
    : null;
  const overallTimeout =
    browserAbortController && overallTimeoutSeconds !== null
      ? setTimeout(() => {
          browserAbortController.abort(new SessionRunTimeoutError(overallTimeoutSeconds));
        }, overallTimeoutSeconds * 1000)
      : null;
  const writeInline = (chunk: string): boolean => {
    // Keep session logs intact while still echoing inline output to the user.
    write(chunk);
    return muteStdout ? true : process.stdout.write(chunk);
  };
  const browserContext = sessionMeta.browser?.context;
  let latestBrowserRuntime = sessionMeta.browser?.runtime;
  const notificationSettings = notifications ?? deriveNotificationSettingsFromMetadata(sessionMeta, process.env);
  const modelForStatus = runOptions.model ?? sessionMeta.model;
  try {
    await sessionStore.updateSession(sessionMeta.id, {
      status: 'running',
      startedAt: new Date().toISOString(),
      mode,
      ...(browserConfig ? { browser: { config: browserConfig, context: browserContext } } : {}),
    });
    if (mode === 'browser') {
      if (!browserConfig) {
        throw new Error('Missing browser configuration for session.');
      }
      if (modelForStatus) {
        await sessionStore.updateModelRun(sessionMeta.id, modelForStatus, {
          status: 'running',
          startedAt: new Date().toISOString(),
        });
      }
      const runnerDeps = {
        ...browserDeps,
        persistRuntimeHint: async (runtime: BrowserRuntimeMetadata) => {
          if (browserAbortController?.signal.aborted) {
            return;
          }
          latestBrowserRuntime = runtime;
          await sessionStore.updateSession(sessionMeta.id, {
            status: 'running',
            browser: { config: browserConfig, runtime, context: browserContext },
          });
        },
      };
      const result = await runBrowserSessionExecution(
        { runOptions, browserConfig, cwd, log, abortSignal: browserAbortController?.signal },
        runnerDeps,
      );
      browserAbortController?.signal.throwIfAborted();
      if (overallTimeout) {
        clearTimeout(overallTimeout);
      }
      if (modelForStatus) {
        await sessionStore.updateModelRun(sessionMeta.id, modelForStatus, {
          status: 'completed',
          completedAt: new Date().toISOString(),
          usage: result.usage,
        });
      }
      await sessionStore.updateSession(sessionMeta.id, {
        status: 'completed',
        completedAt: new Date().toISOString(),
        errorMessage: undefined,
        usage: result.usage,
        elapsedMs: result.elapsedMs,
        browser: {
          config: browserConfig,
          runtime: result.runtime,
          context: browserContext,
        },
        response: undefined,
        transport: undefined,
        error: undefined,
      });
      await writeAssistantOutput(runOptions.writeOutputPath, result.answerText ?? '', log);
      await sendSessionNotification(
        {
          sessionId: sessionMeta.id,
          sessionName: sessionMeta.options?.slug ?? sessionMeta.id,
          mode,
          model: sessionMeta.model,
          usage: result.usage,
          characters: result.answerText?.length,
        },
        notificationSettings,
        log,
        result.answerText?.slice(0, 140),
      );
      return;
    }
    const multiModels = Array.isArray(runOptions.models) ? runOptions.models.filter(Boolean) : [];
    if (multiModels.length > 1) {
      const [primaryModel] = multiModels;
      if (!primaryModel) {
        throw new Error('Missing model name for multi-model run.');
      }
      const modelConfig = await resolveModelConfig(primaryModel, {
        baseUrl: runOptions.baseUrl,
        openRouterApiKey: process.env.OPENROUTER_API_KEY,
      });
      const files = await readFiles(runOptions.file ?? [], { cwd });
      const promptWithFiles = buildPrompt(runOptions.prompt, files, cwd);
      const requestBody = buildRequestBody({
        modelConfig,
        systemPrompt: runOptions.system ?? DEFAULT_SYSTEM_PROMPT,
        userPrompt: promptWithFiles,
        searchEnabled: runOptions.search !== false,
        maxOutputTokens: runOptions.maxOutput,
        background: runOptions.background,
        storeResponse: runOptions.background,
      });
      const estimatedTokens = estimateRequestTokens(requestBody, modelConfig);
      const tokenLabel = formatTokenEstimate(estimatedTokens, (text) => (isTty ? kleur.green(text) : text));
      const filesPhrase = files.length === 0 ? 'no files' : `${files.length} files`;
      const modelsLabel = multiModels.join(', ');
      log(`Calling ${isTty ? kleur.cyan(modelsLabel) : modelsLabel} — ${tokenLabel} tokens, ${filesPhrase}.`);

      const multiRunTips: string[] = [];
      if (files.length === 0) {
        multiRunTips.push('Tip: no files attached — Aura-Call works best with project context. Add files via --file path/to/code or docs.');
      }
      const shortPrompt = (runOptions.prompt?.trim().length ?? 0) < 80;
      if (shortPrompt) {
        multiRunTips.push('Tip: brief prompts often yield generic answers — aim for 6–30 sentences and attach key files.');
      }
      for (const tip of multiRunTips) {
        log(dim(tip));
      }

      // Surface long-running model expectations up front so users know why a response might lag.
      const longRunningModels = multiModels.filter(
        (model) => isKnownModel(model) && MODEL_CONFIGS[model]?.reasoning?.effort === 'high',
      );
      if (longRunningModels.length > 0) {
        for (const model of longRunningModels) {
          log('');
          const headingLabel = `[${model}]`;
          log(isTty ? kleur.bold(headingLabel) : headingLabel);
          log(dim('This model can take up to 60 minutes (usually replies much faster).'));
          log(dim('Press Ctrl+C to cancel.'));
        }
      }

      const shouldStreamInline = !muteStdout && process.stdout.isTTY;
      const shouldRenderMarkdown = shouldStreamInline && runOptions.renderPlain !== true;
      const printedModels = new Set<string>();
      const answerFallbacks = new Map<string, string>();
      const stripOscProgress = (text: string): string => sanitizeOscProgress(text, shouldStreamInline);

      const printModelLog = async (model: string) => {
        if (printedModels.has(model)) return;
        printedModels.add(model);
        const body = stripOscProgress(await sessionStore.readModelLog(sessionMeta.id, model));
        log('');
        const fallback = answerFallbacks.get(model);
        const hasBody = body.length > 0;
        if (!hasBody && !fallback) {
          log(dim(`${model}: (no output recorded)`));
          return;
        }
        const headingLabel = `[${model}]`;
        const heading = shouldStreamInline ? kleur.bold(headingLabel) : headingLabel;
        log(heading);
        const content = hasBody ? body : fallback ?? '';
        const printable = shouldRenderMarkdown ? renderMarkdownAnsi(content) : content;
        writeInline(printable);
        if (!printable.endsWith('\n')) {
          log('');
        }
      };

      const summary = await runMultiModelApiSession(
        {
          sessionMeta,
          runOptions,
          models: multiModels,
          cwd,
          version,
          onModelDone: shouldStreamInline
            ? async (result) => {
                if (result.answerText) {
                  answerFallbacks.set(result.model, result.answerText);
                }
                await printModelLog(result.model);
              }
            : undefined,
        },
        {
          runOracleImpl: muteStdout
            ? (opts, deps) => runOracle(opts, { ...deps, allowStdout: false })
            : undefined,
        },
      );

      if (!shouldStreamInline) {
        // If we couldn't stream inline (e.g., non-TTY), print all logs after completion.
        for (const [index, result] of summary.fulfilled.entries()) {
          if (index > 0) {
            log('');
          }
          await printModelLog(result.model);
        }
      }
      const aggregateUsage = summary.fulfilled.reduce<UsageSummary>(
        (acc, entry) => ({
          inputTokens: acc.inputTokens + entry.usage.inputTokens,
          outputTokens: acc.outputTokens + entry.usage.outputTokens,
          reasoningTokens: acc.reasoningTokens + entry.usage.reasoningTokens,
          totalTokens: acc.totalTokens + entry.usage.totalTokens,
          cost: (acc.cost ?? 0) + (entry.usage.cost ?? 0),
        }),
        { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0, cost: 0 },
      );
      const tokensDisplay = [
        aggregateUsage.inputTokens,
        aggregateUsage.outputTokens,
        aggregateUsage.reasoningTokens,
        aggregateUsage.totalTokens,
      ]
        .map((v, idx) =>
          formatTokenValue(
            v,
            {
              input_tokens: aggregateUsage.inputTokens,
              output_tokens: aggregateUsage.outputTokens,
              reasoning_tokens: aggregateUsage.reasoningTokens,
              total_tokens: aggregateUsage.totalTokens,
            },
            idx,
          ),
        )
        .join('/');
      const tokensPart = (() => {
        const parts = tokensDisplay.split('/');
        if (parts.length !== 4) return tokensDisplay;
        return `↑${parts[0]} ↓${parts[1]} ↻${parts[2]} Δ${parts[3]}`;
      })();
      const statusColor = summary.rejected.length === 0 ? kleur.green : summary.fulfilled.length > 0 ? kleur.yellow : kleur.red;
      const overallText = `${summary.fulfilled.length}/${multiModels.length} models`;
      const { line1 } = formatFinishLine({
        elapsedMs: summary.elapsedMs,
        model: overallText,
        costUsd: aggregateUsage.cost ?? null,
        tokensPart,
      });
      log(statusColor(line1));

      const hasFailure = summary.rejected.length > 0;
      await sessionStore.updateSession(sessionMeta.id, {
        status: hasFailure ? 'error' : 'completed',
        completedAt: new Date().toISOString(),
        ...(hasFailure ? {} : { errorMessage: undefined }),
        usage: aggregateUsage,
        elapsedMs: summary.elapsedMs,
        response: undefined,
        transport: undefined,
        error: undefined,
      });
      const totalCharacters = summary.fulfilled.reduce((sum, entry) => sum + entry.answerText.length, 0);
      await sendSessionNotification(
        {
          sessionId: sessionMeta.id,
          sessionName: sessionMeta.options?.slug ?? sessionMeta.id,
          mode,
          model: `${multiModels.length} models`,
          usage: aggregateUsage,
          characters: totalCharacters,
        },
        notificationSettings,
        log,
      );
      if (runOptions.writeOutputPath) {
        const savedOutputs: Array<{ model: string; path: string }> = [];
        for (const entry of summary.fulfilled) {
          const modelOutputPath = deriveModelOutputPath(runOptions.writeOutputPath, entry.model);
          const savedPath = await writeAssistantOutput(modelOutputPath, entry.answerText, log);
          if (savedPath) {
            savedOutputs.push({ model: entry.model, path: savedPath });
          }
        }
        if (savedOutputs.length > 0) {
          log(dim('Saved outputs:'));
          for (const item of savedOutputs) {
            log(dim(`- ${item.model} -> ${item.path}`));
          }
        }
      }
      if (hasFailure) {
        throw summary.rejected[0].reason;
      }
      return;
    }
    const singleModelOverride = multiModels.length === 1 ? multiModels[0] : undefined;
    const apiRunOptions: RunOracleOptions = singleModelOverride
      ? { ...runOptions, model: singleModelOverride, models: undefined }
      : runOptions;
    if (modelForStatus && singleModelOverride == null) {
      await sessionStore.updateModelRun(sessionMeta.id, modelForStatus, {
        status: 'running',
        startedAt: new Date().toISOString(),
      });
    }
    const result = await runOracle(apiRunOptions, {
      cwd,
      log,
      write,
      allowStdout: !muteStdout,
    });
    if (result.mode !== 'live') {
      throw new Error('Unexpected preview result while running a session.');
    }
    await sessionStore.updateSession(sessionMeta.id, {
      status: 'completed',
      completedAt: new Date().toISOString(),
      errorMessage: undefined,
      usage: result.usage,
      elapsedMs: result.elapsedMs,
      response: extractResponseMetadata(result.response),
      transport: undefined,
      error: undefined,
    });
    if (modelForStatus && singleModelOverride == null) {
      await sessionStore.updateModelRun(sessionMeta.id, modelForStatus, {
        status: 'completed',
        completedAt: new Date().toISOString(),
        usage: result.usage,
      });
    }
    const answerText = extractTextOutput(result.response);
    await writeAssistantOutput(runOptions.writeOutputPath, answerText, log);
    await sendSessionNotification(
      {
        sessionId: sessionMeta.id,
        sessionName: sessionMeta.options?.slug ?? sessionMeta.id,
        mode,
        model: sessionMeta.model ?? runOptions.model,
        usage: result.usage,
        characters: answerText.length,
      },
      notificationSettings,
      log,
      answerText.slice(0, 140),
    );
  } catch (error: unknown) {
    const message = formatError(error);
    log(`ERROR: ${message}`);
    markErrorLogged(error);
    const userError = asOracleUserError(error);
    const browserResponseProgress = readBrowserResponseProgressEvidence(error);
    const browserRuntime =
      userError?.category === 'browser-automation'
        ? ((userError.details as { runtime?: BrowserRuntimeMetadata } | undefined)?.runtime ?? undefined)
        : undefined;
    const connectionLost =
      userError?.category === 'browser-automation' && (userError.details as { stage?: string } | undefined)?.stage === 'connection-lost';
    const observationRuntime = reconcileBrowserRuntimeWithResponseProgress(
      latestBrowserRuntime,
      browserResponseProgress,
    );
    const observationExpiredWhileGenerationActive =
      isActiveGenerationObservationExpiry(error) &&
      hasExactBrowserReattachIdentity(observationRuntime);
    if (observationExpiredWhileGenerationActive && mode === 'browser') {
      const incompleteReason = 'observation_expired_generation_active';
      const recoveryError = {
        category: 'browser-observation-expired',
        message,
        details: {
          browserResponseProgress,
          recovery: 'read-only-reattach',
        },
      };
      log(
        dim(
          `Observation lease expired while ChatGPT was still generating; keeping the exact turn running for read-only reattach with auracall session ${sessionMeta.id}.`,
        ),
      );
      if (modelForStatus) {
        await sessionStore.updateModelRun(sessionMeta.id, modelForStatus, {
          status: 'running',
          completedAt: undefined,
          response: { status: 'running', incompleteReason },
          error: recoveryError,
        });
      }
      await sessionStore.updateSession(sessionMeta.id, {
        status: 'running',
        completedAt: undefined,
        errorMessage: message,
        mode,
        browser: {
          config: browserConfig,
          runtime: observationRuntime,
          context: browserContext,
        },
        response: { status: 'running', incompleteReason },
        transport: undefined,
        error: recoveryError,
      });
      return;
    }
    if (connectionLost && mode === 'browser') {
      const runtime = (userError.details as { runtime?: BrowserRuntimeMetadata } | undefined)?.runtime;
      log(dim('Chrome disconnected before completion; keeping session running for reattach.'));
      if (modelForStatus) {
        await sessionStore.updateModelRun(sessionMeta.id, modelForStatus, {
          status: 'running',
          completedAt: undefined,
        });
      }
      await sessionStore.updateSession(sessionMeta.id, {
        status: 'running',
        errorMessage: message,
        mode,
        browser: {
          config: browserConfig,
          runtime: runtime ?? sessionMeta.browser?.runtime,
        },
        response: { status: 'running', incompleteReason: 'chrome-disconnected' },
      });
      return;
    }
    if (userError) {
      log(dim(`User error (${userError.category}): ${userError.message}`));
    }
    const responseMetadata = error instanceof OracleResponseError ? error.metadata : undefined;
    const metadataLine = formatResponseMetadata(responseMetadata);
    if (metadataLine) {
      log(dim(`Response metadata: ${metadataLine}`));
    }
    const transportMetadata = error instanceof OracleTransportError ? { reason: error.reason } : undefined;
    const transportLine = formatTransportMetadata(transportMetadata);
    if (transportLine) {
      log(dim(`Transport: ${transportLine}`));
    }
    const terminalStatus = error instanceof SessionRunCancelledError ? 'cancelled' : 'error';
    await sessionStore.updateSession(sessionMeta.id, {
      status: terminalStatus,
      completedAt: new Date().toISOString(),
      errorMessage: message,
      mode,
      browser: browserConfig
        ? {
            config: browserConfig,
            runtime: browserRuntime ?? sessionMeta.browser?.runtime,
          }
        : undefined,
      response: responseMetadata,
      transport: transportMetadata,
      error: userError
        ? {
            category: userError.category,
            message: userError.message,
            details: userError.details,
          }
        : browserResponseProgress
          ? {
              category: 'browser-terminal-response',
              message,
              details: { browserResponseProgress },
            }
          : undefined,
    });
    if (modelForStatus) {
      await sessionStore.updateModelRun(sessionMeta.id, modelForStatus, {
        status: terminalStatus,
        completedAt: new Date().toISOString(),
        error: userError
          ? {
              category: userError.category,
              message: userError.message,
              details: userError.details,
            }
          : browserResponseProgress
            ? {
                category: 'browser-terminal-response',
                message,
                details: { browserResponseProgress },
              }
            : undefined,
      });
    }
    throw error;
  } finally {
    if (overallTimeout) {
      clearTimeout(overallTimeout);
    }
    abortSignal?.removeEventListener('abort', forwardAbort);
    for (const signal of processSignals) {
      const handler = processSignalHandlers.get(signal);
      if (handler) {
        process.removeListener(signal, handler);
      }
    }
  }
}

function hasExactBrowserReattachIdentity(runtime: BrowserRuntimeMetadata | undefined): runtime is BrowserRuntimeMetadata {
  return Boolean(
    runtime &&
      typeof runtime.chromePort === 'number' &&
      typeof runtime.chromeTargetId === 'string' &&
      runtime.chromeTargetId.trim().length > 0 &&
      typeof runtime.tabUrl === 'string' &&
      runtime.tabUrl.trim().length > 0 &&
      typeof runtime.conversationId === 'string' &&
      runtime.conversationId.trim().length > 0,
  );
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function writeAssistantOutput(targetPath: string | undefined, content: string, log: (message: string) => void) {
  if (!targetPath) return;
  if (!content || content.trim().length === 0) {
    log(dim('write-output skipped: no assistant content to save.'));
    return;
  }
  const normalizedTarget = path.resolve(targetPath);
  const normalizedSessionsDir = path.resolve(sessionStore.sessionsDir());
  if (
    normalizedTarget === normalizedSessionsDir ||
    normalizedTarget.startsWith(`${normalizedSessionsDir}${path.sep}`)
  ) {
    log(dim(`write-output skipped: refusing to write inside session storage (${normalizedSessionsDir}).`));
    return;
  }
  try {
    await fs.mkdir(path.dirname(normalizedTarget), { recursive: true });
    const payload = content.endsWith('\n') ? content : `${content}\n`;
    await fs.writeFile(normalizedTarget, payload, 'utf8');
    log(dim(`Saved assistant output to ${normalizedTarget}`));
    return normalizedTarget;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (isPermissionError(error)) {
      const fallbackPath = buildFallbackPath(normalizedTarget);
      if (fallbackPath) {
        try {
          await fs.mkdir(path.dirname(fallbackPath), { recursive: true });
          const payload = content.endsWith('\n') ? content : `${content}\n`;
          await fs.writeFile(fallbackPath, payload, 'utf8');
          log(dim(`write-output fallback to ${fallbackPath} (original failed: ${reason})`));
          return fallbackPath;
        } catch (innerError) {
          const innerReason = innerError instanceof Error ? innerError.message : String(innerError);
          log(dim(`write-output failed (${reason}); fallback failed (${innerReason}); session completed anyway.`));
          return;
        }
      }
    }
    log(dim(`write-output failed (${reason}); session completed anyway.`));
  }
}

export function deriveModelOutputPath(basePath: string | undefined, model: string): string | undefined {
  if (!basePath) return undefined;
  const ext = path.extname(basePath);
  const stem = path.basename(basePath, ext);
  const dir = path.dirname(basePath);
  const suffix = ext.length > 0 ? `${stem}.${model}${ext}` : `${stem}.${model}`;
  return path.join(dir, suffix);
}

function isPermissionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as { code?: string }).code;
  return code === 'EACCES' || code === 'EPERM';
}

function buildFallbackPath(original: string): string | null {
  const ext = path.extname(original);
  const stem = path.basename(original, ext);
  const dir = getCwd();
  const candidate = ext ? `${stem}.fallback${ext}` : `${stem}.fallback`;
  const fallback = path.join(dir, candidate);
  const normalizedSessionsDir = path.resolve(sessionStore.sessionsDir());
  const normalizedFallback = path.resolve(fallback);
  if (
    normalizedFallback === normalizedSessionsDir ||
    normalizedFallback.startsWith(`${normalizedSessionsDir}${path.sep}`)
  ) {
    return null;
  }
  return fallback;
}
