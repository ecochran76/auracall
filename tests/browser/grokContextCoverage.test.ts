import { expect, test } from "vitest";
import {
	boundObservedGrokContext,
	mergeObservedGrokContext,
} from "../../src/browser/providers/grokContext.js";

test("bounded Grok observations resume exact project and Bot identity without inventing history coverage", () => {
	const context = {
		provider: "grok" as const,
		conversationId: "chat",
		messages: [
			{ role: "user" as const, text: "First" },
			{ role: "assistant" as const, text: "Second" },
		],
		sources: [{ url: "https://example.com/second", messageIndex: 1 }],
	};
	const first = boundObservedGrokContext(
		context,
		{ startMessageIndex: 0, maxMessages: 1 },
		{ projectId: "project", botId: "bot" },
	);
	expect(first.messages).toEqual([{ role: "user", text: "First" }]);
	expect(first.metadata).toMatchObject({
		projectId: "project",
		botId: "bot",
		historyCoverage: {
			state: "partial",
			source: "mounted-dom",
			reason: "history-boundary-unobserved",
		},
		accountMirrorContextChunk: { nextMessageIndex: 1, complete: false, totalMessages: null },
	});
	const last = boundObservedGrokContext(
		context,
		{ startMessageIndex: 1, maxMessages: 1 },
		{ projectId: "project", botId: "bot" },
	);
	expect(mergeObservedGrokContext(first, last).messages).toEqual(context.messages);
	const retained = mergeObservedGrokContext(mergeObservedGrokContext(first, last), first);
	expect(retained.messages).toEqual(context.messages);
	expect(retained.sources).toEqual(context.sources);
	expect(() => mergeObservedGrokContext({ ...first, metadata: {} }, last)).toThrow(/snapshot/);
	expect(() => mergeObservedGrokContext({...first,metadata:{...first.metadata,projectId:"foreign-project"}},last)).toThrow(/snapshot/);
	expect(() => mergeObservedGrokContext({...first,metadata:{...first.metadata,botId:"foreign-bot"}},last)).toThrow(/snapshot/);
	expect(() => mergeObservedGrokContext({...first,metadata:{...first.metadata,historyCoverage:{fingerprint:"changed-inventory"}}},last)).toThrow(/snapshot/);
	expect(last.messages).toEqual([{ role: "assistant", text: "Second" }]);
	expect(last.sources).toEqual([{ url: "https://example.com/second", messageIndex: 0 }]);
	expect(last.metadata?.accountMirrorContextChunk).toMatchObject({
		nextMessageIndex: null,
		complete: false,
	});
});

test("an unreadable mounted card cannot advance an observed content cursor", () => {
	expect(() =>
		boundObservedGrokContext(
			{
				provider: "grok",
				conversationId: "chat",
				messages: [{ role: "assistant", text: "One readable card" }],
			},
			{ startMessageIndex: 0, maxMessages: 2 },
			{},
			{ totalMessages: 2, fingerprint: "mounted-two" },
		),
	).toThrow(/unavailable.*mounted card/i);
});
