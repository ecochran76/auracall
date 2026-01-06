import type { BrowserProviderConfig } from './types.js';

export const GROK_PROVIDER: BrowserProviderConfig = {
  id: 'grok',
  selectors: {
    input: [
      'div.ProseMirror[contenteditable="true"]',
      'div[contenteditable="true"][role="textbox"]',
      'div.ProseMirror[contenteditable="true"][aria-label]',
      'div.ProseMirror',
    ],
    sendButton: [
      'button[aria-label="Submit"][type="submit"]',
      'button[type="submit"][aria-label*="Submit"]',
      'button[type="submit"]',
    ],
    modelButton: [
      'button[aria-label="Model select"]',
      'button[aria-label*="Model"]',
      'button[aria-haspopup="menu"][aria-label*="Model"]',
    ],
    menuItem: [
      '[role="menuitem"]',
      '[role="menuitemradio"]',
      'button[role="menuitem"]',
    ],
    assistantBubble: ['main .message-bubble'],
    assistantRole: [
      'main .message-bubble.w-full.max-w-none',
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
      'input[type="file"]',
    ],
    attachmentMenu: [
      'button[aria-label="Attach"]',
      'button[aria-label*="Attach"]',
      'button[aria-label*="Upload"]',
    ],
  },
  loginUrlHints: ['accounts.x.ai/sign-in'],
};
