import { describe, expect, test } from 'vitest';
import {
  buildDeepResearchPlanEditExpressionForTest,
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
    expect(expression).toContain("label === 'edit'");
    expect(expression).toContain("label === 'update'");
    expect(expression).toContain('modify');
    expect(expression).toContain('refine');
    expect(expression).toContain('plan-ready-no-start');
    expect(expression).toContain('start-clicked');
  });

  test('treats timed provider auto-start as a terminal staged outcome', () => {
    const expression = buildDeepResearchPlanStartExpressionForTest(15_000);
    expect(expression).toContain('auto-started');
    expect(expression).toContain('researchStarted');
    expect(expression).toContain('researching');
    expect(expression).toContain('research in progress');
    expect(expression).toContain('preparing analytical research');
  });

  test('does not treat sidebar or title text as research-plan evidence', () => {
    const expression = buildDeepResearchPlanStartExpressionForTest(15_000);
    expect(expression).toContain('conversationAssistantText');
    expect(expression).toContain('[data-testid^="conversation-turn"]');
    expect(expression).toContain('assistantPlanVisible');
  });

  test('supports opening the plan editor before timed auto-start', () => {
    const expression = buildDeepResearchPlanEditExpressionForTest(15_000);
    expect(expression).toContain("PLAN_ACTION === 'edit'");
    expect(expression).toContain('plan-edit-opened');
    expect(expression).toContain('iframe-edit-target');
    expect(expression).toContain('modifyPlanLabel');
    expect(expression).toContain("PLAN_ACTION === 'edit' && state.startEntry?.button");
  });
});
