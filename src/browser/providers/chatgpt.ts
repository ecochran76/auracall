import type { BrowserProviderConfig } from './types.js';
import {
  requireBundledServiceCompatibleHosts,
  resolveBundledServiceSelectors,
} from '../../services/registry.js';

const CHATGPT_SELECTORS = resolveBundledServiceSelectors('chatgpt', {
  input: [
    'textarea[data-id="prompt-textarea"]',
    'textarea[placeholder*="Send a message"]',
    'textarea[aria-label="Message ChatGPT"]',
    'textarea:not([disabled])',
    'textarea[name="prompt-textarea"]',
    '#prompt-textarea',
    '.ProseMirror',
    '[contenteditable="true"][data-virtualkeyboard="true"]',
    'div[contenteditable="true"][role="textbox"]',
  ],
  sendButton: [
    'button[data-testid="send-button"]',
    'button[data-testid*="composer-send"]',
    'form button[type="submit"]',
    'button[type="submit"][data-testid*="send"]',
    'button[aria-label*="Send"]',
  ],
  modelButton: [
    '[data-testid="model-switcher-dropdown-button"]',
    'button[aria-label*="Model"]',
    'button[aria-haspopup="menu"][aria-label*="Model"]',
  ],
  menuItem: [
    'button',
    '[role="menuitem"]',
    '[role="menuitemradio"]',
    '[data-testid*="model-switcher-"]',
  ],
  assistantBubble: [
    'article[data-testid^="conversation-turn"]',
    'div[data-testid^="conversation-turn"]',
    'section[data-testid^="conversation-turn"]',
    'article[data-message-author-role]',
    'div[data-message-author-role]',
    'section[data-message-author-role]',
    'article[data-turn]',
    'div[data-turn]',
    'section[data-turn]',
  ],
  assistantRole: [
    'article[data-testid^="conversation-turn"][data-message-author-role="assistant"]',
    'article[data-testid^="conversation-turn"][data-turn="assistant"]',
    'article[data-testid^="conversation-turn"] [data-message-author-role="assistant"]',
    'article[data-testid^="conversation-turn"] [data-turn="assistant"]',
    'article[data-testid^="conversation-turn"] .markdown',
    '[data-message-author-role="assistant"] .markdown',
    '[data-turn="assistant"] .markdown',
    '[data-message-author-role="assistant"]',
    '[data-turn="assistant"]',
  ],
  copyButton: [
    'button[data-testid="copy-turn-action-button"]',
    'button[aria-label*="Copy"]',
    'button[title*="Copy"]',
  ],
  composerRoot: [
    '[data-testid*="composer"]',
    'form',
  ],
  fileInput: [
    'form input[type="file"]:not([accept])',
    'input[type="file"][multiple]:not([accept])',
    'input[type="file"][multiple]',
    'input[type="file"]:not([accept])',
    'form input[type="file"][accept]',
    'input[type="file"][accept]',
    'input[type="file"]',
    'input[type="file"][data-testid*="file"]',
  ],
  attachmentMenu: [
    '#composer-plus-btn',
    'button[data-testid="composer-plus-btn"]',
    'button[aria-label*="Attach"]',
    'button[aria-label*="Upload"]',
  ],
});

export const CHATGPT_PROVIDER: BrowserProviderConfig = {
  id: 'chatgpt',
  selectors: CHATGPT_SELECTORS,
  loginUrlHints: requireBundledServiceCompatibleHosts('chatgpt'),
};
