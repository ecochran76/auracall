import CDP from 'chrome-remote-interface';
import { resolveScriptBrowserTarget } from './browser-target.js';
import { isMainSidebarOpen } from '../src/browser/providers/grokAdapter.js';

async function main() {
  const { host, port } = await resolveScriptBrowserTarget();
  console.log(`Connecting to ${host}:${port}...`);
  const targets = await CDP.List({ host, port });
  const grokTargets = targets.filter((entry) => entry.type === 'page' && entry.url?.includes('grok.com'));
  const target =
    grokTargets.find((entry) => entry.url?.includes('/project/')) ||
    grokTargets.find((entry) => entry.url?.includes('/c/')) ||
    grokTargets[0];
  if (!target) {
    throw new Error('No grok.com page target found.');
  }
  const client = await CDP({ host, port, target });
  await client.Runtime.enable();
  await client.Page.enable();
  try {
    const open = await isMainSidebarOpen(client);
    console.log(open ? '✅ Main sidebar is open.' : '⚠️ Main sidebar is closed.');
  } finally {
    await client.close();
  }
}

void main();
