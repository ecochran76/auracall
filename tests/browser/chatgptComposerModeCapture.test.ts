import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test, expect, vi } from "vitest";
import { ensureChatgptComposerMode } from "../../src/browser/actions/chatgptComposerMode.js";
import { setAuracallHomeDirOverrideForTest } from "../../src/auracallHome.js";

test("mode failure retains a private bounded control receipt without page contents", async () => {
	const home = await fs.mkdtemp(path.join(os.tmpdir(), "auracall-mode-capture-"));
	setAuracallHomeDirOverrideForTest(home);
	try {
		const evaluate = vi
			.fn()
			.mockResolvedValueOnce({
				result: { value: { status: "mode-not-found", availableModes: [] } },
			})
			.mockResolvedValue({
				result: {
					value: {
						readyState: "complete",
						pathKind: "root",
						modeControls: 0,
						visibleModeControls: 0,
						enabledModeControls: 0,
						legacyEditors: 0,
						editableTextboxes: 1,
						visibleEditors: 1,
						dialogs: 0,
						privateContent: "MUST_NOT_BE_RETAINED",
					},
				},
			});
		await expect(
			ensureChatgptComposerMode({ evaluate } as never, "chat", vi.fn<(message: string) => void>()),
		).rejects.toThrow("Unable to find the ChatGPT Chat mode control.");
		const directory = path.join(home, "diagnostics", "composer-mode");
		const names = await fs.readdir(directory);
		expect(names).toHaveLength(1);
		const file = path.join(directory, names[0]!);
		const text = await fs.readFile(file, "utf8");
		const receipt = JSON.parse(text);
		expect(receipt).toMatchObject({
			schemaVersion: 1,
			desiredMode: "chat",
			outcome: "mode-not-found",
			controls: { editableTextboxes: 1, modeControls: 0 },
		});
		expect(text).not.toContain("MUST_NOT_BE_RETAINED");
		expect((await fs.stat(file)).mode & 0o777).toBe(0o600);
	} finally {
		setAuracallHomeDirOverrideForTest(null);
		await fs.rm(home, { recursive: true, force: true });
	}
});
