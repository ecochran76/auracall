import type { BrowserProviderConfig } from './types.js';
import {
  requireBundledServiceCompatibleHosts,
  resolveBundledServiceSelectors,
} from '../../services/registry.js';

const GEMINI_SELECTORS = resolveBundledServiceSelectors('gemini', {
  input: [
    'div[role="textbox"][aria-label="Enter a prompt for Gemini"]',
    'div[role="textbox"][contenteditable="true"]',
    'textarea[aria-label*="Gemini"]',
  ],
  sendButton: [
    'button[aria-label="Send message"]',
    'button[type="submit"][aria-label*="Send"]',
  ],
  modelButton: [
    'button[aria-label*="Model"]',
    'button[aria-haspopup="menu"][aria-label*="Model"]',
  ],
  menuItem: [
    '[role="menuitem"]',
    'button[role="menuitem"]',
    'button',
  ],
  assistantBubble: [
    '[data-test-id="chat-history-container"] [data-test-id]',
    '[data-test-id="chat-history-container"] div',
  ],
  assistantRole: [
    '[data-test-id="chat-history-container"]',
  ],
  copyButton: [
    'button[aria-label*="Copy"]',
    'button[title*="Copy"]',
  ],
  composerRoot: [
    'main',
    'form',
  ],
  fileInput: [
    '[data-test-id="hidden-local-image-upload-button"]',
    '[data-test-id="hidden-local-file-upload-button"]',
  ],
  attachmentMenu: [
    'button[aria-label="Open upload file menu"]',
    '[data-test-id="local-images-files-uploader-button"]',
  ],
});

export const GEMINI_PROVIDER: BrowserProviderConfig = {
  id: 'gemini',
  selectors: GEMINI_SELECTORS,
  loginUrlHints: requireBundledServiceCompatibleHosts('gemini'),
};
