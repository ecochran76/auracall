import { describe, expect, test } from 'vitest';
import {
  extractGeminiProjectIdFromUrl,
  geminiUrlMatchesPreference,
  normalizeGeminiConversationId,
  normalizeGeminiProjectId,
  resolveGeminiConfiguredUrl,
  resolveGeminiCreateProjectUrl,
  resolveGeminiEditProjectUrl,
  resolveGeminiConversationUrl,
  resolveGeminiProjectMenuAriaLabel,
  resolveGeminiProjectUrl,
  selectPreferredGeminiTarget,
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

  test('resolves Gemini Gem manager row menu labels', () => {
    expect(resolveGeminiProjectMenuAriaLabel('Oracle')).toBe('More options for "Oracle" Gem');
  });

  test('ignores non-Gemini configured URLs for Gemini browser surfaces', () => {
    expect(resolveGeminiConfiguredUrl('https://chatgpt.com/')).toBe('https://gemini.google.com/app');
    expect(resolveGeminiConfiguredUrl('https://gemini.google.com/gem/3bfcda98acf4')).toBe('https://gemini.google.com/gem/3bfcda98acf4');
  });

  test('matches Gemini tab URLs by exact route preference', () => {
    expect(geminiUrlMatchesPreference(
      'https://gemini.google.com/app/17ecd216fc87eacf',
      'https://gemini.google.com/app/17ecd216fc87eacf',
    )).toBe(true);
    expect(geminiUrlMatchesPreference(
      'https://gemini.google.com/app/17ecd216fc87eacf',
      'https://gemini.google.com/app/f626d2f5da22efee',
    )).toBe(false);
    expect(geminiUrlMatchesPreference(
      'https://gemini.google.com/app',
      'https://gemini.google.com/app/',
    )).toBe(true);
  });

  test('prefers exact Gemini tab matches instead of the first same-origin candidate', () => {
    const first = { url: 'https://gemini.google.com/app/f626d2f5da22efee' };
    const second = { url: 'https://gemini.google.com/app/17ecd216fc87eacf' };
    expect(selectPreferredGeminiTarget([first, second], 'https://gemini.google.com/app/17ecd216fc87eacf')).toBe(second);
    expect(selectPreferredGeminiTarget([first, second], 'https://gemini.google.com/app')).toBeUndefined();
  });
});
