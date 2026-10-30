// biome-ignore-all lint/style/useNamingConvention: CDP wire names are case-sensitive.
import { expect, test } from "vitest";
import { createGrokConversationsService } from "../../src/browser/grokConversationsService.js";

test("ungoverned history produces a structured failed inventory without rows", async () => {
	const service = createGrokConversationsService(
		{},
		{
			connect: async () => ({
				client: {
					Runtime: {
						evaluate: async () => {
							throw new Error("must not read");
						},
					},
					close: async () => {},
				},
				shouldClose: false,
				host: "localhost",
				port: 1,
			}),
		},
	);
	expect(await service.list()).toMatchObject({
		object: "grok_conversation_inventory",
		items: [],
		coverage: { state: "failed", reason: "history-authority-unavailable", nextCursor: null },
	});
});

import { historyTransportFixture } from "./grok401ConversationTransportFixture.js";

test.each([
	{ empty: true, state: "empty" },
	{ empty: false, state: "incomplete" },
])("preserves $state coverage with zero rows through real history collection", async ({
	empty,
	state,
}) => {
	const fixture = historyTransportFixture({ empty });
	const result = await createGrokConversationsService(fixture.options, fixture.dependencies).list({
		maxPages: 1,
	});
	expect(result).toMatchObject({
		object: "grok_conversation_inventory",
		items: [],
		coverage: { state, source: "visible-chats", loadedCount: 0 },
	});
	expect(fixture.targetWasClosed()).toBe(true);
});

test("public history envelope retains rows, coverage metadata and a resumable scope-bound cursor", async () => {
	const rows = [
		{ id: "one", title: "First" },
		{ id: "two", title: "Second" },
	];
	const first = historyTransportFixture({ rows });
	const result = await createGrokConversationsService(first.options, first.dependencies).list({
		limit: 1,
		maxPages: 1,
	});
	expect(result.items.map((row) => row.id)).toEqual(["one"]);
	expect(result.coverage).toMatchObject({
		state: "incomplete",
		reason: "item-limit",
		nextCursor: expect.any(String),
	});
	const second = historyTransportFixture({ rows });
	const resumed = await createGrokConversationsService(second.options, second.dependencies).list({
		limit: 1,
		maxPages: 1,
		cursor: result.coverage.nextCursor ?? undefined,
	});
	expect(resumed.items.map((row) => row.id)).toEqual(["two"]);
});

test.each([
	{ cleanupFails: true, swapAccount: false, reason: "history-cleanup-unconfirmed" },
	{ cleanupFails: false, swapAccount: true, reason: "history-account-not-verified" },
])("strips private rows/cursor after $reason", async ({ cleanupFails, swapAccount, reason }) => {
	const fixture = historyTransportFixture({
		rows: [{ id: "private-id", title: "private content" }],
		cleanupFails,
		swapAccount,
	});
	const result = await createGrokConversationsService(fixture.options, fixture.dependencies).list({
		limit: 1,
		maxPages: 1,
	});
	expect(result).toMatchObject({
		items: [],
		coverage: { state: "failed", reason, nextCursor: null, loadedCount: 0 },
	});
	expect(JSON.stringify(result)).not.toContain("private");
	if (cleanupFails) expect(fixture.targetWasClosed()).toBe(false);
});
