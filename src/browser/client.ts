import type { ResolvedUserConfig } from '../config.js';
import type { ChromeClient } from './types.js';
import type { BrowserProvider, BrowserProviderListOptions } from './providers/types.js';
import { diagnoseProvider, type DiagnosisReport } from '../inspector/doctor.js';
import { CRAWLER_SCRIPT } from '../inspector/crawler.js';
import type { BrowserLoginOptions } from './login.js';
import { runBrowserLogin } from './login.js';
import { BrowserService } from './service/browserService.js';
import { createLlmService } from './llmService/index.js';
import type { LlmService } from './llmService/llmService.js';
import { BrowserAutomationClientCore } from '../../packages/browser-service/src/client.js';

export class BrowserAutomationClient {
  readonly target: 'chatgpt' | 'grok';
  readonly provider: BrowserProvider;
  private readonly browserService: BrowserService;
  private readonly llmService: LlmService;
  private readonly core: BrowserAutomationClientCore;

  private constructor(
    readonly userConfig: ResolvedUserConfig,
    target: 'chatgpt' | 'grok',
    browserService: BrowserService,
  ) {
    this.target = target;
    this.browserService = browserService;
    this.llmService = createLlmService(target, userConfig, { browserService });
    this.provider = this.llmService.provider;
    this.core = new BrowserAutomationClientCore(this.provider, {
      connectDevTools: () => this.connectDevTools(),
      diagnoseProvider: (client, config, basePath, options) =>
        diagnoseProvider(client, config as typeof this.provider.config, basePath, options),
      crawlerScript: CRAWLER_SCRIPT,
    });
  }

  static async fromConfig(
    userConfig: ResolvedUserConfig,
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

  async diagnose(options: { basePath?: string; saveSnapshot?: boolean; quiet?: boolean } = {}): Promise<{
    report: DiagnosisReport;
    port: number;
  }> {
    const { report, port } = await this.core.diagnose(options);
    return { report: report as DiagnosisReport, port };
  }

  async login(options: BrowserLoginOptions): Promise<void> {
    await runBrowserLogin(options);
  }
}
