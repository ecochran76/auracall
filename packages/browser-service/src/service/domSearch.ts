export interface BrowserDomSearchMatch {
  tag: string;
  id: string | null;
  role: string | null;
  text: string | null;
  ariaLabel: string | null;
  title: string | null;
  dataTestId: string | null;
  className: string | null;
  href: string | null;
  checked: boolean | null;
  expanded: boolean | null;
  visible: boolean;
}

export interface BrowserDomSearchResult {
  totalScanned: number;
  matched: BrowserDomSearchMatch[];
}

export interface BrowserDomSearchOptions {
  selector?: string | null;
  text?: string[];
  ariaLabel?: string[];
  role?: string[];
  dataTestId?: string[];
  classIncludes?: string[];
  tag?: string[];
  checked?: boolean | null;
  expanded?: boolean | null;
  visibleOnly?: boolean;
  caseSensitive?: boolean;
  limit?: number;
  maxScan?: number;
}

export function normalizeBrowserDomSearchOptions(
  options: BrowserDomSearchOptions = {},
): Required<Omit<BrowserDomSearchOptions, 'checked' | 'expanded'>> & {
  checked: boolean | null;
  expanded: boolean | null;
} {
  return {
    selector: typeof options.selector === 'string' && options.selector.trim().length > 0 ? options.selector.trim() : null,
    text: options.text ?? [],
    ariaLabel: options.ariaLabel ?? [],
    role: options.role ?? [],
    dataTestId: options.dataTestId ?? [],
    classIncludes: options.classIncludes ?? [],
    tag: options.tag ?? [],
    checked: typeof options.checked === 'boolean' ? options.checked : null,
    expanded: typeof options.expanded === 'boolean' ? options.expanded : null,
    visibleOnly: options.visibleOnly ?? true,
    caseSensitive: options.caseSensitive ?? false,
    limit: Math.max(1, Math.min(options.limit ?? 50, 500)),
    maxScan: Math.max(100, Math.min(options.maxScan ?? 5000, 20000)),
  };
}

export function buildBrowserDomSearchExpression(options: BrowserDomSearchOptions = {}): string {
  const normalizedOptions = normalizeBrowserDomSearchOptions(options);
  const optionsJson = JSON.stringify(normalizedOptions);
  return `(() => {
    const options = ${optionsJson};
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
    const normalizeMatch = (value) => {
      const text = normalize(value);
      return options.caseSensitive ? text : text.toLowerCase();
    };
    const includesAny = (haystack, needles) => {
      if (!Array.isArray(needles) || needles.length === 0) return true;
      return needles.some((needle) => haystack.includes(normalizeMatch(needle)));
    };
    const isVisible = (node) => {
      if (!(node instanceof Element)) return false;
      const rect = node.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      const style = window.getComputedStyle(node);
      return style.display !== 'none' && style.visibility !== 'hidden';
    };
    const root = options.selector
      ? Array.from(document.querySelectorAll(options.selector))
      : Array.from(document.querySelectorAll('*'));
    const matches = [];
    let totalScanned = 0;
    for (const node of root) {
      if (!(node instanceof HTMLElement)) continue;
      totalScanned += 1;
      if (totalScanned > options.maxScan) break;
      const visible = isVisible(node);
      if (options.visibleOnly && !visible) continue;
      const tag = String(node.tagName || '').toLowerCase();
      const role = normalize(node.getAttribute('role') || '') || null;
      const text = normalize(node.textContent || '') || null;
      const ariaLabel = normalize(node.getAttribute('aria-label') || '') || null;
      const title = normalize(node.getAttribute('title') || '') || null;
      const dataTestId = normalize(node.getAttribute('data-test-id') || '') || null;
      const className = normalize(node.className || '') || null;
      const href = node instanceof HTMLAnchorElement ? normalize(node.href || '') || null : null;
      const checkedAttr = node.getAttribute('aria-checked');
      const expandedAttr = node.getAttribute('aria-expanded');
      const checked = checkedAttr === 'true' ? true : checkedAttr === 'false' ? false : null;
      const expanded = expandedAttr === 'true' ? true : expandedAttr === 'false' ? false : null;
      const textHaystack = normalizeMatch([text, ariaLabel, title].filter(Boolean).join(' '));
      const roleHaystack = normalizeMatch(role || '');
      const dataTestIdHaystack = normalizeMatch(dataTestId || '');
      const classHaystack = normalizeMatch(className || '');
      const tagHaystack = normalizeMatch(tag);
      if (!includesAny(textHaystack, options.text) && !includesAny(textHaystack, options.ariaLabel)) continue;
      if (Array.isArray(options.ariaLabel) && options.ariaLabel.length > 0 && !includesAny(normalizeMatch(ariaLabel || ''), options.ariaLabel)) continue;
      if (Array.isArray(options.role) && options.role.length > 0 && !includesAny(roleHaystack, options.role)) continue;
      if (Array.isArray(options.dataTestId) && options.dataTestId.length > 0 && !includesAny(dataTestIdHaystack, options.dataTestId)) continue;
      if (Array.isArray(options.classIncludes) && options.classIncludes.length > 0 && !includesAny(classHaystack, options.classIncludes)) continue;
      if (Array.isArray(options.tag) && options.tag.length > 0 && !includesAny(tagHaystack, options.tag)) continue;
      if (options.checked !== null && checked !== options.checked) continue;
      if (options.expanded !== null && expanded !== options.expanded) continue;
      matches.push({
        tag,
        id: normalize(node.id || '') || null,
        role,
        text,
        ariaLabel,
        title,
        dataTestId,
        className,
        href,
        checked,
        expanded,
        visible,
      });
      if (matches.length >= options.limit) break;
    }
    return { totalScanned, matched: matches };
  })()`;
}
