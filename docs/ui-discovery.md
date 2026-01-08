# Browser UI Discovery & Debugging

This guide documents techniques for discovering, inspecting, and debugging the web UIs (ChatGPT, Grok, Gemini) that Oracle automates. These methods are essential when selectors break or when adding support for new providers.

## Core Tool: `browser-tools.ts eval`

The most powerful tool in your arsenal is the ability to execute arbitrary JavaScript in the context of the running automation browser. This allows you to test selectors, inspect the DOM state, and trigger events exactly as the automation script would.

### 1. Connect to the Browser

First, ensure the automation browser is running with a known DevTools port.
- **Manual Login:** `oracle --browser-manual-login --browser-keep-browser` (default port 9222).
- **During a Run:** Use `--browser-keep-browser` and check the logs for the port (e.g., `DevTools port 9222`).

### 2. Execute JavaScript

Use `pnpm tsx scripts/browser-tools.ts eval` to run code.

```bash
# Basic check: Get current URL
pnpm tsx scripts/browser-tools.ts eval --port 9222 "location.href"

# Inspect structure: Dump specific elements
pnpm tsx scripts/browser-tools.ts eval --port 9222 "Array.from(document.querySelectorAll('button')).map(b => b.outerHTML)"

# Test logic: Run a complex script (e.g., finding a button by label)
pnpm tsx scripts/browser-tools.ts eval --port 9222 "
(() => {
  const btn = Array.from(document.querySelectorAll('button')).find(b => b.getAttribute('aria-label') === 'Toggle Menu');
  if (btn) {
    btn.click(); // You can even interact!
    return 'Clicked';
  }
  return 'Not found';
})()
"
```

## Discovery Strategies

### Finding Robust Selectors

Avoid relying on obfuscated class names (e.g., `css-12345`). Instead, prioritize semantic attributes which are more stable:

1.  **ARIA Roles & Labels:** `[role="button"]`, `[aria-label="History"]`.
2.  **Data Attributes:** `[data-testid="send-button"]`, `[data-value="model:gpt-4"]`.
3.  **Hierarchy:** `[role="dialog"] button` (a button inside a dialog).

**Example: Inspecting a suspicious element**
If you suspect an item is not a standard link, check its attributes:
```bash
pnpm tsx scripts/browser-tools.ts eval --port 9222 "
(() => {
  const item = document.querySelector('.some-class');
  return {
    tagName: item.tagName,
    role: item.getAttribute('role'),
    events: getEventListeners(item) // Note: getEventListeners is Chrome Console API only, not available in Runtime.evaluate
  };
})()
"
```

### Debugging "Element Not Found"

If your automation fails to find an element that you can see:

1.  **Timing:** The element might render asynchronously. Use `waitForDialog` or `waitForSelector` patterns with retries.
2.  **Context:** Are you on the right page? Check `location.href`.
    *   *Gotcha:* `CDP.List` might show multiple targets (e.g., background workers, iframes). Ensure your adapter is connecting to the correct `targetId`.
3.  **Visibility:** The element might be in the DOM but hidden (`display: none` or inside a collapsed menu).
    *   *Technique:* Try clicking the parent/toggle button first.
4.  **Shadow DOM:** `document.querySelector` does not pierce Shadow DOM. You may need to traverse `shadowRoot`.

### Handling Dynamic Lists (Virtualization)

Modern UIs (like Grok's history) often use virtualized lists (e.g., `cmdk`).
- **Issue:** `querySelectorAll` only finds visible items.
- **Solution:** You may need to scroll the container or trigger specific "Show All" actions to load the full dataset.

## The Inspector Tool (`scripts/inspector.ts`)

For more advanced discovery, we have started a dedicated "Inspector" toolset located in `src/inspector`.

**Usage:**
```bash
# Dump a semantic JSON snapshot of the current page
pnpm tsx scripts/inspector.ts

# Highlight an element (draws a purple overlay in the browser)
pnpm tsx scripts/inspector.ts --highlight 'button[aria-label="Submit"]'
```

**Architecture:**
- **Crawler:** `src/inspector/crawler.ts` injects a script to traverse the DOM and extract a simplified "Semantic Tree" (filtering out noise, focusing on interactive elements).
- **Highlight:** `src/inspector/highlight.ts` uses CDP `DOM.highlightNode` to visually verify selectors.

This tool is the foundation for a future "Inspector Agent" that can autonomously explore the UI.