import path from 'node:path';
import type { ChromeClient, BrowserAttachment, BrowserLogger } from '../types.js';
import { waitForAttachmentVisible } from './attachments.js';
import { delay } from '../utils.js';
import { logDomFailure } from '../domDebug.js';
import { transferAttachmentViaDataTransfer } from './attachmentDataTransfer.js';
import { prepareChatgptWorkbenchLocalAttachment } from './chatgptComposerTool.js';

/**
 * Upload file to remote Chrome by transferring content via CDP
 * Used when browser is on a different machine than CLI
 */
export async function uploadAttachmentViaDataTransfer(
  deps: {
    runtime: ChromeClient['Runtime'];
    dom?: ChromeClient['DOM'];
    input: ChromeClient['Input'];
    page: ChromeClient['Page'];
  },
  attachment: BrowserAttachment,
  logger: BrowserLogger,
): Promise<void> {
  const { runtime, dom, input, page } = deps;
  if (!dom) {
    throw new Error('DOM domain unavailable while uploading attachments.');
  }

  logger(`Transferring ${path.basename(attachment.path)} to remote browser...`);

  const workbenchSurface = await prepareChatgptWorkbenchLocalAttachment({ runtime, input, page });
  if (workbenchSurface.status !== 'ready') {
    await logDomFailure(runtime, logger, `chatgpt-workbench-remote-attachment-${workbenchSurface.status}`);
    throw new Error(
      `ChatGPT workbench attachment surface is not ready (${workbenchSurface.status}). Expected the Add photos & files row plus one unrestricted #upload-files input.`,
    );
  }

  // Find file input element
  const documentNode = await dom.getDocument();
  const fileInputSelector = workbenchSurface.inputSelector;
  const fileInput = await dom.querySelector({ nodeId: documentNode.root.nodeId, selector: fileInputSelector });

  if (!fileInput.nodeId) {
    await logDomFailure(runtime, logger, 'file-input');
    throw new Error('Unable to locate ChatGPT file attachment input.');
  }

  const transferResult = await transferAttachmentViaDataTransfer(runtime, attachment, fileInputSelector);

  logger(`File transferred: ${transferResult.fileName} (${transferResult.size} bytes)`);

  // Give ChatGPT a moment to process the file
  await delay(500);
  await waitForAttachmentVisible(runtime, transferResult.fileName, 10_000, logger);

  logger('Attachment queued');
}
