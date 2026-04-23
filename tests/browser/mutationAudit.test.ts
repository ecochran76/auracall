import { describe, expect, test } from 'vitest';
import {
  annotateClientMutationContext,
  resolveMutationAudit,
  resolveMutationSource,
} from '../../src/browser/providers/mutationAudit.js';
import type { BrowserProviderListOptions } from '../../src/browser/providers/types.js';

describe('provider mutation audit context', () => {
  test('resolves mutation context directly from provider options', () => {
    const sink = () => undefined;
    const options: BrowserProviderListOptions = {
      mutationAudit: sink,
      mutationSourcePrefix: 'provider:gemini:media',
    };

    expect(resolveMutationAudit(options)).toBe(sink);
    expect(resolveMutationSource(options, 'provider:gemini', 'connect-tab')).toBe(
      'provider:gemini:media:connect-tab',
    );
  });

  test('annotates a connected client with fallback provider context', () => {
    const sink = () => undefined;
    const client = {} as Parameters<typeof annotateClientMutationContext>[0];

    annotateClientMutationContext(client, { mutationAudit: sink }, 'provider:chatgpt');

    expect(resolveMutationAudit(client)).toBe(sink);
    expect(resolveMutationSource(client, 'provider:chatgpt', 'navigate-url')).toBe(
      'provider:chatgpt:navigate-url',
    );
  });
});
