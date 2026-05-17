import { describe, expect, test } from 'vitest';
import { normalizeGeminiConversationHistoryLimit } from '../../src/browser/providers/geminiAdapter.js';

describe('Gemini browser adapter', () => {
  test('clamps account-mirror history hydration limits', () => {
    expect(normalizeGeminiConversationHistoryLimit(undefined)).toBe(80);
    expect(normalizeGeminiConversationHistoryLimit(0)).toBe(1);
    expect(normalizeGeminiConversationHistoryLimit(57.8)).toBe(57);
    expect(normalizeGeminiConversationHistoryLimit(900)).toBe(500);
  });
});
