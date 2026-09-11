import { describe, expect, it, vi } from "vitest";
import { buildChatgptDeepResearchExportControlExpressionForTest } from "../../src/browser/providers/chatgptAdapter.js";

describe("ChatGPT Deep Research export control", () => {
	it.each([
		"Export to Word",
		"Export to PDF",
	])("opens Export and selects %s in separate synchronous execution contexts", (exportLabel) => {
		class FixtureElement {
			textContent: string;
			attributes: Record<string, string>;
			click: ReturnType<typeof vi.fn>;
			ownerDocument = {
				defaultView: { getComputedStyle: () => ({ display: "block", visibility: "visible" }) },
			};

			constructor(text: string, attributes: Record<string, string> = {}) {
				this.textContent = text;
				this.attributes = attributes;
				this.click = vi.fn();
			}

			getAttribute(name: string) {
				return this.attributes[name] ?? null;
			}
			getBoundingClientRect() {
				return { width: 100, height: 30 };
			}
		}

		const exportButton = new FixtureElement("Export");
		const exportOption = new FixtureElement(exportLabel);
		let controls = [exportButton];
		exportButton.click.mockImplementation(() => {
			controls = [exportButton, exportOption];
		});
		const documentFixture = {
			defaultView: { getComputedStyle: () => ({ display: "block", visibility: "visible" }) },
			querySelectorAll: (selector: string) => (selector === "iframe" ? [] : controls),
		};

		vi.stubGlobal("Element", FixtureElement);
		vi.stubGlobal("document", documentFixture);
		try {
			const first = new Function(
				`return ${buildChatgptDeepResearchExportControlExpressionForTest(exportLabel)}`,
			)();
			expect(first).toEqual({ action: "export-menu-opened" });
			expect(exportButton.click).toHaveBeenCalledTimes(1);
			expect(exportOption.click).not.toHaveBeenCalled();

			const second = new Function(
				`return ${buildChatgptDeepResearchExportControlExpressionForTest(exportLabel)}`,
			)();
			expect(second).toEqual({ action: "export-option-clicked" });
			expect(exportOption.click).toHaveBeenCalledTimes(1);
		} finally {
			vi.unstubAllGlobals();
		}
	});
});
