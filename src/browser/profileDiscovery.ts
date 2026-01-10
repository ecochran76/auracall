import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type WslChromePreference = 'auto' | 'wsl' | 'windows';

export interface DiscoveredBrowserProfile {
  userDataDir: string;
  profileName: string;
  cookiePath?: string;
  chromePath?: string;
  source: 'wsl' | 'windows';
}

export function discoverDefaultBrowserProfile(options: {
  preference: WslChromePreference;
}): DiscoveredBrowserProfile | null {
  if (!isWsl()) {
    return null;
  }
  const preference = options.preference ?? 'auto';
  if (preference === 'wsl') {
    return discoverWslProfile() ?? discoverWindowsProfile();
  }
  if (preference === 'windows') {
    return discoverWindowsProfile() ?? discoverWslProfile();
  }
  return discoverWslProfile() ?? discoverWindowsProfile();
}

function discoverWslProfile(): DiscoveredBrowserProfile | null {
  const home = os.homedir();
  const candidates: Array<{ userDataDir: string; chromePaths: string[] }> = [
    {
      userDataDir: path.join(home, '.config', 'google-chrome'),
      chromePaths: ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable'],
    },
    {
      userDataDir: path.join(home, '.config', 'chromium'),
      chromePaths: ['/usr/bin/chromium', '/usr/bin/chromium-browser'],
    },
    {
      userDataDir: path.join(home, '.config', 'BraveSoftware', 'Brave-Browser'),
      chromePaths: ['/usr/bin/brave-browser', '/usr/bin/brave'],
    },
    {
      userDataDir: path.join(home, '.config', 'microsoft-edge'),
      chromePaths: ['/usr/bin/microsoft-edge', '/usr/bin/microsoft-edge-stable'],
    },
  ];

  for (const candidate of candidates) {
    if (!exists(candidate.userDataDir)) {
      continue;
    }
    const profileName = resolveProfileName(candidate.userDataDir);
    const cookiePath = resolveCookiePath(candidate.userDataDir, profileName);
    const chromePath = findFirstExisting(candidate.chromePaths);
    return {
      userDataDir: candidate.userDataDir,
      profileName,
      cookiePath,
      chromePath: chromePath ?? undefined,
      source: 'wsl',
    };
  }
  return null;
}

function discoverWindowsProfile(): DiscoveredBrowserProfile | null {
  const usersRoot = '/mnt/c/Users';
  if (!exists(usersRoot)) {
    return null;
  }
  const users = resolveWindowsUsers(usersRoot);
  const browserDefs: Array<{
    userDataDir: (user: string) => string;
    chromePaths: string[];
  }> = [
    {
      userDataDir: (user) => path.join(usersRoot, user, 'AppData', 'Local', 'Google', 'Chrome', 'User Data'),
      chromePaths: [
        '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe',
        '/mnt/c/Program Files (x86)/Google/Chrome/Application/chrome.exe',
      ],
    },
    {
      userDataDir: (user) => path.join(usersRoot, user, 'AppData', 'Local', 'Microsoft', 'Edge', 'User Data'),
      chromePaths: [
        '/mnt/c/Program Files/Microsoft/Edge/Application/msedge.exe',
        '/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
      ],
    },
    {
      userDataDir: (user) => path.join(usersRoot, user, 'AppData', 'Local', 'BraveSoftware', 'Brave-Browser', 'User Data'),
      chromePaths: [
        '/mnt/c/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',
        '/mnt/c/Program Files (x86)/BraveSoftware/Brave-Browser/Application/brave.exe',
      ],
    },
    {
      userDataDir: (user) => path.join(usersRoot, user, 'AppData', 'Local', 'Chromium', 'User Data'),
      chromePaths: [
        '/mnt/c/Program Files/Chromium/Application/chrome.exe',
        '/mnt/c/Program Files (x86)/Chromium/Application/chrome.exe',
      ],
    },
  ];

  for (const user of users) {
    for (const def of browserDefs) {
      const userDataDir = def.userDataDir(user);
      if (!exists(userDataDir)) {
        continue;
      }
      const profileName = resolveProfileName(userDataDir);
      const cookiePath = resolveCookiePath(userDataDir, profileName);
      const chromePath = findFirstExisting(def.chromePaths);
      return {
        userDataDir,
        profileName,
        cookiePath,
        chromePath: chromePath ?? undefined,
        source: 'windows',
      };
    }
  }
  return null;
}

function resolveProfileName(userDataDir: string): string {
  const defaultProfile = path.join(userDataDir, 'Default');
  if (exists(defaultProfile)) {
    return 'Default';
  }
  try {
    const entries = fs.readdirSync(userDataDir, { withFileTypes: true });
    const profiles = entries
      .filter((entry) => entry.isDirectory() && /^Profile \d+$/i.test(entry.name))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));
    if (profiles.length > 0) {
      return profiles[0];
    }
  } catch {
    // ignore
  }
  return 'Default';
}

function resolveCookiePath(userDataDir: string, profileName: string): string | undefined {
  const networkPath = path.join(userDataDir, profileName, 'Network', 'Cookies');
  if (exists(networkPath)) {
    return networkPath;
  }
  const legacyPath = path.join(userDataDir, profileName, 'Cookies');
  if (exists(legacyPath)) {
    return legacyPath;
  }
  return undefined;
}

function resolveWindowsUsers(usersRoot: string): string[] {
  const preferred = [
    process.env.WSL_WIN_USER,
    process.env.USERNAME,
    process.env.USER,
    process.env.LOGNAME,
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  const results: string[] = [];
  for (const candidate of preferred) {
    if (exists(path.join(usersRoot, candidate))) {
      results.push(candidate);
    }
  }
  if (results.length > 0) {
    return results;
  }
  try {
    const entries = fs.readdirSync(usersRoot, { withFileTypes: true });
    const filtered = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => !isWindowsSystemUser(name))
      .sort((a, b) => a.localeCompare(b));
    return filtered;
  } catch {
    return [];
  }
}

function isWindowsSystemUser(name: string): boolean {
  const lowered = name.toLowerCase();
  return (
    lowered === 'public' ||
    lowered === 'default' ||
    lowered === 'default user' ||
    lowered === 'all users' ||
    lowered === 'defaultapppool'
  );
}

function findFirstExisting(paths: string[]): string | null {
  for (const candidate of paths) {
    if (exists(candidate)) {
      return candidate;
    }
  }
  return null;
}

function exists(value: string): boolean {
  try {
    return fs.existsSync(value);
  } catch {
    return false;
  }
}

function isWsl(): boolean {
  if (process.platform !== 'linux') {
    return false;
  }
  if (process.env.WSL_DISTRO_NAME) {
    return true;
  }
  return os.release().toLowerCase().includes('microsoft');
}
