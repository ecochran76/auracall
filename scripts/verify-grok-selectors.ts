import CDP from 'chrome-remote-interface';
import { GROK_PROVIDER } from '../src/browser/providers/grok.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getOracleHomeDir } from '../src/oracleHome.js';
import { isDevToolsResponsive } from '../src/browser/processCheck.js';

async function resolvePort(): Promise<number> {
  const raw = process.env.ORACLE_BROWSER_PORT ?? process.env.ORACLE_BROWSER_DEBUG_PORT;
  if (raw) {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  const registryPath = path.join(getOracleHomeDir(), 'browser-state.json');
  try {
    const rawRegistry = await fs.readFile(registryPath, 'utf8');
    const registry = JSON.parse(rawRegistry) as {
      instances?: Record<string, { host?: string; port?: number; lastSeenAt?: string; launchedAt?: string }>;
    };
    const candidates = Object.values(registry.instances ?? {})
      .filter((instance) => typeof instance.port === 'number' && instance.port > 0)
      .sort((a, b) => {
        const aTime = Date.parse(a.lastSeenAt || a.launchedAt || '') || 0;
        const bTime = Date.parse(b.lastSeenAt || b.launchedAt || '') || 0;
        return bTime - aTime;
      });
    for (const instance of candidates) {
      const host = instance.host || '127.0.0.1';
      const port = instance.port as number;
      if (await isDevToolsResponsive({ host, port, attempts: 2, timeoutMs: 750 })) {
        return port;
      }
    }
  } catch {
    // ignore registry read errors
  }
  throw new Error('No DevTools port found in registry. Launch an Oracle browser run or set ORACLE_BROWSER_PORT.');
}

async function main() {
  const port = await resolvePort();
  console.log(`Connecting to ${port}...`);
  const client = await CDP({ host: '127.0.0.1', port });
  await client.Runtime.enable();
  await client.DOM.enable();

  // 1. Check if menu is open (it should be if it was "hanging open")
  // Or we try to open it.
  console.log('Checking model menu state...');
  const menuBtnSelector = GROK_PROVIDER.selectors.modelButton.join(',');
  const menuOpen = await client.Runtime.evaluate({
    expression: `(() => {
        const btn = document.querySelector('${menuBtnSelector}');
        if (!btn) return 'Button not found';
        return btn.getAttribute('data-state') || btn.getAttribute('aria-expanded');
    })()`,
    returnByValue: true
  });
  console.log('Menu button state:', menuOpen.result.value);

  if (menuOpen.result.value !== 'open' && menuOpen.result.value !== 'true') {
      console.log('Opening menu...');
      await client.Runtime.evaluate({
        expression: `(() => {
            const btn = document.querySelector('${menuBtnSelector}');
            if (btn) btn.click();
        })()`
      });
      await new Promise(r => setTimeout(r, 1000));
  }

  // 2. Test menu item selectors
  const itemSelectors = GROK_PROVIDER.selectors.menuItem.join(',');
  console.log(`Testing selectors: ${itemSelectors}`);
  
  const items = await client.Runtime.evaluate({
    expression: `(() => {
        const nodes = Array.from(document.querySelectorAll('${itemSelectors}'));
        // Filter for visible items that look like models (have text)
        return nodes.map(n => ({
            tag: n.tagName,
            text: n.textContent.trim(),
            role: n.getAttribute('role'),
            class: n.className
        })).filter(i => i.text.length > 0);
    })()`,
    returnByValue: true
  });

  console.log('Found items:', JSON.stringify(items.result.value, null, 2));
  
  const grok2 = (items.result.value as any[]).find(i => i.text.includes('Grok 2') || i.text.includes('Grok 3') || i.text.includes('Thinking'));
  if (grok2) {
      console.log('✅ SUCCESS: Found model item:', grok2.text);
  } else {
      console.log('❌ FAILURE: Did not find expected model items.');
  }

  client.close();
}

main();
