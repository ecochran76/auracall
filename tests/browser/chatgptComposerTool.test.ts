import { describe, expect, test } from 'vitest';
import {
  isNonPersistentComposerToolForTest,
  resolveComposerToolCandidatesForTest,
  resolveComposerToolLocationForTest,
  resolveCurrentComposerToolSelectionForTest,
} from '../../src/browser/actions/chatgptComposerTool.js';

describe('chatgpt composer tool selection', () => {
  test('normalizes aliases to the current visible tool labels', () => {
    expect(resolveComposerToolCandidatesForTest('web-search')).toEqual(['web search']);
    expect(resolveComposerToolCandidatesForTest('search')).toEqual(['search', 'web search']);
    expect(resolveComposerToolCandidatesForTest('research')).toEqual(['research', 'deep research']);
    expect(resolveComposerToolCandidatesForTest('image')).toEqual(['image', 'create image']);
    expect(resolveComposerToolCandidatesForTest('knowledge')).toEqual(['knowledge', 'company knowledge']);
    expect(resolveComposerToolCandidatesForTest('study')).toEqual(['study', 'study and learn']);
    expect(resolveComposerToolCandidatesForTest('agent')).toEqual(['agent', 'agent mode']);
    expect(resolveComposerToolCandidatesForTest('quickbooks')).toEqual(['quickbooks', 'intuit quickbooks']);
    expect(resolveComposerToolCandidatesForTest('quiz')).toEqual(['quiz', 'quizzes']);
    expect(resolveComposerToolCandidatesForTest('gh')).toEqual(['gh', 'github']);
    expect(resolveComposerToolCandidatesForTest('google-drive')).toEqual(['google drive']);
  });

  test('keeps manifest-owned known labels available for current-selection detection', () => {
    expect(
      resolveCurrentComposerToolSelectionForTest(null, [], [{ label: 'canvas', selected: true }]),
    ).toEqual({ label: 'canvas', source: 'more-menu' });
  });

  test('classifies Deep Research as a non-persistent staged tool', () => {
    expect(isNonPersistentComposerToolForTest('deep-research')).toBe(true);
    expect(isNonPersistentComposerToolForTest('research')).toBe(true);
    expect(isNonPersistentComposerToolForTest('web-search')).toBe(false);
    expect(isNonPersistentComposerToolForTest('canvas')).toBe(false);
  });

  test('classifies tools as top-level or More submenu choices', () => {
    expect(
      resolveComposerToolLocationForTest('web-search', ['company knowledge', 'create image', 'deep research', 'web search', 'more']),
    ).toEqual({ location: 'top', label: 'web search' });
    expect(
      resolveComposerToolLocationForTest(
        'canvas',
        ['company knowledge', 'create image', 'deep research', 'web search', 'more'],
        ['study and learn', 'agent mode', 'canvas', 'github'],
      ),
    ).toEqual({ location: 'more', label: 'canvas' });
    expect(resolveComposerToolLocationForTest('calendar', ['company knowledge', 'create image', 'more'], ['github'])).toEqual({
      location: 'missing',
    });
  });

  test('prefers visible composer chip when reading current tool state', () => {
    expect(
      resolveCurrentComposerToolSelectionForTest('Canvas', [{ label: 'web search', selected: true }], []),
    ).toEqual({ label: 'Canvas', source: 'chip' });
  });

  test('reads current tool state from selected top-level or More menu rows when chip is absent', () => {
    expect(
      resolveCurrentComposerToolSelectionForTest(null, [
        { label: 'company knowledge', selected: true },
        { label: 'web search', selected: true },
      ], []),
    ).toEqual({ label: 'web search', source: 'top-menu' });

    expect(
      resolveCurrentComposerToolSelectionForTest(null, [{ label: 'more', selected: false }], [
        { label: 'google drive', selected: false },
        { label: 'canvas', selected: true },
      ]),
    ).toEqual({ label: 'canvas', source: 'more-menu' });
  });
});
