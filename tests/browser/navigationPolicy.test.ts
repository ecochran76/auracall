import { describe, expect, test } from 'vitest';
import { providerNavigationAllowed } from '../../src/browser/providers/navigationPolicy.js';

describe('providerNavigationAllowed', () => {
  test('allows provider navigation by default', () => {
    expect(providerNavigationAllowed()).toBe(true);
    expect(providerNavigationAllowed({})).toBe(true);
  });

  test('forbids provider navigation when the active tab must be preserved', () => {
    expect(providerNavigationAllowed({ preserveActiveTab: true })).toBe(false);
  });
});

