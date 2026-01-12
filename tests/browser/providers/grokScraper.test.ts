import { describe, it, expect } from 'vitest';

// Mock DOM elements
class MockElement {
  tagName: string;
  attributes: Map<string, string>;
  children: MockElement[];
  parentElement: MockElement | null = null;
  textContent: string = '';

  constructor(tagName: string, attributes: Record<string, string> = {}, textContent = '') {
    this.tagName = tagName.toUpperCase();
    this.attributes = new Map(Object.entries(attributes));
    this.children = [];
    this.textContent = textContent;
  }

  getAttribute(name: string) {
    return this.attributes.get(name) || null;
  }

  get dataset() {
    const data: Record<string, string> = {};
    for (const [key, value] of this.attributes) {
      if (key.startsWith('data-')) {
        const prop = key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        data[prop] = value;
      }
    }
    return data;
  }

  querySelector(selector: string): MockElement | null {
    // Very basic selector support for the test
    if (selector.includes('line-clamp') || selector.includes('truncate')) {
      // Assume searching for title node
      return this.findChild((child) => {
        if (!child.attributes.has('class')) return false;
        const className = child.attributes.get('class');
        return Boolean(
          className?.includes('line-clamp') || className?.includes('truncate'),
        );
      });
    }
    return null;
  }

  closest(selector: string): MockElement | null {
    let current: MockElement | null = this;
    while (current) {
      if (selector === 'div,li' && (current.tagName === 'DIV' || current.tagName === 'LI')) return current;
      current = current.parentElement;
    }
    return null;
  }

  findChild(predicate: (el: MockElement) => boolean): MockElement | null {
    if (predicate(this)) return this;
    for (const child of this.children) {
      const found = child.findChild(predicate);
      if (found) return found;
    }
    return null;
  }
}

// Scraper logic extracted from grokAdapter.ts (simplified for test context)
function scrape(items: MockElement[], projectId: string | null) {
  const conversations = new Map<string, { id: string; title: string; url: string | null }>();
  const add = (id: string, title: string, url: string) => {
    if (!id) return;
    if (!conversations.has(id)) {
      conversations.set(id, { id, title: title || id, url: url || null });
    }
  };

  for (const node of items) {
    const href = node.getAttribute('href') || node.getAttribute('data-href') || node.getAttribute('data-url') || '';
    const dataValue = node.getAttribute('data-value') || node.dataset?.value || '';
    let chatId = '';
    let url = '';

    if (dataValue.startsWith('conversation:')) {
      chatId = dataValue.split(':')[1];
      url = `https://grok.com/c/${chatId}`;
    } else if (href) {
      try {
        // Mock URL parsing
        if (href.includes('/c/')) {
           chatId = href.split('/c/')[1];
           url = href;
        }
      } catch { /* ignore */ }
    }

    if (!chatId) continue;
    
    if (projectId && url.includes('/project/') && !url.includes(`/project/${projectId}`)) {
      continue;
    }

    const row = node.closest('div,li') || node;
    // Mock title extraction
    const title = row.textContent.trim();
    if (!title) continue;
    add(chatId, title, url);
  }
  return Array.from(conversations.values());
}

describe('Grok Scraper Logic', () => {
  it('should scrape items with role="option" and data-value', () => {
    // Structure: <div role="option" data-value="conversation:123">Title</div>
    const item = new MockElement('DIV', { role: 'option', 'data-value': 'conversation:123' }, 'My Chat');
    const items = [item];
    
    const result = scrape(items, null);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: '123',
      title: 'My Chat',
      url: 'https://grok.com/c/123'
    });
  });

  it('should scrape items with <a> tag and href', () => {
    // Structure: <div><a href="/c/456"></a>Title</div>
    // Note: In scraper loop, we iterate 'items' which are the <a> tags or role=option nodes.
    
    const container = new MockElement('DIV');
    container.textContent = 'Link Chat';
    const link = new MockElement('A', { href: 'https://grok.com/c/456' });
    link.parentElement = container;
    container.children.push(link);
    
    const items = [link];
    const result = scrape(items, null);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: '456',
      title: 'Link Chat', // Text comes from row (closest div)
      url: 'https://grok.com/c/456'
    });
  });

  it('should deduplicate items found via both methods', () => {
    // Structure: <div role="option" data-value="conversation:789"><a href="/c/789"></a>Title</div>
    // This matches both selectors.
    
    const container = new MockElement('DIV', { role: 'option', 'data-value': 'conversation:789' }, 'Dual Chat');
    const link = new MockElement('A', { href: 'https://grok.com/c/789' });
    link.parentElement = container;
    container.children.push(link);
    
    const items = [container, link];
    const result = scrape(items, null);
    
    expect(result).toHaveLength(1); // Deduplicated by ID
    expect(result[0].id).toBe('789');
  });
});
