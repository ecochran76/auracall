import type { ChromeClient } from '../browser/types.js';
import type { BrowserProviderConfig } from '../browser/providers/types.js';
import { CRAWLER_SCRIPT } from './crawler.js';
import fs from 'node:fs/promises';
import path from 'node:path';

export interface SelectorCheckResult {
  name: string;
  selectors: readonly string[];
  matched: boolean;
  matchCount: number;
  matchedSelector?: string;
  requirement: 'required' | 'deferred';
  deferredReason?: string;
}

export interface DiagnosisSurface {
  kind: 'conversation' | 'non-conversation' | 'workbench';
  reason: string;
  requiredChecks: string[];
  deferredChecks: string[];
}

export interface DiagnosisReport {
  url: string;
  providerId: string;
  surface: DiagnosisSurface;
  checks: SelectorCheckResult[];
  allPassed: boolean;
  failedRequiredChecks: string[];
  snapshotPath?: string;
}

const CONVERSATION_OUTPUT_CHECKS = new Set(['assistantBubble', 'assistantRole', 'copyButton']);
const PROMPT_DEPENDENT_CHECKS = new Set(['sendButton']);
const WORKBENCH_DEFERRED_CHECKS = new Set(['modelButton']);

function classifyDiagnosisSurface(url: string, providerId: BrowserProviderConfig['id']): DiagnosisSurface {
  let parsed: URL | null = null;
  try {
    parsed = new URL(url);
  } catch {
    return {
      kind: 'non-conversation',
      reason: 'unparseable-url',
      requiredChecks: [],
      deferredChecks: [],
    };
  }

  const path = parsed.pathname;
  if (providerId === 'grok' && path === '/imagine') {
    return {
      kind: 'workbench',
      reason: 'grok-imagine-route',
      requiredChecks: [],
      deferredChecks: [],
    };
  }

  const isConversation =
    path.includes('/c/') ||
    (providerId === 'grok' && Boolean(parsed.searchParams.get('chat'))) ||
    (providerId === 'gemini' && /^\/app\/[^/]+/.test(path));

  return {
    kind: isConversation ? 'conversation' : 'non-conversation',
    reason: isConversation ? 'conversation-route' : 'no-conversation-route',
    requiredChecks: [],
    deferredChecks: [],
  };
}

function classifySelectorRequirement(
  surface: DiagnosisSurface,
  checkName: string,
): Pick<SelectorCheckResult, 'requirement' | 'deferredReason'> {
  if (surface.kind === 'conversation') {
    return { requirement: 'required' };
  }
  if (CONVERSATION_OUTPUT_CHECKS.has(checkName)) {
    return {
      requirement: 'deferred',
      deferredReason: 'conversation-output-not-expected-on-current-surface',
    };
  }
  if (PROMPT_DEPENDENT_CHECKS.has(checkName)) {
    return {
      requirement: 'deferred',
      deferredReason: 'prompt-dependent-control-not-expected-before-input',
    };
  }
  if (surface.kind === 'workbench' && WORKBENCH_DEFERRED_CHECKS.has(checkName)) {
    return {
      requirement: 'deferred',
      deferredReason: 'generic-chat-control-not-expected-on-workbench-surface',
    };
  }
  return { requirement: 'required' };
}

export async function diagnoseProvider(
  client: ChromeClient,
  config: BrowserProviderConfig,
  basePath?: string,
  options: {
    quiet?: boolean;
  } = {},
): Promise<DiagnosisReport> {
  const { result: urlResult } = await client.Runtime.evaluate({
    expression: 'location.href',
    returnByValue: true,
  });
  const url = (urlResult.value as string) || 'unknown';

  const checks: SelectorCheckResult[] = [];
  const surface = classifyDiagnosisSurface(url, config.id);

  // Check each selector group (input, sendButton, etc.)
  for (const [key, selectors] of Object.entries(config.selectors)) {
    // We want to know if *any* selector in the list matches.
    // We also want to know *which* one matched.
    let groupMatchCount = 0;
    let bestSelector: string | undefined;

    for (const selector of selectors) {
      const { result } = await client.Runtime.evaluate({
        expression: `document.querySelectorAll(${JSON.stringify(selector)}).length`,
        returnByValue: true,
      });
      const count = (result.value as number) || 0;
      if (count > 0) {
        groupMatchCount += count;
        if (!bestSelector) bestSelector = selector;
      }
    }

    const requirement = classifySelectorRequirement(surface, key);
    checks.push({
      name: key,
      selectors,
      matched: groupMatchCount > 0,
      matchCount: groupMatchCount,
      matchedSelector: bestSelector,
      ...requirement,
    });
  }

  surface.requiredChecks = checks.filter((check) => check.requirement === 'required').map((check) => check.name);
  surface.deferredChecks = checks.filter((check) => check.requirement === 'deferred').map((check) => check.name);
  const failedRequiredChecks = checks
    .filter((check) => check.requirement === 'required' && !check.matched)
    .map((check) => check.name);
  const allPassed = failedRequiredChecks.length === 0;
  let snapshotPath: string | undefined;

  // If failures, capture a semantic snapshot
  if (!allPassed && basePath) {
    try {
      if (!options.quiet) {
        console.log('Capturing UI snapshot for debugging...');
      }
      const { result } = await client.Runtime.evaluate({
        expression: CRAWLER_SCRIPT,
        returnByValue: true
      });
      
      if (result.value) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `auracall-snapshot-${config.id}-${timestamp}.json`;
        snapshotPath = path.join(basePath, filename);
        await fs.writeFile(snapshotPath, JSON.stringify(result.value, null, 2), 'utf8');
      }
    } catch (err) {
      if (!options.quiet) {
        console.error('Failed to capture snapshot:', err);
      }
    }
  }

  return {
    url,
    providerId: config.id,
    surface,
    checks,
    allPassed,
    failedRequiredChecks,
    snapshotPath,
  };
}
