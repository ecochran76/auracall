import CDP from 'chrome-remote-interface';
import { resolveScriptBrowserTarget } from './browser-target.js';
import { clickProjectSidebarToggle } from '../src/browser/providers/grokAdapter.js';

async function main() {
  const { host, port } = await resolveScriptBrowserTarget();
  console.log(`Connecting to ${host}:${port}...`);
  const client = await CDP({ host, port });
  await client.Runtime.enable();
  await client.Page.enable();
  try {
    await clickProjectSidebarToggle(client, { logPrefix: 'script-project-sidebar-toggle' });
    console.log('✅ Project sidebar toggled.');
  } finally {
    await client.close();
  }
}

void main();
