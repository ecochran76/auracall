import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import { setAuracallHomeDirOverrideForTest } from "../../src/auracallHome.js";
import {
	recordGrokEcosystemProgress,
	readGrokEcosystemProgress,
} from "../../src/browser/grokEcosystemProgress.js";
test("Ops keeps unknown file effect custody without exporting private file data", async () => {
	const home = await mkdtemp(path.join(os.tmpdir(), "grok-ecosystem-"));
	setAuracallHomeDirOverrideForTest(home);
	try {
		await recordGrokEcosystemProgress("files", "x".repeat(300), {
			status: "unconfirmed",
			code: "grok_file_effect_unknown",
			complete: false,
			count: 1,
			ready: 0,
			hasProviderAccountIdentity: true,
			filename: "private-file",
			endpoint: "https://secret.test/mcp?token=private",
			prompt: "private-prompt",
		});
		const status = await readGrokEcosystemProgress("files", "x".repeat(300));
		expect(status?.effectState).toBe("unknown");
		expect(JSON.stringify(status)).not.toContain("private");
		expect(JSON.stringify(status)).not.toContain("secret.test");
	} finally {
		setAuracallHomeDirOverrideForTest(null);
		await rm(home, { recursive: true, force: true });
	}
});
