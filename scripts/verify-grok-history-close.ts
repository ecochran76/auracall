import CDP from 'chrome-remote-interface';
import { resolveScriptBrowserTarget } from './browser-target.js';
import {
  clickHistoryMenuItem,
  clickHistorySeeAll,
  closeHistoryDialog,
  waitForHistoryDialogOpen,
} from '../src/browser/providers/grokAdapter.js';

async function main() {
  const { host, port } = await resolveScriptBrowserTarget();
  console.log(`Connecting to ${host}:${port}...`);
  const client = await CDP({ host, port });
  await client.Runtime.enable();
  await client.Page.enable();
  try {
    const opened = await clickHistoryMenuItem(client, { logPrefix: 'script-history-close' });
    if (!opened) {
      console.log('⚠️ History item not found.');
      return;
    }
    const dialogOpen = await waitForHistoryDialogOpen(client, 2000);
    if (!dialogOpen) {
      console.log('⚠️ History dialog did not open.');
      return;
    }
    await clickHistorySeeAll(client, { logPrefix: 'script-history-close' });
    await new Promise((resolve) => setTimeout(resolve, 800));
    await closeHistoryDialog(client);
    console.log('✅ History close flow executed.');
  } finally {
    await client.close();
  }
}

void main();
