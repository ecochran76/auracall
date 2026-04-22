import { enforceRawDevToolsEscapeHatchForCli } from './raw-devtools-guard.js';
enforceRawDevToolsEscapeHatchForCli();
import CDP from 'chrome-remote-interface';
import { resolveScriptBrowserTarget } from './browser-target.js';

async function main() {
  const conversationId = process.argv[2];
  if (!conversationId) {
    console.error('Usage: pnpm tsx scripts/verify-grok-history-hover-point.ts <conversationId>');
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
    const result = await client.Runtime.evaluate({
      expression: `(() => {
        const chatId = ${JSON.stringify(conversationId)};
        const dialog =
          document.querySelector('[role="dialog"]') ||
          document.querySelector('[aria-modal="true"]') ||
          document.querySelector('dialog');
        if (!dialog) {
          return { ok: false, error: 'History dialog not found' };
        }
        const selectors = [
          'a[href="/c/' + chatId + '"]',
          'a[href*="' + chatId + '"]',
          '[data-value="conversation:' + chatId + '"]',
          '[data-value*="' + chatId + '"]',
        ];
        let item = null;
        for (const selector of selectors) {
          item = dialog.querySelector(selector);
          if (item) break;
        }
        if (!item) {
          return { ok: false, error: 'Conversation row not found' };
        }
        const row =
          item.closest('div.grid') ||
          item.closest('div[class*="rounded"]') ||
          item.closest('li') ||
          item.closest('div') ||
          item.parentElement;
        if (!row) {
          return { ok: false, error: 'Row container not found' };
        }
        const target = item.tagName === 'A' ? item : row;
        target.scrollIntoView({ block: 'center', inline: 'center' });
        const rect = target.getBoundingClientRect();
        const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        return {
          ok: true,
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          center,
        };
      })()`,
      returnByValue: true,
    });

    if (result.exceptionDetails) {
      throw new Error(`Eval failed: ${result.exceptionDetails.exception?.description}`);
    }

    const info = result.result?.value as
      | { ok: true; rect: { x: number; y: number; width: number; height: number }; center: { x: number; y: number } }
      | { ok: false; error?: string }
      | undefined;
    if (!info?.ok) {
      throw new Error(info?.error || 'Conversation row not found');
    }

    const x = Math.round(info.center.x);
    const y = Math.round(info.center.y);
    await client.Input.dispatchMouseEvent({ type: 'mouseMoved', x, y });
    await client.Input.dispatchMouseEvent({ type: 'mouseMoved', x: x + 1, y: y + 1 });

    await new Promise((resolve) => setTimeout(resolve, 200));

    const check = await client.Runtime.evaluate({
      expression: `(() => {
        const center = ${JSON.stringify({ x, y })};
        const el = document.elementFromPoint(center.x, center.y);
        return {
          center,
          element: el
            ? {
                tag: el.tagName.toLowerCase(),
                ariaLabel: el.getAttribute('aria-label'),
                className: el.className,
                id: el.id,
                href: el.getAttribute('href'),
              }
            : null,
        };
      })()`,
      returnByValue: true,
    });
    if (check.exceptionDetails) {
      throw new Error(`Check failed: ${check.exceptionDetails.exception?.description}`);
    }

    console.log('✅ hover point check:', check.result?.value);
  } finally {
    await client.close();
  }
}

void main();
