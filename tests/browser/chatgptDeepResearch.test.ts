import { describe, expect, test } from 'vitest';
import {
  buildDeepResearchPlanStartExpressionForTest,
  isChatgptDeepResearchTool,
} from '../../src/browser/actions/chatgptDeepResearch.js';

describe('ChatGPT Deep Research staged flow', () => {
  test('recognizes Deep Research aliases without matching unrelated tools', () => {
    expect(isChatgptDeepResearchTool('deep-research')).toBe(true);
    expect(isChatgptDeepResearchTool('Deep Research')).toBe(true);
    expect(isChatgptDeepResearchTool('research')).toBe(true);
    expect(isChatgptDeepResearchTool('web-search')).toBe(false);
    expect(isChatgptDeepResearchTool('create image')).toBe(false);
  });

  test('looks for the research plan Start CTA without accepting modify-plan controls', () => {
    const expression = buildDeepResearchPlanStartExpressionForTest(15_000);
    expect(expression).toContain('dispatchClickSequence');
    expect(expression).toContain('start research');
    expect(expression).toContain('start deep research');
    expect(expression).toContain('modify');
    expect(expression).toContain('refine');
    expect(expression).toContain('plan-ready-no-start');
    expect(expression).toContain('start-clicked');
  });
});
