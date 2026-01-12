import type { ResolvedBrowserConfig, ChromeClient } from '../types.js';

export type BrowserProfileIdentity = {
  profilePath: string;
  profileName: string;
};

export type BrowserSession = {
  host: string;
  port: number;
  profileIdentity: BrowserProfileIdentity;
  pid: number;
  lastSeenAt?: string;
};

export type BrowserCapabilities = {
  supportsMultipleTabs?: boolean;
  supportsProfiles?: boolean;
  supportsCookies?: boolean;
  supportsHeadless?: boolean;
};

export type BrowserServiceConfig = Pick<
  ResolvedBrowserConfig,
  | 'chromePath'
  | 'chromeProfile'
  | 'chromeCookiePath'
  | 'display'
  | 'keepBrowser'
  | 'debugPort'
  | 'debugPortRange'
  | 'manualLoginProfileDir'
  | 'manualLogin'
  | 'wslChromePreference'
  | 'remoteChrome'
>;

export type CredentialHint = {
  username?: string;
  password?: string;
  otp?: string;
  source?: 'config' | 'env' | 'helper';
};

export type BrowserServiceHandle = {
  getConfig(): BrowserServiceConfig;
  resolveDevToolsTarget(options?: {
    host?: string;
    port?: number;
    ensurePort?: boolean;
    launchUrl?: string;
  }): Promise<{ host?: string; port?: number; launched?: boolean }>;
  connectDevTools(): Promise<{ client: ChromeClient; port: number }>;
  resolveCredentials(): Promise<CredentialHint | null>;
};
