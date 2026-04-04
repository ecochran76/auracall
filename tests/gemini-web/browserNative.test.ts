import { describe, expect, it } from 'vitest';
import {
  detectGeminiNativeAttachmentFailure,
  extractGeminiAnswerText,
} from '../../src/gemini-web/browserNative.js';

describe('gemini browser native answer extraction', () => {
  it('ignores landing-page scaffolding when the prompt is not yet in history', () => {
    const answer = extractGeminiAnswerText({
      prompt: 'Describe the uploaded image in one short sentence.',
      currentText: 'Hi Eric What should we dive into? For you Create image Create music',
    });

    expect(answer).toBe('');
  });

  it('extracts text that appears after the submitted prompt', () => {
    const answer = extractGeminiAnswerText({
      prompt: 'Describe the uploaded image in one short sentence.',
      currentText:
        'Conversation with Gemini Describe the uploaded image in one short sentence. A simple blue square with text inside it. Tools Fast Submit',
    });

    expect(answer).toBe('A simple blue square with text inside it.');
  });

  it('detects explicit native image upload failure copy', () => {
    expect(
      detectGeminiNativeAttachmentFailure(
        'Conversation with Gemini Image Upload Failed Image Not Received, Please Re-upload',
      ),
    ).toContain('image');
  });

  it('returns null when no native attachment failure copy is present', () => {
    expect(
      detectGeminiNativeAttachmentFailure('Conversation with Gemini Describe the uploaded image in one short sentence.'),
    ).toBeNull();
  });
});
