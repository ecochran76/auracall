import { describe, expect, it } from 'vitest';
import {
  isChatgptSemanticModelSelector,
  resolveChatgptSemanticModelSelector,
  SEMANTIC_MODEL_SELECTORS,
} from '../../src/config/modelSelector.js';

describe('semantic model selectors', () => {
  it('publishes capability-oriented ChatGPT selectors without provider versions or codenames', () => {
    expect(
      SEMANTIC_MODEL_SELECTORS.filter((entry) => entry.service === 'chatgpt').map((entry) => entry.id),
    ).toEqual([
      'chatgpt:fast',
      'chatgpt:reasoning',
      'chatgpt:reasoning-high',
      'chatgpt:reasoning-max',
      'chatgpt:premium',
      'chatgpt:legacy',
    ]);
  });

  it.each([
    ['chatgpt:fast', { canonicalSelector: 'chatgpt:fast', desiredModel: 'GPT-5.6 Sol', thinkingTime: 'light', apiModel: 'gpt-5.6-sol' }],
    ['chatgpt:reasoning', { canonicalSelector: 'chatgpt:reasoning', desiredModel: 'GPT-5.6 Sol', thinkingTime: 'standard', apiModel: 'gpt-5.6-sol' }],
    ['chatgpt:reasoning-high', { canonicalSelector: 'chatgpt:reasoning-high', desiredModel: 'GPT-5.6 Sol', thinkingTime: 'extended', apiModel: 'gpt-5.6-sol' }],
    ['chatgpt:reasoning-max', { canonicalSelector: 'chatgpt:reasoning-max', desiredModel: 'GPT-5.6 Sol', thinkingTime: 'heavy', apiModel: 'gpt-5.6-sol' }],
    ['chatgpt:premium', { canonicalSelector: 'chatgpt:premium', desiredModel: 'GPT-6 Pro', apiModel: 'gpt-6-astra' }],
    ['chatgpt:legacy', { canonicalSelector: 'chatgpt:legacy', desiredModel: 'GPT-5.5', apiModel: 'gpt-5.2-instant' }],
  ])('resolves canonical selector %s through the current provider schema', (selector, expected) => {
    expect(resolveChatgptSemanticModelSelector(selector)).toEqual(expected);
  });

  it.each([
    ['chatgpt:auto', 'chatgpt:fast'],
    ['chatgpt:instant', 'chatgpt:fast'],
    ['chatgpt:thinking-standard', 'chatgpt:reasoning'],
    ['chatgpt:thinking-extended', 'chatgpt:reasoning-high'],
    ['chatgpt:pro', 'chatgpt:reasoning'],
    ['chatgpt:pro-extended', 'chatgpt:reasoning-high'],
    ['chatgpt:sol', 'chatgpt:reasoning'],
    ['chatgpt:sol-high', 'chatgpt:reasoning-high'],
    ['chatgpt:sol-extra-high', 'chatgpt:reasoning-max'],
    ['chatgpt:gpt-5.2-thinking', 'chatgpt:reasoning'],
    ['chatgpt:gpt-5.2-pro', 'chatgpt:reasoning'],
    ['chatgpt:gpt-5.5', 'chatgpt:legacy'],
  ])('keeps legacy selector %s as an alias for %s', (selector, canonicalSelector) => {
    expect(resolveChatgptSemanticModelSelector(selector)?.canonicalSelector).toBe(canonicalSelector);
  });

  it.each([
    ['chatgpt:terra', { canonicalSelector: 'chatgpt:fast', desiredModel: 'GPT-5.6 Terra', apiModel: 'gpt-5.2-instant' }],
    ['chatgpt:luna', { canonicalSelector: 'chatgpt:fast', desiredModel: 'GPT-5.6 Luna', apiModel: 'gpt-5.2-instant' }],
    ['chatgpt:gpt-5.6-sol', { canonicalSelector: 'chatgpt:reasoning', desiredModel: 'GPT-5.6 Sol', thinkingTime: 'standard', apiModel: 'gpt-5.6-sol' }],
  ])('preserves explicit provider-family target %s', (selector, expected) => {
    expect(resolveChatgptSemanticModelSelector(selector)).toEqual(expected);
  });

  it('detects ChatGPT selector typos separately from absent selectors', () => {
    expect(isChatgptSemanticModelSelector('chatgpt:pro-long')).toBe(true);
    expect(resolveChatgptSemanticModelSelector('chatgpt:pro-long')).toBeNull();
    expect(isChatgptSemanticModelSelector('grok:thinking')).toBe(false);
  });
});
