import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
	buildChatgptDeepResearchExportControlExpressionForTest,
	snapshotChatgptDownloadDirectoryForTest,
	validateChatgptDeepResearchExportFileForTest,
	waitForChatgptExportDownloadForTest,
} from "../../src/browser/providers/chatgptAdapter.js";

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

	it("ignores retained and wrong-variant files while waiting for a fresh PDF", async () => {
		const dir = await fs.mkdtemp(path.join(os.tmpdir(), "auracall-deep-research-export-"));
		try {
			const retainedPdf = path.join(dir, "report.pdf");
			await fs.writeFile(retainedPdf, "%PDF-retained");
			const baseline = await snapshotChatgptDownloadDirectoryForTest(dir);
			await fs.writeFile(path.join(dir, "report.docx"), Buffer.from([0x50, 0x4b, 0x03, 0x04]));

			await expect(
				waitForChatgptExportDownloadForTest(dir, "pdf", baseline, 80, 10),
			).rejects.toThrow(/expected fresh \.pdf.*report\.docx/i);
		} finally {
			await fs.rm(dir, { recursive: true, force: true });
		}
	});

	it("admits only a fresh expected-variant file with matching content signature", async () => {
		const dir = await fs.mkdtemp(path.join(os.tmpdir(), "auracall-deep-research-export-"));
		try {
			const baseline = await snapshotChatgptDownloadDirectoryForTest(dir);
			const pdfPath = path.join(dir, "report.pdf");
			await fs.writeFile(pdfPath, "%PDF-1.7 fresh");

			await expect(
				waitForChatgptExportDownloadForTest(dir, "pdf", baseline, 80, 10),
			).resolves.toBe(pdfPath);
			await expect(validateChatgptDeepResearchExportFileForTest(pdfPath, "pdf")).resolves.toEqual({
				extension: ".pdf",
				mimeType: "application/pdf",
			});

			const mislabeledPdf = path.join(dir, "mislabeled.pdf");
			await fs.writeFile(mislabeledPdf, Buffer.from([0x50, 0x4b, 0x03, 0x04]));
			await expect(
				validateChatgptDeepResearchExportFileForTest(mislabeledPdf, "pdf"),
			).rejects.toThrow(/does not contain PDF bytes/i);
		} finally {
			await fs.rm(dir, { recursive: true, force: true });
		}
	});
});
