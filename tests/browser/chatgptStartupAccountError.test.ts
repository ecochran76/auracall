import { afterEach, describe, expect, it, vi } from 'vitest';
import { ensureModelSelection } from '../../src/browser/actions/modelSelection.js';
import { ensureChatgptComposerMode } from '../../src/browser/actions/chatgptComposerMode.js';

class Heading {
  constructor(public innerText: string, public hidden = false, public inConversation = false, public container?: string, public opacity = "1") {}
  getBoundingClientRect() { return { width: this.hidden ? 0 : 100, height: 30 }; }
  closest(selectors: string) {
    return this.inConversation || (this.container && selectors.split(",").map(value => value.trim()).includes(this.container)) ? {} : null;
  }
}
afterEach(() => vi.unstubAllGlobals());

function runtime(kind: 'model' | 'mode', heading: Heading) {
  vi.stubGlobal('HTMLElement', Heading);
  vi.stubGlobal('getComputedStyle', (node: Heading) => ({ display: 'block', visibility: 'visible', opacity: node.opacity }));
  vi.stubGlobal('document', { querySelectorAll: () => [heading] });
  let firstObservation = true;
  const evaluate = vi.fn(async ({ expression }: { expression: string }) => {
    if (firstObservation) {
      firstObservation = false;
      return { result: { value: kind === 'model'
        ? { status: 'button-missing' }
        : { status: 'mode-not-found', availableModes: [] } } };
    }
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
    ['model', 'article'],
    ['mode', 'article'],
    ['model', '[role="article"]'],
    ['mode', '[role="article"]'],
  ] as const)('preserves missing %s diagnostics for quoted headings in %s', async (kind, container) => {
    await expect(runtime(kind, new Heading('We couldn’t load your account', false, false, container))())
      .rejects.toThrow(kind === 'model'
        ? 'Unable to locate the ChatGPT model selector button.'
        : 'Unable to find the ChatGPT Chat mode control.');
  });

  it.each(['model', 'mode'] as const)('preserves missing %s diagnostics for transparent headings', async (kind) => {
    await expect(runtime(kind, new Heading('We couldn’t load your account', false, false, undefined, '0'))())
      .rejects.toThrow(kind === 'model'
        ? 'Unable to locate the ChatGPT model selector button.'
        : 'Unable to find the ChatGPT Chat mode control.');
  });

  it.each([
    new Heading('We couldn’t load your account', true),
    new Heading('We couldn’t load your account', false, true),
    new Heading('Welcome back'),
  ])('keeps ordinary missing-control diagnostics for hidden, quoted or healthy text', async (heading) => {
    await expect(runtime('model', heading)()).rejects.toThrow('Unable to locate the ChatGPT model selector button');
  });
});
