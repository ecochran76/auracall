import { describe, expect, it } from 'vitest';
import {
  buildThinkingTimeExpressionForTest,
  evaluateChatgptProModeGate,
  formatChatgptProModeGateError,
  resolveChatgptProModeFromThinkingTime,
} from '../../src/browser/actions/thinkingTime.js';

describe('browser thinking-time selection expression', () => {
  it('uses centralized menu selectors and normalized matching', () => {
    const expression = buildThinkingTimeExpressionForTest();
    expect(expression).toContain('const MENU_CONTAINER_SELECTOR');
    expect(expression).toContain('const MENU_ITEM_SELECTOR');
    expect(expression).toContain('role=\\"menu\\"');
    expect(expression).toContain('data-radix-collection-root');
    expect(expression).toContain('role=\\"menuitem\\"');
    expect(expression).toContain('role=\\"menuitemradio\\"');
    expect(expression).toContain('thinking time');
    expect(expression).toContain('normalize');
    expect(expression).toContain('extended');
  });

  it('targets the requested thinking time level', () => {
    const levels = ['light', 'standard', 'extended', 'heavy'] as const;
    for (const level of levels) {
      const expression = buildThinkingTimeExpressionForTest(level);
      expect(expression).toContain('const TARGET_LEVELS');
      if (level === 'light') {
        expect(expression).toContain('"light","standard"');
      } else if (level === 'heavy') {
        expect(expression).toContain('"heavy","extended"');
      } else {
        expect(expression).toContain(`"${level}"`);
      }
    }
  });
});

describe('ChatGPT Pro mode account gate', () => {
  it('maps thinking-time aliases to ChatGPT Pro modes', () => {
    expect(resolveChatgptProModeFromThinkingTime('light')).toBe('standard');
    expect(resolveChatgptProModeFromThinkingTime('standard')).toBe('standard');
    expect(resolveChatgptProModeFromThinkingTime('extended')).toBe('extended');
    expect(resolveChatgptProModeFromThinkingTime('heavy')).toBe('extended');
  });

  it('allows Pro accounts to use standard and extended Pro modes', () => {
    expect(
      evaluateChatgptProModeGate('standard', {
        accountLevel: 'Pro',
        accountPlanType: 'pro',
        accountStructure: 'personal',
      }),
    ).toMatchObject({
      allowed: true,
      proMode: 'standard',
      accountLevel: 'Pro',
    });
    expect(
      evaluateChatgptProModeGate('extended', {
        accountLevel: 'Pro',
        accountPlanType: 'pro',
        accountStructure: 'personal',
      }),
    ).toMatchObject({
      allowed: true,
      proMode: 'extended',
      accountPlanType: 'pro',
    });
  });

  it('blocks Business accounts before selecting a Pro mode', () => {
    const gate = evaluateChatgptProModeGate('heavy', {
      accountLevel: 'Business',
      accountPlanType: 'team',
      accountStructure: 'workspace',
    });
    expect(gate).toMatchObject({
      allowed: false,
      proMode: 'extended',
      reason: 'requires-pro-account',
    });
    expect(formatChatgptProModeGateError(gate)).toContain('requires a Pro account');
    expect(formatChatgptProModeGateError(gate)).toContain('level=Business');
  });

  it('blocks unverified accounts instead of guessing the quota lane', () => {
    const gate = evaluateChatgptProModeGate('standard', null);
    expect(gate).toMatchObject({
      allowed: false,
      proMode: 'standard',
      reason: 'account-unverified',
    });
    expect(formatChatgptProModeGateError(gate)).toContain('could not verify');
  });
});
