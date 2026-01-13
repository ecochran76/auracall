import { describe, expect, test, afterEach } from 'vitest';
import { resolveWslHost } from '../../packages/browser-service/src/chromeLifecycle.js';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) {
      delete process.env[key];
    }
  }
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    process.env[key] = value;
  }
});

describe('chromeLifecycle (package)', () => {
  test('resolveWslHost prefers explicit env override', () => {
    process.env.BROWSER_SERVICE_BROWSER_REMOTE_DEBUG_HOST = '10.0.0.5';
    expect(resolveWslHost()).toBe('10.0.0.5');
  });
});
