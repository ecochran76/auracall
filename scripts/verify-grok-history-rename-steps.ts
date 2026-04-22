import { enforceRawDevToolsEscapeHatchForCli } from './raw-devtools-guard.js';
enforceRawDevToolsEscapeHatchForCli();
import CDP from 'chrome-remote-interface';
import { resolveScriptBrowserTarget } from './browser-target.js';
import { clickHistoryMenuItem, clickHistorySeeAll } from '../src/browser/providers/grokAdapter.js';
import { DEFAULT_DIALOG_SELECTORS, hoverAndReveal, waitForDialog, waitForSelector } from '../src/browser/service/ui.js';

async function main() {
  const stepArg = process.argv[2];
  const conversationId = process.argv[3];
  if (!stepArg || !conversationId) {
    console.error('Usage: pnpm tsx scripts/verify-grok-history-rename-steps.ts <step 1-4> <conversationId>');
    process.exit(1);
  }
  const step = Number.parseInt(stepArg, 10);
  if (!Number.isFinite(step) || step < 1 || step > 4) {
    console.error('Step must be 1-4.');
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
  await Promise.all([client.Page.enable(), client.Runtime.enable()]);

  try {
    if (step >= 1) {
      const clicked = await clickHistoryMenuItem(client, { logPrefix: 'browser-history-rename' });
      if (!clicked) {
        throw new Error('History item not clicked');
      }
      const opened = await waitForDialog(client.Runtime, 5000, DEFAULT_DIALOG_SELECTORS);
      if (!opened) {
        throw new Error('History dialog did not open');
      }
      await client.Runtime.evaluate({
        expression: `(() => {
          const dialog = document.querySelector('div[role="dialog"][data-side]') || document.querySelector('div[role="dialog"][data-state="open"][data-side]');
          if (dialog) {
            dialog.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
            dialog.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
            dialog.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          }
          return true;
        })()`,
        returnByValue: true,
      });
      console.log('✅ Step 1: History dialog opened (hover menu closed).');
    }

    if (step >= 2) {
      await clickHistorySeeAll(client, { logPrefix: 'browser-history-rename' });
      const ready = await waitForSelector(
        client.Runtime,
        'div[role="dialog"] a[href*="/c/"], div[role="dialog"] [data-value^="conversation:"]',
        5000,
      );
      if (!ready) {
        throw new Error('History dialog did not render conversation links');
      }
      console.log('✅ Step 2: History expanded and rows present.');
    }

    if (step >= 3) {
      const evalResult = await client.Runtime.evaluate({
        expression: `(() => {
          const chatId = ${JSON.stringify(conversationId)};
          const dialog =
            document.querySelector('[role="dialog"]') ||
            document.querySelector('[aria-modal="true"]') ||
            document.querySelector('dialog');
          if (!dialog) return { ok: false, error: 'dialog missing' };
          const selectors = [
            '[data-value="conversation:' + chatId + '"]',
            '[data-value*="' + chatId + '"]',
            'a[href*="' + chatId + '"]',
            'a[href="/c/' + chatId + '"]',
          ];
          let item = null;
          for (const selector of selectors) {
            item = dialog.querySelector(selector);
            if (item) break;
          }
          const row = item
            ? item.closest('div.grid') || item.closest('div[class*="rounded"]') || item.closest('li') || item.closest('div') || item.parentElement
            : null;
          return {
            ok: Boolean(item),
            selectorHit: item ? item.tagName.toLowerCase() : null,
            rowClass: row ? row.className : null,
          };
        })()`,
        returnByValue: true,
      });
      const info = evalResult.result?.value as { ok: boolean; error?: string; selectorHit?: string | null; rowClass?: string | null } | undefined;
      if (!info?.ok) {
        throw new Error(info?.error || 'Row not found');
      }
      console.log('✅ Step 3: Row found.', info);
    }

    if (step >= 4) {
      const hover = await hoverAndReveal(client.Runtime, client.Input, {
        rowSelector: `a[href="/c/${conversationId}"], a[href*="${conversationId}"], [data-value="conversation:${conversationId}"], [data-value*="${conversationId}"]`,
        rootSelectors: DEFAULT_DIALOG_SELECTORS,
        actionMatch: { exact: ['rename'] },
        timeoutMs: 1500,
      });
      if (!hover.ok) {
        throw new Error(hover.reason || 'Hover failed');
      }

      const evalResult = await client.Runtime.evaluate({
        expression: `(() => {
          const chatId = ${JSON.stringify(conversationId)};
          const dialog =
            document.querySelector('[role="dialog"]') ||
            document.querySelector('[aria-modal="true"]') ||
            document.querySelector('dialog');
          if (!dialog) return { ok: false, error: 'dialog missing' };
          const selectors = [
            '[data-value="conversation:' + chatId + '"]',
            '[data-value*="' + chatId + '"]',
            'a[href*="' + chatId + '"]',
            'a[href="/c/' + chatId + '"]',
          ];
          let item = null;
          for (const selector of selectors) {
            item = dialog.querySelector(selector);
            if (item) break;
          }
          const row = item
            ? item.closest('div.grid') || item.closest('div[class*="rounded"]') || item.closest('li') || item.closest('div') || item.parentElement
            : null;
          if (!row) return { ok: false, error: 'row missing' };
          const buttons = Array.from(dialog.querySelectorAll('button[aria-label]'));
          const renameButtons = buttons.filter((btn) => (btn.getAttribute('aria-label') || '').toLowerCase() === 'rename');
          const rowRename = renameButtons.filter((btn) => row.contains(btn));
          const rowButtons = Array.from(row.querySelectorAll('button[aria-label]')).map((btn) => btn.getAttribute('aria-label'));
          return {
            ok: true,
            renameCount: renameButtons.length,
            rowRenameCount: rowRename.length,
            labels: buttons.map((btn) => btn.getAttribute('aria-label')).filter(Boolean).slice(0, 10),
            rowLabels: rowButtons.filter(Boolean).slice(0, 10),
          };
        })()`,
        returnByValue: true,
      });
      const info = evalResult.result?.value as { ok: boolean; error?: string; renameCount?: number; rowRenameCount?: number; labels?: string[] } | undefined;
      if (!info?.ok) {
        throw new Error(info?.error || 'Rename buttons not found');
      }
      console.log('✅ Step 4: Rename button scan.', info);
    }
  } finally {
    await client.close();
  }
}

void main();
