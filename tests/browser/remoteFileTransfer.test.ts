import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { BrowserLogger, ChromeClient } from '../../src/browser/types.js';

const prepareChatgptWorkbenchLocalAttachment = vi.fn();
const transferAttachmentViaDataTransfer = vi.fn();
const waitForAttachmentVisible = vi.fn();

vi.mock('../../src/browser/actions/chatgptComposerTool.js', () => ({
  prepareChatgptWorkbenchLocalAttachment,
}));
vi.mock('../../src/browser/actions/attachmentDataTransfer.js', () => ({
  transferAttachmentViaDataTransfer,
}));
vi.mock('../../src/browser/actions/attachments.js', () => ({
  waitForAttachmentVisible,
}));

const { uploadAttachmentViaDataTransfer } = await import(
  '../../src/browser/actions/remoteFileTransfer.js'
);

describe('uploadAttachmentViaDataTransfer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prepareChatgptWorkbenchLocalAttachment.mockResolvedValue({
      status: 'ready',
      inputSelector: '#upload-files',
      localFileLabel: 'Add photos & files',
      libraryLabel: 'Add from library',
    });
    transferAttachmentViaDataTransfer.mockResolvedValue({ fileName: 'fixture.txt', size: 7 });
    waitForAttachmentVisible.mockResolvedValue(undefined);
  });

  test('uses only the exact current unrestricted upload input after surface verification', async () => {
    const dom = {
      getDocument: vi.fn().mockResolvedValue({ root: { nodeId: 1 } }),
      querySelector: vi.fn().mockResolvedValue({ nodeId: 2 }),
    } as unknown as ChromeClient['DOM'];
    const runtime = {} as ChromeClient['Runtime'];
    const input = {} as ChromeClient['Input'];
    const page = {} as ChromeClient['Page'];

    await uploadAttachmentViaDataTransfer(
      { runtime, dom, input, page },
      { path: '/tmp/fixture.txt', displayPath: 'fixture.txt' },
      vi.fn() as BrowserLogger,
    );

    expect(prepareChatgptWorkbenchLocalAttachment).toHaveBeenCalledWith({ runtime, input, page });
    expect(dom.querySelector).toHaveBeenCalledTimes(1);
    expect(dom.querySelector).toHaveBeenCalledWith({ nodeId: 1, selector: '#upload-files' });
    expect(transferAttachmentViaDataTransfer).toHaveBeenCalledWith(
      runtime,
      expect.objectContaining({ path: '/tmp/fixture.txt' }),
      '#upload-files',
    );
  });

  test('fails before transfer when the current workbench attachment contract drifts', async () => {
    prepareChatgptWorkbenchLocalAttachment.mockResolvedValue({ status: 'local-file-action-not-found' });
    const runtime = { evaluate: vi.fn() } as unknown as ChromeClient['Runtime'];
    const dom = {} as ChromeClient['DOM'];

    await expect(
      uploadAttachmentViaDataTransfer(
        {
          runtime,
          dom,
          input: {} as ChromeClient['Input'],
          page: {} as ChromeClient['Page'],
        },
        { path: '/tmp/fixture.txt', displayPath: 'fixture.txt' },
        vi.fn() as BrowserLogger,
      ),
    ).rejects.toThrow(/local-file-action-not-found/);
    expect(transferAttachmentViaDataTransfer).not.toHaveBeenCalled();
  });
});
