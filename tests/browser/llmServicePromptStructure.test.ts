import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

describe("provider prompt architecture", () => {
	test("keeps the common prompt lifecycle only in the LlmService base module", async () => {
		const [base, chatgpt, gemini, grok, chatgptAdapter] = await Promise.all([
			readFile("src/browser/llmService/llmService.ts", "utf8"),
			readFile("src/browser/llmService/providers/chatgptService.ts", "utf8"),
			readFile("src/browser/llmService/providers/geminiService.ts", "utf8"),
			readFile("src/browser/llmService/providers/grokService.ts", "utf8"),
			readFile("src/browser/providers/chatgptAdapter.ts", "utf8"),
		]);

		expect(base).not.toContain("runPlannedPrompt");
		expect(chatgpt).not.toContain("runBrowserMode");
		expect(chatgpt).not.toContain("serviceUserConfig");
		expect(chatgpt).not.toContain("createProgressLogger");
		for (const providerModule of [chatgpt, gemini, grok]) {
			expect(providerModule).not.toMatch(/async runPrompt\s*\(/);
		}
		const promptStart = chatgptAdapter.indexOf("async runPrompt(");
		const promptEnd = chatgptAdapter.indexOf("async getUserIdentity(", promptStart);
		const promptImplementation = chatgptAdapter.slice(promptStart, promptEnd);
		expect(promptStart).toBeGreaterThan(-1);
		expect(promptEnd).toBeGreaterThan(promptStart);
		expect(promptImplementation).not.toContain("Answer now");
		expect(promptImplementation).not.toContain("createChatgptToolApprovalHandler");
		expect(promptImplementation).not.toContain("pressButton");
	});
});
