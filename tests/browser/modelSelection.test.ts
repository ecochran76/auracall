import { describe, expect, it } from 'vitest';
import {
  buildModelMatchersLiteralForTest,
  buildModelSelectionExpressionForTest,
} from '../../src/browser/actions/modelSelection.js';

const expectContains = (arr: string[], value: string) => {
  expect(arr).toContain(value);
};

describe('browser model selection matchers', () => {
  it('targets the current ChatGPT model picker button', () => {
    const expression = buildModelSelectionExpressionForTest('gpt-5.2-pro');
    expect(expression).toContain('[data-testid=\\"model-switcher-dropdown-button\\"]');
    expect(expression).toContain('button[aria-label*=\\"Model\\"]');
  });

  it('includes rich tokens for gpt-5.1 base selection', () => {
    const { labelTokens, testIdTokens, semanticTarget } = buildModelMatchersLiteralForTest('gpt-5.1');
    expect(semanticTarget).toBe('instant');
    expectContains(labelTokens, 'gpt-5.1');
    expectContains(labelTokens, 'gpt-5-1');
    expectContains(labelTokens, 'gpt51');
    expectContains(labelTokens, 'chatgpt 5.1');
    expectContains(labelTokens, 'instant');
    expectContains(testIdTokens, 'gpt-5-1');
    expectContains(testIdTokens, 'model-switcher-gpt-5-3');
    expect(testIdTokens.some((t) => t.includes('gpt-5.1') || t.includes('gpt-5-1') || t.includes('gpt51'))).toBe(true);
  });

  it('includes pro/research tokens for gpt-5.2-pro', () => {
    const { labelTokens, testIdTokens, semanticTarget } = buildModelMatchersLiteralForTest('gpt-5.2-pro');
    expect(semanticTarget).toBe('pro');
    expect(labelTokens.some((t) => t.includes('pro') || t.includes('research'))).toBe(true);
    expectContains(testIdTokens, 'pro');
    expectContains(testIdTokens, 'model-switcher-gpt-5-4-pro');
  });

  it('includes pro + 5.2 tokens for gpt-5.2-pro', () => {
    const { labelTokens, testIdTokens } = buildModelMatchersLiteralForTest('gpt-5.2-pro');
    expect(labelTokens.some((t) => t.includes('pro'))).toBe(true);
    expect(labelTokens.some((t) => t.includes('5.2') || t.includes('5-2'))).toBe(true);
    expect(testIdTokens.some((t) => t.includes('gpt-5.2-pro') || t.includes('gpt-5-2-pro'))).toBe(true);
  });

  it('includes thinking tokens for gpt-5.2-thinking', () => {
    const { labelTokens, testIdTokens, semanticTarget } = buildModelMatchersLiteralForTest('gpt-5.2-thinking');
    expect(semanticTarget).toBe('thinking');
    expect(labelTokens.some((t) => t.includes('thinking'))).toBe(true);
    expect(labelTokens.some((t) => t.includes('5.2') || t.includes('5-2'))).toBe(true);
    expect(testIdTokens).toContain('model-switcher-gpt-5-4-thinking');
    expect(testIdTokens).toContain('gpt-5.2-thinking');
  });

  it('includes instant tokens for gpt-5.2-instant', () => {
    const { labelTokens, testIdTokens, semanticTarget } = buildModelMatchersLiteralForTest('gpt-5.2-instant');
    expect(semanticTarget).toBe('instant');
    expect(labelTokens.some((t) => t.includes('instant'))).toBe(true);
    expect(labelTokens.some((t) => t.includes('5.2') || t.includes('5-2'))).toBe(true);
    expect(testIdTokens).toContain('model-switcher-gpt-5-3');
    expect(testIdTokens).toContain('gpt-5.2-instant');
  });
});
