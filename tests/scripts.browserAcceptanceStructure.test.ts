import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("browser acceptance script structure", () => {
	it("keeps shared mechanics in one harness and provider workflows in their adapters", async () => {
		const [harness, chatgpt, grok] = await Promise.all([
			fs.readFile(path.resolve("scripts/lib/browserAcceptanceHarness.ts"), "utf8"),
			fs.readFile(path.resolve("scripts/chatgpt-acceptance.ts"), "utf8"),
			fs.readFile(path.resolve("scripts/grok-acceptance.ts"), "utf8"),
		]);

		expect(harness).toContain("spawnSync");
		for (const providerScript of [chatgpt, grok]) {
			expect(providerScript).toContain("browserAcceptanceHarness.js");
			expect(providerScript).not.toContain("spawnSync");
			expect(providerScript).not.toMatch(/type RunOptions\s*=/);
			expect(providerScript).not.toMatch(/type RunResult\s*=/);
			expect(providerScript).not.toMatch(/function parseJson</);
		}

		expect(chatgpt).not.toContain("function readAcceptanceState");
		expect(chatgpt).not.toContain("function writeAcceptanceState");
		expect(chatgpt).toContain("runAuracallWithChatgptRateLimitRetry");
		expect(chatgpt).toContain("readChatgptGuardState");
		expect(chatgpt).toContain("bestEffortCleanup");
		expect(chatgpt).toContain("type AcceptancePhase");

		expect(grok).toContain("EXPECTED_MEDIUM_FILE_ERROR");
		expect(grok).toContain("--keep-projects");
		expect(grok).not.toContain("--state-file");
		expect(grok).not.toContain("--resume");
	});
});
