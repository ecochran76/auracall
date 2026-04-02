import { describe, expect, test } from 'vitest';
import { __test__ } from '../../packages/browser-service/src/manualLogin.js';

describe('launchManualLoginSession port selection', () => {
  test('derives distinct stable preferred ports for different managed browser profiles', () => {
    const chatgptPort = __test__.deriveStablePreferredDebugPort({
      userDataDir: '/home/ecochran76/.auracall/browser-profiles/default/chatgpt',
      profileName: 'Default',
      range: [45000, 45100],
    });
    const grokPort = __test__.deriveStablePreferredDebugPort({
      userDataDir: '/home/ecochran76/.auracall/browser-profiles/default/grok',
      profileName: 'Default',
      range: [45000, 45100],
    });

    expect(chatgptPort).not.toBe(grokPort);
    expect(chatgptPort).toBeGreaterThanOrEqual(45000);
    expect(chatgptPort).toBeLessThanOrEqual(45100);
    expect(grokPort).toBeGreaterThanOrEqual(45000);
    expect(grokPort).toBeLessThanOrEqual(45100);
  });

  test('stays stable for the same managed browser profile input', () => {
    const first = __test__.deriveStablePreferredDebugPort({
      userDataDir: '/home/ecochran76/.auracall/browser-profiles/wsl-chrome-2/chatgpt',
      profileName: 'Profile 1',
      range: [45000, 45100],
    });
    const second = __test__.deriveStablePreferredDebugPort({
      userDataDir: '/home/ecochran76/.auracall/browser-profiles/wsl-chrome-2/chatgpt',
      profileName: 'Profile 1',
      range: [45000, 45100],
    });

    expect(first).toBe(second);
  });
});
