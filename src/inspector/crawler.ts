export interface SemanticNode {
  id: number;
  tagName: string;
  role?: string;
  name?: string;
  text?: string;
  attributes?: Record<string, string>;
  children?: SemanticNode[];
  interactive?: boolean;
}

export const CRAWLER_SCRIPT = `(() => {
  let nodeIdCounter = 0;
  const interactiveTags = new Set(['A', 'BUTTON', 'INPUT', 'TEXTAREA', 'SELECT', 'DETAILS', 'SUMMARY']);
  const interactiveRoles = new Set(['button', 'link', 'checkbox', 'menuitem', 'option', 'tab', 'switch', 'textbox']);

  function isVisible(el) {
    if (!el) return false;
    if (el.tagName === 'BODY' || el.tagName === 'HTML') return true;
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && el.offsetParent !== null;
  }

  function getSemanticRole(el) {
    return el.getAttribute('role');
  }

  function getAccessibleName(el) {
    return el.getAttribute('aria-label') || el.getAttribute('name') || el.getAttribute('title');
  }

  function cleanText(text) {
    return (text || '').replace(/\\s+/g, ' ').trim();
  }

  function crawl(node) {
    if (!node || !isVisible(node)) return null;

    // Skip scripts, styles, etc.
    if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'SVG', 'PATH'].includes(node.tagName)) return null;

    const role = getSemanticRole(node);
    const name = getAccessibleName(node);
    const tagName = node.tagName;
    
    // Determine interactivity
    const isInteractive = 
      interactiveTags.has(tagName) || 
      interactiveRoles.has(role) || 
      node.getAttribute('contenteditable') === 'true' ||
      node.hasAttribute('onclick') || // imperfect, but hint
      window.getComputedStyle(node).cursor === 'pointer';

    // Collect relevant attributes for selectors
    const attributes = {};
    if (node.id) attributes.id = node.id;
    if (node.className && typeof node.className === 'string') attributes.class = node.className;
    if (role) attributes.role = role;
    if (name) attributes['aria-label'] = name;
    for (const attr of ['data-testid', 'data-value', 'data-state', 'href', 'type', 'placeholder']) {
      if (node.hasAttribute(attr)) attributes[attr] = node.getAttribute(attr);
    }

    // Get direct text content (not recursive textContent) if reasonable
    // Strategy: if node has only text children, use that.
    let text = '';
    let hasElementChildren = false;
    let childNodes = [];
    
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        text += child.nodeValue;
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        hasElementChildren = true;
        const processedChild = crawl(child);
        if (processedChild) childNodes.push(processedChild);
      }
    }
    
    text = cleanText(text);

    // Filter noise: if a div/span has no semantic role, no interesting attributes, no text, and no interesting children, drop it.
    // But we need structure.
    // Strategy: Flatten "boring" containers? 
    // For now, keep it simple: keep if interactive OR has text OR has interesting children.
    
    const isInteresting = isInteractive || text.length > 0 || childNodes.length > 0 || attributes.id || attributes['data-testid'];

    if (!isInteresting && !role) return null;

    return {
      tagName,
      role,
      name,
      text: text || undefined,
      attributes: Object.keys(attributes).length ? attributes : undefined,
      children: childNodes.length ? childNodes : undefined,
      interactive: isInteractive || undefined
    };
  }

  return crawl(document.body);
})()`;
