import CDP from 'chrome-remote-interface';
import { resolveScriptBrowserTarget } from './browser-target.js';
import { pressButton } from '../src/browser/service/ui.js';

async function main() {
  const { host, port } = await resolveScriptBrowserTarget();
  console.log(`Connecting to ${host}:${port}...`);
  const client = await CDP({ host, port });
  await client.Runtime.enable();
  await client.Page.enable();
  try {
    const result = await pressButton(client.Runtime, {
      match: { exact: ['__missing_button__'] },
      logCandidatesOnMiss: true,
      timeoutMs: 1500,
    });
    if (result.ok) {
      console.log('Unexpectedly found a button.');
    } else {
      console.log(`Diagnostics: ${result.reason ?? 'missing'}`);
    }
  } finally {
    await client.close();
  }
}

void main();
