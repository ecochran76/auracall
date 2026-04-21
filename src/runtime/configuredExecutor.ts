import fs from 'node:fs/promises';
import path from 'node:path';
import { createExecutionResponseMessage } from './apiModel.js';
import type { ExecuteStoredRunStepContext, ExecuteStoredRunStepResult } from './runner.js';
import type { ExecutionServiceHostDeps } from './serviceHost.js';
import { getRuntimeProfileBrowserProfileId, resolveRuntimeSelection } from '../config/model.js';
import { runBrowserMode } from '../browser/index.js';
import type { BrowserAttachment, BrowserRunOptions, CookieParam } from '../browser/types.js';
import { getAuracallHomeDir } from '../auracallHome.js';
import { createGeminiWebExecutor } from '../gemini-web/executor.js';
import { resolveManagedProfileCookieExportPath } from '../browser/profileStore.js';
import {
  clearLiveRuntimeRunServiceState,
  recordLiveRuntimeRunServiceState,
} from './liveServiceStateRegistry.js';
import {
  createStepOutputContractResult,
  parseAuraCallStepOutputEnvelope,
  prependAuraCallStepOutputContractPrompt,
  shouldUseAuraCallStepOutputContract,
} from './stepOutputContract.js';

type MutableRecord = Record<string, unknown>;

export interface CreateConfiguredStoredStepExecutorDeps {
  runBrowserModeImpl?: (options: BrowserRunOptions) => Promise<Awaited<ReturnType<typeof runBrowserMode>>>;
  runGeminiBrowserModeImpl?: (options: BrowserRunOptions) => Promise<Awaited<ReturnType<typeof runBrowserMode>>>;
}

function isRecord(value: unknown): value is MutableRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function readRuntimeServiceConfig(
  runtimeProfile: MutableRecord | null,
  service: 'chatgpt' | 'gemini' | 'grok',
): MutableRecord | null {
  if (!runtimeProfile || !isRecord(runtimeProfile.services)) {
    return null;
  }
  const entry = runtimeProfile.services[service];
  return isRecord(entry) ? entry : null;
}

function readGlobalServiceConfig(
  config: MutableRecord,
  service: 'chatgpt' | 'gemini' | 'grok',
): MutableRecord | null {
  if (!isRecord(config.services)) {
    return null;
  }
  const entry = config.services[service];
  return isRecord(entry) ? entry : null;
}

function readBrowserProfileConfig(value: unknown): MutableRecord | null {
  return isRecord(value) ? value : null;
}

function buildBrowserAttachments(context: ExecuteStoredRunStepContext): BrowserAttachment[] {
  return context.step.input.artifacts
    .map((artifact) => {
      const artifactPath = asNonEmptyString(artifact.path);
      if (!artifactPath) {
        return null;
      }
      const resolvedPath = path.isAbsolute(artifactPath) ? artifactPath : path.resolve(process.cwd(), artifactPath);
      return {
        path: resolvedPath,
        displayPath: artifactPath,
      } satisfies BrowserAttachment;
    })
    .filter((artifact): artifact is BrowserAttachment => artifact !== null);
}

function summarizeOutput(text: string): string {
  const normalized = text.trim().replace(/\s+/g, ' ');
  if (normalized.length <= 240) {
    return normalized;
  }
  return `${normalized.slice(0, 237)}...`;
}

function extractToolEnvelopeJson(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed;
  }
  const fenced = trimmed.match(/```json\s*([\s\S]*?)\s*```/i) ?? trimmed.match(/```\s*([\s\S]*?)\s*```/);
  return fenced?.[1]?.trim() ?? null;
}

function parseConfiguredExecutorLocalActionRequests(text: string): Array<Record<string, unknown>> {
  const jsonText = extractToolEnvelopeJson(text);
  if (!jsonText) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return [];
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.localActionRequests)) {
    return [];
  }

  return parsed.localActionRequests.flatMap((candidate) => {
    if (!isRecord(candidate)) {
      return [];
    }
    const kind =
      candidate.kind === 'shell'
        ? 'shell'
        : candidate.actionType === 'shell'
          ? 'shell'
          : candidate.type === 'shell'
            ? 'shell'
          : null;
    if (kind !== 'shell' || typeof candidate.command !== 'string') {
      return [];
    }
    const args = Array.isArray(candidate.args)
      ? candidate.args.filter((value): value is string => typeof value === 'string')
      : [];
    const structuredPayload =
      isRecord(candidate.structuredPayload)
        ? candidate.structuredPayload
        : isRecord(candidate.payload)
          ? candidate.payload
          : {};
    const notes = Array.isArray(candidate.notes)
      ? candidate.notes.filter((value): value is string => typeof value === 'string')
      : [];
    return [{
      kind: 'shell',
      summary:
        typeof candidate.summary === 'string' && candidate.summary.trim().length > 0
          ? candidate.summary
          : `Run bounded shell action: ${candidate.command}`,
      command: candidate.command,
      args,
      structuredPayload,
      notes,
    }];
  });
}

function parseInlineCookiesPayload(raw?: string | null): CookieParam[] | undefined {
  if (!raw) return undefined;
  const text = raw.trim();
  if (!text) return undefined;
  let jsonPayload = text;
  try {
    const decoded = Buffer.from(text, 'base64').toString('utf8');
    if (decoded.trim().startsWith('[')) {
      jsonPayload = decoded;
    }
  } catch {
    // not base64
  }
  try {
    const parsed = JSON.parse(jsonPayload) as unknown;
    return Array.isArray(parsed) ? (parsed as CookieParam[]) : undefined;
  } catch {
    return undefined;
  }
}

async function readInlineCookiesFromFile(filePath: string | null | undefined): Promise<CookieParam[] | undefined> {
  const candidate = asNonEmptyString(filePath);
  if (!candidate) return undefined;
  try {
    const content = await fs.readFile(candidate, 'utf8');
    return parseInlineCookiesPayload(content);
  } catch {
    return undefined;
  }
}

async function resolveConfiguredExecutorInlineCookies(
  manualLoginProfileDir: string | null,
): Promise<{ cookies: CookieParam[]; source: string } | null> {
  const envFile = asNonEmptyString(process.env.AURACALL_BROWSER_COOKIES_FILE);
  const envPayload = asNonEmptyString(process.env.AURACALL_BROWSER_COOKIES_JSON);

  const envFileCookies = await readInlineCookiesFromFile(envFile);
  if (envFileCookies) {
    return { cookies: envFileCookies, source: 'env-file' };
  }

  const envPayloadCookies = parseInlineCookiesPayload(envPayload);
  if (envPayloadCookies) {
    return { cookies: envPayloadCookies, source: 'env-payload' };
  }

  const scopedPath = manualLoginProfileDir
    ? resolveManagedProfileCookieExportPath(manualLoginProfileDir)
    : null;
  const scopedCookies = await readInlineCookiesFromFile(scopedPath);
  if (scopedCookies) {
    return { cookies: scopedCookies, source: 'scoped:cookies.json' };
  }

  const homePath = path.join(getAuracallHomeDir(), 'cookies.json');
  const homeCookies = await readInlineCookiesFromFile(homePath);
  if (homeCookies) {
    return { cookies: homeCookies, source: 'home:cookies.json' };
  }

  return null;
}

export function createConfiguredStoredStepExecutor(
  config: Record<string, unknown>,
  deps: CreateConfiguredStoredStepExecutorDeps = {},
): ExecutionServiceHostDeps['executeStoredRunStep'] {
  const runBrowserModeImpl = deps.runBrowserModeImpl ?? runBrowserMode;
  const runGeminiBrowserModeImpl = deps.runGeminiBrowserModeImpl ?? createGeminiWebExecutor({});
  const configRecord = config as MutableRecord;

  return async (context): Promise<ExecuteStoredRunStepResult> => {
    const runtimeSelection = resolveRuntimeSelection(configRecord, {
      explicitProfileName: context.step.runtimeProfileId,
      explicitAgentId: context.step.agentId,
    });
    const runtimeProfile = runtimeSelection.runtimeProfile;
    const engine = asNonEmptyString(runtimeProfile?.engine) ?? 'browser';
    const service = context.step.service ?? runtimeSelection.defaultService;
    if (engine !== 'browser') {
      throw new Error(
        `Stored team execution currently supports browser-backed runtime profiles only; step ${context.step.id} resolved engine ${engine}.`,
      );
    }
    if (service !== 'chatgpt' && service !== 'gemini' && service !== 'grok') {
      throw new Error(`Stored team execution requires a browser-capable service; step ${context.step.id} resolved ${service ?? 'none'}.`);
    }

    const runtimeServiceConfig = readRuntimeServiceConfig(runtimeProfile, service);
    const globalServiceConfig = readGlobalServiceConfig(configRecord, service);
    const browserConfigRecord = isRecord(configRecord.browser) ? configRecord.browser : null;
    const runtimeBrowserConfig = runtimeProfile && isRecord(runtimeProfile.browser) ? runtimeProfile.browser : null;
    const browserProfileConfig = readBrowserProfileConfig(runtimeSelection.browserProfile);

    const desiredModel =
      asNonEmptyString(runtimeServiceConfig?.model) ??
      asNonEmptyString(globalServiceConfig?.model) ??
      null;
    const targetUrl =
      asNonEmptyString(runtimeServiceConfig?.url) ??
      asNonEmptyString(globalServiceConfig?.url) ??
      null;
    const projectId =
      asNonEmptyString(runtimeServiceConfig?.projectId) ??
      asNonEmptyString(globalServiceConfig?.projectId) ??
      null;
    const manualLoginProfileDir =
      asNonEmptyString(runtimeServiceConfig?.manualLoginProfileDir) ??
      asNonEmptyString(runtimeBrowserConfig?.manualLoginProfileDir) ??
      asNonEmptyString(browserProfileConfig?.manualLoginProfileDir) ??
      asNonEmptyString(browserConfigRecord?.manualLoginProfileDir) ??
      null;
    const browserFamilyProfileName =
      manualLoginProfileDir && runtimeProfile
        ? getRuntimeProfileBrowserProfileId(runtimeProfile)
        : null;
    const inlineCookies =
      service === 'gemini'
        ? await resolveConfiguredExecutorInlineCookies(manualLoginProfileDir)
        : null;
    const prompt = asNonEmptyString(context.step.input.prompt);
    if (!prompt) {
      throw new Error(`Stored team step ${context.step.id} has no runnable prompt text.`);
    }
    const useStepOutputContract = shouldUseAuraCallStepOutputContract(context.step.input.structuredData);
    const effectivePrompt = useStepOutputContract
      ? prependAuraCallStepOutputContractPrompt(prompt)
      : prompt;

    const browserRunOptions: BrowserRunOptions = {
      prompt: effectivePrompt,
      attachments: buildBrowserAttachments(context),
      config: {
        auracallProfileName: browserFamilyProfileName ?? runtimeSelection.runtimeProfileId,
        selectedAgentId: context.step.agentId,
        target: service,
        projectId,
        conversationId: null,
        url: service === 'chatgpt' ? (targetUrl ?? undefined) : undefined,
        chatgptUrl: service === 'chatgpt' ? (targetUrl ?? undefined) : undefined,
        geminiUrl: service === 'gemini' ? (targetUrl ?? undefined) : undefined,
        grokUrl: service === 'grok' ? (targetUrl ?? undefined) : undefined,
        desiredModel,
        modelStrategy: desiredModel ? 'select' : 'ignore',
        keepBrowser:
          asBoolean(runtimeBrowserConfig?.keepBrowser) ??
          asBoolean(browserConfigRecord?.keepBrowser) ??
          false,
        hideWindow:
          asBoolean(runtimeBrowserConfig?.hideWindow) ??
          asBoolean(browserConfigRecord?.hideWindow) ??
          false,
        manualLogin: true,
        manualLoginProfileDir,
        chromePath:
          asNonEmptyString(runtimeBrowserConfig?.chromePath) ??
          asNonEmptyString(browserProfileConfig?.chromePath) ??
          asNonEmptyString(browserConfigRecord?.chromePath),
        chromeProfile:
          asNonEmptyString(runtimeBrowserConfig?.sourceProfileName) ??
          asNonEmptyString(runtimeBrowserConfig?.chromeProfile) ??
          asNonEmptyString(browserProfileConfig?.sourceProfileName) ??
          asNonEmptyString(browserProfileConfig?.chromeProfile) ??
          asNonEmptyString(browserConfigRecord?.chromeProfile),
        chromeCookiePath:
          asNonEmptyString(runtimeBrowserConfig?.sourceCookiePath) ??
          asNonEmptyString(runtimeBrowserConfig?.chromeCookiePath) ??
          asNonEmptyString(browserProfileConfig?.sourceCookiePath) ??
          asNonEmptyString(browserProfileConfig?.chromeCookiePath) ??
          asNonEmptyString(browserConfigRecord?.chromeCookiePath),
        bootstrapCookiePath:
          asNonEmptyString(runtimeBrowserConfig?.bootstrapCookiePath) ??
          asNonEmptyString(browserProfileConfig?.bootstrapCookiePath) ??
          asNonEmptyString(browserConfigRecord?.bootstrapCookiePath),
        inlineCookies: inlineCookies?.cookies,
        inlineCookiesSource: inlineCookies?.source ?? null,
        display:
          asNonEmptyString(runtimeBrowserConfig?.display) ??
          asNonEmptyString(browserProfileConfig?.display) ??
          asNonEmptyString(browserConfigRecord?.display),
        managedProfileRoot:
          asNonEmptyString(runtimeBrowserConfig?.managedProfileRoot) ??
          asNonEmptyString(browserProfileConfig?.managedProfileRoot) ??
          asNonEmptyString(browserConfigRecord?.managedProfileRoot),
        allowCookieErrors: true,
        manualLoginWaitForSession: false,
      },
      log: (() => undefined) as typeof console.log,
      verbose: false,
    };

    const liveBrowserServiceStateKey =
      service === 'gemini' || service === 'grok'
        ? {
            runId: context.record.runId,
            stepId: context.step.id,
          }
        : null;

    if (liveBrowserServiceStateKey) {
      recordLiveRuntimeRunServiceState({
        ...liveBrowserServiceStateKey,
        service,
        state: 'thinking',
        source: 'browser-service',
        evidenceRef: service === 'grok' ? 'grok-prompt-submitted' : 'gemini-web-request-started',
        confidence: 'medium',
      });
    }

    let browserResult;
    try {
      browserResult = service === 'gemini'
        ? await runGeminiBrowserModeImpl(browserRunOptions)
        : await runBrowserModeImpl(browserRunOptions);
    } finally {
      if (liveBrowserServiceStateKey) {
        clearLiveRuntimeRunServiceState(liveBrowserServiceStateKey);
      }
    }

    const responseText = browserResult.answerMarkdown.trim().length > 0
      ? browserResult.answerMarkdown
      : browserResult.answerText;
    const contractResult = useStepOutputContract
      ? createStepOutputContractResult(parseAuraCallStepOutputEnvelope(responseText))
      : null;
    if (contractResult) {
      return {
        output: {
          ...contractResult.output,
          structuredData: {
            ...contractResult.output.structuredData,
            browserRun: {
              provider: service,
              service,
              conversationId: browserResult.conversationId ?? null,
              tabUrl: browserResult.tabUrl ?? null,
              runtimeProfileId: runtimeSelection.runtimeProfileId,
              browserProfileId: runtimeSelection.browserProfileId,
              agentId: context.step.agentId,
              projectId,
              configuredUrl: targetUrl,
              desiredModel,
              cachePath: null,
              cachePathStatus: 'unavailable',
              cachePathReason: 'provider cache identity is not resolved during stored-step execution',
              passiveObservations: browserResult.passiveObservations ?? [],
              answerChars: browserResult.answerChars,
              answerTokens: browserResult.answerTokens,
            },
          },
          notes: [
            ...(contractResult.output.notes ?? []),
            ...(browserResult.tabUrl ? [`browser conversation: ${browserResult.tabUrl}`] : []),
          ],
        },
        sharedState: contractResult.sharedState,
      };
    }
    const localActionRequests = parseConfiguredExecutorLocalActionRequests(responseText);
    return {
      output: {
        summary: summarizeOutput(responseText),
        artifacts: [],
        structuredData: {
          browserRun: {
            provider: service,
            service,
            conversationId: browserResult.conversationId ?? null,
            tabUrl: browserResult.tabUrl ?? null,
            runtimeProfileId: runtimeSelection.runtimeProfileId,
            browserProfileId: runtimeSelection.browserProfileId,
            agentId: context.step.agentId,
            projectId,
            configuredUrl: targetUrl,
            desiredModel,
            cachePath: null,
            cachePathStatus: 'unavailable',
            cachePathReason: 'provider cache identity is not resolved during stored-step execution',
            passiveObservations: browserResult.passiveObservations ?? [],
            answerChars: browserResult.answerChars,
            answerTokens: browserResult.answerTokens,
          },
          ...(localActionRequests.length > 0 ? { localActionRequests } : {}),
        },
        notes: browserResult.tabUrl ? [`browser conversation: ${browserResult.tabUrl}`] : [],
      },
      sharedState: {
        structuredOutputs: [
          {
            key: 'response.output',
            value: [createExecutionResponseMessage(responseText)],
          },
        ],
      },
    };
  };
}
