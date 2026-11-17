import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createFileBackedProviderInteractionLedger } from "../../packages/browser-service/src/service/interactionLedger.js";
import { resetCoordination } from "../../src/runtime/coordinationReset.js";

const now = {
	utc: "2026-11-17T02:00:00.000Z",
	earliestUtc: "2026-11-17T01:59:59.000Z",
	latestUtc: "2026-11-17T02:00:01.000Z",
	epoch: "test-epoch",
	evidenceGeneration: 1,
};
const homes: string[] = [];
async function fixture() {
	const home = await fs.mkdtemp(path.join(os.tmpdir(), "auracall-reset-"));
	homes.push(home);
	const root = path.join(home, "browser-coordination");
	await fs.mkdir(path.join(root, "provider-interactions"), { recursive: true });
	await fs.mkdir(path.join(root, "tab-leases"), { recursive: true });
	const ledger = path.join(root, "provider-interactions/provider-interactions.v1.json");
	const registry = path.join(root, "tab-leases/tab-leases.v1.json");
	const history = {
		schemaVersion: 1,
		records: [{ reservationId: "old", state: "settled", reservedAt: "2026-10-01T00:00:00Z" }],
		warnings: [],
		events: [{ occurredAt: "2026-10-01T00:00:00Z", reason: "old-private-audit" }],
	};
	const leases = {
		schemaVersion: 1,
		leases: [{ leaseId: "old", state: "lost", ownerProcessId: 2147483647 }],
		controls: [],
	};
	await fs.writeFile(ledger, JSON.stringify(history), { mode: 0o600 });
	await fs.writeFile(registry, JSON.stringify(leases), { mode: 0o600 });
	return { home, root, ledger, registry, history, leases };
}
afterEach(async () => {
	await Promise.all(homes.splice(0).map((home) => fs.rm(home, { recursive: true, force: true })));
});
// These integration tests fsync real files on shared host storage.
describe("idle coordination reset", { timeout: 30_000 }, () => {
	test("preview leaves state and directories intact", async () => {
		const f = await fixture();
		const before = await fs.readFile(f.ledger, "utf8");
		const result = await resetCoordination({ homeDir: f.home, readTime: async () => now });
		expect(result.status).toBe("preview");
		expect(await fs.readFile(f.ledger, "utf8")).toBe(before);
		await expect(fs.stat(path.join(f.home, "coordination-backups"))).rejects.toMatchObject({
			code: "ENOENT",
		});
	});
	test("apply archives exact bytes and clears old state without touching unrelated files", async () => {
		const f = await fixture();
		await fs.writeFile(path.join(f.home, "credentials"), "keep-private");
		const originals = await Promise.all([
			fs.readFile(f.ledger, "utf8"),
			fs.readFile(f.registry, "utf8"),
		]);
		const result = await resetCoordination({
			homeDir: f.home,
			apply: true,
			readTime: async () => now,
		});
		expect(result.status).toBe("reset");
		if (!result.backupPath) throw new Error("Expected backup");
		expect(result.timeSource).toBe("StableTime");
		expect(JSON.parse(await fs.readFile(f.ledger, "utf8"))).toEqual({
			schemaVersion: 1,
			records: [],
			warnings: [],
			events: [],
		});
		expect(JSON.parse(await fs.readFile(f.registry, "utf8"))).toEqual({
			schemaVersion: 1,
			leases: [],
			controls: [],
		});
		expect(
			await fs.readFile(path.join(result.backupPath, "provider-interactions.v1.json"), "utf8"),
		).toBe(originals[0]);
		expect(await fs.readFile(path.join(result.backupPath, "tab-leases.v1.json"), "utf8")).toBe(
			originals[1],
		);
		expect((await fs.stat(result.backupPath)).mode & 0o777).toBe(0o700);
		expect(
			(await fs.stat(path.join(result.backupPath, "provider-interactions.v1.json"))).mode & 0o777,
		).toBe(0o600);
		expect(await fs.readFile(path.join(f.home, "credentials"), "utf8")).toBe("keep-private");
	});
	test("live owners and held locks refuse apply without an archive or state change", async () => {
		const f = await fixture();
		f.leases.leases[0].ownerProcessId = process.pid;
		await fs.writeFile(f.registry, JSON.stringify(f.leases));
		expect(
			(await resetCoordination({ homeDir: f.home, apply: true, readTime: async () => now })).status,
		).toBe("blocked");
		f.leases.leases = [];
		await fs.writeFile(f.registry, JSON.stringify(f.leases));
		const lock = path.join(f.root, "provider-interactions/provider-interactions.lock");
		await fs.writeFile(lock, "foreign-owner");
		expect(
			(await resetCoordination({ homeDir: f.home, apply: true, readTime: async () => now })).status,
		).toBe("blocked");
		expect(await fs.readFile(lock, "utf8")).toBe("foreign-owner");
		await expect(fs.stat(path.join(f.home, "coordination-backups"))).rejects.toMatchObject({
			code: "ENOENT",
		});
	});
	test("recent usage, uncertain timestamps and active warnings survive; orphan starts become abandoned", async () => {
		const f = await fixture();
		const recent = {
			reservationId: "recent",
			state: "started",
			effectState: "outcome-unknown",
			reservedAt: "2026-11-17T01:30:00Z",
		};
		const warning = { cooldownUntil: null, reason: "provider-warning" };
		await fs.writeFile(
			f.ledger,
			JSON.stringify({
				...f.history,
				records: [...f.history.records, recent, { reservationId: "undated", state: "settled" }],
				warnings: [warning],
			}),
		);
		const result = await resetCoordination({
			homeDir: f.home,
			apply: true,
			readTime: async () => now,
		});
		expect(result.status).toBe("reset");
		const active = JSON.parse(await fs.readFile(f.ledger, "utf8"));
		expect(active.records).toEqual([
			expect.objectContaining({
				...recent,
				state: "abandoned",
				stopReason: "operator-coordination-reset",
			}),
			{ reservationId: "undated", state: "settled" },
		]);
		expect(active.warnings).toEqual([warning]);
	});
	test("unavailable StableTime cannot fall back to the WSL clock", async () => {
		const f = await fixture();
		await expect(
			resetCoordination({
				homeDir: f.home,
				apply: true,
				readTime: async () => {
					throw new Error("StableTime unavailable");
				},
			}),
		).rejects.toThrow("StableTime unavailable");
		expect(JSON.parse(await fs.readFile(f.ledger, "utf8"))).toEqual(f.history);
	});
	test("symlink state is rejected rather than archived or replaced", async () => {
		const f = await fixture();
		const outside = path.join(f.home, "outside");
		await fs.rename(f.ledger, outside);
		await fs.symlink(outside, f.ledger);
		await expect(
			resetCoordination({ homeDir: f.home, apply: true, readTime: async () => now }),
		).rejects.toThrow(/unsafe/i);
		expect(JSON.parse(await fs.readFile(outside, "utf8"))).toEqual(f.history);
	});
	test("an existing store observes replacement rather than resurrecting its cached history", async () => {
		const f = await fixture();
		const store = createFileBackedProviderInteractionLedger({ ledgerRoot: path.dirname(f.ledger) });
		expect(await store.list()).toHaveLength(1);
		expect(
			(await resetCoordination({ homeDir: f.home, apply: true, readTime: async () => now })).status,
		).toBe("reset");
		expect(await store.list()).toEqual([]);
	});
	test("partial replacement preserves exact backups and reports which file changed", async () => {
		const f = await fixture();
		const original = await fs.readFile(f.registry, "utf8");
		const rename = fs.rename.bind(fs);
		const spy = vi.spyOn(fs, "rename").mockImplementation(async (from, to) => {
			if (String(to) === f.registry)
				throw Object.assign(new Error("fixture disk failure"), { code: "EIO" });
			return rename(from, to);
		});
		try {
			const result = await resetCoordination({
				homeDir: f.home,
				apply: true,
				readTime: async () => now,
			});
			expect(result.status).toBe("partial");
			if (!result.backupPath) throw new Error("Expected partial backup");
			expect(result.appliedFiles).toEqual(["provider-interactions.v1.json"]);
			expect(await fs.readFile(f.registry, "utf8")).toBe(original);
			expect(await fs.readFile(path.join(result.backupPath, "tab-leases.v1.json"), "utf8")).toBe(
				original,
			);
			expect(
				JSON.parse(await fs.readFile(path.join(result.backupPath, "manifest.json"), "utf8")).state,
			).toBe("partial");
		} finally {
			spy.mockRestore();
		}
	});
	test("active controls remain a blocker until qualified earliest time proves expiry", async () => {
		const f = await fixture();
		await fs.writeFile(
			f.registry,
			JSON.stringify({ ...f.leases, controls: [{ state: "active", expiresAt: now.latestUtc }] }),
		);
		expect(
			(await resetCoordination({ homeDir: f.home, apply: true, readTime: async () => now }))
				.blockers,
		).toContain("profile-control-not-proven-expired");
		await fs.writeFile(
			f.registry,
			JSON.stringify({
				...f.leases,
				controls: [{ state: "active", expiresAt: "2026-11-16T00:00:00Z" }],
			}),
		);
		expect(
			(await resetCoordination({ homeDir: f.home, apply: true, readTime: async () => now })).status,
		).toBe("reset");
	});
	test("idle process bindings cannot hide a live owner behind a null active PID", async () => {
		const f = await fixture();
		await fs.writeFile(
			f.registry,
			JSON.stringify({
				...f.leases,
				leases: [
					{
						state: "idle",
						ownerProcessId: null,
						processBinding: { processId: process.pid },
						idleExpiresAt: "2026-01-01T00:00:00Z",
						absoluteExpiresAt: "2026-01-01T00:00:00Z",
					},
				],
			}),
		);
		expect(
			(await resetCoordination({ homeDir: f.home, apply: true, readTime: async () => now })).status,
		).toBe("blocked");
	});
	test("unattributed idle records require both expiries before StableTime earliest UTC", async () => {
		const f = await fixture();
		const lease = {
			state: "idle",
			ownerProcessId: null,
			processBinding: null,
			idleExpiresAt: "2026-01-01T00:00:00Z",
			absoluteExpiresAt: now.latestUtc,
		};
		await fs.writeFile(f.registry, JSON.stringify({ ...f.leases, leases: [lease] }));
		expect(
			(await resetCoordination({ homeDir: f.home, apply: true, readTime: async () => now })).status,
		).toBe("blocked");
		lease.absoluteExpiresAt = "2026-01-01T00:00:00Z";
		await fs.writeFile(f.registry, JSON.stringify({ ...f.leases, leases: [lease] }));
		expect(
			(await resetCoordination({ homeDir: f.home, apply: true, readTime: async () => now })).status,
		).toBe("reset");
	});
	test("fractional UTC expiry never rounds an active control down to earliest time", async () => {
		const f = await fixture();
		const precise = {
			...now,
			utc: "2026-11-17T02:00:00.000000200Z",
			earliestUtc: "2026-11-17T02:00:00.000000100Z",
			latestUtc: "2026-11-17T02:00:00.000000300Z",
		};
		await fs.writeFile(
			f.registry,
			JSON.stringify({
				...f.leases,
				controls: [{ state: "active", expiresAt: "2026-11-17T02:00:00.000000150Z" }],
			}),
		);
		expect(
			(await resetCoordination({ homeDir: f.home, apply: true, readTime: async () => precise }))
				.status,
		).toBe("blocked");
	});
	test("malformed snapshots fail without including private contents in errors", async () => {
		const f = await fixture();
		await fs.writeFile(f.ledger, "private-content-is-not-an-error-message");
		await expect(
			resetCoordination({ homeDir: f.home, apply: true, readTime: async () => now }),
		).rejects.toThrow("Unsafe or malformed coordination snapshot");
		expect(await fs.readFile(f.ledger, "utf8")).toBe("private-content-is-not-an-error-message");
	});
});
