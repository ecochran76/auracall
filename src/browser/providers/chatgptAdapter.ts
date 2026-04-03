import fs from 'node:fs/promises';
import path from 'node:path';
import CDP from 'chrome-remote-interface';
import { connectToChromeTarget, openOrReuseChromeTarget } from '../../../packages/browser-service/src/chromeLifecycle.js';
import type { ChromeClient } from '../types.js';
import { ChatgptFeatureSchema } from '../llmService/providers/schema.js';
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
  hoverElement,
  openAndSelectRevealedRowMenuItem,
  PressButtonOptions,
  navigateAndSettle,
  openAndSelectMenuItem,
  openAndSelectMenuItemFromTriggers,
  openMenu,
  openSurface,
  pressButton,
  selectMenuItem,
  setInputValue,
  submitInlineRename,
  waitForDownloadCapture,
  waitForPredicate,
  waitForSelector,
  waitForNotSelector,
  withAnchoredActionDiagnostics,
  withBlockingSurfaceRecovery,
  withUiDiagnostics,
} from '../service/ui.js';
import {
  captureBrowserPostmortemSnapshot,
  persistBrowserPostmortemRecord,
} from '../domDebug.js';
import { extractChatgptRateLimitSummary, isChatgptRateLimitMessage } from '../chatgptRateLimitGuard.js';
import {
  resolveBundledServiceArtifactContentTypeExtensions,
  resolveBundledServiceArtifactDefaultTitle,
  resolveBundledServiceArtifactKindExtensions,
  resolveBundledServiceArtifactNameMimeTypes,
  resolveBundledServiceArtifactPayloadMarkerSet,
  resolveBundledServiceAppTokens,
  requireBundledServiceBaseUrl,
  requireBundledServiceCompatibleHosts,
  resolveBundledServiceDomSelector,
  resolveBundledServiceDomSelectorSet,
  resolveBundledServiceFeatureDetector,
  resolveBundledServiceFeatureFlagTokens,
  requireBundledServiceRouteTemplate,
  resolveBundledServiceUiLabel,
  resolveBundledServiceUiLabelSet,
} from '../../services/registry.js';

const CHATGPT_HOME_URL = requireBundledServiceBaseUrl('chatgpt');
const CHATGPT_PROJECT_DIALOG_ROOT_SELECTORS = resolveBundledServiceDomSelectorSet('chatgpt', 'project_dialog_roots', [
  '[data-testid="modal-new-project-enhanced"]',
  'dialog[open]',
  '[role="dialog"]',
  'dialog',
]);
const CHATGPT_PROJECT_DIALOG_SELECTOR = CHATGPT_PROJECT_DIALOG_ROOT_SELECTORS.join(', ');
const CHATGPT_PROJECT_NAME_INPUT_LABEL = resolveBundledServiceUiLabel('chatgpt', 'project_name_input', 'Project name');
const CHATGPT_PROJECT_NAME_INPUT_SELECTOR = [
  'input[name="projectName"]',
  `input[aria-label=${JSON.stringify(CHATGPT_PROJECT_NAME_INPUT_LABEL)}]`,
  '#project-name',
].join(', ');
const CHATGPT_PROJECT_INSTRUCTIONS_INPUT_LABEL = resolveBundledServiceUiLabel(
  'chatgpt',
  'project_instructions_input',
  'Instructions',
);
const CHATGPT_PROJECT_INSTRUCTIONS_SELECTOR = [
  `textarea[aria-label=${JSON.stringify(CHATGPT_PROJECT_INSTRUCTIONS_INPUT_LABEL)}]`,
  'textarea#instructions',
].join(', ');
const CHATGPT_PROJECT_SETTINGS_BUTTON_LABEL = resolveBundledServiceUiLabel('chatgpt', 'project_settings_button', 'Project settings');
const CHATGPT_PROJECT_SETTINGS_BUTTON_MATCH = normalizeUiText(CHATGPT_PROJECT_SETTINGS_BUTTON_LABEL).toLowerCase();
const CHATGPT_PROJECT_TITLE_EDIT_PREFIX = normalizeUiText(
  resolveBundledServiceUiLabel('chatgpt', 'project_title_edit_prefix', 'edit the title of'),
).toLowerCase();
const CHATGPT_PROJECT_MEMORY_GLOBAL_LABEL = resolveBundledServiceUiLabel('chatgpt', 'project_memory_global', 'Default');
const CHATGPT_PROJECT_MEMORY_PROJECT_LABEL = resolveBundledServiceUiLabel('chatgpt', 'project_memory_project', 'Project-only');
const CHATGPT_PROJECT_CONTROLS_DETAILS_LABEL = normalizeUiText(
  resolveBundledServiceUiLabel('chatgpt', 'project_controls_details', 'show project details'),
).toLowerCase();
const CHATGPT_PROJECT_TAB_CHATS_LABEL = normalizeUiText(
  resolveBundledServiceUiLabel('chatgpt', 'project_tab_chats', 'chats'),
).toLowerCase();
const CHATGPT_PROJECT_TAB_SOURCES_LABEL = normalizeUiText(
  resolveBundledServiceUiLabel('chatgpt', 'project_tab_sources', 'sources'),
).toLowerCase();
const CHATGPT_PROJECT_SOURCE_ADD_LABEL = normalizeUiText(
  resolveBundledServiceUiLabel('chatgpt', 'project_source_add', 'add sources'),
).toLowerCase();
const CHATGPT_PROJECT_SOURCE_ADD_FALLBACK_LABEL = normalizeUiText(
  resolveBundledServiceUiLabel('chatgpt', 'project_source_add_fallback', 'add'),
).toLowerCase();
const CHATGPT_PROJECT_SOURCE_ACTIONS_LABEL = resolveBundledServiceUiLabel(
  'chatgpt',
  'project_source_actions',
  'Source actions',
);
const CHATGPT_PROJECT_SOURCE_ACTIONS_SELECTOR = `button[aria-label=${JSON.stringify(CHATGPT_PROJECT_SOURCE_ACTIONS_LABEL)}]`;
const CHATGPT_PROJECT_SOURCE_ROW_SELECTOR = resolveBundledServiceDomSelector(
  'chatgpt',
  'project_source_row',
  'div[class*="group/file-row"]',
);
const CHATGPT_PROJECT_SOURCES_TAB_ID_SELECTOR = resolveBundledServiceDomSelector(
  'chatgpt',
  'project_sources_tab_id',
  '[role="tab"][id$="-sources"]',
);
const CHATGPT_PROJECT_UPLOAD_BUTTON_LABEL = normalizeUiText(
  resolveBundledServiceUiLabel('chatgpt', 'project_upload_button', 'upload'),
).toLowerCase();
const CHATGPT_PROJECT_DELETE_BUTTON_LABEL = normalizeUiText(
  resolveBundledServiceUiLabel('chatgpt', 'project_delete_button', 'delete project'),
).toLowerCase();
const CHATGPT_NEW_PROJECT_LABEL = normalizeUiText(
  resolveBundledServiceUiLabel('chatgpt', 'new_project', 'new project'),
).toLowerCase();
const CHATGPT_OPEN_SIDEBAR_LABEL = normalizeUiText(
  resolveBundledServiceUiLabel('chatgpt', 'open_sidebar', 'open sidebar'),
).toLowerCase();
const CHATGPT_CONVERSATION_PROMPT_INPUT_LABEL = resolveBundledServiceUiLabel(
  'chatgpt',
  'conversation_prompt_input',
  'Chat with ChatGPT',
);
const CHATGPT_CONVERSATION_PROMPT_INPUT_SELECTOR = `textarea[aria-label=${JSON.stringify(CHATGPT_CONVERSATION_PROMPT_INPUT_LABEL)}]`;
const CHATGPT_CONVERSATION_TURN_SECTION_SELECTOR = resolveBundledServiceDomSelector(
  'chatgpt',
  'conversation_turn_section',
  'section[data-testid^="conversation-turn-"]',
);
const CHATGPT_MESSAGE_AUTHOR_ROLE_SELECTOR = resolveBundledServiceDomSelector(
  'chatgpt',
  'message_author_role',
  '[data-message-author-role]',
);
const CHATGPT_USER_MESSAGE_AUTHOR_ROLE_SELECTOR = resolveBundledServiceDomSelector(
  'chatgpt',
  'user_message_author_role',
  '[data-message-author-role="user"]',
);
const CHATGPT_ASSISTANT_ARTIFACT_BUTTON_SELECTOR = resolveBundledServiceDomSelector(
  'chatgpt',
  'assistant_artifact_button',
  'button.behavior-btn',
);
const CHATGPT_TEXTDOC_MESSAGE_SELECTOR = resolveBundledServiceDomSelector(
  'chatgpt',
  'textdoc_message',
  'div[id^="textdoc-message-"]',
);
const CHATGPT_CONVERSATION_OPTIONS_BUTTON_SELECTOR = resolveBundledServiceDomSelector(
  'chatgpt',
  'conversation_options_button',
  'button[data-testid="conversation-options-button"]',
);
const CHATGPT_DELETE_CONVERSATION_CONFIRM_BUTTON_SELECTOR = resolveBundledServiceDomSelector(
  'chatgpt',
  'delete_conversation_confirm_button',
  'button[data-testid="delete-conversation-confirm-button"]',
);
const CHATGPT_CONVERSATION_OPTIONS_PREFIX = normalizeUiText(
  resolveBundledServiceUiLabel('chatgpt', 'conversation_options_prefix', 'open conversation options for'),
).toLowerCase();
const CHATGPT_CONVERSATION_ACTION_RENAME_LABEL = normalizeUiText(
  resolveBundledServiceUiLabel('chatgpt', 'conversation_action_rename', 'rename'),
).toLowerCase();
const CHATGPT_CONVERSATION_ACTION_DELETE_LABEL = normalizeUiText(
  resolveBundledServiceUiLabel('chatgpt', 'conversation_action_delete', 'delete'),
).toLowerCase();
const CHATGPT_PROJECT_SOURCE_ACTION_REMOVE_LABEL = normalizeUiText(
  resolveBundledServiceUiLabel('chatgpt', 'project_source_action_remove', 'remove'),
).toLowerCase();
const CHATGPT_DIALOG_CANCEL_LABEL = normalizeUiText(
  resolveBundledServiceUiLabel('chatgpt', 'dialog_cancel', 'cancel'),
).toLowerCase();
const CHATGPT_CONVERSATION_DELETE_DIALOG_LABEL = normalizeUiText(
  resolveBundledServiceUiLabel('chatgpt', 'conversation_delete_dialog', 'delete chat?'),
).toLowerCase();
const CHATGPT_PROJECT_DELETE_DIALOG_LABEL = normalizeUiText(
  resolveBundledServiceUiLabel('chatgpt', 'project_delete_dialog', 'delete project?'),
).toLowerCase();
const CHATGPT_DIALOG_DISMISS_LABELS = resolveBundledServiceUiLabelSet('chatgpt', 'dialog_dismiss_buttons', [
  'ok',
  'okay',
  'got it',
  'dismiss',
  'close',
  'cancel',
  'done',
]).map((label) => normalizeUiText(label).toLowerCase()).filter(Boolean);
const CHATGPT_DELETE_CONFIRMATION_BUTTON_LABELS = resolveBundledServiceUiLabelSet(
  'chatgpt',
  'delete_confirmation_buttons',
  ['delete', 'cancel'],
).map((label) => normalizeUiText(label).toLowerCase()).filter(Boolean);
const CHATGPT_PROJECT_SOURCE_ADD_BUTTON_LABELS = resolveBundledServiceUiLabelSet(
  'chatgpt',
  'project_source_add_buttons',
  ['add sources', 'add'],
).map((label) => normalizeUiText(label).toLowerCase()).filter(Boolean);
const CHATGPT_PROJECT_SETTINGS_COMMIT_BUTTON_LABELS = resolveBundledServiceUiLabelSet(
  'chatgpt',
  'project_settings_commit_buttons',
  ['save', 'save changes', 'done', 'apply'],
).map((label) => normalizeUiText(label).toLowerCase()).filter(Boolean);
const CHATGPT_PROJECT_SOURCE_UPLOAD_ACTION_LABELS = resolveBundledServiceUiLabelSet(
  'chatgpt',
  'project_source_upload_actions',
  ['upload', 'browse', 'upload file'],
).map((label) => normalizeUiText(label).toLowerCase()).filter(Boolean);
const CHATGPT_PROJECT_SOURCE_UPLOAD_MARKERS = resolveBundledServiceUiLabelSet(
  'chatgpt',
  'project_source_upload_markers',
  ['add sources', 'drag sources here'],
).map((label) => normalizeUiText(label).toLowerCase()).filter(Boolean);
const CHATGPT_COMPATIBLE_HOSTS = requireBundledServiceCompatibleHosts('chatgpt');
const CHATGPT_PROJECT_URL_TEMPLATE = requireBundledServiceRouteTemplate('chatgpt', 'project');
const CHATGPT_PROJECT_SOURCES_URL_TEMPLATE = requireBundledServiceRouteTemplate('chatgpt', 'projectSources');
const CHATGPT_CONVERSATION_URL_TEMPLATE = requireBundledServiceRouteTemplate('chatgpt', 'conversation');
const CHATGPT_PROJECT_CONVERSATION_URL_TEMPLATE = requireBundledServiceRouteTemplate('chatgpt', 'projectConversation');
const CHATGPT_CONVERSATION_API_URL_TEMPLATE = requireBundledServiceRouteTemplate('chatgpt', 'conversationApi');
const CHATGPT_FEATURE_DETECTOR = resolveBundledServiceFeatureDetector('chatgpt', 'chatgpt-feature-probe-v1');
const CHATGPT_FEATURE_FLAG_TOKENS = resolveBundledServiceFeatureFlagTokens('chatgpt', {
  web_search: ['search the web', 'web search'],
  deep_research: ['deep research'],
  company_knowledge: ['company knowledge'],
});
const CHATGPT_APP_TOKENS = resolveBundledServiceAppTokens('chatgpt', {
  'google drive': ['google drive', 'drive'],
  gmail: ['gmail'],
  'google calendar': ['google calendar', 'calendar'],
  slack: ['slack'],
  github: ['github'],
  dropbox: ['dropbox'],
  notion: ['notion'],
  jira: ['jira'],
  linear: ['linear'],
  asana: ['asana'],
  box: ['box'],
  onedrive: ['onedrive'],
  sharepoint: ['sharepoint'],
  'microsoft teams': ['microsoft teams', 'teams'],
  hubspot: ['hubspot'],
  zapier: ['zapier'],
});
const CHATGPT_ARTIFACT_KIND_EXTENSIONS = resolveBundledServiceArtifactKindExtensions('chatgpt', {
  spreadsheet: ['csv', 'tsv', 'xls', 'xlsx', 'ods'],
});
const CHATGPT_ARTIFACT_CONTENT_TYPE_EXTENSIONS = resolveBundledServiceArtifactContentTypeExtensions('chatgpt', {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'application/zip': '.zip',
  'application/json': '.json',
  'text/markdown': '.md',
  'text/csv': '.csv',
  'text/tab-separated-values': '.tsv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.ms-excel': '.xls',
  'text/plain': '.txt',
});
const CHATGPT_ARTIFACT_NAME_MIME_TYPES = resolveBundledServiceArtifactNameMimeTypes('chatgpt', {
  '.zip': 'application/zip',
  '.json': 'application/json',
  '.md': 'text/markdown',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.tsv': 'text/tab-separated-values',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls': 'application/vnd.ms-excel',
});
const CHATGPT_ARTIFACT_DEFAULT_IMAGE_TITLE = resolveBundledServiceArtifactDefaultTitle(
  'chatgpt',
  'image',
  'Generated image',
);
const CHATGPT_ARTIFACT_DEFAULT_SPREADSHEET_TITLE = resolveBundledServiceArtifactDefaultTitle(
  'chatgpt',
  'spreadsheet',
  'Spreadsheet artifact',
);
const CHATGPT_ARTIFACT_DEFAULT_CANVAS_TITLE = resolveBundledServiceArtifactDefaultTitle(
  'chatgpt',
  'canvas',
  'Canvas artifact',
);
const CHATGPT_ARTIFACT_IMAGE_CONTENT_TYPES = new Set(
  resolveBundledServiceArtifactPayloadMarkerSet('chatgpt', 'image_content_types', ['image_asset_pointer']).map((value) =>
    value.trim().toLowerCase(),
  ),
);
const CHATGPT_ARTIFACT_SPREADSHEET_VISUALIZATION_TYPES = new Set(
  resolveBundledServiceArtifactPayloadMarkerSet('chatgpt', 'spreadsheet_visualization_types', ['table']).map((value) =>
    value.trim().toLowerCase(),
  ),
);
const CHATGPT_PROJECT_SOURCES_INPUT_ATTR = 'data-auracall-chatgpt-project-source-input';
const CHATGPT_PROJECT_SETTINGS_DIALOG_ATTR = 'data-auracall-chatgpt-project-settings-dialog';
const CHATGPT_PROJECT_SOURCE_ACTION_ATTR = 'data-auracall-chatgpt-project-source-action';
const CHATGPT_CONVERSATION_ROW_ATTR = 'data-auracall-chatgpt-conversation-row';
const CHATGPT_CONVERSATION_ACTION_ATTR = 'data-auracall-chatgpt-conversation-action';
const CHATGPT_DOWNLOAD_BUTTON_ATTR = 'data-auracall-chatgpt-download-button';
const CHATGPT_DOWNLOAD_CAPTURE_STATE_KEY = '__auracallChatgptDownloadCapture';
const CHATGPT_RATE_LIMIT_RECOVERY_PAUSE_MS = 15_000;
const CHATGPT_HOME_LOCATION = new URL(CHATGPT_HOME_URL);

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

type ChatgptConversationRowTagCandidateProbe = {
  inProjectPanel?: boolean | null;
  hasConversationAnchor?: boolean | null;
  buttonCount?: number | null;
  score?: number | null;
  rowText?: string | null;
  buttonLabel?: string | null;
  hasProjectIdMatch?: boolean | null;
};

type ChatgptConversationRowTagDiagnostics = {
  attempts?: number | null;
  expectedConversationId?: string | null;
  expectedProjectId?: string | null;
  totalConversationAnchors?: number | null;
  visibleConversationAnchors?: number | null;
  candidateCount?: number | null;
  scopedCandidateCount?: number | null;
  fallbackUsed?: boolean | null;
  reason?: string | null;
  bestCandidate?: ChatgptConversationRowTagCandidateProbe | null;
};

type ChatgptConversationRowTagEvaluation = {
  ok?: boolean;
  rowSelector?: string;
  actionSelector?: string;
  reason?: string;
  diagnostics?: ChatgptConversationRowTagDiagnostics | null;
};

type ChatgptConversationRowTagAttemptFailure = {
  attemptLabel: string;
  error?: string;
  diagnostics?: ChatgptConversationRowTagDiagnostics | null;
};

type ChatgptBlockingSurfaceKind =
  | 'rate-limit'
  | 'connection-failed'
  | 'transient-error'
  | 'retry-affordance';

type ChatgptBlockingSurfaceProbe = {
  text?: string | null;
  ariaLabel?: string | null;
  buttonLabels?: string[] | null;
  role?: string | null;
};

type ChatgptBlockingSurfaceMatch = {
  kind: ChatgptBlockingSurfaceKind;
  summary: string;
  selector?: string | null;
  details?: Record<string, unknown> | null;
};

type ChatgptRecoveryDebugContext = {
  enabled: boolean;
  context: string;
  metadata?: Record<string, unknown>;
};

type ChatgptRecoveryActionResult = {
  action: 'dismiss-overlay' | 'close-dialog' | 'reload-page' | 'reopen-conversation' | 'reopen-list';
  outcome: 'attempted' | 'failed';
  summary: string | null;
};

function summarizeChatgptConversationRowTagFailure(
  conversationId: string,
  failures: ReadonlyArray<ChatgptConversationRowTagAttemptFailure>,
): string {
  if (failures.length === 0) {
    return `ChatGPT conversation row not found for ${conversationId}`;
  }
  const lines = failures
    .map((entry, index) => {
      const diagnostics = entry.diagnostics
        ? {
            totalConversationAnchors: entry.diagnostics.totalConversationAnchors ?? null,
            visibleConversationAnchors: entry.diagnostics.visibleConversationAnchors ?? null,
            candidateCount: entry.diagnostics.candidateCount ?? null,
            scopedCandidateCount: entry.diagnostics.scopedCandidateCount ?? null,
            bestCandidate: entry.diagnostics.bestCandidate ?? null,
            fallbackUsed: entry.diagnostics.fallbackUsed ?? null,
            reason: entry.diagnostics.reason ?? null,
          }
        : null;
      return `${index + 1}/${failures.length} ${entry.attemptLabel}: ${entry.error || 'failed'}${
        diagnostics ? ` (${JSON.stringify(diagnostics)})` : ''
      }`;
    })
    .join(' | ');
  return `ChatGPT conversation row not found for ${conversationId}: ${lines}`;
}

function summarizeChatgptBlockingSurfaceText(value: string): string {
  const normalized = normalizeUiText(value);
  if (!normalized) {
    return 'Unknown ChatGPT blocking surface';
  }
  const sentence = normalized.split(/(?<=[.!?])\s+/)[0] || normalized;
  return sentence.slice(0, 160);
}

export function classifyChatgptBlockingSurfaceProbe(
  probe: ChatgptBlockingSurfaceProbe | null | undefined,
): Pick<ChatgptBlockingSurfaceMatch, 'kind' | 'summary'> | null {
  if (!probe || typeof probe !== 'object') {
    return null;
  }
  const text = normalizeUiText(probe.text);
  const ariaLabel = normalizeUiText(probe.ariaLabel);
  const buttonLabels = (probe.buttonLabels ?? []).map((value) => normalizeFileKey(value)).filter(Boolean);
  const combined = [text, ariaLabel, ...buttonLabels].filter(Boolean).join(' ').trim();
  if (!combined) {
    return null;
  }
  if (isChatgptRateLimitMessage(combined)) {
    return {
      kind: 'rate-limit',
      summary: extractChatgptRateLimitSummary(combined) ?? summarizeChatgptBlockingSurfaceText(combined),
    };
  }
  const retryAffordance = buttonLabels.find((label) =>
    /^(retry|try again|regenerate|regenerate response|continue generating)$/.test(label),
  );
  if (retryAffordance) {
    return {
      kind: 'retry-affordance',
      summary: retryAffordance,
    };
  }
  if (/server connection failed|connection failed|connection lost|network error|failed to connect|unable to connect/i.test(combined)) {
    return {
      kind: 'connection-failed',
      summary: summarizeChatgptBlockingSurfaceText(combined),
    };
  }
  if (/something went wrong|an error occurred|message could not be generated|please try again|failed to /i.test(combined)) {
    return {
      kind: 'transient-error',
      summary: summarizeChatgptBlockingSurfaceText(combined),
    };
  }
  return null;
}

export function isRetryableChatgptTransientMessage(message: string | null | undefined): boolean {
  const match = classifyChatgptBlockingSurfaceProbe({ text: message ?? '' });
  return Boolean(match);
}

function readChatgptConversationRowTagDiagnostics(
  error: unknown,
): ChatgptConversationRowTagDiagnostics | null {
  if (!error || typeof error !== 'object') {
    return null;
  }
  const maybe = error as { diagnostics?: ChatgptConversationRowTagDiagnostics | null; cause?: unknown };
  if (maybe.diagnostics && typeof maybe.diagnostics === 'object') {
    return maybe.diagnostics;
  }
  const cause = maybe.cause as
    | { diagnostics?: ChatgptConversationRowTagDiagnostics | null; ok?: boolean }
    | undefined;
  if (cause?.diagnostics && typeof cause.diagnostics === 'object') {
    return cause.diagnostics;
  }
  return null;
}

type ChatgptConversationCanvasProbe = {
  textdocId?: string | null;
  title?: string | null;
  contentText?: string | null;
};

type ChatgptImageArtifactProbe = {
  src?: string | null;
  alt?: string | null;
};

type ChatgptDeleteConfirmationProbe = {
  dialogText?: string | null;
  buttonLabels?: string[] | null;
  hasVisibleConfirmButton?: boolean | null;
};

type ChatgptProjectDeleteConfirmationProbe = {
  dialogText?: string | null;
  buttonLabels?: string[] | null;
};

type ChatgptConversationTitleProbe = {
  matchedConversationId?: string | null;
  matchedProjectId?: string | null;
  matchedTitle?: string | null;
  routeConversationId?: string | null;
  routeProjectId?: string | null;
  documentTitle?: string | null;
  topConversationId?: string | null;
  topTitle?: string | null;
};

type ChatgptRenameEditorProbe = {
  inputName?: string | null;
  value?: string | null;
  active?: boolean | null;
};

type ChatgptConversationPayloadResponse = {
  ok?: boolean | null;
  status?: number | null;
  body?: string | null;
  error?: string | null;
};

type ChatgptProjectSettingsSnapshot = {
  name: string;
  text: string;
  memoryModeLabel?: string | null;
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

type ChatgptFeatureProbe = {
  detector?: string | null;
  web_search?: boolean | null;
  deep_research?: boolean | null;
  company_knowledge?: boolean | null;
  apps?: string[] | null;
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

function interpolateChatgptRoute(template: string, params: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => params[key] ?? '');
}

export function resolveChatgptProjectUrl(projectId: string): string {
  return interpolateChatgptRoute(CHATGPT_PROJECT_URL_TEMPLATE, { projectId });
}

export function resolveChatgptProjectSourcesUrl(projectId: string): string {
  return interpolateChatgptRoute(CHATGPT_PROJECT_SOURCES_URL_TEMPLATE, { projectId });
}

function resolveChatgptConversationApiUrl(conversationId: string): string {
  return interpolateChatgptRoute(CHATGPT_CONVERSATION_API_URL_TEMPLATE, { conversationId });
}

async function readVisibleChatgptBlockingSurfaceMatchWithClient(
  client: ChromeClient,
): Promise<ChatgptBlockingSurfaceMatch | null> {
  const overlays = await collectVisibleOverlayInventory(client.Runtime, {
    overlaySelectors: [...Array.from(DEFAULT_DIALOG_SELECTORS), '[role="alert"]', '[aria-live]'],
    limit: 8,
  });
  for (const overlay of overlays) {
    const match = classifyChatgptBlockingSurfaceProbe({
      text: overlay.text,
      ariaLabel: overlay.ariaLabel,
      buttonLabels: overlay.buttonLabels,
      role: overlay.role,
    });
    if (!match) continue;
    return {
      ...match,
      selector: overlay.selector,
      details: {
        sourceSelector: overlay.sourceSelector,
        role: overlay.role,
        ariaLabel: overlay.ariaLabel,
      },
    };
  }
  const { result } = await client.Runtime.evaluate({
    expression: `(() => {
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
      const isVisible = (node) => {
        if (!(node instanceof Element)) return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const labels = ['retry', 'try again', 'regenerate', 'regenerate response', 'continue generating'];
      for (const node of Array.from(document.querySelectorAll('button, [role="button"]'))) {
        if (!(node instanceof HTMLElement) || !isVisible(node)) continue;
        const label = normalize(node.getAttribute('aria-label') || node.textContent || '');
        if (!labels.includes(label)) continue;
        const scope =
          node.closest(${JSON.stringify(CHATGPT_CONVERSATION_TURN_SECTION_SELECTOR)}) ||
          node.closest(${JSON.stringify(CHATGPT_MESSAGE_AUTHOR_ROLE_SELECTOR)}) ||
          node.parentElement;
        return {
          label,
          text: normalize(scope?.textContent || node.textContent || ''),
        };
      }
      return null;
    })()`,
    returnByValue: true,
  });
  const retryProbe = result?.value as { label?: string | null; text?: string | null } | null | undefined;
  const retryMatch = classifyChatgptBlockingSurfaceProbe({
    text: retryProbe?.text ?? null,
    buttonLabels: retryProbe?.label ? [retryProbe.label] : [],
  });
  if (retryMatch) {
    return {
      ...retryMatch,
      selector: null,
      details: {
        sourceSelector: 'button',
        buttonLabel: retryProbe?.label ?? null,
      },
    };
  }
  return null;
}

async function recoverVisibleChatgptBlockingSurfaceWithClient(
  client: ChromeClient,
  match?: ChatgptBlockingSurfaceMatch | null,
): Promise<ChatgptRecoveryActionResult | null> {
  const resolved = match ?? (await readVisibleChatgptBlockingSurfaceMatchWithClient(client));
  if (!resolved) {
    return null;
  }
  if (resolved.kind !== 'rate-limit') {
    try {
      await client.Page.reload({ ignoreCache: true }).catch(async () => {
        await client.Runtime.evaluate({
          expression: 'location.reload()',
          awaitPromise: false,
        }).catch(() => undefined);
      });
      return {
        action: 'reload-page',
        outcome: 'attempted',
        summary: resolved.summary,
      };
    } catch {
      return {
        action: 'reload-page',
        outcome: 'failed',
        summary: resolved.summary,
      };
    }
  }
  if (resolved.selector) {
    try {
      await dismissOverlayRoot(client.Runtime, resolved.selector, {
        closeButtonMatch: {
          includeAny: [...CHATGPT_DIALOG_DISMISS_LABELS],
        },
        timeoutMs: 3_000,
      }).catch(() => undefined);
      return {
        action: 'dismiss-overlay',
        outcome: 'attempted',
        summary: resolved.summary,
      };
    } catch {
      return {
        action: 'dismiss-overlay',
        outcome: 'failed',
        summary: resolved.summary,
      };
    }
  } else {
    try {
      await closeDialog(client.Runtime, DEFAULT_DIALOG_SELECTORS).catch(() => undefined);
      return {
        action: 'close-dialog',
        outcome: 'attempted',
        summary: resolved.summary,
      };
    } catch {
      return {
        action: 'close-dialog',
        outcome: 'failed',
        summary: resolved.summary,
      };
    }
  }
}

async function withChatgptBlockingSurfaceRecovery<T>(
  client: ChromeClient,
  action: string,
  fn: () => Promise<T>,
  options?: {
    pauseMs?: number;
    retries?: number;
    debugContext?: ChatgptRecoveryDebugContext;
    reopen?: () => Promise<ChatgptRecoveryActionResult | null>;
  },
): Promise<T> {
  const debugContext = options?.debugContext;
  let lastRecoveryActions: ChatgptRecoveryActionResult[] = [];
  const persistDebugRecord = async (
    phase: 'pre' | 'post' | 'error' | 'final-error',
    match: ChatgptBlockingSurfaceMatch | null,
    extra?: Record<string, unknown>,
  ): Promise<void> => {
    if (!debugContext?.enabled) {
      return;
    }
    const snapshot = await captureBrowserPostmortemSnapshot(client.Runtime).catch(() => null);
    await persistBrowserPostmortemRecord({
      context: `${debugContext.context}-${phase}`,
      payload: {
        provider: 'chatgpt',
        action,
        phase,
        match: match
          ? {
              kind: match.kind,
              summary: match.summary,
              selector: match.selector ?? null,
              details: match.details ?? null,
            }
          : null,
        recovery: lastRecoveryActions.map((entry) => ({
          action: entry.action,
          outcome: entry.outcome,
          summary: entry.summary,
        })),
        snapshot,
        ...(debugContext.metadata ?? {}),
        ...(extra ?? {}),
      },
    }).catch(() => undefined);
  };
  const runRecoverySequence = async (match: ChatgptBlockingSurfaceMatch): Promise<void> => {
    lastRecoveryActions = [];
    const primary = await recoverVisibleChatgptBlockingSurfaceWithClient(client, match);
    if (primary) {
      lastRecoveryActions.push(primary);
    }
    if (options?.reopen) {
      const reopen = await options.reopen().catch(() => ({
        action: (match.kind === 'rate-limit' ? 'reopen-list' : 'reopen-conversation') as ChatgptRecoveryActionResult['action'],
        outcome: 'failed' as const,
        summary: match.summary,
      }));
      if (reopen) {
        lastRecoveryActions.push(reopen);
      }
    }
  };
  try {
    return await withBlockingSurfaceRecovery(fn, {
      label: action,
      pauseMs: options?.pauseMs ?? CHATGPT_RATE_LIMIT_RECOVERY_PAUSE_MS,
      retries: options?.retries ?? 1,
      inspect: () => readVisibleChatgptBlockingSurfaceMatchWithClient(client),
      dismiss: async (match) => runRecoverySequence(match),
      classifyError: (error) => {
        const directMessage = error instanceof Error ? error.message : String(error);
        const match = classifyChatgptBlockingSurfaceProbe({ text: directMessage });
        return match ? { ...match, selector: null } : null;
      },
      onRecover: ({ match, phase, attempt }) => persistDebugRecord(phase, match, { attempt }),
    });
  } catch (error) {
    const blockingSurface =
      error && typeof error === 'object' && 'blockingSurface' in error
        ? ((error as { blockingSurface?: ChatgptBlockingSurfaceMatch | null }).blockingSurface ?? null)
        : null;
    await persistDebugRecord('final-error', blockingSurface, {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

function resolveChatgptRecoveryDebugContext(
  options: BrowserProviderListOptions | undefined,
  context: string,
  metadata?: Record<string, unknown>,
): ChatgptRecoveryDebugContext | undefined {
  const enabled =
    options?.browserService?.getConfig().debug === true || process.env.CHATGPT_DEVTOOLS_TRACE === '1';
  if (!enabled) {
    return undefined;
  }
  return {
    enabled: true,
    context,
    metadata,
  };
}

function buildChatgptConversationReopen(
  client: ChromeClient,
  conversationId: string,
  projectId?: string | null,
): () => Promise<ChatgptRecoveryActionResult> {
  return async () => {
    try {
      await navigateToChatgptConversation(client, conversationId, projectId);
      return {
        action: 'reopen-conversation',
        outcome: 'attempted',
        summary: conversationId,
      };
    } catch {
      return {
        action: 'reopen-conversation',
        outcome: 'failed',
        summary: conversationId,
      };
    }
  };
}

function buildChatgptListReopen(
  client: ChromeClient,
  projectId?: string | null,
): () => Promise<ChatgptRecoveryActionResult> {
  return async () => {
    try {
      await navigateToChatgptUrl(client, resolveChatgptConversationListUrl(projectId), normalizeChatgptProjectId(projectId) ?? undefined);
      return {
        action: 'reopen-list',
        outcome: 'attempted',
        summary: normalizeChatgptProjectId(projectId) ?? 'root',
      };
    } catch {
      return {
        action: 'reopen-list',
        outcome: 'failed',
        summary: normalizeChatgptProjectId(projectId) ?? 'root',
      };
    }
  };
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

function normalizeChatgptConversationTitle(value: string | null | undefined): string {
  return normalizeUiText(value).toLowerCase();
}

function normalizeChatgptDocumentTitle(value: string | null | undefined): string {
  return normalizeUiText(value)
    .replace(/^chatgpt\s*[-:|]\s*/i, '')
    .replace(/\s*[-:|]\s*chatgpt$/i, '')
    .trim()
    .toLowerCase();
}

export function matchesChatgptDeleteConfirmationProbe(
  probe: ChatgptDeleteConfirmationProbe | null | undefined,
  expectedTitle?: string | null,
): boolean {
  if (!probe) {
    return false;
  }
  const text = normalizeUiText(probe.dialogText).toLowerCase();
  if (!text.includes(CHATGPT_CONVERSATION_DELETE_DIALOG_LABEL)) {
    return false;
  }
  const labels = Array.isArray(probe.buttonLabels)
    ? probe.buttonLabels.map((label) => normalizeUiText(label).toLowerCase()).filter(Boolean)
    : [];
  if (!CHATGPT_DELETE_CONFIRMATION_BUTTON_LABELS.every((label) => labels.includes(label))) {
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

export function matchesChatgptProjectDeleteConfirmationProbe(
  probe: ChatgptProjectDeleteConfirmationProbe | null | undefined,
): boolean {
  if (!probe) {
    return false;
  }
  const text = normalizeUiText(probe.dialogText).toLowerCase();
  if (!text.includes(CHATGPT_PROJECT_DELETE_DIALOG_LABEL)) {
    return false;
  }
  const labels = Array.isArray(probe.buttonLabels)
    ? probe.buttonLabels.map((label) => normalizeUiText(label).toLowerCase()).filter(Boolean)
    : [];
  return CHATGPT_DELETE_CONFIRMATION_BUTTON_LABELS.every((label) => labels.includes(label));
}

export function matchesChatgptConversationTitleProbe(
  probe: ChatgptConversationTitleProbe | null | undefined,
  expectedConversationId: string,
  expectedTitle: string,
  projectId?: string | null,
  options?: {
    requireTopForRootMatch?: boolean;
  },
): boolean {
  if (!probe) {
    return false;
  }
  const expected = normalizeChatgptConversationTitle(expectedTitle);
  if (!expected) {
    return false;
  }
  const normalizedExpectedConversationId = normalizeChatgptConversationId(expectedConversationId);
  if (!normalizedExpectedConversationId) {
    return false;
  }
  const normalizedExpectedProjectId = normalizeChatgptProjectId(projectId ?? null);
  const matchedConversationId = normalizeChatgptConversationId(probe.matchedConversationId);
  const matchedProjectId = normalizeChatgptProjectId(probe.matchedProjectId ?? null);
  const matchedTitle = normalizeChatgptConversationTitle(probe.matchedTitle);
  const requireTopForRootMatch = Boolean(options?.requireTopForRootMatch);
  const topConversationId = normalizeChatgptConversationId(probe.topConversationId);
  const topTitle = normalizeChatgptConversationTitle(probe.topTitle);
  const rootTopMatches = topConversationId === normalizedExpectedConversationId && topTitle === expected;
  if (
    matchedConversationId === normalizedExpectedConversationId &&
    matchedTitle === expected &&
    (!normalizedExpectedProjectId || matchedProjectId === normalizedExpectedProjectId)
  ) {
    if (requireTopForRootMatch && !normalizedExpectedProjectId && topConversationId && !rootTopMatches) {
      return false;
    }
    return true;
  }
  if (normalizedExpectedProjectId) {
    return false;
  }
  const routeConversationId = normalizeChatgptConversationId(probe.routeConversationId);
  const routeProjectId = normalizeChatgptProjectId(probe.routeProjectId ?? null);
  if (routeConversationId !== normalizedExpectedConversationId || routeProjectId) {
    return false;
  }
  if (requireTopForRootMatch && topConversationId && !rootTopMatches) {
    return false;
  }
  return normalizeChatgptDocumentTitle(probe.documentTitle) === expected;
}

export function matchesChatgptRenameEditorProbe(
  probe: ChatgptRenameEditorProbe | null | undefined,
): boolean {
  if (!probe) {
    return false;
  }
  return normalizeUiText(probe.inputName).toLowerCase() === 'title-editor';
}

export function matchesChatgptProjectSettingsSnapshot(
  snapshot: ChatgptProjectSettingsSnapshot | null | undefined,
  expected: { name?: string; instructions?: string },
): boolean {
  if (!snapshot) {
    return false;
  }
  if (typeof expected.name === 'string' && normalizeUiText(snapshot.name) !== normalizeUiText(expected.name)) {
    return false;
  }
  if (
    typeof expected.instructions === 'string' &&
    normalizeInstructionComparisonText(snapshot.text) !== normalizeInstructionComparisonText(expected.instructions)
  ) {
    return false;
  }
  return true;
}

export function matchesChatgptImageArtifactProbe(
  probe: ChatgptImageArtifactProbe | null | undefined,
  artifact: Pick<ConversationArtifact, 'title' | 'uri'>,
): boolean {
  if (!probe) {
    return false;
  }
  const src = normalizeUiText(probe.src);
  const alt = normalizeUiText(probe.alt).toLowerCase();
  if (!src) {
    return false;
  }
  const fileId = extractChatgptArtifactFileId(artifact.uri);
  if (fileId && src.includes(`id=${fileId}`)) {
    return true;
  }
  if (fileId) {
    return false;
  }
  const expectedTitle = normalizeUiText(artifact.title).toLowerCase();
  return Boolean(expectedTitle) && alt.includes(expectedTitle);
}

export function matchesChatgptDownloadButtonProbe(
  probe: ChatgptConversationDownloadButtonProbe | null | undefined,
  artifact: Pick<ConversationArtifact, 'title' | 'messageId' | 'messageIndex' | 'metadata'>,
): boolean {
  if (!probe) {
    return false;
  }
  const expectedTitle = normalizeUiText(artifact.title).toLowerCase();
  const probeTitle = normalizeUiText(probe.title).toLowerCase();
  if (!probeTitle) {
    return false;
  }
  if (expectedTitle && probeTitle !== expectedTitle) {
    return false;
  }
  const expectedTurnId =
    artifact.metadata && typeof artifact.metadata.turnId === 'string'
      ? normalizeUiText(artifact.metadata.turnId)
      : '';
  const expectedMessageId = normalizeUiText(artifact.messageId);
  const expectedMessageIndex =
    typeof artifact.messageIndex === 'number' && Number.isFinite(artifact.messageIndex)
      ? artifact.messageIndex
      : null;
  const expectedButtonIndex =
    artifact.metadata &&
    typeof artifact.metadata.buttonIndex === 'number' &&
    Number.isFinite(artifact.metadata.buttonIndex)
      ? artifact.metadata.buttonIndex
      : null;
  const probeTurnId = normalizeUiText(probe.turnId);
  const probeMessageId = normalizeUiText(probe.messageId);
  if (expectedTurnId && probeTurnId !== expectedTurnId) {
    return false;
  }
  if (!expectedTurnId && expectedMessageId && probeMessageId !== expectedMessageId && probeTurnId !== expectedMessageId) {
    return false;
  }
  if (!expectedTurnId && !expectedMessageId && expectedMessageIndex !== null && probe.messageIndex !== expectedMessageIndex) {
    return false;
  }
  if (expectedButtonIndex !== null && probe.buttonIndex !== expectedButtonIndex) {
    return false;
  }
  return true;
}

function isRetryableConnectionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('WebSocket connection closed') ||
    message.includes('ECONNRESET') ||
    isRetryableChatgptTransientMessage(message)
  );
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

export function resolveChatgptProjectMemoryLabel(mode: ProjectMemoryMode): string {
  return mode === 'project' ? CHATGPT_PROJECT_MEMORY_PROJECT_LABEL : CHATGPT_PROJECT_MEMORY_GLOBAL_LABEL;
}

export function resolveChatgptProjectSettingsCommitLabelsForTest(): string[] {
  return [...CHATGPT_PROJECT_SETTINGS_COMMIT_BUTTON_LABELS];
}

export function resolveChatgptProjectSourceUploadActionLabelsForTest(): string[] {
  return [...CHATGPT_PROJECT_SOURCE_UPLOAD_ACTION_LABELS];
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
  for (const [kind, extensions] of Object.entries(CHATGPT_ARTIFACT_KIND_EXTENSIONS)) {
    if (
      extensions.some((extension) => {
        const normalized = String(extension ?? '').trim().replace(/^\./, '').toLowerCase();
        return normalized.length > 0 && new RegExp(`\\.${normalized}\\b`).test(value);
      })
    ) {
      return kind as ConversationArtifact['kind'];
    }
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
  for (const [token, extension] of Object.entries(CHATGPT_ARTIFACT_CONTENT_TYPE_EXTENSIONS)) {
    if (normalized.includes(token.toLowerCase())) {
      return extension;
    }
  }
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
  for (const [extension, mimeType] of Object.entries(CHATGPT_ARTIFACT_NAME_MIME_TYPES)) {
    if (normalized.endsWith(extension.toLowerCase())) {
      return mimeType;
    }
  }
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
  const resolveContentText = (artifact: ConversationArtifact): string => {
    const existingContent =
      artifact.metadata && typeof artifact.metadata.contentText === 'string'
        ? artifact.metadata.contentText.trim()
        : '';
    if (existingContent) return existingContent;
    const textdocId =
      artifact.metadata && typeof artifact.metadata.textdocId === 'string'
        ? artifact.metadata.textdocId.trim()
        : '';
    const match =
      (textdocId ? byTextdocId.get(textdocId) : null) ??
      byTitle.get(normalizeUiText(artifact.title).toLowerCase()) ??
      null;
    return typeof match?.contentText === 'string' ? match.contentText.trim() : '';
  };
  return artifacts.map((artifact) => {
    if (artifact.kind !== 'canvas') return artifact;
    const contentText = resolveContentText(artifact);
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

export function resolveChatgptCanvasArtifactContentText(
  artifact: ConversationArtifact,
  probes: ReadonlyArray<ChatgptConversationCanvasProbe>,
): string {
  const enriched = mergeChatgptCanvasArtifactContent([artifact], probes)[0];
  return enriched?.metadata && typeof enriched.metadata.contentText === 'string'
    ? enriched.metadata.contentText.trim()
    : '';
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
      const normalizedContentType = String(contentType ?? '').trim().toLowerCase();
      if (!CHATGPT_ARTIFACT_IMAGE_CONTENT_TYPES.has(normalizedContentType)) {
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
          CHATGPT_ARTIFACT_DEFAULT_IMAGE_TITLE,
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
      const normalizedVisualizationType = String(visualizationType ?? '').trim().toLowerCase();
      if (!CHATGPT_ARTIFACT_SPREADSHEET_VISUALIZATION_TYPES.has(normalizedVisualizationType)) {
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
          CHATGPT_ARTIFACT_DEFAULT_SPREADSHEET_TITLE,
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
    const title = readStringField(canvas, 'title') ?? metadataTitle ?? CHATGPT_ARTIFACT_DEFAULT_CANVAS_TITLE;
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

  const targetUrl = resolveChatgptConversationApiUrl(conversationId);
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
  const isGenericTitle = (value: string): boolean => {
    const normalized = normalizeUiText(value).toLowerCase();
    return normalized === 'chatgpt' || normalized === 'new chat';
  };
  const conversations = new Map<string, Conversation>();
  for (const probe of probes) {
    const id = typeof probe.id === 'string' ? probe.id.trim() : '';
    if (!id) continue;
    const probeTitle = normalizeUiText(probe.title);
    const title = probeTitle && !isGenericTitle(probeTitle) ? probeTitle : id;
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
        : isGenericTitle(previousTitle) && nextTitle.length > 0 && !isGenericTitle(nextTitle)
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
      document.querySelector(${JSON.stringify(CHATGPT_CONVERSATION_TURN_SECTION_SELECTOR)}) ||
      document.querySelector(${JSON.stringify(CHATGPT_MESSAGE_AUTHOR_ROLE_SELECTOR)}),
    );
    const hasComposer = Boolean(
      document.querySelector(${JSON.stringify(CHATGPT_CONVERSATION_PROMPT_INPUT_SELECTOR)}) ||
      document.querySelector('[data-testid="composer-plus-btn"]'),
    );
    return hasTurns || hasComposer ? route : null;
  })()`;
}

function buildConversationTitleAppliedExpression(
  conversationId: string,
  expectedTitle: string,
  projectId?: string | null,
  options?: {
    requireTopInRootList?: boolean;
  },
): string {
  return `(() => {
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
    const normalizeDocumentTitle = (value) =>
      normalize(value)
        .replace(/^chatgpt\\s*[-:|]\\s*/i, '')
        .replace(/\\s*[-:|]\\s*chatgpt$/i, '')
        .trim();
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
            return label.startsWith(CHATGPT_CONVERSATION_OPTIONS_PREFIX);
          });
        if (button instanceof HTMLButtonElement) {
          const label = normalize(button.getAttribute('aria-label') || '');
          return label.startsWith(CHATGPT_CONVERSATION_OPTIONS_PREFIX)
            ? label.slice(CHATGPT_CONVERSATION_OPTIONS_PREFIX.length).trim()
            : label;
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
    const route = parseConversationInfo(location.href);
    const top = probes[0] || null;
    if (matching) {
      return {
        matchedConversationId: matching.id,
        matchedProjectId: matching.projectId ?? null,
        matchedTitle: matching.title,
        routeConversationId: route?.id ?? null,
        routeProjectId: route?.projectId ?? null,
        documentTitle: document.title,
        topConversationId: top?.id ?? null,
        topTitle: top?.title ?? null,
      };
    }
    if (
      !expectedProjectId &&
      route &&
      !route.projectId &&
      route.id === expectedConversationId &&
      normalizeDocumentTitle(document.title) === expected
    ) {
      return {
        matchedConversationId: null,
        matchedProjectId: null,
        matchedTitle: null,
        routeConversationId: route.id,
        routeProjectId: route.projectId ?? null,
        documentTitle: document.title,
        topConversationId: top?.id ?? null,
        topTitle: top?.title ?? null,
      };
    }
    return null;
  })()`;
}

function buildConversationRowActionReadyExpression(conversationId: string, projectId?: string | null): string {
  return `(() => {
    const expectedConversationId = ${JSON.stringify(conversationId)};
    const expectedProjectId = ${JSON.stringify(projectId ?? null)};
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
    const normalizeDocumentTitle = (value) =>
      normalize(value)
        .replace(/^chatgpt\\s*[-:|]\\s*/i, '')
        .replace(/\\s*[-:|]\\s*chatgpt$/i, '')
        .trim();
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
    const current = parse(location.href);
    if (!current || current.conversationId !== expectedConversationId || current.projectId !== expectedProjectId) {
      return null;
    }
    const currentTitle = normalizeDocumentTitle(document.title);
    if (!currentTitle) {
      return null;
    }
    const targetLabel = CHATGPT_CONVERSATION_OPTIONS_PREFIX + currentTitle;
    const count = Array.from(document.querySelectorAll('button[aria-label], button'))
      .filter((node) => node instanceof HTMLButtonElement)
      .filter((node) => isVisible(node))
      .filter((node) => normalize(node.getAttribute('aria-label') || '') === targetLabel)
      .length;
    return count > 0 ? { count, title: currentTitle } : null;
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
      labels.some((label) => label.startsWith(CHATGPT_PROJECT_TITLE_EDIT_PREFIX)) ||
      labels.includes(CHATGPT_PROJECT_CONTROLS_DETAILS_LABEL) ||
      (labels.includes(CHATGPT_PROJECT_TAB_CHATS_LABEL) && labels.includes(CHATGPT_PROJECT_TAB_SOURCES_LABEL));
    return hasProjectControls ? { id: normalizedId, href: location.href, labels: labels.slice(0, 20) } : null;
  })()`;
}

function buildProjectSettingsReadyExpression(): string {
  return `(() => {
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
    const normalizeLabel = (el) => {
      if (!(el instanceof Element)) return '';
      return normalize(
        el.getAttribute('aria-label') ||
          el.getAttribute('placeholder') ||
          el.getAttribute('name') ||
          '',
      );
    };
    const hasProjectNameField = Array.from(document.querySelectorAll('input, textarea')).some((node) => {
      const label = normalizeLabel(node);
      return (
        label.includes('project name') ||
        label.includes(${JSON.stringify(CHATGPT_PROJECT_NAME_INPUT_LABEL.toLowerCase())}) ||
        /projectname/i.test(node.getAttribute('name') || '')
      );
    });
    const hasProjectInstructionsField = Array.from(document.querySelectorAll('textarea')).some((node) => {
      const label = normalizeLabel(node);
      return (
        label.includes('instructions') ||
        label.includes(${JSON.stringify(CHATGPT_PROJECT_INSTRUCTIONS_INPUT_LABEL.toLowerCase())})
      );
    });
    const isSettingsDeleteButton = (button) =>
      normalize(button.textContent || '').includes('delete project') ||
      normalize(button.textContent || '') === CHATGPT_PROJECT_DELETE_BUTTON_LABEL;
    if (hasProjectNameField || hasProjectInstructionsField) {
      return { ok: true };
    }
    const dialogs = Array.from(document.querySelectorAll('dialog, [role="dialog"], dialog[open]'));
    for (const dialog of dialogs) {
      const text = normalize(dialog.textContent || '');
      const hasNameInput = Boolean(dialog.querySelector(${JSON.stringify(CHATGPT_PROJECT_NAME_INPUT_SELECTOR)}));
      const hasInstructions = Boolean(dialog.querySelector(${JSON.stringify(CHATGPT_PROJECT_INSTRUCTIONS_SELECTOR)}));
      const hasTextInput = Boolean(dialog.querySelector('input, textarea'));
      const hasDelete = Array.from(dialog.querySelectorAll('button')).some(isSettingsDeleteButton);
      if (hasNameInput || hasInstructions || hasTextInput || hasDelete || text.includes(CHATGPT_PROJECT_SETTINGS_BUTTON_MATCH)) {
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
    const queryTab = normalize(new URL(location.href).searchParams.get('tab'));
    const sourceTabs = Array.from(document.querySelectorAll('[role="tab"]'));
    const tabLabels = sourceTabs.map((node) => normalize(node.textContent || node.getAttribute('aria-label') || ''));
    const sourceTab = sourceTabs.find((node) => {
      const id = String(node.getAttribute('id') || '');
      const label = normalize(node.textContent || node.getAttribute('aria-label') || '');
      return id.endsWith('-sources') || label === CHATGPT_PROJECT_TAB_SOURCES_LABEL || label === 'sources';
    });
    const rows = Array.from(document.querySelectorAll(${JSON.stringify(CHATGPT_PROJECT_SOURCE_ROW_SELECTOR)}));
    const hasRows = rows.length > 0;
    const hasSourceTablist = document.querySelector('[role="tablist"] [role="tab"]') !== null;
    const hasAnyTab = sourceTabs.length > 0;
    const hasSourcesTab = Boolean(sourceTab) || tabLabels.includes(CHATGPT_PROJECT_TAB_SOURCES_LABEL) || tabLabels.includes('sources');
    const hasSourcesQuery =
      queryTab === ${JSON.stringify(CHATGPT_PROJECT_TAB_SOURCES_LABEL)} || queryTab === 'sources' || queryTab === 'project-sources';
    const isReady = (hasSourceTablist || hasAnyTab) && (hasSourcesQuery || hasSourcesTab || hasRows);
    return isReady ? {
      ok: true,
      id: normalizedId,
      href: location.href,
      hasAnyTab,
      hasRows,
      hasSourcesQuery,
      hasSourcesTab,
    } : null;
  })()`;
}

function buildProjectChatsReadyExpression(projectId?: string | null): string {
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
    const isVisible = (node) => {
      if (!(node instanceof Element)) return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const expectedChatsLabel = ${JSON.stringify(CHATGPT_PROJECT_TAB_CHATS_LABEL)};
    const chatTab = Array.from(document.querySelectorAll('[role="tab"]'))
      .find((node) => normalize(node.textContent || node.getAttribute('aria-label') || '') === expectedChatsLabel);
    const chatTabSelected = Boolean(
      chatTab &&
      (chatTab.getAttribute('aria-selected') === 'true' || String(chatTab.getAttribute('data-state') || '').toLowerCase() === 'active')
    );
    const chatPanels = Array.from(document.querySelectorAll('[role="tabpanel"]'));
    const chatPanel = chatPanels.find((panel) => {
      const labelledBy = String(panel.getAttribute('aria-labelledby') || '').toLowerCase();
      if (labelledBy.endsWith('-chats')) return true;
      const text = normalize(panel.textContent || '');
      return (
        Array.from(panel.querySelectorAll('a[href*="/c/"]')).length > 0 ||
        text.length > 0 ||
        text.includes('new chat') ||
        text.includes('search chats') ||
        text.includes('no chats')
      );
    });
    return chatTabSelected || chatPanel
      ? {
          ok: true,
          id: normalizedId,
          href: location.href,
          hasChatPanel: Boolean(chatPanel),
          hasConversationAnchors: Boolean(chatPanel?.querySelector('a[href*="/c/"]')),
        }
      : null;
  })()`;
}

function buildProjectSourcesUploadDialogReadyExpression(): string {
  return `(() => {
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"], dialog[open]'));
    const globalFileInput =
      Boolean(
        document.querySelector('input[type="file"]') ||
          document.querySelector('input[accept]') ||
          document.querySelector('input[data-testid="file-upload"]'),
      );
    const markerSet = ${JSON.stringify(CHATGPT_PROJECT_SOURCE_UPLOAD_MARKERS)}.map((value) => normalize(value));
    for (const dialog of dialogs) {
      const text = normalize(dialog.textContent || '');
      const hasInput = Boolean(
        dialog.querySelector('input[type="file"]') || dialog.querySelector('input[accept]') || dialog.querySelector('input[data-testid="file-upload"]'),
      );
      const uploadActionLabels = ${JSON.stringify(CHATGPT_PROJECT_SOURCE_UPLOAD_ACTION_LABELS)}.map((value) => normalize(value));
      const hasUploadAction = Array.from(dialog.querySelectorAll('button,[role="button"],label'))
        .some((node) => {
          const text = normalize(node.textContent || node.getAttribute('aria-label') || '');
          return uploadActionLabels.some((label) => text.includes(label));
        });
      const hasUploadButton = Array.from(dialog.querySelectorAll('button,[role="button"]'))
        .some((node) => normalize(node.textContent || node.getAttribute('aria-label') || '') === CHATGPT_PROJECT_UPLOAD_BUTTON_LABEL);
      const hasUploadMarker = markerSet.some((marker) =>
        text.includes(marker),
      );
      if ((hasUploadAction || hasUploadButton || hasUploadMarker) && (hasInput || globalFileInput)) {
        return { ok: true };
      }
    }
    if (globalFileInput) {
      return { ok: true };
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
    const rows = Array.from(scope.querySelectorAll(${JSON.stringify(CHATGPT_PROJECT_SOURCE_ROW_SELECTOR)}));
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
    for (const row of Array.from(document.querySelectorAll(${JSON.stringify(CHATGPT_PROJECT_SOURCE_ROW_SELECTOR)}))) {
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
    for (const row of Array.from(document.querySelectorAll(${JSON.stringify(CHATGPT_PROJECT_SOURCE_ROW_SELECTOR)}))) {
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
    const deleteDialogLabel = normalize(${JSON.stringify(CHATGPT_PROJECT_DELETE_DIALOG_LABEL)});
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"], dialog[open]'));
    for (const dialog of dialogs) {
      const text = normalize(dialog.textContent || '');
      const labels = Array.from(dialog.querySelectorAll('button'))
        .map((button) => normalize(button.getAttribute('aria-label') || button.textContent || ''))
        .filter(Boolean);
      if (
        text.includes(deleteDialogLabel) &&
        ${JSON.stringify(CHATGPT_DELETE_CONFIRMATION_BUTTON_LABELS)}.every((label) => labels.includes(label))
      ) {
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
      await dismissCreateProjectDialogIfOpen(client.Runtime).catch(() => undefined);
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
  await dismissCreateProjectDialogIfOpen(client.Runtime).catch(() => undefined);
  return { client, targetId, shouldClose, host, port: resolvedPort, usedExisting };
}

async function dismissCreateProjectDialogIfOpen(Runtime: ChromeClient['Runtime']): Promise<void> {
  const { result } = await Runtime.evaluate({
    expression: `(() => {
      const rootSelectors = ${JSON.stringify(CHATGPT_PROJECT_DIALOG_ROOT_SELECTORS)};
      const nameInputSelector = ${JSON.stringify(CHATGPT_PROJECT_NAME_INPUT_SELECTOR)};
      const normalize = (value) => String(value || '').toLowerCase().replace(/\\s+/g, ' ').trim();
      const isVisible = (node) => {
        if (!(node instanceof Element)) return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const isCreateProjectDialog = (dialog) => {
        if (!(dialog instanceof Element)) return false;
        if (!isVisible(dialog)) return false;
        const input = dialog.querySelector(nameInputSelector);
        if (input && isVisible(input)) {
          return true;
        }
        const text = normalize(dialog.textContent);
        const hasCreateProjectTrigger = text.includes('create project');
        const hasProjectNameLabel = text.includes(normalize(${JSON.stringify(CHATGPT_PROJECT_NAME_INPUT_LABEL)}).toLowerCase());
        const hasSettingsLabel = text.includes(${JSON.stringify(CHATGPT_PROJECT_SETTINGS_BUTTON_MATCH)});
        const hasInstructionsLabel = text.includes(normalize(${JSON.stringify(CHATGPT_PROJECT_INSTRUCTIONS_INPUT_LABEL)}));
        return hasCreateProjectTrigger && (hasProjectNameLabel || hasSettingsLabel || hasInstructionsLabel);
      };

      const dialogs = Array.from(document.querySelectorAll('[role="dialog"], dialog[open], dialog'))
        .filter((dialog) => rootSelectors.some((selector) => dialog.matches(selector)));
      if (!dialogs.length) return { ok: false, reason: 'no-dialog' };

      const createDialog = dialogs.find(isCreateProjectDialog);
      if (!createDialog) return { ok: false, reason: 'not-create-project' };

      const closeButton = createDialog.querySelector(
        '[aria-label*="close" i], [data-testid*="close" i], button[aria-label*="close" i], button[title*="close" i]',
      );
      if (closeButton) {
        closeButton.click();
      }
      document.body.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, cancelable: true }),
      );
      return { ok: true };
    })()`,
    returnByValue: true,
  });
  if ((result?.value as { ok?: boolean } | undefined)?.ok) {
    await waitForNotSelector(Runtime, CHATGPT_PROJECT_DIALOG_SELECTOR, 1_000).catch(() => undefined);
  }
}

async function ensureChatgptSidebarOpen(client: ChromeClient): Promise<void> {
  const sidebarReady = await waitForPredicate(
    client.Runtime,
    `(() => {
      const sidebarMarkers = [
        ...Array.from(document.querySelectorAll('button,a,[role="button"]'))
          .map((node) => String(node.getAttribute('aria-label') || node.textContent || '').replace(/\\s+/g, ' ').trim().toLowerCase()),
      ];
      return sidebarMarkers.includes(${JSON.stringify(CHATGPT_NEW_PROJECT_LABEL)}) ? { ok: true } : null;
    })()`,
    { timeoutMs: 800 },
  );
  if (sidebarReady.ok) return;
  const opened = await pressButton(client.Runtime, {
    match: { exact: [CHATGPT_OPEN_SIDEBAR_LABEL] },
    requireVisible: true,
    timeoutMs: 2000,
  });
  if (!opened.ok) {
    return;
  }
  await waitForPredicate(
    client.Runtime,
    `(() => Array.from(document.querySelectorAll('button,a,[role="button"]'))
      .some((node) => String(node.textContent || '').replace(/\\s+/g, ' ').trim().toLowerCase() === ${JSON.stringify(CHATGPT_NEW_PROJECT_LABEL)}) || null)()`,
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
  const url = resolveChatgptProjectSourcesUrl(projectId);
  const settled = await navigateAndSettle(client, {
    url,
    routeExpression: buildProjectRouteExpression(projectId),
    routeDescription: `chatgpt project ${projectId}`,
    waitForDocumentReady: true,
    fallbackToLocationAssign: true,
    timeoutMs: 10_000,
    fallbackTimeoutMs: 10_000,
  });
  if (!settled.ok) {
    throw new Error(settled.reason || `ChatGPT project sources route did not settle for ${projectId}`);
  }
  const ready = await waitForPredicate(
    client.Runtime,
    buildProjectSourcesReadyExpression(projectId),
    {
      timeoutMs: 3_000,
      description: `ChatGPT project sources tab ready for ${projectId}`,
    },
  );
  if (ready.ok) return;
  const routeOnlyReady = await waitForPredicate(
    client.Runtime,
    buildProjectRouteExpression(projectId),
    {
      timeoutMs: 2_000,
      description: `ChatGPT project route for ${projectId}`,
    },
  );
  if (routeOnlyReady.ok) {
    return;
  }
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
              selector: CHATGPT_PROJECT_SOURCES_TAB_ID_SELECTOR,
              interactionStrategies: ['pointer', 'keyboard-space', 'keyboard-arrowdown'],
              requireVisible: true,
              timeoutMs: 3_000,
            },
          },
          {
            name: 'sources-tab-label',
            trigger: {
              match: { exact: [CHATGPT_PROJECT_TAB_SOURCES_LABEL] },
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
      candidateSelectors: ['[role="tab"]', 'button', '[role="button"]', CHATGPT_PROJECT_SOURCE_ROW_SELECTOR],
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

function isChatgptProjectSourceFileMatch(fileName: string, candidateName: string): boolean {
  const expected = normalizeFileKey(fileName);
  const candidate = normalizeFileKey(candidateName);
  return expected.length > 0 && candidate.length > 0 && expected === candidate;
}

export function findChatgptProjectSourceName(
  files: readonly Pick<FileRef, 'name'>[],
  fileName: string,
): string | null {
  return files.find((file) => isChatgptProjectSourceFileMatch(fileName, file.name))?.name ?? null;
}

async function assertProjectSourceStillPresent(
  client: ChromeClient,
  projectId: string,
  fileName: string,
): Promise<string | null> {
  let files = await readChatgptProjectSourceFilesSettled(client, { timeoutMs: 5_000, pollMs: 500 });
  const matched = findChatgptProjectSourceName(files, fileName);
  if (matched) {
    return matched;
  }
  await reloadProjectSourcesTab(client, projectId);
  files = await readChatgptProjectSourceFilesSettled(client, { timeoutMs: 5_000, pollMs: 500 });
  return findChatgptProjectSourceName(files, fileName);
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

async function waitForProjectSourcePersistence(
  client: ChromeClient,
  projectId: string,
  fileName: string,
  options: {
    shouldExist: boolean;
    timeoutMs?: number;
    initialDelayMs?: number;
    pollDelayMs?: number;
    fallbackExpression?: string;
  },
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const initialDelayMs = options.initialDelayMs ?? 1_500;
  const pollDelayMs = options.pollDelayMs ?? 1_500;
  const deadline = Date.now() + timeoutMs;
  await sleep(initialDelayMs);
  while (Date.now() < deadline) {
    await reloadProjectSourcesTab(client, projectId);
    const files = await readChatgptProjectSourceFilesSettled(client, { timeoutMs: 8_000, pollMs: 500 });
    const matched = findChatgptProjectSourceName(files, fileName);
    if ((options.shouldExist && matched) || (!options.shouldExist && !matched)) {
      return;
    }
    if (options.fallbackExpression) {
      const fallback = await waitForPredicate(
        client.Runtime,
        options.fallbackExpression,
        {
          timeoutMs: 2_000,
          description: options.shouldExist
            ? `ChatGPT project source fallback persisted for ${projectId}`
            : `ChatGPT project source fallback removed for ${projectId}`,
        },
      );
      if (fallback.ok) {
        return;
      }
    }
    await sleep(pollDelayMs);
  }
  if (options.shouldExist) {
    throw new Error(`ChatGPT project source upload did not persist for ${projectId}`);
  }
  throw new Error(`ChatGPT project source "${fileName}" still appeared after reload`);
}

async function openProjectSourcesUploadDialog(client: ChromeClient, projectId: string): Promise<void> {
  await openProjectSourcesTab(client, projectId);
  const existingDialog = await waitForPredicate(
    client.Runtime,
    buildProjectSourcesUploadDialogReadyExpression(),
    {
      timeoutMs: 1_000,
      description: `ChatGPT project sources upload dialog already ready for ${projectId}`,
    },
  );
  if (existingDialog.ok) return;
  await withUiDiagnostics(
    client.Runtime,
    async () => {
      const attempts: Array<{ name: string; trigger: PressButtonOptions }> = [
        {
          name: 'add-sources',
          trigger: {
            match: { exact: [CHATGPT_PROJECT_SOURCE_ADD_LABEL] },
            interactionStrategies: ['pointer', 'keyboard-space', 'keyboard-arrowdown'] as const,
            requireVisible: true,
            timeoutMs: 3_000,
          },
        },
        {
          name: 'add-sources',
          trigger: {
            match: {
              includeAny: [CHATGPT_PROJECT_SOURCE_ADD_LABEL, CHATGPT_PROJECT_SOURCE_ADD_FALLBACK_LABEL, 'upload', 'drag sources', 'add source', 'add sources'],
            },
            interactionStrategies: ['pointer', 'keyboard-space', 'keyboard-arrowdown'] as const,
            requireVisible: true,
            timeoutMs: 3_000,
          },
        },
        {
          name: 'add-empty-state',
          trigger: {
            match: { exact: [CHATGPT_PROJECT_SOURCE_ADD_FALLBACK_LABEL] },
            interactionStrategies: ['pointer', 'keyboard-space', 'keyboard-arrowdown'] as const,
            requireVisible: true,
            timeoutMs: 3_000,
          },
        },
        {
          name: 'sources-action-contains-drag-or-upload',
          trigger: {
            match: {
              includeAny: ['add sources', 'drag sources', 'upload sources', 'upload file', 'upload'],
            },
            interactionStrategies: ['pointer', 'keyboard-space', 'keyboard-arrowdown'] as const,
            requireVisible: true,
            timeoutMs: 3_000,
          },
        },
        {
          name: 'fallback-upload-selector',
          trigger: {
            selector: 'label,button,[role="button"],a,[role="menuitem"]',
            match: { includeAny: ['upload'] },
            interactionStrategies: ['pointer', 'keyboard-space', 'keyboard-arrowdown'] as const,
            requireVisible: true,
            timeoutMs: 2_000,
          },
        },
      ];
      let opened = false;
      const attemptLog = [];
      for (const attempt of attempts) {
        const pressed = await pressButton(client.Runtime, attempt.trigger);
        attemptLog.push({ name: attempt.name, triggerOk: pressed.ok, triggerReason: pressed.reason, matchedLabel: pressed.matchedLabel });
        if (pressed.ok) {
          opened = true;
          break;
        }
      }
      if (!opened) {
        throw new Error(`ChatGPT project sources add action did not open (${JSON.stringify(attemptLog)})`);
      }
      const ready = await waitForPredicate(
        client.Runtime,
        buildProjectSourcesUploadDialogReadyExpression(),
        {
          timeoutMs: 5_000,
          description: `ChatGPT project sources upload dialog ready for ${projectId}`,
        },
      );
      if (!ready.ok) {
        throw new Error(
          `ChatGPT project sources upload dialog did not open (${JSON.stringify({ attempts: attemptLog })})`,
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
      const uploadMarkers = ${JSON.stringify(CHATGPT_PROJECT_SOURCE_UPLOAD_MARKERS)}.map((value) => normalize(value));
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
          const leftScore = Number(uploadMarkers.some((marker) => marker.length > 0 && leftText.includes(marker)));
          const rightScore = Number(uploadMarkers.some((marker) => marker.length > 0 && rightText.includes(marker)));
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
  for (const expectedName of expectedNames) {
    await waitForProjectSourcePersistence(client, projectId, expectedName, {
      shouldExist: true,
      timeoutMs: 30_000,
      initialDelayMs: 4_000,
      pollDelayMs: 2_000,
      fallbackExpression: buildProjectSourceNamesPresentExpression([expectedName]),
    });
  }
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
      const rows = Array.from(document.querySelectorAll(${JSON.stringify(CHATGPT_PROJECT_SOURCE_ROW_SELECTOR)}));
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
        const button = row.querySelector(${JSON.stringify(CHATGPT_PROJECT_SOURCE_ACTIONS_SELECTOR)});
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
        if (
          !text.includes(${JSON.stringify(CHATGPT_PROJECT_SOURCE_ACTION_REMOVE_LABEL)}) &&
          !text.includes(${JSON.stringify(CHATGPT_CONVERSATION_ACTION_DELETE_LABEL)})
        ) continue;
        if (expected && text && !text.includes(expected) && !text.includes('source')) continue;
        const button = Array.from(dialog.querySelectorAll('button'))
          .find((node) => {
            const label = normalize(node.textContent || node.getAttribute('aria-label') || '');
            return (
              label === ${JSON.stringify(CHATGPT_PROJECT_SOURCE_ACTION_REMOVE_LABEL)} ||
              label === ${JSON.stringify(CHATGPT_CONVERSATION_ACTION_DELETE_LABEL)}
            );
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
        match: { exact: [CHATGPT_NEW_PROJECT_LABEL] },
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

function buildChatgptFeatureProbeExpression(): string {
  const detector = JSON.stringify(CHATGPT_FEATURE_DETECTOR);
  const flagTokens = JSON.stringify(CHATGPT_FEATURE_FLAG_TOKENS);
  const appTokens = JSON.stringify(CHATGPT_APP_TOKENS);
  return `(() => {
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
    const lower = (value) => normalize(value).toLowerCase();
    const addText = (sink, value) => {
      const normalized = lower(value);
      if (normalized) sink.push(normalized);
    };
    const detector = ${detector};
    const flagTokens = ${flagTokens};
    const appTokens = ${appTokens};
    const corpus = [];
    addText(corpus, document.body?.innerText || '');
    for (const node of Array.from(document.querySelectorAll('button, [role="button"], a, [aria-label], [title]')).slice(0, 500)) {
      addText(corpus, node.textContent || '');
      addText(corpus, node.getAttribute?.('aria-label') || '');
      addText(corpus, node.getAttribute?.('title') || '');
    }
    for (const key of Object.keys(localStorage).slice(0, 100)) {
      addText(corpus, key);
      try { addText(corpus, localStorage.getItem(key) || ''); } catch {}
    }
    for (const key of Object.keys(sessionStorage).slice(0, 100)) {
      addText(corpus, key);
      try { addText(corpus, sessionStorage.getItem(key) || ''); } catch {}
    }
    for (const script of Array.from(document.querySelectorAll('script[type="application/json"], script#__NEXT_DATA__')).slice(0, 20)) {
      addText(corpus, (script.textContent || '').slice(0, 40000));
    }
    const haystack = corpus.join('\\n');
    const apps = [];
    for (const [name, tokens] of Object.entries(appTokens)) {
      if (tokens.some((token) => haystack.includes(token))) {
        apps.push(name);
      }
    }
    const flags = {};
    for (const [name, tokens] of Object.entries(flagTokens)) {
      flags[name] = tokens.some((token) => haystack.includes(token));
    }
    return {
      detector,
      web_search: Boolean(flags.web_search),
      deep_research: Boolean(flags.deep_research),
      company_knowledge: Boolean(flags.company_knowledge),
      apps,
    };
  })()`;
}

function normalizeChatgptFeatureSignature(probe: ChatgptFeatureProbe | null | undefined): string | null {
  if (!probe || typeof probe !== 'object') {
    return null;
  }
  const parsed = ChatgptFeatureSchema.safeParse({
    web_search: probe.web_search,
    deep_research: probe.deep_research,
    company_knowledge: probe.company_knowledge,
    apps: probe.apps,
  });
  if (!parsed.success) {
    return null;
  }
  const apps = Array.isArray(probe.apps)
    ? Array.from(new Set(probe.apps.map((entry) => normalizeUiText(entry)).filter(Boolean))).sort()
    : [];
  const normalized = {
    detector: normalizeUiText(probe.detector) || CHATGPT_FEATURE_DETECTOR,
    web_search: typeof probe.web_search === 'boolean' ? probe.web_search : undefined,
    deep_research: typeof probe.deep_research === 'boolean' ? probe.deep_research : undefined,
    company_knowledge: typeof probe.company_knowledge === 'boolean' ? probe.company_knowledge : undefined,
    apps,
  };
  const hasAnySignal =
    normalized.web_search !== undefined ||
    normalized.deep_research !== undefined ||
    normalized.company_knowledge !== undefined ||
    normalized.apps.length > 0;
  if (!hasAnySignal) {
    return null;
  }
  return JSON.stringify(normalized);
}

async function readChatgptFeatureSignature(client: ChromeClient): Promise<string | null> {
  const result = await client.Runtime.evaluate({
    expression: buildChatgptFeatureProbeExpression(),
    returnByValue: true,
  });
  return normalizeChatgptFeatureSignature(
    (result.result?.value as ChatgptFeatureProbe | null | undefined) ?? null,
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
  const projectUrl = resolveChatgptProjectUrl(projectId);
  let routeReady:
    | Awaited<ReturnType<typeof waitForPredicate>>
    | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await navigateToChatgptUrl(client, projectUrl, projectId);
    routeReady = await waitForPredicate(
      client.Runtime,
      buildProjectRouteExpression(projectId),
      {
        timeoutMs: 15_000,
        description: `ChatGPT project route ready for ${projectId}`,
      },
    );
    if (routeReady.ok) {
      try {
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
                    match: { startsWith: [CHATGPT_PROJECT_TITLE_EDIT_PREFIX] },
                    requireVisible: true,
                    timeoutMs: 5_000,
                  },
                },
                {
                  name: 'show-project-details',
                  trigger: {
                    match: { exact: [CHATGPT_PROJECT_CONTROLS_DETAILS_LABEL] },
                    requireVisible: true,
                    timeoutMs: 3_000,
                  },
                },
                {
                  name: 'edit-title-retry',
                  trigger: {
                    match: { startsWith: [CHATGPT_PROJECT_TITLE_EDIT_PREFIX] },
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
        return;
      } catch (error) {
        if (attempt === 1) {
          throw error;
        }
      }
    }
    await client.Page.reload({ ignoreCache: false }).catch(() => undefined);
    await sleep(1_000 + attempt * 750);
  }
  if (!routeReady?.ok) {
    throw new Error(`ChatGPT project surface did not hydrate for ${projectId}`);
  }
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
        const nameInput = dialog.querySelector(${JSON.stringify(CHATGPT_PROJECT_NAME_INPUT_SELECTOR)});
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
        const nameInput = dialog.querySelector(${JSON.stringify(CHATGPT_PROJECT_NAME_INPUT_SELECTOR)});
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
      selector: CHATGPT_PROJECT_NAME_INPUT_SELECTOR,
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
        const commitLabels = ${JSON.stringify(CHATGPT_PROJECT_SETTINGS_COMMIT_BUTTON_LABELS)};
        const commitButton = Array.from(root.querySelectorAll('button,[role="button"]')).find((node) => {
          const label = normalize(node.textContent || node.getAttribute('aria-label') || node.getAttribute('title') || '');
          return commitLabels.includes(label) || label.startsWith('save ');
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
): Promise<ChatgptProjectSettingsSnapshot> {
  const { result } = await client.Runtime.evaluate({
    expression: `(() => {
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
      const memoryLabels = ${JSON.stringify([
        CHATGPT_PROJECT_MEMORY_GLOBAL_LABEL,
        CHATGPT_PROJECT_MEMORY_PROJECT_LABEL,
      ])}.map((value) => normalize(value));
      const dialog = Array.from(document.querySelectorAll('[role="dialog"], dialog[open]'))
        .find((node) => node.querySelector(${JSON.stringify(CHATGPT_PROJECT_NAME_INPUT_SELECTOR)}) || node.querySelector(${JSON.stringify(CHATGPT_PROJECT_INSTRUCTIONS_SELECTOR)}));
      if (!dialog) return null;
      const nameInput = dialog.querySelector(${JSON.stringify(CHATGPT_PROJECT_NAME_INPUT_SELECTOR)});
      const textarea = dialog.querySelector(${JSON.stringify(CHATGPT_PROJECT_INSTRUCTIONS_SELECTOR)});
      const selectedMemory = Array.from(dialog.querySelectorAll('button,[role="button"]'))
        .find((node) => {
          const label = normalize(node.textContent || node.getAttribute('aria-label') || '');
          return memoryLabels.includes(label) && node.hasAttribute('disabled');
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

async function waitForProjectSettingsApplied(
  client: ChromeClient,
  projectId: string,
  expected: { name?: string; instructions?: string },
): Promise<void> {
  const deadline = Date.now() + 15_000;
  let lastSnapshot: ChatgptProjectSettingsSnapshot | null = null;
  while (Date.now() < deadline) {
    await openProjectSettingsPanel(client, projectId);
    const snapshot = await readProjectSettingsSnapshot(client);
    lastSnapshot = snapshot;
    await closeDialog(client.Runtime, DEFAULT_DIALOG_SELECTORS);
    if (matchesChatgptProjectSettingsSnapshot(snapshot, expected)) {
      return;
    }
    await sleep(1_000);
  }
  throw new Error(
    `ChatGPT project settings did not persist (${JSON.stringify({
      expected: {
        name: typeof expected.name === 'string' ? normalizeUiText(expected.name) : undefined,
        instructions:
          typeof expected.instructions === 'string'
            ? normalizeInstructionComparisonText(expected.instructions)
            : undefined,
      },
      actual: lastSnapshot
        ? {
            name: normalizeUiText(lastSnapshot.name),
            instructions: normalizeInstructionComparisonText(lastSnapshot.text),
          }
        : null,
    })})`,
  );
}

async function readCurrentProject(client: ChromeClient): Promise<Project | null> {
  const { result } = await client.Runtime.evaluate({
    expression: `(() => {
      const titleEditPrefix = ${JSON.stringify(CHATGPT_PROJECT_TITLE_EDIT_PREFIX)};
      const match = location.pathname.match(/^\\/g\\/([^/]+)\\/project\\/?$/);
      if (!match) return null;
      const projectId = match[1];
      const titleButton = Array.from(document.querySelectorAll('button,[role="button"]'))
        .find((node) => String(node.getAttribute('aria-label') || '').toLowerCase().startsWith(titleEditPrefix));
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
    url: value?.url || resolveChatgptProjectUrl(normalizedId),
  };
}

async function scrapeChatgptProjects(client: ChromeClient): Promise<Project[]> {
  const { result } = await client.Runtime.evaluate({
    expression: `(() => {
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
      const titleEditPrefix = ${JSON.stringify(CHATGPT_PROJECT_TITLE_EDIT_PREFIX)};
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
          .find((node) => String(node.getAttribute('aria-label') || '').toLowerCase().startsWith(titleEditPrefix));
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
    url: project.url ?? resolveChatgptProjectUrl(project.id),
  }));
}

export function resolveChatgptConversationUrl(conversationId: string, projectId?: string | null): string {
  const normalizedProjectId = normalizeChatgptProjectId(projectId);
  return normalizedProjectId
    ? interpolateChatgptRoute(CHATGPT_PROJECT_CONVERSATION_URL_TEMPLATE, {
        projectId: normalizedProjectId,
        conversationId,
      })
    : interpolateChatgptRoute(CHATGPT_CONVERSATION_URL_TEMPLATE, { conversationId });
}

function resolveChatgptConversationListUrl(projectId?: string | null): string {
  const normalizedProjectId = normalizeChatgptProjectId(projectId);
  return normalizedProjectId ? resolveChatgptProjectUrl(normalizedProjectId) : CHATGPT_HOME_URL;
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
  debugContext?: ChatgptRecoveryDebugContext,
): Promise<Conversation[]> {
  return withChatgptBlockingSurfaceRecovery(client, `scrapeChatgptConversations:${projectId ?? 'root'}`, async () => {
    const normalizedProjectId = normalizeChatgptProjectId(projectId);
    if (normalizedProjectId) {
      await navigateToChatgptUrl(client, resolveChatgptProjectUrl(normalizedProjectId), normalizedProjectId);
      const ready = await waitForPredicate(
        client.Runtime,
        buildProjectChatsReadyExpression(normalizedProjectId),
        {
          timeoutMs: 3_000,
          description: `ChatGPT project chats ready for ${normalizedProjectId}`,
        },
      );
      if (!ready.ok) {
        await withUiDiagnostics(
          client.Runtime,
          async () => {
            const opened = await openSurface(client.Runtime, {
              readyExpression: buildProjectChatsReadyExpression(normalizedProjectId),
              readyDescription: `ChatGPT project chats ready for ${normalizedProjectId}`,
              alreadyOpenTimeoutMs: 800,
              readyTimeoutMs: 3_000,
              timeoutMs: 5_000,
              attempts: [
                {
                  name: 'chats-tab-label',
                  trigger: {
                    match: { exact: [CHATGPT_PROJECT_TAB_CHATS_LABEL] },
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
                `ChatGPT project chats tab did not open (${JSON.stringify({
                  reason: opened.reason,
                  attempts: opened.attempts,
                })})`,
              );
            }
          },
          {
            label: 'chatgpt-open-project-chats',
            candidateSelectors: ['[role="tab"]', '[role="tabpanel"]', 'a[href*="/c/"]'],
            context: {
              surface: 'chatgpt-project-chats',
              projectId: normalizedProjectId,
            },
          },
        );
      }
    }
    await ensureChatgptSidebarOpen(client);
    const readConversations = async (): Promise<Conversation[]> => {
    const { result } = await client.Runtime.evaluate({
      expression: `(() => {
      const expectedProjectId = ${JSON.stringify(normalizedProjectId ?? null)};
      const conversationOptionsPrefix = ${JSON.stringify(CHATGPT_CONVERSATION_OPTIONS_PREFIX)};
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
              return label.startsWith(conversationOptionsPrefix);
            });
          if (button instanceof HTMLButtonElement) {
            const label = normalize(button.getAttribute('aria-label') || '').toLowerCase();
            return label.startsWith(conversationOptionsPrefix)
              ? label.slice(conversationOptionsPrefix.length).trim()
              : label;
          }
          current = current.parentElement;
        }
        return '';
      };
      const extractLeafTexts = (root) =>
        Array.from(root.querySelectorAll('div, span, p'))
          .map((node) => normalize(node.textContent || ''))
          .filter(Boolean);
      const findRowTitle = (anchor) => {
        let current = anchor instanceof Element ? anchor : null;
        while (current && current !== document.body) {
          const leafTexts = Array.from(new Set(extractLeafTexts(current)))
            .filter((text) => {
              const lowered = normalize(text).toLowerCase();
              return lowered.length > 0 && !['chatgpt', 'new chat'].includes(lowered);
            })
            .sort((left, right) => left.length - right.length);
          const concreteLeaf = leafTexts[0] || '';
          if (concreteLeaf) {
            return concreteLeaf;
          }
          current = current.parentElement;
        }
        return '';
      };
      const readAnchorProbe = (anchor) => {
        const info = parse(anchor.getAttribute('href') || '');
        if (!info) return null;
        const rowLabel = findRowButtonLabel(anchor);
        const rowTitle = findRowTitle(anchor);
        const titleCandidate =
          rowTitle ||
          rowLabel ||
          normalize(anchor.getAttribute('aria-label') || '') ||
          normalize(anchor.textContent || '') ||
          normalize(anchor.getAttribute('title') || '');
        const title =
          titleCandidate && !['chatgpt', 'new chat'].includes(normalize(titleCandidate).toLowerCase())
            ? titleCandidate
            : info.id;
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
  }, {
    debugContext,
    reopen: buildChatgptListReopen(client, projectId),
  });
}

async function tagChatgptConversationRow(
  client: ChromeClient,
  conversationId: string,
  projectId?: string | null,
): Promise<{ rowSelector: string; actionSelector: string }> {
  await ensureChatgptSidebarOpen(client);
  const normalizedProjectId = normalizeChatgptProjectId(projectId);
  const deadline = Date.now() + 10_000;
  let lastInfo: ChatgptConversationRowTagEvaluation | undefined;
  let attempts = 0;
  while (Date.now() < deadline) {
    attempts += 1;
    const { result } = await client.Runtime.evaluate({
      expression: `(() => {
        const conversationId = ${JSON.stringify(conversationId)};
        const expectedProjectId = ${JSON.stringify(normalizedProjectId ?? null)};
        const rowAttr = ${JSON.stringify(CHATGPT_CONVERSATION_ROW_ATTR)};
        const actionAttr = ${JSON.stringify(CHATGPT_CONVERSATION_ACTION_ATTR)};
        const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
        const normalizeDocumentTitle = (value) =>
          normalize(value)
            .replace(/^chatgpt\\s*[-:|]\\s*/i, '')
            .replace(/\\s*[-:|]\\s*chatgpt$/i, '')
            .trim();
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
                const label = normalize(node.getAttribute('aria-label') || '');
                return label.startsWith(CHATGPT_CONVERSATION_OPTIONS_PREFIX);
              });
            if (button instanceof HTMLButtonElement) {
              return { row: current, button };
            }
            current = current.parentElement;
          }
          return null;
        };
        const findRowFromActionButton = (button, expectedTitle) => {
          let current = button instanceof Element ? button.parentElement : null;
          let best = null;
          while (current && current !== document.body) {
            if (isVisible(current)) {
              const text = normalize(current.textContent || '');
              const conversationButtonCount = Array.from(current.querySelectorAll('button[aria-label], button'))
                .filter((node) => {
                  if (!(node instanceof HTMLButtonElement)) return false;
                  if (!isVisible(node)) return false;
                  const label = normalize(node.getAttribute('aria-label') || '');
                  return label.startsWith(CHATGPT_CONVERSATION_OPTIONS_PREFIX);
                })
                .length;
              const hasConversationAnchor = Array.from(current.querySelectorAll('a[href*="/c/"]'))
                .some((anchor) => isVisible(anchor));
              if (hasConversationAnchor || conversationButtonCount > 0) {
                const rect = current.getBoundingClientRect();
                const area = rect.width * rect.height;
                const score =
                  (expectedTitle && text.includes(expectedTitle) ? 1_000_000 : 0) +
                  (hasConversationAnchor ? 100_000 : 0) -
                  area;
                if (!best || score > best.score) {
                  best = { row: current, button, score };
                }
              }
            }
            current = current.parentElement;
          }
          return best ? { row: best.row, button: best.button } : null;
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

        const conversationAnchors = Array.from(document.querySelectorAll('a[href*="/c/"]'))
          .map((anchor) => {
            if (!(anchor instanceof HTMLAnchorElement)) return null;
            const info = parse(anchor.getAttribute('href') || '');
            if (!info) return null;
            return { anchor, info };
          })
          .filter(Boolean);
        const totalConversationAnchors = conversationAnchors.length;
        const visibleConversationAnchors = conversationAnchors.filter((entry) => isVisible(entry.anchor)).length;
        const candidates = Array.from(document.querySelectorAll('a[href*="/c/"]'))
          .map((anchor) => {
            if (!(anchor instanceof HTMLAnchorElement)) return null;
            const info = parse(anchor.getAttribute('href') || '');
            if (!info || info.conversationId !== conversationId) return null;
            if (expectedProjectId && info.projectId !== expectedProjectId) return null;
            const rowButton = findRowButton(anchor);
            if (!rowButton) return null;
            const rowRect = rowButton.row.getBoundingClientRect();
            const rowConversationButtons = Array.from(rowButton.row.querySelectorAll('button[aria-label], button'))
              .filter((node) => {
                if (!(node instanceof HTMLButtonElement)) return false;
                if (!isVisible(node)) return false;
                const label = normalize(node.getAttribute('aria-label') || '');
                return label.startsWith(CHATGPT_CONVERSATION_OPTIONS_PREFIX);
              });
            const rowText = normalize(rowButton.row.textContent || '');
            const buttonLabel = normalize(rowButton.button.getAttribute('aria-label') || '');
            const inProjectPanel = isInsideVisibleProjectPanel(anchor);
            return {
              row: rowButton.row,
              button: rowButton.button,
              inProjectPanel,
              hasConversationAnchor: true,
              rowText: rowText || null,
              buttonLabel: buttonLabel || null,
              buttonCount: rowConversationButtons.length,
              hasProjectIdMatch: expectedProjectId ? info.projectId === expectedProjectId : false,
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
          expectedProjectId && candidates.some((candidate) => candidate?.inProjectPanel)
            ? candidates.filter((candidate) => candidate?.inProjectPanel)
            : candidates;
        const rankedCandidates = scopedCandidates
          .sort((left, right) => right.score - left.score);
        let best = rankedCandidates[0] || null;
        let fallbackUsed = false;
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
              fallbackUsed = true;
            }
          }
        }
        if (!best) {
          const currentConversation = parse(location.href);
          const currentTitle = normalizeDocumentTitle(document.title);
          if (
            currentConversation &&
            currentConversation.conversationId === conversationId &&
            currentConversation.projectId === expectedProjectId &&
            currentTitle
          ) {
            const matchingButton = Array.from(document.querySelectorAll('button[aria-label], button'))
              .find((node) => {
                if (!(node instanceof HTMLButtonElement)) return false;
                if (!isVisible(node)) return false;
                const label = normalize(node.getAttribute('aria-label') || '');
                return label === CHATGPT_CONVERSATION_OPTIONS_PREFIX + currentTitle;
              });
            if (matchingButton instanceof HTMLButtonElement) {
              const rowButton = findRowFromActionButton(matchingButton, currentTitle);
              if (rowButton) {
                best = {
                  row: rowButton.row,
                  button: rowButton.button,
                  score: 2,
                  hasProjectIdMatch: false,
                };
                fallbackUsed = true;
              }
            }
          }
        }
        if (!best) {
          return {
            ok: false,
            reason: 'No conversation row candidate matched',
            diagnostics: {
              expectedConversationId: conversationId,
              expectedProjectId: expectedProjectId ?? null,
              totalConversationAnchors,
              visibleConversationAnchors,
              candidateCount: candidates.length,
              scopedCandidateCount: scopedCandidates.length,
              fallbackUsed,
              reason: 'No conversation row candidate matched',
              bestCandidate: null,
            },
          };
        }
        best.row.setAttribute(rowAttr, 'true');
        best.button.setAttribute(actionAttr, 'true');
        const rowText = normalize(best.row.textContent || '');
        const buttonLabel = normalize(best.button.getAttribute('aria-label') || '');
        const buttonCount = Array.from(best.row.querySelectorAll('button[aria-label], button'))
          .filter((node) => {
            if (!(node instanceof HTMLButtonElement)) return false;
            if (!isVisible(node)) return false;
            const label = normalize(node.getAttribute('aria-label') || '');
            return label.startsWith(CHATGPT_CONVERSATION_OPTIONS_PREFIX);
          })
          .length;
        return {
          ok: true,
          rowSelector: '[' + rowAttr + '="true"]',
          actionSelector: '[' + actionAttr + '="true"]',
          diagnostics: {
            expectedConversationId: conversationId,
            expectedProjectId: expectedProjectId ?? null,
            totalConversationAnchors,
            visibleConversationAnchors,
            candidateCount: candidates.length,
            scopedCandidateCount: scopedCandidates.length,
            fallbackUsed,
            bestCandidate: {
              inProjectPanel: best.inProjectPanel ?? Boolean(
                best.row.closest('[role="tabpanel"]') && best.row.closest('[role="tabpanel"]').offsetParent !== null,
              ),
              hasConversationAnchor: true,
              buttonCount,
              buttonLabel: buttonLabel || null,
              score: best.score,
              rowText: rowText || null,
              hasProjectIdMatch: best.hasProjectIdMatch ?? false,
            },
          },
        };
      })()` ,
      returnByValue: true,
    });
    lastInfo = result?.value as ChatgptConversationRowTagEvaluation | undefined;
    if (lastInfo?.ok && lastInfo.rowSelector && lastInfo.actionSelector) {
      return {
        rowSelector: lastInfo.rowSelector,
        actionSelector: lastInfo.actionSelector,
      };
    }
    await sleep(400);
  }
  const failure: Error & { diagnostics?: ChatgptConversationRowTagDiagnostics } = new Error(
    summarizeChatgptConversationRowTagFailure(conversationId, [
      {
        attemptLabel: `attempt-${attempts}`,
        diagnostics: lastInfo?.diagnostics ?? null,
        error: lastInfo?.reason || 'not found',
      },
    ]),
  ) as Error & { diagnostics?: ChatgptConversationRowTagDiagnostics };
  failure.diagnostics = lastInfo?.diagnostics ?? undefined;
  throw failure;
}

async function tagChatgptConversationRowExact(
  client: ChromeClient,
  conversationId: string,
  projectId?: string | null,
): Promise<{ rowSelector: string; actionSelector: string }> {
  await ensureChatgptSidebarOpen(client);
  const normalizedProjectId = normalizeChatgptProjectId(projectId);
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    const { result } = await client.Runtime.evaluate({
      expression: `(() => {
        const conversationId = ${JSON.stringify(conversationId)};
        const expectedProjectId = ${JSON.stringify(normalizedProjectId ?? null)};
        const rowAttr = ${JSON.stringify(CHATGPT_CONVERSATION_ROW_ATTR)};
        const actionAttr = ${JSON.stringify(CHATGPT_CONVERSATION_ACTION_ATTR)};
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
        const visibleProjectPanels = expectedProjectId
          ? Array.from(document.querySelectorAll('[role="tabpanel"]')).filter((panel) => {
              if (!(panel instanceof HTMLElement)) return false;
              if (!isVisible(panel)) return false;
              return Array.from(panel.querySelectorAll('a[href*="/c/"]')).some((anchor) => {
                if (!(anchor instanceof HTMLAnchorElement)) return false;
                const info = parse(anchor.getAttribute('href') || anchor.href || '');
                return info?.projectId === expectedProjectId;
              });
            })
          : [];
        const anchorPool =
          expectedProjectId && visibleProjectPanels.length > 0
            ? visibleProjectPanels.flatMap((panel) => Array.from(panel.querySelectorAll('a[href*="/c/"]')))
            : Array.from(document.querySelectorAll('a[href*="/c/"]'));
        const anchor = anchorPool
          .find((node) => {
            if (!(node instanceof HTMLAnchorElement)) return false;
            if (!isVisible(node)) return false;
            const info = parse(node.getAttribute('href') || node.href || '');
            if (!info || info.conversationId !== conversationId) return false;
            if (expectedProjectId && info.projectId !== expectedProjectId) return false;
            return true;
          });
        if (!(anchor instanceof HTMLAnchorElement)) {
          return { ok: false, reason: 'Exact conversation anchor not found' };
        }
        let row = anchor.closest('li') || anchor.parentElement;
        let button = row ? row.querySelector('button[data-conversation-options-trigger], button[aria-label], button') : null;
        if (!(button instanceof HTMLButtonElement) || !isVisible(button)) {
          let current = anchor.parentElement;
          while (current && current !== document.body) {
            const candidate = Array.from(current.querySelectorAll('button[data-conversation-options-trigger], button[aria-label], button'))
              .find((node) => node instanceof HTMLButtonElement && isVisible(node));
            if (candidate instanceof HTMLButtonElement) {
              row = current;
              button = candidate;
              break;
            }
            current = current.parentElement;
          }
        }
        if (!(row instanceof Element) || !(button instanceof HTMLButtonElement) || !isVisible(button)) {
          return {
            ok: false,
            reason: 'Exact conversation row action button not found',
            diagnostics: {
              anchorText: normalize(anchor.textContent || ''),
            },
          };
        }
        row.setAttribute(rowAttr, 'true');
        button.setAttribute(actionAttr, 'true');
        return {
          ok: true,
          rowSelector: '[' + rowAttr + '="true"]',
          actionSelector: '[' + actionAttr + '="true"]',
          diagnostics: {
            anchorText: normalize(anchor.textContent || ''),
            buttonLabel: normalize(button.getAttribute('aria-label') || button.textContent || ''),
          },
        };
      })()`,
      returnByValue: true,
    });
    const info = result?.value as
      | { ok: true; rowSelector: string; actionSelector: string }
      | { ok: false; reason?: string }
      | undefined;
    if (info?.ok) {
      return {
        rowSelector: info.rowSelector,
        actionSelector: info.actionSelector,
      };
    }
    await sleep(300);
  }
  throw new Error(`Exact ChatGPT conversation row not found for ${conversationId}`);
}

async function openChatgptTaggedConversationSidebarMenu(
  client: ChromeClient,
  tagged: { rowSelector: string; actionSelector: string },
  itemLabel: string,
  timeoutMs = 4_000,
): Promise<{ ok: boolean; reason?: string; menuSelector?: string; diagnostics?: Record<string, unknown> }> {
  return withAnchoredActionDiagnostics(
    client.Runtime,
    async () => {
      const opened = await openAndSelectRevealedRowMenuItem(client, {
        rowSelector: tagged.rowSelector,
        triggerSelector: tagged.actionSelector,
        rootSelectors: ['nav', 'aside', tagged.rowSelector],
        triggerRootSelectors: [tagged.rowSelector],
        actionMatch: { startsWith: [CHATGPT_CONVERSATION_OPTIONS_PREFIX] },
        menuSelector: '[role="menu"]',
        itemMatch: { exact: [itemLabel] },
        prepareTriggerBeforeOpen: true,
        directTriggerClickFallback: true,
        itemInteractionStrategies: ['pointer'],
        closeMenuAfter: itemLabel !== CHATGPT_CONVERSATION_ACTION_RENAME_LABEL,
        timeoutMs,
      });
      if (!opened.ok) {
        return {
          ok: false,
          reason: opened.reason || 'Conversation options menu did not open',
        };
      }
      return {
        ok: true,
        menuSelector: opened.menuSelector || '[role="menu"]',
      };
    },
    {
      rowSelector: tagged.rowSelector,
      triggerSelector: tagged.actionSelector,
      anchorSelector: tagged.actionSelector,
      anchorRootSelectors: [tagged.rowSelector],
      context: { itemLabel },
    },
  );
}

async function openChatgptTaggedConversationRenameEditor(
  client: ChromeClient,
  tagged: { rowSelector: string; actionSelector: string },
  timeoutMs = 12_000,
): Promise<{ ok: boolean; reason?: string; diagnostics?: Record<string, unknown> }> {
  return withAnchoredActionDiagnostics(
    client.Runtime,
    async () => {
      const renameOpened = await openChatgptTaggedConversationMenuItem(client, tagged, {
        itemLabel: CHATGPT_CONVERSATION_ACTION_RENAME_LABEL,
        itemReadyDescription: 'ChatGPT rename menu visible',
        itemReadyReason: 'Rename menu item did not appear',
        itemPressedReason: 'Rename menu item did not click',
        timeoutMs,
      });
      if (!renameOpened.ok) {
        return renameOpened;
      }

      const renameEditorReady = await waitForPredicate(
        client.Runtime,
        buildChatgptRenameEditorReadyExpression(),
        {
          timeoutMs,
          description: 'ChatGPT rename editor ready',
        },
      );
      if (!renameEditorReady.ok) {
        return {
          ok: false,
          reason: 'Rename editor did not become ready',
        };
      }

      return { ok: true };
    },
    {
      rowSelector: tagged.rowSelector,
      triggerSelector: tagged.actionSelector,
      editorSelector: 'input[name="title-editor"]',
      anchorSelector: tagged.actionSelector,
      anchorRootSelectors: [tagged.rowSelector],
      context: { phase: 'rename-editor' },
      includeOnSuccess: true,
    },
  );
}

async function openChatgptTaggedConversationDeleteConfirmation(
  client: ChromeClient,
  tagged: { rowSelector: string; actionSelector: string },
  expectedTitle?: string | null,
  timeoutMs = 12_000,
): Promise<{ ok: boolean; reason?: string; diagnostics?: Record<string, unknown> }> {
  return withAnchoredActionDiagnostics(
    client.Runtime,
    async () => {
      const deleteOpened = await openChatgptTaggedConversationMenuItem(client, tagged, {
        itemLabel: CHATGPT_CONVERSATION_ACTION_DELETE_LABEL,
        itemReadyDescription: 'ChatGPT delete menu visible',
        itemReadyReason: 'Delete menu item did not appear',
        itemPressedReason: 'Delete menu item did not click',
        timeoutMs,
      });
      if (!deleteOpened.ok) {
        return deleteOpened;
      }

      const confirmationReady = await waitForChatgptDeleteConfirmationReady(client, expectedTitle, timeoutMs);
      if (!confirmationReady.ok) {
        return {
          ok: false,
          reason: `Delete confirmation did not become ready (${JSON.stringify(confirmationReady.probe ?? null)})`,
        };
      }

      return { ok: true };
    },
    {
      rowSelector: tagged.rowSelector,
      triggerSelector: tagged.actionSelector,
      dialogSelectors: DEFAULT_DIALOG_SELECTORS,
      anchorSelector: tagged.rowSelector,
      anchorRootSelectors: [tagged.rowSelector],
      context: { phase: 'delete-confirmation', expectedTitle: expectedTitle ?? null },
      includeOnSuccess: true,
    },
  );
}

async function openChatgptTaggedConversationMenuItem(
  client: ChromeClient,
  tagged: { rowSelector: string; actionSelector: string },
  options: {
    itemLabel: string;
    itemReadyDescription: string;
    itemReadyReason: string;
    itemPressedReason: string;
    timeoutMs: number;
  },
): Promise<{ ok: boolean; reason?: string; diagnostics?: Record<string, unknown> }> {
  const hovered = await hoverElement(client.Runtime, client.Input, {
    selector: tagged.rowSelector,
    rootSelectors: ['nav', 'aside', tagged.rowSelector],
    timeoutMs: options.timeoutMs,
  });
  if (!hovered.ok) {
    return {
      ok: false,
      reason: hovered.reason || 'Conversation row did not hover',
    };
  }

  const triggerPressed = await pressButton(client.Runtime, {
    selector: tagged.actionSelector,
    rootSelectors: [tagged.rowSelector],
    interactionStrategies: ['pointer'],
    requireVisible: true,
    timeoutMs: options.timeoutMs,
  });
  if (!triggerPressed.ok) {
    return {
      ok: false,
      reason: triggerPressed.reason || 'Conversation options trigger did not open',
    };
  }

  const menuReady = await waitForPredicate(
    client.Runtime,
    `(() => {
      const expected = ${JSON.stringify(options.itemLabel)};
      const items = Array.from(document.querySelectorAll('[role="menuitem"]'))
        .map((node) => String(node.textContent || '').replace(/\\s+/g, ' ').trim().toLowerCase())
        .filter(Boolean);
      return items.includes(expected) ? { items } : null;
    })()`,
    {
      timeoutMs: options.timeoutMs,
      description: options.itemReadyDescription,
    },
  );
  if (!menuReady.ok) {
    return {
      ok: false,
      reason: options.itemReadyReason,
    };
  }

  const itemPressed = await pressButton(client.Runtime, {
    match: { exact: [options.itemLabel] },
    rootSelectors: ['[role="menu"]'],
    interactionStrategies: ['pointer'],
    requireVisible: true,
    timeoutMs: options.timeoutMs,
  });
  if (!itemPressed.ok) {
    return {
      ok: false,
      reason: itemPressed.reason || options.itemPressedReason,
    };
  }

  return { ok: true };
}

function buildChatgptRenameEditorReadyExpression(): string {
  return `(() => {
    const isVisible = (node) => {
      if (!(node instanceof Element)) return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const input = document.querySelector('input[name="title-editor"]');
    if (input instanceof HTMLInputElement && isVisible(input)) {
      return {
        inputName: input.getAttribute('name') || null,
        value: input.value,
        active: document.activeElement === input,
      };
    }
    return null;
  })()`;
}

function buildChatgptConversationTitleProbeExpression(): string {
  return `(() => {
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
    const href = String(location.href || '');
    const routeConversationIdMatch = href.match(/\\/c\\/([a-zA-Z0-9-]+)(?:[/?#]|$)/);
    const routeProjectIdMatch = href.match(/\\/g\\/([^/]+)\\/(?:project|c\\/)/);
    const links = Array.from(document.querySelectorAll('a[href*="/c/"]'))
      .map((anchor) => {
        const anchorHref = String(anchor.href || '');
        const conversationMatch = anchorHref.match(/\\/c\\/([a-zA-Z0-9-]+)(?:[/?#]|$)/);
        const projectMatch = anchorHref.match(/\\/g\\/([^/]+)\\//);
        return {
          href: anchorHref,
          conversationId: conversationMatch ? conversationMatch[1] : null,
          projectId: projectMatch ? projectMatch[1] : null,
          text: normalize(anchor.textContent || ''),
          aria: normalize(anchor.getAttribute('aria-label') || ''),
        };
      })
      .filter((anchor) => anchor.conversationId);
    const topLink = links.find((anchor) => anchor.text || anchor.aria) || null;
    return {
      matchedConversationId: null,
      matchedProjectId: null,
      matchedTitle: null,
      routeConversationId: routeConversationIdMatch ? routeConversationIdMatch[1] : null,
      routeProjectId: routeProjectIdMatch ? routeProjectIdMatch[1] : null,
      documentTitle: document.title,
      topConversationId: topLink ? topLink.conversationId : null,
      topTitle: topLink ? (topLink.text || topLink.aria || null) : null,
    };
  })()`;
}

function buildChatgptDeleteConfirmationProbeExpression(): string {
  return `(() => {
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
    const isVisible = (node) => {
      if (!(node instanceof Element)) return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"], dialog[open]'));
    for (const dialog of dialogs) {
      if (!isVisible(dialog)) continue;
      const buttons = Array.from(dialog.querySelectorAll('button'));
      const confirmButton = dialog.querySelector(${JSON.stringify(CHATGPT_DELETE_CONVERSATION_CONFIRM_BUTTON_SELECTOR)});
      return {
        dialogText: normalize(dialog.textContent || ''),
        buttonLabels: buttons
          .map((button) => normalize(button.getAttribute('aria-label') || button.textContent || ''))
          .filter(Boolean),
        hasVisibleConfirmButton: confirmButton instanceof HTMLButtonElement && isVisible(confirmButton),
      };
    }
    return null;
  })()`;
}

async function readChatgptConversationTitleProbe(
  client: ChromeClient,
  conversationId: string,
): Promise<ChatgptConversationTitleProbe | null> {
  const { result } = await client.Runtime.evaluate({
    expression: `(() => {
      const probe = ${buildChatgptConversationTitleProbeExpression()};
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
      const conversationId = ${JSON.stringify(conversationId)};
      const links = Array.from(document.querySelectorAll('a[href*="/c/"]'))
        .map((anchor) => {
          const href = String(anchor.href || '');
          const match = href.match(/\\/c\\/([a-zA-Z0-9-]+)(?:[/?#]|$)/);
          if (!match || match[1] !== conversationId) return null;
          const projectMatch = href.match(/\\/g\\/([^/]+)\\//);
          return {
            matchedConversationId: match[1],
            matchedProjectId: projectMatch ? projectMatch[1] : null,
            matchedTitle: normalize(anchor.textContent || '') || normalize(anchor.getAttribute('aria-label') || '') || null,
          };
        })
        .filter(Boolean);
      if (links.length > 0) {
        const first = links[0];
        probe.matchedConversationId = first.matchedConversationId;
        probe.matchedProjectId = first.matchedProjectId;
        probe.matchedTitle = first.matchedTitle;
      }
      return probe;
    })()`,
    returnByValue: true,
  });
  return (result?.value as ChatgptConversationTitleProbe | null | undefined) ?? null;
}

async function readChatgptDeleteConfirmationProbe(
  client: ChromeClient,
): Promise<ChatgptDeleteConfirmationProbe | null> {
  const { result } = await client.Runtime.evaluate({
    expression: buildChatgptDeleteConfirmationProbeExpression(),
    returnByValue: true,
  });
  return (result?.value as ChatgptDeleteConfirmationProbe | null | undefined) ?? null;
}

async function waitForChatgptDeleteConfirmationReady(
  client: ChromeClient,
  expectedTitle?: string | null,
  timeoutMs = 5_000,
): Promise<{ ok: true; probe: ChatgptDeleteConfirmationProbe } | { ok: false; probe: ChatgptDeleteConfirmationProbe | null }> {
  const deadline = Date.now() + timeoutMs;
  let lastProbe: ChatgptDeleteConfirmationProbe | null = null;
  while (Date.now() < deadline) {
    lastProbe = await readChatgptDeleteConfirmationProbe(client);
    if (matchesChatgptDeleteConfirmationProbe(lastProbe, expectedTitle)) {
      return { ok: true, probe: lastProbe! };
    }
    await sleep(200);
  }
  return { ok: false, probe: lastProbe };
}

async function waitForChatgptConversationTitleApplied(
  client: ChromeClient,
  conversationId: string,
  expectedTitle: string,
  projectId?: string | null,
): Promise<void> {
  const titleApplied = async (options?: { requireTopForRootMatch?: boolean }) => {
    const probe = await readChatgptConversationTitleProbe(client, conversationId);
    return {
      ok: matchesChatgptConversationTitleProbe(probe, conversationId, expectedTitle, projectId, options),
      probe,
    };
  };
  const shortPause = async () => {
    const min = 800;
    const max = 1_500;
    const ms = min + Math.floor(Math.random() * (max - min + 1));
    await new Promise((resolve) => setTimeout(resolve, ms));
  };
  await shortPause();
  let renamed = await titleApplied();
  if (!renamed.ok) {
    await shortPause();
    await ensureChatgptSidebarOpen(client).catch(() => undefined);
    await navigateToChatgptUrl(client, resolveChatgptConversationListUrl(projectId));
    await ensureChatgptSidebarOpen(client).catch(() => undefined);
    renamed = await titleApplied({ requireTopForRootMatch: !projectId });
  }
  if (!renamed.ok) {
    throw new Error(
      `ChatGPT conversation rename did not persist for ${conversationId} (${JSON.stringify(renamed.probe ?? (await readChatgptConversationTitleProbe(client, conversationId)))})`,
    );
  }
}

async function isChatgptConversationTitleAppliedWithClient(
  client: ChromeClient,
  conversationId: string,
  expectedTitle: string,
  projectId?: string | null,
): Promise<boolean> {
  const probe = await readChatgptConversationTitleProbe(client, conversationId);
  return matchesChatgptConversationTitleProbe(probe, conversationId, expectedTitle, projectId);
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

async function ensureChatgptConversationSurfaceReadyForRead(
  client: ChromeClient,
  conversationId: string,
  projectId?: string | null,
): Promise<void> {
  const waitForReady = async (description: string) => {
    return await waitForPredicate(
      client.Runtime,
      buildConversationSurfaceReadyExpression(conversationId, projectId),
      {
        timeoutMs: 10_000,
        description,
      },
    );
  };
  await navigateToChatgptConversation(client, conversationId, projectId);
  let ready = await waitForReady(`ChatGPT conversation ${conversationId} surface ready`);
  if (ready.ok) {
    return;
  }
  await client.Page.reload({ ignoreCache: true }).catch(async () => {
    await client.Runtime.evaluate({
      expression: 'location.reload()',
      returnByValue: true,
    }).catch(() => undefined);
  });
  ready = await waitForReady(`ChatGPT conversation ${conversationId} surface ready after reload`);
  if (ready.ok) {
    return;
  }
  await navigateToChatgptConversation(client, conversationId, projectId);
  ready = await waitForReady(`ChatGPT conversation ${conversationId} surface ready after reopen`);
  if (ready.ok) {
    return;
  }
  throw new Error(`ChatGPT conversation ${conversationId} content not found`);
}

async function readChatgptConversationContextWithClient(
  client: ChromeClient,
  conversationId: string,
  projectId?: string | null,
  debugContext?: ChatgptRecoveryDebugContext,
): Promise<ConversationContext> {
  return withChatgptBlockingSurfaceRecovery(client, `readChatgptConversationContext:${conversationId}`, async () => {
    await ensureChatgptConversationSurfaceReadyForRead(client, conversationId, projectId);
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
          const roleNodes = Array.from(
            document.querySelectorAll(
              ${JSON.stringify(`${CHATGPT_CONVERSATION_TURN_SECTION_SELECTOR} ${CHATGPT_MESSAGE_AUTHOR_ROLE_SELECTOR}`)},
            ),
          ).filter((node) => !node.parentElement?.closest(${JSON.stringify(CHATGPT_MESSAGE_AUTHOR_ROLE_SELECTOR)}));
          const fallbackNodes = roleNodes.length > 0
            ? roleNodes
            : Array.from(document.querySelectorAll(${JSON.stringify(CHATGPT_MESSAGE_AUTHOR_ROLE_SELECTOR)}))
                .filter((node) => !node.parentElement?.closest(${JSON.stringify(CHATGPT_MESSAGE_AUTHOR_ROLE_SELECTOR)}));
          const messages = fallbackNodes
            .map((node) => {
              const role = String(node.getAttribute('data-message-author-role') || '').trim();
              if (role !== 'user' && role !== 'assistant' && role !== 'system') return null;
              const text = normalize(node.innerText || node.textContent || '');
              if (!text) return null;
              const messageId = normalize(
                node.getAttribute('data-message-id') ||
                node.closest(${JSON.stringify(CHATGPT_CONVERSATION_TURN_SECTION_SELECTOR)})?.getAttribute('data-turn-id') ||
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
      await ensureChatgptConversationSurfaceReadyForRead(client, conversationId, projectId);
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
  }, {
    debugContext,
    reopen: buildChatgptConversationReopen(client, conversationId, projectId),
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
        const roots = Array.from(document.querySelectorAll(${JSON.stringify(CHATGPT_CONVERSATION_TURN_SECTION_SELECTOR)}))
          .map((section, messageIndex) => {
            const roleNode = section.querySelector(${JSON.stringify(CHATGPT_MESSAGE_AUTHOR_ROLE_SELECTOR)});
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
          const buttons = Array.from(entry.section.querySelectorAll(${JSON.stringify(CHATGPT_ASSISTANT_ARTIFACT_BUTTON_SELECTOR)}))
            .filter((button) => isVisible(button) && !button.closest(${JSON.stringify(CHATGPT_TEXTDOC_MESSAGE_SELECTOR)}))
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
      return Array.from(document.querySelectorAll(${JSON.stringify(CHATGPT_TEXTDOC_MESSAGE_SELECTOR)}))
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
        const nodes = Array.from(
          document.querySelectorAll(
            ${JSON.stringify(`${CHATGPT_CONVERSATION_TURN_SECTION_SELECTOR} ${CHATGPT_USER_MESSAGE_AUTHOR_ROLE_SELECTOR}`)},
          ),
        )
          .filter((node) => !node.parentElement?.closest(${JSON.stringify(CHATGPT_MESSAGE_AUTHOR_ROLE_SELECTOR)}));
        nodes.forEach((node) => {
          const section = node.closest(${JSON.stringify(CHATGPT_CONVERSATION_TURN_SECTION_SELECTOR)});
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
  const shortPause = async () => {
    const min = 800;
    const max = 1_500;
    const ms = min + Math.floor(Math.random() * (max - min + 1));
    await new Promise((resolve) => setTimeout(resolve, ms));
  };
  const longPause = async () => {
    const min = 10_000;
    const max = 15_000;
    const ms = min + Math.floor(Math.random() * (max - min + 1));
    await new Promise((resolve) => setTimeout(resolve, ms));
  };
  await navigateToChatgptConversation(client, conversationId, projectId);
  await ensureChatgptSidebarOpen(client);
  if (await isChatgptConversationTitleAppliedWithClient(client, conversationId, newTitle, projectId)) {
    return;
  }
  let tagged: { rowSelector: string; actionSelector: string } | null = null;
  const tagFailures: ChatgptConversationRowTagAttemptFailure[] = [];
  const tryTagConversationRow = async (label: string) => {
    try {
      return await tagChatgptConversationRowExact(client, conversationId, projectId);
    } catch (error) {
      tagFailures.push({
        attemptLabel: label,
        error: error instanceof Error ? error.message : String(error),
        diagnostics: readChatgptConversationRowTagDiagnostics(error),
      });
      return null;
    }
  };
  const tagAttemptPlans: Array<{
    label: string;
    target: 'conversation' | 'list';
    useLongPause?: boolean;
  }> = [
    { label: 'primary', target: 'conversation' },
    { label: 'list-open-1', target: 'list' },
    { label: 'list-open-2', target: 'list' },
    { label: 'list-refresh', target: 'list', useLongPause: true },
  ];

  for (const [index, attempt] of tagAttemptPlans.entries()) {
    if (index > 0) {
      if (attempt.useLongPause) {
        await longPause();
      } else {
        await shortPause();
      }
    }
    if (attempt.target === 'conversation') {
      await navigateToChatgptConversation(client, conversationId, projectId);
    } else {
      await navigateToChatgptUrl(client, resolveChatgptConversationListUrl(projectId));
    }
    await ensureChatgptSidebarOpen(client);
    try {
      await waitForPredicate(
        client.Runtime,
        buildConversationRowActionReadyExpression(conversationId, projectId),
        {
          timeoutMs: 4_000,
          description: `ChatGPT conversation row actions ready for ${conversationId}`,
        },
      );
    } catch {
      // Intentional fallback: tagging logic has polling and can proceed without this gate.
    }
    tagged = await tryTagConversationRow(attempt.label);
    if (tagged) {
      break;
    }
  }
  await withUiDiagnostics(
    client.Runtime,
    async () => {
      if (await isChatgptConversationTitleAppliedWithClient(client, conversationId, newTitle, projectId)) {
        return;
      }
      if (!tagged) {
        throw new Error(summarizeChatgptConversationRowTagFailure(conversationId, tagFailures));
      }
      await shortPause();
      const renameEditorOpen = await openChatgptTaggedConversationRenameEditor(
        client,
        tagged,
      );
      if (!renameEditorOpen.ok) {
        throw new Error(
          `ChatGPT conversation rename editor did not open for ${conversationId}: ${renameEditorOpen.reason || 'direct rename path failed'} (${JSON.stringify(renameEditorOpen.diagnostics ?? null)})`,
        );
      }
      const submitted = tagged
        ? await submitInlineRename(
            client.Runtime,
            {
              value: newTitle,
              inputSelector: 'input[name="title-editor"]',
              closeSelector: 'input[name="title-editor"]',
              timeoutMs: 4_000,
              entryStrategy: 'native-input',
              submitStrategy: 'native-enter',
            },
            { Input: client.Input },
          )
        : { ok: false as const, reason: 'Sidebar row unavailable after rename trigger' };
      if (submitted.ok) {
        await shortPause();
        if (await isChatgptConversationTitleAppliedWithClient(client, conversationId, newTitle, projectId)) {
          return;
        }
        const nativeRetryEditorOpen = await openChatgptTaggedConversationRenameEditor(
          client,
          tagged,
        );
        if (nativeRetryEditorOpen.ok) {
          const nativeRetrySubmitted = await submitInlineRename(
            client.Runtime,
            {
              value: newTitle,
              inputSelector: 'input[name="title-editor"]',
              closeSelector: 'input[name="title-editor"]',
              timeoutMs: 4_000,
              entryStrategy: 'native-input',
              submitStrategy: 'native-enter',
            },
            { Input: client.Input },
          );
          if (nativeRetrySubmitted.ok) {
            await shortPause();
            if (await isChatgptConversationTitleAppliedWithClient(client, conversationId, newTitle, projectId)) {
              return;
            }
          }
        }
        return;
      }
      const submittedFromVisibleRenameInput = await submitInlineRename(
        client.Runtime,
        {
          value: newTitle,
          inputSelector: 'input[name="title-editor"]',
          closeSelector: 'input[name="title-editor"]',
          timeoutMs: 5_000,
          entryStrategy: 'native-input',
          submitStrategy: 'native-enter',
        },
        { Input: client.Input },
      );
      if (submittedFromVisibleRenameInput.ok) {
        await shortPause();
        if (await isChatgptConversationTitleAppliedWithClient(client, conversationId, newTitle, projectId)) {
          return;
        }
        return;
      }
      if (!submitted.ok) {
        throw new Error(
          submittedFromVisibleRenameInput.reason ||
            submitted.reason ||
            `ChatGPT inline rename failed for ${conversationId}`,
        );
      }
      return;
    },
    {
      label: 'chatgpt-rename-conversation',
      candidateSelectors: ['[role="menu"]', '[role="menuitem"]', 'button[aria-label]', 'input[type="text"]'],
      context: {
        conversationId,
        projectId: projectId ?? null,
        tagFailures,
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
  const deleteInteractionStrategies = ['pointer', 'keyboard-space', 'keyboard-arrowdown'] as const;
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
    tagged = await tagChatgptConversationRowExact(client, conversationId, projectId);
  } catch {
    await navigateToChatgptConversation(client, conversationId, projectId);
    await ensureChatgptSidebarOpen(client);
    try {
      tagged = await tagChatgptConversationRowExact(client, conversationId, projectId);
    } catch {
      await navigateToChatgptConversation(client, conversationId, projectId);
    }
  }
  await withUiDiagnostics(
    client.Runtime,
    async () => {
      let deleteReady =
        tagged
          ? await openChatgptTaggedConversationDeleteConfirmation(client, tagged, expectedTitle)
          : { ok: false as const, reason: 'Sidebar row unavailable' };
      if (!deleteReady.ok) {
        const headerSelection = await openAndSelectMenuItemFromTriggers(client.Runtime, {
          triggers: [
            {
              name: 'conversation-header',
              beforeAttempt: async () => {
                await navigateToChatgptConversation(client, conversationId, projectId);
              },
              trigger: {
                selector: CHATGPT_CONVERSATION_OPTIONS_BUTTON_SELECTOR,
                interactionStrategies: deleteInteractionStrategies,
                requireVisible: true,
                timeoutMs: 3_000,
              },
              menuSelector: '[role="menu"]',
              closeMenuAfter: true,
            },
          ],
          itemMatch: { exact: [CHATGPT_CONVERSATION_ACTION_DELETE_LABEL] },
          timeoutMs: 4_000,
        });
        deleteReady = headerSelection.ok
          ? { ok: true }
          : { ok: false, reason: headerSelection.reason || deleteReady.reason };
      }
      if (!deleteReady.ok) {
        throw new Error(
          `ChatGPT conversation delete menu did not open for ${conversationId}: ${deleteReady.reason || 'no matching action surface'}`,
        );
      }
      let confirmationReady = await waitForChatgptDeleteConfirmationReady(client, expectedTitle, 5_000);
      if (!confirmationReady.ok) {
        const headerRetry = await openAndSelectMenuItemFromTriggers(client.Runtime, {
          triggers: [
            {
              name: 'conversation-header',
              beforeAttempt: async () => {
                await navigateToChatgptConversation(client, conversationId, projectId);
              },
              trigger: {
                selector: CHATGPT_CONVERSATION_OPTIONS_BUTTON_SELECTOR,
                interactionStrategies: deleteInteractionStrategies,
                requireVisible: true,
                timeoutMs: 3_000,
              },
              menuSelector: '[role="menu"]',
              closeMenuAfter: true,
            },
          ],
          itemMatch: { exact: [CHATGPT_CONVERSATION_ACTION_DELETE_LABEL] },
          timeoutMs: 4_000,
        });
        if (!headerRetry.ok) {
          throw new Error(
            `ChatGPT conversation delete confirmation did not open for ${conversationId}: ${headerRetry.reason || 'header retry failed'}`,
          );
        }
        confirmationReady = await waitForChatgptDeleteConfirmationReady(client, expectedTitle, 5_000);
        if (!confirmationReady.ok) {
          throw new Error(
            `ChatGPT delete confirmation did not open for ${conversationId} (${JSON.stringify(confirmationReady.probe ?? null)})`,
          );
        }
      }
      const pressed = await pressButton(client.Runtime, {
        selector: CHATGPT_DELETE_CONVERSATION_CONFIRM_BUTTON_SELECTOR,
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
        CHATGPT_CONVERSATION_OPTIONS_BUTTON_SELECTOR,
        '[role="menu"]',
        '[role="dialog"]',
        CHATGPT_DELETE_CONVERSATION_CONFIRM_BUTTON_SELECTOR,
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
    const sections = Array.from(document.querySelectorAll(${JSON.stringify(CHATGPT_CONVERSATION_TURN_SECTION_SELECTOR)}));
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
    const sections = Array.from(document.querySelectorAll(${JSON.stringify(CHATGPT_CONVERSATION_TURN_SECTION_SELECTOR)}));
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
  const expression = `(() => {
    return Array.from(document.querySelectorAll('img')).map((img) => ({
      src: img.getAttribute('src') || '',
      alt: img.getAttribute('alt') || '',
    }));
  })()`;
  const result = await client.Runtime.evaluate({
    expression,
    returnByValue: true,
  });
  const value = result.result?.value;
  const probes = Array.isArray(value)
    ? value
        .filter(isRecord)
        .map((item) => ({
          src: readStringField(item, 'src'),
          alt: readStringField(item, 'alt'),
        }))
    : [];
  const match = probes.find((probe) => matchesChatgptImageArtifactProbe(probe, artifact));
  return normalizeUiText(match?.src) || null;
}

async function waitForChatgptImageArtifactWithClient(
  client: ChromeClient,
  artifact: ConversationArtifact,
): Promise<boolean> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const src = await readChatgptImageArtifactSrcWithClient(client, artifact);
    if (src) {
      return true;
    }
    await sleep(250);
  }
  return false;
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

async function tagChatgptArtifactButtonWithClient(
  client: ChromeClient,
  artifact: ConversationArtifact,
  options?: {
    spreadsheetCard?: boolean;
  },
): Promise<boolean> {
  const turnId = artifact.metadata && typeof artifact.metadata.turnId === 'string' ? artifact.metadata.turnId.trim() : null;
  const buttonIndex =
    artifact.metadata && typeof artifact.metadata.buttonIndex === 'number' && Number.isFinite(artifact.metadata.buttonIndex)
      ? artifact.metadata.buttonIndex
      : null;
  const spreadsheetCard = Boolean(options?.spreadsheetCard);
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
        const spreadsheetCard = ${JSON.stringify(spreadsheetCard)};
        const roots = Array.from(document.querySelectorAll(${JSON.stringify(CHATGPT_CONVERSATION_TURN_SECTION_SELECTOR)}))
          .map((section, messageIndex) => {
            const roleNode = section.querySelector(${JSON.stringify(CHATGPT_MESSAGE_AUTHOR_ROLE_SELECTOR)});
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
          if (!spreadsheetCard) {
            return Array.from(root.section.querySelectorAll(${JSON.stringify(CHATGPT_ASSISTANT_ARTIFACT_BUTTON_SELECTOR)}))
              .filter((button) => isVisible(button) && !button.closest(${JSON.stringify(CHATGPT_TEXTDOC_MESSAGE_SELECTOR)}))
              .map((button, index) => ({
                button,
                turnId: root.turnId,
                messageId: root.messageId,
                messageIndex: root.messageIndex,
                buttonIndex: index,
                title: normalize(button.textContent || button.getAttribute('aria-label') || '').toLowerCase(),
              }));
          }
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
            .map((button, index) => ({
              button,
              turnId: root.turnId,
              messageId: root.messageId,
              messageIndex: root.messageIndex,
              buttonIndex: index,
              title: expectedTitle,
            }));
        };
        const matches = (candidate) => {
          if (!candidate || !candidate.title) return false;
          if (expectedTitle && candidate.title !== expectedTitle) return false;
          if (expectedTurnId && candidate.turnId !== expectedTurnId) return false;
          if (!expectedTurnId && expectedMessageId && candidate.messageId !== expectedMessageId && candidate.turnId !== expectedMessageId) {
            return false;
          }
          if (!expectedTurnId && !expectedMessageId && typeof expectedMessageIndex === 'number' && candidate.messageIndex !== expectedMessageIndex) {
            return false;
          }
          if (typeof expectedButtonIndex === 'number' && candidate.buttonIndex !== expectedButtonIndex) {
            return false;
          }
          return true;
        };
        const scopedRoot =
          (expectedTurnId && roots.find((root) => root.turnId === expectedTurnId)) ||
          (expectedMessageId && roots.find((root) => root.messageId === expectedMessageId || root.turnId === expectedMessageId)) ||
          (typeof expectedMessageIndex === 'number' ? roots.find((root) => root.messageIndex === expectedMessageIndex) : null) ||
          null;
        const candidates = scopedRoot ? resolveButtons(scopedRoot) : roots.flatMap(resolveButtons);
        const chosen = candidates.find((candidate) => matches(candidate)) || null;
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

async function tagChatgptDownloadButtonWithClient(
  client: ChromeClient,
  artifact: ConversationArtifact,
): Promise<boolean> {
  return await tagChatgptArtifactButtonWithClient(client, artifact);
}

async function tagChatgptSpreadsheetCardDownloadButtonWithClient(
  client: ChromeClient,
  artifact: ConversationArtifact,
): Promise<boolean> {
  return await tagChatgptArtifactButtonWithClient(client, artifact, { spreadsheetCard: true });
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
  debugContext?: ChatgptRecoveryDebugContext,
): Promise<FileRef | null> {
  const normalizedProjectId = normalizeChatgptProjectId(projectId);
  return withChatgptBlockingSurfaceRecovery(
    client,
    `materializeChatgptConversationArtifact:${conversationId}:${artifact.id}`,
    async () => {
      await ensureChatgptConversationSurfaceReadyForRead(client, conversationId, normalizedProjectId);
      if (artifact.kind === 'canvas') {
        const contentText = resolveChatgptCanvasArtifactContentText(
          artifact,
          await readVisibleChatgptCanvasProbesWithClient(client),
        );
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
    {
      debugContext,
      reopen: buildChatgptConversationReopen(client, conversationId, normalizedProjectId),
    },
  );
}

export function createChatgptAdapter(): Pick<
  BrowserProvider,
  | 'capabilities'
  | 'getUserIdentity'
  | 'getFeatureSignature'
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
    async getFeatureSignature(options?: BrowserProviderListOptions): Promise<string | null> {
      const { client } = await connectToChatgptTab(options, options?.configuredUrl ?? CHATGPT_HOME_URL);
      try {
        return await readChatgptFeatureSignature(client);
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
      const debugContext = resolveChatgptRecoveryDebugContext(options, 'chatgpt-list-conversations', {
        projectId: normalizedProjectId ?? null,
      });
      const attempt = async (currentOptions?: BrowserProviderListOptions): Promise<Conversation[]> => {
        const targetUrl = normalizedProjectId
          ? resolveChatgptProjectUrl(normalizedProjectId)
          : (currentOptions?.configuredUrl ?? CHATGPT_HOME_URL);
        const { client } = await connectToChatgptTab(currentOptions, targetUrl);
        try {
          return await scrapeChatgptConversations(client, normalizedProjectId, debugContext);
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
      const debugContext = resolveChatgptRecoveryDebugContext(options, 'chatgpt-read-conversation-context', {
        conversationId,
        projectId: normalizedProjectId ?? null,
      });
      const { client } = await connectToChatgptTab(
        options,
        resolveChatgptConversationUrl(conversationId, normalizedProjectId),
      );
      try {
        return await readChatgptConversationContextWithClient(
          client,
          conversationId,
          normalizedProjectId,
          debugContext,
        );
      } finally {
        await client.close().catch(() => undefined);
      }
    },
    async listConversationFiles(
      conversationId: string,
      options?: BrowserProviderListOptions,
    ): Promise<FileRef[]> {
      const normalizedProjectId = normalizeChatgptProjectId(options?.projectId);
      const debugContext = resolveChatgptRecoveryDebugContext(options, 'chatgpt-list-conversation-files', {
        conversationId,
        projectId: normalizedProjectId ?? null,
      });
      const { client } = await connectToChatgptTab(
        options,
        resolveChatgptConversationUrl(conversationId, normalizedProjectId),
      );
      try {
        return await withChatgptBlockingSurfaceRecovery(
          client,
          `listChatgptConversationFiles:${conversationId}`,
          async () => {
            await ensureChatgptConversationSurfaceReadyForRead(client, conversationId, normalizedProjectId);
            return await readVisibleChatgptConversationFilesWithClient(client, conversationId);
          },
          {
            debugContext,
            reopen: buildChatgptConversationReopen(client, conversationId, normalizedProjectId),
          },
        );
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
      const debugContext = resolveChatgptRecoveryDebugContext(options, 'chatgpt-materialize-artifact', {
        conversationId,
        projectId: normalizedProjectId ?? null,
        artifactId: artifact.id,
        artifactKind: artifact.kind,
      });
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
          debugContext,
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
        if (!normalizedProjectId) {
          await renameChatgptConversationWithClient(client, conversationId, newTitle, normalizedProjectId);
          return;
        }
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
              await waitForProjectSettingsApplied(client, createdId, { name: input.name });
            } catch {
              // Settings-snapshot verification can lag right after route change; route change itself is still authoritative here.
            }
            const current = await readCurrentProject(client);
            created = {
              id: createdId,
              name:
                current && normalizeProjectName(current.name) === normalizeProjectName(input.name)
                  ? current.name
                  : input.name,
              provider: 'chatgpt',
              url: current?.url ?? routeValue?.href ?? resolveChatgptProjectUrl(createdId),
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
          await waitForProjectSettingsApplied(client, created.id, { instructions: input.instructions });
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
      const { client } = await connectToChatgptTab(options, resolveChatgptProjectSourcesUrl(projectId));
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
      const { client } = await connectToChatgptTab(options, resolveChatgptProjectSourcesUrl(projectId));
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
      const { client } = await connectToChatgptTab(options, resolveChatgptProjectSourcesUrl(projectId));
      try {
        await openProjectSourcesTab(client, projectId);
        const listedFiles = await readChatgptProjectSourceFilesSettled(client);
        const matchedFileName = findChatgptProjectSourceName(listedFiles, fileName);
        let targetFileName = fileName;
        if (!matchedFileName) {
          const refreshedMatch = await assertProjectSourceStillPresent(client, projectId, fileName);
          if (!refreshedMatch) {
            return;
          }
          targetFileName = refreshedMatch;
        } else {
          targetFileName = matchedFileName;
        }
        const deletionFileName = targetFileName;
        const selector = await tagChatgptProjectSourceAction(client, targetFileName);
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
              itemMatch: { exact: [CHATGPT_PROJECT_SOURCE_ACTION_REMOVE_LABEL] },
              menuSelector: '[role="menu"]',
              timeoutMs: 4_000,
              closeMenuAfter: true,
            });
            if (!removed) {
              throw new Error(`ChatGPT source actions menu did not remove "${deletionFileName}"`);
            }
          },
          {
            label: 'chatgpt-remove-project-source',
            candidateSelectors: [CHATGPT_PROJECT_SOURCE_ACTIONS_SELECTOR, '[role="menu"]', '[role="menuitem"]'],
            context: {
              projectId,
              fileName,
            },
          },
        );
        let removal = await waitForPredicate(
          client.Runtime,
          buildProjectSourceRemovedExpression(targetFileName),
          {
            timeoutMs: 4_000,
            description: `ChatGPT project source removed: ${targetFileName}`,
          },
        );
        if (!removal.ok) {
          await confirmChatgptProjectSourceRemovalIfPresent(client, targetFileName);
          removal = await waitForPredicate(
            client.Runtime,
            buildProjectSourceRemovedExpression(targetFileName),
            {
              timeoutMs: 8_000,
              description: `ChatGPT project source removed after confirmation: ${targetFileName}`,
            },
          );
        }
        if (!removal.ok) {
          throw new Error(`ChatGPT project source "${targetFileName}" did not disappear after removal`);
        }
        await waitForProjectSourcePersistence(client, projectId, targetFileName, {
          shouldExist: false,
          timeoutMs: 20_000,
          initialDelayMs: 1_500,
          pollDelayMs: 1_500,
          fallbackExpression: buildProjectSourceRemovedExpression(targetFileName),
        });
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
      const { client } = await connectToChatgptTab(options, resolveChatgptProjectUrl(projectId));
      try {
        await applyProjectSettings(client, projectId, { instructions });
        await waitForProjectSettingsApplied(client, projectId, { instructions });
      } finally {
        await client.close().catch(() => undefined);
      }
    },
    async getProjectInstructions(
      projectId: string,
      options?: BrowserProviderListOptions,
    ): Promise<{ text: string; model?: string | null }> {
      const { client } = await connectToChatgptTab(options, resolveChatgptProjectUrl(projectId));
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
      const { client } = await connectToChatgptTab(options, resolveChatgptProjectUrl(projectId));
      try {
        await applyProjectSettings(client, projectId, { name: newTitle });
        await waitForProjectSettingsApplied(client, projectId, { name: newTitle });
      } finally {
        await client.close().catch(() => undefined);
      }
    },
    async selectRemoveProjectItem(projectId: string, options?: BrowserProviderListOptions): Promise<void> {
      const { client } = await connectToChatgptTab(options, resolveChatgptProjectUrl(projectId));
      try {
        await openProjectSettingsPanel(client, projectId);
        const settingsRootSelector = await tagProjectSettingsDialog(client, { name: true, instructions: true });
        await withUiDiagnostics(
          client.Runtime,
          async () => {
            const pressed = await pressButton(client.Runtime, {
              match: { exact: [CHATGPT_PROJECT_DELETE_BUTTON_LABEL] },
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
      const { client } = await connectToChatgptTab(options, resolveChatgptProjectUrl(projectId));
      try {
        const pressDeleteConfirmation = async (): Promise<{ ok?: boolean; reason?: string } | undefined> => {
          const { result } = await client.Runtime.evaluate({
            expression: `(() => {
              const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
              const deleteDialogLabel = normalize(${JSON.stringify(CHATGPT_PROJECT_DELETE_DIALOG_LABEL)});
              const deleteButtonLabel = normalize(${JSON.stringify(CHATGPT_CONVERSATION_ACTION_DELETE_LABEL)});
              const dialogs = Array.from(document.querySelectorAll('[role="dialog"], dialog[open]'));
              for (const dialog of dialogs) {
                const text = normalize(dialog.textContent || '');
                if (!text.includes(deleteDialogLabel)) continue;
                const button = Array.from(dialog.querySelectorAll('button'))
                  .find((node) => normalize(node.getAttribute('aria-label') || node.textContent || '') === deleteButtonLabel);
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
          return result?.value as { ok?: boolean; reason?: string } | undefined;
        };
        let pressed = await pressDeleteConfirmation();
        if (!pressed?.ok && pressed?.reason === 'confirmation-dialog-missing') {
          await openProjectSettingsPanel(client, projectId);
          const settingsRootSelector = await tagProjectSettingsDialog(client, { name: true, instructions: true });
          const deletePressed = await pressButton(client.Runtime, {
            match: { exact: [CHATGPT_PROJECT_DELETE_BUTTON_LABEL] },
            rootSelectors: [settingsRootSelector],
            requireVisible: true,
            timeoutMs: 5000,
          });
          if (!deletePressed.ok) {
            throw new Error(deletePressed.reason || 'ChatGPT delete project button not found');
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
            throw new Error('confirmation-dialog-missing');
          }
          pressed = await pressDeleteConfirmation();
        }
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
              return parsed.origin === ${JSON.stringify(CHATGPT_HOME_LOCATION.origin)} &&
                parsed.pathname === ${JSON.stringify(CHATGPT_HOME_LOCATION.pathname)}
                ? { href: location.href }
                : null;
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
