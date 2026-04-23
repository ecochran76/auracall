export interface GrokAssistantSnapshot {
  count: number;
  lastText: string;
  lastMarkdown: string;
  lastHtml: string;
  toastText: string;
}

export type GrokServiceStateEvidence =
  | {
      kind: 'provider-error';
      evidenceRef: 'grok-rate-limit-toast';
      confidence: 'high';
    }
  | {
      kind: 'assistant-visible';
      evidenceRef: 'grok-assistant-visible';
      confidence: 'high';
    }
  | {
      kind: 'none';
      evidenceRef: 'grok-live-probe-no-signal';
      confidence: 'low';
    };

export function isGrokRateLimitToastText(value: string): boolean {
  return /query limit|too many requests|rate limit|request limit|try again in\s+\d+/i.test(value);
}

export function hasGrokVisibleAssistantText(snapshot: Pick<GrokAssistantSnapshot, 'lastMarkdown' | 'lastText'>): boolean {
  return (snapshot.lastMarkdown || snapshot.lastText).trim().length > 0;
}

export function classifyGrokAssistantSnapshot(snapshot: GrokAssistantSnapshot): GrokServiceStateEvidence {
  if (snapshot.toastText && isGrokRateLimitToastText(snapshot.toastText)) {
    return {
      kind: 'provider-error',
      evidenceRef: 'grok-rate-limit-toast',
      confidence: 'high',
    };
  }
  if (hasGrokVisibleAssistantText(snapshot)) {
    return {
      kind: 'assistant-visible',
      evidenceRef: 'grok-assistant-visible',
      confidence: 'high',
    };
  }
  return {
    kind: 'none',
    evidenceRef: 'grok-live-probe-no-signal',
    confidence: 'low',
  };
}
