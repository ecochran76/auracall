import { runInNewContext } from "node:vm";
import { expect, test, vi } from "vitest";
import { readChatgptConversationContextWithClientForTest } from "../../src/browser/providers/chatgptAdapter.js";

test.each([
	"hidden",
	"unrelated",
	"failed-turn",
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
			return scenario === "unrelated" ? null : { textContent: "Server connection failed. Retry" };
		}
	}
	const control = new Control();
	const conversationId = "retry-visibility";
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
						document: { querySelectorAll: () => [control] },
					}),
				},
			};
		}
		throw new Error("fixture-context-action-reached");
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
	if (scenario === "failed-turn")
		await expect(read).rejects.toThrow(`readChatgptConversationContext:${conversationId}: retry`);
	else await expect(read).rejects.toThrow("fixture-context-action-reached");
});
