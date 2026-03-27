import { describe, expect, test } from 'vitest';
import { normalizeGrokIdentityProbe } from '../../src/browser/providers/grokAdapter.js';

describe('normalizeGrokIdentityProbe', () => {
  test('drops generic settings labels from guest-like pages', () => {
    expect(
      normalizeGrokIdentityProbe({
        name: 'Settings',
        source: 'dom-label',
        guestAuthCta: true,
      }),
    ).toBeNull();
  });

  test('keeps real identity fields when present', () => {
    expect(
      normalizeGrokIdentityProbe({
        id: 'user-123',
        name: 'Eric Cochran',
        email: 'eric@example.com',
        source: 'next-data',
        guestAuthCta: false,
      }),
    ).toEqual({
      id: 'user-123',
      name: 'Eric Cochran',
      email: 'eric@example.com',
      handle: undefined,
      source: 'next-data',
    });
  });

  test('drops low-signal site handles without stronger identity fields', () => {
    expect(
      normalizeGrokIdentityProbe({
        handle: '@grok',
        source: 'dom-handle',
      }),
    ).toBeNull();
  });
});
