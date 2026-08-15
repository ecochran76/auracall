import { describe, expect, it } from 'vitest';
import { ChatgptServiceConfigSchema } from '../../src/schema/types.js';

describe('ChatGPT mode config schema', () => {
  it('accepts explicit Chat and Work mode with a separate Work model', () => {
    expect(ChatgptServiceConfigSchema.parse({ chatgptMode: 'chat' })).toEqual({
      chatgptMode: 'chat',
    });
    expect(ChatgptServiceConfigSchema.parse({ chatgptMode: 'work', workModel: 'Research' })).toEqual({
      chatgptMode: 'work',
      workModel: 'Research',
    });
  });

  it('rejects unknown ChatGPT modes', () => {
    expect(() => ChatgptServiceConfigSchema.parse({ chatgptMode: 'agent' })).toThrow();
  });

  it('accepts only explicit ChatGPT tool approval policies', () => {
    expect(ChatgptServiceConfigSchema.parse({ chatgptToolApproval: 'manual' })).toEqual({
      chatgptToolApproval: 'manual',
    });
    expect(ChatgptServiceConfigSchema.parse({ chatgptToolApproval: 'allow-once' })).toEqual({
      chatgptToolApproval: 'allow-once',
    });
    expect(ChatgptServiceConfigSchema.parse({ chatgptToolApproval: 'always-allow' })).toEqual({
      chatgptToolApproval: 'always-allow',
    });
    expect(() => ChatgptServiceConfigSchema.parse({ chatgptToolApproval: 'allow' })).toThrow();
  });
});
