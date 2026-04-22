import { enforceRawDevToolsEscapeHatchForCli } from './raw-devtools-guard.js';
enforceRawDevToolsEscapeHatchForCli();
import CDP from 'chrome-remote-interface';
import { resolveScriptBrowserTarget } from './browser-target.js';
import { clickHistoryMenuItem } from '../src/browser/providers/grokAdapter.js';

async function main() {
  const { host, port } = await resolveScriptBrowserTarget();
  console.log(`Connecting to ${host}:${port}...`);
  const client = await CDP({ host, port });
  await client.Runtime.enable();
  await client.Page.enable();
  try {
    const clicked = await clickHistoryMenuItem(client, { logPrefix: 'script-history-item' });
    console.log(clicked ? '✅ History item clicked.' : '⚠️ History item not found.');
  } finally {
    await client.close();
  }
}

void main();
