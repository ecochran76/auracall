import { describe, expect, test, vi } from 'vitest';
import {
  buildComposerChipVisibleExpressionForTest,
  ensureChatgptComposerTool,
  isNonPersistentComposerToolForTest,
  prepareChatgptWorkbenchLocalAttachment,
  resolveChatgptWorkbenchAttachmentSurfaceForTest,
  resolveComposerToolCandidatesForTest,
  resolveComposerToolLocationForTest,
  resolveCurrentComposerToolSelectionForTest,
} from '../../src/browser/actions/chatgptComposerTool.js';

describe('chatgpt composer tool selection', () => {
  test('recognizes durable non-plugin inline tool pills in the current composer', () => {
    const expression = buildComposerChipVisibleExpressionForTest(['shopping']);
    expect(expression).toContain("root.querySelectorAll('[data-inline-selection-pill]')");
    expect(expression).not.toContain('#prompt-textarea [data-inline-selection-pill]');
    expect(expression).not.toContain('data-system-hint-type^="plugin:"');
  });

  test('normalizes aliases to the current visible tool labels', () => {
    expect(resolveComposerToolCandidatesForTest('chatgpt.commerce.shopping')).toEqual([
      'chatgpt commerce shopping',
      'shopping',
    ]);
    expect(resolveComposerToolCandidatesForTest('chatgpt.search.web_search')).toEqual([
      'chatgpt search web search',
      'web search',
    ]);
    expect(resolveComposerToolCandidatesForTest('web-search')).toEqual(['web search']);
    expect(resolveComposerToolCandidatesForTest('search')).toEqual(['search', 'web search']);
    expect(resolveComposerToolCandidatesForTest('research')).toEqual(['research', 'deep research']);
    expect(resolveComposerToolCandidatesForTest('image')).toEqual(['image', 'create image']);
    expect(resolveComposerToolCandidatesForTest('knowledge')).toEqual(['knowledge', 'company knowledge']);
    expect(resolveComposerToolCandidatesForTest('study')).toEqual(['study', 'study and learn']);
    expect(resolveComposerToolCandidatesForTest('agent')).toEqual(['agent', 'agent mode']);
    expect(resolveComposerToolCandidatesForTest('quickbooks')).toEqual(['quickbooks', 'intuit quickbooks']);
    expect(resolveComposerToolCandidatesForTest('quiz')).toEqual(['quiz', 'quizzes']);
    expect(resolveComposerToolCandidatesForTest('gh')).toEqual(['gh', 'github']);
    expect(resolveComposerToolCandidatesForTest('google-drive')).toEqual(['google drive']);
  });

  test('keeps manifest-owned known labels available for current-selection detection', () => {
    expect(
      resolveCurrentComposerToolSelectionForTest(null, [], [{ label: 'canvas', selected: true }]),
    ).toEqual({ label: 'canvas', source: 'more-menu' });
  });

  test('classifies Deep Research as a non-persistent staged tool', () => {
    expect(isNonPersistentComposerToolForTest('deep-research')).toBe(true);
    expect(isNonPersistentComposerToolForTest('research')).toBe(true);
    expect(isNonPersistentComposerToolForTest('web-search')).toBe(false);
    expect(isNonPersistentComposerToolForTest('canvas')).toBe(false);
  });

  test('classifies tools as top-level or More submenu choices', () => {
    expect(
      resolveComposerToolLocationForTest('chatgpt.commerce.shopping', [
        'create image',
        'shopping',
        'web search',
      ]),
    ).toEqual({ location: 'top', label: 'shopping' });
    expect(
      resolveComposerToolLocationForTest('web-search', ['company knowledge', 'create image', 'deep research', 'web search', 'more']),
    ).toEqual({ location: 'top', label: 'web search' });
    expect(
      resolveComposerToolLocationForTest(
        'canvas',
        ['company knowledge', 'create image', 'deep research', 'web search', 'more'],
        ['study and learn', 'agent mode', 'canvas', 'github'],
      ),
    ).toEqual({ location: 'more', label: 'canvas' });
    expect(resolveComposerToolLocationForTest('calendar', ['company knowledge', 'create image', 'more'], ['github'])).toEqual({
      location: 'missing',
    });
  });

  test('does not treat current workbench file-source rows as composer tools', () => {
    const currentRows = [
      'add photos & files',
      'add from library',
      'create image',
      'web search',
    ];
    expect(resolveComposerToolLocationForTest('photos', currentRows)).toEqual({ location: 'missing' });
    expect(resolveComposerToolLocationForTest('library', currentRows)).toEqual({ location: 'missing' });
    expect(resolveComposerToolLocationForTest('image', currentRows)).toEqual({
      location: 'top',
      label: 'create image',
    });
  });

  test('routes local files and the provider library drawer away from composer-tool selection', async () => {
    const client = {} as Parameters<typeof ensureChatgptComposerTool>[0];
    const logger = () => undefined;
    await expect(ensureChatgptComposerTool(client, 'files', logger)).rejects.toThrow(/Use --file/);
    await expect(ensureChatgptComposerTool(client, 'library', logger)).rejects.toThrow(/separate interactive provider drawer/);
  });

  test('recognizes the current workbench attachment rows and unrestricted local upload input', () => {
    expect(
      resolveChatgptWorkbenchAttachmentSurfaceForTest({
        rows: [
          { label: 'Add photos & files', description: 'Upload from computer' },
          { label: 'Add from library', description: 'Browse and search your files' },
          { label: 'Web search', description: 'Find real-time news and info' },
        ],
        inputs: [
          { id: 'upload-files', accept: null, multiple: true },
          { id: 'upload-photos', accept: 'image/*', multiple: true },
        ],
      }),
    ).toEqual({
      status: 'ready',
      inputSelector: '#upload-files',
      localFileLabel: 'Add photos & files',
      libraryLabel: 'Add from library',
    });
  });

  test('reads the current open workbench surface before returning the exact local input', async () => {
    const evaluate = vi.fn().mockImplementation(async ({ expression }: { expression?: string }) => {
      const source = String(expression ?? '');
      if (source.includes('data-auracall-chatgpt-composer-menu')) {
        return {
          result: {
            value: {
              selector: '[data-auracall-chatgpt-composer-menu="true"]',
              sourceSelector: '.popover',
              signature: 'current-workbench',
              rect: { x: 0, y: 0, width: 400, height: 600 },
              distanceToAnchor: null,
              items: [],
              itemLabels: [],
            },
          },
        };
      }
      if (source.includes('const rows = root')) {
        return {
          result: {
            value: {
              rows: [
                { label: 'Add photos & files', description: 'Upload from computer' },
                { label: 'Add from library', description: 'Browse and search your files' },
              ],
              inputs: [{ id: 'upload-files', accept: null, multiple: true }],
            },
          },
        };
      }
      return { result: { value: true } };
    });
    const surface = await prepareChatgptWorkbenchLocalAttachment({
      runtime: { evaluate } as unknown as Parameters<
        typeof prepareChatgptWorkbenchLocalAttachment
      >[0]['runtime'],
      input: {} as Parameters<typeof prepareChatgptWorkbenchLocalAttachment>[0]['input'],
      page: {} as Parameters<typeof prepareChatgptWorkbenchLocalAttachment>[0]['page'],
    });
    expect(surface).toMatchObject({ status: 'ready', inputSelector: '#upload-files' });
    expect(evaluate).toHaveBeenCalledWith(expect.objectContaining({ returnByValue: true }));
    expect(
      evaluate.mock.calls.some(([input]) =>
        String(input.expression ?? '').includes('.__menu-item, [data-fill][tabindex]'),
      ),
    ).toBe(true);
    expect(
      evaluate.mock.calls.some(([input]) =>
        String(input.expression ?? '').includes('textarea[name="prompt-textarea"]'),
      ),
    ).toBe(true);
  });

  test('brings a retained tab forward before measuring the workbench attachment trigger', async () => {
    const events: string[] = [];
    let popoverReads = 0;
    const evaluate = vi.fn().mockImplementation(async ({ expression }: { expression?: string }) => {
      const source = String(expression ?? '');
      if (source.includes('data-auracall-chatgpt-composer-menu')) {
        popoverReads += 1;
        return {
          result: {
            value:
              popoverReads === 1
                ? null
                : {
                    selector: '[data-auracall-chatgpt-composer-menu="true"]',
                    sourceSelector: '.popover',
                    signature: 'current-workbench',
                    rect: { x: 0, y: 0, width: 400, height: 600 },
                    distanceToAnchor: null,
                    items: [],
                    itemLabels: [],
                  },
          },
        };
      }
      if (source.includes('const node = document.querySelector')) {
        events.push('measure');
        return { result: { value: { x: 24, y: 24 } } };
      }
      if (source.includes('.some((node)')) {
        return { result: { value: true } };
      }
      if (source.includes('const rows = root')) {
        return {
          result: {
            value: {
              rows: [
                { label: 'Add photos & files', description: 'Upload from computer' },
                { label: 'Add from library', description: 'Browse and search your files' },
              ],
              inputs: [{ id: 'upload-files', accept: null, multiple: true }],
            },
          },
        };
      }
      return { result: { value: false } };
    });
    const input = {
      dispatchKeyEvent: vi.fn().mockResolvedValue(undefined),
      dispatchMouseEvent: vi.fn().mockResolvedValue(undefined),
    };
    const page = {
      bringToFront: vi.fn().mockImplementation(async () => {
        events.push('front');
      }),
    };

    const surface = await prepareChatgptWorkbenchLocalAttachment({
      runtime: { evaluate } as unknown as Parameters<
        typeof prepareChatgptWorkbenchLocalAttachment
      >[0]['runtime'],
      input: input as unknown as Parameters<typeof prepareChatgptWorkbenchLocalAttachment>[0]['input'],
      page: page as unknown as Parameters<typeof prepareChatgptWorkbenchLocalAttachment>[0]['page'],
    });

    expect(surface).toMatchObject({ status: 'ready', inputSelector: '#upload-files' });
    expect(events).toEqual(['front', 'measure']);
    expect(input.dispatchMouseEvent).toHaveBeenCalledTimes(3);
  });

  test('accepts the exact local upload surface when the unrelated provider-library row is absent', () => {
    expect(
      resolveChatgptWorkbenchAttachmentSurfaceForTest({
        rows: [{ label: 'Add photos & files', description: 'Upload from computer' }],
        inputs: [{ id: 'upload-files', accept: null, multiple: true }],
      }),
    ).toEqual({
      status: 'ready',
      inputSelector: '#upload-files',
      localFileLabel: 'Add photos & files',
      libraryLabel: null,
    });
  });

  test('accepts one unrestricted upload input bound to the active composer when the popover row label drifts', () => {
    expect(
      resolveChatgptWorkbenchAttachmentSurfaceForTest({
        rows: [{ label: 'Upload file', description: '' }],
        inputs: [{
          id: 'upload-files',
          accept: null,
          multiple: true,
          composerLocal: true,
          composerTriggerLabel: 'Add files and more',
        }],
      }),
    ).toEqual({
      status: 'ready',
      inputSelector: '#upload-files',
      localFileLabel: 'Add files and more',
      libraryLabel: null,
    });
  });

  test('fails closed when the exact local upload input contract drifts', () => {
    expect(
      resolveChatgptWorkbenchAttachmentSurfaceForTest({
        rows: [
          { label: 'Add photos & files', description: 'Upload from computer' },
          { label: 'Add from library', description: 'Browse and search your files' },
        ],
        inputs: [{ id: 'upload-files', accept: 'image/*', multiple: true }],
      }),
    ).toEqual({ status: 'file-input-restricted' });
  });

  test('prefers visible composer chip when reading current tool state', () => {
    expect(
      resolveCurrentComposerToolSelectionForTest('Canvas', [{ label: 'web search', selected: true }], []),
    ).toEqual({ label: 'Canvas', source: 'chip' });
  });

  test('accepts a dynamically installed app from its explicit composer pill', () => {
    expect(
      resolveCurrentComposerToolSelectionForTest('Custom CRM', [], []),
    ).toEqual({ label: 'Custom CRM', source: 'chip' });
  });

  test('reads current tool state from selected top-level or More menu rows when chip is absent', () => {
    expect(
      resolveCurrentComposerToolSelectionForTest(null, [
        { label: 'company knowledge', selected: true },
        { label: 'web search', selected: true },
      ], []),
    ).toEqual({ label: 'web search', source: 'top-menu' });

    expect(
      resolveCurrentComposerToolSelectionForTest(null, [{ label: 'more', selected: false }], [
        { label: 'google drive', selected: false },
        { label: 'canvas', selected: true },
      ]),
    ).toEqual({ label: 'canvas', source: 'more-menu' });
  });
});
