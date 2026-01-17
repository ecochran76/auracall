import CDP from 'chrome-remote-interface';
import { resolveScriptBrowserTarget } from './browser-target.js';
import { GROK_MODEL_LABEL_NORMALIZER } from '../src/browser/providers/grokModelMenu.js';
import { waitForSelector } from '../src/browser/service/ui.js';

async function main() {
  const label = process.argv[2] || 'Grok 4.1 Thinking';
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
    const preflight = await client.Runtime.evaluate({
      expression: `(async () => {
        const dialog = Array.from(document.querySelectorAll('[role="dialog"][data-state="open"], dialog[open]')).find((el) => {
          return el.querySelector('input[placeholder*="Project name" i]');
        }) || null;
        if (!dialog) return { success: false, error: 'Project create dialog not found' };
        const trigger = dialog.querySelector('#model-select-trigger') || dialog.querySelector('button[aria-label="Model select"]');
        if (!trigger) return { success: false, error: 'Model select trigger not found in dialog' };
        try {
          trigger.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
          trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        } catch {}
        trigger.click();
        return { success: true, listId: trigger.getAttribute('aria-controls') || '' };
      })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (preflight.exceptionDetails) {
      throw new Error(`JS Exception: ${preflight.exceptionDetails.exception?.description}`);
    }
    const preInfo = preflight.result?.value as { success: boolean; error?: string; listId?: string } | undefined;
    if (!preInfo?.success) {
      console.error('❌ Model select failed:', preInfo?.error || 'Preflight failed');
      process.exit(1);
    }
    const listSelector = preInfo.listId ? `#${preInfo.listId}` : '[role="listbox"]';
    await waitForSelector(client.Runtime, listSelector, 3000);

    const evalResult = await client.Runtime.evaluate({
      expression: `(async () => {
        const desiredModel = ${JSON.stringify(label)};
        const normalize = ${GROK_MODEL_LABEL_NORMALIZER};
        const dialog = Array.from(document.querySelectorAll('[role="dialog"][data-state="open"], dialog[open]')).find((el) => {
          return el.querySelector('input[placeholder*="Project name" i]');
        }) || null;
        if (!dialog) return { success: false, error: 'Project create dialog not found' };
        const trigger = dialog.querySelector('#model-select-trigger') || dialog.querySelector('button[aria-label="Model select"]');
        if (!trigger) return { success: false, error: 'Model select trigger not found in dialog' };
        const listId = trigger.getAttribute('aria-controls') || '';
        const listbox = listId ? document.getElementById(listId) : document.querySelector('[role="listbox"]');
        if (!listbox) return { success: false, error: 'Model listbox not found', listId };
        const items = Array.from(listbox.querySelectorAll('[role="option"], [data-radix-collection-item], [data-slot="select-item"]'));
        const targetNorm = normalize(desiredModel || '');
        const match = items.find((el) => normalize(el.textContent || '').startsWith(targetNorm)) || null;
        if (!match) {
          return { success: false, error: 'Model option not found', options: items.map((el) => (el.textContent || '').trim()) };
        }
        match.click();
        await new Promise(r => setTimeout(r, 200));
        if (trigger.getAttribute('aria-expanded') === 'true') {
          trigger.click();
          await new Promise(r => setTimeout(r, 150));
        }
        const selected = (trigger.textContent || '').trim();
        return { success: true, selected };
      })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (evalResult.exceptionDetails) {
      throw new Error(`JS Exception: ${evalResult.exceptionDetails.exception?.description}`);
    }
    const info = evalResult.result?.value as {
      success: boolean;
      error?: string;
      selected?: string;
      options?: string[];
      listId?: string;
    };
    if (!info?.success) {
      console.error('❌ Model select failed:', info.error, info.listId ? `(listId: ${info.listId})` : '');
      if (info.options?.length) {
        console.error('Options:', info.options);
      }
      process.exit(1);
    }
    console.log(`✅ Selected model: ${info.selected}`);
  } finally {
    await client.close();
  }
}

void main();
