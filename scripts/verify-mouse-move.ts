import { enforceRawDevToolsEscapeHatchForCli } from './raw-devtools-guard.js';
enforceRawDevToolsEscapeHatchForCli();
import CDP from 'chrome-remote-interface';
import { resolveScriptBrowserTarget } from './browser-target.js';

async function main() {
  const selector = process.argv[2];
  if (!selector) {
    console.error('Usage: pnpm tsx scripts/verify-mouse-move.ts <css-selector>');
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
    const init = await client.Runtime.evaluate({
      expression: `(() => {
        if (!window.__oracleMouse) {
          window.__oracleMouse = { moves: [], last: null };
          const dot = document.createElement('div');
          dot.id = '__oracle-mouse-dot';
          dot.style.position = 'fixed';
          dot.style.width = '10px';
          dot.style.height = '10px';
          dot.style.borderRadius = '999px';
          dot.style.background = 'rgba(255, 0, 0, 0.7)';
          dot.style.zIndex = '2147483647';
          dot.style.pointerEvents = 'none';
          dot.style.left = '0px';
          dot.style.top = '0px';
          document.documentElement.appendChild(dot);
          document.addEventListener('mousemove', (event) => {
            window.__oracleMouse.last = { x: event.clientX, y: event.clientY, t: Date.now() };
            window.__oracleMouse.moves.push(window.__oracleMouse.last);
            const marker = document.getElementById('__oracle-mouse-dot');
            if (marker) {
              marker.style.left = event.clientX - 5 + 'px';
              marker.style.top = event.clientY - 5 + 'px';
            }
          });
        }
        return { ok: true };
      })()`,
      returnByValue: true,
    });
    if (init.exceptionDetails) {
      throw new Error(`Init failed: ${init.exceptionDetails.exception?.description}`);
    }

    const lookup = await client.Runtime.evaluate({
      expression: `(() => {
        const selector = ${JSON.stringify(selector)};
        const el = document.querySelector(selector);
        if (!el) return { ok: false, error: 'Selector not found' };
        const rect = el.getBoundingClientRect();
        return {
          ok: true,
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          center: { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 },
        };
      })()`,
      returnByValue: true,
    });
    if (lookup.exceptionDetails) {
      throw new Error(`Lookup failed: ${lookup.exceptionDetails.exception?.description}`);
    }

    const lookupInfo = lookup.result?.value as
      | { ok: true; rect: { x: number; y: number; width: number; height: number }; center: { x: number; y: number } }
      | { ok: false; error?: string }
      | undefined;
    if (!lookupInfo?.ok) {
      throw new Error(lookupInfo?.error || 'Selector not found');
    }

    const x = Math.round(lookupInfo.center.x);
    const y = Math.round(lookupInfo.center.y);
    await client.Input.dispatchMouseEvent({ type: 'mouseMoved', x, y });
    await client.Input.dispatchMouseEvent({ type: 'mouseMoved', x: x + 1, y: y + 1 });

    await new Promise((resolve) => setTimeout(resolve, 200));

    const check = await client.Runtime.evaluate({
      expression: `(() => {
        const center = ${JSON.stringify({ x, y })};
        const el = document.elementFromPoint(center.x, center.y);
        return {
          center,
          lastMove: window.__oracleMouse?.last || null,
          element: el
            ? {
                tag: el.tagName.toLowerCase(),
                ariaLabel: el.getAttribute('aria-label'),
                className: el.className,
                id: el.id,
              }
            : null,
        };
      })()`,
      returnByValue: true,
    });
    if (check.exceptionDetails) {
      throw new Error(`Check failed: ${check.exceptionDetails.exception?.description}`);
    }

    console.log('✅ mouse move result:', check.result?.value);
  } finally {
    await client.close();
  }
}

void main();
