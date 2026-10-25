import { createHash } from "node:crypto";
import { setTimeout as pause } from "node:timers/promises";
import type { ProviderTrafficGovernor } from "../../../packages/browser-service/src/service/providerTrafficGovernor.js";
import { cssClassContains } from "../service/selectors.js";
import type { Conversation } from "./domain.js";

/** Stable provider row evidence, excluding observation/transport metadata. */
export function grokHistoryFingerprint(
	row: Pick<Conversation, "id" | "title" | "projectId" | "updatedAt">,
): string {
	return createHash("sha256")
		.update(
			JSON.stringify([
				row.id,
				row.title,
				row.projectId ?? null,
				row.updatedAt && Number.isFinite(Date.parse(row.updatedAt))
					? new Date(row.updatedAt).toISOString()
					: (row.updatedAt ?? null),
			]),
		)
		.digest("hex");
}

export interface GrokHistoryOptions {
	historyKnownRows?: readonly { id: string; fingerprint: string }[];
	historyStartAtHead?: boolean;
	/** Internal custody bound by the owned history transport. */
	historyAccountScope?: string;
	historySessionId?: string;
	historyRetainDialog?: boolean;
	historyFreshDialog?: boolean;
	historyLimit?: number;
	historySince?: string;
	historyCursor?: string | null;
	historySearch?: string;
	historyMaxPages?: number;
	historyTimeoutMs?: number;
	historyShouldYield?: () => boolean | Promise<boolean>;
	abortSignal?: AbortSignal;
}
export interface GrokHistoryRow {
	id: string;
	title: string;
	url?: string;
	timestamp?: number | null;
	projectId?: string;
	botId?: string;
}
export interface GrokHistoryPage {
	items: GrokHistoryRow[];
	canScroll?: boolean;
	atBottom?: boolean;
	loading?: boolean;
	emptyEvidence?: boolean;
	error?: string;
}
export interface GrokHistoryCoverage {
	state: "complete" | "empty" | "incomplete" | "failed";
	source: "visible-chats";
	scope: "root" | "project";
	reason: string;
	loadedCount: number;
	pages: number;
	nextCursor: string | null;
	observedAt: string;
}
export interface GrokHistoryInventory {
	items: Conversation[];
	coverage: GrokHistoryCoverage;
}

function bound(value: number | undefined, fallback: number, maximum: number, name: string): number {
	const resolved = value ?? fallback;
	if (!Number.isSafeInteger(resolved) || resolved < 1 || resolved > maximum)
		throw new Error(`Grok history ${name} must be between 1 and ${maximum}.`);
	return resolved;
}
/** Enumerates a bounded view. Reaching its bottom is not account-wide backfill proof. */
export async function collectGrokHistoryInventory(input: {
	readPage: (signal: AbortSignal) => Promise<GrokHistoryPage>;
	projectId?: string;
	options?: GrokHistoryOptions;
	governor?: ProviderTrafficGovernor;
	probeContext?: unknown;
	onProgress?: (coverage: GrokHistoryCoverage) => Promise<void> | void;
}): Promise<GrokHistoryInventory> {
	const options = input.options ?? {};
	const limit = bound(options.historyLimit, 2000, 10000, "limit");
	const maximumPages = bound(options.historyMaxPages, 40, 200, "page bound");
	const timeoutMs = bound(options.historyTimeoutMs, 20000, 60000, "timeout");
	const query = options.historySearch?.trim() ?? "";
	const scope = createHash("sha256")
		.update(
			JSON.stringify([
				input.projectId ?? null,
				query.toLowerCase(),
				options.historySince ?? null,
				...(options.historyAccountScope ? [options.historyAccountScope] : []),
			]),
		)
		.digest("hex");
	let anchor: string | null = null;
	if (options.historyCursor) {
		try {
			if (options.historyCursor.length > 4096) throw new Error("long cursor");
			const cursor = JSON.parse(Buffer.from(options.historyCursor, "base64url").toString("utf8"));
			if (
				cursor.v !== (options.historyAccountScope ? 2 : 1) ||
				cursor.scope !== scope ||
				typeof cursor.after !== "string" ||
				cursor.after.length > 200
			)
				throw new Error("scope mismatch");
			anchor = cursor.after;
		} catch {
			throw new Error("Grok history cursor scope or format does not match this query.");
		}
	}
	const cutoff = options.historySince ? Date.parse(options.historySince) : null;
	if (cutoff !== null && !Number.isFinite(cutoff))
		throw new Error("Grok history since must be a valid date.");
	const excludedPrefix = new Set<string>();
	let anchorFound = anchor === null,
		pages = 0,
		stableBottom = 0,
		unknownScope = false,
		unknownTime = false;
	let reason = "page-limit";
	const entries = new Map<string, Conversation>();
	const deadline = performance.now() + timeoutMs;
	const deadlineController = new AbortController();
	const deadlineError = new Error("Grok history deadline exceeded.");
	const timer = setTimeout(() => deadlineController.abort(deadlineError), timeoutMs);
	timer.unref?.();
	const signal = options.abortSignal
		? AbortSignal.any([options.abortSignal, deadlineController.signal])
		: deadlineController.signal;
	async function bounded<T>(effect: () => Promise<T>): Promise<T> {
		signal.throwIfAborted();
		let onAbort: () => void = () => undefined;
		const aborted = new Promise<never>((_, reject) => {
			onAbort = () => reject(signal.reason);
			signal.addEventListener("abort", onAbort, { once: true });
		});
		try {
			return await Promise.race([
				Promise.resolve().then(() => {
					signal.throwIfAborted();
					return effect();
				}),
				aborted,
			]);
		} finally {
			signal.removeEventListener("abort", onAbort);
		}
	}
	const runtime = input.probeContext as
		| { evaluate?: (input: unknown) => Promise<unknown> }
		| undefined;
	const evaluate = runtime?.evaluate?.bind(runtime);
	const probeContext = evaluate
		? { evaluate: (value: unknown) => bounded(() => evaluate(value)) }
		: input.probeContext;
	let state: GrokHistoryCoverage["state"] = "incomplete";
	let frontierReached = false;
	const knownRows = new Map(options.historyKnownRows?.map((row) => [row.id, row.fingerprint]));
	let restartRequired = false;
	const coverage = (): GrokHistoryCoverage => ({
		state,
		source: "visible-chats",
		scope: input.projectId ? "project" : "root",
		reason,
		loadedCount: entries.size,
		pages,
		nextCursor:
			state === "incomplete" && !restartRequired && !frontierReached
				? entries.size
					? Buffer.from(
							JSON.stringify({
								v: options.historyAccountScope ? 2 : 1,
								scope,
								after: Array.from(entries.keys()).at(-1),
								session: options.historySessionId,
							}),
						).toString("base64url")
					: options.historyCursor && options.historySessionId
						? Buffer.from(
								JSON.stringify({
									...JSON.parse(Buffer.from(options.historyCursor, "base64url").toString("utf8")),
									session: options.historySessionId,
								}),
							).toString("base64url")
						: (options.historyCursor ?? null)
				: null,
		observedAt: new Date().toISOString(),
	});
	try {
		while (pages < maximumPages) {
			signal.throwIfAborted();
			if (await options.historyShouldYield?.()) {
				reason = "foreground-yield";
				break;
			}
			if (performance.now() >= deadline) {
				deadlineController.abort(deadlineError);
				throw deadlineError;
			}
			const admission = input.governor?.begin({
				kind: "provider-read",
				interactionClass: "generic",
				source: "provider:grok:history-page",
				abortSignal: signal,
				targetId: input.governor.attribution.targetId,
			});
			void admission?.then(
				(action) => {
					if (signal.aborted)
						void action
							.settle({
								outcome: "failed",
								effectState: "none",
								error: "History admission cancelled before page dispatch",
							})
							.catch(() => undefined);
				},
				() => undefined,
			);
			const action = await bounded(async () => admission);

			let page: GrokHistoryPage;
			try {
				page = await bounded(() => input.readPage(signal));
				signal.throwIfAborted();
				if (page.error) throw new Error(page.error);
				if (!Array.isArray(page.items)) throw new Error("Malformed Grok history page.");
			} catch (error) {
				await action?.settle({
					outcome: "failed",
					probeContext: signal.aborted ? undefined : probeContext,
					effectState: signal.aborted ? "outcome-unknown" : "settled",
					error: error instanceof Error ? error.message : "History page failed",
				});
				throw error;
			}
			await bounded(async () => action?.settle({ outcome: "succeeded", probeContext }));
			signal.throwIfAborted();
			pages++;
			const before = entries.size;
			for (const row of page.items) {
				if (!row.id || !row.title) continue;
				let url: URL;
				try {
					url = new URL(row.url ?? `https://grok.com/c/${encodeURIComponent(row.id)}`);
					if (url.origin !== "https://grok.com") continue;
				} catch {
					continue;
				}
				const urlId = url.searchParams.get("chat") ?? url.pathname.match(/\/c\/([^/?#]+)/)?.[1];
				if (urlId !== row.id) {
					unknownScope = true;
					continue;
				}
				const rowProject = row.projectId ?? url.pathname.match(/\/project\/([^/?#]+)/)?.[1];
				if (input.projectId && rowProject !== input.projectId) {
					if (!rowProject) unknownScope = true;
					continue;
				}
				if (!anchorFound) {
					excludedPrefix.add(row.id);
					if (row.id === anchor) anchorFound = true;
					continue;
				}
				if (excludedPrefix.has(row.id)) continue;
				if (query && !row.title.toLowerCase().includes(query.toLowerCase())) continue;
				if (cutoff !== null) {
					if (typeof row.timestamp !== "number") unknownTime = true;
					else if (row.timestamp < cutoff) continue;
				}
				if (
					knownRows.get(row.id) ===
					grokHistoryFingerprint({
						id: row.id,
						title: row.title,
						projectId: rowProject,
						updatedAt:
							typeof row.timestamp === "number" && Number.isFinite(row.timestamp)
								? new Date(row.timestamp).toISOString()
								: undefined,
					})
				) {
					frontierReached = true;
					reason = "incremental-frontier";
					break;
				}
				if (!entries.has(row.id))
					entries.set(row.id, {
						id: row.id,
						title: row.title,
						provider: "grok",
						projectId: rowProject,
						url: url.href,
						updatedAt:
							typeof row.timestamp === "number" && Number.isFinite(row.timestamp)
								? new Date(row.timestamp).toISOString()
								: undefined,
						metadata: {
							grokProvenance: {
								projectId: rowProject ?? null,
								botId: row.botId ?? null,
								source: "chats",
							},
						},
					});
				if (entries.size >= limit) {
					reason = "item-limit";
					break;
				}
			}
			if (entries.size >= limit || frontierReached) break;
			if (page.emptyEvidence && entries.size === 0 && anchorFound && !unknownScope) {
				state = "empty";
				reason = "explicit-empty";
				break;
			}
			const terminal = page.atBottom === true && !page.loading;
			if (terminal && !anchorFound) {
				reason = "cursor-restart-required";
				restartRequired = true;
				break;
			}
			stableBottom = terminal && entries.size === before ? stableBottom + 1 : 0;
			if (
				stableBottom >= 1 &&
				anchorFound &&
				!unknownScope &&
				!unknownTime &&
				(entries.size > 0 || anchor !== null)
			) {
				state = "complete";
				reason = "visible-bottom";
				break;
			}
			reason = !anchorFound
				? options.historyFreshDialog && anchor !== null
					? "cursor-rebuilding"
					: "cursor-anchor-not-found"
				: unknownScope
					? "unattributed-project-rows"
					: unknownTime
						? "unknown-timestamps"
						: page.loading
							? "loading"
							: "page-limit";
			await input.onProgress?.(coverage());
			if (pages < maximumPages)
				await pause(Math.min(250, Math.max(1, deadline - performance.now())), undefined, {
					signal: options.abortSignal,
				});
		}
		const result = coverage();
		await input.onProgress?.(result);
		return {
			items: Array.from(entries.values()).map((item) => ({
				...item,
				metadata: { ...item.metadata, grokInventory: result },
			})),
			coverage: result,
		};
	} catch (error) {
		state = "failed";
		reason = deadlineController.signal.aborted
			? "time-limit"
			: options.abortSignal?.aborted
				? "cancelled"
				: error instanceof Error
					? error.message
					: "history-failed";
		await input.onProgress?.(coverage());
		throw error;
	} finally {
		clearTimeout(timer);
	}
}

export function buildGrokHistoryPageExpression(
	projectId: string | undefined,
	conversationBaseUrl: string,
): string {
	return `(() => {
          const projectId = ${JSON.stringify(projectId ?? null)};
          const dialog =
            document.querySelector('[role="dialog"]') ||
            document.querySelector('dialog') ||
            document.querySelector('[aria-modal="true"]');
          if (!dialog) return { items: [], error: "history-dialog-missing" };
          const now = Date.now();
          const parseRelative = (value) => {
            const text = String(value || '').toLowerCase().trim();
            if (!text) return null;
            if (text === 'just now' || text === 'moments ago') return now;
            if (text === 'today') return now;
            if (text === 'yesterday') return now - 24 * 60 * 60 * 1000;
            const cleaned = text.replace(/[.,]/g, '');
            const shortMatch = cleaned.match(/^(\\d+)\\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|wk|wks|week|weeks|mo|mos|month|months|y|yr|yrs|year|years)$/);
            const agoMatch = cleaned.match(/(\\d+)\\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|wk|wks|week|weeks|mo|mos|month|months|y|yr|yrs|year|years)\\s*ago/);
            const match = agoMatch || shortMatch;
            if (match) {
              const amount = Number.parseInt(match[1], 10);
              if (!Number.isFinite(amount)) return null;
              const unit = match[2];
              const isMonth = unit.startsWith('mo');
              const isMinute = unit.startsWith('m') && !isMonth;
              const isHour = unit.startsWith('h');
              const isDay = unit.startsWith('d');
              const isWeek = unit.startsWith('w');
              const isYear = unit.startsWith('y');
              const ms =
                isMinute
                  ? amount * 60 * 1000
                  : isHour
                    ? amount * 60 * 60 * 1000
                    : isDay
                      ? amount * 24 * 60 * 60 * 1000
                      : isWeek
                        ? amount * 7 * 24 * 60 * 60 * 1000
                        : isMonth
                          ? amount * 30 * 24 * 60 * 60 * 1000
                          : isYear
                            ? amount * 365 * 24 * 60 * 60 * 1000
                            : null;
              return ms === null ? null : now - ms;
            }
            const parsed = Date.parse(text);
            return Number.isFinite(parsed) ? parsed : null;
          };
            const readTimestamp = (node) => {
              const timeEl = node.querySelector?.('time');
              const candidates = [
                timeEl?.getAttribute?.('datetime'),
                timeEl?.getAttribute?.('title'),
                timeEl?.getAttribute?.('aria-label'),
                timeEl?.textContent,
                node.getAttribute?.('title'),
                node.getAttribute?.('aria-label'),
              ];
              for (const candidate of candidates) {
                const parsed = parseRelative(candidate);
                if (parsed !== null) return { ts: parsed, label: String(candidate || '').trim() };
                const absolute = Date.parse(String(candidate || ''));
                if (Number.isFinite(absolute)) return { ts: absolute, label: String(candidate || '').trim() };
              }
              const timeNode =
                node.querySelector?.('.z-20') ||
                node.querySelector?.(${JSON.stringify(cssClassContains("time"))}) ||
                node.querySelector?.(${JSON.stringify(cssClassContains("timestamp"))});
              if (timeNode) {
                const text = (timeNode.textContent || '').trim();
                const parsed = parseRelative(text);
                if (parsed !== null) return { ts: parsed, label: text };
                const absolute = Date.parse(text);
                if (Number.isFinite(absolute)) return { ts: absolute, label: text };
              }
              const descendants = Array.from(node.querySelectorAll?.('*') ?? []).reverse();
              for (const el of descendants) {
                const text = (el.textContent || '').trim();
                if (!text || text.length > 40) continue;
                const parsed = parseRelative(text);
                if (parsed !== null) return { ts: parsed, label: text };
                const absolute = Date.parse(text);
                if (Number.isFinite(absolute)) return { ts: absolute, label: text };
              }
              return { ts: null, label: '' };
            };
            const extractTitle = (node, timeLabel) => {
              const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, {
                acceptNode: (textNode) => {
                  const parent = textNode.parentElement;
                  if (!parent) return NodeFilter.FILTER_REJECT;
                  if (parent.closest('time')) return NodeFilter.FILTER_REJECT;
                  return NodeFilter.FILTER_ACCEPT;
                },
              });
              let text = '';
              while (walker.nextNode()) {
                text += ' ' + (walker.currentNode.nodeValue || '');
              }
              let title = text.replace(/\\s+/g, ' ').trim();
              if (timeLabel) {
                const escaped = timeLabel.replace(/[.*+?^$()|[\\]\\\\]/g, '\\$&');
                title = title.replace(new RegExp(escaped, 'i'), '').trim();
              }
              const timeCleanRegex = /(^|\\s)\\d+\\s+(minute|hour|day|week|month|year)s?\\s+ago(\\s|$)/gi;
              const dayCleanRegex = /(^|\\s)(yesterday|today)(\\s|$)/gi;
              const dateCleanRegex = /(^|\\s)(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\\s+[0-9]{1,2}(\\s|$)/gi;
              title = title
                  .replace(timeCleanRegex, '')
                  .replace(dayCleanRegex, '')
                  .replace(dateCleanRegex, '')
                  .replace(/\\s+/g, ' ')
                  .trim();
              return title;
            };
            const items = Array.from(
            dialog.querySelectorAll('[role="option"], a[href*="/c/"]')
          );
          const conversations = [];
          let oldest = null;
          for (const node of items) {
            const href =
              node.getAttribute('href') ||
              node.getAttribute('data-href') ||
              node.getAttribute('data-url') ||
              node.dataset?.href ||
              node.dataset?.url ||
              '';
            const dataValue = node.getAttribute('data-value') || node.dataset?.value || '';
            
            let url = '';
            let chatId = '';
            
            if (/^conversation:[A-Za-z0-9_-]+$/.test(dataValue)) {
              chatId = dataValue.split(':')[1];
              url = ${JSON.stringify(conversationBaseUrl)} + chatId;
            } else if (href) {
              try {
                url = href.startsWith('http') ? href : new URL(href, location.origin).toString();
                const parsed = new URL(url);
                chatId = parsed.searchParams.get('chat') || '';
                if (!chatId) {
                  const match = parsed.pathname.match(/\\/c\\/([^/?#]+)/);
                  chatId = match?.[1] || '';
                }
              } catch {
                // ignore URL parse
              }
            }
            
            if (!chatId) continue;

            const row = node.closest('div,li') || node;
            const { ts, label } = readTimestamp(row);
            if (typeof ts === 'number') {
              oldest = oldest === null ? ts : Math.min(oldest, ts);
            }
            const text = extractTitle(row, label) || (row.textContent || node.textContent || '').trim();
            const projectMatch = (() => { try { return new URL(url).pathname.match(/\\/project\\/([^/?#]+)/)?.[1]; } catch { return null; } })();
            const rowProjectId = node.closest('[data-project-id]')?.getAttribute('data-project-id') || projectMatch || undefined;
            const botId = node.closest('[data-bot-id]')?.getAttribute('data-bot-id') || undefined;
            conversations.push({ id: chatId, title: text || chatId, url, timestamp: ts ?? null, projectId: rowProjectId, botId });
          }
          const scrollables = Array.from(dialog.querySelectorAll('*')).filter((el) => {
            const element = el;
            return element.scrollHeight > element.clientHeight + 24;
          });
          const scrollable =
            scrollables.sort((a, b) => b.scrollHeight - a.scrollHeight)[0] || dialog;
          const canScroll = scrollable.scrollHeight > scrollable.clientHeight + 24;
          const scrollTop = scrollable.scrollTop;
          const atBottom = scrollTop + scrollable.clientHeight >= scrollable.scrollHeight - 5;
          if (canScroll && !atBottom) {
            scrollable.scrollTop = scrollable.scrollHeight;
          }
          return {
            items: conversations,
            canScroll,
            atBottom,
            scrollTop,
            scrollHeight: scrollable.scrollHeight,
            oldest,
            loading: Boolean(dialog.querySelector('[aria-busy="true"], [role="progressbar"], [data-state="loading"]')),
            emptyEvidence: conversations.length === 0 && /no (?:chats|conversations|results)(?: found| yet)?/i.test(dialog.textContent || ''),
          };
        })()`;
}

export function buildGrokChatsOpenerExpression(): string {
	return `(() => {
 const visible = node => { const rect=node.getBoundingClientRect(); const style=getComputedStyle(node); return rect.width>0 && rect.height>0 && style.visibility!=='hidden' && style.display!=='none' && !node.disabled; };
 const nodes=Array.from(document.querySelectorAll('button, [role="button"], a')).filter(visible);
 const label=node=>String(node.getAttribute('aria-label') || node.textContent || '').trim().toLowerCase();
 const chats=nodes.filter(node=>label(node)==='chats');
 const matches=chats.length ? chats : nodes.filter(node=>label(node)==='history');
 if(matches.length!==1)return {ok:false,reason:matches.length?'ambiguous-chats-opener':'chats-opener-missing'};
 matches[0].click();return {ok:true};
 })()`;
}

/** Rewind only fresh observations; continuation reads retain their qualified position. */
export function buildGrokHistoryHeadResetExpression(): string {
	return `(async () => {
 // grok-history-head-reset
 const dialog = document.querySelector('[role="dialog"]') || document.querySelector('dialog') || document.querySelector('[aria-modal="true"]');
 if (!dialog) return false;
 const scrollables = Array.from(dialog.querySelectorAll('*')).filter(el => el.scrollHeight > el.clientHeight + 24);
 const scroller = scrollables.sort((a,b) => b.scrollHeight - a.scrollHeight)[0] || dialog;
 scroller.scrollTop = 0;
 let timer;
 const rendered = await Promise.race([
   new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)))),
   new Promise(resolve => { timer = setTimeout(() => resolve(false), 1000); }),
 ]);
 clearTimeout(timer);
 return rendered && scroller.isConnected !== false && scroller.scrollTop <= 1;
 })()`;
}
