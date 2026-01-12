import { CRAWLER_SCRIPT } from '../src/inspector/crawler.js';
import { highlightSelector } from '../src/inspector/highlight.js';
import CDP from 'chrome-remote-interface';
import type { Client } from 'chrome-remote-interface';
import { resolveScriptBrowserTarget } from './browser-target.js';

async function main() {
  const { host, port } = await resolveScriptBrowserTarget();
  
  const args = process.argv.slice(2);
  const highlightIndex = args.indexOf('--highlight');
  const selector = highlightIndex !== -1 ? args[highlightIndex + 1] : null;

  console.log(`Connecting to Chrome on ${host}:${port}...`);
  let client: Client | null = null;
  try {
    client = await CDP({ host, port });
    await client.Runtime.enable();
    await client.DOM.enable();
    await client.CSS.enable();
    await client.Overlay.enable();
  } catch (_error) {
    console.error('Failed to connect to Chrome. Ensure it is running with --remote-debugging-port=9222.');
    process.exit(1);
  }
  if (!client) {
    return;
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
