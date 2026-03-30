import { describe, expect, it } from 'vitest';
import { buildModelMatchersLiteralForTest } from '../../src/browser/actions/modelSelection.js';

const expectSome = (arr: string[], predicate: (s: string) => boolean) => {
  expect(arr.some(predicate)).toBe(true);
};

describe('browser model selection arbitrary labels', () => {
  it('accepts custom label tokens (e.g., 5.1 Instant)', () => {
    const { labelTokens, testIdTokens, semanticTarget } = buildModelMatchersLiteralForTest('5.1 Instant');
    expect(semanticTarget).toBe('instant');
    expectSome(labelTokens, (t) => t.includes('5.1'));
    expectSome(labelTokens, (t) => t.includes('instant'));
    expectSome(testIdTokens, (t) => t.includes('gpt-5-3'));
  });

  it('accepts Thinking label', () => {
    const { labelTokens, semanticTarget } = buildModelMatchersLiteralForTest('Thinking');
    expect(semanticTarget).toBe('thinking');
    expectSome(labelTokens, (t) => t.includes('thinking'));
  });
});
