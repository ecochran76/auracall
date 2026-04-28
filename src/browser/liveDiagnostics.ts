import fs from 'node:fs/promises';
import path from 'node:path';
import type { ResolvedUserConfig } from '../config.js';
import { getAuracallHomeDir } from '../auracallHome.js';
import type { RuntimeRunInspectionBrowserDiagnosticsProbeResult } from '../runtime/inspection.js';
import type { ExecutionRunnerServiceId } from '../runtime/types.js';
import { connectToChromeTarget } from '../../packages/browser-service/src/chromeLifecycle.js';
import type { BrowserMutationRecord } from '../../packages/browser-service/src/service/mutationDispatcher.js';
import { BrowserService } from './service/browserService.js';
import type { ChromeClient } from './types.js';
import {
  buildGeminiActivityEvidenceExpression,
  coerceGeminiActivityEvidence,
} from './providers/geminiEvidence.js';
import { buildGrokFeatureProbeExpression } from './providers/grokAdapter.js';
import { waitForDocumentReady } from './service/ui.js';

const SERVICE_HOME_URLS: Record<Extract<ExecutionRunnerServiceId, 'chatgpt' | 'gemini' | 'grok'>, string> = {
  chatgpt: 'https://chatgpt.com/',
  gemini: 'https://gemini.google.com/app',
  grok: 'https://grok.com/',
};

export type BrowserDiagnosticsService = keyof typeof SERVICE_HOME_URLS;

type BrowserRunDiagnosticsDeps = {
  createBrowserService?: (userConfig: ResolvedUserConfig, service: BrowserDiagnosticsService) => BrowserService;
  connectToTarget?: typeof connectToChromeTarget;
};

export async function probeBrowserRunDiagnostics(
  userConfig: ResolvedUserConfig,
  input: {
    service: BrowserDiagnosticsService;
    runId: string;
    stepId: string;
    preferredTargetId?: string | null;
    configuredUrl?: string | null;
  },
  deps: BrowserRunDiagnosticsDeps = {},
): Promise<RuntimeRunInspectionBrowserDiagnosticsProbeResult | null> {
  const browserService =
    deps.createBrowserService?.(userConfig, input.service) ?? BrowserService.fromConfig(userConfig, input.service);
  const target = await browserService.resolveServiceTarget({
    serviceId: input.service,
    configuredUrl: input.configuredUrl ?? userConfig.services?.[input.service]?.url ?? SERVICE_HOME_URLS[input.service],
    ensurePort: true,
  });
  const port = target.port;
  const host = target.host ?? '127.0.0.1';
  const targetId = input.preferredTargetId ?? resolveTargetId(target.tab);
  if (!port || !targetId) {
    return null;
  }

  const client = await (deps.connectToTarget ?? connectToChromeTarget)({
    host,
    port,
    target: targetId,
  });
  try {
    const { Runtime, Page } = client;
    await Runtime.enable();
    await Page.enable().catch(() => undefined);
    await waitForDocumentReady(Runtime, {
      timeoutMs: 8000,
      description: `${input.service} browser diagnostics document ready`,
    }).catch(() => undefined);
    const pageState = await readPageDiagnostics(Runtime, input.service);
    const document = {
      ...pageState.document,
      url: pageState.document.url ?? target.tab?.url ?? null,
      title: pageState.document.title ?? target.tab?.title ?? null,
    };
    const screenshot = await captureDiagnosticsScreenshot(client, input);
    const browserMutations = summarizeBrowserMutations(browserService.listRecentBrowserMutations?.(20) ?? []);
    const browserOperationQueue = browserService.summarizeBrowserOperationQueue?.(20) ?? null;
    return {
      service: input.service,
      ownerStepId: input.stepId,
      observedAt: new Date().toISOString(),
      source: 'browser-service',
      target: {
        host,
        port,
        targetId,
        url: target.tab?.url ?? document.url,
        title: target.tab?.title ?? document.title,
      },
      document,
      visibleCounts: pageState.visibleCounts,
      providerEvidence: pageState.providerEvidence,
      browserMutations,
      browserOperationQueue,
      screenshot,
    };
  } finally {
    await client.close().catch(() => undefined);
  }
}

function summarizeBrowserMutations(
  items: BrowserMutationRecord[],
): RuntimeRunInspectionBrowserDiagnosticsProbeResult['browserMutations'] {
  const records = Array.isArray(items) ? items : [];
  return {
    total: records.length,
    items: records,
  };
}

async function readPageDiagnostics(
  Runtime: ChromeClient['Runtime'],
  service: BrowserDiagnosticsService,
): Promise<{
  document: RuntimeRunInspectionBrowserDiagnosticsProbeResult['document'];
  visibleCounts: RuntimeRunInspectionBrowserDiagnosticsProbeResult['visibleCounts'];
  providerEvidence: Record<string, unknown> | null;
}> {
  const expression = buildPageDiagnosticsExpression(service);
  const { result } = await Runtime.evaluate({ expression, returnByValue: true });
  const value = result?.value && typeof result.value === 'object'
    ? (result.value as Record<string, unknown>)
    : {};
  const providerEvidence = await readProviderEvidence(Runtime, service);
  return {
    document: coerceDocumentDiagnostics(value.document),
    visibleCounts: coerceVisibleCounts(value.visibleCounts),
    providerEvidence,
  };
}

function buildPageDiagnosticsExpression(_service: BrowserDiagnosticsService): string {
  return `(() => {
    const visible = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const countVisible = (selector) => Array.from(document.querySelectorAll(selector)).filter((node) => visible(node)).length;
    return {
      document: {
        url: location.href,
        title: document.title,
        readyState: document.readyState,
        visibilityState: document.visibilityState,
        focused: document.hasFocus(),
        bodyTextLength: document.body?.innerText?.length ?? 0,
      },
      visibleCounts: {
        buttons: countVisible('button'),
        links: countVisible('a[href]'),
        inputs: countVisible('input'),
        textareas: countVisible('textarea'),
        contenteditables: countVisible('[contenteditable="true"]'),
        modelResponses: countVisible('model-response'),
      },
    };
  })()`;
}

async function readProviderEvidence(
  Runtime: ChromeClient['Runtime'],
  service: BrowserDiagnosticsService,
): Promise<Record<string, unknown> | null> {
  const expression = service === 'gemini'
    ? buildGeminiActivityEvidenceExpression()
    : service === 'grok'
      ? buildGrokFeatureProbeExpression()
      : null;
  if (!expression) {
    return null;
  }
  const { result, exceptionDetails } = await Runtime.evaluate({ expression, returnByValue: true }).catch((error) => ({
    result: null,
    exceptionDetails: {
      text: error instanceof Error ? error.message : String(error),
    },
  }));
  if (exceptionDetails) {
    const exceptionRecord = exceptionDetails as { text?: unknown; exception?: { description?: unknown } };
    return {
      detector: `${service}-provider-evidence`,
      error: [
        typeof exceptionRecord.text === 'string' ? exceptionRecord.text : null,
        typeof exceptionRecord.exception?.description === 'string' ? exceptionRecord.exception.description : null,
      ].filter(Boolean).join(': ') || 'provider evidence evaluation failed',
    };
  }
  return coerceProviderEvidence(result?.value);
}

async function captureDiagnosticsScreenshot(
  client: ChromeClient,
  input: {
    service: BrowserDiagnosticsService;
    runId: string;
    stepId: string;
  },
): Promise<RuntimeRunInspectionBrowserDiagnosticsProbeResult['screenshot']> {
  const screenshot = await client.Page.captureScreenshot({ format: 'png' }).catch(() => null);
  if (!screenshot || typeof screenshot.data !== 'string' || screenshot.data.length === 0) {
    return null;
  }
  const bytes = Buffer.from(screenshot.data, 'base64');
  const dir = path.join(getAuracallHomeDir(), 'diagnostics', 'browser-state');
  await fs.mkdir(dir, { recursive: true });
  const safeRunId = sanitizePathToken(input.runId);
  const safeStepId = sanitizePathToken(input.stepId);
  const filePath = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}-${input.service}-${safeRunId}-${safeStepId}.png`);
  await fs.writeFile(filePath, bytes);
  return {
    path: filePath,
    mimeType: 'image/png',
    bytes: bytes.length,
  };
}

function coerceDocumentDiagnostics(value: unknown): RuntimeRunInspectionBrowserDiagnosticsProbeResult['document'] {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return {
    url: asString(record.url),
    title: asString(record.title),
    readyState: asString(record.readyState),
    visibilityState: asString(record.visibilityState),
    focused: typeof record.focused === 'boolean' ? record.focused : null,
    bodyTextLength: typeof record.bodyTextLength === 'number' ? record.bodyTextLength : null,
  };
}

function coerceVisibleCounts(value: unknown): RuntimeRunInspectionBrowserDiagnosticsProbeResult['visibleCounts'] {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return {
    buttons: asCount(record.buttons),
    links: asCount(record.links),
    inputs: asCount(record.inputs),
    textareas: asCount(record.textareas),
    contenteditables: asCount(record.contenteditables),
    modelResponses: asCount(record.modelResponses),
  };
}

function coerceProviderEvidence(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if ('hasActiveAvatarSpinner' in record || 'hasGeneratedMedia' in record || 'hasStopControl' in record) {
    return coerceGeminiActivityEvidence(record) as unknown as Record<string, unknown>;
  }
  return { ...record };
}

function resolveTargetId(tab: { targetId?: string; id?: string } | null | undefined): string | null {
  if (!tab) return null;
  if (typeof tab.targetId === 'string' && tab.targetId.length > 0) return tab.targetId;
  if (typeof tab.id === 'string' && tab.id.length > 0) return tab.id;
  return null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

function sanitizePathToken(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]+/g, '_').slice(0, 80);
}
