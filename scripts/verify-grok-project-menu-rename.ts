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
    await openProjectMenuButton(client, { logPrefix: 'script-project-menu-rename' });
    await clickProjectMenuItem(client, 'Rename', { logPrefix: 'script-project-menu-rename' });
    console.log('✅ Project rename menu item clicked.');
  } finally {
    await client.close();
  }
}

void main();
