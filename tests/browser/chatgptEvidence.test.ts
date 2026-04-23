import { describe, expect, it } from 'vitest';
import {
  buildChatgptStopControlVisibleExpression,
  buildChatgptThinkingStatusExpression,
  classifyChatgptThinkingText,
  sanitizeChatgptThinkingText,
} from '../../src/browser/providers/chatgptEvidence.js';

describe('ChatGPT evidence helpers', () => {
  it('classifies placeholder thinking as provider-owned placeholder evidence', () => {
    expect(classifyChatgptThinkingText('  ChatGPT said: Thinking  ')).toEqual({
      label: 'Thinking',
      evidenceRef: 'chatgpt-placeholder-turn',
    });
  });

  it('sanitizes generic thinking/status labels without accepting verbose echoes', () => {
    expect(sanitizeChatgptThinkingText('Pro thinking - searching project files')).toBe('searching project files');
    expect(sanitizeChatgptThinkingText('reasoning through the patch')).toBe('Reasoning');
    expect(
      classifyChatgptThinkingText(
        'You said: Compare merge sort and quicksort in exactly 6 bullet points. ### File: README.md',
      ),
    ).toBeNull();
  });

  it('keeps thinking and stop-control DOM contracts centralized', () => {
    const thinkingExpression = buildChatgptThinkingStatusExpression();
    expect(thinkingExpression).toContain('[data-message-author-role="assistant"], [data-turn="assistant"]');
    expect(thinkingExpression).toContain('chatgpt said:\\s*thinking');
    expect(thinkingExpression).toContain('lastAssistantTurn');
    expect(buildChatgptStopControlVisibleExpression()).toContain('button[data-testid="stop-button"]');
  });
});
