import { enforceRawDevToolsEscapeHatchForCli } from './raw-devtools-guard.js';
enforceRawDevToolsEscapeHatchForCli();
import CDP from 'chrome-remote-interface';
import { resolveScriptBrowserTarget } from './browser-target.js';
import { clickHistorySeeAll } from '../src/browser/providers/grokAdapter.js';

async function main() {
  const { host, port } = await resolveScriptBrowserTarget();
  console.log(`Connecting to ${host}:${port}...`);
  const client = await CDP({ host, port });
  await client.Runtime.enable();
  await client.Page.enable();
  try {
    await clickHistorySeeAll(client, { logPrefix: 'script-history-see-all' });
    console.log('✅ History see-all clicked.');
  } finally {
    await client.close();
  }
}

void main();
