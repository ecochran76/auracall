import { enforceRawDevToolsEscapeHatchForCli } from './raw-devtools-guard.js';
enforceRawDevToolsEscapeHatchForCli();
import CDP from 'chrome-remote-interface';
import { resolveScriptBrowserTarget } from './browser-target.js';
import { openProjectMenuButton, clickProjectMenuItem } from '../src/browser/providers/grokAdapter.js';

async function main() {
  const { host, port } = await resolveScriptBrowserTarget();
  console.log(`Connecting to ${host}:${port}...`);
  const client = await CDP({ host, port });
  await client.Runtime.enable();
  await client.Page.enable();
  try {
    await openProjectMenuButton(client, { logPrefix: 'script-project-menu-remove' });
    await clickProjectMenuItem(client, 'Remove', { logPrefix: 'script-project-menu-remove' });
    console.log('✅ Project remove menu item clicked.');
  } finally {
    await client.close();
  }
}

void main();
