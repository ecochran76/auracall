import CDP from 'chrome-remote-interface';
import { resolveScriptBrowserTarget } from './browser-target.js';
import { selectGrokMode } from '../src/browser/actions/grok.js';

async function main() {
  const { host, port } = await resolveScriptBrowserTarget();
  console.log(`Connecting to ${host}:${port}...`);
  const client = await CDP({ host, port });
  await client.Runtime.enable();
  try {
    await selectGrokMode(client.Input, client.Runtime, 'Auto', (msg) => console.log(msg));
  } finally {
    await client.close();
  }
}

void main();
