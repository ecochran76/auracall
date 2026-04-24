import { describe, expect, test } from 'vitest';
import {
  consumeRawDevToolsEscapeHatch,
  RAW_DEVTOOLS_ALLOW_ENV,
  RAW_DEVTOOLS_ALLOW_FLAG,
  RAW_DEVTOOLS_MUTATING_SCRIPT_ALLOWLIST,
  requireRawDevToolsEscapeHatch,
} from '../../scripts/raw-devtools-guard.js';

describe('raw DevTools script guard', () => {
  test('consumes the explicit allow flag so script positional args remain stable', () => {
    const argv = ['node', 'script.ts', RAW_DEVTOOLS_ALLOW_FLAG, 'localhost', '45013'];

    expect(consumeRawDevToolsEscapeHatch(argv, {})).toBe(true);
    expect(argv).toEqual(['node', 'script.ts', 'localhost', '45013']);
  });

  test('accepts the environment escape hatch', () => {
    expect(consumeRawDevToolsEscapeHatch(['node', 'script.ts'], {
      [RAW_DEVTOOLS_ALLOW_ENV]: '1',
    })).toBe(true);
  });

  test('throws with browser-service guidance when no escape hatch is present', () => {
    expect(() =>
      requireRawDevToolsEscapeHatch({
        scriptName: 'scripts/verify-thing.ts',
        argv: ['node', 'scripts/verify-thing.ts'],
        env: {},
      }),
    ).toThrow(/browser-tools\.ts --port <port>/);
  });

  test('keeps the mutating raw script allowlist explicit', () => {
    expect([...RAW_DEVTOOLS_MUTATING_SCRIPT_ALLOWLIST].sort()).toEqual([
      'scripts/test-remote-chrome.ts',
      'scripts/verify-grok-project-remove-steps.ts',
      'scripts/verify-grok-project-sources-steps.ts',
    ]);
  });
});
