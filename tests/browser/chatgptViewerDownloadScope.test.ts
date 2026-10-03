import { runInNewContext } from "node:vm";
import { expect, test, vi } from "vitest";
import { clickChatgptViewerDownloadButtonWithClientForTest } from "../../src/browser/providers/chatgptAdapter.js";

// Minimized from cycle 1: an inline PPTX card has a generic Download file
// button while the selected PDF preview has not mounted a viewer download.
test.each([
	0, 1, 3,
])("viewer transfer excludes inline conversation downloads: inline-count=%s", async (inline) => {
	class InlineControl {
		textContent = "";
		ownerDocument = {
			defaultView: { getComputedStyle: () => ({ display: "block", visibility: "visible" }) },
		};
		getAttribute(name: string) {
			return name === "aria-label" ? "Download file" : null;
		}
		getBoundingClientRect() {
			return { left: 10, top: 20, width: 36, height: 36 };
		}
		scrollIntoView() {}
		closest(selector: string) {
			return /data-content-search-unit-key|data-message-author-role|conversation-turn/.test(
				selector,
			)
				? { getAttribute: () => "fallback-turn-2:2:assistant" }
				: null;
		}
	}
	const control = new InlineControl();
	const dispatchMouseEvent = vi.fn(async () => undefined);
	const evaluate = async ({ expression }: { expression: string }) => ({
		result: {
			value: runInNewContext(expression, {
				// biome-ignore lint/style/useNamingConvention: Browser protocol names.
				Element: InlineControl,
				// biome-ignore lint/style/useNamingConvention: Browser protocol names.
				HTMLElement: InlineControl,
				document: { querySelectorAll: () => Array.from({ length: inline }, () => control) },
			}),
		},
	});
	vi.useFakeTimers();
	const pending = clickChatgptViewerDownloadButtonWithClientForTest({
		// biome-ignore lint/style/useNamingConvention: CDP protocol names.
		Runtime: { evaluate },
		// biome-ignore lint/style/useNamingConvention: CDP protocol names.
		Input: { dispatchMouseEvent },
	} as never);
	await vi.runAllTimersAsync();
	const clicked = await pending;
	vi.useRealTimers();
	expect(clicked).toBe(false);
	expect(dispatchMouseEvent).not.toHaveBeenCalled();
});
