import fs from 'node:fs/promises';
import path from 'node:path';
import CDP from 'chrome-remote-interface';
import { connectToChromeTarget, openOrReuseChromeTarget } from '../../../packages/browser-service/src/chromeLifecycle.js';
import type { ChromeClient } from '../types.js';
import { transferAttachmentViaDataTransfer } from '../actions/attachmentDataTransfer.js';
import type {
  Conversation,
  ConversationArtifact,
  ConversationContext,
  ConversationSource,
  FileRef,
  Project,
  ProjectMemoryMode,
} from './domain.js';
import type { BrowserProvider, BrowserProviderListOptions, ProviderUserIdentity } from './types.js';
import {
  armDownloadCapture,
  collectVisibleOverlayInventory,
  closeDialog,
  DEFAULT_DIALOG_SELECTORS,
  dismissOverlayRoot,
  navigateAndSettle,
  openAndSelectMenuItem,
  openMenu,
  openSurface,
  pressButton,
  setInputValue,
  submitInlineRename,
  waitForDownloadCapture,
  waitForPredicate,
  waitForSelector,
  withBlockingSurfaceRecovery,
  withUiDiagnostics,
} from '../service/ui.js';
import { extractChatgptRateLimitSummary, isChatgptRateLimitMessage } from '../chatgptRateLimitGuard.js';

const CHATGPT_HOME_URL = 'https://chatgpt.com/';
const CHATGPT_PROJECT_DIALOG_SELECTOR = '[data-testid="modal-new-project-enhanced"], dialog[open], [role="dialog"], dialog';
const CHATGPT_PROJECT_DIALOG_ROOT_SELECTORS = [
  '[data-testid="modal-new-project-enhanced"]',
  'dialog[open]',
  '[role="dialog"]',
  'dialog',
] as const;
const CHATGPT_PROJECT_NAME_INPUT_SELECTOR = 'input[name="projectName"], input[aria-label="Project name"], #project-name';
const CHATGPT_PROJECT_INSTRUCTIONS_SELECTOR = 'textarea[aria-label="Instructions"], textarea#instructions';
const CHATGPT_PROJECT_SETTINGS_BUTTON_LABEL = 'Project settings';
const CHATGPT_PROJECT_SETTINGS_BUTTON_MATCH = 'project settings';
const CHATGPT_COMPATIBLE_HOSTS = ['chatgpt.com', 'chat.openai.com'];
const CHATGPT_PROJECT_SOURCES_INPUT_ATTR = 'data-auracall-chatgpt-project-source-input';
const CHATGPT_PROJECT_SETTINGS_DIALOG_ATTR = 'data-auracall-chatgpt-project-settings-dialog';
const CHATGPT_PROJECT_SOURCE_ACTION_ATTR = 'data-auracall-chatgpt-project-source-action';
const CHATGPT_CONVERSATION_ROW_ATTR = 'data-auracall-chatgpt-conversation-row';
const CHATGPT_CONVERSATION_ACTION_ATTR = 'data-auracall-chatgpt-conversation-action';
const CHATGPT_DOWNLOAD_BUTTON_ATTR = 'data-auracall-chatgpt-download-button';
const CHATGPT_DOWNLOAD_CAPTURE_STATE_KEY = '__auracallChatgptDownloadCapture';
const CHATGPT_RATE_LIMIT_RECOVERY_PAUSE_MS = 15_000;

type ChatgptProjectLinkProbe = {
  id: string;
  name: string;
  url?: string | null;
};

type ChatgptConversationLinkProbe = {
  id: string;
  title?: string | null;
  url?: string | null;
  projectId?: string | null;
};

type ChatgptAuthSessionProbe = {
  user?: {
    id?: string | null;
    name?: string | null;
    email?: string | null;
  } | null;
  account?: {
    id?: string | null;
    name?: string | null;
    email?: string | null;
  } | null;
};

type ChatgptProjectSourceProbe = {
  rowText?: string | null;
  leafTexts?: string[] | null;
  metadataText?: string | null;
};

type ChatgptConversationFileProbe = {
  turnId?: string | null;
  messageId?: string | null;
  tileIndex?: number | null;
  name?: string | null;
  label?: string | null;
};

type ChatgptConversationDownloadButtonProbe = {
  turnId?: string | null;
  messageId?: string | null;
  messageIndex?: number | null;
  buttonIndex?: number | null;
  title?: string | null;
};

type ChatgptConversationCanvasProbe = {
  textdocId?: string | null;
  title?: string | null;
  contentText?: string | null;
};

type ChatgptDeleteConfirmationProbe = {
  dialogText?: string | null;
  buttonLabels?: string[] | null;
  hasVisibleConfirmButton?: boolean | null;
};

type ChatgptConversationPayloadResponse = {
  ok?: boolean | null;
  status?: number | null;
  body?: string | null;
  error?: string | null;
};

type ChatgptConversationPayload = {
  mapping?: Record<string, ChatgptConversationPayloadNode | null> | null;
};

type ChatgptConversationPayloadNode = {
  id?: string | null;
  message?: ChatgptConversationPayloadMessage | null;
};

type ChatgptConversationPayloadMessage = {
  id?: string | null;
  author?: {
    role?: string | null;
  } | null;
  content?: {
    content_type?: string | null;
    parts?: unknown[] | null;
    text?: string | null;
  } | null;
  metadata?: Record<string, unknown> | null;
};

type ChatgptConversationMessageProbe = {
  role: 'user' | 'assistant' | 'system';
  text: string;
  messageId?: string;
};

export function normalizeChatgptProjectId(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^(g-p-[a-z0-9]+)/i);
  return match?.[1] ?? null;
}

export function normalizeChatgptConversationId(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const extracted = extractChatgptConversationIdFromUrl(trimmed);
  if (extracted) {
    return extracted;
  }
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed) ? trimmed : null;
}

type ChromeClientWithFocusPolicy = ChromeClient & { __auracallSuppressFocus?: boolean };

function setClientSuppressFocus(client: ChromeClient, suppressFocus: boolean | undefined): void {
  (client as ChromeClientWithFocusPolicy).__auracallSuppressFocus = Boolean(suppressFocus);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function readVisibleChatgptRateLimitMatchWithClient(
  client: ChromeClient,
): Promise<{ kind: 'rate-limit'; summary: string; selector?: string | null; details?: Record<string, unknown> | null } | null> {
  const overlays = await collectVisibleOverlayInventory(client.Runtime, {
    overlaySelectors: [...Array.from(DEFAULT_DIALOG_SELECTORS), '[role="alert"]', '[aria-live]'],
    limit: 8,
  });
  for (const overlay of overlays) {
    const text = normalizeUiText(overlay.text);
    if (!text || !/too many requests|too quickly|rate limit/i.test(text)) {
      continue;
    }
    return {
      kind: 'rate-limit',
      summary: extractChatgptRateLimitSummary(text) ?? text,
      selector: overlay.selector,
      details: {
        sourceSelector: overlay.sourceSelector,
        role: overlay.role,
        ariaLabel: overlay.ariaLabel,
      },
    };
  }
  return null;
}

async function dismissVisibleChatgptRateLimitDialogWithClient(
  client: ChromeClient,
  match?: { kind: 'rate-limit'; summary: string; selector?: string | null; details?: Record<string, unknown> | null } | null,
): Promise<string | null> {
  const resolved = match ?? (await readVisibleChatgptRateLimitMatchWithClient(client));
  if (!resolved) {
    return null;
  }
  if (resolved.selector) {
    await dismissOverlayRoot(client.Runtime, resolved.selector, {
      closeButtonMatch: {
        includeAny: ['ok', 'okay', 'got it', 'dismiss', 'close', 'cancel', 'done'],
      },
      timeoutMs: 3_000,
    }).catch(() => undefined);
  } else {
    await closeDialog(client.Runtime, DEFAULT_DIALOG_SELECTORS).catch(() => undefined);
  }
  return resolved.summary;
}

async function withChatgptRateLimitDialogRecovery<T>(
  client: ChromeClient,
  action: string,
  fn: () => Promise<T>,
  options?: { pauseMs?: number; retries?: number },
): Promise<T> {
  return withBlockingSurfaceRecovery(fn, {
    label: action,
    pauseMs: options?.pauseMs ?? CHATGPT_RATE_LIMIT_RECOVERY_PAUSE_MS,
    retries: options?.retries ?? 1,
    inspect: () => readVisibleChatgptRateLimitMatchWithClient(client),
    dismiss: (match) => dismissVisibleChatgptRateLimitDialogWithClient(client, match).then(() => undefined),
    classifyError: (error) => {
      const directMessage = error instanceof Error ? error.message : String(error);
      if (!isChatgptRateLimitMessage(directMessage)) {
        return null;
      }
      return {
        kind: 'rate-limit' as const,
        summary: extractChatgptRateLimitSummary(directMessage) ?? directMessage,
        selector: null,
      };
    },
  });
}

function resolvePortFromEnv(): number | null {
  const raw = process.env.AURACALL_BROWSER_PORT ?? process.env.AURACALL_BROWSER_DEBUG_PORT;
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function resolveBrowserTabPolicy(
  options: Pick<BrowserProviderListOptions, 'browserService'> | undefined,
): {
  serviceTabLimit?: number;
  blankTabLimit?: number;
  collapseDisposableWindows?: boolean;
  suppressFocus?: boolean;
} {
  const config = options?.browserService?.getConfig?.();
  return {
    serviceTabLimit: config?.serviceTabLimit ?? undefined,
    blankTabLimit: config?.blankTabLimit ?? undefined,
    collapseDisposableWindows: config?.collapseDisposableWindows,
    suppressFocus: config?.hideWindow ?? undefined,
  };
}

function resolveChatgptTargetId(
  target:
    | { targetId?: string | null; id?: string | null }
    | string
    | null
    | undefined,
): string | undefined {
  if (!target) return undefined;
  if (typeof target === 'string') return target;
  return target.targetId ?? target.id ?? undefined;
}

function isChatgptUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return CHATGPT_COMPATIBLE_HOSTS.includes(parsed.hostname);
  } catch {
    return false;
  }
}

function normalizeProjectName(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function normalizeUiText(value: string | null | undefined): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function normalizeFileKey(value: string | null | undefined): string {
  return normalizeUiText(value).toLowerCase();
}

function normalizeInstructionComparisonText(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trimEnd();
}

export function matchesChatgptDeleteConfirmationProbe(
  probe: ChatgptDeleteConfirmationProbe | null | undefined,
  expectedTitle?: string | null,
): boolean {
  if (!probe) {
    return false;
  }
  const text = normalizeUiText(probe.dialogText).toLowerCase();
  if (!text.includes('delete chat?')) {
    return false;
  }
  const labels = Array.isArray(probe.buttonLabels)
    ? probe.buttonLabels.map((label) => normalizeUiText(label).toLowerCase()).filter(Boolean)
    : [];
  if (!labels.includes('delete') || !labels.includes('cancel')) {
    return false;
  }
  const expected = normalizeUiText(expectedTitle).toLowerCase();
  if (probe.hasVisibleConfirmButton) {
    return true;
  }
  if (!expected) {
    return true;
  }
  return text.includes(expected);
}

function isRetryableConnectionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('WebSocket connection closed') || message.includes('ECONNRESET');
}

export function extractChatgptProjectIdFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const match =
      parsed.pathname.match(/^\/g\/([^/]+)\/project\/?$/) ??
      parsed.pathname.match(/^\/g\/([^/]+)\/c\/[^/]+\/?$/);
    return normalizeChatgptProjectId(match?.[1]) ?? null;
  } catch {
    return null;
  }
}

export function extractChatgptConversationIdFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/\/c\/([a-zA-Z0-9-]+)\/?$/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export function findChatgptProjectByName<T extends { id: string; name: string; url?: string }>(
  projects: readonly T[],
  name: string,
): T | null {
  const target = normalizeProjectName(name);
  return projects.find((project) => normalizeProjectName(project.name) === target) ?? null;
}

export function resolveChatgptProjectMemoryLabel(mode: ProjectMemoryMode): 'Default' | 'Project-only' {
  return mode === 'project' ? 'Project-only' : 'Default';
}

export function normalizeChatgptAuthSessionIdentity(
  probe: ChatgptAuthSessionProbe | null | undefined,
): ProviderUserIdentity | null {
  if (!probe || typeof probe !== 'object') {
    return null;
  }
  const user = probe.user && typeof probe.user === 'object' ? probe.user : null;
  const account = probe.account && typeof probe.account === 'object' ? probe.account : null;
  const normalize = (value: string | null | undefined): string | undefined => {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    return trimmed.length > 0 ? trimmed : undefined;
  };
  const id = normalize(user?.id) ?? normalize(account?.id);
  const email = normalize(user?.email) ?? normalize(account?.email);
  const name = normalize(user?.name) ?? normalize(account?.name);
  if (!id && !email && !name) {
    return null;
  }
  return {
    id,
    email,
    name,
    source: 'auth-session',
  };
}

export function extractChatgptProjectSourceName(
  probe: Pick<ChatgptProjectSourceProbe, 'rowText' | 'leafTexts'> | null | undefined,
): string | null {
  if (!probe || typeof probe !== 'object') return null;
  const rowText = normalizeUiText(probe.rowText);
  const leafTexts = Array.isArray(probe.leafTexts)
    ? Array.from(
        new Set(
          probe.leafTexts
            .map((value) => normalizeUiText(value))
            .filter(Boolean),
        ),
      )
    : [];
  for (const candidate of leafTexts) {
    if (candidate === rowText) continue;
    if (candidate.includes(' · ')) continue;
    if (/^(file|pdf|docx?|txt|csv|image|png|jpe?g|webp)\b/i.test(candidate)) continue;
    return candidate;
  }
  const beforeMeta = rowText.split(/\s+·\s+/)[0]?.trim() ?? '';
  if (!beforeMeta) return null;
  const stripped = beforeMeta.replace(/(?:file|pdf|docx?|txt|csv|image|png|jpe?g|webp)$/i, '').trim();
  return stripped || beforeMeta || null;
}

export function normalizeChatgptProjectSourceProbes(
  probes: readonly ChatgptProjectSourceProbe[],
): FileRef[] {
  const files: FileRef[] = [];
  const seen = new Set<string>();
  for (const probe of probes) {
    const name = extractChatgptProjectSourceName(probe);
    if (!name) continue;
    const key = normalizeFileKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const metadataText = normalizeUiText(probe.metadataText);
    files.push({
      id: name,
      name,
      provider: 'chatgpt',
      source: 'project',
      metadata: metadataText ? { label: metadataText } : undefined,
    });
  }
  return files;
}

export function normalizeChatgptConversationFileProbes(
  conversationId: string,
  probes: readonly ChatgptConversationFileProbe[],
): FileRef[] {
  const files: FileRef[] = [];
  const seen = new Set<string>();
  for (const probe of probes) {
    const name = normalizeUiText(probe.name);
    if (!name) continue;
    const turnKey =
      normalizeUiText(probe.turnId) ||
      normalizeUiText(probe.messageId) ||
      'turn';
    const tileIndex =
      typeof probe.tileIndex === 'number' && Number.isFinite(probe.tileIndex)
        ? probe.tileIndex
        : files.length;
    const dedupeKey = `${turnKey}:${tileIndex}:${normalizeFileKey(name)}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    const label = normalizeUiText(probe.label);
    files.push({
      id: `${conversationId}:${turnKey}:${tileIndex}:${name}`,
      name,
      provider: 'chatgpt',
      source: 'conversation',
      metadata: {
        ...(label ? { label } : {}),
        ...(normalizeUiText(probe.turnId) ? { turnId: normalizeUiText(probe.turnId) } : {}),
        ...(normalizeUiText(probe.messageId) ? { messageId: normalizeUiText(probe.messageId) } : {}),
      },
    });
  }
  return files;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readStringField(record: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string') {
      const normalized = value.trim();
      if (normalized) {
        return normalized;
      }
    }
  }
  return null;
}

function listChatgptConversationPayloadNodes(
  payload: ChatgptConversationPayload | null | undefined,
): ChatgptConversationPayloadNode[] {
  if (!payload || !isRecord(payload.mapping)) {
    return [];
  }
  return Object.values(payload.mapping).filter((entry): entry is ChatgptConversationPayloadNode => {
    return isRecord(entry) && isRecord(entry.message);
  });
}

function extractChatgptPayloadMessageTextParts(
  message: ChatgptConversationPayloadMessage | null | undefined,
): string[] {
  if (!message || !isRecord(message.content)) {
    return [];
  }
  const parts: string[] = [];
  const rawParts = Array.isArray(message.content.parts) ? message.content.parts : [];
  for (const part of rawParts) {
    if (typeof part === 'string') {
      const normalized = part.trim();
      if (normalized) parts.push(normalized);
      continue;
    }
    if (isRecord(part)) {
      const text = readStringField(part, 'text', 'content');
      if (text) parts.push(text);
    }
  }
  const fallbackText = typeof message.content.text === 'string' ? message.content.text.trim() : '';
  if (fallbackText) {
    parts.push(fallbackText);
  }
  return parts;
}

function extractChatgptPayloadMessageStructuredParts(
  message: ChatgptConversationPayloadMessage | null | undefined,
): Record<string, unknown>[] {
  if (!message || !isRecord(message.content)) {
    return [];
  }
  const parts: Record<string, unknown>[] = [];
  const rawParts = Array.isArray(message.content.parts) ? message.content.parts : [];
  for (const part of rawParts) {
    if (isRecord(part)) {
      parts.push(part);
      continue;
    }
    if (typeof part !== 'string') {
      continue;
    }
    try {
      const parsed = JSON.parse(part) as unknown;
      if (isRecord(parsed)) {
        parts.push(parsed);
      }
    } catch {
      // Ignore non-JSON string parts.
    }
  }
  return parts;
}

function readFiniteNumberField(record: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
}

function parseChatgptCodeArtifactPreview(
  message: ChatgptConversationPayloadMessage | null | undefined,
): {
  name?: string;
  type?: string;
  content?: string;
} | null {
  if (!message || !isRecord(message.content)) {
    return null;
  }
  const contentType =
    typeof message.content.content_type === 'string' ? message.content.content_type.trim().toLowerCase() : '';
  if (contentType !== 'code') {
    return null;
  }
  for (const part of extractChatgptPayloadMessageTextParts(message)) {
    try {
      const parsed = JSON.parse(part) as unknown;
      if (!isRecord(parsed)) continue;
      const name = readStringField(parsed, 'name') ?? undefined;
      const type = readStringField(parsed, 'type') ?? undefined;
      const content = readStringField(parsed, 'content') ?? undefined;
      if (name || type || content) {
        return { name, type, content };
      }
    } catch {
      // Ignore non-JSON code previews.
    }
  }
  return null;
}

function inferChatgptDownloadArtifactKind(
  title: string | null | undefined,
  uri: string | null | undefined,
): ConversationArtifact['kind'] {
  const value = `${title ?? ''} ${uri ?? ''}`.toLowerCase();
  if (/\.(csv|tsv|xls|xlsx|ods)\b/.test(value)) {
    return 'spreadsheet';
  }
  return 'download';
}

function sanitizeChatgptArtifactFileName(value: string | null | undefined): string {
  const normalized = String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/:"*?<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized.length > 0 ? normalized.slice(0, 160) : 'artifact';
}

function ensureChatgptArtifactExtension(name: string, fallbackExt: string): string {
  const trimmed = sanitizeChatgptArtifactFileName(name);
  if (/\.[a-z0-9]{1,8}$/i.test(trimmed)) {
    return trimmed;
  }
  return `${trimmed}${fallbackExt}`;
}

export function serializeChatgptGridRowsToCsv(rows: ReadonlyArray<ReadonlyArray<string>>): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const normalized = String(cell ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
          if (/[",\n]/.test(normalized)) {
            return `"${normalized.replace(/"/g, '""')}"`;
          }
          return normalized;
        })
        .join(','),
    )
    .join('\n');
}

function extractChatgptArtifactFileId(uri: string | null | undefined): string | null {
  if (typeof uri !== 'string') return null;
  const trimmed = uri.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('chatgpt://file/')) {
    return decodeURIComponent(trimmed.slice('chatgpt://file/'.length));
  }
  if (trimmed.startsWith('sediment://')) {
    return decodeURIComponent(trimmed.slice('sediment://'.length));
  }
  return null;
}

function contentTypeToExtension(contentType: string | null | undefined): string {
  const normalized = String(contentType ?? '').toLowerCase();
  if (normalized.includes('image/png')) return '.png';
  if (normalized.includes('image/jpeg')) return '.jpg';
  if (normalized.includes('image/webp')) return '.webp';
  if (normalized.includes('image/gif')) return '.gif';
  if (normalized.includes('application/zip')) return '.zip';
  if (normalized.includes('application/json')) return '.json';
  if (normalized.includes('text/markdown')) return '.md';
  if (normalized.includes('text/csv')) return '.csv';
  if (normalized.includes('text/tab-separated-values')) return '.tsv';
  if (normalized.includes('application/vnd.openxmlformats-officedocument.wordprocessingml.document')) return '.docx';
  if (normalized.includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')) return '.xlsx';
  if (normalized.includes('application/vnd.ms-excel')) return '.xls';
  if (normalized.includes('text/plain')) return '.txt';
  return '.bin';
}

function extractFilenameFromContentDisposition(value: string | null | undefined): string | null {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const utf8Match = text.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return sanitizeChatgptArtifactFileName(decodeURIComponent(utf8Match[1]));
    } catch {
      return sanitizeChatgptArtifactFileName(utf8Match[1]);
    }
  }
  const plainMatch = text.match(/filename\s*=\s*"?([^";]+)"?/i);
  return plainMatch?.[1] ? sanitizeChatgptArtifactFileName(plainMatch[1]) : null;
}

function extractFilenameFromArtifactUri(uri: string | null | undefined): string | null {
  const value = String(uri ?? '').trim();
  if (!value) return null;
  if (value.startsWith('sandbox:/')) {
    const cleaned = value.replace(/^sandbox:\/*/i, '');
    const parts = cleaned.split('/').filter(Boolean);
    return parts.length > 0 ? sanitizeChatgptArtifactFileName(decodeURIComponent(parts.at(-1)!)) : null;
  }
  try {
    const parsed = new URL(value);
    const parts = parsed.pathname.split('/').filter(Boolean);
    return parts.length > 0 ? sanitizeChatgptArtifactFileName(decodeURIComponent(parts.at(-1)!)) : null;
  } catch {
    return null;
  }
}

function inferMimeTypeFromArtifactName(name: string | null | undefined): string | undefined {
  const normalized = String(name ?? '').trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized.endsWith('.zip')) return 'application/zip';
  if (normalized.endsWith('.json')) return 'application/json';
  if (normalized.endsWith('.md')) return 'text/markdown';
  if (normalized.endsWith('.txt')) return 'text/plain';
  if (normalized.endsWith('.csv')) return 'text/csv';
  if (normalized.endsWith('.tsv')) return 'text/tab-separated-values';
  if (normalized.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  if (normalized.endsWith('.xlsx')) {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }
  if (normalized.endsWith('.xls')) return 'application/vnd.ms-excel';
  return undefined;
}

export function normalizeChatgptConversationDownloadArtifactProbes(
  probes: ReadonlyArray<ChatgptConversationDownloadButtonProbe>,
): ConversationArtifact[] {
  const artifacts: ConversationArtifact[] = [];
  const seen = new Set<string>();
  for (const probe of probes) {
    const title = normalizeUiText(probe.title);
    if (!title) continue;
    const messageId = normalizeUiText(probe.messageId) || undefined;
    const turnId = normalizeUiText(probe.turnId) || undefined;
    const messageIndex =
      typeof probe.messageIndex === 'number' && Number.isFinite(probe.messageIndex)
        ? probe.messageIndex
        : undefined;
    const buttonIndex =
      typeof probe.buttonIndex === 'number' && Number.isFinite(probe.buttonIndex)
        ? probe.buttonIndex
        : 0;
    const identity = `${turnId || messageId || `message-${messageIndex ?? 'n/a'}`}:${buttonIndex}:${title.toLowerCase()}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    artifacts.push({
      id: `download-dom:${encodeURIComponent(turnId || messageId || `message-${messageIndex ?? 'n/a'}`)}:${buttonIndex}`,
      title,
      kind: inferChatgptDownloadArtifactKind(title, null),
      uri: `chatgpt://download-button/${encodeURIComponent(turnId || messageId || `message-${messageIndex ?? 'n/a'}`)}/${buttonIndex}`,
      messageIndex,
      messageId,
      metadata: {
        extraction: 'dom-behavior-button',
        ...(turnId ? { turnId } : {}),
        ...(typeof buttonIndex === 'number' ? { buttonIndex } : {}),
      },
    });
  }
  return artifacts;
}

export function mergeChatgptCanvasArtifactContent(
  artifacts: ReadonlyArray<ConversationArtifact>,
  probes: ReadonlyArray<ChatgptConversationCanvasProbe>,
): ConversationArtifact[] {
  const byTextdocId = new Map<string, ChatgptConversationCanvasProbe>();
  const byTitle = new Map<string, ChatgptConversationCanvasProbe>();
  for (const probe of probes) {
    const textdocId = normalizeUiText(probe.textdocId);
    const title = normalizeUiText(probe.title);
    const contentText = typeof probe.contentText === 'string' ? probe.contentText.trim() : '';
    if (!contentText) continue;
    if (textdocId) byTextdocId.set(textdocId, probe);
    if (title) byTitle.set(title.toLowerCase(), probe);
  }
  return artifacts.map((artifact) => {
    if (artifact.kind !== 'canvas') return artifact;
    const existingContent =
      artifact.metadata && typeof artifact.metadata.contentText === 'string'
        ? artifact.metadata.contentText.trim()
        : '';
    if (existingContent) return artifact;
    const textdocId =
      artifact.metadata && typeof artifact.metadata.textdocId === 'string'
        ? artifact.metadata.textdocId.trim()
        : '';
    const match =
      (textdocId ? byTextdocId.get(textdocId) : null) ??
      byTitle.get(normalizeUiText(artifact.title).toLowerCase()) ??
      null;
    const contentText = typeof match?.contentText === 'string' ? match.contentText.trim() : '';
    if (!contentText) return artifact;
    return {
      ...artifact,
      metadata: {
        ...(artifact.metadata ?? {}),
        contentText,
      },
    };
  });
}

export function mergeChatgptConversationArtifacts(
  payloadArtifacts: ReadonlyArray<ConversationArtifact>,
  domArtifacts: ReadonlyArray<ConversationArtifact>,
): ConversationArtifact[] {
  const merged = [...payloadArtifacts];
  const seenIds = new Set(payloadArtifacts.map((artifact) => artifact.id));
  const seenSemanticKeys = new Set(
    payloadArtifacts.map((artifact) => {
      const indexKey = typeof artifact.messageIndex === 'number' ? artifact.messageIndex : 'n/a';
      return `${artifact.kind ?? 'artifact'}::${normalizeUiText(artifact.title).toLowerCase()}::${indexKey}`;
    }),
  );
  for (const artifact of domArtifacts) {
    if (!artifact.title || seenIds.has(artifact.id)) continue;
    const indexKey = typeof artifact.messageIndex === 'number' ? artifact.messageIndex : 'n/a';
    const semanticKey = `${artifact.kind ?? 'artifact'}::${normalizeUiText(artifact.title).toLowerCase()}::${indexKey}`;
    if (seenSemanticKeys.has(semanticKey)) continue;
    merged.push(artifact);
    seenIds.add(artifact.id);
    seenSemanticKeys.add(semanticKey);
  }
  return merged;
}

function looksLikeChatgptReferenceCandidate(record: Record<string, unknown>): boolean {
  return Boolean(
    readStringField(record, 'id', 'name', 'title', 'url', 'uri', 'href', 'cloud_doc_url', 'source', 'type'),
  );
}

function collectChatgptReferenceCandidates(
  value: unknown,
  depth = 0,
  out: Record<string, unknown>[] = [],
): Record<string, unknown>[] {
  if (depth > 4) {
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectChatgptReferenceCandidates(item, depth + 1, out);
    }
    return out;
  }
  if (!isRecord(value)) {
    return out;
  }
  if (looksLikeChatgptReferenceCandidate(value)) {
    out.push(value);
  }
  for (const child of Object.values(value)) {
    collectChatgptReferenceCandidates(child, depth + 1, out);
  }
  return out;
}

function resolveChatgptReferenceUrl(candidate: Record<string, unknown>): string | null {
  const explicitUrl = readStringField(candidate, 'url', 'uri', 'href', 'cloud_doc_url', 'download_url');
  if (explicitUrl) {
    return explicitUrl;
  }
  const id = readStringField(candidate, 'id', 'file_id');
  if (id) {
    const type = (readStringField(candidate, 'type') ?? '').toLowerCase();
    const source = (readStringField(candidate, 'source') ?? '').toLowerCase();
    if (type === 'file' || source === 'my_files' || source === 'file') {
      return `chatgpt://file/${encodeURIComponent(id)}`;
    }
    return `chatgpt://source/${encodeURIComponent(id)}`;
  }
  const name = readStringField(candidate, 'name', 'title', 'label');
  return name ? `chatgpt://source/${encodeURIComponent(name)}` : null;
}

function resolveChatgptReferenceDomain(url: string): string | undefined {
  if (url.startsWith('chatgpt://file/')) {
    return 'chatgpt-file';
  }
  if (url.startsWith('chatgpt://source/')) {
    return 'chatgpt-source';
  }
  try {
    return new URL(url).hostname || undefined;
  } catch {
    return undefined;
  }
}

export function extractChatgptConversationSourcesFromPayload(
  payload: ChatgptConversationPayload | null | undefined,
  messageIndexById: ReadonlyMap<string, number> = new Map(),
): ConversationSource[] {
  const sources: ConversationSource[] = [];
  const seen = new Set<string>();
  for (const node of listChatgptConversationPayloadNodes(payload)) {
    const message = node.message;
    if (!message) continue;
    const role = readStringField(message.author ?? {}, 'role');
    if (role !== 'assistant') continue;
    const messageId = readStringField(message, 'id') ?? undefined;
    const messageIndex = messageId ? messageIndexById.get(messageId) : undefined;
    const metadata = isRecord(message.metadata) ? message.metadata : null;
    const references = [
      ...collectChatgptReferenceCandidates(metadata?.content_references),
      ...collectChatgptReferenceCandidates(metadata?.citations),
    ];
    for (const reference of references) {
      const url = resolveChatgptReferenceUrl(reference);
      if (!url) continue;
      const key = `${messageId ?? 'n/a'}::${url}`;
      if (seen.has(key)) continue;
      seen.add(key);
      sources.push({
        url,
        title: readStringField(reference, 'name', 'title', 'label') ?? undefined,
        domain: resolveChatgptReferenceDomain(url),
        messageIndex,
        sourceGroup: readStringField(reference, 'source', 'type') ?? undefined,
      });
    }
  }
  return sources;
}

export function extractChatgptConversationArtifactsFromPayload(
  payload: ChatgptConversationPayload | null | undefined,
  messageIndexById: ReadonlyMap<string, number> = new Map(),
): ConversationArtifact[] {
  const artifacts: ConversationArtifact[] = [];
  const seen = new Set<string>();
  const nodes = listChatgptConversationPayloadNodes(payload);
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    const message = node.message;
    if (!message) continue;
    const messageId = readStringField(message, 'id') ?? undefined;
    const messageIndex = messageId ? messageIndexById.get(messageId) : undefined;
    const role = readStringField(message.author ?? {}, 'role');
    for (const part of extractChatgptPayloadMessageTextParts(message)) {
      const matches = part.matchAll(/\[([^\]]+)\]\((sandbox:[^)]+)\)/g);
      for (const match of matches) {
        const title = normalizeUiText(match[1]);
        const uri = normalizeUiText(match[2]);
        if (!title || !uri) continue;
        const id = `${messageId ?? 'message'}:download:${uri}`;
        if (seen.has(id)) continue;
        seen.add(id);
        artifacts.push({
          id,
          title,
          kind: inferChatgptDownloadArtifactKind(title, uri),
          uri,
          messageIndex,
          messageId,
        });
      }
    }
    const metadata = isRecord(message.metadata) ? message.metadata : null;
    for (const part of extractChatgptPayloadMessageStructuredParts(message)) {
      const contentType = readStringField(part, 'content_type');
      if (contentType !== 'image_asset_pointer') {
        continue;
      }
      const assetPointer = readStringField(part, 'asset_pointer', 'assetPointer');
      const width = readFiniteNumberField(part, 'width');
      const height = readFiniteNumberField(part, 'height');
      const sizeBytes = readFiniteNumberField(part, 'size_bytes', 'sizeBytes');
      const partMetadata = isRecord(part.metadata) ? part.metadata : null;
      const artifactId = `${messageId ?? `node-${index}`}:image:${assetPointer ?? seen.size}`;
      if (seen.has(artifactId)) continue;
      seen.add(artifactId);
      artifacts.push({
        id: artifactId,
        title:
          readStringField(metadata ?? {}, 'title', 'image_gen_title') ??
          readStringField(part, 'title', 'name') ??
          'Generated image',
        kind: 'image',
        uri: assetPointer ?? undefined,
        messageIndex,
        messageId,
        metadata: {
          contentType,
          ...(assetPointer ? { assetPointer } : {}),
          ...(typeof sizeBytes === 'number' ? { sizeBytes } : {}),
          ...(typeof width === 'number' ? { width } : {}),
          ...(typeof height === 'number' ? { height } : {}),
          ...(partMetadata?.generation ? { generation: partMetadata.generation } : {}),
          ...(partMetadata?.dalle ? { dalle: partMetadata.dalle } : {}),
        },
      });
    }
    const visualizations =
      metadata && Array.isArray(metadata.ada_visualizations)
        ? metadata.ada_visualizations.filter(isRecord)
        : [];
    for (const visualization of visualizations) {
      const visualizationType = readStringField(visualization, 'type');
      if (visualizationType !== 'table') {
        continue;
      }
      const fileId = readStringField(visualization, 'file_id', 'fileId');
      const artifactId = fileId ? `spreadsheet:${fileId}` : `${messageId ?? `node-${index}`}:spreadsheet`;
      if (seen.has(artifactId)) continue;
      seen.add(artifactId);
      artifacts.push({
        id: artifactId,
        title:
          readStringField(visualization, 'title', 'name') ??
          readStringField(metadata ?? {}, 'title') ??
          'Spreadsheet artifact',
        kind: 'spreadsheet',
        uri: fileId ? `chatgpt://file/${encodeURIComponent(fileId)}` : undefined,
        messageIndex,
        messageId,
        metadata: {
          visualizationType,
          ...(fileId ? { fileId } : {}),
        },
      });
    }
    const canvas = metadata && isRecord(metadata.canvas) ? metadata.canvas : null;
    if (!canvas) continue;
    const textdocId = readStringField(canvas, 'textdoc_id', 'id');
    const metadataTitle = metadata ? readStringField(metadata, 'title') : null;
    const metadataCommand = metadata ? readStringField(metadata, 'command') : null;
    const title = readStringField(canvas, 'title') ?? metadataTitle ?? 'Canvas artifact';
    const artifactId = textdocId ? `canvas:${textdocId}` : `${messageId ?? `node-${index}`}:canvas`;
    if (seen.has(artifactId)) continue;
    seen.add(artifactId);
    const previousCodePreview =
      index > 0 ? parseChatgptCodeArtifactPreview(nodes[index - 1]?.message ?? null) : null;
    artifacts.push({
      id: artifactId,
      title,
      kind: 'canvas',
      uri: textdocId ? `chatgpt://canvas/${encodeURIComponent(textdocId)}` : undefined,
      messageIndex,
      messageId,
      metadata: {
        ...(textdocId ? { textdocId } : {}),
        ...(readStringField(canvas, 'textdoc_type') ? { textdocType: readStringField(canvas, 'textdoc_type') } : {}),
        ...(typeof canvas.version === 'number' && Number.isFinite(canvas.version)
          ? { version: canvas.version }
          : {}),
        ...(readStringField(canvas, 'create_source') ? { createSource: readStringField(canvas, 'create_source') } : {}),
        ...(metadataCommand ? { command: metadataCommand } : {}),
        ...(previousCodePreview?.name ? { documentName: previousCodePreview.name } : {}),
        ...(previousCodePreview?.type ? { documentType: previousCodePreview.type } : {}),
        ...(previousCodePreview?.content ? { contentText: previousCodePreview.content } : {}),
      },
    });
  }
  return artifacts;
}

function buildChatgptConversationPayloadExpression(conversationId: string): string {
  return `(async () => {
    try {
      const response = await fetch(${JSON.stringify(`/backend-api/conversation/${conversationId}`)}, {
        credentials: 'include',
        headers: { accept: 'application/json' },
      });
      const body = await response.text();
      return {
        ok: response.ok,
        status: response.status,
        body,
      };
    } catch (error) {
      const message =
        error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
          ? error.message
          : String(error);
      return {
        ok: false,
        status: 0,
        error: message,
      };
    }
  })()`;
}

async function readChatgptConversationPayloadWithClient(
  client: ChromeClient,
  conversationId: string,
  projectId?: string | null,
): Promise<ChatgptConversationPayload | null> {
  const parsePayloadBody = (body: string | null | undefined, base64Encoded = false): ChatgptConversationPayload | null => {
    if (typeof body !== 'string' || !body.trim()) {
      return null;
    }
    try {
      const decoded = base64Encoded ? Buffer.from(body, 'base64').toString('utf8') : body;
      const parsed = JSON.parse(decoded) as unknown;
      return isRecord(parsed) ? (parsed as ChatgptConversationPayload) : null;
    } catch {
      return null;
    }
  };

  const { result } = await client.Runtime.evaluate({
    expression: buildChatgptConversationPayloadExpression(conversationId),
    awaitPromise: true,
    returnByValue: true,
  });
  const value = isRecord(result?.value) ? (result.value as ChatgptConversationPayloadResponse) : null;
  const directPayload = parsePayloadBody(value?.body);
  if (value?.ok && directPayload && isRecord(directPayload.mapping)) {
    return directPayload;
  }

  const targetUrl = `https://chatgpt.com/backend-api/conversation/${conversationId}`;
  await client.Network.enable().catch(() => undefined);
  await client.Page.enable().catch(() => undefined);

  const bodyPromise = new Promise<{ body: string; base64Encoded: boolean } | null>((resolve) => {
    let settled = false;
    let exactRequestId: string | null = null;
    const finish = (value: { body: string; base64Encoded: boolean } | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), 10_000);
    client.Network.responseReceived((params) => {
      if (settled) return;
      const url = params.response?.url ?? '';
      const status = params.response?.status ?? 0;
      const isExactConversationResponse = url === targetUrl || url.startsWith(`${targetUrl}?`);
      if (!isExactConversationResponse || status < 200 || status >= 300) return;
      exactRequestId = params.requestId;
    });
    client.Network.loadingFinished(async (params) => {
      if (settled || !exactRequestId || params.requestId !== exactRequestId) return;
      clearTimeout(timer);
      const response = await client.Network.getResponseBody({ requestId: params.requestId }).catch(() => null);
      if (!response?.body) {
        finish(null);
        return;
      }
      finish({
        body: response.body,
        base64Encoded: response.base64Encoded ?? false,
      });
    });
  });
  await client.Page.reload({ ignoreCache: true }).catch(() => undefined);
  const response = await bodyPromise;
  return parsePayloadBody(response?.body, response?.base64Encoded ?? false);
}

export function normalizeChatgptConversationLinkProbes(
  probes: readonly ChatgptConversationLinkProbe[],
): Conversation[] {
  const conversations = new Map<string, Conversation>();
  for (const probe of probes) {
    const id = typeof probe.id === 'string' ? probe.id.trim() : '';
    if (!id) continue;
    const title = normalizeUiText(probe.title) || id;
    const normalizedProjectId = normalizeChatgptProjectId(probe.projectId) ?? undefined;
    const url = typeof probe.url === 'string' && probe.url.trim().length > 0 ? probe.url.trim() : undefined;
    const next: Conversation = {
      id,
      title,
      provider: 'chatgpt',
      projectId: normalizedProjectId,
      url,
    };
    const previous = conversations.get(id);
    if (!previous) {
      conversations.set(id, next);
      continue;
    }
    const previousTitle = normalizeUiText(previous.title);
    const nextTitle = normalizeUiText(next.title);
    const useNext =
      (!previousTitle || previousTitle === previous.id) && nextTitle.length > 0
        ? true
        : previousTitle.length > 0 &&
            nextTitle.length > 0 &&
            previousTitle !== nextTitle &&
            previousTitle.startsWith(nextTitle)
          ? true
        : Boolean(!previous.url && next.url) ||
          Boolean(!previous.projectId && next.projectId);
    if (useNext) {
      conversations.set(id, {
        ...previous,
        ...next,
      });
    }
  }
  return Array.from(conversations.values());
}

function buildProjectRouteExpression(projectId?: string): string {
  return `(() => {
    const match = location.pathname.match(/^\\/g\\/([^/]+)\\/project\\/?$/);
    if (!match) return null;
    const rawId = String(match[1] || '').trim();
    const normalized = rawId.match(/^(g-p-[a-z0-9]+)/i);
    if (!normalized) return null;
    const id = normalized[1];
    const expected = ${JSON.stringify(projectId ?? null)};
    if (expected && id !== expected) return null;
    return { id, href: location.href, title: document.title };
  })()`;
}

function buildConversationRouteExpression(conversationId: string, projectId?: string | null): string {
  return `(() => {
    const match = location.pathname.match(/^\\/(?:g\\/([^/]+)\\/)?c\\/([a-zA-Z0-9-]+)\\/?$/);
    if (!match) return null;
    const rawProject = String(match[1] || '').trim();
    const rawConversationId = String(match[2] || '').trim();
    const expectedConversationId = ${JSON.stringify(conversationId)};
    const expectedProjectId = ${JSON.stringify(projectId ?? null)};
    if (rawConversationId !== expectedConversationId) return null;
    const normalizedProjectId = rawProject.match(/^(g-p-[a-z0-9]+)/i)?.[1] ?? null;
    if (expectedProjectId && normalizedProjectId !== expectedProjectId) return null;
    return {
      conversationId: rawConversationId,
      projectId: normalizedProjectId,
      href: location.href,
      title: document.title,
    };
  })()`;
}

function buildConversationSurfaceReadyExpression(conversationId: string, projectId?: string | null): string {
  return `(() => {
    const route = (${buildConversationRouteExpression(conversationId, projectId)});
    if (!route) return null;
    const hasTurns = Boolean(
      document.querySelector('[data-testid^="conversation-turn-"]') ||
      document.querySelector('[data-message-author-role]'),
    );
    const hasComposer = Boolean(
      document.querySelector('textarea[aria-label="Chat with ChatGPT"]') ||
      document.querySelector('[data-testid="composer-plus-btn"]'),
    );
    return hasTurns || hasComposer ? route : null;
  })()`;
}

function buildConversationTitleAppliedExpression(
  conversationId: string,
  expectedTitle: string,
  projectId?: string | null,
): string {
  return `(() => {
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
    const expected = normalize(${JSON.stringify(expectedTitle)});
    if (!expected) return null;
    const expectedConversationId = ${JSON.stringify(conversationId)};
    const expectedProjectId = ${JSON.stringify(projectId ?? null)};
    const isVisible = (node) => {
      if (!(node instanceof Element)) return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const normalizeProjectId = (value) => {
      const trimmed = String(value || '').trim();
      const match = trimmed.match(/^(g-p-[a-z0-9]+)/i);
      return match ? match[1] : null;
    };
    const parseConversationInfo = (href) => {
      try {
        const parsed = new URL(href, location.origin);
        const match = parsed.pathname.match(/^\\/(?:g\\/([^/]+)\\/)?c\\/([a-zA-Z0-9-]+)\\/?$/);
        if (!match) return null;
        return {
          id: String(match[2] || '').trim(),
          projectId: normalizeProjectId(match[1]),
        };
      } catch {
        return null;
      }
    };
    const findRowButtonLabel = (anchor) => {
      let current = anchor instanceof Element ? anchor : null;
      while (current && current !== document.body) {
        const button = Array.from(current.querySelectorAll('button[aria-label]'))
          .find((node) => {
            if (!(node instanceof HTMLButtonElement)) return false;
            if (!isVisible(node)) return false;
            const label = normalize(node.getAttribute('aria-label') || '');
            return label.startsWith('open conversation options for ');
          });
        if (button instanceof HTMLButtonElement) {
          return normalize(button.getAttribute('aria-label') || '').replace(/^open conversation options for\\s+/, '');
        }
        current = current.parentElement;
      }
      return '';
    };
    const buildProbe = (anchor) => {
        const href = anchor.getAttribute('href') || '';
        const info = parseConversationInfo(href);
        if (!info) return null;
        if (expectedProjectId && info.projectId !== expectedProjectId) return null;
        const rowLabel = findRowButtonLabel(anchor);
        const title =
          rowLabel ||
          normalize(anchor.getAttribute('aria-label') || '') ||
          normalize(anchor.textContent || '') ||
          normalize(anchor.getAttribute('title') || '') ||
          info.id;
        const rect = anchor.getBoundingClientRect();
        return {
          id: info.id,
          projectId: info.projectId,
          title,
          top: Math.round(rect.top),
          left: Math.round(rect.left),
          visible: isVisible(anchor),
        };
    };
    const collectAllAnchors = () =>
      Array.from(document.querySelectorAll('a[href]'))
        .map((anchor) => buildProbe(anchor))
        .filter(Boolean)
        .filter((probe) => probe.visible)
        .sort((left, right) => left.top - right.top || left.left - right.left);
    const collectProjectPanelAnchors = () =>
      Array.from(document.querySelectorAll('[role="tabpanel"]'))
        .filter((panel) => isVisible(panel))
        .flatMap((panel) => Array.from(panel.querySelectorAll('a[href]')))
        .map((anchor) => buildProbe(anchor))
        .filter(Boolean)
        .filter((probe) => probe.visible)
        .sort((left, right) => left.top - right.top || left.left - right.left);
    const probes =
      expectedProjectId
        ? (() => {
            const scoped = collectProjectPanelAnchors();
            return scoped.length > 0 ? scoped : collectAllAnchors();
          })()
        : collectAllAnchors();
    const matching = probes.find((probe) => probe.id === expectedConversationId && probe.title === expected) || null;
    if (expectedProjectId) {
      return matching
        ? {
            id: matching.id,
            title: matching.title,
            projectId: matching.projectId ?? null,
          }
        : null;
    }
    const top = probes[0] || null;
    if (matching && top && top.id === expectedConversationId && top.title === expected) {
      return {
        id: matching.id,
        title: matching.title,
        topId: top.id,
        topTitle: top.title,
      };
    }
    return null;
  })()`;
}

function buildConversationDeleteConfirmationExpression(expectedTitle?: string | null): string {
  return `(() => {
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
    const isVisible = (node) => {
      if (!(node instanceof Element)) return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const expected = normalize(${JSON.stringify(expectedTitle ?? null)});
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"], dialog[open]'));
    for (const dialog of dialogs) {
      if (!isVisible(dialog)) continue;
      const text = normalize(dialog.textContent || '');
      const labels = Array.from(dialog.querySelectorAll('button'))
        .map((button) => normalize(button.getAttribute('aria-label') || button.textContent || ''))
        .filter(Boolean);
      const confirmButton = dialog.querySelector('button[data-testid="delete-conversation-confirm-button"]');
      if (!text.includes('delete chat?')) continue;
      if (!labels.includes('delete') || !labels.includes('cancel')) continue;
      if (confirmButton instanceof HTMLButtonElement && isVisible(confirmButton)) {
        return { ok: true, matchedExpected: !expected || text.includes(expected) };
      }
      if (!expected || text.includes(expected)) {
        return { ok: true, matchedExpected: !expected || text.includes(expected) };
      }
    }
    return null;
  })()`;
}

function buildConversationDeletedExpression(conversationId: string, projectId?: string | null): string {
  return `(() => {
    const expectedConversationId = ${JSON.stringify(conversationId)};
    const expectedProjectId = ${JSON.stringify(projectId ?? null)};
    const isVisible = (node) => {
      if (!(node instanceof Element)) return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const parse = (href) => {
      try {
        const parsed = new URL(href, location.origin);
        const match = parsed.pathname.match(/^\\/(?:g\\/([^/]+)\\/)?c\\/([a-zA-Z0-9-]+)\\/?$/);
        if (!match) return null;
        return {
          projectId: String(match[1] || '').trim().match(/^(g-p-[a-z0-9]+)/i)?.[1] ?? null,
          conversationId: String(match[2] || '').trim(),
        };
      } catch {
        return null;
      }
    };
    const current = parse(location.href);
    if (
      current &&
      current.conversationId === expectedConversationId &&
      (!expectedProjectId || current.projectId === expectedProjectId)
    ) {
      return null;
    }
    const collectAnchors = () => {
      if (!expectedProjectId) {
        return Array.from(document.querySelectorAll('a[href]'));
      }
      const scoped = Array.from(document.querySelectorAll('[role="tabpanel"]'))
        .filter((panel) => isVisible(panel))
        .flatMap((panel) => Array.from(panel.querySelectorAll('a[href]')));
      return scoped.length > 0 ? scoped : Array.from(document.querySelectorAll('a[href]'));
    };
    const remaining = collectAnchors().some((anchor) => {
      const info = parse(anchor.getAttribute('href') || '');
      if (!info || info.conversationId !== expectedConversationId) return false;
      if (expectedProjectId && info.projectId !== expectedProjectId) return false;
      return true;
    });
    return remaining ? null : { ok: true, href: location.href };
  })()`;
}

function buildProjectRouteChangeExpression(initialProjectId?: string | null): string {
  return `(() => {
    const match = location.pathname.match(/^\\/g\\/([^/]+)\\/project\\/?$/);
    if (!match) return null;
    const rawId = String(match[1] || '').trim();
    const found = rawId.match(/^(g-p-[a-z0-9]+)/i);
    if (!found) return null;
    const normalized = found[1];
    const initial = ${JSON.stringify(initialProjectId ?? null)};
    if (initial && normalized === initial) return null;
    return { id: normalized, href: location.href, title: document.title };
  })()`;
}

function buildProjectNameAppliedExpression(projectId: string, expectedName: string): string {
  return `(() => {
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
    const expected = normalize(${JSON.stringify(expectedName)});
    if (!expected) return null;
    const values = new Set();
    const title = document.title.replace(/^ChatGPT\\s*-\\s*/i, '');
    values.add(normalize(title));
    const titleButton = Array.from(document.querySelectorAll('button,[role="button"]'))
      .find((node) => normalize(node.getAttribute('aria-label') || '').startsWith('edit the title of '));
    if (titleButton) {
      values.add(normalize(titleButton.textContent || ''));
      const aria = normalize(titleButton.getAttribute('aria-label') || '');
      if (aria.startsWith('edit the title of ')) {
        values.add(aria.replace(/^edit the title of\\s+/, ''));
      }
    }
    const projectLink = document.querySelector(${JSON.stringify(`a[href*="/g/${projectId}/project"]`)});
    if (projectLink) {
      values.add(normalize(projectLink.textContent || ''));
    }
    return Array.from(values).some((value) => value === expected) ? { values: Array.from(values) } : null;
  })()`;
}

function buildProjectSurfaceReadyExpression(projectId?: string | null): string {
  return `(() => {
    const route = location.pathname.match(/^\\/g\\/([^/]+)\\/project\\/?$/);
    if (!route) return null;
    const rawId = String(route[1] || '').trim();
    const match = rawId.match(/^(g-p-[a-z0-9]+)/i);
    if (!match) return null;
    const normalizedId = match[1];
    const expected = ${JSON.stringify(projectId ?? null)};
    if (expected && normalizedId !== expected) return null;
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
    const labels = Array.from(document.querySelectorAll('button,[role="button"],a,[role="tab"]'))
      .map((node) => normalize(node.getAttribute('aria-label') || node.textContent || ''))
      .filter(Boolean);
    const hasProjectControls =
      labels.some((label) => label.startsWith('edit the title of ')) ||
      labels.includes('show project details') ||
      (labels.includes('chats') && labels.includes('sources'));
    return hasProjectControls ? { id: normalizedId, href: location.href, labels: labels.slice(0, 20) } : null;
  })()`;
}

function buildProjectSettingsReadyExpression(): string {
  return `(() => {
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"], dialog[open]'));
    for (const dialog of dialogs) {
      const text = normalize(dialog.textContent || '');
      const hasNameInput = Boolean(dialog.querySelector('input[aria-label="Project name"]'));
      const hasInstructions = Boolean(dialog.querySelector('textarea[aria-label="Instructions"], textarea#instructions'));
      const hasDelete = Array.from(dialog.querySelectorAll('button'))
        .some((button) => normalize(button.textContent || '') === 'delete project');
      if (hasNameInput || hasInstructions || hasDelete || text.includes('project settings')) {
        return { ok: true };
      }
    }
    return null;
  })()`;
}

function buildProjectSourcesReadyExpression(projectId?: string | null): string {
  return `(() => {
    const route = location.pathname.match(/^\\/g\\/([^/]+)\\/project\\/?$/);
    if (!route) return null;
    const rawId = String(route[1] || '').trim();
    const match = rawId.match(/^(g-p-[a-z0-9]+)/i);
    if (!match) return null;
    const normalizedId = match[1];
    const expected = ${JSON.stringify(projectId ?? null)};
    if (expected && normalizedId !== expected) return null;
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
    const queryTab = new URL(location.href).searchParams.get('tab');
    const sourceTab = Array.from(document.querySelectorAll('[role="tab"]'))
      .find((node) => {
        const id = String(node.getAttribute('id') || '');
        const label = normalize(node.textContent || node.getAttribute('aria-label') || '');
        return id.endsWith('-sources') || label === 'sources';
      });
    const selected = String(sourceTab?.getAttribute('aria-selected') || '').toLowerCase() === 'true';
    const addSources = Array.from(document.querySelectorAll('button,[role="button"]'))
      .find((node) => {
        const label = normalize(node.textContent || node.getAttribute('aria-label') || '');
        return label === 'add sources' || label === 'add';
      });
    const hasRows = document.querySelectorAll('button[aria-label="Source actions"]').length > 0;
    return (selected || queryTab === 'sources') && (Boolean(addSources) || hasRows)
      ? { id: normalizedId, href: location.href, selected, hasRows }
      : null;
  })()`;
}

function buildProjectSourcesUploadDialogReadyExpression(): string {
  return `(() => {
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"], dialog[open]'));
    for (const dialog of dialogs) {
      const text = normalize(dialog.textContent || '');
      const hasInput = Boolean(dialog.querySelector('input[type="file"][multiple]'));
      const hasUpload = Array.from(dialog.querySelectorAll('button,[role="button"]'))
        .some((node) => normalize(node.textContent || node.getAttribute('aria-label') || '') === 'upload');
      if ((text.includes('add sources') || text.includes('drag sources here')) && hasInput && hasUpload) {
        return { ok: true };
      }
    }
    return null;
  })()`;
}

function buildProjectSourcesSnapshotExpression(): string {
  return `(() => {
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
    const panel = Array.from(document.querySelectorAll('[role="tabpanel"]'))
      .find((node) => String(node.getAttribute('aria-labelledby') || '').endsWith('-sources'));
    const scope = panel || document;
    const rows = Array.from(scope.querySelectorAll('div[class*="group/file-row"]'));
    return rows.map((row) => {
      const leafTexts = Array.from(row.querySelectorAll('div,span,p'))
        .map((node) => normalize(node.textContent || ''))
        .filter(Boolean)
        .slice(0, 24);
      const metadataText = leafTexts.find((text) => text.includes(' · ')) || null;
      return {
        rowText: normalize(row.textContent || ''),
        leafTexts,
        metadataText,
      };
    });
  })()`;
}

function buildProjectSourceNamesPresentExpression(fileNames: readonly string[]): string {
  return `(() => {
    const expected = ${JSON.stringify(fileNames)}.map((value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase()).filter(Boolean);
    if (expected.length === 0) return { ok: true, names: [] };
    const texts = [];
    const pushText = (value) => {
      const normalized = String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
      if (normalized) texts.push(normalized);
    };
    for (const row of Array.from(document.querySelectorAll('div[class*="group/file-row"]'))) {
      pushText(row.textContent || '');
      for (const node of Array.from(row.querySelectorAll('div,span,p'))) {
        pushText(node.textContent || '');
      }
    }
    const unique = Array.from(new Set(texts));
    const matches = expected.filter((name) => unique.some((text) => text === name || text.includes(name)));
    return matches.length === expected.length ? { ok: true, matches, names: unique.slice(0, 40) } : null;
  })()`;
}

function buildProjectSourceRemovedExpression(fileName: string): string {
  return `(() => {
    const expected = String(${JSON.stringify(fileName)} || '').replace(/\\s+/g, ' ').trim().toLowerCase();
    const texts = [];
    const pushText = (value) => {
      const normalized = String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
      if (normalized) texts.push(normalized);
    };
    for (const row of Array.from(document.querySelectorAll('div[class*="group/file-row"]'))) {
      pushText(row.textContent || '');
      for (const node of Array.from(row.querySelectorAll('div,span,p'))) {
        pushText(node.textContent || '');
      }
    }
    return texts.some((text) => text === expected || text.includes(expected)) ? null : { ok: true };
  })()`;
}

function buildChatgptAuthSessionIdentityExpression(): string {
  return `(async () => {
    try {
      const response = await fetch('/api/auth/session', {
        credentials: 'include',
        headers: { accept: 'application/json' },
      });
      if (!response.ok) {
        return null;
      }
      const data = await response.json();
      return {
        user: data?.user
          ? {
              id: typeof data.user.id === 'string' ? data.user.id : null,
              name: typeof data.user.name === 'string' ? data.user.name : null,
              email: typeof data.user.email === 'string' ? data.user.email : null,
            }
          : null,
        account: data?.account
          ? {
              id: typeof data.account.id === 'string' ? data.account.id : null,
              name: typeof data.account.name === 'string' ? data.account.name : null,
              email: typeof data.account.email === 'string' ? data.account.email : null,
            }
          : null,
      };
    } catch {
      return null;
    }
  })()`;
}

function buildChatgptFallbackIdentityExpression(): string {
  return `(() => {
    const normalize = (value) => String(value || '').trim();
    const storageKeys = Object.keys(window.localStorage || {});
    const userKey = storageKeys.find((key) => /(?:^|\\/)user-[A-Za-z0-9]+/.test(key)) || '';
    const idMatch = userKey.match(/(user-[A-Za-z0-9]+)/);
    const profileTrigger = Array.from(document.querySelectorAll('button,a,[role="button"]'))
      .map((node) => normalize(node.getAttribute('aria-label') || ''))
      .find((label) => /open profile menu$/i.test(label) && label.toLowerCase() !== 'open profile menu');
    const name = profileTrigger ? profileTrigger.replace(/,?\\s*open profile menu$/i, '').trim() : '';
    return {
      user: {
        id: idMatch ? idMatch[1] : null,
        name: name || null,
        email: null,
      },
      account: null,
    };
  })()`;
}

function buildProjectDeleteConfirmationExpression(): string {
  return `(() => {
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"], dialog[open]'));
    for (const dialog of dialogs) {
      const text = normalize(dialog.textContent || '');
      const labels = Array.from(dialog.querySelectorAll('button'))
        .map((button) => normalize(button.getAttribute('aria-label') || button.textContent || ''))
        .filter(Boolean);
      if (text.includes('delete project?') && labels.includes('delete') && labels.includes('cancel')) {
        return { ok: true };
      }
    }
    return null;
  })()`;
}

async function connectToChatgptTab(
  options?: BrowserProviderListOptions,
  urlOverride?: string,
): Promise<{
  client: ChromeClient;
  targetId?: string;
  shouldClose: boolean;
  host: string;
  port: number;
  usedExisting: boolean;
}> {
  let host = options?.host ?? '127.0.0.1';
  let port = options?.port ?? resolvePortFromEnv();
  if (options?.tabTargetId && port) {
    try {
      const client = await connectToChromeTarget({ host, port, target: options.tabTargetId });
      await Promise.all([client.Page.enable(), client.Runtime.enable()]);
      setClientSuppressFocus(client, resolveBrowserTabPolicy(options).suppressFocus);
      return {
        client,
        targetId: options.tabTargetId,
        shouldClose: false,
        host,
        port,
        usedExisting: true,
      };
    } catch {
      // Fall back to rescanning below when the previously resolved target id went stale.
    }
  }

  const serviceResolver = options?.browserService as
    | (import('../service/browserService.js').BrowserService & {
        resolveServiceTarget?: (options: {
          serviceId: 'chatgpt';
          configuredUrl?: string | null;
          ensurePort?: boolean;
        }) => Promise<{ host?: string; port?: number; tab?: { targetId?: string; id?: string } | null }>;
      })
    | undefined;
  const preferredUrl = urlOverride ?? options?.configuredUrl ?? CHATGPT_HOME_URL;
  let resolvedTargetIdFromService: string | undefined;
  if (serviceResolver?.resolveServiceTarget) {
    const target = await serviceResolver.resolveServiceTarget({
      serviceId: 'chatgpt',
      configuredUrl: preferredUrl,
      ensurePort: true,
    });
    host = target.host ?? host;
    port = target.port ?? port;
    resolvedTargetIdFromService = resolveChatgptTargetId(target.tab);
  }
  if ((!port || !host) && options?.browserService) {
    const target = await options.browserService.resolveDevToolsTarget({
      host,
      port: port ?? undefined,
      ensurePort: true,
      launchUrl: preferredUrl,
    });
    host = target.host ?? host;
    port = target.port ?? port;
  }
  if (!port) {
    throw new Error('Missing DevTools port. Launch a ChatGPT browser session or set AURACALL_BROWSER_PORT.');
  }

  const resolvedPort = port;
  const targets = await CDP.List({ host, port: resolvedPort });
  const candidates = targets.filter((target) => target.type === 'page' && isChatgptUrl(target.url ?? ''));
  const serviceResolved = resolvedTargetIdFromService
    ? candidates.find((target) => resolveChatgptTargetId(target) === resolvedTargetIdFromService)
    : undefined;
  let targetInfo = serviceResolved ?? candidates[0];
  let shouldClose = false;
  let usedExisting = Boolean(resolveChatgptTargetId(targetInfo));
  const tabPolicy = resolveBrowserTabPolicy(options);

  if (!targetInfo) {
    const opened = await openOrReuseChromeTarget(resolvedPort, preferredUrl, {
      host,
      reusePolicy: 'same-origin',
      compatibleHosts: CHATGPT_COMPATIBLE_HOSTS,
      matchingTabLimit: tabPolicy.serviceTabLimit,
      blankTabLimit: tabPolicy.blankTabLimit,
      collapseDisposableWindows: tabPolicy.collapseDisposableWindows,
      suppressFocus: tabPolicy.suppressFocus,
    });
    targetInfo = opened.target ?? undefined;
    shouldClose = !opened.reused;
    usedExisting = opened.reused;
  }

  const targetId = resolveChatgptTargetId(targetInfo);
  if (!targetId) {
    throw new Error('No ChatGPT tab found. Launch a ChatGPT browser session and retry.');
  }
  const client = await connectToChromeTarget({ host, port: resolvedPort, target: targetId });
  await Promise.all([client.Page.enable(), client.Runtime.enable()]);
  setClientSuppressFocus(client, tabPolicy.suppressFocus);
  return { client, targetId, shouldClose, host, port: resolvedPort, usedExisting };
}

async function ensureChatgptSidebarOpen(client: ChromeClient): Promise<void> {
  const sidebarReady = await waitForPredicate(
    client.Runtime,
    `(() => {
      const sidebarMarkers = [
        ...Array.from(document.querySelectorAll('button,a,[role="button"]'))
          .map((node) => String(node.getAttribute('aria-label') || node.textContent || '').replace(/\\s+/g, ' ').trim().toLowerCase()),
      ];
      return sidebarMarkers.includes('new project') ? { ok: true } : null;
    })()`,
    { timeoutMs: 800 },
  );
  if (sidebarReady.ok) return;
  const opened = await pressButton(client.Runtime, {
    match: { exact: ['open sidebar'] },
    requireVisible: true,
    timeoutMs: 2000,
  });
  if (!opened.ok) {
    return;
  }
  await waitForPredicate(
    client.Runtime,
    `(() => Array.from(document.querySelectorAll('button,a,[role="button"]'))
      .some((node) => String(node.textContent || '').replace(/\\s+/g, ' ').trim().toLowerCase() === 'new project') || null)()`,
    { timeoutMs: 3000 },
  );
}

async function navigateToChatgptUrl(client: ChromeClient, url: string, projectId?: string): Promise<void> {
  const settled = await navigateAndSettle(client, {
    url,
    routeExpression: buildProjectRouteExpression(projectId),
    routeDescription: projectId ? `chatgpt project ${projectId}` : `chatgpt route ${url}`,
    waitForDocumentReady: true,
    fallbackToLocationAssign: true,
    timeoutMs: 10_000,
    fallbackTimeoutMs: 10_000,
  });
  if (projectId && !settled.ok) {
    throw new Error(settled.reason || `ChatGPT project ${projectId} did not settle`);
  }
}

async function openProjectSourcesTab(client: ChromeClient, projectId: string): Promise<void> {
  const url = `https://chatgpt.com/g/${projectId}/project?tab=sources`;
  const settled = await navigateAndSettle(client, {
    url,
    routeExpression: buildProjectRouteExpression(projectId),
    routeDescription: `chatgpt project ${projectId}`,
    readyExpression: buildProjectSourcesReadyExpression(projectId),
    readyDescription: `ChatGPT project sources ready for ${projectId}`,
    waitForDocumentReady: true,
    fallbackToLocationAssign: true,
    timeoutMs: 10_000,
    fallbackTimeoutMs: 10_000,
  });
  if (settled.ok) return;
  await withUiDiagnostics(
    client.Runtime,
    async () => {
      const opened = await openSurface(client.Runtime, {
        readyExpression: buildProjectSourcesReadyExpression(projectId),
        readyDescription: `ChatGPT project sources ready for ${projectId}`,
        alreadyOpenTimeoutMs: 800,
        readyTimeoutMs: 3_000,
        timeoutMs: 5_000,
        attempts: [
          {
            name: 'sources-tab-id',
            trigger: {
              selector: '[role="tab"][id$="-sources"]',
              interactionStrategies: ['pointer', 'keyboard-space', 'keyboard-arrowdown'],
              requireVisible: true,
              timeoutMs: 3_000,
            },
          },
          {
            name: 'sources-tab-label',
            trigger: {
              match: { exact: ['sources'] },
              rootSelectors: ['[role="tablist"]'],
              interactionStrategies: ['pointer', 'keyboard-space', 'keyboard-arrowdown'],
              requireVisible: true,
              timeoutMs: 3_000,
            },
          },
        ],
      });
      if (!opened.ok) {
        throw new Error(
          `ChatGPT project sources tab did not open (${JSON.stringify({
            reason: opened.reason,
            attempts: opened.attempts,
          })})`,
        );
      }
    },
    {
      label: 'chatgpt-open-project-sources',
      candidateSelectors: ['[role="tab"]', 'button', '[role="button"]', 'div[class*="group/file-row"]'],
      context: {
        surface: 'chatgpt-project-sources',
        projectId,
      },
    },
  );
}

async function readChatgptProjectSourceFiles(client: ChromeClient): Promise<FileRef[]> {
  const { result } = await client.Runtime.evaluate({
    expression: buildProjectSourcesSnapshotExpression(),
    returnByValue: true,
  });
  const probes = Array.isArray(result?.value) ? (result.value as ChatgptProjectSourceProbe[]) : [];
  return normalizeChatgptProjectSourceProbes(probes);
}

async function readChatgptProjectSourceFilesSettled(
  client: ChromeClient,
  options?: { timeoutMs?: number; pollMs?: number },
): Promise<FileRef[]> {
  const timeoutMs = options?.timeoutMs ?? 5_000;
  const pollMs = options?.pollMs ?? 400;
  const deadline = Date.now() + timeoutMs;
  let last: FileRef[] = [];
  while (Date.now() < deadline) {
    const files = await readChatgptProjectSourceFiles(client);
    if (files.length > 0) {
      return files;
    }
    last = files;
    await sleep(pollMs);
  }
  return last;
}

async function reloadProjectSourcesTab(client: ChromeClient, projectId: string): Promise<void> {
  await client.Page.reload({ ignoreCache: true });
  const ready = await waitForPredicate(
    client.Runtime,
    buildProjectSourcesReadyExpression(projectId),
    {
      timeoutMs: 15_000,
      description: `ChatGPT project sources ready after reload for ${projectId}`,
    },
  );
  if (ready.ok) return;
  await openProjectSourcesTab(client, projectId);
}

async function waitForProjectSourceNamesPersisted(
  client: ChromeClient,
  projectId: string,
  expectedNames: readonly string[],
): Promise<void> {
  const deadline = Date.now() + 30_000;
  await sleep(4_000);
  while (Date.now() < deadline) {
    await reloadProjectSourcesTab(client, projectId);
    const persisted = await waitForPredicate(
      client.Runtime,
      buildProjectSourceNamesPresentExpression(expectedNames),
      {
        timeoutMs: 8_000,
        description: `ChatGPT project source list persisted for ${projectId}`,
      },
    );
    if (persisted.ok) {
      return;
    }
    await sleep(2_000);
  }
  throw new Error(`ChatGPT project source upload did not persist for ${projectId}`);
}

async function waitForProjectSourceRemovedPersisted(
  client: ChromeClient,
  projectId: string,
  fileName: string,
): Promise<void> {
  const deadline = Date.now() + 20_000;
  await sleep(1_500);
  while (Date.now() < deadline) {
    await reloadProjectSourcesTab(client, projectId);
    const removed = await waitForPredicate(
      client.Runtime,
      buildProjectSourceRemovedExpression(fileName),
      {
        timeoutMs: 6_000,
        description: `ChatGPT project source removed after reload: ${fileName}`,
      },
    );
    if (removed.ok) {
      return;
    }
    await sleep(1_500);
  }
  throw new Error(`ChatGPT project source "${fileName}" still appeared after reload`);
}

async function openProjectSourcesUploadDialog(client: ChromeClient, projectId: string): Promise<void> {
  await openProjectSourcesTab(client, projectId);
  await withUiDiagnostics(
    client.Runtime,
    async () => {
      const opened = await openSurface(client.Runtime, {
        readyExpression: buildProjectSourcesUploadDialogReadyExpression(),
        readyDescription: `ChatGPT project sources upload dialog ready for ${projectId}`,
        alreadyOpenTimeoutMs: 800,
        readyTimeoutMs: 3_000,
        timeoutMs: 5_000,
        attempts: [
          {
            name: 'add-sources',
            trigger: {
              match: { exact: ['add sources'] },
              interactionStrategies: ['pointer', 'keyboard-space', 'keyboard-arrowdown'],
              requireVisible: true,
              timeoutMs: 3_000,
            },
          },
          {
            name: 'add-empty-state',
            trigger: {
              match: { exact: ['add'] },
              interactionStrategies: ['pointer', 'keyboard-space', 'keyboard-arrowdown'],
              requireVisible: true,
              timeoutMs: 3_000,
            },
          },
        ],
      });
      if (!opened.ok) {
        throw new Error(
          `ChatGPT project sources upload dialog did not open (${JSON.stringify({
            reason: opened.reason,
            attempts: opened.attempts,
          })})`,
        );
      }
    },
    {
      label: 'chatgpt-open-project-sources-upload-dialog',
      candidateSelectors: ['button', '[role="button"]', '[role="dialog"]', 'input[type="file"]'],
      context: {
        surface: 'chatgpt-project-sources-upload-dialog',
        projectId,
      },
    },
  );
}

async function tagChatgptProjectSourceInput(client: ChromeClient): Promise<string> {
  const { result } = await client.Runtime.evaluate({
    expression: `(() => {
      const attribute = ${JSON.stringify(CHATGPT_PROJECT_SOURCES_INPUT_ATTR)};
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
      const isVisible = (el) => {
        if (!(el instanceof Element)) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      for (const node of Array.from(document.querySelectorAll('[' + attribute + ']'))) {
        node.removeAttribute(attribute);
      }
      const dialogs = Array.from(document.querySelectorAll('[role="dialog"], dialog[open]'))
        .filter((dialog) => isVisible(dialog))
        .sort((left, right) => {
          const leftText = normalize(left.textContent || '');
          const rightText = normalize(right.textContent || '');
          const leftScore = Number(leftText.includes('add sources') || leftText.includes('drag sources here'));
          const rightScore = Number(rightText.includes('add sources') || rightText.includes('drag sources here'));
          return rightScore - leftScore;
        });
      const scopes = dialogs.length > 0 ? dialogs : [document];
      let input = null;
      for (const scope of scopes) {
        input = Array.from(scope.querySelectorAll('input[type="file"]'))
          .find((node) => !['upload-files', 'upload-photos', 'upload-camera'].includes(node.id));
        if (input) {
          break;
        }
      }
      if (!(input instanceof HTMLInputElement)) {
        return { ok: false };
      }
      input.setAttribute(attribute, 'true');
      return { ok: true, selector: 'input[' + attribute + '="true"]' };
    })()`,
    returnByValue: true,
  });
  const info = result?.value as { ok?: boolean; selector?: string } | undefined;
  if (!info?.ok || !info.selector) {
    throw new Error('ChatGPT project sources file input not found');
  }
  return info.selector;
}

async function uploadChatgptProjectSourceFilesWithClient(
  client: ChromeClient,
  projectId: string,
  filePaths: readonly string[],
): Promise<void> {
  if (filePaths.length === 0) return;
  await openProjectSourcesUploadDialog(client, projectId);
  const selector = await tagChatgptProjectSourceInput(client);
  await client.DOM.enable();
  const documentRoot = await client.DOM.getDocument({ depth: 0 });
  const query = await client.DOM.querySelector({
    nodeId: documentRoot.root.nodeId,
    selector,
  });
  if (!query.nodeId) {
    throw new Error('ChatGPT project sources upload input could not be resolved');
  }
  await client.DOM.setFileInputFiles({
    nodeId: query.nodeId,
    files: [...filePaths],
  });
  await client.Runtime.evaluate({
    expression: `(() => {
      const input = document.querySelector(${JSON.stringify(selector)});
      if (!(input instanceof HTMLInputElement)) return false;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`,
    returnByValue: true,
  }).catch(() => undefined);
  const expectedNames = filePaths.map((filePath) => path.basename(filePath));
  const uploadReady = await waitForPredicate(
    client.Runtime,
    buildProjectSourceNamesPresentExpression(expectedNames),
    {
      timeoutMs: 12_000,
      description: `ChatGPT project sources appeared for ${projectId}`,
    },
  );
  if (!uploadReady.ok && filePaths.length === 1) {
    await transferAttachmentViaDataTransfer(
      client.Runtime,
      {
        path: filePaths[0],
        displayPath: filePaths[0],
      },
      selector,
    );
  }
  const previewVerified = await waitForPredicate(
    client.Runtime,
    buildProjectSourceNamesPresentExpression(expectedNames),
    {
      timeoutMs: 12_000,
      description: `ChatGPT project source preview ready for ${projectId}`,
    },
  );
  if (!previewVerified.ok) {
    throw new Error(`ChatGPT project source upload preview did not appear for ${projectId}`);
  }
  await waitForProjectSourceNamesPersisted(client, projectId, expectedNames);
}

async function tagChatgptProjectSourceAction(client: ChromeClient, fileName: string): Promise<string> {
  const { result } = await client.Runtime.evaluate({
    expression: `(() => {
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
      const expected = normalize(${JSON.stringify(fileName)});
      const attribute = ${JSON.stringify(CHATGPT_PROJECT_SOURCE_ACTION_ATTR)};
      for (const node of Array.from(document.querySelectorAll('[' + attribute + ']'))) {
        node.removeAttribute(attribute);
      }
      const rows = Array.from(document.querySelectorAll('div[class*="group/file-row"]'));
      const extractName = (row) => {
        const rowText = String(row.textContent || '').replace(/\\s+/g, ' ').trim();
        const leafTexts = Array.from(row.querySelectorAll('div,span,p'))
          .map((node) => String(node.textContent || '').replace(/\\s+/g, ' ').trim())
          .filter(Boolean);
        for (const candidate of leafTexts) {
          if (candidate === rowText) continue;
          if (candidate.includes(' · ')) continue;
          if (/^(file|pdf|docx?|txt|csv|image|png|jpe?g|webp)\\b/i.test(candidate)) continue;
          return candidate;
        }
        const beforeMeta = rowText.split(/\\s+·\\s+/)[0]?.trim() ?? '';
        return beforeMeta.replace(/(?:file|pdf|docx?|txt|csv|image|png|jpe?g|webp)$/i, '').trim() || beforeMeta;
      };
      for (const row of rows) {
        const name = normalize(extractName(row));
        if (!name || name !== expected) continue;
        const button = row.querySelector('button[aria-label="Source actions"]');
        if (!(button instanceof HTMLButtonElement)) continue;
        button.setAttribute(attribute, 'true');
        return { ok: true, selector: 'button[' + attribute + '="true"]' };
      }
      return {
        ok: false,
        candidates: rows
          .map((row) => extractName(row))
          .filter(Boolean)
          .slice(0, 10),
      };
    })()`,
    returnByValue: true,
  });
  const info = result?.value as { ok?: boolean; selector?: string; candidates?: string[] } | undefined;
  if (!info?.ok || !info.selector) {
    const candidates = Array.isArray(info?.candidates) && info.candidates.length > 0
      ? ` (${info.candidates.join(', ')})`
      : '';
    throw new Error(`ChatGPT project source action button not found for "${fileName}"${candidates}`);
  }
  return info.selector;
}

async function confirmChatgptProjectSourceRemovalIfPresent(client: ChromeClient, fileName: string): Promise<void> {
  await client.Runtime.evaluate({
    expression: `(() => {
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
      const expected = normalize(${JSON.stringify(fileName)});
      for (const dialog of Array.from(document.querySelectorAll('[role="dialog"], dialog[open]'))) {
        const text = normalize(dialog.textContent || '');
        if (!text.includes('remove') && !text.includes('delete')) continue;
        if (expected && text && !text.includes(expected) && !text.includes('source')) continue;
        const button = Array.from(dialog.querySelectorAll('button'))
          .find((node) => {
            const label = normalize(node.textContent || node.getAttribute('aria-label') || '');
            return label === 'remove' || label === 'delete';
          });
        if (button instanceof HTMLButtonElement) {
          button.click();
          return true;
        }
      }
      return false;
    })()`,
    returnByValue: true,
  }).catch(() => undefined);
}

async function openCreateProjectModalWithClient(client: ChromeClient): Promise<void> {
  await withUiDiagnostics(
    client.Runtime,
    async () => {
      await ensureChatgptSidebarOpen(client);
      const alreadyReady = await waitForCreateProjectDialogReady(client, 750);
      if (alreadyReady) return;
      const genericDialogOpen = await waitForSelector(client.Runtime, CHATGPT_PROJECT_DIALOG_SELECTOR, 500);
      if (genericDialogOpen) {
        await closeDialog(client.Runtime, CHATGPT_PROJECT_DIALOG_ROOT_SELECTORS).catch(() => undefined);
      }
      const pressed = await pressButton(client.Runtime, {
        match: { exact: ['new project'] },
        requireVisible: true,
        timeoutMs: 3000,
      });
      if (!pressed.ok) {
        throw new Error(pressed.reason || 'New project button not found');
      }
      const ready = await waitForCreateProjectDialogReady(client, 6000);
      if (!ready) {
        throw new Error('ChatGPT create-project dialog did not become ready');
      }
    },
    {
      label: 'chatgpt-open-create-project-modal',
      candidateSelectors: ['button', '[role="button"]', 'dialog', '[role="dialog"]'],
    },
  );
}

async function waitForCreateProjectDialogReady(client: ChromeClient, timeoutMs: number): Promise<boolean> {
  const ready = await waitForPredicate(
    client.Runtime,
    `(() => {
      const rootSelectors = ${JSON.stringify(Array.from(CHATGPT_PROJECT_DIALOG_ROOT_SELECTORS))};
      const inputSelector = ${JSON.stringify(CHATGPT_PROJECT_NAME_INPUT_SELECTOR)};
      const settingsLabel = ${JSON.stringify(CHATGPT_PROJECT_SETTINGS_BUTTON_MATCH)};
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
      const isVisible = (el) => {
        if (!(el instanceof Element)) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const roots = rootSelectors
        .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
        .filter((node, index, array) => array.indexOf(node) === index && isVisible(node));
      return roots.some((root) => {
        const nameInput = root.querySelector(inputSelector);
        if (nameInput && isVisible(nameInput)) {
          return true;
        }
        return Array.from(root.querySelectorAll('button, [role="button"]')).some((button) => {
          if (!isVisible(button)) return false;
          const label = normalize(button.getAttribute('aria-label') || button.textContent || button.getAttribute('title') || '');
          return label.includes(settingsLabel);
        });
      });
    })()`,
    {
      timeoutMs,
      description: 'ChatGPT create-project dialog ready',
    },
  );
  return ready.ok;
}

async function readChatgptUserIdentity(client: ChromeClient): Promise<ProviderUserIdentity | null> {
  const authSessionResult = await client.Runtime.evaluate({
    expression: buildChatgptAuthSessionIdentityExpression(),
    awaitPromise: true,
    returnByValue: true,
  });
  const authIdentity = normalizeChatgptAuthSessionIdentity(
    (authSessionResult.result?.value as ChatgptAuthSessionProbe | null | undefined) ?? null,
  );
  if (authIdentity) {
    return authIdentity;
  }

  const fallbackResult = await client.Runtime.evaluate({
    expression: buildChatgptFallbackIdentityExpression(),
    returnByValue: true,
  });
  return normalizeChatgptAuthSessionIdentity(
    (fallbackResult.result?.value as ChatgptAuthSessionProbe | null | undefined) ?? null,
  );
}

async function setCreateProjectFieldsWithClient(
  client: ChromeClient,
  fields: { name?: string; instructions?: string; memoryMode?: ProjectMemoryMode },
): Promise<void> {
  if (fields.name) {
    const ok = await setInputValue(client.Runtime, {
      selector: CHATGPT_PROJECT_NAME_INPUT_SELECTOR,
      rootSelectors: [...CHATGPT_PROJECT_DIALOG_ROOT_SELECTORS],
      value: fields.name,
      requireVisible: true,
      timeoutMs: 5000,
    });
    if (!ok) {
      throw new Error('ChatGPT project name input not found');
    }
  }
  if (fields.memoryMode) {
    await setCreateProjectMemoryModeWithClient(client, fields.memoryMode);
  }
}

async function setCreateProjectMemoryModeWithClient(
  client: ChromeClient,
  memoryMode: ProjectMemoryMode,
): Promise<void> {
  const targetLabel = resolveChatgptProjectMemoryLabel(memoryMode);
  const interactionStrategies = ['pointer', 'keyboard-space', 'keyboard-arrowdown'] as const;
  await withUiDiagnostics(
    client.Runtime,
    async () => {
      const menuAlreadyOpen = await waitForSelector(client.Runtime, '[role="menu"] [role="menuitemradio"]', 250);
      if (!menuAlreadyOpen) {
        const opened = await openMenu(client.Runtime, {
          trigger: {
            match: { exact: [CHATGPT_PROJECT_SETTINGS_BUTTON_MATCH] },
            requireVisible: true,
            rootSelectors: [...CHATGPT_PROJECT_DIALOG_ROOT_SELECTORS],
            interactionStrategies,
          },
          menuSelector: '[role="menu"]',
          expectedItemMatch: { startsWith: [targetLabel.toLowerCase()] },
          timeoutMs: 3000,
        });
        if (!opened.ok) {
          const detail = JSON.stringify({
            reason: opened.reason,
            interactionStrategies,
            attemptedStrategies: opened.attemptedStrategies,
            rootSelectorUsed: opened.rootSelectorUsed,
          });
          throw new Error(`ChatGPT project settings menu trigger did not open (${detail})`);
        }
      }
      const { result } = await client.Runtime.evaluate({
        expression: `(() => {
          const target = ${JSON.stringify(targetLabel.toLowerCase())};
          const items = Array.from(document.querySelectorAll('[role="menuitemradio"]'));
          const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
          const item = items.find((node) => normalize(node.textContent).startsWith(target));
          if (!item) {
            return {
              ok: false,
              reason: 'memory-option-missing',
              visibleOptions: items.map((node) => normalize(node.textContent)),
            };
          }
          item.click();
          return { ok: true };
        })()`,
        returnByValue: true,
      });
      const info = result?.value as
        | { ok?: boolean; reason?: string; visibleOptions?: string[] }
        | undefined;
      if (!info?.ok) {
        const visible = Array.isArray(info?.visibleOptions) && info.visibleOptions.length > 0
          ? ` (${info.visibleOptions.join(', ')})`
          : '';
        throw new Error(`${info?.reason || 'memory-option-click-failed'}${visible}`);
      }
      const closed = await waitForPredicate(
        client.Runtime,
        `(() => {
          const button = Array.from(document.querySelectorAll('button'))
            .find((node) => String(node.getAttribute('aria-label') || '') === ${JSON.stringify(CHATGPT_PROJECT_SETTINGS_BUTTON_LABEL)});
          if (!button) return null;
          const expanded = String(button.getAttribute('aria-expanded') || '').toLowerCase();
          return expanded === '' || expanded === 'false' ? { ok: true } : null;
        })()`,
        {
          timeoutMs: 3000,
          description: `ChatGPT project settings menu closed after selecting ${targetLabel}`,
        },
      );
      if (!closed.ok) {
        throw new Error(`ChatGPT project settings menu did not close after selecting ${targetLabel}`);
      }
    },
    {
      label: 'chatgpt-set-create-project-memory-mode',
      candidateSelectors: ['button', '[role="menuitemradio"]', '[role="menu"]'],
      context: {
        triggerLabel: CHATGPT_PROJECT_SETTINGS_BUTTON_LABEL,
        triggerRoots: [...CHATGPT_PROJECT_DIALOG_ROOT_SELECTORS],
        interactionStrategies: [...interactionStrategies],
      },
    },
  );
}

async function clickCreateProjectConfirmWithClient(client: ChromeClient): Promise<void> {
  const ready = await waitForSelector(client.Runtime, CHATGPT_PROJECT_DIALOG_SELECTOR, 5000);
  if (!ready) {
    throw new Error('ChatGPT create-project dialog not found');
  }
  const { result } = await client.Runtime.evaluate({
    expression: `(() => {
      const dialog =
        document.querySelector(${JSON.stringify(CHATGPT_PROJECT_DIALOG_SELECTOR)}) ||
        document.querySelector('dialog[open]') ||
        document.querySelector('[role="dialog"]');
      if (!dialog) return { ok: false, reason: 'dialog-missing' };
      const button = Array.from(dialog.querySelectorAll('button'))
        .find((node) => String(node.textContent || '').replace(/\\s+/g, ' ').trim().toLowerCase() === 'create project');
      if (!button) return { ok: false, reason: 'button-missing' };
      if (button.disabled) return { ok: false, reason: 'button-disabled' };
      button.click();
      return { ok: true };
    })()`,
    returnByValue: true,
  });
  const info = result?.value as { ok?: boolean; reason?: string } | undefined;
  if (!info?.ok) {
    throw new Error(info?.reason || 'ChatGPT create project button not found');
  }
}

async function openProjectSettingsPanel(client: ChromeClient, projectId: string): Promise<void> {
  const projectUrl = `https://chatgpt.com/g/${projectId}/project`;
  let readySurface:
    | Awaited<ReturnType<typeof waitForPredicate>>
    | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await navigateToChatgptUrl(client, projectUrl, projectId);
    readySurface = await waitForPredicate(
      client.Runtime,
      buildProjectSurfaceReadyExpression(projectId),
      {
        timeoutMs: 15_000,
        description: `ChatGPT project surface ready for ${projectId}`,
      },
    );
    if (readySurface.ok) {
      break;
    }
    await client.Page.reload({ ignoreCache: false }).catch(() => undefined);
    await sleep(1_000);
  }
  if (!readySurface?.ok) {
    throw new Error(`ChatGPT project surface did not hydrate for ${projectId}`);
  }
  await withUiDiagnostics(
    client.Runtime,
    async () => {
      const opened = await openSurface(client.Runtime, {
        readyExpression: buildProjectSettingsReadyExpression(),
        readyDescription: 'ChatGPT project settings ready',
        alreadyOpenTimeoutMs: 800,
        readyTimeoutMs: 3_000,
        timeoutMs: 5_000,
        attempts: [
          {
            name: 'edit-title',
            trigger: {
              match: { startsWith: ['edit the title of'] },
              requireVisible: true,
              timeoutMs: 5_000,
            },
          },
          {
            name: 'show-project-details',
            trigger: {
              match: { exact: ['show project details'] },
              requireVisible: true,
              timeoutMs: 3_000,
            },
          },
          {
            name: 'edit-title-retry',
            trigger: {
              match: { startsWith: ['edit the title of'] },
              requireVisible: true,
              timeoutMs: 5_000,
            },
          },
        ],
      });
      if (!opened.ok) {
        throw new Error(
          `ChatGPT project settings did not open (${JSON.stringify({
            reason: opened.reason,
            attempts: opened.attempts,
          })})`,
        );
      }
    },
    {
      label: 'chatgpt-open-project-settings',
      candidateSelectors: ['button', '[role="button"]', 'input', 'textarea'],
      context: {
        surface: 'chatgpt-project-settings',
        fallbackTriggers: ['edit-title', 'show-project-details', 'edit-title-retry'],
      },
    },
  );
}

async function waitForProjectSettingsFields(
  client: ChromeClient,
  required: { name?: boolean; instructions?: boolean },
  timeoutMs: number,
): Promise<boolean> {
  const ready = await waitForPredicate(
    client.Runtime,
    `(() => {
      const requireName = ${JSON.stringify(Boolean(required.name))};
      const requireInstructions = ${JSON.stringify(Boolean(required.instructions))};
      const dialogs = Array.from(document.querySelectorAll('[role="dialog"], dialog[open]'));
      const isVisible = (el) => {
        if (!(el instanceof Element)) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      return dialogs.some((dialog) => {
        if (!isVisible(dialog)) return false;
        const nameInput = dialog.querySelector('input[aria-label="Project name"]');
        const instructions = dialog.querySelector(${JSON.stringify(CHATGPT_PROJECT_INSTRUCTIONS_SELECTOR)});
        if (requireName && !(nameInput && isVisible(nameInput))) {
          return false;
        }
        if (requireInstructions && !(instructions && isVisible(instructions))) {
          return false;
        }
        return true;
      }) ? { ok: true } : null;
    })()`,
    {
      timeoutMs,
      description: 'ChatGPT project settings fields ready',
    },
  );
  return ready.ok;
}

async function tagProjectSettingsDialog(
  client: ChromeClient,
  required: { name?: boolean; instructions?: boolean },
): Promise<string> {
  const { result } = await client.Runtime.evaluate({
    expression: `(() => {
      const attr = ${JSON.stringify(CHATGPT_PROJECT_SETTINGS_DIALOG_ATTR)};
      const requireName = ${JSON.stringify(Boolean(required.name))};
      const requireInstructions = ${JSON.stringify(Boolean(required.instructions))};
      const isVisible = (el) => {
        if (!(el instanceof Element)) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      for (const node of Array.from(document.querySelectorAll('[' + attr + ']'))) {
        node.removeAttribute(attr);
      }
      const dialogs = Array.from(document.querySelectorAll('[role="dialog"], dialog[open]'))
        .filter((dialog) => isVisible(dialog));
      for (const dialog of dialogs) {
        const nameInput = dialog.querySelector('input[aria-label="Project name"]');
        const instructions = dialog.querySelector(${JSON.stringify(CHATGPT_PROJECT_INSTRUCTIONS_SELECTOR)});
        if (requireName && !(nameInput && isVisible(nameInput))) {
          continue;
        }
        if (requireInstructions && !(instructions && isVisible(instructions))) {
          continue;
        }
        dialog.setAttribute(attr, 'true');
        return { ok: true, selector: '[' + attr + '="true"]' };
      }
      return { ok: false };
    })()`,
    returnByValue: true,
  });
  const info = result?.value as { ok?: boolean; selector?: string } | undefined;
  if (!info?.ok || !info.selector) {
    throw new Error('ChatGPT project settings dialog not found');
  }
  return info.selector;
}

async function applyProjectSettings(
  client: ChromeClient,
  projectId: string,
  fields: { name?: string; instructions?: string },
): Promise<void> {
  await openProjectSettingsPanel(client, projectId);
  const settingsReady = await waitForProjectSettingsFields(
    client,
    {
      name: Boolean(fields.name),
      instructions: fields.instructions !== undefined,
    },
    6_000,
  );
  if (!settingsReady) {
    throw new Error('ChatGPT project settings fields did not hydrate');
  }
  const settingsRootSelector = await tagProjectSettingsDialog(client, {
    name: Boolean(fields.name),
    instructions: fields.instructions !== undefined,
  });
  if (fields.name) {
    const renamed = await setInputValue(client.Runtime, {
      selector: 'input[aria-label="Project name"]',
      rootSelectors: [settingsRootSelector],
      value: fields.name,
      requireVisible: true,
      timeoutMs: 5000,
    });
    if (!renamed) {
      throw new Error('ChatGPT project settings name input not found');
    }
  }
  if (fields.instructions !== undefined) {
    const updated = await setInputValue(client.Runtime, {
      selector: CHATGPT_PROJECT_INSTRUCTIONS_SELECTOR,
      rootSelectors: [settingsRootSelector],
      value: fields.instructions,
      requireVisible: true,
      timeoutMs: 5000,
    });
    if (!updated) {
      throw new Error('ChatGPT project instructions textarea not found');
    }
    await waitForPredicate(
      client.Runtime,
      `(() => {
        const root = document.querySelector(${JSON.stringify(settingsRootSelector)});
        if (!(root instanceof Element)) return null;
        const textarea = root.querySelector(${JSON.stringify(CHATGPT_PROJECT_INSTRUCTIONS_SELECTOR)});
        if (!(textarea instanceof HTMLTextAreaElement)) return null;
        return textarea.value === ${JSON.stringify(fields.instructions)} ? { ok: true } : null;
      })()`,
      {
        timeoutMs: 3_000,
        description: 'ChatGPT project instructions textarea updated',
      },
    ).catch(() => undefined);
    await sleep(600);
  }
  await commitProjectSettingsDialog(client, settingsRootSelector);
}

async function commitProjectSettingsDialog(client: ChromeClient, settingsRootSelector: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  let info:
    | {
        committed?: boolean;
        hasCommitButton?: boolean;
        commitDisabled?: boolean;
        reason?: string;
      }
    | undefined;
  do {
    const { result } = await client.Runtime.evaluate({
      expression: `(() => {
        const root = document.querySelector(${JSON.stringify(settingsRootSelector)});
        const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
        if (!root) {
          return { committed: false, reason: 'dialog-missing' };
        }
        const commitButton = Array.from(root.querySelectorAll('button,[role="button"]')).find((node) => {
          const label = normalize(node.textContent || node.getAttribute('aria-label') || node.getAttribute('title') || '');
          return label === 'save' || label === 'save changes' || label === 'done' || label === 'apply' || label.startsWith('save ');
        });
        if (commitButton instanceof HTMLElement) {
          if (!commitButton.hasAttribute('disabled') && commitButton.getAttribute('aria-disabled') !== 'true') {
            commitButton.click();
            return {
              committed: true,
              label: normalize(commitButton.textContent || commitButton.getAttribute('aria-label') || commitButton.getAttribute('title') || ''),
            };
          }
          if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
          }
          return {
            committed: false,
            hasCommitButton: true,
            commitDisabled: true,
          };
        }
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        return { committed: false, hasCommitButton: false, commitDisabled: false };
      })()`,
      returnByValue: true,
    });
    info = result?.value as
      | {
          committed?: boolean;
          hasCommitButton?: boolean;
          commitDisabled?: boolean;
          reason?: string;
        }
      | undefined;
    if (info?.committed) {
      break;
    }
    await sleep(250);
  } while (Date.now() < deadline);
  if (info?.committed) {
    await waitForPredicate(
      client.Runtime,
      `(() => document.querySelector(${JSON.stringify(settingsRootSelector)}) ? null : { ok: true })()`,
      {
        timeoutMs: 5_000,
        description: 'ChatGPT project settings dialog closed after commit',
      },
    ).catch(() => undefined);
  }
  await closeDialog(client.Runtime, DEFAULT_DIALOG_SELECTORS);
}

async function readProjectSettingsSnapshot(
  client: ChromeClient,
): Promise<{ name: string; text: string; memoryModeLabel?: string | null }> {
  const { result } = await client.Runtime.evaluate({
    expression: `(() => {
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
      const dialog = Array.from(document.querySelectorAll('[role="dialog"], dialog[open]'))
        .find((node) => node.querySelector('input[aria-label="Project name"]') || node.querySelector(${JSON.stringify(CHATGPT_PROJECT_INSTRUCTIONS_SELECTOR)}));
      if (!dialog) return null;
      const nameInput = dialog.querySelector('input[aria-label="Project name"]');
      const textarea = dialog.querySelector(${JSON.stringify(CHATGPT_PROJECT_INSTRUCTIONS_SELECTOR)});
      const selectedMemory = Array.from(dialog.querySelectorAll('button,[role="button"]'))
        .find((node) => {
          const label = normalize(node.textContent || node.getAttribute('aria-label') || '');
          return (label === 'Default' || label === 'Project-only') && node.hasAttribute('disabled');
        });
      return {
        name: nameInput instanceof HTMLInputElement ? nameInput.value || '' : '',
        text: textarea instanceof HTMLTextAreaElement ? textarea.value || '' : '',
        memoryModeLabel: selectedMemory ? normalize(selectedMemory.textContent || selectedMemory.getAttribute('aria-label') || '') : null,
      };
    })()`,
    returnByValue: true,
  });
  const value = result?.value as { name?: string; text?: string; memoryModeLabel?: string | null } | null | undefined;
  if (!value) {
    throw new Error('ChatGPT project settings dialog is not open');
  }
  return {
    name: value.name ?? '',
    text: value.text ?? '',
    memoryModeLabel: value.memoryModeLabel ?? null,
  };
}

async function waitForProjectInstructionsApplied(
  client: ChromeClient,
  projectId: string,
  expectedText: string,
): Promise<void> {
  const expected = normalizeInstructionComparisonText(expectedText);
  const deadline = Date.now() + 15_000;
  let lastText = '';
  while (Date.now() < deadline) {
    await openProjectSettingsPanel(client, projectId);
    const snapshot = await readProjectSettingsSnapshot(client);
    lastText = snapshot.text;
    await closeDialog(client.Runtime, DEFAULT_DIALOG_SELECTORS);
    if (normalizeInstructionComparisonText(snapshot.text) === expected) {
      return;
    }
    await sleep(1_000);
  }
  throw new Error(
    `ChatGPT project instructions did not persist (${JSON.stringify({
      expected,
      actual: normalizeInstructionComparisonText(lastText),
    })})`,
  );
}

async function waitForProjectNameApplied(
  client: ChromeClient,
  projectId: string,
  expectedName: string,
): Promise<void> {
  const result = await waitForPredicate(
    client.Runtime,
    buildProjectNameAppliedExpression(projectId, expectedName),
    {
      timeoutMs: 8000,
      description: `ChatGPT project name ${expectedName} applied`,
    },
  );
  if (!result.ok) {
    throw new Error('ChatGPT project rename did not apply');
  }
}

async function readCurrentProject(client: ChromeClient): Promise<Project | null> {
  const { result } = await client.Runtime.evaluate({
    expression: `(() => {
      const match = location.pathname.match(/^\\/g\\/([^/]+)\\/project\\/?$/);
      if (!match) return null;
      const projectId = match[1];
      const titleButton = Array.from(document.querySelectorAll('button,[role="button"]'))
        .find((node) => String(node.getAttribute('aria-label') || '').toLowerCase().startsWith('edit the title of '));
      const title = (titleButton?.textContent || document.title.replace(/^ChatGPT\\s*-\\s*/i, '') || projectId)
        .replace(/\\s+/g, ' ')
        .trim();
      return {
        id: projectId,
        name: title || projectId,
        url: location.href,
      };
    })()`,
    returnByValue: true,
  });
  const value = result?.value as { id?: string; name?: string; url?: string } | null;
  const normalizedId = normalizeChatgptProjectId(value?.id);
  if (!normalizedId) return null;
  return {
    id: normalizedId,
    name: value?.name || normalizedId,
    provider: 'chatgpt',
    url: value?.url || `https://chatgpt.com/g/${normalizedId}/project`,
  };
}

async function scrapeChatgptProjects(client: ChromeClient): Promise<Project[]> {
  const { result } = await client.Runtime.evaluate({
    expression: `(() => {
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
      const parseProjectId = (href) => {
        try {
          const url = new URL(href, location.origin);
          const match = url.pathname.match(/^\\/g\\/([^/]+)\\/project\\/?$/) || url.pathname.match(/^\\/g\\/([^/]+)\\/c\\/[^/]+\\/?$/);
          if (!match) return null;
          const raw = String(match[1] || '').trim();
          const normalized = raw.match(/^(g-p-[a-z0-9]+)/i);
          return normalized ? normalized[1] : null;
        } catch {
          return null;
        }
      };
      const projects = new Map();
      const currentId = parseProjectId(location.href);
      if (currentId) {
        const titleButton = Array.from(document.querySelectorAll('button,[role="button"]'))
          .find((node) => String(node.getAttribute('aria-label') || '').toLowerCase().startsWith('edit the title of '));
        const currentName = normalize(titleButton?.textContent || document.title.replace(/^ChatGPT\\s*-\\s*/i, '') || currentId);
        projects.set(currentId, {
          id: currentId,
          name: currentName || currentId,
          url: location.href,
        });
      }
      for (const link of Array.from(document.querySelectorAll('a[href*="/project"]'))) {
        const href = link.getAttribute('href') || '';
        const projectId = parseProjectId(href);
        if (!projectId) continue;
        const url = href.startsWith('http') ? href : new URL(href, location.origin).toString();
        const name = normalize(link.textContent || projectId) || projectId;
        if (!projects.has(projectId)) {
          projects.set(projectId, { id: projectId, name, url });
        }
      }
      return Array.from(projects.values());
    })()`,
    returnByValue: true,
  });
  const probes = (result?.value ?? []) as ChatgptProjectLinkProbe[];
  return probes.map((project) => ({
    id: project.id,
    name: project.name,
    provider: 'chatgpt',
    url: project.url ?? `https://chatgpt.com/g/${project.id}/project`,
  }));
}

export function resolveChatgptConversationUrl(conversationId: string, projectId?: string | null): string {
  const normalizedProjectId = normalizeChatgptProjectId(projectId);
  return normalizedProjectId
    ? `https://chatgpt.com/g/${normalizedProjectId}/c/${conversationId}`
    : `https://chatgpt.com/c/${conversationId}`;
}

function resolveChatgptConversationListUrl(projectId?: string | null): string {
  const normalizedProjectId = normalizeChatgptProjectId(projectId);
  return normalizedProjectId
    ? `https://chatgpt.com/g/${normalizedProjectId}/project`
    : CHATGPT_HOME_URL;
}

async function navigateToChatgptConversation(
  client: ChromeClient,
  conversationId: string,
  projectId?: string | null,
): Promise<void> {
  const url = resolveChatgptConversationUrl(conversationId, projectId);
  const settled = await navigateAndSettle(client, {
    url,
    routeExpression: buildConversationRouteExpression(conversationId, projectId),
    routeDescription: projectId
      ? `chatgpt project conversation ${conversationId} in ${projectId}`
      : `chatgpt conversation ${conversationId}`,
    readyExpression: buildConversationSurfaceReadyExpression(conversationId, projectId),
    readyDescription: projectId
      ? `ChatGPT project conversation ${conversationId} ready`
      : `ChatGPT conversation ${conversationId} ready`,
    waitForDocumentReady: true,
    fallbackToLocationAssign: true,
    timeoutMs: 15_000,
    fallbackTimeoutMs: 10_000,
  });
  if (!settled.ok) {
    throw new Error(settled.reason || `ChatGPT conversation ${conversationId} did not settle`);
  }
}

async function scrapeChatgptConversations(
  client: ChromeClient,
  projectId?: string | null,
): Promise<Conversation[]> {
  const normalizedProjectId = normalizeChatgptProjectId(projectId);
  if (normalizedProjectId) {
    await navigateToChatgptUrl(client, `https://chatgpt.com/g/${normalizedProjectId}/project`, normalizedProjectId);
  }
  await ensureChatgptSidebarOpen(client);
  const readConversations = async (): Promise<Conversation[]> => {
    const { result } = await client.Runtime.evaluate({
      expression: `(() => {
      const expectedProjectId = ${JSON.stringify(normalizedProjectId ?? null)};
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
      const normalizeProjectId = (value) => {
        const trimmed = String(value || '').trim();
        const match = trimmed.match(/^(g-p-[a-z0-9]+)/i);
        return match ? match[1] : null;
      };
      const parse = (href) => {
        try {
          const parsed = new URL(href, location.origin);
          const match = parsed.pathname.match(/^\\/(?:g\\/([^/]+)\\/)?c\\/([a-zA-Z0-9-]+)\\/?$/);
          if (!match) return null;
          return {
            id: String(match[2] || '').trim(),
            projectId: normalizeProjectId(match[1]),
            url: parsed.toString(),
          };
        } catch {
          return null;
        }
      };
      const probes = new Map();
      const pushProbe = (probe) => {
        if (!probe || !probe.id) return;
        if (expectedProjectId && probe.projectId !== expectedProjectId) return;
        const previous = probes.get(probe.id);
        if (!previous) {
          probes.set(probe.id, probe);
          return;
        }
        const previousTitle = normalize(previous.title);
        const nextTitle = normalize(probe.title);
        const useNext =
          (!previousTitle || previousTitle === previous.id) && nextTitle.length > 0
            ? true
            : Boolean(!previous.url && probe.url) || Boolean(!previous.projectId && probe.projectId);
        if (useNext) {
          probes.set(probe.id, { ...previous, ...probe });
        }
      };
      const isVisible = (node) => {
        if (!(node instanceof Element)) return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const findRowButtonLabel = (anchor) => {
        let current = anchor instanceof Element ? anchor : null;
        while (current && current !== document.body) {
          const button = Array.from(current.querySelectorAll('button[aria-label]'))
            .find((node) => {
              if (!(node instanceof HTMLButtonElement)) return false;
              if (!isVisible(node)) return false;
              const label = normalize(node.getAttribute('aria-label') || '').toLowerCase();
              return label.startsWith('open conversation options for ');
            });
          if (button instanceof HTMLButtonElement) {
            return normalize(button.getAttribute('aria-label') || '').replace(/^open conversation options for\\s+/i, '');
          }
          current = current.parentElement;
        }
        return '';
      };
      const readAnchorProbe = (anchor) => {
        const info = parse(anchor.getAttribute('href') || '');
        if (!info) return null;
        const rowLabel = findRowButtonLabel(anchor);
        const title =
          rowLabel ||
          normalize(anchor.getAttribute('aria-label') || '') ||
          normalize(anchor.textContent || '') ||
          normalize(anchor.getAttribute('title') || '') ||
          info.id;
        return {
          ...info,
          title,
        };
      };

      const current = parse(location.href);
      if (current) {
        pushProbe({
          ...current,
          title: normalize(document.title.replace(/^ChatGPT\\s*-\\s*/i, '')) || current.id,
        });
      }

      const projectPanelAnchors = expectedProjectId
        ? Array.from(document.querySelectorAll('[role="tabpanel"]'))
            .filter((panel) => isVisible(panel))
            .flatMap((panel) => Array.from(panel.querySelectorAll('a[href*="/c/"]')))
        : [];
      const anchors = projectPanelAnchors.length > 0
        ? projectPanelAnchors
        : Array.from(document.querySelectorAll('a[href*="/c/"]'));
      for (const anchor of anchors) {
        const probe = readAnchorProbe(anchor);
        if (!probe) continue;
        pushProbe(probe);
      }

        return Array.from(probes.values());
      })()` ,
      returnByValue: true,
    });
    const probes = Array.isArray(result?.value) ? (result.value as ChatgptConversationLinkProbe[]) : [];
    return normalizeChatgptConversationLinkProbes(probes);
  };

  const deadline = Date.now() + 6_000;
  let last: Conversation[] = [];
  while (Date.now() < deadline) {
    const conversations = await readConversations();
    if (conversations.length > 0) {
      return conversations;
    }
    last = conversations;
    await sleep(600);
  }
  return last;
}

async function tagChatgptConversationRow(
  client: ChromeClient,
  conversationId: string,
  projectId?: string | null,
): Promise<{ rowSelector: string; actionSelector: string }> {
  await ensureChatgptSidebarOpen(client);
  const normalizedProjectId = normalizeChatgptProjectId(projectId);
  const deadline = Date.now() + 6_000;
  let lastInfo: { ok?: boolean; rowSelector?: string; actionSelector?: string } | undefined;
  while (Date.now() < deadline) {
    const { result } = await client.Runtime.evaluate({
      expression: `(() => {
        const conversationId = ${JSON.stringify(conversationId)};
        const expectedProjectId = ${JSON.stringify(normalizedProjectId ?? null)};
        const rowAttr = ${JSON.stringify(CHATGPT_CONVERSATION_ROW_ATTR)};
        const actionAttr = ${JSON.stringify(CHATGPT_CONVERSATION_ACTION_ATTR)};
        const normalizeProjectId = (value) => {
          const trimmed = String(value || '').trim();
          const match = trimmed.match(/^(g-p-[a-z0-9]+)/i);
          return match ? match[1] : null;
        };
        const parse = (href) => {
          try {
            const parsed = new URL(href, location.origin);
            const match = parsed.pathname.match(/^\\/(?:g\\/([^/]+)\\/)?c\\/([a-zA-Z0-9-]+)\\/?$/);
            if (!match) return null;
            return {
              conversationId: String(match[2] || '').trim(),
              projectId: normalizeProjectId(match[1]),
            };
          } catch {
            return null;
          }
        };
        const isVisible = (node) => {
          if (!(node instanceof Element)) return false;
          const rect = node.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        };
        for (const node of Array.from(document.querySelectorAll('[' + rowAttr + '], [' + actionAttr + ']'))) {
          node.removeAttribute(rowAttr);
          node.removeAttribute(actionAttr);
        }

        const findRowButton = (anchor) => {
          let current = anchor instanceof Element ? anchor : null;
          while (current && current !== document.body) {
            const button = Array.from(current.querySelectorAll('button[aria-label], button'))
              .find((node) => {
                if (!(node instanceof HTMLButtonElement)) return false;
                if (!isVisible(node)) return false;
                const label = String(node.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim().toLowerCase();
                return label.startsWith('open conversation options for ');
              });
            if (button instanceof HTMLButtonElement) {
              return { row: current, button };
            }
            current = current.parentElement;
          }
          return null;
        };
        const isInsideVisibleProjectPanel = (anchor) => {
          let current = anchor instanceof Element ? anchor : null;
          while (current && current !== document.body) {
            if (
              current.getAttribute('role') === 'tabpanel' &&
              isVisible(current)
            ) {
              return true;
            }
            current = current.parentElement;
          }
          return false;
        };

        const candidates = Array.from(document.querySelectorAll('a[href*="/c/"]'))
          .map((anchor) => {
            const info = parse(anchor.getAttribute('href') || '');
            if (!info || info.conversationId !== conversationId) return null;
            if (expectedProjectId && info.projectId !== expectedProjectId) return null;
            const rowButton = findRowButton(anchor);
            if (!rowButton) return null;
            const rowRect = rowButton.row.getBoundingClientRect();
            const inProjectPanel = isInsideVisibleProjectPanel(anchor);
            return {
              row: rowButton.row,
              button: rowButton.button,
              inProjectPanel,
              score:
                (inProjectPanel ? 10_000 : 0) +
                (info.projectId === expectedProjectId ? 1000 : 0) +
                (anchor.getAttribute('aria-current') === 'page' ? 100 : 0) +
                (isVisible(anchor) ? 10 : 0) -
                Math.round(rowRect.top),
            };
          })
          .filter(Boolean);
        const scopedCandidates =
          expectedProjectId && candidates.some((candidate) => candidate.inProjectPanel)
            ? candidates.filter((candidate) => candidate.inProjectPanel)
            : candidates;
        const rankedCandidates = scopedCandidates
          .sort((left, right) => right.score - left.score);
        let best = rankedCandidates[0] || null;
        if (!best) {
          const currentAnchor = Array.from(document.querySelectorAll('a[aria-current="page"], a[aria-current="true"]'))
            .find((anchor) => {
              const info = parse(anchor.getAttribute('href') || '');
              if (!info) return false;
              if (expectedProjectId && info.projectId !== expectedProjectId) return false;
              return Boolean(findRowButton(anchor));
            });
          if (currentAnchor) {
            const rowButton = findRowButton(currentAnchor);
            if (rowButton) {
              best = {
                row: rowButton.row,
                button: rowButton.button,
                score: 1,
              };
            }
          }
        }
        if (!best) {
          return { ok: false };
        }
        best.row.setAttribute(rowAttr, 'true');
        best.button.setAttribute(actionAttr, 'true');
        return {
          ok: true,
          rowSelector: '[' + rowAttr + '="true"]',
          actionSelector: '[' + actionAttr + '="true"]',
        };
      })()` ,
      returnByValue: true,
    });
    lastInfo = result?.value as { ok?: boolean; rowSelector?: string; actionSelector?: string } | undefined;
    if (lastInfo?.ok && lastInfo.rowSelector && lastInfo.actionSelector) {
      return {
        rowSelector: lastInfo.rowSelector,
        actionSelector: lastInfo.actionSelector,
      };
    }
    await sleep(400);
  }
  throw new Error(`ChatGPT conversation row not found for ${conversationId}`);
}

async function waitForChatgptConversationTitleApplied(
  client: ChromeClient,
  conversationId: string,
  expectedTitle: string,
  projectId?: string | null,
): Promise<void> {
  let renamed = await waitForPredicate(
    client.Runtime,
    buildConversationTitleAppliedExpression(conversationId, expectedTitle, projectId),
    {
      timeoutMs: 10_000,
      description: `ChatGPT conversation ${conversationId} renamed to ${expectedTitle}`,
    },
  );
  if (!renamed.ok) {
    await navigateToChatgptUrl(client, resolveChatgptConversationListUrl(projectId));
    renamed = await waitForPredicate(
      client.Runtime,
      buildConversationTitleAppliedExpression(conversationId, expectedTitle, projectId),
      {
        timeoutMs: 10_000,
        description: `ChatGPT conversation ${conversationId} renamed to ${expectedTitle} after list refresh`,
      },
    );
  }
  if (!renamed.ok) {
    throw new Error(`ChatGPT conversation rename did not persist for ${conversationId}`);
  }
}

async function waitForChatgptConversationDeleted(
  client: ChromeClient,
  conversationId: string,
  projectId?: string | null,
): Promise<void> {
  let deleted = await waitForPredicate(
    client.Runtime,
    buildConversationDeletedExpression(conversationId, projectId),
    {
      timeoutMs: 10_000,
      description: `ChatGPT conversation ${conversationId} deleted`,
    },
  );
  if (!deleted.ok) {
    await navigateToChatgptUrl(client, resolveChatgptConversationListUrl(projectId));
    deleted = await waitForPredicate(
      client.Runtime,
      buildConversationDeletedExpression(conversationId, projectId),
      {
        timeoutMs: 10_000,
        description: `ChatGPT conversation ${conversationId} deleted after list refresh`,
      },
    );
  }
  if (!deleted.ok) {
    throw new Error(`ChatGPT conversation ${conversationId} still appeared after delete`);
  }
}

async function readChatgptConversationContextWithClient(
  client: ChromeClient,
  conversationId: string,
  projectId?: string | null,
): Promise<ConversationContext> {
  return withChatgptRateLimitDialogRecovery(client, `readChatgptConversationContext:${conversationId}`, async () => {
    await navigateToChatgptConversation(client, conversationId, projectId);
    const ready = await waitForPredicate(
      client.Runtime,
      buildConversationSurfaceReadyExpression(conversationId, projectId),
      {
        timeoutMs: 10_000,
        description: `ChatGPT conversation ${conversationId} surface ready`,
      },
    );
    if (!ready.ok) {
      throw new Error(`ChatGPT conversation ${conversationId} content not found`);
    }
    let payload = await readChatgptConversationPayloadWithClient(client, conversationId, projectId).catch(() => null);
    await waitForPredicate(
      client.Runtime,
      buildConversationSurfaceReadyExpression(conversationId, projectId),
      {
        timeoutMs: 10_000,
        description: `ChatGPT conversation ${conversationId} surface ready after payload sync`,
      },
    );
    const readMessages = async (): Promise<ChatgptConversationMessageProbe[]> => {
      const { result } = await client.Runtime.evaluate({
        expression: `(() => {
          const normalize = (value) => String(value || '')
            .replace(/\\r\\n/g, '\\n')
            .replace(/\\r/g, '\\n')
            .replace(/\\n{3,}/g, '\\n\\n')
            .trim();
          const roleNodes = Array.from(document.querySelectorAll('section[data-testid^="conversation-turn-"] [data-message-author-role]'))
            .filter((node) => !node.parentElement?.closest('[data-message-author-role]'));
          const fallbackNodes = roleNodes.length > 0
            ? roleNodes
            : Array.from(document.querySelectorAll('[data-message-author-role]'))
                .filter((node) => !node.parentElement?.closest('[data-message-author-role]'));
          const messages = fallbackNodes
            .map((node) => {
              const role = String(node.getAttribute('data-message-author-role') || '').trim();
              if (role !== 'user' && role !== 'assistant' && role !== 'system') return null;
              const text = normalize(node.innerText || node.textContent || '');
              if (!text) return null;
              const messageId = normalize(
                node.getAttribute('data-message-id') ||
                node.closest('section[data-testid^="conversation-turn-"]')?.getAttribute('data-turn-id') ||
                '',
              );
              return { role, text, messageId: messageId || null };
            })
            .filter(Boolean);
          return { messages };
        })()` ,
        returnByValue: true,
      });
      const value = result?.value as {
        messages?: Array<{ role?: string; text?: string; messageId?: string | null }>;
      } | undefined;
      return Array.isArray(value?.messages)
        ? value.messages
            .filter((message): message is ChatgptConversationMessageProbe => {
              return (
                typeof message?.text === 'string' &&
                message.text.trim().length > 0 &&
                (message.role === 'user' || message.role === 'assistant' || message.role === 'system')
              );
            })
            .map((message) => ({
              role: message.role,
              text: message.text,
              messageId: typeof message.messageId === 'string' && message.messageId.trim() ? message.messageId.trim() : undefined,
            }))
        : [];
    };

    let messages = await readMessages();
    if (messages.length === 0) {
      const deadline = Date.now() + 5_000;
      while (Date.now() < deadline && messages.length === 0) {
        await sleep(500);
        messages = await readMessages();
      }
    }
    if (messages.length === 0) {
      await client.Page.reload({ ignoreCache: true });
      await waitForPredicate(
        client.Runtime,
        buildConversationSurfaceReadyExpression(conversationId, projectId),
        {
          timeoutMs: 10_000,
          description: `ChatGPT conversation ${conversationId} surface ready after reload`,
        },
      );
      messages = await readMessages();
    }
    if (messages.length === 0) {
      throw new Error(`ChatGPT conversation ${conversationId} messages not found`);
    }
    if (!payload) {
      payload = await readChatgptConversationPayloadWithClient(client, conversationId, projectId).catch(() => null);
    }
    const normalizedMessages = messages.map(({ role, text }) => ({ role, text }));
    const messageIndexById = new Map<string, number>();
    messages.forEach((message, index) => {
      const id = normalizeUiText(message.messageId);
      if (id) {
        messageIndexById.set(id, index);
      }
    });
    const files = await readVisibleChatgptConversationFilesWithClient(client, conversationId);
    const sources = extractChatgptConversationSourcesFromPayload(payload, messageIndexById);
    const payloadArtifacts = extractChatgptConversationArtifactsFromPayload(payload, messageIndexById);
    const domDownloadArtifacts = normalizeChatgptConversationDownloadArtifactProbes(
      await readVisibleChatgptDownloadArtifactProbesWithClient(client),
    );
    const canvasProbes = await readVisibleChatgptCanvasProbesWithClient(client);
    const artifacts = mergeChatgptCanvasArtifactContent(
      mergeChatgptConversationArtifacts(payloadArtifacts, domDownloadArtifacts),
      canvasProbes,
    );
    return {
      provider: 'chatgpt',
      conversationId,
      messages: normalizedMessages,
      files,
      sources,
      artifacts,
    };
  });
}

async function readVisibleChatgptDownloadArtifactProbesWithClient(
  client: ChromeClient,
): Promise<ChatgptConversationDownloadButtonProbe[]> {
  const { result } = await client.Runtime.evaluate({
    expression: `(async () => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
      const isVisible = (node) => {
        if (!(node instanceof Element)) return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const collect = () => {
        const roots = Array.from(document.querySelectorAll('section[data-testid^="conversation-turn-"]'))
          .map((section, messageIndex) => {
            const roleNode = section.querySelector('[data-message-author-role]');
            return {
              section,
              messageIndex,
              role: normalize(roleNode?.getAttribute('data-message-author-role') || ''),
              turnId: normalize(section.getAttribute('data-turn-id') || ''),
              messageId: normalize(roleNode?.getAttribute('data-message-id') || ''),
            };
          });
        return roots.flatMap((entry) => {
          const role = entry.role;
          if (role !== 'assistant') return [];
          const buttons = Array.from(entry.section.querySelectorAll('button.behavior-btn'))
            .filter((button) => isVisible(button) && !button.closest('div[id^="textdoc-message-"]'))
            .map((button, buttonIndex) => ({
              turnId: entry.turnId || null,
              messageId: entry.messageId || null,
              messageIndex: entry.messageIndex,
              buttonIndex,
              title: normalize(button.textContent || button.getAttribute('aria-label') || '') || null,
            }))
            .filter((button) => {
              const title = normalize(button.title || '');
              if (!title) return false;
              if (/^(copy|edit|download)$/i.test(title)) return false;
              return true;
            });
          return buttons;
        });
      };
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const probes = collect();
        if (probes.length > 0) return probes;
        await sleep(200);
      }
      return collect();
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  const value = result?.value;
  return Array.isArray(value)
    ? value.filter(isRecord).map((item) => ({
        turnId: readStringField(item, 'turnId'),
        messageId: readStringField(item, 'messageId'),
        messageIndex: readFiniteNumberField(item, 'messageIndex'),
        buttonIndex: readFiniteNumberField(item, 'buttonIndex'),
        title: readStringField(item, 'title'),
      }))
    : [];
}

async function readVisibleChatgptCanvasProbesWithClient(
  client: ChromeClient,
): Promise<ChatgptConversationCanvasProbe[]> {
  const { result } = await client.Runtime.evaluate({
    expression: `(() => {
      const normalize = (value) => String(value || '').replace(/\\r\\n/g, '\\n').replace(/\\r/g, '\\n');
      const trimLine = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
      const toolbarPattern = /^(copy|edit|download|expand|collapse)(\\s+(copy|edit|download|expand|collapse))*$/i;
      return Array.from(document.querySelectorAll('div[id^="textdoc-message-"]'))
        .map((node) => {
          const textdocId = trimLine((node.getAttribute('id') || '').replace(/^textdoc-message-/, ''));
          const title = trimLine(node.querySelector('span.font-semibold, [class*="font-semibold"]')?.textContent || '');
          const lines = normalize(node.innerText || node.textContent || '')
            .split(/\\n+/)
            .map((line) => trimLine(line))
            .filter(Boolean);
          while (lines.length > 0 && title && lines[0] === title) {
            lines.shift();
          }
          while (lines.length > 0 && toolbarPattern.test(lines[0] || '')) {
            lines.shift();
          }
          return {
            textdocId: textdocId || null,
            title: title || null,
            contentText: lines.join('\\n').trim() || null,
          };
        })
        .filter((item) => item.title || item.textdocId || item.contentText);
    })()`,
    returnByValue: true,
  });
  const value = result?.value;
  return Array.isArray(value)
    ? value.filter(isRecord).map((item) => ({
        textdocId: readStringField(item, 'textdocId'),
        title: readStringField(item, 'title'),
        contentText: readStringField(item, 'contentText'),
      }))
    : [];
}

async function readVisibleChatgptConversationFilesWithClient(
  client: ChromeClient,
  conversationId: string,
): Promise<FileRef[]> {
  const { result } = await client.Runtime.evaluate({
    expression: `(async () => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
      const extractLabel = (tile, name) => {
        const values = Array.from(tile.querySelectorAll('div, span, p'))
          .map((node) => normalize(node.textContent || ''))
          .filter(Boolean);
        const unique = Array.from(new Set(values));
        return unique.find((value) => value && value !== name && !value.includes(name)) || '';
      };
      const collect = () => {
        const items = [];
        const nodes = Array.from(document.querySelectorAll('section[data-testid^="conversation-turn-"] [data-message-author-role="user"]'))
          .filter((node) => !node.parentElement?.closest('[data-message-author-role]'));
        nodes.forEach((node) => {
          const section = node.closest('section[data-testid^="conversation-turn-"]');
          const turnId = normalize(section?.getAttribute('data-turn-id') || '');
          const messageId = normalize(node.getAttribute('data-message-id') || '');
          const tiles = Array.from(node.querySelectorAll('[role="group"][aria-label]'))
            .filter((tile) => tile.querySelector('button[aria-label], a[aria-label], button, a'));
          tiles.forEach((tile, tileIndex) => {
            const name = normalize(
              tile.getAttribute('aria-label') ||
              tile.querySelector('button[aria-label], a[aria-label]')?.getAttribute('aria-label') ||
              '',
            );
            if (!name) return;
            items.push({
              turnId: turnId || null,
              messageId: messageId || null,
              tileIndex,
              name,
              label: extractLabel(tile, name) || null,
            });
          });
        });
        return items;
      };
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const items = collect();
        if (items.length > 0) {
          return items;
        }
        await sleep(200);
      }
      return collect();
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  const rawItems = Array.isArray(result?.value)
    ? (result.value as ChatgptConversationFileProbe[])
    : [];
  return normalizeChatgptConversationFileProbes(conversationId, rawItems);
}

async function renameChatgptConversationWithClient(
  client: ChromeClient,
  conversationId: string,
  newTitle: string,
  projectId?: string | null,
): Promise<void> {
  await navigateToChatgptUrl(client, resolveChatgptConversationListUrl(projectId));
  await ensureChatgptSidebarOpen(client);
  let tagged: { rowSelector: string; actionSelector: string } | null = null;
  try {
    tagged = await tagChatgptConversationRow(client, conversationId, projectId);
  } catch {
    await navigateToChatgptConversation(client, conversationId, projectId);
    await ensureChatgptSidebarOpen(client);
    try {
      tagged = await tagChatgptConversationRow(client, conversationId, projectId);
    } catch {
      await navigateToChatgptUrl(client, resolveChatgptConversationListUrl(projectId));
      await ensureChatgptSidebarOpen(client);
    }
  }
  await withUiDiagnostics(
    client.Runtime,
    async () => {
      if (!tagged) {
        throw new Error(`ChatGPT conversation row not found for ${conversationId}`);
      }
      const renamed = await openAndSelectMenuItem(client.Runtime, {
        trigger: {
          selector: tagged.actionSelector,
          rootSelectors: [tagged.rowSelector],
          interactionStrategies: ['pointer', 'keyboard-space', 'keyboard-arrowdown'],
          requireVisible: true,
          timeoutMs: 3_000,
        },
        menuSelector: '[role="menu"]',
        itemMatch: { exact: ['rename'] },
        timeoutMs: 4_000,
        closeMenuAfter: true,
      });
      if (!renamed) {
        throw new Error(`ChatGPT conversation rename menu did not open for ${conversationId}`);
      }
      const submitted = await submitInlineRename(
        client.Runtime,
        {
          value: newTitle,
          inputSelector: `${tagged.rowSelector} input[type="text"], ${tagged.rowSelector} textarea`,
          rootSelectors: [tagged.rowSelector],
          closeSelector: `${tagged.rowSelector} input[type="text"], ${tagged.rowSelector} textarea`,
          timeoutMs: 4_000,
        },
        { Input: client.Input },
      );
      if (submitted.ok) {
        return;
      }
      const submittedFromVisibleRenameInput = await submitInlineRename(
        client.Runtime,
        {
          value: newTitle,
          inputSelector: 'input[type="text"]',
          closeSelector: 'input[type="text"]',
          timeoutMs: 5_000,
          submitStrategy: 'native-then-synthetic',
        },
        { Input: client.Input },
      );
      if (submittedFromVisibleRenameInput.ok) {
        return;
      }
      if (!submitted.ok) {
        throw new Error(
          submittedFromVisibleRenameInput.reason ||
            submitted.reason ||
            `ChatGPT inline rename failed for ${conversationId}`,
        );
      }
    },
    {
      label: 'chatgpt-rename-conversation',
      candidateSelectors: ['[role="menu"]', '[role="menuitem"]', 'button[aria-label]', 'input[type="text"]'],
      context: {
        conversationId,
        projectId: projectId ?? null,
      },
    },
  );
  await waitForChatgptConversationTitleApplied(client, conversationId, newTitle, projectId);
}

async function deleteChatgptConversationWithClient(
  client: ChromeClient,
  conversationId: string,
  projectId?: string | null,
): Promise<void> {
  await navigateToChatgptConversation(client, conversationId, projectId);
  const { result } = await client.Runtime.evaluate({
    expression: `(() => document.title.replace(/^ChatGPT\\s*-\\s*/i, '').replace(/\\s+/g, ' ').trim())()`,
    returnByValue: true,
  });
  const expectedTitle = normalizeUiText(typeof result?.value === 'string' ? result.value : '') || undefined;
  await navigateToChatgptUrl(client, resolveChatgptConversationListUrl(projectId));
  await ensureChatgptSidebarOpen(client);
  let tagged: { rowSelector: string; actionSelector: string } | null = null;
  try {
    tagged = await tagChatgptConversationRow(client, conversationId, projectId);
  } catch {
    await navigateToChatgptConversation(client, conversationId, projectId);
    await ensureChatgptSidebarOpen(client);
    try {
      tagged = await tagChatgptConversationRow(client, conversationId, projectId);
    } catch {
      await navigateToChatgptConversation(client, conversationId, projectId);
    }
  }
  await withUiDiagnostics(
    client.Runtime,
    async () => {
      let deletedFromSidebar = false;
      if (tagged) {
        deletedFromSidebar = await openAndSelectMenuItem(client.Runtime, {
          trigger: {
            selector: tagged.actionSelector,
            rootSelectors: [tagged.rowSelector],
            interactionStrategies: ['pointer', 'keyboard-space', 'keyboard-arrowdown'],
            requireVisible: true,
            timeoutMs: 3_000,
          },
          menuSelector: '[role="menu"]',
          itemMatch: { exact: ['delete'] },
          timeoutMs: 4_000,
          closeMenuAfter: true,
        });
      }
      if (!deletedFromSidebar) {
        await navigateToChatgptConversation(client, conversationId, projectId);
        const deletedFromHeader = await openAndSelectMenuItem(client.Runtime, {
          trigger: {
            selector: 'button[data-testid="conversation-options-button"]',
            interactionStrategies: ['pointer', 'keyboard-space', 'keyboard-arrowdown'],
            requireVisible: true,
            timeoutMs: 3_000,
          },
          menuSelector: '[role="menu"]',
          itemMatch: { exact: ['delete'] },
          timeoutMs: 4_000,
          closeMenuAfter: true,
        });
        if (!deletedFromHeader) {
          throw new Error(`ChatGPT conversation delete menu did not open for ${conversationId}`);
        }
      }
      let confirmationReady = await waitForPredicate(
        client.Runtime,
        buildConversationDeleteConfirmationExpression(expectedTitle),
        {
          timeoutMs: 5_000,
          description: `ChatGPT delete confirmation ready for ${conversationId}`,
        },
      );
      if (!confirmationReady.ok) {
        const deletedFromHeaderRetry = await openAndSelectMenuItem(client.Runtime, {
          trigger: {
            selector: 'button[data-testid="conversation-options-button"]',
            interactionStrategies: ['pointer', 'keyboard-space', 'keyboard-arrowdown'],
            requireVisible: true,
            timeoutMs: 3_000,
          },
          menuSelector: '[role="menu"]',
          itemMatch: { exact: ['delete'] },
          timeoutMs: 4_000,
          closeMenuAfter: true,
        });
        if (!deletedFromHeaderRetry) {
          throw new Error(`ChatGPT conversation delete confirmation did not open for ${conversationId}`);
        }
        confirmationReady = await waitForPredicate(
          client.Runtime,
          buildConversationDeleteConfirmationExpression(expectedTitle),
          {
            timeoutMs: 5_000,
            description: `ChatGPT delete confirmation ready for ${conversationId}`,
          },
        );
        if (!confirmationReady.ok) {
          throw new Error(`ChatGPT delete confirmation did not open for ${conversationId}`);
        }
      }
      const pressed = await pressButton(client.Runtime, {
        selector: 'button[data-testid="delete-conversation-confirm-button"]',
        rootSelectors: DEFAULT_DIALOG_SELECTORS,
        requireVisible: true,
        timeoutMs: 3_000,
      });
      if (!pressed.ok) {
        throw new Error(pressed.reason || `ChatGPT delete confirm button not found for ${conversationId}`);
      }
    },
    {
      label: 'chatgpt-delete-conversation',
      candidateSelectors: [
        `[${CHATGPT_CONVERSATION_ACTION_ATTR}="true"]`,
        'button[data-testid="conversation-options-button"]',
        '[role="menu"]',
        '[role="dialog"]',
        'button[data-testid="delete-conversation-confirm-button"]',
      ],
      context: {
        conversationId,
        projectId: projectId ?? null,
      },
    },
  );
  await waitForChatgptConversationDeleted(client, conversationId, projectId);
}

async function readChatgptTableArtifactRowsWithClient(
  client: ChromeClient,
  title: string,
): Promise<string[][] | null> {
  const expression = `(() => {
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
    const expected = normalize(${JSON.stringify(title)}).toLowerCase();
    const sections = Array.from(document.querySelectorAll('[data-testid^="conversation-turn-"]'));
    for (const section of sections) {
      const sectionText = normalize(section.textContent).toLowerCase();
      if (!sectionText.includes(expected)) continue;
      const table = section.querySelector('table[role="grid"], table');
      if (!table) continue;
      const rows = Array.from(table.querySelectorAll('tr'))
        .map((row) =>
          Array.from(row.querySelectorAll('th,td')).map((cell) => normalize(cell.textContent)),
        )
        .filter((row) => row.some(Boolean));
      if (rows.length > 0) {
        return rows;
      }
    }
    return null;
  })()`;
  const result = await client.Runtime.evaluate({
    expression,
    returnByValue: true,
  });
  const value = result.result?.value;
  if (!Array.isArray(value)) {
    return null;
  }
  return value
    .filter(Array.isArray)
    .map((row) => row.map((cell) => normalizeUiText(cell)).filter((cell, index, arr) => index < arr.length))
    .filter((row) => row.length > 0);
}

async function waitForChatgptTableArtifactRowsWithClient(
  client: ChromeClient,
  title: string,
): Promise<boolean> {
  const predicate = `(() => {
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
    const expected = normalize(${JSON.stringify(title)}).toLowerCase();
    const sections = Array.from(document.querySelectorAll('[data-testid^="conversation-turn-"]'));
    for (const section of sections) {
      const sectionText = normalize(section.textContent).toLowerCase();
      if (!sectionText.includes(expected)) continue;
      const table = section.querySelector('table[role="grid"], table');
      if (!table) continue;
      const rowCount = Array.from(table.querySelectorAll('tr')).filter((row) =>
        Array.from(row.querySelectorAll('th,td')).some((cell) => normalize(cell.textContent).length > 0),
      ).length;
      if (rowCount > 0) {
        return true;
      }
    }
    return false;
  })()`;
  const ready = await waitForPredicate(client.Runtime, predicate, {
    timeoutMs: 10_000,
    description: `ChatGPT table artifact "${title}" ready`,
  });
  return ready.ok;
}

async function readChatgptImageArtifactSrcWithClient(
  client: ChromeClient,
  artifact: ConversationArtifact,
): Promise<string | null> {
  const fileId = extractChatgptArtifactFileId(artifact.uri);
  const expression = `(() => {
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
    const expectedTitle = normalize(${JSON.stringify(artifact.title)});
    const fileId = ${JSON.stringify(fileId)};
    const images = Array.from(document.querySelectorAll('img')).map((img) => ({
      src: img.getAttribute('src') || '',
      alt: img.getAttribute('alt') || '',
    }));
    const exact = images.find((image) => fileId && image.src.includes('id=' + fileId));
    if (exact?.src) return exact.src;
    if (fileId) return null;
    const byTitle = images.find((image) => expectedTitle && normalize(image.alt).includes(expectedTitle));
    return byTitle?.src || null;
  })()`;
  const result = await client.Runtime.evaluate({
    expression,
    returnByValue: true,
  });
  return typeof result.result?.value === 'string' && result.result.value.trim().length > 0
    ? result.result.value.trim()
    : null;
}

async function waitForChatgptImageArtifactWithClient(
  client: ChromeClient,
  artifact: ConversationArtifact,
): Promise<boolean> {
  const fileId = extractChatgptArtifactFileId(artifact.uri);
  const predicate = `(() => {
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
    const expectedTitle = normalize(${JSON.stringify(artifact.title)});
    const fileId = ${JSON.stringify(fileId)};
    const images = Array.from(document.querySelectorAll('img'));
    return images.some((img) => {
      const src = String(img.getAttribute('src') || '');
      const alt = normalize(img.getAttribute('alt'));
      if (fileId && src.includes('id=' + fileId)) {
        return true;
      }
      if (fileId) {
        return false;
      }
      return Boolean(expectedTitle) && alt.includes(expectedTitle);
    });
  })()`;
  const ready = await waitForPredicate(client.Runtime, predicate, {
    timeoutMs: 10_000,
    description: `ChatGPT image artifact "${artifact.title}" ready`,
  });
  return ready.ok;
}

async function fetchChatgptBinaryWithClient(
  client: ChromeClient,
  url: string,
): Promise<{ buffer: Buffer; contentType: string | null; contentDisposition: string | null }> {
  const expression = `(async () => {
    const response = await fetch(${JSON.stringify(url)}, { credentials: 'include' });
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
      };
    }
    const contentType = response.headers.get('content-type');
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = '';
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
    }
      return {
        ok: true,
        contentType,
        contentDisposition: response.headers.get('content-disposition'),
        base64: btoa(binary),
      };
    })()`;
  const result = await client.Runtime.evaluate({
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  const value = isRecord(result.result?.value) ? result.result.value : null;
  if (!value || value.ok !== true || typeof value.base64 !== 'string') {
    const status = typeof value?.status === 'number' ? ` (status ${value.status})` : '';
    throw new Error(`ChatGPT artifact binary fetch failed${status}`);
  }
  return {
    buffer: Buffer.from(value.base64, 'base64'),
    contentType: typeof value.contentType === 'string' ? value.contentType : null,
    contentDisposition: typeof value.contentDisposition === 'string' ? value.contentDisposition : null,
  };
}

async function configureChatgptDownloadBehaviorWithClient(
  client: ChromeClient,
  downloadPath: string,
): Promise<void> {
  const cdpClient = client as unknown as {
    send?: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
  };
  if (typeof cdpClient.send !== 'function') {
    return;
  }
  try {
    await cdpClient.send('Browser.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath,
      eventsEnabled: true,
    });
    return;
  } catch {
    // Fall back to the older Page domain when Browser.setDownloadBehavior is unavailable.
  }
  try {
    await cdpClient.send('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath,
    });
  } catch {
    // Leave downloads unconfigured if the target does not support either method.
  }
}

async function tagChatgptDownloadButtonWithClient(
  client: ChromeClient,
  artifact: ConversationArtifact,
): Promise<boolean> {
  const turnId =
    artifact.metadata && typeof artifact.metadata.turnId === 'string'
      ? artifact.metadata.turnId.trim()
      : null;
  const buttonIndex =
    artifact.metadata && typeof artifact.metadata.buttonIndex === 'number' && Number.isFinite(artifact.metadata.buttonIndex)
      ? artifact.metadata.buttonIndex
      : null;
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const result = await client.Runtime.evaluate({
      expression: `(() => {
        const attr = ${JSON.stringify(CHATGPT_DOWNLOAD_BUTTON_ATTR)};
        const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
        const isVisible = (node) => {
          if (!(node instanceof Element)) return false;
          const rect = node.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        };
        document.querySelectorAll('[' + attr + ']').forEach((node) => node.removeAttribute(attr));
        const expectedTitle = normalize(${JSON.stringify(artifact.title)}).toLowerCase();
        const expectedMessageId = normalize(${JSON.stringify(artifact.messageId ?? null)});
        const expectedTurnId = normalize(${JSON.stringify(turnId)});
        const expectedMessageIndex = ${JSON.stringify(
          typeof artifact.messageIndex === 'number' ? artifact.messageIndex : null,
        )};
        const expectedButtonIndex = ${JSON.stringify(buttonIndex)};
        const roots = Array.from(document.querySelectorAll('section[data-testid^="conversation-turn-"]'))
          .map((section, messageIndex) => {
            const roleNode = section.querySelector('[data-message-author-role]');
            return {
              section,
              messageIndex,
              role: normalize(roleNode?.getAttribute('data-message-author-role') || ''),
              messageId: normalize(roleNode?.getAttribute('data-message-id') || ''),
              turnId: normalize(section.getAttribute('data-turn-id') || ''),
            };
          })
          .filter((entry) => entry.role === 'assistant');
        const resolveButtons = (root) =>
          Array.from(root.section.querySelectorAll('button.behavior-btn'))
            .filter((button) => isVisible(button) && !button.closest('div[id^="textdoc-message-"]'))
            .map((button, index) => ({
              button,
              index,
              title: normalize(button.textContent || button.getAttribute('aria-label') || '').toLowerCase(),
            }))
            .filter((entry) => entry.title && entry.title === expectedTitle);
        const scopedRoot =
          (expectedTurnId && roots.find((root) => root.turnId === expectedTurnId)) ||
          (expectedMessageId && roots.find((root) => root.messageId === expectedMessageId || root.turnId === expectedMessageId)) ||
          (typeof expectedMessageIndex === 'number' ? roots.find((root) => root.messageIndex === expectedMessageIndex) : null) ||
          null;
        const candidates = scopedRoot ? resolveButtons(scopedRoot) : roots.flatMap(resolveButtons);
        const chosen =
          (typeof expectedButtonIndex === 'number' ? candidates.find((candidate) => candidate.index === expectedButtonIndex) : null) ||
          candidates[0] ||
          null;
        if (!chosen?.button) {
          return { ok: false };
        }
        chosen.button.setAttribute(attr, 'true');
        return { ok: true };
      })()`,
      returnByValue: true,
    });
    if (isRecord(result.result?.value) && result.result.value.ok === true) {
      return true;
    }
    await sleep(250);
  }
  return false;
}

async function tagChatgptSpreadsheetCardDownloadButtonWithClient(
  client: ChromeClient,
  artifact: ConversationArtifact,
): Promise<boolean> {
  const turnId =
    artifact.metadata && typeof artifact.metadata.turnId === 'string'
      ? artifact.metadata.turnId.trim()
      : null;
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const result = await client.Runtime.evaluate({
      expression: `(() => {
        const attr = ${JSON.stringify(CHATGPT_DOWNLOAD_BUTTON_ATTR)};
        const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
        const isVisible = (node) => {
          if (!(node instanceof Element)) return false;
          const rect = node.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        };
        document.querySelectorAll('[' + attr + ']').forEach((node) => node.removeAttribute(attr));
        const expectedTitle = normalize(${JSON.stringify(artifact.title)}).toLowerCase();
        const expectedMessageId = normalize(${JSON.stringify(artifact.messageId ?? null)});
        const expectedTurnId = normalize(${JSON.stringify(turnId)});
        const expectedMessageIndex = ${JSON.stringify(
          typeof artifact.messageIndex === 'number' ? artifact.messageIndex : null,
        )};
        const roots = Array.from(document.querySelectorAll('section[data-testid^="conversation-turn-"]'))
          .map((section, messageIndex) => {
            const roleNode = section.querySelector('[data-message-author-role]');
            return {
              section,
              messageIndex,
              role: normalize(roleNode?.getAttribute('data-message-author-role') || ''),
              messageId: normalize(roleNode?.getAttribute('data-message-id') || ''),
              turnId: normalize(section.getAttribute('data-turn-id') || ''),
            };
          })
          .filter((entry) => entry.role === 'assistant');
        const resolveButtons = (root) => {
          const cards = Array.from(root.section.querySelectorAll('div.group.my-4'))
            .map((card) => ({
              card,
              text: normalize(card.textContent || '').toLowerCase(),
            }))
            .filter((entry) => entry.text && entry.text.includes(expectedTitle));
          const card =
            cards[0]?.card ||
            (expectedTitle
              ? null
              : Array.from(root.section.querySelectorAll('div.group.my-4'))[0] || null);
          if (!(card instanceof HTMLElement)) {
            return [];
          }
          return Array.from(card.querySelectorAll('button'))
            .filter((button) => isVisible(button))
            .slice(0, 2)
            .map((button) => ({ button }));
        };
        const scopedRoot =
          (expectedTurnId && roots.find((root) => root.turnId === expectedTurnId)) ||
          (expectedMessageId && roots.find((root) => root.messageId === expectedMessageId || root.turnId === expectedMessageId)) ||
          (typeof expectedMessageIndex === 'number' ? roots.find((root) => root.messageIndex === expectedMessageIndex) : null) ||
          null;
        const candidates = scopedRoot ? resolveButtons(scopedRoot) : roots.flatMap(resolveButtons);
        const chosen = candidates[0] || null;
        if (!chosen?.button) {
          return { ok: false };
        }
        chosen.button.setAttribute(attr, 'true');
        return { ok: true };
      })()`,
      returnByValue: true,
    });
    if (isRecord(result.result?.value) && result.result.value.ok === true) {
      return true;
    }
    await sleep(250);
  }
  return false;
}

async function waitForChatgptDownloadedFile(
  destDir: string,
  timeoutMs = 20_000,
): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  let lastPath: string | null = null;
  let lastSize = -1;
  let stableCount = 0;
  while (Date.now() < deadline) {
    const entries = await fs.readdir(destDir, { withFileTypes: true }).catch(() => []);
    const fileNames = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
    const completed = fileNames.filter((name) => !name.endsWith('.crdownload') && !name.endsWith('.tmp'));
    if (completed.length > 0) {
      const candidatePath = path.join(destDir, completed.sort()[0]!);
      const stat = await fs.stat(candidatePath).catch(() => null);
      if (stat) {
        if (candidatePath === lastPath && stat.size === lastSize) {
          stableCount += 1;
        } else {
          lastPath = candidatePath;
          lastSize = stat.size;
          stableCount = 0;
        }
        if (stableCount >= 1) {
          return candidatePath;
        }
      }
    }
    await sleep(250);
  }
  return null;
}

async function materializeChatgptConversationArtifactWithClient(
  client: ChromeClient,
  conversationId: string,
  artifact: ConversationArtifact,
  destDir: string,
  projectId?: string | null,
): Promise<FileRef | null> {
  const normalizedProjectId = normalizeChatgptProjectId(projectId);
  return withChatgptRateLimitDialogRecovery(
    client,
    `materializeChatgptConversationArtifact:${conversationId}:${artifact.id}`,
    async () => {
      await navigateToChatgptConversation(client, conversationId, normalizedProjectId);
      const ready = await waitForPredicate(
        client.Runtime,
        buildConversationSurfaceReadyExpression(conversationId, normalizedProjectId),
        {
          timeoutMs: 10_000,
          description: `ChatGPT conversation ${conversationId} surface ready`,
        },
      );
      if (!ready.ok) {
        throw new Error(`ChatGPT conversation ${conversationId} content not found`);
      }
      if (artifact.kind === 'canvas') {
        let contentText =
          artifact.metadata && typeof artifact.metadata.contentText === 'string'
            ? artifact.metadata.contentText
            : '';
        if (!contentText.trim()) {
          const canvasArtifacts = mergeChatgptCanvasArtifactContent([artifact], await readVisibleChatgptCanvasProbesWithClient(client));
          const enriched = canvasArtifacts[0];
          contentText =
            enriched?.metadata && typeof enriched.metadata.contentText === 'string'
              ? enriched.metadata.contentText
              : '';
        }
        if (!contentText.trim()) {
          return null;
        }
        const documentName =
          artifact.metadata && typeof artifact.metadata.documentName === 'string'
            ? artifact.metadata.documentName
            : artifact.title;
        const fileName = ensureChatgptArtifactExtension(documentName, '.txt');
        const destPath = path.join(destDir, fileName);
        await fs.writeFile(destPath, contentText.endsWith('\n') ? contentText : `${contentText}\n`, 'utf8');
        const stat = await fs.stat(destPath);
        return {
          id: artifact.id,
          name: fileName,
          provider: 'chatgpt',
          source: 'conversation',
          size: stat.size,
          mimeType: 'text/plain',
          remoteUrl: artifact.uri,
          localPath: destPath,
          metadata: {
            artifactKind: artifact.kind,
            artifactTitle: artifact.title,
            materialization: 'canvas-content-text',
            ...(artifact.metadata ?? {}),
          },
        };
      }
      if (
        artifact.kind === 'download' ||
        (artifact.kind === 'spreadsheet' &&
          typeof artifact.uri === 'string' &&
          artifact.uri.trim().toLowerCase().startsWith('sandbox:'))
      ) {
        await configureChatgptDownloadBehaviorWithClient(client, destDir);
        let tagged = await tagChatgptDownloadButtonWithClient(client, artifact);
        if (
          !tagged &&
          artifact.kind === 'spreadsheet' &&
          typeof artifact.uri === 'string' &&
          artifact.uri.trim().toLowerCase().startsWith('sandbox:')
        ) {
          tagged = await tagChatgptSpreadsheetCardDownloadButtonWithClient(client, artifact);
        }
        if (!tagged) {
          return null;
        }
        const readyButton = await waitForSelector(
          client.Runtime,
          `button[${CHATGPT_DOWNLOAD_BUTTON_ATTR}="true"]`,
          10_000,
        );
        if (!readyButton) {
          return null;
        }
        await armDownloadCapture(client.Runtime, { stateKey: CHATGPT_DOWNLOAD_CAPTURE_STATE_KEY });
        const clickResult = await client.Runtime.evaluate({
          expression: `(() => {
            const button = document.querySelector(${JSON.stringify(`button[${CHATGPT_DOWNLOAD_BUTTON_ATTR}="true"]`)});
            if (!(button instanceof HTMLElement)) {
              return { ok: false, reason: 'Download button missing before click' };
            }
            button.click();
            return { ok: true };
          })()`,
          returnByValue: true,
        });
        if (!isRecord(clickResult.result?.value) || clickResult.result.value.ok !== true) {
          return null;
        }
        const capture = await waitForDownloadCapture(client.Runtime, {
          stateKey: CHATGPT_DOWNLOAD_CAPTURE_STATE_KEY,
          timeoutMs: 1500,
          pollMs: 100,
        });
        const remoteUrl = normalizeUiText(capture.href);
        const downloadName = normalizeUiText(capture.downloadName);
        if (remoteUrl) {
          const { buffer, contentType, contentDisposition } = await fetchChatgptBinaryWithClient(client, remoteUrl);
          const fallbackBaseName =
            extractFilenameFromContentDisposition(contentDisposition) ||
            extractFilenameFromArtifactUri(artifact.uri) ||
            downloadName ||
            artifact.title;
          const fileName = ensureChatgptArtifactExtension(
            fallbackBaseName,
            contentTypeToExtension(contentType),
          );
          const destPath = path.join(destDir, fileName);
          await fs.writeFile(destPath, buffer);
          return {
            id: artifact.id,
            name: fileName,
            provider: 'chatgpt',
            source: 'conversation',
            size: buffer.byteLength,
            mimeType: contentType ?? inferMimeTypeFromArtifactName(fileName),
            remoteUrl,
            localPath: destPath,
            metadata: {
              artifactKind: artifact.kind,
              artifactTitle: artifact.title,
              materialization: 'captured-anchor-fetch',
              ...(artifact.metadata ?? {}),
            },
          };
        }
        const downloadedPath = await waitForChatgptDownloadedFile(destDir);
        if (!downloadedPath) {
          return null;
        }
        const stat = await fs.stat(downloadedPath);
        const name = path.basename(downloadedPath);
        return {
          id: artifact.id,
          name,
          provider: 'chatgpt',
          source: 'conversation',
          size: stat.size,
          mimeType: inferMimeTypeFromArtifactName(name),
          remoteUrl: artifact.uri,
          localPath: downloadedPath,
          metadata: {
            artifactKind: artifact.kind,
            artifactTitle: artifact.title,
            materialization: 'download-button',
            ...(artifact.metadata ?? {}),
          },
        };
      }
      if (artifact.kind === 'spreadsheet' && typeof artifact.title === 'string' && artifact.title.trim()) {
        const tableReady = await waitForChatgptTableArtifactRowsWithClient(client, artifact.title);
        if (!tableReady) {
          return null;
        }
        const rows = await readChatgptTableArtifactRowsWithClient(client, artifact.title);
        if (rows && rows.length > 0) {
          const csv = serializeChatgptGridRowsToCsv(rows);
          const fileName = ensureChatgptArtifactExtension(artifact.title, '.csv');
          const destPath = path.join(destDir, fileName);
          await fs.writeFile(destPath, csv.endsWith('\n') ? csv : `${csv}\n`, 'utf8');
          const stat = await fs.stat(destPath);
          return {
            id: artifact.id,
            name: fileName,
            provider: 'chatgpt',
            source: 'conversation',
            size: stat.size,
            mimeType: 'text/csv',
            remoteUrl: artifact.uri,
            localPath: destPath,
            metadata: {
              artifactKind: artifact.kind,
              artifactTitle: artifact.title,
              materialization: 'inline-grid-csv',
              ...(artifact.metadata ?? {}),
            },
          };
        }
        return null;
      }
      if (artifact.kind === 'image') {
        const imageReady = await waitForChatgptImageArtifactWithClient(client, artifact);
        if (!imageReady) {
          return null;
        }
        const imageUrl = await readChatgptImageArtifactSrcWithClient(client, artifact);
        if (!imageUrl) {
          return null;
        }
        const { buffer, contentType } = await fetchChatgptBinaryWithClient(client, imageUrl);
        const fileName = ensureChatgptArtifactExtension(
          artifact.title,
          contentTypeToExtension(contentType),
        );
        const destPath = path.join(destDir, fileName);
        await fs.writeFile(destPath, buffer);
        return {
          id: artifact.id,
          name: fileName,
          provider: 'chatgpt',
          source: 'conversation',
          size: buffer.byteLength,
          mimeType: contentType ?? undefined,
          remoteUrl: artifact.uri ?? imageUrl,
          localPath: destPath,
          metadata: {
            artifactKind: artifact.kind,
            artifactTitle: artifact.title,
            materialization: 'estuary-image-fetch',
            imageUrl,
            ...(artifact.metadata ?? {}),
          },
        };
      }
      return null;
    },
  );
}

export function createChatgptAdapter(): Pick<
  BrowserProvider,
  | 'capabilities'
  | 'getUserIdentity'
  | 'listProjects'
  | 'updateProjectInstructions'
  | 'getProjectInstructions'
  | 'listProjectFiles'
  | 'uploadProjectFiles'
  | 'deleteProjectFile'
  | 'renameProject'
  | 'openCreateProjectModal'
  | 'setCreateProjectFields'
  | 'clickCreateProjectConfirm'
  | 'createProject'
  | 'selectRemoveProjectItem'
  | 'pushProjectRemoveConfirmation'
  | 'listConversations'
  | 'readConversationContext'
  | 'listConversationFiles'
  | 'materializeConversationArtifact'
  | 'renameConversation'
  | 'deleteConversation'
> {
  return {
    capabilities: {
      projects: true,
      conversations: true,
      instructions: true,
      files: true,
    },
    async getUserIdentity(options?: BrowserProviderListOptions): Promise<ProviderUserIdentity | null> {
      const { client } = await connectToChatgptTab(options, options?.configuredUrl ?? CHATGPT_HOME_URL);
      try {
        return await readChatgptUserIdentity(client);
      } finally {
        await client.close().catch(() => undefined);
      }
    },
    async listProjects(options?: BrowserProviderListOptions): Promise<Project[]> {
      const attempt = async (currentOptions?: BrowserProviderListOptions): Promise<Project[]> => {
        const { client } = await connectToChatgptTab(currentOptions, currentOptions?.configuredUrl ?? CHATGPT_HOME_URL);
        try {
          await ensureChatgptSidebarOpen(client);
          return await scrapeChatgptProjects(client);
        } finally {
          await client.close().catch(() => undefined);
        }
      };
      try {
        return await attempt(options);
      } catch (error) {
        if (!isRetryableConnectionError(error)) {
          throw error;
        }
        const retryOptions = options ? { ...options, tabTargetId: undefined } : undefined;
        return attempt(retryOptions);
      }
    },
    async listConversations(projectId?: string, options?: BrowserProviderListOptions): Promise<Conversation[]> {
      const normalizedProjectId = normalizeChatgptProjectId(projectId);
      const attempt = async (currentOptions?: BrowserProviderListOptions): Promise<Conversation[]> => {
        const targetUrl = normalizedProjectId
          ? `https://chatgpt.com/g/${normalizedProjectId}/project`
          : (currentOptions?.configuredUrl ?? CHATGPT_HOME_URL);
        const { client } = await connectToChatgptTab(currentOptions, targetUrl);
        try {
          return await scrapeChatgptConversations(client, normalizedProjectId);
        } finally {
          await client.close().catch(() => undefined);
        }
      };
      try {
        return await attempt(options);
      } catch (error) {
        if (!isRetryableConnectionError(error)) {
          throw error;
        }
        const retryOptions = options ? { ...options, tabTargetId: undefined } : undefined;
        return attempt(retryOptions);
      }
    },
    async readConversationContext(
      conversationId: string,
      projectId?: string,
      options?: BrowserProviderListOptions,
    ): Promise<ConversationContext> {
      const normalizedProjectId = normalizeChatgptProjectId(projectId);
      const { client } = await connectToChatgptTab(
        options,
        resolveChatgptConversationUrl(conversationId, normalizedProjectId),
      );
      try {
        return await readChatgptConversationContextWithClient(client, conversationId, normalizedProjectId);
      } finally {
        await client.close().catch(() => undefined);
      }
    },
    async listConversationFiles(
      conversationId: string,
      options?: BrowserProviderListOptions,
    ): Promise<FileRef[]> {
      const normalizedProjectId = normalizeChatgptProjectId(options?.projectId);
      const { client } = await connectToChatgptTab(
        options,
        resolveChatgptConversationUrl(conversationId, normalizedProjectId),
      );
      try {
        await navigateToChatgptConversation(client, conversationId, normalizedProjectId);
        const ready = await waitForPredicate(
          client.Runtime,
          buildConversationSurfaceReadyExpression(conversationId, normalizedProjectId),
          {
            timeoutMs: 10_000,
            description: `ChatGPT conversation ${conversationId} surface ready`,
          },
        );
        if (!ready.ok) {
          throw new Error(`ChatGPT conversation ${conversationId} content not found`);
        }
        return await readVisibleChatgptConversationFilesWithClient(client, conversationId);
      } finally {
        await client.close().catch(() => undefined);
      }
    },
    async materializeConversationArtifact(
      conversationId: string,
      artifact: ConversationArtifact,
      destDir: string,
      projectId?: string,
      options?: BrowserProviderListOptions,
    ): Promise<FileRef | null> {
      const normalizedProjectId = normalizeChatgptProjectId(projectId);
      const { client } = await connectToChatgptTab(
        options,
        resolveChatgptConversationUrl(conversationId, normalizedProjectId),
      );
      try {
        return await materializeChatgptConversationArtifactWithClient(
          client,
          conversationId,
          artifact,
          destDir,
          normalizedProjectId,
        );
      } finally {
        await client.close().catch(() => undefined);
      }
    },
    async renameConversation(
      conversationId: string,
      newTitle: string,
      projectId?: string,
      options?: BrowserProviderListOptions,
    ): Promise<void> {
      const normalizedProjectId = normalizeChatgptProjectId(projectId);
      const { client } = await connectToChatgptTab(
        options,
        resolveChatgptConversationUrl(conversationId, normalizedProjectId),
      );
      try {
        let lastError: unknown;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          try {
            await renameChatgptConversationWithClient(client, conversationId, newTitle, normalizedProjectId);
            return;
          } catch (error) {
            lastError = error;
            if (attempt === 2) {
              break;
            }
            await sleep(2_000 * (attempt + 1));
            await navigateToChatgptConversation(client, conversationId, normalizedProjectId).catch(() => undefined);
            await ensureChatgptSidebarOpen(client).catch(() => undefined);
          }
        }
        throw lastError instanceof Error
          ? lastError
          : new Error(`ChatGPT conversation rename failed for ${conversationId}`);
      } finally {
        await client.close().catch(() => undefined);
      }
    },
    async deleteConversation(
      conversationId: string,
      projectId?: string,
      options?: BrowserProviderListOptions,
    ): Promise<void> {
      const normalizedProjectId = normalizeChatgptProjectId(projectId);
      const { client } = await connectToChatgptTab(
        options,
        resolveChatgptConversationUrl(conversationId, normalizedProjectId),
      );
      try {
        await deleteChatgptConversationWithClient(client, conversationId, normalizedProjectId);
      } finally {
        await client.close().catch(() => undefined);
      }
    },
    async openCreateProjectModal(options?: BrowserProviderListOptions): Promise<void> {
      const { client } = await connectToChatgptTab(options, options?.configuredUrl ?? CHATGPT_HOME_URL);
      try {
        await openCreateProjectModalWithClient(client);
      } finally {
        await client.close().catch(() => undefined);
      }
    },
    async setCreateProjectFields(
      fields: { name?: string; instructions?: string; modelLabel?: string; memoryMode?: ProjectMemoryMode },
      options?: BrowserProviderListOptions,
    ): Promise<void> {
      const { client } = await connectToChatgptTab(options, options?.configuredUrl ?? CHATGPT_HOME_URL);
      try {
        await openCreateProjectModalWithClient(client);
        await setCreateProjectFieldsWithClient(client, fields);
      } finally {
        await client.close().catch(() => undefined);
      }
    },
    async clickCreateProjectConfirm(options?: BrowserProviderListOptions): Promise<void> {
      const { client } = await connectToChatgptTab(options, options?.configuredUrl ?? CHATGPT_HOME_URL);
      try {
        await clickCreateProjectConfirmWithClient(client);
      } finally {
        await client.close().catch(() => undefined);
      }
    },
    async createProject(
      input: {
        name: string;
        instructions?: string;
        modelLabel?: string;
        files?: string[];
        memoryMode?: ProjectMemoryMode;
      },
      options?: BrowserProviderListOptions,
    ): Promise<Project | null> {
      const { client } = await connectToChatgptTab(options, options?.configuredUrl ?? CHATGPT_HOME_URL);
      try {
        await navigateToChatgptUrl(client, options?.configuredUrl ?? CHATGPT_HOME_URL);
        const initialProjects = await scrapeChatgptProjects(client);
        const initialProjectIds = new Set(initialProjects.map((project) => project.id));
        const initialCurrentProject = await readCurrentProject(client);
        await openCreateProjectModalWithClient(client);
        await setCreateProjectFieldsWithClient(client, input);
        await clickCreateProjectConfirmWithClient(client);
        const routeChanged = await waitForPredicate(
          client.Runtime,
          buildProjectRouteChangeExpression(initialCurrentProject?.id ?? null),
          {
            timeoutMs: 12_000,
            description: `ChatGPT project route changed for ${input.name}`,
          },
        );
        const deadline = Date.now() + 12_000;
        let created: Project | null = null;
        if (routeChanged.ok) {
          const routeValue = routeChanged.value as { id?: string; href?: string } | undefined;
          const createdId = normalizeChatgptProjectId(routeValue?.id);
          if (createdId) {
            await waitForPredicate(
              client.Runtime,
              buildProjectSurfaceReadyExpression(createdId),
              {
                timeoutMs: 15_000,
                description: `ChatGPT project surface ready for ${input.name}`,
              },
            );
            try {
              await waitForProjectNameApplied(client, createdId, input.name);
            } catch {
              // Title/sidebar hydration can lag after route change; route change itself is authoritative.
            }
            const current = await readCurrentProject(client);
            created = {
              id: createdId,
              name:
                current && normalizeProjectName(current.name) === normalizeProjectName(input.name)
                  ? current.name
                  : input.name,
              provider: 'chatgpt',
              url: current?.url ?? routeValue?.href ?? `https://chatgpt.com/g/${createdId}/project`,
              memoryMode: input.memoryMode,
            };
          }
        }
        while (Date.now() < deadline) {
          if (created) break;
          const current = await readCurrentProject(client);
          if (
            current &&
            current.id !== initialCurrentProject?.id &&
            normalizeProjectName(current.name) === normalizeProjectName(input.name)
          ) {
            created = {
              ...current,
              memoryMode: input.memoryMode,
            };
            break;
          }
          const projects = await scrapeChatgptProjects(client);
          const match = findChatgptProjectByName(projects, input.name);
          if (match && !initialProjectIds.has(match.id)) {
            created = {
              ...match,
              memoryMode: input.memoryMode,
            };
            break;
          }
          await sleep(400);
        }
        if (!created) {
          throw new Error(`ChatGPT project creation could not be verified for "${input.name}"`);
        }
        if (input.instructions?.trim()) {
          await applyProjectSettings(client, created.id, { instructions: input.instructions });
          await waitForProjectInstructionsApplied(client, created.id, input.instructions);
        }
        if (Array.isArray(input.files) && input.files.length > 0) {
          await uploadChatgptProjectSourceFilesWithClient(client, created.id, input.files);
        }
        return created;
      } finally {
        await client.close().catch(() => undefined);
      }
    },
    async uploadProjectFiles(
      projectId: string,
      filePaths: string[],
      options?: BrowserProviderListOptions,
    ): Promise<void> {
      if (filePaths.length === 0) return;
      const { client } = await connectToChatgptTab(options, `https://chatgpt.com/g/${projectId}/project?tab=sources`);
      try {
        await uploadChatgptProjectSourceFilesWithClient(client, projectId, filePaths);
      } finally {
        await client.close().catch(() => undefined);
      }
    },
    async listProjectFiles(
      projectId: string,
      options?: BrowserProviderListOptions,
    ): Promise<FileRef[]> {
      const { client } = await connectToChatgptTab(options, `https://chatgpt.com/g/${projectId}/project?tab=sources`);
      try {
        await openProjectSourcesTab(client, projectId);
        const initial = await readChatgptProjectSourceFilesSettled(client, { timeoutMs: 8_000 });
        if (initial.length > 0) {
          return initial;
        }
        await reloadProjectSourcesTab(client, projectId);
        return await readChatgptProjectSourceFilesSettled(client, { timeoutMs: 8_000 });
      } finally {
        await client.close().catch(() => undefined);
      }
    },
    async deleteProjectFile(
      projectId: string,
      fileName: string,
      options?: BrowserProviderListOptions,
    ): Promise<void> {
      const { client } = await connectToChatgptTab(options, `https://chatgpt.com/g/${projectId}/project?tab=sources`);
      try {
        await openProjectSourcesTab(client, projectId);
        await readChatgptProjectSourceFilesSettled(client);
        const selector = await tagChatgptProjectSourceAction(client, fileName);
        await withUiDiagnostics(
          client.Runtime,
          async () => {
            const removed = await openAndSelectMenuItem(client.Runtime, {
              trigger: {
                selector,
                interactionStrategies: ['pointer', 'keyboard-space', 'keyboard-arrowdown'],
                requireVisible: true,
                timeoutMs: 3_000,
              },
              itemMatch: { exact: ['remove'] },
              menuSelector: '[role="menu"]',
              timeoutMs: 4_000,
              closeMenuAfter: true,
            });
            if (!removed) {
              throw new Error(`ChatGPT source actions menu did not remove "${fileName}"`);
            }
          },
          {
            label: 'chatgpt-remove-project-source',
            candidateSelectors: ['button[aria-label="Source actions"]', '[role="menu"]', '[role="menuitem"]'],
            context: {
              projectId,
              fileName,
            },
          },
        );
        let removal = await waitForPredicate(
          client.Runtime,
          buildProjectSourceRemovedExpression(fileName),
          {
            timeoutMs: 4_000,
            description: `ChatGPT project source removed: ${fileName}`,
          },
        );
        if (!removal.ok) {
          await confirmChatgptProjectSourceRemovalIfPresent(client, fileName);
          removal = await waitForPredicate(
            client.Runtime,
            buildProjectSourceRemovedExpression(fileName),
            {
              timeoutMs: 8_000,
              description: `ChatGPT project source removed after confirmation: ${fileName}`,
            },
          );
        }
        if (!removal.ok) {
          throw new Error(`ChatGPT project source "${fileName}" did not disappear after removal`);
        }
        await waitForProjectSourceRemovedPersisted(client, projectId, fileName);
      } finally {
        await client.close().catch(() => undefined);
      }
    },
    async updateProjectInstructions(
      projectId: string,
      instructions: string,
      options?: BrowserProviderListOptions,
      modelLabel?: string,
    ): Promise<void> {
      if (typeof modelLabel === 'string' && modelLabel.trim().length > 0) {
        throw new Error('ChatGPT project instructions model selection is not supported');
      }
      const { client } = await connectToChatgptTab(options, `https://chatgpt.com/g/${projectId}/project`);
      try {
        await applyProjectSettings(client, projectId, { instructions });
        await waitForProjectInstructionsApplied(client, projectId, instructions);
      } finally {
        await client.close().catch(() => undefined);
      }
    },
    async getProjectInstructions(
      projectId: string,
      options?: BrowserProviderListOptions,
    ): Promise<{ text: string; model?: string | null }> {
      const { client } = await connectToChatgptTab(options, `https://chatgpt.com/g/${projectId}/project`);
      try {
        await openProjectSettingsPanel(client, projectId);
        const snapshot = await readProjectSettingsSnapshot(client);
        return { text: snapshot.text, model: null };
      } finally {
        await closeDialog(client.Runtime, DEFAULT_DIALOG_SELECTORS).catch(() => undefined);
        await client.close().catch(() => undefined);
      }
    },
    async renameProject(projectId: string, newTitle: string, options?: BrowserProviderListOptions): Promise<void> {
      const { client } = await connectToChatgptTab(options, `https://chatgpt.com/g/${projectId}/project`);
      try {
        await applyProjectSettings(client, projectId, { name: newTitle });
        await waitForProjectNameApplied(client, projectId, newTitle);
      } finally {
        await client.close().catch(() => undefined);
      }
    },
    async selectRemoveProjectItem(projectId: string, options?: BrowserProviderListOptions): Promise<void> {
      const { client } = await connectToChatgptTab(options, `https://chatgpt.com/g/${projectId}/project`);
      try {
        await openProjectSettingsPanel(client, projectId);
        const settingsRootSelector = await tagProjectSettingsDialog(client, { name: true, instructions: true });
        await withUiDiagnostics(
          client.Runtime,
          async () => {
            const pressed = await pressButton(client.Runtime, {
              match: { exact: ['delete project'] },
              rootSelectors: [settingsRootSelector],
              requireVisible: true,
              timeoutMs: 5000,
            });
            if (!pressed.ok) {
              throw new Error(pressed.reason || 'ChatGPT delete project button not found');
            }
            const confirmation = await waitForPredicate(
              client.Runtime,
              buildProjectDeleteConfirmationExpression(),
              {
                timeoutMs: 5_000,
                description: 'ChatGPT project delete confirmation ready',
              },
            );
            if (!confirmation.ok) {
              throw new Error('ChatGPT delete confirmation did not open');
            }
          },
          {
            label: 'chatgpt-select-remove-project-item',
            rootSelectors: [settingsRootSelector],
            candidateSelectors: ['button', '[role="dialog"]'],
            context: {
              projectId,
              settingsRootSelector,
            },
          },
        );
      } finally {
        await client.close().catch(() => undefined);
      }
    },
    async pushProjectRemoveConfirmation(projectId: string, options?: BrowserProviderListOptions): Promise<void> {
      const { client } = await connectToChatgptTab(options, `https://chatgpt.com/g/${projectId}/project`);
      try {
        const { result } = await client.Runtime.evaluate({
          expression: `(() => {
            const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
            const dialogs = Array.from(document.querySelectorAll('[role="dialog"], dialog[open]'));
            for (const dialog of dialogs) {
              const text = normalize(dialog.textContent || '');
              if (!text.includes('delete project?')) continue;
              const button = Array.from(dialog.querySelectorAll('button'))
                .find((node) => normalize(node.getAttribute('aria-label') || node.textContent || '') === 'delete');
              if (!button) {
                return { ok: false, reason: 'delete-button-missing' };
              }
              button.click();
              return { ok: true };
            }
            return { ok: false, reason: 'confirmation-dialog-missing' };
          })()`,
          returnByValue: true,
        });
        const pressed = result?.value as { ok?: boolean; reason?: string } | undefined;
        if (!pressed?.ok) {
          throw new Error(pressed?.reason || 'ChatGPT delete confirmation button not found');
        }
        const leftProject = await waitForPredicate(
          client.Runtime,
          `(() => {
            const match = location.pathname.match(/^\\/g\\/([^/]+)\\/project\\/?$/);
            return !match || match[1] !== ${JSON.stringify(projectId)} ? { href: location.href } : null;
          })()`,
          {
            timeoutMs: 10_000,
            description: `ChatGPT project ${projectId} deleted`,
          },
        );
        if (leftProject.ok) {
          return;
        }
        await navigateAndSettle(client, {
          url: CHATGPT_HOME_URL,
          timeoutMs: 10_000,
          routeExpression: `(() => {
            try {
              const parsed = new URL(location.href);
              return parsed.origin === 'https://chatgpt.com' && parsed.pathname === '/' ? { href: location.href } : null;
            } catch {
              return null;
            }
          })()`,
          routeDescription: 'ChatGPT home route ready after project delete',
        });
        await ensureChatgptSidebarOpen(client);
        const remainingProjects = await scrapeChatgptProjects(client);
        if (remainingProjects.some((project) => normalizeChatgptProjectId(project.id) === projectId)) {
          throw new Error('ChatGPT project delete did not leave the deleted project page');
        }
      } finally {
        await client.close().catch(() => undefined);
      }
    },
  };
}
