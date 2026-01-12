import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type WslChromePreference = 'auto' | 'wsl' | 'windows';

export interface DiscoveredBrowserProfile {
  userDataDir: string;
  profileName: string;
  cookiePath?: string;
  chromePath?: string;
  source: 'wsl' | 'windows' | 'local';
}

export function discoverDefaultBrowserProfile(options: {
  preference: WslChromePreference;
}): DiscoveredBrowserProfile | null {
  if (!isWsl()) {
    return discoverLocalProfile();
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

function discoverLocalProfile(): DiscoveredBrowserProfile | null {
  if (process.platform === 'darwin') {
    return discoverMacProfile();
  }
  if (process.platform === 'win32') {
    return discoverWin32Profile();
  }
  return discoverLinuxProfile();
}

function discoverMacProfile(): DiscoveredBrowserProfile | null {
  const home = os.homedir();
  const candidates: Array<{ userDataDir: string; chromePaths: string[] }> = [
    {
      userDataDir: path.join(home, 'Library', 'Application Support', 'Google', 'Chrome'),
      chromePaths: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'],
    },
    {
      userDataDir: path.join(home, 'Library', 'Application Support', 'Chromium'),
      chromePaths: ['/Applications/Chromium.app/Contents/MacOS/Chromium'],
    },
    {
      userDataDir: path.join(home, 'Library', 'Application Support', 'BraveSoftware', 'Brave-Browser'),
      chromePaths: ['/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'],
    },
    {
      userDataDir: path.join(home, 'Library', 'Application Support', 'Microsoft Edge'),
      chromePaths: ['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'],
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
      source: 'local',
    };
  }
  return null;
}

function discoverLinuxProfile(): DiscoveredBrowserProfile | null {
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
      source: 'local',
    };
  }
  return null;
}

function discoverWin32Profile(): DiscoveredBrowserProfile | null {
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) {
    return null;
  }
  const candidates: Array<{ userDataDir: string; chromePaths: string[] }> = [
    {
      userDataDir: path.join(localAppData, 'Google', 'Chrome', 'User Data'),
      chromePaths: [
        'C:/Program Files/Google/Chrome/Application/chrome.exe',
        'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
      ],
    },
    {
      userDataDir: path.join(localAppData, 'Microsoft', 'Edge', 'User Data'),
      chromePaths: [
        'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
        'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
      ],
    },
    {
      userDataDir: path.join(localAppData, 'BraveSoftware', 'Brave-Browser', 'User Data'),
      chromePaths: [
        'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',
        'C:/Program Files (x86)/BraveSoftware/Brave-Browser/Application/brave.exe',
      ],
    },
    {
      userDataDir: path.join(localAppData, 'Chromium', 'User Data'),
      chromePaths: [
        'C:/Program Files/Chromium/Application/chrome.exe',
        'C:/Program Files (x86)/Chromium/Application/chrome.exe',
      ],
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
      source: 'windows',
    };
  }
  return null;
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

export function resolveCookiePath(userDataDir: string, profileName: string): string | undefined {
  const resolvedProfile = resolveProfileDirectoryName(userDataDir, profileName);
  const networkPath = path.join(userDataDir, resolvedProfile, 'Network', 'Cookies');
  if (exists(networkPath)) {
    return networkPath;
  }
  const legacyPath = path.join(userDataDir, resolvedProfile, 'Cookies');
  if (exists(legacyPath)) {
    return legacyPath;
  }
  return undefined;
}

export function resolveProfileDirectoryName(userDataDir: string, profileName: string): string {
  const trimmed = profileName.trim();
  if (!trimmed) return profileName;
  if (exists(path.join(userDataDir, trimmed))) {
    return trimmed;
  }
  const localStatePath = path.join(userDataDir, 'Local State');
  try {
    const raw = fs.readFileSync(localStatePath, 'utf8');
    const parsed = JSON.parse(raw) as { profile?: { info_cache?: Record<string, { name?: string; shortcut_name?: string; user_name?: string }> } };
    const infoCache = parsed?.profile?.info_cache;
    if (infoCache && typeof infoCache === 'object') {
      const target = trimmed.toLowerCase();
      for (const [dirName, info] of Object.entries(infoCache)) {
        const candidates = [info?.name, info?.shortcut_name, info?.user_name].filter(Boolean) as string[];
        if (candidates.some((value) => value.toLowerCase() === target)) {
          return dirName;
        }
      }
    }
  } catch {
    // ignore parse errors
  }
  return profileName;
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
