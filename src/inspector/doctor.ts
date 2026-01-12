import type { ChromeClient } from '../browser/types.js';
import type { BrowserProviderConfig } from '../browser/providers/types.js';
import { CRAWLER_SCRIPT } from './crawler.js';
import fs from 'node:fs/promises';
import path from 'node:path';

export interface SelectorCheckResult {
  name: string;
  selectors: readonly string[];
  matched: boolean;
  matchCount: number;
  matchedSelector?: string;
}

export interface DiagnosisReport {
  url: string;
  providerId: string;
  checks: SelectorCheckResult[];
  allPassed: boolean;
  snapshotPath?: string;
}

export async function diagnoseProvider(
  client: ChromeClient,
  config: BrowserProviderConfig,
  basePath?: string
): Promise<DiagnosisReport> {
  const { result: urlResult } = await client.Runtime.evaluate({
    expression: 'location.href',
    returnByValue: true,
  });
  const url = (urlResult.value as string) || 'unknown';

  const checks: SelectorCheckResult[] = [];
  
  // Check each selector group (input, sendButton, etc.)
  for (const [key, selectors] of Object.entries(config.selectors)) {
    // We want to know if *any* selector in the list matches.
    // We also want to know *which* one matched.
    let groupMatchCount = 0;
    let bestSelector: string | undefined;

    for (const selector of selectors) {
      const { result } = await client.Runtime.evaluate({
        expression: `document.querySelectorAll(${JSON.stringify(selector)}).length`,
        returnByValue: true
      });
      const count = (result.value as number) || 0;
      if (count > 0) {
        groupMatchCount += count;
        if (!bestSelector) bestSelector = selector;
      }
    }

    checks.push({
      name: key,
      selectors,
      matched: groupMatchCount > 0,
      matchCount: groupMatchCount,
      matchedSelector: bestSelector
    });
  }

  const allPassed = checks.every(c => c.matched);
  let snapshotPath: string | undefined;

  // If failures, capture a semantic snapshot
  if (!allPassed && basePath) {
    try {
      console.log('Capturing UI snapshot for debugging...');
      const { result } = await client.Runtime.evaluate({
        expression: CRAWLER_SCRIPT,
        returnByValue: true
      });
      
      if (result.value) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `oracle-snapshot-${config.id}-${timestamp}.json`;
        snapshotPath = path.join(basePath, filename);
        await fs.writeFile(snapshotPath, JSON.stringify(result.value, null, 2), 'utf8');
      }
    } catch (err) {
      console.error('Failed to capture snapshot:', err);
    }
  }

  return {
    url,
    providerId: config.id,
    checks,
    allPassed,
    snapshotPath
  };
}
