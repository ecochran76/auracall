import CDP from 'chrome-remote-interface';
import { resolveScriptBrowserTarget } from './browser-target.js';
import { pressButton } from '../packages/browser-service/src/service/ui.js';

async function main() {
  const label = process.argv[2];
  const selectorFlag = process.argv.indexOf('--selector');
  const selector = selectorFlag !== -1 ? process.argv[selectorFlag + 1] : undefined;

  if (!label && !selector) {
    console.error('Usage: pnpm tsx scripts/verify-press-button.ts <label> [--selector <css>]');
    process.exit(1);
  }

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
    const labelLower = (label || '').toLowerCase().trim();
    const result = await pressButton(client.Runtime, {
      selector,
      match: selector ? undefined : { includeAny: [labelLower] },
      timeoutMs: 5000,
    });
    if (!result.ok) {
      console.error('❌ pressButton failed:', result.reason || 'unknown error');
      process.exit(1);
    }
    console.log('✅ pressButton clicked:', result.matchedLabel || label);
  } finally {
    await client.close();
  }
}

void main();
