import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("history materialization attempt structure", () => {
	it("keeps one executor seam and removes the legacy target helper", async () => {
		const source = await fs.readFile(
			path.resolve("src/runtime/historyMaterializationService.ts"),
			"utf8",
		);

		expect(source).toContain("interface HistoryMaterializationAttemptExecutor");
		expect(source).toContain("interface HistoryMaterializationAttempt");
		expect(source).toContain("interface HistoryMaterializationAttemptOutcome");
		expect(source).not.toContain("reconcileConversationTarget");
		expect(source.match(/createHistoryMaterializationAttemptExecutor\(\{/g)).toHaveLength(1);
	});
});
