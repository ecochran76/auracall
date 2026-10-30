import { expect, test } from "vitest";
import {
	collectGrokHistoryInventory,
	grokHistoryFingerprint,
} from "../../src/browser/providers/grokHistoryInventory.js";
import { readGrokTimestampDom } from "./grok452DomFixture.js";

test.each([
	"today",
	"2 hours ago",
	"yesterday",
	"5m",
])("advancing the observation clock for %s does not create a history change", async (label) => {
	const rows = [{ id: "a", title: "Unchanged", label }];
	const now = Date.parse("2026-10-25T03:00:00Z");
	const first = await collectGrokHistoryInventory({
		readPage: async () => readGrokTimestampDom(rows, now),
		options: { historyMaxPages: 1 },
	});
	const next = await collectGrokHistoryInventory({
		readPage: async () => readGrokTimestampDom(rows, now + 60_000),
		options: {
			historyMaxPages: 1,
			historyKnownRows: first.items.map((row) => ({
				id: row.id,
				fingerprint: grokHistoryFingerprint(row),
			})),
		},
	});
	expect(next.items).toEqual([]);
	expect(next.coverage).toMatchObject({
		state: "incomplete",
		reason: "incremental-frontier",
		nextCursor: null,
		pages: 1,
	});
});

test("qualified absolute date changes, title changes and new rows survive a known row and bounded continuation", async () => {
	const now = Date.parse("2026-10-25T03:00:00Z");
	const rows = [
		{ id: "a", title: "Known", label: "today" },
		{ id: "b", title: "Date only change", label: "today", datetime: "2026-10-24T12:00:00Z" },
		{ id: "c", title: "Original title", label: "2 hours ago" },
		{ id: "d", title: "Known last", label: "October 23, 2026 00:00:00 GMT" },
	];
	const first = await collectGrokHistoryInventory({
		readPage: async () => readGrokTimestampDom(rows, now),
		options: { historyMaxPages: 1 },
	});
	expect(first.items.find((row) => row.id === "b")?.updatedAt).toBe("2026-10-24T12:00:00.000Z");
	expect(first.items.find((row) => row.id === "d")?.updatedAt).toBe("2026-10-23T00:00:00.000Z");
	const historyKnownRows = first.items.map((row) => ({
		id: row.id,
		fingerprint: grokHistoryFingerprint(row),
	}));
	rows[1].datetime = "2026-10-24T13:00:00Z";
	rows[2].title = "Changed title";
	rows.push({ id: "e", title: "New row", label: "today" });
	const readPage = async () => readGrokTimestampDom(rows, now + 60_000);
	const changed = await collectGrokHistoryInventory({
		readPage,
		options: { historyKnownRows, historyMaxPages: 1, historyLimit: 2 },
	});
	expect(changed.items.map((row) => row.id)).toEqual(["b", "c"]);
	expect(changed.items[0].updatedAt).toBe("2026-10-24T13:00:00.000Z");
	expect(changed.items[1].title).toBe("Changed title");
	expect(changed.coverage).toMatchObject({
		state: "incomplete",
		reason: "item-limit",
		loadedCount: 2,
		pages: 1,
	});
	expect(changed.coverage.nextCursor).toBeTypeOf("string");
	const resumed = await collectGrokHistoryInventory({
		readPage,
		options: {
			historyKnownRows,
			historyMaxPages: 1,
			historyLimit: 2,
			historyCursor: changed.coverage.nextCursor,
		},
	});
	expect(resumed.items.map((row) => row.id)).toEqual(["e"]);
	expect(resumed.coverage).toMatchObject({
		state: "incomplete",
		reason: "incremental-frontier",
		nextCursor: null,
	});
});
