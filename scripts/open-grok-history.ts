import CDP from 'chrome-remote-interface';

async function main() {
  const port = 34105;
  const host = '127.0.0.1';
  console.log(`Connecting to Grok on ${host}:${port}...`);
  
  let client;
  try {
    client = await CDP({ host, port });
    await client.Runtime.enable();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Failed to connect:', message);
    return;
  }

  console.log('Searching for history button...');
  await client.Runtime.evaluate({
    expression: `(async () => {
      const normalize = (value) => String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
      const nodes = Array.from(document.querySelectorAll('a,button,[role="button"],[role="link"],div'));
      
      for (const node of nodes) {
        const label = normalize(node.getAttribute('aria-label') || node.textContent || '');
        if (label.includes('history') || (label.includes('tory') && label.includes('hi'))) {
          console.log('Found history node:', node.tagName, label);
          const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
          node.dispatchEvent(clickEvent);
          return 'Clicked';
        }
      }
      return 'Not found';
    })()`,
    awaitPromise: true
  });

  console.log('History command sent. Check the browser window.');
  await client.close();
}

main();
