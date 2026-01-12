import CDP from 'chrome-remote-interface';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type { CookieParam } from './types.js';
import { delay } from './utils.js';
import { buildWslFirewallHint } from './chromeLifecycle.js';

export function inferProfileFromCookiePath(cookiePath: string): { userDataDir: string; profileDir: string } | null {
  const normalized = path.normalize(cookiePath);
  const parts = normalized.split(path.sep);
  const userDataIndex = parts.findIndex((part) => part.toLowerCase() === 'user data');
  if (userDataIndex !== -1 && userDataIndex + 1 < parts.length) {
    const userDataDir = parts.slice(0, userDataIndex + 1).join(path.sep);
    const profileDir = parts[userDataIndex + 1];
    if (profileDir) {
      return { userDataDir, profileDir };
    }
  }

  const networkIndex = parts.findIndex((part) => part.toLowerCase() === 'network');
  if (networkIndex > 0 && parts[networkIndex + 1]?.toLowerCase() === 'cookies') {
    const profileDir = parts[networkIndex - 1];
    const userDataDir = parts.slice(0, networkIndex - 1).join(path.sep);
    if (profileDir && userDataDir) {
      return { userDataDir, profileDir };
    }
  }

  return null;
}

export function isWsl(): boolean {
  if (process.platform !== 'linux') {
    return false;
  }
  if (process.env.WSL_DISTRO_NAME) {
    return true;
  }
  return os.release().toLowerCase().includes('microsoft');
}

export function toWindowsPath(value: string): string {
  if (!isWsl()) {
    return value;
  }
  const normalized = value.replace(/\\/g, '/');
  const match = normalized.match(/^\/mnt\/([a-z])\/(.*)$/i);
  if (match) {
    const drive = match[1].toUpperCase();
    const rest = match[2].replace(/\//g, '\\');
    return `${drive}:\\${rest}`;
  }
  if (normalized.startsWith('/')) {
    return `\\\\wsl.localhost\\${process.env.WSL_DISTRO_NAME ?? 'Ubuntu'}${normalized.replace(/\//g, '\\')}`;
  }
  return value;
}

export function isWindowsChromePath(value: string): boolean {
  const trimmed = value.trim();
  if (/^[a-zA-Z]:[\\/]/.test(trimmed)) {
    return true;
  }
  if (trimmed.startsWith('\\\\') || trimmed.startsWith('//')) {
    return true;
  }
  const normalized = trimmed.replace(/\\/g, '/');
  return normalized.startsWith('/mnt/');
}

export function quotePowerShellLiteral(value: string): string {
  const escaped = value.replace(/'/g, "''");
  return `'${escaped}'`;
}

export async function waitForPortOpen(host: string, port: number, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await new Promise<void>((resolve, reject) => {
        const socket = net.connect(port, host);
        socket.once('connect', () => {
          socket.destroy();
          resolve();
        });
        socket.once('error', (err) => {
          socket.destroy();
          reject(err);
        });
      });
      return;
    } catch {
      await delay(200);
    }
  }
  const hint = buildWslFirewallHint(host, port);
  const message = hint
    ? `Timed out waiting for Chrome debug port ${host}:${port}. ${hint}`
    : `Timed out waiting for Chrome debug port ${host}:${port}.`;
  throw new Error(message);
}

export async function exportCookiesFromCdp({
  port,
  requiredNames,
  urls,
  timeoutMs,
}: {
  port: number | null;
  requiredNames: string[];
  urls: string[];
  timeoutMs: number;
}): Promise<CookieParam[]> {
  if (!port) {
    throw new Error('Missing Chrome debug port for cookie export.');
  }
  const client = await CDP({ port });
  try {
    await client.Network.enable();
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const { cookies } = await client.Network.getCookies({ urls });
      const hasRequired = requiredNames.every((name) => cookies.some((cookie) => cookie.name === name));
      if (hasRequired) {
        return cookies.map(mapCookieToParam);
      }
      await delay(2_000);
    }
    throw new Error(`Timed out waiting for cookies: ${requiredNames.join(', ')}`);
  } finally {
    await client.close();
  }
}

function mapCookieToParam(cookie: {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: CookieParam['sameSite'];
  priority?: CookieParam['priority'];
  sameParty?: boolean;
}): CookieParam {
  const param: CookieParam = {
    name: cookie.name,
    value: cookie.value,
  };
  if (cookie.domain) param.domain = cookie.domain;
  if (cookie.path) param.path = cookie.path;
  if (typeof cookie.expires === 'number') param.expires = cookie.expires;
  if (typeof cookie.httpOnly === 'boolean') param.httpOnly = cookie.httpOnly;
  if (typeof cookie.secure === 'boolean') param.secure = cookie.secure;
  if (cookie.sameSite) param.sameSite = cookie.sameSite;
  if (cookie.priority) param.priority = cookie.priority;
  if (typeof cookie.sameParty === 'boolean') param.sameParty = cookie.sameParty;
  return param;
}
