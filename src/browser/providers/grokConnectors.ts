import { GROK_CONNECTOR_NAME_READER } from "./grokConnectorLabels.js";
import { readGrokNativeConnectorDetail } from "./grokNativeConnectorDetail.js";
import { createHash, randomUUID } from "node:crypto";
import { withCdpCommandTimeout } from "../../../packages/browser-service/src/guardedCdp.js";
import { delay } from "../utils.js";
import {
	type GrokNativeConnectorRow,
	observeGrokNativeConnectorRows,
} from "./grokNativeConnectorBinding.js";

/** Discovery only: none of these operations installs, invokes or authenticates. */
export type GrokConnectorStatus = "complete" | "incomplete" | "account-gated" | "failed";
export interface GrokConnectorCoverage {
	scope: "visible" | "detail";
	complete: boolean;
	reason: string;
}
export interface GrokConnectorSummary {
	/** Observed provider ID only; never synthesize an entity ID from a name. */
	id: string | null;
	name: string;
	kind: "installed" | "catalog";
}
export interface GrokConnectorInventory {
	/** Set only after same-transport provider account verification by the service. */
	providerAccountRef: string | null;
	status: GrokConnectorStatus;
	installed: GrokConnectorSummary[];
	catalog: GrokConnectorSummary[];
	coverage: GrokConnectorCoverage;
	code: string;
}
export interface GrokConnectorSelector {
	id?: string;
	name?: string;
	endpoint?: string;
	kind?: "installed" | "catalog";
}
export interface GrokConnectorDetail {
	providerAccountRef: string | null;
	status: GrokConnectorStatus;
	connector: GrokConnectorSummary | null;
	/** SHA-256 of exact endpoint, including query/fragment; useful without exposing secrets. */
	endpointRef: string | null;
	/** Only credential-free, query-free, fragment-free conventional MCP endpoints. */
	endpoint: string | null;
	auth: "connected" | "reauthentication-required" | "account-gated" | "unknown";
	accountRef: string | null;
	tools: string[];
	coverage: GrokConnectorCoverage;
	code: string;
}
export interface GrokConnectorRuntime {
	evaluate(input: { expression: string; returnByValue: boolean; awaitPromise?: boolean }): Promise<{
		result: { value?: unknown };
		exceptionDetails?: unknown;
	}>;
}
interface ObservedRow {
	handle: string;
	name: string;
	kind: "installed" | "catalog";
	providerId: string | null;
	account?: string | null;
}
interface InventoryProbe {
	state: "visible" | "missing" | "account-gated" | "failed";
	rows: ObservedRow[];
	truncated: boolean;
}
interface DetailProbe {
	state: "visible" | "missing" | "account-gated" | "failed";
	name: string;
	endpoint: string | null;
	tools: string[];
	hasMore: boolean;
	toolsObserved: boolean;
	auth: GrokConnectorDetail["auth"];
	account: string | null;
}
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

// Survey-backed semantic anchors: Plugins, Connectors tab, Add/Added,
// Reauthenticate/Disconnect, See more and Server URL. No invented provider IDs.
// Row handles exist only for one read and are revalidated before activation.
const DOM_HELPERS = `
 const connectorName = ${GROK_CONNECTOR_NAME_READER};
 const visible = el => {
   for (let node = el; node; node = node.parentElement) {
     if (node.getAttribute('role') === 'dialog' && node.getAttribute('data-closed') !== null) return false;
   }
   return el && el.getAttribute('aria-hidden') !== 'true' &&
     getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden' &&
     el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
 };
 const text = el => String(el?.innerText || el?.textContent || '').trim();
 const buttons = root => Array.from(root.querySelectorAll('button,[role="button"]')).filter(visible);
 const dialogs = () => Array.from(document.querySelectorAll('[role="dialog"]')).filter(visible);
 const plugins = () => { const roots = dialogs().filter(d => Array.from(d.querySelectorAll('[role="tab"]')).some(t => text(t) === 'Connectors')); return roots.length === 1 ? roots[0] : null; };
 const gated = root => text(root).split(/\\n+/).some(line => /^(sign in required|log in required|requires supergrok|upgrade to continue)$/i.test(line.trim()));
 const failed = root => /couldn.t load|failed to load|something went wrong/i.test(text(root));
`;
function expression(body: string) {
	return `(() => { ${DOM_HELPERS}\n${body}\n})()`;
}
const OPEN = expression(`
 const existing = plugins();
 if (existing) {
   if (dialogs().some(d => d !== existing)) return false;
   const tab = Array.from(existing.querySelectorAll('[role="tab"]')).find(t => visible(t) && text(t) === 'Connectors');
   if (tab?.getAttribute('aria-selected') !== 'true') tab?.click();
   return true;
 }
 if (dialogs().length) return false;
 const matches = buttons(document).filter(b => b.getAttribute('aria-label') === 'Plugins' || text(b) === 'Plugins');
 if (matches.length !== 1) return false;
 matches[0].click(); return true;
`);
const INVENTORY = expression(`
 const root = plugins();
 if (!root) return {state: 'missing', rows: [], truncated: false};
 const selectedTab = Array.from(root.querySelectorAll('[role="tab"]')).find(t => visible(t) && text(t) === 'Connectors');
 if (selectedTab?.getAttribute('aria-selected') !== 'true') return {state: 'missing', rows: [], truncated: false};
 if (failed(root)) return {state: 'failed', rows: [], truncated: false};
 if (gated(root)) return {state: 'account-gated', rows: [], truncated: false};
 const rows = [];
 for (const button of buttons(root)) {
   if (button.getAttribute('role') === 'tab' || button.getAttribute('aria-label') === 'New Connector') continue;
   const lines = text(button).split(/\\n+/).map(s => s.trim()).filter(Boolean);
   const name=connectorName(button);
   if (!name || lines.length < 2 || /^(Add|Added|New|Connectors|Skills|Bots)$/.test(name)) continue;
   let container = button.parentElement;
   let kind = null;
   for (let depth = 0; container && container !== root && depth < 4; depth++, container = container.parentElement) {
     const linesInRow = text(container).split(/\\n+/).map(s => s.trim());
     const primary = buttons(container).filter(b => text(b).split(/\\n+/).filter(Boolean).length >= 2);
     if (primary.length !== 1) break;
     if (linesInRow.includes('Added')) {kind = 'installed'; break;}
     if (buttons(container).some(b => b.getAttribute('aria-label') === 'Add ' + name || text(b) === 'Add')) {kind = 'catalog'; break;}
   }
   if (!kind) continue;
   const handle = 'row-' + rows.length;
   button.setAttribute('data-auracall-connector-read', handle);
   rows.push({handle, name, kind, providerId: null, account: kind === 'installed' && /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(lines[lines.indexOf(name)+1] || '') ? lines[lines.indexOf(name)+1] : null});
 }
 return {state: 'visible', rows: rows.slice(0, 100), truncated: rows.length > 100};
`);
const DETAIL = expression(`
 const root = dialogs().filter(d => d !== plugins()).at(-1);
 if (!root) return {state: 'missing'};
 if (failed(root)) return {state: 'failed'};
 if (gated(root)) return {state: 'account-gated'};
 const lines = text(root).split(/\\n+/).map(s => s.trim()).filter(Boolean);
 const endpointIndex = lines.indexOf('Server URL');
 const endpoint = endpointIndex >= 0 ? lines[endpointIndex + 1] || null : null;
 const toolsStart = lines.indexOf('All tools enabled');
 const toolsEnd = lines.indexOf('See more', toolsStart + 1);
 const toolLines = toolsStart >= 0 ? lines.slice(toolsStart + 1, toolsEnd >= 0 ? toolsEnd : endpointIndex >= 0 ? endpointIndex : toolsStart + 1) : [];
 const tools = toolLines.filter(t => /^[a-zA-Z0-9_.:-]{1,200}$/.test(t));
 return {state: 'visible', name: lines[0] || '', endpoint, tools, toolsObserved: toolsStart >= 0,
   hasMore: buttons(root).some(b => text(b) === 'See more'),
   auth: lines.some(t => /^(authentication required|reauthentication required|sign in required)$/i.test(t)) ? 'reauthentication-required' :
     buttons(root).some(b => text(b) === 'Disconnect') ? 'connected' : 'unknown',
   account: null};
`);

export function createGrokConnectorClient(
	runtime: GrokConnectorRuntime,
	options: {
		abortSignal?: AbortSignal;
		maxToolExpansions?: number;
		providerUserId?: string;
		pressEscape?: () => Promise<void>;
	} = {},
) {
	async function evaluate<T>(source: string): Promise<T> {
		options.abortSignal?.throwIfAborted();
		const result = await runtime.evaluate({
			expression: source,
			returnByValue: true,
			awaitPromise: true,
		});
		options.abortSignal?.throwIfAborted();
		if (result.exceptionDetails || result.result.value === undefined)
			throw new Error("grok_connector_dom_failed");
		return result.result.value as T;
	}
	async function cleanupEvaluate<T>(source: string): Promise<T> {
		return withCdpCommandTimeout(
			runtime,
			{
				timeoutMs: 2_000,
				timeoutMessage: "grok_connector_cleanup_timeout",
				abortSignal: AbortSignal.timeout(2_000),
			},
			async () => {
				const result = await runtime.evaluate({
					expression: source,
					returnByValue: true,
					awaitPromise: true,
				});
				if (result.exceptionDetails || result.result.value === undefined)
					throw new Error("grok_connector_cleanup_failed");
				return result.result.value as T;
			},
		);
	}
	function setSearch(value: string) {
		return expression(`
      const root = plugins();
      const matches = Array.from(root?.querySelectorAll('input[placeholder="Search..."]') || []).filter(visible);
      if (matches.length !== 1) return false;
      const input = matches[0];
      const value = ${JSON.stringify(value)};
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      if (setter) setter.call(input, value); else input.value = value;
      input.dispatchEvent(new Event('input', {bubbles: true}));
      input.dispatchEvent(new Event('change', {bubbles: true}));
      return input.value === value;
    `);
	}
	async function observeRaw(query?: string) {
		if (!(await evaluate<boolean>(OPEN)))
			return { state: "missing", rows: [], truncated: false } satisfies InventoryProbe;
		if (query == null) {
			let probe = await evaluate<InventoryProbe>(INVENTORY);
			const deadline = Date.now() + 1_500;
			while (probe.state === "missing" && Date.now() < deadline) {
				await delay(25);
				probe = await evaluate<InventoryProbe>(INVENTORY);
			}
			return await bindNativeRows(probe);
		}
		const searchValue = expression(`
      const root = plugins();
      const matches = Array.from(root?.querySelectorAll('input[placeholder="Search..."]') || []).filter(visible);
      return matches.length === 1 ? matches[0].value : null;
    `);
		let previous = await evaluate<string | null>(searchValue);
		const searchDeadline = Date.now() + 1_500;
		while (previous === null && Date.now() < searchDeadline) {
			await delay(25);
			previous = await evaluate<string | null>(searchValue);
		}
		if (previous === null) throw new Error("grok_connector_search_not_observed");
		let restored = false;
		let result: InventoryProbe;
		let primaryFailure: unknown;
		try {
			if (!(await evaluate<boolean>(setSearch(query))))
				throw new Error("grok_connector_search_not_verified");
			result = await bindNativeRows(await evaluate<InventoryProbe>(INVENTORY));
		} catch (error) {
			primaryFailure = error;
			throw error;
		} finally {
			try {
				restored = await cleanupEvaluate<boolean>(setSearch(previous));
				if (!restored)
					// biome-ignore lint/correctness/noUnsafeFinally: Collected and combined with the work error below.
					throw new Error("grok_connector_search_restore_failed");
			} catch (cleanupFailure) {
				// biome-ignore lint/correctness/noUnsafeFinally: Preserve both work and owned restoration failures.
				throw primaryFailure
					? new AggregateError(
							[primaryFailure, cleanupFailure],
							"grok_connector_work_and_cleanup_failed",
						)
					: cleanupFailure;
			}
		}
		if (!restored) throw new Error("grok_connector_search_restore_failed");
		return result;
	}
	const nativeRows = new Map<string, GrokNativeConnectorRow>();
	async function observe(query?: string) {
		nativeRows.clear();
		return observeRaw(query);
	}
	async function bindNativeRows(probe: InventoryProbe) {
		if (probe.state === "visible" && options.providerUserId) {
			options.abortSignal?.throwIfAborted();
			const native = await observeGrokNativeConnectorRows(runtime, {
				providerUserId: options.providerUserId,
				rows: probe.rows,
			});
			options.abortSignal?.throwIfAborted();
			for (const binding of native) {
				const row = probe.rows.find(
					(row) => row.handle === binding.handle && row.kind === "installed",
				);
				if (row) {
					row.providerId = binding.id;
					nativeRows.set(binding.id, binding);
				}
			}
		}
		return probe;
	}

	function summary(row: ObservedRow): GrokConnectorSummary {
		return { id: row.providerId || null, name: row.name, kind: row.kind };
	}
	function detailFailure(
		code: string,
		status: GrokConnectorStatus = "failed",
	): GrokConnectorDetail {
		return {
			providerAccountRef: null,
			status,
			connector: null,
			endpointRef: null,
			endpoint: null,
			auth: status === "account-gated" ? "account-gated" : "unknown",
			accountRef: null,
			tools: [],
			coverage: { scope: "detail", complete: false, reason: code },
			code,
		};
	}
	async function readRow(row: ObservedRow): Promise<GrokConnectorDetail> {
		const activationId = randomUUID();
		let result: GrokConnectorDetail;
		let closed = false;
		let primaryFailure: unknown;
		let activationAttempted = false;
		try {
			activationAttempted = true;
			const clicked = await evaluate<boolean>(
				expression(`
          if (dialogs().some(d => d !== plugins())) return false;
          const root = plugins();
          const matches = Array.from(root?.querySelectorAll('[data-auracall-connector-read]') || []).filter(b =>
            visible(b) && b.getAttribute('data-auracall-connector-read') === ${JSON.stringify(row.handle)} &&
            connectorName(b) === ${JSON.stringify(row.name)});
          if (matches.length !== 1) return false;
          const button = matches[0];
          const lines = text(button).split(/\\n+/).map(s => s.trim()).filter(Boolean);
          const name=connectorName(button);if(name!==${JSON.stringify(row.name)})return false;
          let container = button.parentElement;
          let kind = null;
          for (let depth = 0; container && container !== root && depth < 4; depth++, container = container.parentElement) {
            const primary = buttons(container).filter(b => text(b).split(/\\n+/).filter(Boolean).length >= 2);
            if (primary.length !== 1) break;
            if (text(container).split(/\\n+/).map(s => s.trim()).includes('Added')) {kind = 'installed'; break;}
            if (buttons(container).some(b => b.getAttribute('aria-label') === 'Add ' + name || text(b) === 'Add')) {kind = 'catalog'; break;}
          }
          const account = kind === 'installed' && /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(lines[lines.indexOf(name)+1] || '') ? lines[lines.indexOf(name)+1] : null;
          if (kind !== ${JSON.stringify(row.kind)} || account !== ${JSON.stringify(row.account ?? null)}) return false;
          button.setAttribute('data-auracall-connector-activation', ${JSON.stringify(activationId)});
          button.click(); return true;
        `),
			);
			if (!clicked) return detailFailure("grok_connector_row_changed");
			let detail = await evaluate<DetailProbe>(DETAIL);
			const mountDeadline = Date.now() + 1_500;
			while (detail.state === "missing" && Date.now() < mountDeadline) {
				await delay(25);
				detail = await evaluate<DetailProbe>(DETAIL);
			}

			const maximum = Math.min(10, Math.max(0, options.maxToolExpansions ?? 3));
			for (
				let attempt = 0;
				detail.state === "visible" && detail.hasMore && attempt < maximum;
				attempt++
			) {
				const expanded = await evaluate<boolean>(
					expression(`
              const root = dialogs().filter(d => d !== plugins()).at(-1);
              if (!root || text(root).split(/\\n+/)[0].trim() !== ${JSON.stringify(row.name)}) return false;
              const matches = buttons(root).filter(b => text(b) === 'See more');
              if (matches.length !== 1) return false;
              matches[0].click(); return true;
            `),
				);
				if (!expanded) break;
				const next = await evaluate<DetailProbe>(DETAIL);
				const unchanged =
					next.state === detail.state &&
					next.hasMore === detail.hasMore &&
					JSON.stringify(next.tools) === JSON.stringify(detail.tools);
				detail = next;
				if (unchanged) break;
			}
			if (detail.state !== "visible")
				result = detailFailure(
					`grok_connector_detail_${detail.state}`,
					detail.state === "account-gated" ? "account-gated" : "failed",
				);
			else if (
				detail.name !== row.name ||
				(detail.account && row.account && detail.account !== row.account)
			)
				result = detailFailure("grok_connector_detail_identity_changed");
			else {
				let endpoint: string | null = null;
				let endpointValid = false;
				if (detail.endpoint) {
					try {
						const url = new URL(detail.endpoint);
						endpointValid = ["https:", "http:"].includes(url.protocol) && Boolean(url.hostname);
						if (
							url.protocol === "https:" &&
							!url.username &&
							!url.password &&
							!url.search &&
							!url.hash &&
							/^\/(mcp|sse)\/?$/.test(url.pathname)
						)
							endpoint = url.href;
					} catch {
						/* A non-URL cannot establish endpoint identity. */
					}
				}
				const account = detail.account || null;
				const complete =
					!detail.hasMore &&
					detail.toolsObserved &&
					endpointValid &&
					detail.tools.length <= 1000 &&
					Boolean(account) &&
					detail.auth === "connected";
				result = {
					providerAccountRef: null,
					status: complete ? "complete" : "incomplete",
					connector: summary(row),
					endpointRef: endpointValid && detail.endpoint ? digest(detail.endpoint) : null,
					endpoint,
					auth: detail.auth,
					accountRef: account ? digest(account) : null,
					tools: [...new Set(detail.tools)].slice(0, 1000),
					coverage: {
						scope: "detail",
						complete:
							!detail.hasMore && detail.toolsObserved === true && detail.tools.length <= 1000,
						reason:
							detail.tools.length > 1000
								? "tool-limit"
								: !detail.toolsObserved
									? "tools-not-observed"
									: detail.hasMore
										? "tools-not-expanded"
										: "visible-tools-observed",
					},
					code:
						detail.tools.length > 1000
							? "grok_connector_tool_limit"
							: !detail.toolsObserved
								? "grok_connector_tools_not_observed"
								: detail.hasMore
									? "grok_connector_tools_incomplete"
									: !endpointValid
										? "grok_connector_endpoint_not_observed"
										: !account
											? "grok_connector_account_not_observed"
											: detail.auth !== "connected"
												? "grok_connector_auth_not_observed"
												: "grok_connector_detail_observed",
				};
			}
		} catch (error) {
			primaryFailure = error;
			throw error;
		} finally {
			try {
				// Close only the detail opened by this call. Never activate lifecycle controls.
				const dismissal = !activationAttempted
					? true
					: await cleanupEvaluate<boolean | "native-escape">(
							expression(`
            const root = dialogs().filter(d => d !== plugins()).at(-1);
            if (!root) return true;
            // Native nested dialogs make their parent aria-hidden/inert. Only read
            // the exact activation marker there; never interact with the inert parent.
            const catalogs = Array.from(document.querySelectorAll('[role="dialog"]')).filter(d => Array.from(d.querySelectorAll('[role="tab"]')).some(t => text(t) === 'Connectors'));
            const owners = catalogs.flatMap(d => Array.from(d.querySelectorAll('[data-auracall-connector-activation]'))).filter(node => node.getAttribute('data-auracall-connector-activation') === ${JSON.stringify(activationId)});
            if (owners.length !== 1) return false;
            if (text(root).split(/\\n+/)[0].trim() !== ${JSON.stringify(row.name)}) return false;
            const matches = buttons(root).filter(b => /^(close|back)$/i.test(b.getAttribute('aria-label') || text(b)));
            if (matches.length === 1) { matches[0].click(); return true; }
            if (matches.length !== 0 || root.getAttribute('data-analytics-name') !== 'connector-detail-dialog') return false;
            // Native detail has no Close control. Dismiss only this proven-owned
            // dialog, then verify it disappeared rather than assuming Escape worked.
            if (${Boolean(options.pressEscape)}) { root.focus?.({preventScroll:true}); return 'native-escape'; }
            root.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', code:'Escape', keyCode:27, bubbles:true, cancelable:true}));
            return new Promise(resolve => setTimeout(() => resolve(!dialogs().includes(root)), 100));
          `),
						);
				if (dismissal === "native-escape") {
					if (!options.pressEscape)
						// biome-ignore lint/correctness/noUnsafeFinally: Combined with the work error by the cleanup catch below.
						throw new Error("grok_connector_native_escape_required");
					await options.pressEscape();
					const deadline = Date.now() + 1_000;
					do {
						closed = await cleanupEvaluate<boolean>(
							expression(`return Boolean(plugins()) && dialogs().every(d => d === plugins());`),
						);
						if (!closed) await delay(25);
					} while (!closed && Date.now() < deadline);
				} else closed = dismissal;
				if (!closed)
					// biome-ignore lint/correctness/noUnsafeFinally: Collected and combined with the work error below.
					throw new Error("grok_connector_detail_cleanup_incomplete");
			} catch (cleanupFailure) {
				// biome-ignore lint/correctness/noUnsafeFinally: Preserve both work and owned restoration failures.
				throw primaryFailure
					? new AggregateError(
							[primaryFailure, cleanupFailure],
							"grok_connector_work_and_cleanup_failed",
						)
					: cleanupFailure;
			}
		}
		if (!closed) return detailFailure("grok_connector_detail_cleanup_incomplete", "incomplete");
		return result;
	}
	return {
		nativeInstallationIdentity: (id: string | null) => (id ? nativeRows.get(id) : undefined),
		async inspect(selector: GrokConnectorSelector): Promise<GrokConnectorDetail> {
			if (!selector.id && !selector.name && !selector.endpoint)
				return detailFailure("grok_connector_selector_required");
			try {
				if (
					selector.id &&
					/^connector_[0-9a-f-]{36}$/i.test(selector.id) &&
					options.providerUserId &&
					selector.kind !== "catalog"
				)
					return await readGrokNativeConnectorDetail(
						runtime,
						selector,
						options.providerUserId,
						options.abortSignal,
					);
				const probe = await observe();
				if (probe.state !== "visible")
					return detailFailure(
						`grok_connector_${probe.state}`,
						probe.state === "account-gated" ? "account-gated" : "failed",
					);
				if (probe.truncated)
					return detailFailure("grok_connector_selection_coverage_incomplete", "incomplete");
				const rows = probe.rows.filter(
					(row) =>
						(!selector.kind || row.kind === selector.kind) &&
						(!selector.id || row.providerId === selector.id) &&
						(!selector.name || row.name === selector.name),
				);
				if (!selector.endpoint) {
					if (rows.length !== 1)
						return detailFailure(
							rows.length ? "grok_connector_ambiguous" : "grok_connector_not_found",
						);
					return await readRow(rows[0]);
				}
				const matches: GrokConnectorDetail[] = [];
				for (const row of rows.slice(0, 10)) {
					const detail = await readRow(row);
					if (detail.status === "failed" || detail.status === "account-gated" || !detail.connector)
						return detail;
					if (detail.endpointRef === digest(selector.endpoint)) matches.push(detail);
				}
				if (matches.length > 1) return detailFailure("grok_connector_ambiguous");
				if (rows.length > 10 || probe.truncated)
					return detailFailure("grok_connector_endpoint_coverage_incomplete", "incomplete");
				return matches[0] ?? detailFailure("grok_connector_endpoint_not_observed", "incomplete");
			} catch (error) {
				if (error instanceof AggregateError) throw error;
				options.abortSignal?.throwIfAborted();
				return detailFailure("grok_connector_observation_failed");
			}
		},
		async list(query?: string): Promise<GrokConnectorInventory> {
			try {
				const probe = await observe(query);
				const rows = probe.rows.filter(
					(row) => !query || row.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
				);
				return {
					providerAccountRef: null,
					status:
						probe.state === "account-gated"
							? "account-gated"
							: probe.state === "visible"
								? "incomplete"
								: "failed",
					installed: rows.filter((row) => row.kind === "installed").map(summary),
					catalog: rows.filter((row) => row.kind === "catalog").map(summary),
					coverage: {
						scope: "visible",
						complete: false,
						reason: probe.truncated ? "row-limit" : "visible-rows-only",
					},
					code:
						probe.state === "visible"
							? "grok_connector_visible_inventory"
							: `grok_connector_${probe.state}`,
				};
			} catch (error) {
				if (error instanceof AggregateError) throw error;
				options.abortSignal?.throwIfAborted();
				return {
					providerAccountRef: null,
					status: "failed",
					installed: [],
					catalog: [],
					coverage: { scope: "visible", complete: false, reason: "observation-failed" },
					code: "grok_connector_observation_failed",
				};
			}
		},
	};
}
