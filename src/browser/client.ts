import fs from 'node:fs/promises';
import path from 'node:path';
import type { UserConfig } from '../config.js';
import type { ChromeClient } from './types.js';
import type { BrowserProvider, BrowserProviderListOptions } from './providers/types.js';
import { diagnoseProvider, type DiagnosisReport } from '../inspector/doctor.js';
import { CRAWLER_SCRIPT } from '../inspector/crawler.js';
import type { BrowserLoginOptions } from './login.js';
import { runBrowserLogin } from './login.js';
import { BrowserService } from './service/browserService.js';
import { createLlmService } from './llmService/index.js';
import type { LlmService } from './llmService/llmService.js';

export class BrowserAutomationClient {
  readonly target: 'chatgpt' | 'grok';
  readonly provider: BrowserProvider;
  private readonly browserService: BrowserService;
  private readonly llmService: LlmService;

  private constructor(
    readonly userConfig: UserConfig,
    target: 'chatgpt' | 'grok',
    browserService: BrowserService,
  ) {
    this.target = target;
    this.browserService = browserService;
    this.llmService = createLlmService(target, userConfig, { browserService });
    this.provider = this.llmService.provider;
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

  async buildListOptions(
    overrides: BrowserProviderListOptions = {},
    options: { ensurePort?: boolean } = {},
  ): Promise<BrowserProviderListOptions> {
    return this.llmService.buildListOptions(overrides, options);
  }

  async listProjects(
    options?: BrowserProviderListOptions,
  ): Promise<unknown> {
    return this.llmService.listProjects(options);
  }

  async listConversations(
    projectId?: string,
    options?: BrowserProviderListOptions,
  ): Promise<unknown> {
    return this.llmService.listConversations(projectId, options);
  }

  async getUserIdentity(
    options?: BrowserProviderListOptions,
  ): Promise<import('./providers/types.js').ProviderUserIdentity | null> {
    return this.llmService.getUserIdentity(options);
  }

  async renameConversation(
    conversationId: string,
    newTitle: string,
    projectId?: string,
    options?: BrowserProviderListOptions,
  ): Promise<void> {
    await this.llmService.renameConversation(conversationId, newTitle, projectId, options);
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
