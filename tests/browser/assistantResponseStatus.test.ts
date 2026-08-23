import { describe, expect, test } from 'vitest';
import {
  buildAnswerNowPlaceholderPredicateJs,
  isAnswerNowPlaceholderText,
} from '../../src/browser/actions/assistantResponse.js';

describe('Answer Now placeholder detection', () => {
  test.each([
    'ChatGPT said:',
    'ChatGPT said: Pro thinking Answer now',
    'File upload request Pro thinking Answer now',
    'ChatGPT said: File upload request Pro thinking Answer now',
  ])('recognizes exact short provider chrome: %s', (value) => {
    expect(isAnswerNowPlaceholderText(value)).toBe(true);
  });

  test.each([
    'ChatGPT said: The Answer now control remains visible, but this is a complete substantive response.',
    'Pro thinking Answer now is the UI state we observed and documented.',
    'ChatGPT said: Pro thinking Answer now with additional answer content',
  ])('retains real answer content containing provider chrome: %s', (value) => {
    expect(isAnswerNowPlaceholderText(value)).toBe(false);
  });

  test('injects the same closure-free predicate into renderer expressions', () => {
    const factory = new Function(
      `${buildAnswerNowPlaceholderPredicateJs('isPlaceholder')} return isPlaceholder;`,
    ) as () => (value: unknown) => boolean;
    const predicate = factory();

    expect(predicate({ text: 'ChatGPT said: Pro thinking Answer now' })).toBe(true);
    expect(predicate({ text: 'ChatGPT said: A complete answer that mentions Answer now in context.' })).toBe(false);
  });
});
