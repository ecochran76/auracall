import { describe, expect, test, vi } from "vitest";
import { readBoundedConversations } from "../../src/accountMirror/chatgptMetadataCollector.js";
import type { GrokHistoryCoverage } from "../../src/browser/providers/grokHistoryInventory.js";
import type { BrowserProviderListOptions } from "../../src/browser/providers/types.js";

const coverage = (state: GrokHistoryCoverage["state"]): GrokHistoryCoverage => ({
	state,
	source: "visible-chats",
	scope: "root",
	reason: state === "failed" ? "provider-error" : "page-limit",
	loadedCount: 1,
	pages: 1,
	nextCursor: state === "incomplete" ? "resume-anchor" : null,
	observedAt: "2026-10-24T22:00:00.000Z",
});
function clientWith(state?: GrokHistoryCoverage["state"], rows = 1) {
	return {
		listConversations: vi.fn(async (_project: unknown, options: BrowserProviderListOptions) => {
			if (state) await options.onHistoryInventory?.(coverage(state));
			return Array.from({ length: rows }, (_, index) => ({
				id: `chat-${index + 1}`,
				title: "One",
				provider: "grok",
			}));
		}),
	} as unknown as Parameters<typeof readBoundedConversations>[0];
}
describe("Grok mirror index coverage", () => {
	test("retains incomplete provider coverage even when rows fit within the requested limit", async () => {
		const progress = vi.fn();
		const result = await readBoundedConversations(clientWith("incomplete"), null, 5, {
			listOptions: { onHistoryInventory: progress },
		});
		expect(result.truncated).toBe(true);
		expect(result.historyCoverage).toEqual(coverage("incomplete"));
		expect(progress).toHaveBeenCalledWith(coverage("incomplete"));
	});
	test("propagates failed inventory instead of presenting cached rows as success", async () => {
		await expect(readBoundedConversations(clientWith("failed"), null, 5)).rejects.toThrow(
			/Grok history.*provider-error/,
		);
	});
	test("preserves complete visible-scope evidence without claiming account-wide coverage", async () => {
		const result = await readBoundedConversations(clientWith("complete"), null, 5);
		expect(result.truncated).toBe(false);
		expect(result.historyCoverage).toEqual(coverage("complete"));
	});
	test("keeps Grok discovery partial when a path returns rows without coverage evidence", async () => {
		const result = await readBoundedConversations(clientWith(), null, 5, {
			observation: { provider: "grok", runtimeProfileId: "default" },
		});
		expect(result.truncated).toBe(true);
	});
	test("preserves other providers' successful reads", async () => {
		expect(await readBoundedConversations(clientWith(), null, 5)).toEqual({
			items: [{ id: "chat-1", title: "One", provider: "grok" }],
			truncated: false,
		});
	});
	test("keeps an empty incomplete page partial", async () => {
		expect((await readBoundedConversations(clientWith("incomplete", 0), null, 5)).truncated).toBe(
			true,
		);
	});
	test("retains overflow detection without coverage callbacks", async () => {
		const result = await readBoundedConversations(clientWith(undefined, 3), null, 1);
		expect(result.items).toHaveLength(1);
		expect(result.truncated).toBe(true);
	});
	test("does not suppress an explicit failed inventory under failure tolerance", async () => {
		await expect(
			readBoundedConversations(clientWith("failed"), null, 5, { tolerateReadFailure: true }),
		).rejects.toThrow(/Grok history.*provider-error/);
	});
});
