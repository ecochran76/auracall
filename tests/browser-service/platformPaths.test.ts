import { afterEach, describe, expect, test } from 'vitest';
import {
  detectChromiumBrowserFamily,
  inferWindowsLocalAppDataRoot,
  normalizeComparablePath,
  toWindowsPath,
  toWslPath,
} from '../../packages/browser-service/src/platformPaths.js';

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

describe('platformPaths (package)', () => {
  test('converts WSL absolute paths to Windows UNC paths', () => {
    process.env.WSL_DISTRO_NAME = 'Ubuntu';
    expect(toWindowsPath('/home/ecochran76/.auracall/browser-profile-wsl')).toBe(
      '\\\\wsl.localhost\\Ubuntu\\home\\ecochran76\\.auracall\\browser-profile-wsl',
    );
  });

  test('normalizes WSL UNC paths back into Linux paths', () => {
    process.env.WSL_DISTRO_NAME = 'Ubuntu';
    expect(toWslPath('\\\\wsl.localhost\\Ubuntu\\home\\ecochran76\\.auracall\\browser-profile-wsl')).toBe(
      '/home/ecochran76/.auracall/browser-profile-wsl',
    );
  });

  test('normalizes Windows drive paths into WSL mount paths', () => {
    expect(toWslPath('C:\\Users\\ecoch\\AppData\\Local\\Google\\Chrome\\User Data')).toBe(
      '/mnt/c/Users/ecoch/AppData/Local/Google/Chrome/User Data',
    );
  });

  test('detects Chromium browser family from executable and user-data paths', () => {
    expect(detectChromiumBrowserFamily('/mnt/c/Program Files/Google/Chrome/Application/chrome.exe')).toBe('chrome');
    expect(
      detectChromiumBrowserFamily('/mnt/c/Users/ecoch/AppData/Local/BraveSoftware/Brave-Browser/User Data'),
    ).toBe('brave');
  });

  test('infers Windows LocalAppData root from cookie paths', () => {
    expect(
      inferWindowsLocalAppDataRoot('C:\\Users\\ecoch\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Network\\Cookies'),
    ).toBe('/mnt/c/Users/ecoch/AppData/Local');
  });

  test('normalizes Windows and WSL paths to the same comparable key', () => {
    expect(
      normalizeComparablePath('C:\\Users\\ecoch\\AppData\\Local\\AuraCall\\browser-profiles\\default\\grok'),
    ).toBe(
      normalizeComparablePath('/mnt/c/Users/ecoch/AppData/Local/AuraCall/browser-profiles/default/grok'),
    );
  });
});
