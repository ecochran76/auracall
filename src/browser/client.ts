import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { UserConfig } from '../config.js';
import type { ChromeClient } from './types.js';
import type { BrowserProvider, BrowserProviderListOptions } from './providers/types.js';
import { getProvider } from './providers/index.js';
import { resolveBrowserListTarget } from './portResolution.js';
import { diagnoseProvider, type DiagnosisReport } from '../inspector/doctor.js';
import { CRAWLER_SCRIPT } from '../inspector/crawler.js';
import CDP from 'chrome-remote-interface';
import type { BrowserLoginOptions } from './login.js';
import { runBrowserLogin } from './login.js';
import { resolveBrowserConfig } from './config.js';
import { launchManualLoginSession } from './manualLogin.js';
import { isDevToolsResponsive } from './processCheck.js';

export class BrowserAutomationClient {
  readonly target: 'chatgpt' | 'grok';
  readonly provider: BrowserProvider;

  private constructor(private readonly userConfig: UserConfig, target: 'chatgpt' | 'grok') {
    this.target = target;
    this.provider = getProvider(target);
  }

  static async fromConfig(
    userConfig: UserConfig,
    options?: { target?: 'chatgpt' | 'grok' },
  ): Promise<BrowserAutomationClient> {
    const target = options?.target ?? userConfig.browser?.target ?? 'chatgpt';
    if (target !== 'chatgpt' && target !== 'grok') {
      throw new Error(`Invalid provider "${target}". Use "chatgpt" or "grok".`);
    }
    const { pruneRegistry } = await import('./stateRegistry.js');
    await pruneRegistry().catch(() => undefined);
    return new BrowserAutomationClient(userConfig, target);
  }

  getConfiguredUrl(): string | null {
    return this.target === 'grok'
      ? this.userConfig.browser?.grokUrl ?? null
      : this.userConfig.browser?.chatgptUrl ?? this.userConfig.browser?.url ?? null;
  }

  async buildListOptions(
    overrides: BrowserProviderListOptions = {},
    options: { ensurePort?: boolean } = {},
  ): Promise<BrowserProviderListOptions> {
    const resolvedConfig = resolveBrowserConfig(this.userConfig.browser);
    const remoteChrome = resolvedConfig.remoteChrome ?? null;
    let port = overrides.port ?? remoteChrome?.port;
    let host = overrides.host ?? remoteChrome?.host;
    if (!port) {
      const target = await resolveBrowserListTarget(this.userConfig);
      port = target?.port;
      host ??= target?.host;
    }
    if (options.ensurePort && port) {
      const candidateHost = host ?? '127.0.0.1';
      const reachable = await isDevToolsResponsive({
        host: candidateHost,
        port,
        attempts: 2,
        timeoutMs: 1000,
      });
      if (!reachable) {
        port = undefined;
      }
    }
    if (!port && options.ensurePort) {
      const userDataDir =
        resolvedConfig.manualLoginProfileDir ?? path.join(os.homedir(), '.oracle', 'browser-profile');
      const profileName = resolvedConfig.chromeProfile ?? 'Default';
      const url =
        overrides.configuredUrl ??
        this.getConfiguredUrl() ??
        (this.target === 'grok' ? 'https://grok.com/' : 'https://chatgpt.com/');
      const { chrome } = await launchManualLoginSession({
        chromePath: resolvedConfig.chromePath ?? 'google-chrome',
        profileName,
        userDataDir,
        url,
        logger: () => undefined,
        debugPortRange: resolvedConfig.debugPortRange ?? undefined,
        debugPort: resolvedConfig.debugPort ?? undefined,
        detach: true,
      });
      port = chrome.port;
      host = chrome.host ?? host;
    }
    const configuredUrl = overrides.configuredUrl ?? this.getConfiguredUrl();
    return {
      ...overrides,
      port,
      host,
      configuredUrl,
    };
  }

  async listProjects(
    options?: BrowserProviderListOptions,
  ): Promise<unknown> {
    if (!this.provider.listProjects) return undefined;
    const listOptions = await this.buildListOptions(options, { ensurePort: true });
    return this.provider.listProjects(listOptions);
  }

  async listConversations(
    projectId?: string,
    options?: BrowserProviderListOptions,
  ): Promise<unknown> {
    if (!this.provider.listConversations) return undefined;
    const listOptions = await this.buildListOptions(options, { ensurePort: true });
    return this.provider.listConversations(projectId, listOptions);
  }

  async renameConversation(
    conversationId: string,
    newTitle: string,
    projectId?: string,
    options?: BrowserProviderListOptions,
  ): Promise<void> {
    if (!this.provider.renameConversation) {
      throw new Error(`Rename is not supported for ${this.target}.`);
    }
    const listOptions = await this.buildListOptions(options);
    await this.provider.renameConversation(conversationId, newTitle, projectId, listOptions);
  }

  async connectDevTools(): Promise<{ client: ChromeClient; port: number }> {
    const target = await resolveBrowserListTarget(this.userConfig);
    if (!target?.port) {
      throw new Error(
        'No DevTools port found. Launch a browser run to register the active session or set ORACLE_BROWSER_PORT.',
      );
    }
    const client = await CDP({ port: target.port, host: target.host });
    return { client, port: target.port };
  }

  async diagnose(options: { basePath?: string; saveSnapshot?: boolean } = {}): Promise<{
    report: DiagnosisReport;
    port: number;
  }> {
    const basePath = options.basePath ?? process.cwd();
    const { client, port } = await this.connectDevTools();
    try {
      await Promise.all([client.Runtime.enable(), client.DOM.enable()]);
      const report = await diagnoseProvider(client, this.provider.config, basePath);
      if (options.saveSnapshot && !report.snapshotPath) {
        const { result } = await client.Runtime.evaluate({
          expression: CRAWLER_SCRIPT,
          returnByValue: true,
        });
        if (result.value) {
          const dumpPath = path.join(basePath, `oracle-snapshot-${this.target}-${Date.now()}.json`);
          await fs.writeFile(dumpPath, JSON.stringify(result.value, null, 2));
          report.snapshotPath = dumpPath;
        }
      }
      return { report, port };
    } finally {
      await client.close().catch(() => undefined);
    }
  }

  async login(options: BrowserLoginOptions): Promise<void> {
    await runBrowserLogin(options);
  }
}
