import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { DesktopControlGate } from "../../src/browser/service/desktopControlGate.js";

afterEach(() => vi.unstubAllEnvs());

test.skipIf(process.platform !== "linux")(
	"an opted-in refused public gate call saves only private ownership metadata",
	async () => {
		const home = await fs.mkdtemp(path.join(os.tmpdir(), "auracall-control-capture-"));
		vi.stubEnv("AURACALL_HOME_DIR", home);
		const directory = path.join(home, "diagnostics", "desktop-control");
		await fs.mkdir(directory, { recursive: true, mode: 0o700 });
		await fs.writeFile(path.join(directory, "enabled"), "1\n", { mode: 0o600 });
		const gate = new DesktopControlGate("fixture", path.join(home, "gate"));
		const binding = "SECRET-BINDING-CANARY";
		const held = await gate.takeControl(binding, "SECRET-CONTROL-TOKEN-CANARY");
		const effect = vi.fn(async () => "not allowed");
		try {
			await expect(gate.withAutomation(binding, effect)).rejects.toThrow(
				"paused while a human controls",
			);
			expect(effect).not.toHaveBeenCalled();
			await gate.assertControl(held.token, binding);
			const files = (await fs.readdir(directory)).filter((f) => f.endsWith(".json"));
			expect(files).toHaveLength(1);
			const raw = await fs.readFile(path.join(directory, files[0]), "utf8");
			expect(raw).not.toContain(binding);
			expect(raw).not.toContain(held.token);
			const record = JSON.parse(raw);
			expect(Object.keys(record).sort()).toEqual(
				[
					"schemaVersion",
					"tag",
					"capturedAt",
					"category",
					"requestedRole",
					"requestedBindingSha256",
					"ownerObservedAt",
					"owner",
					"bindingsMatch",
					"inheritedScope",
					"attempts",
					"cancellationSupplied",
				].sort(),
			);
			expect(Object.keys(record.owner).sort()).toEqual(
				[
					"role",
					"pid",
					"acquiredAt",
					"bindingSha256",
					"pidPresent",
					"ownerBootVerified",
					"matchesRequesterPid",
				].sort(),
			);
			expect(record).toMatchObject({
				schemaVersion: 1,
				tag: "DEBUG-desktop-control-busy",
				category: "human-owned",
				requestedRole: "automation",
				owner: { role: "human", pid: process.pid, pidPresent: true, ownerBootVerified: false },
				bindingsMatch: true,
				attempts: 1,
				cancellationSupplied: false,
				inheritedScope: { present: false, matchesRequesterPid: false },
			});
			expect(record.requestedBindingSha256).toMatch(/^[a-f0-9]{64}$/);
			expect(record.owner.bindingSha256).toBe(record.requestedBindingSha256);
			expect((await fs.stat(path.join(directory, files[0]))).mode & 0o777).toBe(0o600);
			expect(Buffer.byteLength(raw)).toBeLessThan(4096);
		} finally {
			await gate.releaseControl(held.token, binding);
			await fs.rm(home, { recursive: true, force: true });
		}
	},
);

test.skipIf(process.platform !== "linux")(
	"terminal automation contention records one refusal without changing the held owner",
	async () => {
		const home = await fs.mkdtemp(path.join(os.tmpdir(), "auracall-control-busy-"));
		vi.stubEnv("AURACALL_HOME_DIR", home);
		const directory = path.join(home, "diagnostics", "desktop-control");
		await fs.mkdir(directory, { recursive: true, mode: 0o700 });
		await fs.writeFile(path.join(directory, "enabled"), "1", { mode: 0o600 });
		const gate = new DesktopControlGate("fixture", path.join(home, "gate"));
		const held = await gate.holdAutomation("SECRET-OWNER-BINDING");
		const effect = vi.fn();
		try {
			await expect(gate.withAutomation("SECRET-REQUEST-BINDING", effect)).rejects.toThrow(
				"Desktop control is busy",
			);
			expect(effect).not.toHaveBeenCalled();
			await expect(held.run(async () => "still owned")).resolves.toBe("still owned");
			const files = (await fs.readdir(directory)).filter((f) => f.endsWith(".json"));
			expect(files).toHaveLength(1);
			const raw = await fs.readFile(path.join(directory, files[0]), "utf8");
			expect(raw).not.toContain("SECRET-");
			expect(JSON.parse(raw)).toMatchObject({
				category: "busy",
				attempts: 100,
				bindingsMatch: false,
				owner: { role: "automation", pid: process.pid },
			});
		} finally {
			await held.close();
			await fs.rm(home, { recursive: true, force: true });
		}
	},
	10000,
);

test.skipIf(process.platform !== "linux")(
	"cancelled contention captures the last observed owner without recording abort reasons",
	async () => {
		const home = await fs.mkdtemp(path.join(os.tmpdir(), "auracall-control-cancel-"));
		vi.stubEnv("AURACALL_HOME_DIR", home);
		const directory = path.join(home, "diagnostics", "desktop-control");
		await fs.mkdir(directory, { recursive: true, mode: 0o700 });
		await fs.writeFile(path.join(directory, "enabled"), "1", { mode: 0o600 });
		const gate = new DesktopControlGate("fixture", path.join(home, "gate"));
		const held = await gate.holdAutomation("SECRET-OWNER");
		const controller = new AbortController();
		const effect = vi.fn();
		const timer = setTimeout(() => controller.abort(new Error("SECRET-ABORT-REASON")), 100);
		try {
			await expect(
				gate.withAutomation("SECRET-REQUEST", effect, { abortSignal: controller.signal }),
			).rejects.toThrow();
			expect(effect).not.toHaveBeenCalled();
			await expect(held.run(async () => "still owned")).resolves.toBe("still owned");
			const files = (await fs.readdir(directory)).filter((f) => f.endsWith(".json"));
			expect(files).toHaveLength(1);
			const raw = await fs.readFile(path.join(directory, files[0]), "utf8");
			expect(raw).not.toContain("SECRET-");
			expect(JSON.parse(raw)).toMatchObject({
				category: "cancelled",
				cancellationSupplied: true,
				owner: { role: "automation" },
			});
		} finally {
			clearTimeout(timer);
			await held.close();
			await fs.rm(home, { recursive: true, force: true });
		}
	},
);

test.skipIf(process.platform !== "linux")(
	"a rejected inherited scope records booleans without its control identity",
	async () => {
		const home = await fs.mkdtemp(path.join(os.tmpdir(), "auracall-control-inherited-"));
		vi.stubEnv("AURACALL_HOME_DIR", home);
		const directory = path.join(home, "diagnostics", "desktop-control");
		await fs.mkdir(directory, { recursive: true, mode: 0o700 });
		await fs.writeFile(path.join(directory, "enabled"), "1", { mode: 0o600 });
		const gate = new DesktopControlGate("fixture", path.join(home, "gate"));
		try {
			await gate.withAutomation("SECRET-OWNER", async () => {
				const effect = vi.fn();
				await expect(gate.withAutomation("SECRET-OTHER", effect)).rejects.toThrow(
					"ownership changed",
				);
				expect(effect).not.toHaveBeenCalled();
				await expect(gate.withAutomation("SECRET-OWNER", async () => "owned")).resolves.toBe(
					"owned",
				);
			});
			const files = (await fs.readdir(directory)).filter((f) => f.endsWith(".json"));
			expect(files).toHaveLength(1);
			const raw = await fs.readFile(path.join(directory, files[0]), "utf8");
			expect(raw).not.toContain("SECRET-");
			expect(JSON.parse(raw)).toMatchObject({
				category: "stale-scope",
				attempts: 0,
				inheritedScope: { present: true, matchesRequesterPid: true },
				bindingsMatch: false,
			});
		} finally {
			await fs.rm(home, { recursive: true, force: true });
		}
	},
);

test.skipIf(process.platform !== "linux")(
	"capture is off without opt-in and successful admission creates no failure receipt",
	async () => {
		const home = await fs.mkdtemp(path.join(os.tmpdir(), "auracall-control-off-"));
		vi.stubEnv("AURACALL_HOME_DIR", home);
		const directory = path.join(home, "diagnostics", "desktop-control");
		const gate = new DesktopControlGate("fixture", path.join(home, "gate"));
		try {
			const held = await gate.takeControl("binding");
			try {
				await expect(gate.withAutomation("binding", vi.fn())).rejects.toThrow("paused");
			} finally {
				await gate.releaseControl(held.token, "binding");
			}
			await expect(fs.access(directory)).rejects.toMatchObject({ code: "ENOENT" });
			await fs.mkdir(directory, { recursive: true, mode: 0o700 });
			await fs.writeFile(path.join(directory, "enabled"), "1", { mode: 0o600 });
			await expect(gate.withAutomation("binding", async () => "success")).resolves.toBe("success");
			expect((await fs.readdir(directory)).filter((f) => f.endsWith(".json"))).toEqual([]);
		} finally {
			await fs.rm(home, { recursive: true, force: true });
		}
	},
);

test.skipIf(process.platform !== "linux")(
	"a nonprivate or symlink opt-in cannot enable capture",
	async () => {
		const home = await fs.mkdtemp(path.join(os.tmpdir(), "auracall-control-optin-"));
		vi.stubEnv("AURACALL_HOME_DIR", home);
		const directory = path.join(home, "diagnostics", "desktop-control");
		await fs.mkdir(directory, { recursive: true, mode: 0o700 });
		const marker = path.join(directory, "enabled");
		const gate = new DesktopControlGate("fixture", path.join(home, "gate"));
		const held = await gate.takeControl("binding");
		try {
			await fs.writeFile(marker, "1", { mode: 0o644 });
			await fs.chmod(marker, 0o644);
			await expect(gate.withAutomation("binding", vi.fn())).rejects.toThrow("paused");
			await fs.unlink(marker);
			const target = path.join(home, "other-marker");
			await fs.writeFile(target, "1", { mode: 0o600 });
			await fs.symlink(target, marker);
			await expect(gate.withAutomation("binding", vi.fn())).rejects.toThrow("paused");
			expect((await fs.readdir(directory)).filter((f) => f.endsWith(".json"))).toEqual([]);
			await gate.assertControl(held.token, "binding");
		} finally {
			await gate.releaseControl(held.token, "binding");
			await fs.rm(home, { recursive: true, force: true });
		}
	},
);

test.skipIf(process.platform !== "linux" || process.getuid?.() === 0)(
	"an unwritable diagnostic sink cannot mask the original refusal or release ownership",
	async () => {
		const home = await fs.mkdtemp(path.join(os.tmpdir(), "auracall-control-sink-"));
		vi.stubEnv("AURACALL_HOME_DIR", home);
		const directory = path.join(home, "diagnostics", "desktop-control");
		await fs.mkdir(directory, { recursive: true, mode: 0o700 });
		await fs.writeFile(path.join(directory, "enabled"), "1", { mode: 0o600 });
		const gate = new DesktopControlGate("fixture", path.join(home, "gate"));
		const held = await gate.takeControl("binding");
		try {
			await fs.chmod(directory, 0o500);
			await expect(gate.withAutomation("binding", vi.fn())).rejects.toThrow(
				"paused while a human controls",
			);
			await gate.assertControl(held.token, "binding");
			expect((await fs.readdir(directory)).filter((f) => f.endsWith(".json"))).toEqual([]);
		} finally {
			await fs.chmod(directory, 0o700);
			await gate.releaseControl(held.token, "binding");
			await fs.rm(home, { recursive: true, force: true });
		}
	},
);
