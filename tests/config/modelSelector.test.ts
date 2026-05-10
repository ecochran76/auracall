import { describe, expect, it } from 'vitest';
import {
  isChatgptSemanticModelSelector,
  resolveChatgptSemanticModelSelector,
} from '../../src/config/modelSelector.js';

describe('semantic model selectors', () => {
  it.each([
    ['chatgpt:auto', { desiredModel: 'Auto' }],
    ['chatgpt:instant', { desiredModel: 'Instant' }],
    ['chatgpt:thinking-standard', { desiredModel: 'Thinking', thinkingTime: 'standard' }],
    ['chatgpt:thinking-extended', { desiredModel: 'Thinking', thinkingTime: 'extended' }],
    ['chatgpt:pro-standard', { desiredModel: 'Pro', thinkingTime: 'standard' }],
    ['chatgpt:pro-extended', { desiredModel: 'Pro', thinkingTime: 'extended' }],
  ])('resolves %s to current ChatGPT browser controls', (selector, expected) => {
    expect(resolveChatgptSemanticModelSelector(selector)).toEqual(expected);
  });

  it('detects ChatGPT selector typos separately from absent selectors', () => {
    expect(isChatgptSemanticModelSelector('chatgpt:pro-long')).toBe(true);
    expect(resolveChatgptSemanticModelSelector('chatgpt:pro-long')).toBeNull();
    expect(isChatgptSemanticModelSelector('grok:thinking')).toBe(false);
  });
});
