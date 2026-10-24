import { expect, test, vi } from "vitest";
import type { ResolvedUserConfig } from "../../src/config.js";
import { BrowserAutomationError } from "../../src/oracle/errors.js";
const mocks = vi.hoisted(() => ({ upload: vi.fn(), progress: vi.fn() }));
vi.mock("../../src/browser/grokFilesService.js", () => ({
	createGrokFilesService: () => ({
		upload: mocks.upload,
		context: mocks.upload,
		recent: mocks.upload,
		select: mocks.upload,
	}),
}));
vi.mock("../../src/browser/grokEcosystemProgress.js", () => ({
	recordGrokEcosystemProgress: mocks.progress,
}));
vi.mock("../../src/browser/llmService/providers/grokService.js", () => ({
	// biome-ignore lint/style/useNamingConvention: Mock preserves the actual named public export.
	GrokService: { create: () => ({ buildListOptions: async () => ({}) }) },
}));
import { createConfiguredGrokFilesService } from "../../src/browser/configuredGrokDiscovery.js";
import { runGrokFilesCommand } from "../../src/cli/grokFilesCommand.js";
test("failed Ops persistence preserves unknown upload effect and retained target through public wrapper", async () => {
	mocks.upload.mockRejectedValue(
		new BrowserAutomationError("unknown upload", {
			effectState: "unknown",
			targetId: "retained-target",
		}),
	);
	mocks.progress.mockRejectedValue(new Error("ENOSPC"));
	const service = await createConfiguredGrokFilesService({
		auracallProfile: "default",
		browser: { target: "grok" },
	} as ResolvedUserConfig);
	const result = await runGrokFilesCommand(
		{ action: "upload", paths: ["/explicit/file.txt"] },
		service,
	);
	expect(result.status).toBe("unconfirmed");
	expect(result.provenance.targetId).toBe("retained-target");
});
