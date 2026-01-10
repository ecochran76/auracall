import { CRAWLER_SCRIPT } from '../src/inspector/crawler.js';
import { highlightSelector } from '../src/inspector/highlight.js';
import CDP from 'chrome-remote-interface';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getOracleHomeDir } from '../src/oracleHome.js';
import { isDevToolsResponsive } from '../src/browser/processCheck.js';

async function resolvePort(): Promise<number> {
  const raw = process.env.ORACLE_BROWSER_PORT ?? process.env.ORACLE_BROWSER_DEBUG_PORT;
  if (raw) {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  const registryPath = path.join(getOracleHomeDir(), 'browser-state.json');
  try {
    const rawRegistry = await fs.readFile(registryPath, 'utf8');
    const registry = JSON.parse(rawRegistry) as {
      instances?: Record<string, { host?: string; port?: number; lastSeenAt?: string; launchedAt?: string }>;
    };
    const candidates = Object.values(registry.instances ?? {})
      .filter((instance) => typeof instance.port === 'number' && instance.port > 0)
      .sort((a, b) => {
        const aTime = Date.parse(a.lastSeenAt || a.launchedAt || '') || 0;
        const bTime = Date.parse(b.lastSeenAt || b.launchedAt || '') || 0;
        return bTime - aTime;
      });
    for (const instance of candidates) {
      const host = instance.host || '127.0.0.1';
      const port = instance.port as number;
      if (await isDevToolsResponsive({ host, port, attempts: 2, timeoutMs: 750 })) {
        return port;
      }
    }
  } catch {
    // ignore registry read errors
  }
  throw new Error('No DevTools port found in registry. Launch an Oracle browser run or set ORACLE_BROWSER_PORT.');
}

async function main() {
  const port = await resolvePort();
  const host = '127.0.0.1';
  
  const args = process.argv.slice(2);
  const highlightIndex = args.indexOf('--highlight');
  const selector = highlightIndex !== -1 ? args[highlightIndex + 1] : null;

  console.log(`Connecting to Chrome on ${host}:${port}...`);
  let client;
  try {
    client = await CDP({ host, port });
    await client.Runtime.enable();
    await client.DOM.enable();
    await client.CSS.enable();
    await client.Overlay.enable();
  } catch (error) {
    console.error('Failed to connect to Chrome. Ensure it is running with --remote-debugging-port=9222.');
    process.exit(1);
  }

  if (selector) {
    console.log(`Highlighting selector: "${selector}"`);
    const found = await highlightSelector(client, selector);
    if (found) {
      console.log('Element highlighted. Press Ctrl+C to exit.');
      // Keep process alive to show highlight
      await new Promise(() => {}); 
    } else {
      console.error('Selector not found.');
      await client.close();
    }
    return;
  }

  console.log('Connected. Snapshotting DOM...');

  const { result } = await client.Runtime.evaluate({
    expression: CRAWLER_SCRIPT,
    returnByValue: true
  });

  if (result.value) {
    console.log(JSON.stringify(result.value, null, 2));
  } else {
    console.error('Snapshot failed:', result);
  }

  await client.close();
}

main().catch(console.error);
