import { beforeAll, describe, expect, test } from 'vitest';
import { normalizeGrokModelLabel } from '../../src/browser/providers/grokModelMenu.js';
import type { ServicesRegistry } from '../../src/services/registry.js';
import { ensureServicesRegistry, resolveServiceModelLabels } from '../../src/services/registry.js';

describe('normalizeGrokModelLabel', () => {
  test('splits concatenated menu text from the current Grok UI', () => {
    expect(normalizeGrokModelLabel('AutoChooses Fast or Expert')).toBe('Auto Chooses Fast or Expert');
    expect(normalizeGrokModelLabel('FastQuick responses - Grok 4.20')).toBe('Fast Quick responses - Grok 4.20');
  });
});

describe('resolveServiceModelLabels(grok)', () => {
  let registry: ServicesRegistry;

  beforeAll(async () => {
    registry = await ensureServicesRegistry();
  });

  test('maps legacy thinking labels to current Grok picker entries from the service config', () => {
    expect(resolveServiceModelLabels(registry, 'grok', 'Grok 4.1 Thinking')).toEqual(['Expert']);
    expect(resolveServiceModelLabels(registry, 'grok', 'grok-4.1')).toEqual(['Expert']);
  });

  test('maps generic Grok aliases to current picker entries from the service config', () => {
    expect(resolveServiceModelLabels(registry, 'grok', 'grok')).toEqual(['Heavy']);
    expect(resolveServiceModelLabels(registry, 'grok', 'grok-4.20')).toEqual(['Heavy']);
  });

  test('passes through explicit current picker labels', () => {
    expect(resolveServiceModelLabels(registry, 'grok', 'Auto')).toEqual(['Auto']);
    expect(resolveServiceModelLabels(registry, 'grok', 'Fast')).toEqual(['Fast']);
    expect(resolveServiceModelLabels(registry, 'grok', 'Expert')).toEqual(['Expert']);
    expect(resolveServiceModelLabels(registry, 'grok', 'Heavy')).toEqual(['Heavy']);
  });
});
