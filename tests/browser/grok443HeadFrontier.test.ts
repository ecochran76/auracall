import { runInNewContext } from "node:vm";
import { expect, test } from "vitest";
import { createGrokConversationsService } from "../../src/browser/grokConversationsService.js";
import { grokHistoryFingerprint } from "../../src/browser/providers/grokHistoryInventory.js";
import { historyTransportFixture } from "./grok401ConversationTransportFixture.js";

test("public controlled-CDP history service stops at known row without claiming global ordering", async () => {
	const fixture = historyTransportFixture({
		empty: false,
		rows: [
			{ id: "new", title: "New head row" },
			{ id: "known", title: "Known row" },
			{ id: "older", title: "Unobserved older change" },
		],
	});
	const connection = await fixture.dependencies.connect();
	let resetCount = 0;
	const scroller = { scrollTop: 900, scrollHeight: 1000, clientHeight: 100, isConnected: true };
	const original = connection.client.Runtime.evaluate;
	connection.client.Runtime.evaluate = async ({ expression }: { expression: string }) => {
		if (expression.includes("grok-history-head-reset")) {
			resetCount++;
			const value = await runInNewContext(expression, {
				document: { querySelector: () => ({ querySelectorAll: () => [scroller] }) },
				requestAnimationFrame: (fn: () => void) => fn(),
				setTimeout,
				clearTimeout,
			});
			return { result: { type: "object" as const, value } };
		}
		return original({ expression });
	};
	const service = createGrokConversationsService(
		{
			...fixture.options,
			historyStartAtHead: true,
			historyKnownRows: [
				{ id: "known", fingerprint: grokHistoryFingerprint({ id: "known", title: "Known row" }) },
			],
		},
		fixture.dependencies,
	);
	const result = await service.list({ limit: 10 });
	expect(result.items.map((row) => row.id)).toEqual(["new"]);
	expect(result.coverage).toMatchObject({
		state: "incomplete",
		reason: "incremental-frontier",
		nextCursor: null,
		loadedCount: 1,
		pages: 1,
	});
	expect(fixture.targetWasClosed()).toBe(true);
	expect(resetCount).toBe(1);
	expect(scroller.scrollTop).toBe(0);
});
