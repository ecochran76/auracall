// biome-ignore-all lint/style/useNamingConvention: CDP and DOM wire names.
import { randomUUID } from "node:crypto";
import path from "node:path";
import { BrowserAutomationError } from "../../oracle/errors.js";
import { delay } from "../utils.js";

export interface GrokComposerFile {
	id: string;
	name: string;
	state: "ready" | "progress" | "error" | "unknown";
}
export interface GrokFilesResult {
	status: "complete" | "incomplete" | "failed" | "unconfirmed";
	code: string;
	providerAccountRef: string | null;
	provenance: {
		targetId: string | null;
		projectId: string | null;
		conversationId: string | null;
		composerId: string | null;
	};
	files: GrokComposerFile[];
	coverage: { scope: "composer" | "visible-recent"; complete: boolean };
	limits: { accept: string | null; multiple: boolean | null; observedMessage: string | null };
}
export interface GrokFileRuntime {
	evaluate(input: {
		expression: string;
		returnByValue?: boolean;
	}): Promise<{ result?: { value?: unknown }; exceptionDetails?: unknown }>;
}
export interface GrokFileDom {
	getDocument(): Promise<{ root: { nodeId: number } }>;
	querySelector(input: { nodeId: number; selector: string }): Promise<{ nodeId: number }>;
	setFileInputFiles(input: { nodeId: number; files: string[] }): Promise<unknown>;
}

// Root is derived from the sole visible editable composer. A random marker binds
// all later observations and the exact native file input to this same DOM node.
const helpers = `
const visible = el => el instanceof HTMLElement && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0 && window.getComputedStyle(el).display !== 'none' && window.getComputedStyle(el).visibility !== 'hidden';
const identity = el => {
 const raw = el.getAttribute('data-file-id') || el.getAttribute('data-attachment-id');
 if (raw) return raw;
 const href = el.getAttribute('href');
 if (!href) return null;
 const match = href.match(/(?:^|\\/)files\\/([^/?#]+)/);
 return match ? match[1] : null;
};
const fileNodes = root => Array.from(root.querySelectorAll('[data-file-id], [data-attachment-id], a[href]')).filter(el => visible(el) && identity(el));
const file = el => {
 const state = (el.getAttribute('data-state') || el.getAttribute('data-status') || '').toLowerCase();
 const text = el.innerText || el.textContent || '';
 const error = /error|failed|rejected/.test(state) || el.getAttribute('aria-invalid') === 'true' || el.querySelector('[role="alert"]');
 const progress = /uploading|processing|pending|loading/.test(state) || el.getAttribute('aria-busy') === 'true' || el.querySelector('[role="progressbar"]');
 const ready = /^(ready|complete|completed|success|uploaded)$/.test(state) || el.getAttribute('aria-busy') === 'false';
 return { id: identity(el), name: el.getAttribute('data-filename') || el.getAttribute('aria-label') || text.trim(), state: error ? 'error' : progress ? 'progress' : ready ? 'ready' : 'unknown' };
};`;

export function grokFilesFailure(code = "grok_files_failed"): GrokFilesResult {
	return {
		status: "failed",
		code,
		providerAccountRef: null,
		provenance: { targetId: null, projectId: null, conversationId: null, composerId: null },
		files: [],
		coverage: { scope: "composer", complete: false },
		limits: { accept: null, multiple: null, observedMessage: null },
	};
}

export function createGrokFileClient(
	runtime: GrokFileRuntime,
	options: { abortSignal?: AbortSignal; timeoutMs?: number; pollMs?: number } = {},
) {
	let composerId: string | null = null;
	async function evaluate<T>(body: string): Promise<T> {
		options.abortSignal?.throwIfAborted();
		const result = await runtime.evaluate({
			expression: `(() => { ${helpers}\n${body}\n})()`,
			returnByValue: true,
		});
		if (result.exceptionDetails) throw new Error("grok_files_dom_failed");
		return result.result?.value as T;
	}
	async function bind() {
		if (composerId) return;
		const marker = randomUUID();
		const bound = await evaluate<boolean>(`
      const candidates = Array.from(document.querySelectorAll('textarea, [contenteditable="true"]')).filter(el => visible(el) && !el.closest('[role="dialog"], [aria-modal="true"]'));
      if (candidates.length !== 1) return false;
      const editor = candidates[0];
      const root = editor.closest('form, [data-testid="composer"], [data-composer]');
      if (!root) return false;
      root.setAttribute('data-auracall-files-composer', ${JSON.stringify(marker)});
      return true;`);
		if (!bound) throw new Error("grok_files_composer_not_verified");
		composerId = marker;
	}
	const rootExpression = () =>
		`document.querySelector('[data-auracall-files-composer="${composerId}"]')`;
	async function context(): Promise<GrokFilesResult> {
		await bind();
		const result = await evaluate<GrokFilesResult | null>(`
      const root = ${rootExpression()};
      if (!root || !visible(root)) return null;
      const inputs = Array.from(root.querySelectorAll('input[type="file"]'));
      const nodes = fileNodes(root); const files = nodes.map(file);
      const ids = files.map(f => f.id);
      const duplicate = ids.some((id, index) => ids.indexOf(id) !== index);
      const alert = Array.from(root.querySelectorAll('[role="alert"], [data-limit-message]')).filter(visible).map(el => el.innerText || '').join(' ').trim();
      const path = location.href;
      return { status: duplicate || files.some(f => f.state !== 'ready') || alert ? 'incomplete' : 'complete', code: duplicate ? 'grok_file_identity_ambiguous' : alert ? 'grok_file_composer_limit_or_error' : 'grok_file_context', providerAccountRef: null,
        provenance: { targetId: null, projectId: root.getAttribute('data-project-id') || path.match(/\\/project(?:s)?\\/([^/?#]+)/)?.[1] || null, conversationId: path.match(/\\/c\\/([^/?#]+)/)?.[1] || null, composerId: ${JSON.stringify(composerId)} }, files,
        coverage: { scope: 'composer', complete: !duplicate }, limits: { accept: inputs.length === 1 ? inputs[0].getAttribute('accept') : null, multiple: inputs.length === 1 ? inputs[0].hasAttribute('multiple') : null, observedMessage: alert || null } };`);
		if (!result) throw new Error("grok_files_composer_lost");
		return result;
	}
	async function waitReady(ids: string[], expected: GrokFilesResult): Promise<GrokFilesResult> {
		const deadline = Date.now() + (options.timeoutMs ?? 10_000);
		for (let attempt = 0; attempt < 1000; attempt++) {
			const result = await context();
			if (JSON.stringify(result.provenance) !== JSON.stringify(expected.provenance))
				return { ...result, status: "unconfirmed", code: "grok_file_context_changed" };
			if (result.limits.observedMessage || result.code === "grok_file_identity_ambiguous")
				return { ...result, status: "failed" };
			const selected = ids.map((id) => result.files.filter((f) => f.id === id));
			if (selected.some((matches) => matches.some((f) => f.state === "error")))
				return { ...result, status: "failed", code: "grok_file_upload_error" };
			if (selected.every((matches) => matches.length === 1 && matches[0].state === "ready"))
				return { ...result, status: "complete", code: "grok_files_ready" };
			if (Date.now() >= deadline)
				return { ...result, status: "unconfirmed", code: "grok_file_readiness_unconfirmed" };
			await delay(options.pollMs ?? 100);
		}
		throw new Error("grok_files_observation_budget_exhausted");
	}
	async function upload(dom: GrokFileDom, paths: string[]): Promise<GrokFilesResult> {
		if (!paths.length) throw new Error("grok_files_paths_required");
		const baseline = await context();
		if (baseline.status !== "complete")
			return { ...baseline, status: "failed", code: "grok_file_composer_not_ready" };
		const token = randomUUID();
		const marked = await evaluate<boolean>(
			`const root = ${rootExpression()}; const inputs = root ? Array.from(root.querySelectorAll('input[type="file"]')) : []; if (inputs.length !== 1 || inputs[0].disabled || (${paths.length} > 1 && !inputs[0].hasAttribute('multiple'))) return false; inputs[0].setAttribute('data-auracall-upload', ${JSON.stringify(token)}); return true;`,
		);
		if (!marked)
			return { ...baseline, status: "failed", code: "grok_file_input_not_verified_or_limit" };
		const doc = await dom.getDocument();
		const input = await dom.querySelector({
			nodeId: doc.root.nodeId,
			selector: `[data-auracall-upload="${token}"]`,
		});
		if (!input.nodeId) throw new Error("grok_file_input_lost");
		try {
			await dom.setFileInputFiles({ nodeId: input.nodeId, files: paths });
			return await observeUpload();
		} catch (error) {
			throw new BrowserAutomationError(
				"Grok file upload outcome unknown; reconcile composer before retrying.",
				{ stage: "grok-file-upload", effectState: "unknown" },
				error,
			);
		}
		async function observeUpload(): Promise<GrokFilesResult> {
			const nativeFiles = await evaluate<{ name: string; size: number }[]>(
				`const input = document.querySelector('[data-auracall-upload="${token}"]'); return input ? Array.from(input.files || []).map(f => ({ name: f.name, size: f.size })) : [];`,
			);
			if (
				nativeFiles.length !== paths.length ||
				nativeFiles.some((file, index) => file.name !== path.basename(paths[index]))
			)
				return {
					...baseline,
					status: "unconfirmed",
					code: "grok_file_native_selection_unconfirmed",
				};
			const deadline = Date.now() + (options.timeoutMs ?? 10_000);
			for (let attempt = 0; attempt < 1000; attempt++) {
				const current = await context();
				if (JSON.stringify(current.provenance) !== JSON.stringify(baseline.provenance))
					return { ...current, status: "unconfirmed", code: "grok_file_context_changed" };
				if (current.limits.observedMessage)
					return { ...current, status: "failed", code: "grok_file_composer_limit_or_error" };
				const added = current.files.filter((f) => !baseline.files.some((old) => old.id === f.id));
				if (added.length > paths.length || current.code === "grok_file_identity_ambiguous")
					return { ...current, status: "unconfirmed", code: "grok_file_identity_ambiguous" };
				if (added.length === paths.length)
					return waitReady(
						added.map((f) => f.id),
						baseline,
					);
				if (Date.now() >= deadline)
					return { ...current, status: "unconfirmed", code: "grok_file_identity_unconfirmed" };
				await delay(options.pollMs ?? 100);
			}
			throw new Error("grok_files_observation_budget_exhausted");
		}
	}
	async function recent(): Promise<GrokFilesResult> {
		await bind();
		// Open only the selected composer's Attach control, then the authoritative
		// visible menu's Recent files entry. Never fall back to document-wide text.
		const opened = await evaluate<boolean>(
			`const root = ${rootExpression()}; const controls = root ? Array.from(root.querySelectorAll('button')).filter(el => visible(el) && /^(attach|attach files)$/i.test(el.getAttribute('aria-label') || el.innerText || '')) : []; if (controls.length !== 1 || controls[0].disabled) return false; controls[0].click(); return true;`,
		);
		if (!opened) throw new Error("grok_recent_attach_not_verified");
		const deadline = Date.now() + (options.timeoutMs ?? 10_000);
		let chooserOpened = false;
		for (let attempt = 0; attempt < 1000; attempt++) {
			const result = await evaluate<GrokComposerFile[] | null>(`
        const menus = Array.from(document.querySelectorAll('[role="menu"]')).filter(visible);
        if (!${chooserOpened}) {
          const entries = menus.flatMap(menu => Array.from(menu.querySelectorAll('[role="menuitem"], button'))).filter(el => visible(el) && /^Recent files$/i.test((el.innerText || '').trim()));
          if (entries.length !== 1) return null;
          entries[0].click(); return [];
        }
        const choices = menus.filter(menu => fileNodes(menu).length > 0 || menu.getAttribute('aria-label') === 'Recent files');
        if (choices.length !== 1) return null;
        choices[0].setAttribute('data-auracall-recent-composer', ${JSON.stringify(composerId)});
        return fileNodes(choices[0]).map(file);`);
			if (result && chooserOpened) {
				const base = await context();
				const ids = result.map((f) => f.id);
				return {
					...base,
					files: result,
					status: ids.some((id, i) => ids.indexOf(id) !== i) ? "incomplete" : "complete",
					code: "grok_recent_visible",
					coverage: { scope: "visible-recent", complete: false },
				};
			}
			if (result) chooserOpened = true;
			if (Date.now() >= deadline) throw new Error("grok_recent_chooser_not_verified");
			await delay(options.pollMs ?? 100);
		}
		throw new Error("grok_files_observation_budget_exhausted");
	}
	async function select(id: string): Promise<GrokFilesResult> {
		const inventory = await recent();
		if (!id.trim() || inventory.files.filter((f) => f.id === id).length !== 1)
			return { ...inventory, status: "failed", code: "grok_recent_identity_not_unique" };
		try {
			const clicked = await evaluate<boolean>(
				`const menus = Array.from(document.querySelectorAll('[data-auracall-recent-composer="${composerId}"]')).filter(visible); if (menus.length !== 1) return false; const choices = fileNodes(menus[0]).filter(el => identity(el) === ${JSON.stringify(id)}); if (choices.length !== 1 || choices[0].getAttribute('aria-disabled') === 'true') return false; choices[0].click(); return true;`,
			);
			if (!clicked)
				return { ...inventory, status: "failed", code: "grok_recent_selection_not_verified" };
			return await waitReady([id], inventory);
		} catch (error) {
			throw new BrowserAutomationError(
				"Grok recent-file selection outcome unknown; reconcile composer before retrying.",
				{ stage: "grok-file-select", effectState: "unknown" },
				error,
			);
		}
	}
	return { context, upload, recent, select };
}
