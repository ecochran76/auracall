import { describe, expect, test } from 'vitest';
import {
  extractGeminiProjectIdFromUrl,
  normalizeGeminiConversationId,
  normalizeGeminiProjectId,
  resolveGeminiCreateProjectUrl,
  resolveGeminiEditProjectUrl,
  resolveGeminiConversationUrl,
  resolveGeminiProjectUrl,
} from '../../src/browser/providers/geminiAdapter.js';

describe('geminiAdapter id helpers', () => {
  test('normalizes Gemini Gem ids from raw ids and URLs', () => {
    expect(normalizeGeminiProjectId('3bfcda98acf4')).toBe('3bfcda98acf4');
    expect(normalizeGeminiProjectId('https://gemini.google.com/gem/3bfcda98acf4')).toBe('3bfcda98acf4');
    expect(normalizeGeminiProjectId('https://gemini.google.com/gems/edit/3bfcda98acf4')).toBe('3bfcda98acf4');
    expect(extractGeminiProjectIdFromUrl('https://gemini.google.com/gem/3bfcda98acf4')).toBe('3bfcda98acf4');
    expect(extractGeminiProjectIdFromUrl('https://gemini.google.com/gems/edit/3bfcda98acf4')).toBe('3bfcda98acf4');
  });

  test('normalizes Gemini conversation ids from raw ids and app URLs', () => {
    expect(normalizeGeminiConversationId('ab30a4a92e4b65a9')).toBe('ab30a4a92e4b65a9');
    expect(normalizeGeminiConversationId('https://gemini.google.com/app/ab30a4a92e4b65a9')).toBe('ab30a4a92e4b65a9');
  });

  test('resolves Gemini project and conversation URLs', () => {
    expect(resolveGeminiProjectUrl('3bfcda98acf4')).toBe('https://gemini.google.com/gem/3bfcda98acf4');
    expect(resolveGeminiCreateProjectUrl()).toBe('https://gemini.google.com/gems/create');
    expect(resolveGeminiEditProjectUrl('3bfcda98acf4')).toBe('https://gemini.google.com/gems/edit/3bfcda98acf4');
    expect(resolveGeminiConversationUrl('ab30a4a92e4b65a9')).toBe('https://gemini.google.com/app/ab30a4a92e4b65a9');
  });
});
