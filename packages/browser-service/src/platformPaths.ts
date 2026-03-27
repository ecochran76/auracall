import os from 'node:os';

export type ChromiumBrowserFamily = 'chrome' | 'brave' | 'edge' | 'chromium';

export function isWslEnvironment(): boolean {
  if (process.platform !== 'linux') {
    return false;
  }
  if (process.env.WSL_DISTRO_NAME) {
    return true;
  }
  return os.release().toLowerCase().includes('microsoft');
}

export function getWslDistroName(): string {
  const explicit = process.env.WSL_DISTRO_NAME?.trim();
  return explicit && explicit.length > 0 ? explicit : 'Ubuntu';
}

export function isMountedWindowsPath(value: string | null | undefined): boolean {
  return /^\/mnt\/[a-z](?:\/|$)/i.test((value ?? '').trim().replace(/\\/g, '/'));
}

export function isWindowsDrivePath(value: string | null | undefined): boolean {
  return /^[a-zA-Z]:[\\/]/.test((value ?? '').trim());
}

export function isWindowsUncPath(value: string | null | undefined): boolean {
  const trimmed = (value ?? '').trim();
  return trimmed.startsWith('\\\\') || trimmed.startsWith('//');
}

export function isWslUncPath(value: string | null | undefined): boolean {
  const trimmed = (value ?? '').trim();
  return (
    /^\\\\wsl\.localhost\\[^\\]+\\/i.test(trimmed) ||
    /^\/\/wsl\.localhost\/[^/]+\//i.test(trimmed)
  );
}

export function isWindowsPath(value: string | null | undefined): boolean {
  return isWindowsDrivePath(value) || isWindowsUncPath(value) || isMountedWindowsPath(value);
}

export function toWindowsPath(value: string, options: { distroName?: string } = {}): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return value;
  }
  if (isWindowsDrivePath(trimmed)) {
    return trimmed.replace(/\//g, '\\');
  }
  if (isWindowsUncPath(trimmed)) {
    return trimmed.replace(/\//g, '\\');
  }
  if (isMountedWindowsPath(trimmed)) {
    const normalized = trimmed.replace(/\\/g, '/');
    const drive = normalized[5]?.toUpperCase();
    if (drive && normalized[6] === '/') {
      return `${drive}:\\${normalized.slice(7).replace(/\//g, '\\')}`;
    }
  }
  if (trimmed.startsWith('/')) {
    const distroName = options.distroName ?? getWslDistroName();
    return `\\\\wsl.localhost\\${distroName}${trimmed.replace(/\//g, '\\')}`;
  }
  return value;
}

export function toWslPath(value: string, options: { distroName?: string } = {}): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return value;
  }
  if (isMountedWindowsPath(trimmed)) {
    return normalizeSlashPath(trimmed.replace(/\\/g, '/'));
  }
  const driveMatch = trimmed.match(/^([a-zA-Z]):[\\/](.*)$/);
  if (driveMatch) {
    const drive = driveMatch[1].toLowerCase();
    const rest = driveMatch[2] ?? '';
    return normalizeSlashPath(`/mnt/${drive}/${rest.replace(/\\/g, '/')}`);
  }
  const distroName = options.distroName ?? getWslDistroName();
  const uncPatterns = [
    new RegExp(String.raw`^\\\\wsl\.localhost\\${escapeForRegex(distroName)}\\?(.*)$`, 'i'),
    new RegExp(String.raw`^//wsl\.localhost/${escapeForRegex(distroName)}/?(.*)$`, 'i'),
  ];
  for (const pattern of uncPatterns) {
    const match = trimmed.match(pattern);
    const rest = match?.[1];
    if (rest != null) {
      return normalizeSlashPath(`/${rest.replace(/[\\/]+/g, '/')}`);
    }
  }
  return normalizeSlashPath(trimmed.replace(/\\/g, '/'));
}

export function normalizeComparablePath(value: string): string {
  return normalizeSlashPath(toWslPath(value)).toLowerCase();
}

export function detectChromiumBrowserFamily(value: string | null | undefined): ChromiumBrowserFamily | null {
  const normalized = normalizeComparablePath(value ?? '');
  if (!normalized) {
    return null;
  }
  if (
    normalized.includes('/bravesoftware/brave-browser/') ||
    normalized.includes('/brave-browser/') ||
    normalized.endsWith('/brave.exe') ||
    normalized.endsWith('/brave-browser')
  ) {
    return 'brave';
  }
  if (
    normalized.includes('/microsoft/edge/') ||
    normalized.includes('/microsoft edge/') ||
    normalized.endsWith('/msedge.exe') ||
    normalized.includes('/microsoft-edge/')
  ) {
    return 'edge';
  }
  if (
    normalized.includes('/chromium/') ||
    normalized.endsWith('/chromium') ||
    normalized.includes('/program files/chromium/')
  ) {
    return 'chromium';
  }
  if (
    normalized.includes('/google/chrome/') ||
    normalized.includes('/google chrome/') ||
    normalized.endsWith('/chrome.exe') ||
    normalized.endsWith('/google-chrome') ||
    normalized.endsWith('/google-chrome-stable')
  ) {
    return 'chrome';
  }
  return null;
}

export function inferWindowsLocalAppDataRoot(value: string | null | undefined): string | null {
  const normalized = toWslPath(value ?? '');
  if (!normalized) {
    return null;
  }
  const lower = normalized.toLowerCase();
  const marker = '/appdata/local';
  const markerIndex = lower.indexOf(marker);
  if (!lower.startsWith('/mnt/') || markerIndex <= 0) {
    return null;
  }
  return normalizeSlashPath(normalized.slice(0, markerIndex + marker.length));
}

function normalizeSlashPath(value: string): string {
  return value.replace(/\/+/g, '/');
}

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
