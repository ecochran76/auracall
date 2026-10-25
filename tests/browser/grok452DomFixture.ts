// biome-ignore-all lint/style/useNamingConvention: DOM globals preserve platform names.
import { runInNewContext } from "node:vm";
import {
	buildGrokHistoryPageExpression,
	type GrokHistoryPage,
} from "../../src/browser/providers/grokHistoryInventory.js";

/** Executes the production DOM reader against a controlled visible Chats document. */
export function readGrokTimestampDom(
	rows: readonly { id: string; title: string; label: string; datetime?: string }[],
	now: number,
): GrokHistoryPage {
	const nodes = rows.map((input) => {
		const node = {
			textContent: input.title,
			getAttribute: (key: string) => (key === "data-value" ? `conversation:${input.id}` : null),
			closest: (key: string): unknown => (key === "div,li" ? node : null),
			querySelector: (key: string) =>
				key === "time"
					? {
							textContent: input.label,
							getAttribute: (attribute: string) =>
								attribute === "datetime" ? (input.datetime ?? null) : null,
						}
					: null,
			querySelectorAll: () => [],
		};
		return node;
	});
	const dialog = {
		textContent: "Chats",
		scrollHeight: 100,
		clientHeight: 100,
		scrollTop: 0,
		querySelector: () => null,
		querySelectorAll: (selector: string) => (selector.includes('role="option"') ? nodes : []),
	};
	const document = {
		querySelector: () => dialog,
		createTreeWalker: (node: { textContent: string }) => {
			let done = false;
			return {
				currentNode: { nodeValue: node.textContent },
				nextNode: () => {
					if (done) return false;
					done = true;
					return true;
				},
			};
		},
	};
	class Clock extends Date {
		static now() {
			return now;
		}
	}
	return runInNewContext(buildGrokHistoryPageExpression(undefined, "https://grok.com/c/"), {
		document,
		Date: Clock,
		location: { origin: "https://grok.com" },
		URL,
		NodeFilter: { SHOW_TEXT: 4, FILTER_REJECT: 2, FILTER_ACCEPT: 1 },
	});
}
