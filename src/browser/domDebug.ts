import fs from 'node:fs/promises';
import path from 'node:path';
import type { ChromeClient, BrowserLogger } from './types.js';
import { CONVERSATION_TURN_SELECTOR } from './constants.js';
import { getAuracallHomeDir } from '../auracallHome.js';

export function buildConversationDebugExpression(): string {
  return `(() => {
    const CONVERSATION_SELECTOR = ${JSON.stringify(CONVERSATION_TURN_SELECTOR)};
    const turns = Array.from(document.querySelectorAll(CONVERSATION_SELECTOR));
    return turns.map((node) => ({
      role: node.getAttribute('data-message-author-role'),
      text: node.innerText?.slice(0, 200),
      testid: node.getAttribute('data-testid'),
    }));
  })()`;
}

export async function logConversationSnapshot(Runtime: ChromeClient['Runtime'], logger: BrowserLogger) {
  const expression = buildConversationDebugExpression();
  const { result } = await Runtime.evaluate({ expression, returnByValue: true });
  if (Array.isArray(result.value)) {
    const recent = (result.value as Array<Record<string, unknown>>).slice(-3);
    logger(`Conversation snapshot: ${JSON.stringify(recent)}`);
  }
}

export function buildBrowserPostmortemExpression(): string {
  return `(() => {
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
    const isVisible = (node) => {
      if (!(node instanceof Element)) return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const describeElement = (node) => {
      if (!(node instanceof Element)) return null;
      const attrs = ['role', 'type', 'name', 'aria-label', 'data-testid']
        .map((key) => [key, normalize(node.getAttribute(key) || '')])
        .filter(([, value]) => value);
      return {
        tag: node.tagName,
        text: normalize(node.textContent || '').slice(0, 120),
        attrs: Object.fromEntries(attrs),
      };
    };
    const turns = Array.from(document.querySelectorAll(${JSON.stringify(CONVERSATION_TURN_SELECTOR)}))
      .slice(-4)
      .map((node) => ({
        role: normalize(node.getAttribute('data-message-author-role') || ''),
        text: normalize(node.textContent || '').slice(0, 240),
        testid: normalize(node.getAttribute('data-testid') || ''),
      }));
    const overlays = Array.from(document.querySelectorAll('[role="dialog"], dialog, [aria-modal="true"], [role="alert"], [aria-live]'))
      .filter((node) => isVisible(node))
      .slice(0, 6)
      .map((node) => ({
        tag: node.tagName,
        role: normalize(node.getAttribute('role') || ''),
        ariaLabel: normalize(node.getAttribute('aria-label') || ''),
        text: normalize(node.textContent || '').slice(0, 240),
        buttons: Array.from(node.querySelectorAll('button,[role="button"]'))
          .filter((button) => isVisible(button))
          .slice(0, 8)
          .map((button) => normalize(button.getAttribute('aria-label') || button.textContent || ''))
          .filter(Boolean),
      }));
    const retryButtons = Array.from(document.querySelectorAll('button,[role="button"]'))
      .filter((node) => isVisible(node))
      .map((node) => normalize(node.getAttribute('aria-label') || node.textContent || ''))
      .filter((label) => /^(retry|try again|regenerate|regenerate response|continue generating)$/i.test(label))
      .slice(0, 8);
    return {
      href: location.href,
      title: document.title,
      readyState: document.readyState,
      activeElement: describeElement(document.activeElement),
      overlays,
      retryButtons,
      recentTurns: turns,
    };
  })()`;
}

export async function captureBrowserPostmortemSnapshot(
  Runtime: ChromeClient['Runtime'],
): Promise<Record<string, unknown> | null> {
  const expression = buildBrowserPostmortemExpression();
  const { result } = await Runtime.evaluate({ expression, returnByValue: true });
  return result?.value && typeof result.value === 'object' ? (result.value as Record<string, unknown>) : null;
}

function normalizePostmortemContext(value: string): string {
  const normalized = String(value || '')
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  return normalized || 'browser';
}

export async function persistBrowserPostmortemRecord(options: {
  context: string;
  payload: Record<string, unknown>;
}): Promise<string> {
  const root = path.join(getAuracallHomeDir(), 'postmortems', 'browser');
  await fs.mkdir(root, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `${stamp}-${normalizePostmortemContext(options.context)}.json`;
  const target = path.join(root, fileName);
  await fs.writeFile(target, `${JSON.stringify(options.payload, null, 2)}\n`, 'utf8');
  return target;
}

export async function logBrowserPostmortemSnapshot(
  Runtime: ChromeClient['Runtime'],
  logger: BrowserLogger,
  context: string,
): Promise<void> {
  if (!logger?.verbose) {
    return;
  }
  const snapshot = await captureBrowserPostmortemSnapshot(Runtime);
  if (snapshot) {
    emitDebugLog(logger, `Browser postmortem (${context}): ${JSON.stringify(snapshot)}`);
  }
}

function emitDebugLog(logger: BrowserLogger, message: string): void {
  logger(message);
  if (logger.sessionLog && logger.sessionLog !== logger) {
    logger.sessionLog(message);
  }
}

export function logStructuredDebugEvent(
  logger: BrowserLogger,
  context: string,
  payload: Record<string, unknown>,
): void {
  if (!logger?.verbose) {
    return;
  }
  try {
    emitDebugLog(logger, `Browser debug (${context}): ${JSON.stringify(payload)}`);
  } catch {
    // ignore structured debug logging failures
  }
}

export async function logDomFailure(Runtime: ChromeClient['Runtime'], logger: BrowserLogger, context: string) {
  if (!logger?.verbose) {
    return;
  }
  try {
    const entry = `Browser automation failure (${context}); capturing DOM snapshot for debugging...`;
    emitDebugLog(logger, entry);
    await logBrowserPostmortemSnapshot(Runtime, logger, context);
  } catch {
    // ignore snapshot failures
  }
}
