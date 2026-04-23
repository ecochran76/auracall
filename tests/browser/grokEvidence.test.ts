import { describe, expect, it } from 'vitest';
import {
  classifyGrokAssistantSnapshot,
  hasGrokVisibleAssistantText,
  isGrokRateLimitToastText,
  type GrokAssistantSnapshot,
} from '../../src/browser/providers/grokEvidence.js';

function snapshot(overrides: Partial<GrokAssistantSnapshot>): GrokAssistantSnapshot {
  return {
    count: 0,
    lastText: '',
    lastMarkdown: '',
    lastHtml: '',
    toastText: '',
    ...overrides,
  };
}

describe('Grok evidence helpers', () => {
  it('classifies visible rate-limit toasts as provider errors', () => {
    const evidence = classifyGrokAssistantSnapshot(
      snapshot({
        toastText: 'Query limit reached for Auto. Try again in 4 minutes.',
      }),
    );

    expect(evidence).toEqual({
      kind: 'provider-error',
      evidenceRef: 'grok-rate-limit-toast',
      confidence: 'high',
    });
    expect(isGrokRateLimitToastText('Too many requests. Try again in 2 minutes.')).toBe(true);
  });

  it('classifies visible assistant text as incoming response evidence', () => {
    expect(hasGrokVisibleAssistantText(snapshot({ lastMarkdown: 'Partial Grok answer' }))).toBe(true);
    expect(classifyGrokAssistantSnapshot(snapshot({ lastText: 'Partial Grok answer' }))).toEqual({
      kind: 'assistant-visible',
      evidenceRef: 'grok-assistant-visible',
      confidence: 'high',
    });
  });

  it('returns no-signal evidence when Grok has no visible assistant or provider error', () => {
    expect(classifyGrokAssistantSnapshot(snapshot({ count: 1 }))).toEqual({
      kind: 'none',
      evidenceRef: 'grok-live-probe-no-signal',
      confidence: 'low',
    });
  });
});
