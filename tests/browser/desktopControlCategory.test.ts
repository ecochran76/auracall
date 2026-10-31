import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { DesktopControlGate } from "../../src/browser/service/desktopControlGate.js";

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllEnvs();
});

test.skipIf(process.platform !== "linux").each([false, true])(
	"a human refusal records concurrent cancellation separately: aborted=%s",
	async (aborted) => {
		const home = await fs.mkdtemp(path.join(os.tmpdir(), "auracall-category-"));
		vi.stubEnv("AURACALL_HOME_DIR", home);
		const directory = path.join(home, "diagnostics", "desktop-control");
		await fs.mkdir(directory, { recursive: true, mode: 0o700 });
		await fs.writeFile(path.join(directory, "enabled"), "1", { mode: 0o600 });
		const gate = new DesktopControlGate("fixture", path.join(home, "gate"));
		const held = await gate.takeControl("binding");
		const controller = new AbortController();
		const effect = vi.fn();
		try {
			const admission = gate.withAutomation("binding", effect, { abortSignal: controller.signal });
			if (aborted) controller.abort(new Error("PRIVATE-ABORT-REASON"));
			await expect(admission).rejects.toThrow("paused while a human controls");
			expect(effect).not.toHaveBeenCalled();
			await gate.assertControl(held.token, "binding");
			const files = (await fs.readdir(directory)).filter((file) => file.endsWith(".json"));
			expect(files).toHaveLength(1);
			const raw = await fs.readFile(path.join(directory, files[0]), "utf8");
			expect(raw).not.toContain("PRIVATE-ABORT-REASON");
			expect(JSON.parse(raw)).toMatchObject({ category: "human-owned", owner: { role: "human" }, cancellationSupplied: true, cancellationObserved: aborted });
		} finally {
			await gate.releaseControl(held.token, "binding");
			await fs.rm(home, { recursive: true, force: true });
		}
	},
);

test.skipIf(process.platform !== "linux")(
	"concurrent cancellation cannot relabel an admission filesystem failure",
	async () => {
		const home = await fs.mkdtemp(path.join(os.tmpdir(), "auracall-category-storage-"));
		vi.stubEnv("AURACALL_HOME_DIR", home);
		const directory = path.join(home, "diagnostics", "desktop-control");
		await fs.mkdir(directory, { recursive: true, mode: 0o700 });
		await fs.writeFile(path.join(directory, "enabled"), "1", { mode: 0o600 });
		const gate = new DesktopControlGate("fixture", path.join(home, "gate"));
		const held = await gate.takeControl("binding");
		const controller = new AbortController();
		const failure = new Error("PRIVATE-STORAGE-FAILURE");
		const readFile = fs.readFile.bind(fs);
		const read = vi.spyOn(fs, "readFile").mockImplementation((...args) => {
			if (String(args[0]).endsWith(`${path.sep}owner.json`)) {
				controller.abort(new Error("PRIVATE-ABORT-REASON"));
				return Promise.reject(failure);
			}
			return readFile(...args);
		});
		const effect = vi.fn();
		try {
			await expect(gate.withAutomation("binding", effect, { abortSignal: controller.signal }))
				.rejects.toBe(failure);
			expect(effect).not.toHaveBeenCalled();
			read.mockRestore();
			await gate.assertControl(held.token, "binding");
			const files = (await fs.readdir(directory)).filter((file) => file.endsWith(".json"));
			expect(files).toHaveLength(1);
			const raw = await fs.readFile(path.join(directory, files[0]), "utf8");
			expect(raw).not.toContain("PRIVATE-");
			expect(JSON.parse(raw)).toMatchObject({ category: "admission-error" });
		} finally {
			read.mockRestore();
			await gate.releaseControl(held.token, "binding");
			await fs.rm(home, { recursive: true, force: true });
		}
	},
);
