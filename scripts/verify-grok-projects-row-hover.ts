import { enforceRawDevToolsEscapeHatchForCli } from './raw-devtools-guard.js';
enforceRawDevToolsEscapeHatchForCli();
import CDP from 'chrome-remote-interface';
import { resolveScriptBrowserTarget } from './browser-target.js';

async function main() {
  const stepArg = process.argv[2];
  const step = stepArg ? Number.parseInt(stepArg, 10) : 1;
  if (!Number.isFinite(step) || step < 1 || step > 2) {
    console.error('Usage: pnpm tsx scripts/verify-grok-projects-row-hover.ts <step 1|2>');
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
    if (step === 1) {
      const tagResult = await client.Runtime.evaluate({
        expression: `(() => {
          const link = [...document.querySelectorAll('a[class*="peer/menu-button"]')]
            .find(a => (a.textContent || '').trim() === 'Projects') || null;
          const row = link?.closest('li') || link?.parentElement || null;
          if (!row) return { ok: false, error: 'Projects row not found' };
          row.setAttribute('data-oracle-projects-row', 'true');
          return { ok: true, rowClass: row.className };
        })()`,
        returnByValue: true,
      });
      if (tagResult.exceptionDetails) {
        throw new Error(`Tag failed: ${tagResult.exceptionDetails.exception?.description}`);
      }
      const tagInfo = tagResult.result?.value as { ok: boolean; error?: string; rowClass?: string } | undefined;
      if (!tagInfo?.ok) {
        throw new Error(tagInfo?.error || 'Projects row not found');
      }
      console.log('✅ Step 1: Projects row tagged.', tagInfo);
      return;
    }

    const lookup = await client.Runtime.evaluate({
      expression: `(() => {
        const row = document.querySelector('[data-oracle-projects-row="true"]');
        if (!row) return { ok: false, error: 'Tagged row missing' };
        row.scrollIntoView({ block: 'center', inline: 'center' });
        const rect = row.getBoundingClientRect();
        return {
          ok: true,
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          center: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
        };
      })()`,
      returnByValue: true,
    });
    if (lookup.exceptionDetails) {
      throw new Error(`Lookup failed: ${lookup.exceptionDetails.exception?.description}`);
    }
    const info = lookup.result?.value as
      | { ok: true; rect: { x: number; y: number; width: number; height: number }; center: { x: number; y: number } }
      | { ok: false; error?: string }
      | undefined;
    if (!info?.ok) {
      throw new Error(info?.error || 'Row not found');
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
                text: (el.textContent || '').trim().slice(0, 40),
              }
            : null,
        };
      })()`,
      returnByValue: true,
    });
    if (check.exceptionDetails) {
      throw new Error(`Check failed: ${check.exceptionDetails.exception?.description}`);
    }

    console.log('✅ Step 2: hover result:', check.result?.value);
  } finally {
    await client.close();
  }
}

void main();
