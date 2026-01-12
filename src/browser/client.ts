import fs from 'node:fs/promises';
import path from 'node:path';
import type { UserConfig } from '../config.js';
import type { ChromeClient } from './types.js';
import type { BrowserProvider, BrowserProviderListOptions } from './providers/types.js';
import { getProvider } from './providers/index.js';
import { diagnoseProvider, type DiagnosisReport } from '../inspector/doctor.js';
import { CRAWLER_SCRIPT } from '../inspector/crawler.js';
import type { BrowserLoginOptions } from './login.js';
import { runBrowserLogin } from './login.js';
import { BrowserService } from './service/browserService.js';

export class BrowserAutomationClient {
  readonly target: 'chatgpt' | 'grok';
  readonly provider: BrowserProvider;
  private readonly browserService: BrowserService;

  private constructor(
    private readonly userConfig: UserConfig,
    target: 'chatgpt' | 'grok',
    browserService: BrowserService,
  ) {
    this.target = target;
    this.provider = getProvider(target);
    this.browserService = browserService;
  }

  static async fromConfig(
    userConfig: UserConfig,
    options?: { target?: 'chatgpt' | 'grok' },
  ): Promise<BrowserAutomationClient> {
    const target = options?.target ?? userConfig.browser?.target ?? 'chatgpt';
    if (target !== 'chatgpt' && target !== 'grok') {
      throw new Error(`Invalid provider "${target}". Use "chatgpt" or "grok".`);
    }
    const browserService = BrowserService.fromConfig(userConfig);
    await browserService.pruneRegistry().catch(() => undefined);
    return new BrowserAutomationClient(userConfig, target, browserService);
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
    const configuredUrl = Object.hasOwn(overrides, 'configuredUrl')
      ? overrides.configuredUrl ?? null
      : this.getConfiguredUrl();
    const launchUrl =
      configuredUrl ??
      (this.target === 'grok' ? 'https://grok.com/' : 'https://chatgpt.com/');
    const target = await this.browserService.resolveDevToolsTarget({
      host: overrides.host,
      port: overrides.port,
      ensurePort: options.ensurePort,
      launchUrl,
    });
    const port = target.port;
    const host = target.host;
    return {
      ...overrides,
      port,
      host,
      configuredUrl,
      browserService: this.browserService,
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

  async getUserIdentity(
    options?: BrowserProviderListOptions,
  ): Promise<import('./providers/types.js').ProviderUserIdentity | null> {
    if (!this.provider.getUserIdentity) return null;
    const listOptions = await this.buildListOptions(options, { ensurePort: true });
    return this.provider.getUserIdentity(listOptions);
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
    return this.browserService.connectDevTools();
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
