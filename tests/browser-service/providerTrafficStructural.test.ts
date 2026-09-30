import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const ROOT = process.cwd();

function read(relativePath: string): string {
	return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

describe("provider traffic structural boundary", () => {
	test("keeps direct navigation and reload CDP effects inside browser-service seams", () => {
		const productionFiles = [
			"packages/browser-service/src/service/ui.ts",
			"packages/browser-service/src/chromeLifecycle.ts",
			"src/browser/providers/chatgptAdapter.ts",
			"src/browser/providers/geminiAdapter.ts",
			"src/browser/providers/grokAdapter.ts",
		];
		const directEffect = /Page\.(?:navigate|reload)\(|location\.(?:assign|reload)\(/;
		const offenders = productionFiles.filter(
			(file) => directEffect.test(read(file)) && !file.startsWith("packages/browser-service/src/"),
		);

		expect(offenders).toEqual([]);
		expect(read("packages/browser-service/src/service/ui.ts")).toContain(
			"providerTrafficGovernor.begin",
		);
		expect(read("packages/browser-service/src/chromeLifecycle.ts")).toContain(
			"beginTargetTrafficAction",
		);
	});

	test("threads provider traffic authority into every provider target reuse call", () => {
		for (const file of [
			"src/browser/providers/chatgptAdapter.ts",
			"src/browser/providers/geminiAdapter.ts",
			"src/browser/providers/grokAdapter.ts",
		]) {
			const source = read(file);
			for (const match of source.matchAll(/openOrReuseChromeTarget\(/g)) {
				const call = source.slice(match.index, match.index + 1_200);
				expect(call, file).toContain("providerTrafficGovernor:");
				expect(call, file).toContain("providerTrafficAuthorityFactory:");
				expect(call, file).toContain("providerTrafficRequired:");
			}
		}
	});

	test("configured provider options require traffic authority before adapter effects", () => {
		const service = read("src/browser/llmService/llmService.ts");
		expect(service).toContain("providerTrafficRequired: true");
		expect(service).toContain("createConfiguredProviderTrafficAuthorityFactory");
		for (const file of [
			"src/browser/providers/chatgptAdapter.ts",
			"src/browser/providers/geminiAdapter.ts",
			"src/browser/providers/grokAdapter.ts",
		]) {
			expect(read(file), file).toContain("await annotateClientMutationContext(");
		}
	});

	test("requires explicit pre-lease authority at every raw target creation call site", () => {
		for (const file of [
			"src/browser/index.ts",
			"src/browser/client.ts",
			"src/browser/legacyChatgptAffinityRuntime.ts",
			"src/browser/configuredChatgptUtilityAffinity.ts",
			"src/accountMirror/configuredLiveFollowAffinity.ts",
		]) {
			const source = read(file);
			for (const match of source.matchAll(/openChromeTarget\(/g)) {
				const call = source.slice(match.index, match.index + 700);
				expect(call, file).toMatch(/kind:\s*["']pre-lease-target-acquisition["']/);
			}
		}
	});
});
