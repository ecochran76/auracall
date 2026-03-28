import { describe, expect, test } from 'vitest';
import { stripProjectInstructionsPrefixFromConversationContext } from '../../src/browser/llmService/llmService.js';
import type { ConversationContext } from '../../src/browser/providers/domain.js';

describe('project-scoped conversation context normalization', () => {
  test('strips a prefixed project instructions block from the first assistant message', () => {
    const context: ConversationContext = {
      provider: 'grok',
      conversationId: 'conversation-123',
      messages: [
        { role: 'user', text: 'Reply exactly with: Context Probe Answer' },
        {
          role: 'assistant',
          text: 'Context probe instructions\nLine two\nContext Probe Answer',
        },
      ],
    };

    expect(
      stripProjectInstructionsPrefixFromConversationContext(
        context,
        'Context probe instructions\nLine two\n',
      ),
    ).toEqual({
      provider: 'grok',
      conversationId: 'conversation-123',
      messages: [
        { role: 'user', text: 'Reply exactly with: Context Probe Answer' },
        { role: 'assistant', text: 'Context Probe Answer' },
      ],
    });
  });

  test('does not strip when the assistant message does not start with the project instructions', () => {
    const context: ConversationContext = {
      provider: 'grok',
      conversationId: 'conversation-123',
      messages: [
        { role: 'assistant', text: 'Context Probe Answer\nContext probe instructions\nLine two' },
      ],
    };

    expect(
      stripProjectInstructionsPrefixFromConversationContext(
        context,
        'Context probe instructions\nLine two\n',
      ),
    ).toEqual(context);
  });
});
