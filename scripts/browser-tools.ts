#!/usr/bin/env ts-node

import { execSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runBrowserToolsCli, type BrowserToolsPortResolverOptions } from '../packages/browser-service/src/browserTools.js';
import { loadUserConfig } from '../src/config.js';
import { resolveBrowserConfig } from '../src/browser/config.js';
import { launchManualLoginSession } from '../src/browser/manualLogin.js';
import { BrowserService } from '../src/browser/service/browserService.js';
import {
  DEFAULT_DEBUG_PORT,
  DEFAULT_DEBUG_PORT_RANGE,
  pickAvailableDebugPort,
} from '../src/browser/portSelection.js';

const DEFAULT_PROFILE_DIR = path.join(os.homedir(), '.cache', 'scraping');
const DEFAULT_CHROME_BIN = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function copyProfileIfRequested(baseDir: string, copyProfile: boolean): Promise<string | null> {
  if (!copyProfile) return null;
  await fs.mkdir(baseDir, { recursive: true });
  const userDataDir = await fs.mkdtemp(path.join(baseDir, 'browser-tools-'));
  const source = `${path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome')}/`;
  execSync(`rsync -a --delete "${source}" "${userDataDir}/"`, { stdio: 'ignore' });
  return userDataDir;
}

async function resolvePortOrLaunch(options: BrowserToolsPortResolverOptions): Promise<number> {
  if (options.port) {
    return options.port;
  }
  const { config: userConfig } = await loadUserConfig();
  const browserService = BrowserService.fromConfig(userConfig);
  const target = await browserService.resolveDevToolsTarget({ ensurePort: false });
  if (target.port) {
    return target.port;
  }
  const resolved = resolveBrowserConfig(userConfig.browser);
  const baseDir =
    options.profileDir ??
    resolved.manualLoginProfileDir ??
    path.join(os.homedir(), '.auracall', 'browser-profile');
  const copiedDir = await copyProfileIfRequested(baseDir, Boolean(options.copyProfile));
  const userDataDir = copiedDir ?? baseDir;
  const debugPortRange = resolved.debugPortRange ?? DEFAULT_DEBUG_PORT_RANGE;
  const logger = (message: string) => console.log(message);
  const debugPort = await pickAvailableDebugPort(DEFAULT_DEBUG_PORT, logger, debugPortRange);
  const { chrome } = await launchManualLoginSession({
    chromePath: options.chromePath ?? resolved.chromePath ?? DEFAULT_CHROME_BIN,
    profileName: resolved.chromeProfile ?? 'Default',
    userDataDir,
    url: resolved.target === 'grok'
      ? resolved.grokUrl ?? 'https://grok.com'
      : resolved.target === 'gemini'
        ? resolved.geminiUrl ?? 'https://gemini.google.com/app'
        : resolved.chatgptUrl ?? 'https://chatgpt.com/',
    logger,
    debugPort,
    debugPortRange,
  });
  if (!chrome.port) {
    throw new Error('Chrome launch did not return a DevTools port.');
  }
  return chrome.port;
}

await runBrowserToolsCli({
  resolvePortOrLaunch,
  defaultChromeBin: DEFAULT_CHROME_BIN,
  defaultProfileDir: DEFAULT_PROFILE_DIR,
});
