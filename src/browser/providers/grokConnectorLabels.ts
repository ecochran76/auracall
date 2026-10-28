/** Native Connector cards can put a text avatar before the actual title. Bind
 * the card's exact test ID to its visible title; legacy rows have no card marker. */
export const GROK_CONNECTOR_NAME_READER = `(button) => {
 const lines=String(button.innerText||button.textContent||'').split(/\\n+/).map(s=>s.trim()).filter(Boolean);
 for(let card=button,depth=0;card&&depth<5;card=card.parentElement,depth++) {
  const marker=card.getAttribute('data-testid');
  if(!marker?.startsWith('connector-card-'))continue;
  const name=marker.slice('connector-card-'.length);
  const titles=Array.from(button.querySelectorAll('span')).filter(span=>String(span.getAttribute('class')||'').split(/\\s+/).includes('font-medium')&&String(span.innerText||span.textContent||'').trim()===name);
  return name&&titles.length===1?name:null;
 }
 return lines[0]||null;
}`;
