export const GROK_MODEL_LABEL_NORMALIZER = `(text) => {
  const cleaned = (text || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[\\u2022•]+/g, ' ')
    .replace(/\\s+/g, ' ')
    .trim();
  return cleaned.split('\\\\n')[0] || cleaned;
}`;

export function normalizeGrokModelLabel(text: string): string {
  const cleaned = text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[\u2022•]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.split('\n')[0] || cleaned;
}

// Keep observed menu labels distinct from underlying model/version IDs.
export interface GrokModelMenuEntry {
  label: string;
  selected: boolean;
  entitlement: 'available' | 'account-gated';
}

export const GROK_MODEL_MENU_ENTRIES_EXPRESSION = `(() => {
  const visible = el => el instanceof HTMLElement && !el.closest('[aria-hidden="true"], [data-state="closed"]') &&
    window.getComputedStyle(el).display !== 'none' && window.getComputedStyle(el).visibility !== 'hidden' &&
    el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
  const menus = [...new Set(['[role="menu"]', '[role="listbox"]', '[data-radix-dropdown-menu-content]', '[data-radix-menu-content]', 'div[data-state="open"]']
    .flatMap(selector => Array.from(document.querySelectorAll(selector))))].filter(visible);
  const roots = menus.filter(menu => !menus.some(other => other !== menu && menu.contains(other)));
  if (roots.length !== 1) return [];
  const menu = roots[0];
  const roleItems = Array.from(menu.querySelectorAll('[role="menuitemradio"], [role="menuitem"], [role="option"]')).filter(visible);
  const items = roleItems.length ? roleItems : Array.from(menu.querySelectorAll('button')).filter(visible);
  const normalize = ${GROK_MODEL_LABEL_NORMALIZER};
  return items.map(node => ({
    node,
    label: normalize(node.getAttribute('aria-label') || node.textContent || '').match(/^(Auto|Fast|Expert|Build|Heavy)(?=\\s|$)/i)?.[1] || normalize(node.getAttribute('aria-label') || node.textContent || ''),
    selected: node.getAttribute('aria-checked') === 'true' || node.getAttribute('aria-selected') === 'true' || node.getAttribute('data-state') === 'checked',
    entitlement: node.disabled || node.getAttribute('aria-disabled') === 'true' || node.hasAttribute('data-disabled') || /requires|upgrade|subscribe|unlock/i.test(node.textContent || '') ? 'account-gated' : 'available',
  }));
})()`;
