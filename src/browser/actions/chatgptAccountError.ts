import type { ChromeClient } from '../types.js';

/** Diagnose a missing startup control without mistaking conversation text for page failure. */
export async function assertNoChatgptAccountLoadError(Runtime: ChromeClient['Runtime']): Promise<void> {
  const result = await Runtime.evaluate({
    returnByValue: true,
    expression: `(() => {
      const headings = document.querySelectorAll(
        'main h1, main h2, main [role="alert"], [role="main"] h1, [role="main"] h2, [role="main"] [role="alert"]'
      );
      return Array.from(headings).some((node) => {
        if (!(node instanceof HTMLElement) || node.closest('nav, aside, article, [role="article"], [data-testid^="conversation-turn"], [data-message-author-role], [data-turn], [inert], [aria-hidden="true"]')) return false;
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        if (rect.width <= 0 || rect.height <= 0 || style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
        return /\\b(?:(?:we\\s+)?(?:couldn['’]t|could not) load|(?:unable|failed) to load) your account\\b|\\b(?:error|problem|trouble) (?:while )?loading your account\\b/i.test(node.innerText || '');
      });
    })()`,
  });
  if (result.result?.value === true) {
    throw Object.assign(new Error(
      'ChatGPT could not load your account page. Recover that page before retrying; this does not establish that your login expired.',
    ), { code: 'CHATGPT_ACCOUNT_LOAD_ERROR' });
  }
}
