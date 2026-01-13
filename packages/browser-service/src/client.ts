import fs from 'node:fs/promises';
import path from 'node:path';
import type { ChromeClient } from './types.js';

export type DiagnosisReport = {
  snapshotPath?: string | null;
};

export type BrowserProvider = {
  config: unknown;
};

export type BrowserAutomationClientDeps = {
  connectDevTools: () => Promise<{ client: ChromeClient; port: number }>;
  diagnoseProvider: (client: ChromeClient, config: unknown, basePath: string) => Promise<DiagnosisReport>;
  crawlerScript: string;
};

export class BrowserAutomationClientCore {
  constructor(private readonly provider: BrowserProvider, private readonly deps: BrowserAutomationClientDeps) {}

  async diagnose(options: { basePath?: string; saveSnapshot?: boolean } = {}): Promise<{
    report: DiagnosisReport;
    port: number;
  }> {
    const basePath = options.basePath ?? process.cwd();
    const { client, port } = await this.deps.connectDevTools();
    try {
      await Promise.all([client.Runtime.enable(), client.DOM.enable()]);
      const report = await this.deps.diagnoseProvider(client, this.provider.config, basePath);
      if (options.saveSnapshot && !report.snapshotPath) {
        const { result } = await client.Runtime.evaluate({
          expression: this.deps.crawlerScript,
          returnByValue: true,
        });
        if (result.value) {
          const dumpPath = path.join(basePath, `browser-service-snapshot-${Date.now()}.json`);
          await fs.writeFile(dumpPath, JSON.stringify(result.value, null, 2));
          report.snapshotPath = dumpPath;
        }
      }
      return { report, port };
    } finally {
      await client.close().catch(() => undefined);
    }
  }
}
