// biome-ignore-all lint/style/useNamingConvention: CDP wire names are case-sensitive.
import { runInNewContext } from "node:vm";
import {
	connectorDomFixture,
	fixtureConnectorServiceOptions,
} from "./grok404ConnectorDomFixture.js";

/** Controlled CDP fixture: real auth/page expressions; generic Show All dispatch
 * is a protocol response. Opener/physical pointer acceptance is primary-owned. */
export function historyTransportFixture({
	empty = true,
	cleanupFails = false,
	email = "operator@example.test",
	rows = [] as Array<{ id: string; title: string }>,
	swapAccount = false,
} = {}) {
	const identity = connectorDomFixture({ userEmail: email });
	let open = true,
		targetClosed = false;
	const input = { getAttribute: () => null };
	const rowNodes = rows.map((row) => ({
		textContent: row.title,
		getAttribute: (key: string) => (key === "data-value" ? `conversation:${row.id}` : null),
		closest: (_selector: string): unknown => null,
		querySelector: () => null,
		querySelectorAll: () => [],
	}));
	const dialog = {
		textContent: empty ? "Chats\nNo chats found" : "Chats",
		scrollHeight: 100,
		clientHeight: 100,
		scrollTop: 0,
		querySelector: (selector: string) =>
			selector.includes("combobox") || selector === '[role="tab"]' ? input : null,
		querySelectorAll: (selector: string) => (selector.includes('role="option"') ? rowNodes : []),
	};
	const document = {
		querySelector: (selector: string) => (selector.includes("dialog") && open ? dialog : null),
		body: {
			dispatchEvent: () => {
				open = false;
			},
		},
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
	const client = {
		Runtime: {
			evaluate: async ({ expression }: { expression: string }) => {
				if (expression.includes("guestAuthCta") || expression.includes("const identity ="))
					return identity.runtime
						.evaluate({ expression })
						.then((response) => ({
							result: { type: "object" as const, value: response.result.value },
						}));
				if (
					expression.includes("const projectId") ||
					expression.includes("hasConversationLink") ||
					expression.startsWith("!Boolean") ||
					expression.includes("document.body.dispatchEvent(new KeyboardEvent")
				) {
					const value = runInNewContext(expression, {
						document,
						location: { origin: "https://grok.com" },
						URL,
						NodeFilter: { SHOW_TEXT: 4, FILTER_REJECT: 2, FILTER_ACCEPT: 1 },
						KeyboardEvent: class {
							constructor(readonly type: string) {}
						},
					});
					if (expression.includes("const projectId") && swapAccount)
						identity.setUserEmail("other@example.test");
					return { result: { type: "object" as const, value } };
				}
				return {
					result: { type: "object" as const, value: { ok: true, matchedLabel: "Show All" } },
				};
			},
		},
		close: async () => {
			if (cleanupFails) throw new Error("private cleanup token=secret");
		},
		__auracallProviderTrafficGovernor: {
			attribution: { provider: "grok", targetId: "fixture-target" },
			admitBackendRequest: async () => {},
			begin: async () => ({ settle: async () => {} }),
		},
	};
	return {
		options: fixtureConnectorServiceOptions(),
		dependencies: {
			connect: async () => ({
				client,
				targetId: "fixture-target",
				shouldClose: true,
				host: "localhost",
				port: 1,
			}),
			closeTarget: async () => {
				targetClosed = true;
			},
		},
		targetWasClosed: () => targetClosed,
	};
}
