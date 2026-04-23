export interface ChatgptThinkingEvidence {
  label: string;
  evidenceRef: 'chatgpt-placeholder-turn' | 'chatgpt-thinking-status';
}

const CHATGPT_THINKING_SELECTORS = [
  'span.loading-shimmer',
  'span.flex.items-center.gap-1.truncate.text-start.align-middle.text-token-text-tertiary',
  '[data-testid*="thinking"]',
  '[data-testid*="reasoning"]',
  '[role="status"]',
  '[aria-live="polite"]',
];

const CHATGPT_THINKING_KEYWORDS = [
  'pro thinking',
  'thinking',
  'reasoning',
  'clarifying',
  'planning',
  'drafting',
  'summarizing',
];

export function sanitizeChatgptThinkingText(raw: string): string {
  if (!raw) {
    return '';
  }
  const trimmed = raw.trim();
  const normalized = trimmed.replace(/\s+/g, ' ');
  const lower = normalized.toLowerCase();
  if (isChatgptThinkingPlaceholder(normalized)) {
    return 'Thinking';
  }
  if (lower.startsWith('you said:') || lower.includes('### file:')) {
    return '';
  }
  const prefixPattern = /^(pro thinking)\s*[•:\-–—]*\s*/i;
  if (prefixPattern.test(normalized)) {
    const remainder = normalized.replace(prefixPattern, '').trim();
    return remainder || 'Thinking';
  }
  if (lower.includes('thinking')) return 'Thinking';
  if (lower.includes('reasoning')) return 'Reasoning';
  if (lower.includes('clarifying')) return 'Clarifying';
  if (lower.includes('planning')) return 'Planning';
  if (lower.includes('drafting')) return 'Drafting';
  if (lower.includes('summarizing')) return 'Summarizing';
  if (normalized.length > 80) return '';
  return normalized;
}

export function classifyChatgptThinkingText(raw: string): ChatgptThinkingEvidence | null {
  const label = sanitizeChatgptThinkingText(raw);
  if (!label) return null;
  return {
    label,
    evidenceRef: isChatgptThinkingPlaceholder(raw) ? 'chatgpt-placeholder-turn' : 'chatgpt-thinking-status',
  };
}

export function buildChatgptThinkingStatusExpression(): string {
  const selectorLiteral = JSON.stringify(CHATGPT_THINKING_SELECTORS);
  const keywordsLiteral = JSON.stringify(CHATGPT_THINKING_KEYWORDS);
  return `(() => {
    const selectors = ${selectorLiteral};
    const keywords = ${keywordsLiteral};
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
    const isVisible = (node) => {
      if (!(node instanceof Element)) return false;
      const rect = node.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      const style = window.getComputedStyle(node);
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    };
    const nodes = new Set();
    for (const selector of selectors) {
      document.querySelectorAll(selector).forEach((node) => nodes.add(node));
    }
    document.querySelectorAll('[data-testid]').forEach((node) => nodes.add(node));
    const assistantTurns = Array.from(document.querySelectorAll('[data-message-author-role="assistant"], [data-turn="assistant"]'));
    const lastAssistantTurn = assistantTurns.length > 0 ? assistantTurns[assistantTurns.length - 1] : null;
    if (lastAssistantTurn instanceof HTMLElement && isVisible(lastAssistantTurn)) {
      const assistantText = normalize(lastAssistantTurn.textContent || '');
      if (/^chatgpt said:\\s*thinking\\s*$/i.test(assistantText)) {
        return assistantText;
      }
    }
    for (const node of nodes) {
      if (!(node instanceof HTMLElement)) continue;
      if (!isVisible(node)) continue;
      const text = normalize(node.textContent || '');
      if (!text) continue;
      const classLabel = (node.className || '').toLowerCase();
      const dataLabel = ((node.getAttribute('data-testid') || '') + ' ' + (node.getAttribute('aria-label') || '')).toLowerCase();
      const normalizedText = text.toLowerCase();
      const matches = keywords.some((keyword) =>
        normalizedText.includes(keyword) || classLabel.includes(keyword) || dataLabel.includes(keyword)
      );
      if (matches) {
        const shimmerChild = node.querySelector('span.flex.items-center.gap-1.truncate.text-start.align-middle.text-token-text-tertiary');
        if (shimmerChild?.textContent?.trim()) {
          return shimmerChild.textContent.trim();
        }
        return text.trim();
      }
    }
    return null;
  })()`;
}

export function buildChatgptStopControlVisibleExpression(): string {
  return `Boolean(document.querySelector('button[data-testid="stop-button"], button[aria-label*="Stop"], button[aria-label*="stop"]'))`;
}

function isChatgptThinkingPlaceholder(value: string): boolean {
  return /^chatgpt said:\s*thinking\s*$/i.test(String(value || '').replace(/\s+/g, ' ').trim());
}
