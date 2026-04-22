import { enforceRawDevToolsEscapeHatchForCli } from './raw-devtools-guard.js';
enforceRawDevToolsEscapeHatchForCli();
import CDP from 'chrome-remote-interface';
import { resolveScriptBrowserTarget } from './browser-target.js';
import { resolveProjectInstructionsModal } from '../src/browser/providers/grokAdapter.js';

async function main() {
  const { host, port } = await resolveScriptBrowserTarget();
  console.log(`Connecting to ${host}:${port}...`);
  const client = await CDP({ host, port });
  await client.Runtime.enable();
  await client.Page.enable();
  try {
    const info = await resolveProjectInstructionsModal(client, { serviceId: 'grok' });
    console.log('✅ Project instructions modal read succeeded.');
    console.log(`Model: ${info.model ?? 'unknown'}`);
    console.log(info.text);
  } finally {
    await client.close();
  }
}

void main();
