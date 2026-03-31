import { describe, expect, test } from 'vitest';
import {
  ATTACHMENT_MENU_SELECTORS,
  COPY_BUTTON_SELECTORS,
  INPUT_SELECTORS,
  MODEL_BUTTON_SELECTORS,
  SEND_BUTTON_SELECTORS,
} from '../../src/browser/constants.js';
import { CHATGPT_PROVIDER } from '../../src/browser/providers/chatgpt.js';

describe('chatgpt provider config', () => {
  test('resolves selector families from the bundled services manifest', () => {
    expect(CHATGPT_PROVIDER.selectors.input).toEqual(INPUT_SELECTORS);
    expect(CHATGPT_PROVIDER.selectors.sendButton).toEqual(SEND_BUTTON_SELECTORS);
    expect(CHATGPT_PROVIDER.selectors.modelButton).toEqual(MODEL_BUTTON_SELECTORS);
    expect(CHATGPT_PROVIDER.selectors.copyButton).toEqual(COPY_BUTTON_SELECTORS);
    expect(CHATGPT_PROVIDER.selectors.attachmentMenu).toEqual(ATTACHMENT_MENU_SELECTORS);
  });

  test('keeps login url hints aligned with the service host family', () => {
    expect(CHATGPT_PROVIDER.loginUrlHints).toEqual(
      expect.arrayContaining(['chatgpt.com', 'chat.openai.com']),
    );
  });
});
