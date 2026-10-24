// biome-ignore-all lint/style/useNamingConvention: DOM and CDP fixture constructors retain platform names.
import { runInNewContext } from 'node:vm';
import { afterEach, expect, test, vi } from 'vitest';
import {
  discoverGrokModels,
  selectGrokMode,
  submitGrokPrompt,
  setGrokPrompt,
  waitForGrokAssistantResult,
} from '../../src/browser/actions/grok.js';

vi.mock('../../src/services/registry.js', async (original) => ({
  ...(await original<typeof import('../../src/services/registry.js')>()),
  ensureServicesRegistry: async () => ({ services: { grok: { models: [] } } }),
}));

class Element {
  tagName = 'DIV';
  disabled = false;
  private ownText = '';
  nodeType = 1;
  get textContent(): string {
    return this.children.length
      ? this.children.map((child) => child.textContent).join('')
      : this.ownText;
  }
  set textContent(value: string) {
    this.children = [];
    this.ownText = value;
  }
  get innerText(): string {
    return this.tagName === 'BR'
      ? '\n'
      : this.children.length
        ? this.children.map((child) => child.innerText).join('')
        : this.ownText;
  }
  get childNodes() {
    return this.children;
  }
  get className() {
    return this.attrs.class ?? '';
  }
  get isContentEditable() {
    return this.attrs.contenteditable === 'true';
  }
  replaceChildren(...nodes: Element[]) {
    this.children = [];
    this.ownText = '';
    this.append(...nodes);
  }
  appendChild(node: Element) {
    this.append(node);
    return node;
  }
  remove() {
    if (this.parentElement)
      this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
  }
  cloneNode(deep = false): Element {
    const clone = new Element(this.tagName, { ...this.attrs });
    clone.ownText = this.ownText;
    clone.nodeType = this.nodeType;
    if (deep) clone.append(...this.children.map((child) => child.cloneNode(true)));
    return clone;
  }
  ownerDocument: Element | undefined;
  getSelection() {
    return null;
  }
  createTextNode(text: string) {
    const node = new Element('TEXT');
    node.nodeType = 3;
    node.textContent = text;
    return node;
  }
  createElement(tag: string) {
    return new Element(tag.toUpperCase());
  }
  value = '';
  attrs: Record<string, string> = {};
  children: Element[] = [];
  parentElement: Element | null = null;
  click = vi.fn();
  focus = vi.fn();
  dispatchEvent = vi.fn(() => true);
  constructor(tag = 'DIV', attrs: Record<string, string> = {}) {
    this.tagName = tag;
    this.attrs = attrs;
  }
  getAttribute(name: string) {
    return this.attrs[name] ?? null;
  }
  hasAttribute(name: string) {
    return name in this.attrs;
  }
  setAttribute(name: string, value: string) {
    this.attrs[name] = value;
  }
  getBoundingClientRect() {
    return { width: 300, height: 50 };
  }
  matches(selector: string): boolean {
    return selector.split(',').some((part) => {
      part = part.trim();
      const segments = part.split(/\s+(?![^\[]*\])/);
      if (segments.length > 1) {
        const last = segments.pop()!;
        let ancestor = this.parentElement;
        while (ancestor) {
          if (ancestor.matches(segments.join(' ')) && this.matches(last)) return true;
          ancestor = ancestor.parentElement;
        }
        return false;
      }
      const tag = part.match(/^[a-z]+/i)?.[0];
      if (tag && this.tagName !== tag.toUpperCase()) return false;
      const id = part.match(/#([\w-]+)/)?.[1];
      if (id && this.attrs.id !== id) return false;
      const cls = part.match(/\.([\w-]+)/)?.[1];
      if (cls && !(this.attrs.class ?? '').split(' ').includes(cls)) return false;
      return [...part.matchAll(/\[([\w-]+)(?:(\^=|\*=|=)["']?([^\]"']*)["']?)?\]/g)].every(
        ([, name, op, value]) => {
          const actual = this.attrs[name];
          return (
            actual !== undefined &&
            (!op ||
              (op === '='
                ? actual === value
                : op === '^='
                  ? actual.startsWith(value)
                  : actual.includes(value)))
          );
        },
      );
    });
  }
  querySelectorAll(selector: string): Element[] {
    return this.children.flatMap((child) => [
      ...(child.matches(selector) ? [child] : []),
      ...child.querySelectorAll(selector),
    ]);
  }
  querySelector(selector: string) {
    return this.querySelectorAll(selector)[0] ?? null;
  }
  closest(selector: string): Element | null {
    return this.matches(selector) ? this : (this.parentElement?.closest(selector) ?? null);
  }
  contains(other: Element): boolean {
    return this === other || this.children.some((child) => child.contains(other));
  }
  append(...nodes: Element[]) {
    nodes.forEach((node) => {
      node.parentElement = this;
      this.children.push(node);
    });
  }
}
class Button extends Element {
  constructor(attrs: Record<string, string> = {}) {
    super('BUTTON', attrs);
  }
}
class Textarea extends Element {
  constructor() {
    super('TEXTAREA', { 'aria-label': 'Ask Grok anything' });
  }
}
function submitFixture() {
  const document = new Element('DOCUMENT');
  const main = new Element('MAIN');
  const form = new Element('FORM');
  const editor = new Textarea();
  editor.value = 'ping';
  const submit = new Button({ type: 'submit', 'aria-label': 'Submit' });
  form.append(editor, submit);
  main.append(form);
  document.append(main);
  const window = { getComputedStyle: () => ({ display: 'block', visibility: 'visible' }) };
  const evaluate = vi.fn(async ({ expression }: { expression: string }) => ({
    result: {
      value: runInNewContext(expression, {
        document,
        HTMLElement: Element,
        HTMLButtonElement: Button,
        HTMLTextAreaElement: Textarea,
        HTMLInputElement: class extends Element {},
        MouseEvent: class {},
        InputEvent: class {},
        Event: class {},
        window,
      }),
    },
  }));
  const input = { dispatchKeyEvent: vi.fn(), insertText: vi.fn() };
  return { document, form, editor, submit, runtime: { evaluate }, input };
}
afterEach(() => vi.useRealTimers());

test('an uncertain click never sends a second prompt with Enter', async () => {
  vi.useFakeTimers();
  const fixture = submitFixture();
  const outcome = submitGrokPrompt(fixture.input as never, fixture.runtime as never).catch(
    (error) => error,
  );
  await vi.runAllTimersAsync();
  expect(await outcome).toMatchObject({ message: expect.stringMatching(/unconfirmed|unknown/i) });
  expect(fixture.submit.click).toHaveBeenCalledTimes(1);
  expect(fixture.input.dispatchKeyEvent).not.toHaveBeenCalled();
});

test('submit is scoped to the exact composer form and observes a delayed commit', async () => {
  vi.useFakeTimers();
  const fixture = submitFixture();
  const foreignForm = new Element('FORM');
  const foreignSubmit = new Button({ type: 'submit', 'aria-label': 'Submit' });
  foreignForm.append(foreignSubmit);
  fixture.document.children.unshift(foreignForm);
  fixture.submit.click.mockImplementation(() => {
    setTimeout(() => fixture.document.append(new Element('DIV', { id: 'response-new' })), 1_500);
  });
  const outcome = submitGrokPrompt(fixture.input as never, fixture.runtime as never).catch(
    (error) => error,
  );
  await vi.runAllTimersAsync();
  expect(await outcome).toBeUndefined();
  expect(foreignSubmit.click).not.toHaveBeenCalled();
  expect(fixture.submit.click).toHaveBeenCalledTimes(1);
  expect(fixture.input.dispatchKeyEvent).not.toHaveBeenCalled();
});

function modelFixture(labels: Array<{ text: string; selected?: boolean; gated?: boolean }>) {
  const fixture = submitFixture();
  const trigger = new Button({ id: 'model-select-trigger' });
  trigger.textContent = 'Fast';
  const menu = new Element('DIV', { 'data-state': 'open', role: 'menu' });
  const items = labels.map((entry) => {
    const item = new Button({
      role: 'menuitemradio',
      'aria-checked': String(Boolean(entry.selected)),
      ...(entry.gated ? { 'aria-disabled': 'true' } : {}),
    });
    item.textContent = entry.text;
    item.click.mockImplementation(() => {
      items.forEach((other) => {
        other.attrs['aria-checked'] = String(other === item);
      });
      trigger.textContent = entry.text.split(' ')[0];
    });
    return item;
  });
  menu.append(...items);
  fixture.document.append(trigger, menu);
  return { ...fixture, items, trigger, menu };
}

test('explicit missing or account-gated models reject before submission', async () => {
  vi.useFakeTimers();
  const fixture = modelFixture([
    { text: 'Fast Quick responses', selected: true },
    { text: 'Heavy Requires SuperGrok Heavy', gated: true },
  ]);
  await expect(
    selectGrokMode(
      fixture.input as never,
      fixture.runtime as never,
      'Build',
      vi.fn<(message: string) => void>(),
    ),
  ).rejects.toThrow(/not found|unable to find/i);
  await expect(
    selectGrokMode(
      fixture.input as never,
      fixture.runtime as never,
      'Heavy',
      vi.fn<(message: string) => void>(),
    ),
  ).rejects.toThrow(/entitlement|account.gated|requires/i);
  expect(fixture.items[1].click).not.toHaveBeenCalled();
  expect(fixture.submit.click).not.toHaveBeenCalled();
});

test('Build selection requires selected-state readback and a noncommitting click rejects', async () => {
  vi.useFakeTimers();
  const fixture = modelFixture([
    { text: 'Fast Quick responses', selected: true },
    { text: 'Build Create apps' },
  ]);
  fixture.items[1].click.mockImplementation(() => undefined);
  const failed = selectGrokMode(
    fixture.input as never,
    fixture.runtime as never,
    'Build',
    vi.fn<(message: string) => void>(),
  ).catch((error) => error);
  await vi.runAllTimersAsync();
  expect(await failed).toMatchObject({
    message: expect.stringMatching(/verify|selected|unconfirmed/i),
  });
});

test('model discovery exposes Build and entitlement, then verifies the explicit choice', async () => {
  vi.useFakeTimers();
  const fixture = modelFixture([
    { text: 'Fast Quick responses', selected: true },
    { text: 'Build Create apps' },
    { text: 'Heavy Requires SuperGrok Heavy', gated: true },
  ]);
  await expect(
    discoverGrokModels(fixture.input as never, fixture.runtime as never),
  ).resolves.toEqual([
    { label: 'Fast', selected: true, entitlement: 'available' },
    { label: 'Build', selected: false, entitlement: 'available' },
    { label: 'Heavy', selected: false, entitlement: 'account-gated' },
  ]);
  await selectGrokMode(
    fixture.input as never,
    fixture.runtime as never,
    'Build',
    vi.fn<(message: string) => void>(),
  );
  expect(fixture.items[1].attrs['aria-checked']).toBe('true');
  expect(fixture.items[1].click).toHaveBeenCalledTimes(1);
});

test('a streaming pause is not terminal even when text remains unchanged', async () => {
  vi.useFakeTimers();
  const runtime = {
    evaluate: vi.fn(async () => ({
      result: {
        value: {
          count: 1,
          lastText: 'partial',
          lastMarkdown: 'partial',
          lastHtml: '',
          toastText: '',
          streaming: true,
          terminal: false,
        },
      },
    })),
  };
  const result = waitForGrokAssistantResult(
    runtime as never,
    2_000,
    vi.fn<(message: string) => void>(),
    { baseline: { count: 0, lastText: '', lastMarkdown: '', lastHtml: '' } },
  ).catch((error) => error);
  await vi.runAllTimersAsync();
  expect(await result).toMatchObject({ message: expect.stringMatching(/timed out|timeout/i) });
});

test('prompt insertion preserves leading, trailing and multiline text boundaries', async () => {
  vi.useFakeTimers();
  const fixture = submitFixture();
  const input = {
    insertText: vi.fn(async ({ text }: { text: string }) => {
      fixture.editor.value = text.trim();
    }),
  };
  const result = setGrokPrompt(input as never, fixture.runtime as never, '  alpha\nbeta  ').catch(
    (error) => error,
  );
  await vi.runAllTimersAsync();
  expect(await result).toBeUndefined();
  expect(fixture.editor.value).toBe('  alpha\nbeta  ');
});

test('rich multiline prompts preserve selected immutable tokens by identity', async () => {
  vi.useFakeTimers();
  const fixture = submitFixture();
  const rich = new Element('DIV', { class: 'ProseMirror', contenteditable: 'true' });
  rich.ownerDocument = fixture.document;
  const token = new Element('SPAN', { contenteditable: 'false', 'data-id': 'connector-fixture' });
  token.textContent = '@Mail';
  rich.append(token, fixture.document.createTextNode(' stale draft'));
  fixture.form.children[0] = rich;
  rich.parentElement = fixture.form;
  const outcome = setGrokPrompt(
    fixture.input as never,
    fixture.runtime as never,
    'first\n\nlast',
  ).catch((error) => error);
  await vi.runAllTimersAsync();
  expect(await outcome).toBeUndefined();
  expect(rich.querySelector('[contenteditable="false"]')).toBe(token);
  expect(rich.innerText).toBe('@Mail first\n\nlast');
});

test('first-turn visible quota warning is returned as a provider warning, without a DOM exception', async () => {
  const fixture = submitFixture();
  const alert = new Element('DIV', { role: 'alert' });
  alert.textContent = 'Query limit reached. Try again in 4 minutes.';
  fixture.document.append(alert);
  await expect(
    waitForGrokAssistantResult(fixture.runtime as never, 1000, vi.fn<(message: string) => void>()),
  ).rejects.toThrow('Query limit reached. Try again in 4 minutes.');
});

test('same-length replacement on a new response waits for terminal DOM evidence after streaming', async () => {
  vi.useFakeTimers();
  const fixture = submitFixture();
  const assistant = new Element('DIV', {
    id: 'response-new',
    class: 'relative group flex flex-col items-start',
    'data-is-streaming': 'true',
  });
  const text = fixture.document.createTextNode('alpha');
  assistant.append(text);
  fixture.document.children[0].append(assistant);
  let settled = false;
  const result = waitForGrokAssistantResult(
    fixture.runtime as never,
    5000,
    vi.fn<(message: string) => void>(),
    {
      baseline: {
        count: 1,
        lastText: 'prior',
        lastMarkdown: 'prior',
        lastHtml: '',
        responseId: 'response-old',
      },
    },
  ).then((value) => {
    settled = true;
    return value;
  });
  await vi.advanceTimersByTimeAsync(1500);
  expect(settled).toBe(false);
  text.textContent = 'omega';
  assistant.attrs['data-is-streaming'] = 'false';
  await vi.runAllTimersAsync();
  await expect(result).resolves.toMatchObject({ text: 'omega', markdown: 'omega' });
});

test('a dispatch transport failure retains unknown effect custody and never retries', async () => {
  const fixture = submitFixture();
  fixture.submit.click.mockImplementation(() => {
    throw new Error('transport response lost after click');
  });
  await expect(
    submitGrokPrompt(fixture.input as never, fixture.runtime as never),
  ).rejects.toMatchObject({ details: { effectState: 'unknown' } });
  expect(fixture.submit.click).toHaveBeenCalledTimes(1);
  expect(fixture.input.dispatchKeyEvent).not.toHaveBeenCalled();
});

test.each([
  'replacement',
  'text-change',
] as const)('prepared composer rejects %s before the final send', async (change) => {
  vi.useFakeTimers();
  const fixture = submitFixture();
  const preparation = setGrokPrompt(
    fixture.input as never,
    fixture.runtime as never,
    'owned draft',
  );
  await vi.runAllTimersAsync();
  await preparation;
  if (change === 'replacement') {
    const replacement = new Textarea();
    replacement.attrs = { ...fixture.editor.attrs };
    replacement.value = 'owned draft';
    replacement.parentElement = fixture.form;
    fixture.form.children[0] = replacement;
  } else fixture.editor.value = 'foreign draft';
  fixture.submit.click.mockImplementation(() =>
    fixture.document.append(new Element('DIV', { id: 'response-foreign' })),
  );
  const outcome = submitGrokPrompt(fixture.input as never, fixture.runtime as never).catch(
    (error) => error,
  );
  await vi.runAllTimersAsync();
  expect(await outcome).toMatchObject({
    message: expect.stringMatching(/prepared|composer|draft/i),
  });
  expect(fixture.submit.click).not.toHaveBeenCalled();
  expect(fixture.input.dispatchKeyEvent).not.toHaveBeenCalled();
});

test('closed picker never verifies selection from a hidden model trigger', async () => {
  vi.useFakeTimers();
  const fixture = modelFixture([
    { text: 'Fast Quick responses', selected: true },
    { text: 'Build Create apps' },
  ]);
  const hidden = new Button({ id: 'model-select-trigger', 'aria-hidden': 'true' });
  hidden.textContent = 'Build';
  hidden.parentElement = fixture.document;
  fixture.document.children.unshift(hidden);
  fixture.items[1].click.mockImplementation(() => fixture.menu.remove());
  fixture.trigger.click.mockImplementation(() => fixture.document.append(fixture.menu));
  const outcome = selectGrokMode(
    fixture.input as never,
    fixture.runtime as never,
    'Build',
    vi.fn<(message: string) => void>(),
  ).catch((error) => error);
  await vi.runAllTimersAsync();
  expect(await outcome).toMatchObject({ message: expect.stringMatching(/verify|selected/i) });
  expect(hidden.click).not.toHaveBeenCalled();
});

test('prepared immutable token replacement rejects even when token metadata is unchanged', async () => {
  vi.useFakeTimers();
  const fixture = submitFixture();
  const rich = new Element('DIV', { class: 'ProseMirror', contenteditable: 'true' });
  rich.ownerDocument = fixture.document;
  const token = new Element('SPAN', { contenteditable: 'false', 'data-id': 'connector-fixture' });
  token.textContent = '@Mail';
  rich.append(token);
  fixture.form.children[0] = rich;
  rich.parentElement = fixture.form;
  const preparation = setGrokPrompt(
    fixture.input as never,
    fixture.runtime as never,
    'owned\ndraft',
  );
  await vi.runAllTimersAsync();
  await preparation;
  const replacement = token.cloneNode(true);
  replacement.parentElement = rich;
  rich.children[0] = replacement;
  fixture.submit.click.mockImplementation(() =>
    fixture.document.append(new Element('DIV', { id: 'response-foreign' })),
  );
  await expect(
    submitGrokPrompt(fixture.input as never, fixture.runtime as never),
  ).rejects.toMatchObject({ details: { effectState: 'pre_effect' } });
  expect(fixture.submit.click).not.toHaveBeenCalled();
  expect(fixture.input.dispatchKeyEvent).not.toHaveBeenCalled();
});

test('verified prepared prompt can commit once and cannot be sent again without preparation', async () => {
  vi.useFakeTimers();
  const fixture = submitFixture();
  const preparation = setGrokPrompt(
    fixture.input as never,
    fixture.runtime as never,
    'owned draft',
  );
  await vi.runAllTimersAsync();
  await preparation;
  fixture.submit.click.mockImplementation(() =>
    fixture.document.append(new Element('DIV', { id: 'response-owned' })),
  );
  await expect(
    submitGrokPrompt(fixture.input as never, fixture.runtime as never),
  ).resolves.toBeUndefined();
  await expect(submitGrokPrompt(fixture.input as never, fixture.runtime as never)).rejects.toThrow(
    /already dispatched/i,
  );
  expect(fixture.submit.click).toHaveBeenCalledTimes(1);
});

test('a closed picker verifies a real Build selection by reopening selected menu state', async () => {
  vi.useFakeTimers();
  const fixture = modelFixture([
    { text: 'Fast Quick responses', selected: true },
    { text: 'Build Create apps' },
  ]);
  fixture.items[1].click.mockImplementation(() => {
    fixture.items[0].attrs['aria-checked'] = 'false';
    fixture.items[1].attrs['aria-checked'] = 'true';
    fixture.menu.remove();
  });
  fixture.trigger.click.mockImplementation(() => fixture.document.append(fixture.menu));
  const outcome = selectGrokMode(
    fixture.input as never,
    fixture.runtime as never,
    'Build',
    vi.fn<(message: string) => void>(),
  );
  await vi.runAllTimersAsync();
  await expect(outcome).resolves.toBe('Build');
  expect(fixture.trigger.click).toHaveBeenCalledTimes(1);
});
