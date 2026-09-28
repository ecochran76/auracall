import {
	type LibraryFileAttachmentReceipt,
	type LibraryFileIdentity,
	type LibraryFileInventory,
	type LibraryFileSelector,
	normalizeLibraryFileSelectors,
	resolveLibraryFileSelectors,
} from "../libraryFiles.js";
import { dismissOpenMenus, openMenu, pressButton, waitForPredicate } from "../service/ui.js";
import type { BrowserLogger, ChromeClient } from "../types.js";

const COMPOSER_TRIGGER_SELECTOR =
	'button[aria-label="Add files and more"], button[data-testid="composer-plus-btn"], button[data-testid*="composer" i][aria-haspopup]';
const PICKER_ROOT_SELECTOR =
	'[role="dialog"], [data-testid*="library" i], [data-testid*="file-picker" i], [data-state="open"][class*="drawer" i]';
const PICKER_ROW_TAG = "data-auracall-library-file-id";

interface ChatgptLibraryPickerRow {
	id: string;
	name: string;
	mimeType?: string | null;
	sizeBytes?: number | null;
}

interface ChatgptLibraryPickerProbe {
	rows: ChatgptLibraryPickerRow[];
	complete: boolean;
	incompleteReason?: string | null;
}

export async function attachChatgptLibraryFiles(
	client: Pick<ChromeClient, "Runtime" | "Input">,
	selectors: readonly LibraryFileSelector[],
	logger: BrowserLogger,
): Promise<LibraryFileAttachmentReceipt> {
	const requested = normalizeLibraryFileSelectors(selectors);
	if (requested.length === 0) {
		return { requested: [], attached: [], inventoryObservedAt: new Date().toISOString() };
	}

	const { Runtime } = client;
	await dismissOpenMenus(Runtime).catch(() => false);
	const menu = await openMenu(Runtime, {
		trigger: {
			selector: COMPOSER_TRIGGER_SELECTOR,
			requireVisible: true,
			interactionStrategies: ["pointer", "click"],
		},
		menuSelector: '[role="menu"], .composer-home-top-menu, .popover',
		anchorSelector: COMPOSER_TRIGGER_SELECTOR,
		expectedItemMatch: { exact: ["add from library"] },
		timeoutMs: 5_000,
	});
	if (!menu.ok || !menu.menuSelector) {
		throw new Error("Unable to open the ChatGPT composer file menu for Library selection.");
	}
	const opened = await pressButton(Runtime, {
		rootSelectors: [menu.menuSelector],
		match: { exact: ["add from library"] },
		requireVisible: true,
		interactionStrategies: ["pointer", "click"],
		timeoutMs: 5_000,
	});
	if (!opened.ok) {
		throw new Error("ChatGPT composer does not expose an exact Add from library action.");
	}

	try {
		const pickerReady = await waitForPredicate(
			Runtime,
			`(() => {
        const roots = Array.from(document.querySelectorAll(${JSON.stringify(PICKER_ROOT_SELECTOR)}));
        return roots.some((root) => {
          const rect = root.getBoundingClientRect();
          const text = String(root.textContent || '').toLowerCase();
          return rect.width > 0 && rect.height > 0 && (text.includes('library') || text.includes('your files'));
        });
      })()`,
			{ timeoutMs: 7_500, description: "ChatGPT Library picker" },
		);
		if (!pickerReady) {
			throw new Error("ChatGPT Library picker did not open in the bound conversation tab.");
		}

		const observedAt = new Date().toISOString();
		const probe = await readChatgptLibraryPickerInventory(client);
		const inventory: LibraryFileInventory = {
			provider: "chatgpt",
			complete: probe.complete,
			observedAt,
			files: probe.rows.map((row) => ({
				id: row.id,
				name: row.name,
				provider: "chatgpt",
				...(row.mimeType ? { mimeType: row.mimeType } : {}),
				...(typeof row.sizeBytes === "number" ? { sizeBytes: row.sizeBytes } : {}),
			})),
			...(probe.incompleteReason ? { incompleteReason: probe.incompleteReason } : {}),
		};
		const resolved = resolveLibraryFileSelectors(inventory, requested);
		for (const file of resolved) {
			await selectExactChatgptLibraryPickerRow(client, file.id);
		}

		const confirmed = await pressButton(Runtime, {
			rootSelectors: [PICKER_ROOT_SELECTOR],
			match: { exact: ["add", "attach", "add files"] },
			requireVisible: true,
			interactionStrategies: ["pointer", "click"],
			timeoutMs: 5_000,
		});
		if (!confirmed.ok) {
			throw new Error("ChatGPT Library picker selection could not be confirmed.");
		}
		const closed = await waitForPredicate(
			Runtime,
			`(() => {
        const roots = Array.from(document.querySelectorAll(${JSON.stringify(PICKER_ROOT_SELECTOR)}));
        return roots.every((root) => {
          const rect = root.getBoundingClientRect();
          return !(rect.width > 0 && rect.height > 0);
        });
      })()`,
			{ timeoutMs: 7_500, description: "ChatGPT Library picker closed" },
		);
		if (!closed) {
			throw new Error("ChatGPT Library picker remained open after attachment confirmation.");
		}

		const observed = await readChatgptComposerDocumentReferences(client);
		assertChatgptLibraryFilesAttached(resolved, observed);
		logger(`Attached ${resolved.length} ChatGPT Library file${resolved.length === 1 ? "" : "s"}.`);
		return { requested, attached: resolved, inventoryObservedAt: observedAt };
	} catch (error) {
		await closeChatgptLibraryPicker(Runtime).catch(() => undefined);
		throw error;
	}
}

export async function readChatgptLibraryPickerInventory(
	client: Pick<ChromeClient, "Runtime">,
): Promise<ChatgptLibraryPickerProbe> {
	const { result } = await client.Runtime.evaluate({
		expression: `(async () => {
      const rootSelector = ${JSON.stringify(PICKER_ROOT_SELECTOR)};
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
      const isVisible = (node) => {
        if (!(node instanceof Element)) return false;
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      };
      const roots = Array.from(document.querySelectorAll(rootSelector)).filter(isVisible);
      const root = roots.find((node) => /library|your files/i.test(node.textContent || '')) || null;
      if (!root) return { rows: [], complete: false, incompleteReason: 'picker root not found' };
      const idFrom = (node) => {
        const values = [
          node.getAttribute?.('data-file-id'),
          node.getAttribute?.('data-library-file-id'),
          node.getAttribute?.('data-testid'),
          node.getAttribute?.('aria-label'),
          node.getAttribute?.('href'),
          node.id,
        ].filter(Boolean).join(' ');
        return values.match(/\\bfile_[A-Za-z0-9_]+\\b/)?.[0]
          || values.match(/\\blibfile_[A-Za-z0-9_]+\\b/)?.[0]
          || values.match(/\\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\b/i)?.[0]
          || '';
      };
      const readRows = () => {
        const candidates = Array.from(root.querySelectorAll([
          '[data-file-id]',
          '[data-library-file-id]',
          '[data-testid*="file_" i]',
          '[data-testid*="libfile_" i]',
          '[aria-label^="Select " i]',
          '[role="row"]',
          '[role="option"]',
          '[role="listitem"]',
        ].join(',')));
        const rows = [];
        const unusable = [];
        const seen = new Set();
        for (const candidate of candidates) {
          const row = candidate.closest?.('[role="row"], [role="option"], [role="listitem"], li, article, [data-testid*="row" i], [data-testid*="card" i]') || candidate;
          if (!isVisible(row)) continue;
          const selection = row.querySelector?.('input[type="checkbox"], [role="checkbox"], [aria-label^="Select " i]') || candidate;
          const id = idFrom(selection) || idFrom(row) || idFrom(row.querySelector?.('[data-file-id], [data-library-file-id], [data-testid], [href]'));
          const aria = normalize(selection?.getAttribute?.('aria-label') || '');
          const heading = normalize(row.querySelector?.('[data-testid*="title" i], [role="heading"], h1, h2, h3')?.textContent || '');
          const name = normalize(aria.replace(/^select\\s+/i, '')) || heading || normalize(row.textContent || '').split(/\\b(?:PDF|Document|Spreadsheet|Image|Select)\\b/i)[0].trim();
          if (!name || /^(add|attach|cancel|close|library|your files)$/i.test(name)) continue;
          if (!id) {
            unusable.push(name);
            continue;
          }
          const key = id + '|' + name;
          if (seen.has(key)) continue;
          seen.add(key);
          rows.push({ id, name });
        }
        return { rows, unusable };
      };
      const scrollers = Array.from(root.querySelectorAll('*'))
        .filter((node) => node instanceof HTMLElement && node.scrollHeight > node.clientHeight + 4)
        .sort((left, right) => right.scrollHeight - left.scrollHeight);
      const scroller = scrollers[0] || root;
      let stablePasses = 0;
      let previousCount = -1;
      let snapshot = readRows();
      for (let attempt = 0; attempt < 30; attempt += 1) {
        snapshot = readRows();
        stablePasses = snapshot.rows.length === previousCount ? stablePasses + 1 : 0;
        previousCount = snapshot.rows.length;
        const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4;
        const loading = Array.from(root.querySelectorAll('[aria-busy="true"], [role="progressbar"], [data-testid*="loading" i]')).some(isVisible);
        if (atBottom && !loading && stablePasses >= 2) {
          return snapshot.unusable.length > 0
            ? { rows: snapshot.rows, complete: false, incompleteReason: 'one or more picker rows lack a stable provider ID' }
            : { rows: snapshot.rows, complete: true };
        }
        scroller.scrollTop = Math.min(scroller.scrollHeight, scroller.scrollTop + Math.max(scroller.clientHeight, 240));
        scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
        await sleep(100);
      }
      return { rows: snapshot.rows, complete: false, incompleteReason: 'picker inventory did not reach a stable end' };
    })()`,
		awaitPromise: true,
		returnByValue: true,
	});
	const value = result?.value as ChatgptLibraryPickerProbe | null | undefined;
	return {
		rows: Array.isArray(value?.rows)
			? value.rows.filter(
					(row): row is ChatgptLibraryPickerRow =>
						typeof row?.id === "string" &&
						row.id.length > 0 &&
						typeof row?.name === "string" &&
						row.name.length > 0,
				)
			: [],
		complete: value?.complete === true,
		...(typeof value?.incompleteReason === "string"
			? { incompleteReason: value.incompleteReason }
			: {}),
	};
}

export function assertChatgptLibraryFilesAttached(
	expected: readonly LibraryFileIdentity[],
	observed: readonly LibraryFileIdentity[],
): void {
	for (const file of expected) {
		const idMatches = observed.filter((candidate) => candidate.id === file.id);
		if (idMatches.length === 1) continue;
		throw new Error(
			`ChatGPT Library attachment was not uniquely verified before Send: ${file.id} (${file.name}).`,
		);
	}
}

export async function verifyChatgptLibraryFileAttachments(
	client: Pick<ChromeClient, "Runtime">,
	expected: readonly LibraryFileIdentity[],
): Promise<void> {
	assertChatgptLibraryFilesAttached(expected, await readChatgptComposerDocumentReferences(client));
}

async function selectExactChatgptLibraryPickerRow(
	client: Pick<ChromeClient, "Runtime" | "Input">,
	fileId: string,
): Promise<void> {
	const tagged = await client.Runtime.evaluate({
		expression: `(() => {
      const id = ${JSON.stringify(fileId)};
      const attr = ${JSON.stringify(PICKER_ROW_TAG)};
      document.querySelectorAll('[' + attr + ']').forEach((node) => node.removeAttribute(attr));
      const roots = Array.from(document.querySelectorAll(${JSON.stringify(PICKER_ROOT_SELECTOR)}));
      const candidates = roots.flatMap((root) => Array.from(root.querySelectorAll('[data-file-id], [data-library-file-id], [data-testid], [aria-label], [href]')));
      const stableIds = (node) => {
        const values = [
          node.getAttribute?.('data-file-id'),
          node.getAttribute?.('data-library-file-id'),
          node.getAttribute?.('data-testid'),
          node.getAttribute?.('aria-label'),
          node.getAttribute?.('href'),
        ].filter(Boolean).join(' ');
        return [
          ...values.matchAll(/\\bfile_[A-Za-z0-9_]+\\b/g),
          ...values.matchAll(/\\blibfile_[A-Za-z0-9_]+\\b/g),
          ...values.matchAll(/\\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\b/gi),
        ].map((match) => match[0]);
      };
      const matches = candidates.filter((node) => stableIds(node).includes(id));
      const rows = Array.from(new Set(matches.map((node) => node.closest?.('[role="row"], [role="option"], [role="listitem"], li, article, [data-testid*="row" i], [data-testid*="card" i]') || node)));
      if (rows.length !== 1) return { ok: false, count: rows.length };
      const control = rows[0].querySelector?.('input[type="checkbox"], [role="checkbox"], button, [aria-label^="Select " i]') || rows[0];
      const selected = control instanceof HTMLInputElement
        ? control.checked
        : control.getAttribute?.('aria-checked') === 'true' || control.getAttribute?.('aria-selected') === 'true';
      control.setAttribute(attr, id);
      return { ok: true, selected };
    })()`,
		returnByValue: true,
	});
	const state = tagged.result?.value as
		| { ok?: boolean; count?: number; selected?: boolean }
		| undefined;
	if (!state?.ok) {
		throw new Error(
			`ChatGPT Library file ID "${fileId}" did not map to exactly one picker row (observed ${state?.count ?? 0}).`,
		);
	}
	if (!state.selected) {
		const pressed = await pressButton(client.Runtime, {
			selector: `[${PICKER_ROW_TAG}=${JSON.stringify(fileId)}]`,
			requireVisible: true,
			interactionStrategies: ["pointer", "click"],
			timeoutMs: 5_000,
		});
		if (!pressed.ok) {
			throw new Error(`ChatGPT Library file ID "${fileId}" could not be selected.`);
		}
	}
}

async function readChatgptComposerDocumentReferences(
	client: Pick<ChromeClient, "Runtime">,
): Promise<LibraryFileIdentity[]> {
	const { result } = await client.Runtime.evaluate({
		expression: `(() => {
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
      const root = document.querySelector('form[data-type="unified-composer"], [data-testid*="composer" i], form');
      if (!root) return [];
      const nodes = Array.from(root.querySelectorAll([
        '[data-file-id]',
        '[data-library-file-id]',
        '[data-testid*="attachment" i]',
        '[data-testid*="file-pill" i]',
        '[aria-label*="remove" i][aria-label*="file" i]',
      ].join(',')));
      const rows = [];
      const seen = new Set();
      for (const node of nodes) {
        const container = node.closest?.('[data-testid*="attachment" i], [data-testid*="file" i], li, article, button') || node;
        const values = [
          node.getAttribute?.('data-file-id'),
          node.getAttribute?.('data-library-file-id'),
          node.getAttribute?.('data-testid'),
          node.getAttribute?.('aria-label'),
          container.getAttribute?.('data-file-id'),
          container.getAttribute?.('data-library-file-id'),
          container.getAttribute?.('data-testid'),
        ].filter(Boolean).join(' ');
        const id = values.match(/\\bfile_[A-Za-z0-9_]+\\b/)?.[0]
          || values.match(/\\blibfile_[A-Za-z0-9_]+\\b/)?.[0]
          || values.match(/\\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\b/i)?.[0]
          || '';
        const name = normalize(container.querySelector?.('[data-testid*="name" i], [title]')?.getAttribute?.('title') || container.textContent || '')
          .replace(/^remove\\s+/i, '')
          .replace(/\\s+remove$/i, '')
          .trim();
        if (!name) continue;
        const key = id + '|' + name;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({ id, name, provider: 'chatgpt' });
      }
      return rows;
    })()`,
		returnByValue: true,
	});
	const value = result?.value;
	if (!Array.isArray(value)) return [];
	return value.filter(
		(entry): entry is LibraryFileIdentity =>
			entry &&
			typeof entry === "object" &&
			typeof entry.id === "string" &&
			typeof entry.name === "string" &&
			entry.provider === "chatgpt",
	);
}

async function closeChatgptLibraryPicker(Runtime: ChromeClient["Runtime"]): Promise<void> {
	await pressButton(Runtime, {
		rootSelectors: [PICKER_ROOT_SELECTOR],
		match: { exact: ["cancel", "close"] },
		requireVisible: true,
		interactionStrategies: ["pointer", "click"],
		timeoutMs: 1_000,
	}).catch(() => undefined);
	await dismissOpenMenus(Runtime, 1_000).catch(() => false);
}
