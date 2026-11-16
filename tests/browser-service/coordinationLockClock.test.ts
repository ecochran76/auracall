import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";
import { createFileBackedProviderInteractionLedger } from "../../packages/browser-service/src/service/interactionLedger.js";
import { createFileBackedBrowserTabLeaseRegistry } from "../../packages/browser-service/src/service/tabLeaseRegistry.js";

describe("coordination lock elapsed time", () => {
	test.each([
		"interaction",
		"tab",
	] as const)("%s wait survives a forward wall-clock adjustment", async (kind) => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), "auracall-lock-clock-"));
		const filename =
			kind === "interaction" ? "provider-interactions.v1.json" : "tab-leases.v1.json";
		const statePath = path.join(root, filename);
		const lockPath = path.join(
			root,
			kind === "interaction" ? "provider-interactions.lock" : "tab-leases.lock",
		);
		const snapshot =
			kind === "interaction"
				? { schemaVersion: 1, records: [], warnings: [], events: [] }
				: { schemaVersion: 1, leases: [], controls: [] };
		await fs.writeFile(statePath, JSON.stringify(snapshot));
		let release!: () => void;
		let entered!: () => void;
		const paused = new Promise<void>((resolve) => {
			release = resolve;
		});
		const loaded = new Promise<void>((resolve) => {
			entered = resolve;
		});
		const read = fs.readFile.bind(fs);
		const now = Date.now.bind(Date);
		let offset = 0;
		let first = true;
		let jumped = false;
		const clock = vi.spyOn(Date, "now").mockImplementation(() => now() + offset);
		const reader = vi
			.spyOn(fs, "readFile")
			.mockImplementation(async (...args: Parameters<typeof fs.readFile>) => {
				if (String(args[0]) === statePath && first) {
					first = false;
					entered();
					await paused;
				}
				const value = await read(...args);
				if (String(args[0]) === lockPath && !jumped) {
					jumped = true;
					offset = 60_000;
					// Real owner remains live. Release during the next short poll, well inside its budget.
					setTimeout(release, 10);
				}
				return value;
			});
		const run = (id: string) =>
			kind === "interaction"
				? createFileBackedProviderInteractionLedger({
						ledgerRoot: root,
						lockTimeoutMs: 1000,
						lockPollMs: 1,
					}).list()
				: createFileBackedBrowserTabLeaseRegistry({
						registryRoot: root,
						lockTimeoutMs: 1000,
						lockPollMs: 1,
					}).reserve({
						scope: {
							runtimeProfileId: "clock-fixture",
							managedBrowserProfile: "clock-fixture",
							service: "chatgpt",
							tenantKey: "clock-fixture",
						},
						targetId: id,
						workload: { kind: "live-follow", operationId: id },
						operationId: id,
						now: "2026-11-16T12:00:00Z",
						idleTtlMs: 1000,
						absoluteTtlMs: 2000,
						processBound: true,
					});
		const expected = kind === "interaction" ? [] : expect.objectContaining({ ok: true });
		const owner = run("owner");
		let peer: Promise<unknown> | undefined;
		try {
			await loaded;
			peer = run("peer");
			await expect(peer).resolves.toEqual(
				kind === "interaction"
					? []
					: expect.objectContaining({
							ok: false,
							conflict: expect.objectContaining({ kind: "process-owned" }),
						}),
			);
			expect(jumped).toBe(true);
			await expect(owner).resolves.toEqual(expected);
		} finally {
			release();
			await Promise.allSettled([owner, ...(peer ? [peer] : [])]);
			reader.mockRestore();
			clock.mockRestore();
			await fs.rm(root, { recursive: true, force: true });
		}
	});
	test("a frozen wall clock does not extend the real wait budget or reclaim a live owner", async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), "auracall-lock-clock-bound-"));
		const lock = path.join(root, "provider-interactions.lock");
		const metadata = JSON.stringify({
			ownerPid: process.pid,
			acquiredAt: new Date().toISOString(),
		});
		await fs.writeFile(lock, metadata);
		const clock = vi.spyOn(Date, "now").mockReturnValue(42);
		const operation = createFileBackedProviderInteractionLedger({
			ledgerRoot: root,
			lockTimeoutMs: 20,
			lockPollMs: 1,
		}).list();
		let timer: ReturnType<typeof setTimeout> | undefined;
		try {
			const outcome = await Promise.race([
				operation.then(
					() => "unexpected acquisition",
					(error) => String(error.message),
				),
				new Promise<string>((resolve) => {
					timer = setTimeout(() => resolve("wait budget did not expire"), 500);
				}),
			]);
			expect(outcome).toContain("Timed out waiting for provider interaction ledger lock");
			expect(await fs.readFile(lock, "utf8")).toBe(metadata);
		} finally {
			if (timer) clearTimeout(timer);
			clock.mockRestore();
			await fs.rm(lock, { force: true });
			await Promise.allSettled([operation]);
			await fs.rm(root, { recursive: true, force: true });
		}
	});
});
