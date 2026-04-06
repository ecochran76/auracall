import { describe, expect, test } from 'vitest';
import {
  classifyGeminiBlockingState,
  createGeminiAdapter,
  geminiConversationSurfaceReadyExpression,
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
  selectNewestGeminiAssistantText,
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

  test('classifies Google unusual-traffic interstitials explicitly', () => {
    expect(classifyGeminiBlockingState({
      href: 'https://www.google.com/sorry/index?continue=https://gemini.google.com/app',
      title: 'https://gemini.google.com/app',
      bodyText: "About this page Our systems have detected unusual traffic from your computer network. This page checks to see if it's really you sending the requests, and not a robot.",
    })).toContain('unusual-traffic interstitial');
    expect(classifyGeminiBlockingState({
      href: 'https://gemini.google.com/app',
      title: 'Gemini',
      bodyText: 'Normal Gemini content',
    })).toBeNull();
  });

  test('extracts the newest Gemini assistant text while ignoring prompt echo and baseline content', () => {
    expect(selectNewestGeminiAssistantText(
      ['Older answer'],
      ['Older answer', 'Describe the uploaded image in one short sentence.', 'The image shows a yellow flower.'],
      'Describe the uploaded image in one short sentence.',
    )).toBe('The image shows a yellow flower.');
  });

  test('strips Gemini response chrome from extracted assistant text', () => {
    expect(selectNewestGeminiAssistantText(
      [],
      ['Show thinking Gemini said ACK smoke-1775434174360'],
      'Disposable CRUD smoke smoke-1775434174360: reply with exactly ACK smoke-1775434174360',
    )).toBe('ACK smoke-1775434174360');
  });

  test('treats collapsed Gemini root app state as a ready conversation surface', () => {
    const expression = geminiConversationSurfaceReadyExpression();
    expect(expression).toContain('button[aria-label="Main menu"]');
    expect(expression).toContain('conversation with gemini');
    expect(expression).toContain('what can we get done');
  });

  test('exposes direct conversation rename support on the Gemini provider surface', () => {
    const adapter = createGeminiAdapter();
    expect(typeof adapter.renameConversation).toBe('function');
    expect(typeof adapter.deleteConversation).toBe('function');
    expect(typeof adapter.readConversationContext).toBe('function');
  });

  test('does not treat arbitrary Gemini project names as normalized ids', () => {
    expect(normalizeGeminiProjectId('AuraCall Gemini Cache Smoke 1775435764170')).toBeNull();
    expect(normalizeGeminiProjectId('84a7f7d4768c')).toBe('84a7f7d4768c');
    expect(normalizeGeminiProjectId('https://gemini.google.com/gems/edit/84a7f7d4768c')).toBe('84a7f7d4768c');
  });
});
