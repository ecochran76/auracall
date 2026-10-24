import { afterEach, describe, expect, it, vi } from 'vitest';
import { ensureModelSelection } from '../../src/browser/actions/modelSelection.js';
import { ensureChatgptComposerMode } from '../../src/browser/actions/chatgptComposerMode.js';

class Heading {
  constructor(public innerText: string, public hidden = false, public inConversation = false) {}
  getBoundingClientRect() { return { width: this.hidden ? 0 : 100, height: 30 }; }
  closest() { return this.inConversation ? {} : null; }
}
afterEach(() => vi.unstubAllGlobals());

function runtime(kind: 'model' | 'mode', heading: Heading) {
  vi.stubGlobal('HTMLElement', Heading);
  vi.stubGlobal('getComputedStyle', () => ({ display: 'block', visibility: 'visible' }));
  vi.stubGlobal('document', { querySelectorAll: () => [heading] });
  const evaluate = vi.fn(async ({ expression }: { expression: string }) => {
    if (expression.includes('const BUTTON_SELECTORS')) return { result: { value: { status: 'button-missing' } } };
    if (expression.includes('const DESIRED_MODE')) return { result: { value: { status: 'mode-not-found', availableModes: [] } } };
    return { result: { value: new Function(`return ${expression}`)() } };
  });
  const client = { evaluate } as never;
  return () => kind === 'model'
    ? ensureModelSelection(client, '6 Pro', () => {})
    : ensureChatgptComposerMode(client, 'chat', () => {});
}

describe('ChatGPT startup account error diagnostics', () => {
  it.each(['model', 'mode'] as const)('reports the account page instead of missing %s controls', async (kind) => {
    await expect(runtime(kind, new Heading('We couldn’t load your account'))())
      .rejects.toMatchObject({ code: 'CHATGPT_ACCOUNT_LOAD_ERROR' });
  });

  it.each([
    new Heading('We couldn’t load your account', true),
    new Heading('We couldn’t load your account', false, true),
    new Heading('Welcome back'),
  ])('keeps ordinary missing-control diagnostics for hidden, quoted or healthy text', async (heading) => {
    await expect(runtime('model', heading)()).rejects.toThrow('Unable to locate the ChatGPT model selector button');
  });
});
