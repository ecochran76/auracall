import { runInNewContext } from "node:vm";
import { expect, test, vi } from "vitest";
import { readChatgptConversationContextWithClientForTest } from "../../src/browser/providers/chatgptAdapter.js";

test.each([
	"hidden",
	"unrelated",
	"failed-turn",
	"late-unrelated",
	"late-failed-turn",
])("context reader retry detection: %s control", async (scenario) => {
	class Control {
		textContent = "Retry";
		getAttribute(name: string) {
			return name === "aria-label" ? "Retry" : null;
		}
		getBoundingClientRect() {
			return { width: 100, height: 30 };
		}
		closest() {
			return scenario.endsWith("unrelated")
				? null
				: { textContent: "Server connection failed. Retry" };
		}
	}
	const control = new Control();
	const conversationId = "retry-visibility";
	let extractionComplete = false;
	const messages = [
		{ role: "user", text: "Read the attached input", messageId: "user-1" },
		{ role: "assistant", text: "Completed analysis", messageId: "assistant-1" },
	];
	const evaluate = vi.fn(async ({ expression }: { expression: string }) => {
		if (expression.includes("const overlaySelectors =")) return { result: { value: [] } };
		if (expression.includes("const labels = ['retry'")) {
			return {
				result: {
					value: runInNewContext(expression, {
						// biome-ignore lint/style/useNamingConvention: browser global.
						Element: Control,
						// biome-ignore lint/style/useNamingConvention: browser global.
						HTMLElement: Control,
						getComputedStyle: () => ({
							visibility: scenario === "hidden" ? "hidden" : "visible",
							display: "block",
						}),
						document: {
							querySelectorAll: () =>
								scenario.startsWith("late-") && !extractionComplete ? [] : [control],
						},
					}),
				},
			};
		}
		if (expression.includes("const hasTurns =")) return { result: { value: true } };
		if (expression.includes("/backend-api/conversation/"))
			return { result: { value: { ok: true, body: JSON.stringify({ mapping: {} }) } } };
		if (expression.includes("nextOffset:"))
			return { result: { value: { messages, nextOffset: null } } };
		if (expression.includes("readReactFileTileMetadata"))
			return {
				result: {
					value: [
						{
							name: "input.txt",
							messageId: "user-1",
							tileIndex: 0,
							providerFileId: "file-fixture",
						},
					],
				},
			};
		if (expression.includes("toolbarPattern")) {
			extractionComplete = true;
			return { result: { value: [] } };
		}
		if (
			expression.includes("deep[_ -]?research") ||
			expression.includes("const artifactTitle =") ||
			expression.includes("imagegen-image")
		)
			return { result: { value: [] } };
		throw new Error("Unexpected context evaluation");
	});
	const client = {
		// biome-ignore lint/style/useNamingConvention: CDP protocol domain.
		Runtime: { evaluate },
	};
	const read = readChatgptConversationContextWithClientForTest(
		client as never,
		conversationId,
		null,
		undefined,
		{
			allowNavigation: false,
			accountMirrorInventory: true,
			accountMirrorSingleConversationVisit: true,
		},
	);
	if (scenario.endsWith("failed-turn"))
		await expect(read).rejects.toThrow(`readChatgptConversationContext:${conversationId}: retry`);
	else {
		const context = await read;
		expect(context.messages).toEqual(messages.map(({ role, text }) => ({ role, text })));
		expect(context.files).toEqual([expect.objectContaining({ name: "input.txt" })]);
		expect(extractionComplete).toBe(true);
	}
});
