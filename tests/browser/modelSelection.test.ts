import { describe, expect, it } from 'vitest';
import {
  buildModelMatchersLiteralForTest,
  buildModelSelectionExpressionForTest,
  chooseModelPickerNavigationActionForTest,
  scoreModelPickerOptionForTest,
} from '../../src/browser/actions/modelSelection.js';

const expectContains = (arr: string[], value: string) => {
  expect(arr).toContain(value);
};

describe('browser model selection matchers', () => {
  it('targets the current ChatGPT model picker button', () => {
    const expression = buildModelSelectionExpressionForTest('gpt-5.2-pro');
    expect(expression).toContain('[data-testid=\\"model-switcher-dropdown-button\\"]');
    expect(expression).toContain('button.__composer-pill');
    expect(expression).not.toContain('button[aria-label=\\"Switch model\\"]');
    expect(expression).toContain(`closest('form, [data-testid*="composer"]')`);
    expect(expression).toContain(`closest('[data-testid^="conversation-turn"]')`);
    expect(expression).toContain('button[aria-label*=\\"Model\\"]');
  });

  it('waits for the current model picker to mount before failing closed', () => {
    const expression = buildModelSelectionExpressionForTest('Pro');
    expect(expression).toContain('const BUTTON_WAIT_MS = 12000');
    expect(expression).toContain(
      'while (!button && performance.now() - buttonWaitStartedAt <= BUTTON_WAIT_MS)',
    );
    expect(expression).toContain(
      'await new Promise((resolve) => setTimeout(resolve, REOPEN_INTERVAL_MS / 2))',
    );
  });

  it('includes rich tokens for gpt-5.1 base selection', () => {
    const { labelTokens, testIdTokens, semanticTarget } =
      buildModelMatchersLiteralForTest('gpt-5.1');
    expect(semanticTarget).toBe('instant');
    expectContains(labelTokens, 'gpt-5.1');
    expectContains(labelTokens, 'gpt-5-1');
    expectContains(labelTokens, 'gpt51');
    expectContains(labelTokens, 'chatgpt 5.1');
    expectContains(labelTokens, 'instant');
    expectContains(testIdTokens, 'gpt-5-1');
    expectContains(testIdTokens, 'model-switcher-gpt-5-3');
    expect(
      testIdTokens.some(
        (t) => t.includes('gpt-5.1') || t.includes('gpt-5-1') || t.includes('gpt51'),
      ),
    ).toBe(true);
  });

  it('includes pro/research tokens for gpt-5.2-pro', () => {
    const { labelTokens, testIdTokens, semanticTarget } =
      buildModelMatchersLiteralForTest('gpt-5.2-pro');
    expect(semanticTarget).toBe('pro');
    expect(labelTokens.some((t) => t.includes('pro') || t.includes('research'))).toBe(true);
    expectContains(labelTokens, 'extended pro');
    expectContains(labelTokens, 'pro extended');
    expectContains(testIdTokens, 'pro');
    expectContains(testIdTokens, 'model-switcher-pro');
    expectContains(testIdTokens, 'model-switcher-gpt-5-4-pro');
  });

  it('includes pro + 5.2 tokens for gpt-5.2-pro', () => {
    const { labelTokens, testIdTokens } = buildModelMatchersLiteralForTest('gpt-5.2-pro');
    expect(labelTokens.some((t) => t.includes('pro'))).toBe(true);
    expect(labelTokens.some((t) => t.includes('5.2') || t.includes('5-2'))).toBe(true);
    expect(testIdTokens.some((t) => t.includes('gpt-5.2-pro') || t.includes('gpt-5-2-pro'))).toBe(
      true,
    );
  });

  it('includes thinking tokens for gpt-5.2-thinking', () => {
    const { labelTokens, testIdTokens, semanticTarget } =
      buildModelMatchersLiteralForTest('gpt-5.2-thinking');
    expect(semanticTarget).toBe('thinking');
    expect(labelTokens.some((t) => t.includes('thinking'))).toBe(true);
    expect(labelTokens.some((t) => t.includes('5.2') || t.includes('5-2'))).toBe(true);
    expect(testIdTokens).toContain('model-switcher-gpt-5-4-thinking');
    expect(testIdTokens).toContain('gpt-5.2-thinking');
  });

  it('includes Sol family tokens for gpt-5.6-sol', () => {
    const { labelTokens, testIdTokens, semanticTarget } =
      buildModelMatchersLiteralForTest('gpt-5.6-sol');
    expect(semanticTarget).toBe('sol');
    expect(labelTokens).toContain('gpt-5.6-sol');
    expect(testIdTokens).toContain('gpt-5-6-sol');
  });

  it.each([
    ['GPT-5.6 Sol', 'sol'],
    ['GPT-5.6 Terra', 'terra'],
    ['GPT-5.6 Luna', 'luna'],
    ['GPT-5.5', 'legacy'],
  ] as const)('classifies the current %s model-family row', (label, kind) => {
    const scored = scoreModelPickerOptionForTest(label, { text: label });
    expect(scored.optionKind).toBe(kind);
    expect(scored.score).toBeGreaterThan(0);
  });

  it('rejects a different GPT-5.6 family even though the version token matches', () => {
    expect(scoreModelPickerOptionForTest('GPT-5.6 Terra', { text: 'GPT-5.6 Sol' }).score).toBe(0);
    expect(scoreModelPickerOptionForTest('GPT-5.6 Luna', { text: 'GPT-5.6 Terra' }).score).toBe(0);
  });

  it('plans the provider-free compact to advanced to model submenu path', () => {
    expect(
      chooseModelPickerNavigationActionForTest([
        {
          text: 'Advanced',
          ariaLabel: 'Show advanced options',
          role: 'menuitem',
          expanded: 'false',
        },
      ]),
    ).toEqual({ kind: 'open-advanced', index: 0 });

    expect(
      chooseModelPickerNavigationActionForTest([
        { text: 'Power', role: 'menuitem', expanded: null },
        { text: 'Show advanced options', role: 'menuitem', expanded: 'false' },
      ]),
    ).toEqual({ kind: 'open-advanced', index: 1 });

    expect(
      chooseModelPickerNavigationActionForTest([
        { text: 'Show compact options', role: 'menuitem', expanded: 'true' },
        {
          text: 'ModelGPT-5.6 Sol',
          ariaLabel: 'Model GPT-5.6 Sol',
          role: 'menuitem',
          expanded: 'false',
        },
        { text: 'EffortLight', role: 'menuitem', expanded: 'false' },
      ]),
    ).toEqual({ kind: 'open-model', index: 1 });

    expect(
      chooseModelPickerNavigationActionForTest([
        { text: 'Model GPT-5.6 Sol', role: 'menuitem', expanded: 'true' },
        { text: 'GPT-5.6 Sol', role: 'menuitemradio', expanded: null },
      ]),
    ).toBeNull();
  });

  it('embeds semantic advanced-menu navigation in the browser expression', () => {
    const expression = buildModelSelectionExpressionForTest('GPT-5.6 Terra');
    expect(() => new Function(`return ${expression}`)).not.toThrow();
    expect(expression).toContain('show advanced options');
    expect(expression).toContain("kind: 'open-advanced'");
    expect(expression).toContain("kind: 'open-model'");
    expect(expression).toContain("getAttribute('aria-expanded')");
  });

  it('includes instant tokens for gpt-5.2-instant', () => {
    const { labelTokens, testIdTokens, semanticTarget } =
      buildModelMatchersLiteralForTest('gpt-5.2-instant');
    expect(semanticTarget).toBe('instant');
    expect(labelTokens.some((t) => t.includes('instant'))).toBe(true);
    expect(labelTokens.some((t) => t.includes('5.2') || t.includes('5-2'))).toBe(true);
    expect(testIdTokens).toContain('model-switcher-gpt-5-3');
    expect(testIdTokens).toContain('gpt-5.2-instant');
  });

  it('does not satisfy a Pro request with an Instant row that mentions Pro', () => {
    const instant = scoreModelPickerOptionForTest('Pro', {
      text: 'Instant\nFast everyday answers\nUpgrade to Pro for extended reasoning',
      testId: 'model-switcher-gpt-5-3',
    });
    const extendedPro = scoreModelPickerOptionForTest('Pro', {
      text: 'Extended Pro\nAdvanced reasoning',
      testId: 'model-switcher-pro',
    });
    expect(instant.optionKind).toBe('instant');
    expect(instant.score).toBe(0);
    expect(extendedPro.optionKind).toBe('pro');
    expect(extendedPro.score).toBeGreaterThan(0);
  });

  it('recognizes updated Pro label variants without falling back to Instant', () => {
    expect(scoreModelPickerOptionForTest('Pro', { text: 'Pro Extended' }).optionKind).toBe('pro');
    expect(scoreModelPickerOptionForTest('Pro', { text: 'ChatGPT Pro' }).optionKind).toBe('pro');
    expect(scoreModelPickerOptionForTest('Pro', { text: 'Instant' }).score).toBe(0);
  });

  it('keeps effort labels separate from GPT-5.6 Sol model-family options', () => {
    expect(scoreModelPickerOptionForTest('gpt-5.6-sol', { text: 'Medium' }).optionKind).toBe(
      'thinking',
    );
    expect(scoreModelPickerOptionForTest('gpt-5.6-sol', { text: 'High' }).score).toBe(0);
    expect(scoreModelPickerOptionForTest('gpt-5.6-sol', { text: 'Extra High' }).score).toBe(0);
    expect(
      scoreModelPickerOptionForTest('gpt-5.6-sol', { text: 'GPT-5.6 Sol' }).score,
    ).toBeGreaterThan(0);
    expect(scoreModelPickerOptionForTest('gpt-5.6-sol', { text: 'Pro' }).score).toBe(0);
  });
});
