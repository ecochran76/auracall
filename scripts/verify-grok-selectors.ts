import CDP from 'chrome-remote-interface';
import { GROK_PROVIDER } from '../src/browser/providers/grok.js';
import { resolveScriptBrowserTarget } from './browser-target.js';

async function main() {
  const { host, port } = await resolveScriptBrowserTarget();
  console.log(`Connecting to ${host}:${port}...`);
  const client = await CDP({ host, port });
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
