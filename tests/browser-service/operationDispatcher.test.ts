import { describe, expect, test } from "vitest";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import {
	buildBrowserOperationKey,
	createBrowserOperationDispatcher,
	createFileBackedBrowserOperationDispatcher,
} from "../../packages/browser-service/src/service/operationDispatcher.js";

describe("operationDispatcher (package)", () => {
	test("builds stable managed browser profile operation keys", () => {
		const key = buildBrowserOperationKey({
			managedProfileDir: "./.tmp/Profile",
			serviceTarget: " Grok ",
		});

		expect(key).toBe(`managed-profile:${path.resolve("./.tmp/Profile")}::service:grok`);
	});

	test("builds stable raw DevTools endpoint operation keys", () => {
		const key = buildBrowserOperationKey({
			rawDevTools: { host: " LOCALHOST ", port: 45013 },
		});

		expect(key).toBe("devtools:localhost:45013");
	});

	test("serializes conflicting in-process operations for the same key", async () => {
		const dispatcher = createBrowserOperationDispatcher({
			isOwnerAlive: () => true,
		});

		const first = await dispatcher.acquire({
			managedProfileDir: "/tmp/aura/default/grok",
			serviceTarget: "grok",
			kind: "login",
			operationClass: "exclusive-human",
			ownerPid: 100,
			devTools: { host: "127.0.0.1", port: 9222 },
		});
		expect(first.acquired).toBe(true);

		const second = await dispatcher.acquire({
			managedProfileDir: "/tmp/aura/default/grok",
			serviceTarget: "grok",
			kind: "browser-execution",
			operationClass: "exclusive-mutating",
			ownerPid: 101,
		});
		expect(second.acquired).toBe(false);
		if (!second.acquired) {
			expect(second.blockedBy).toMatchObject({
				kind: "login",
				operationClass: "exclusive-human",
				ownerPid: 100,
				devTools: { host: "127.0.0.1", port: 9222 },
			});
			expect(second.recovery).toContain("active browser operation");
		}

		if (first.acquired) {
			await first.release();
		}

		const third = await dispatcher.acquire({
			managedProfileDir: "/tmp/aura/default/grok",
			serviceTarget: "grok",
			kind: "browser-execution",
			operationClass: "exclusive-mutating",
			ownerPid: 101,
		});
		expect(third.acquired).toBe(true);
		if (third.acquired) {
			await third.release();
		}
	});

	test("queued in-process acquisition waits for the active operation to release", async () => {
		const dispatcher = createBrowserOperationDispatcher({
			isOwnerAlive: () => true,
		});
		const first = await dispatcher.acquire({
			managedProfileDir: "/tmp/aura/default/grok",
			serviceTarget: "grok",
			kind: "browser-execution",
			operationClass: "exclusive-mutating",
			ownerPid: 110,
		});
		expect(first.acquired).toBe(true);
		if (!first.acquired) return;
		const blocked: Array<{ attempt: number; kind: string }> = [];

		const queued = dispatcher.acquireQueued({
			managedProfileDir: "/tmp/aura/default/grok",
			serviceTarget: "grok",
			kind: "features",
			operationClass: "exclusive-probe",
			ownerPid: 111,
		}, {
			timeoutMs: 100,
			pollMs: 5,
			onBlocked: async (result, context) => {
				blocked.push({ attempt: context.attempt, kind: result.blockedBy.kind });
				if (context.attempt === 1) {
					await first.release();
				}
			},
		});

		const acquired = await queued;
		expect(acquired.acquired).toBe(true);
		expect(blocked).toEqual([{ attempt: 1, kind: "browser-execution" }]);
		if (acquired.acquired) {
			expect(acquired.operation.kind).toBe("features");
			await acquired.release();
		}
	});

	test("queued in-process acquisition returns the last busy result after timeout", async () => {
		const dispatcher = createBrowserOperationDispatcher({
			isOwnerAlive: () => true,
		});
		const first = await dispatcher.acquire({
			managedProfileDir: "/tmp/aura/default/gemini",
			serviceTarget: "gemini",
			kind: "setup",
			operationClass: "exclusive-human",
			ownerPid: 120,
		});
		expect(first.acquired).toBe(true);

		const queued = await dispatcher.acquireQueued({
			managedProfileDir: "/tmp/aura/default/gemini",
			serviceTarget: "gemini",
			kind: "browser-execution",
			operationClass: "exclusive-mutating",
			ownerPid: 121,
		}, {
			timeoutMs: 0,
			pollMs: 1,
		});

		expect(queued.acquired).toBe(false);
		if (!queued.acquired) {
			expect(queued.blockedBy.kind).toBe("setup");
			expect(queued.recovery).toContain("active browser operation");
		}
		if (first.acquired) {
			await first.release();
		}
	});

	test("prunes stale in-process owners before acquiring", async () => {
		const dispatcher = createBrowserOperationDispatcher({
			isOwnerAlive: (pid) => pid !== 100,
		});

		const stale = await dispatcher.acquire({
			managedProfileDir: "/tmp/aura/default/chatgpt",
			serviceTarget: "chatgpt",
			kind: "doctor",
			operationClass: "exclusive-probe",
			ownerPid: 100,
		});
		expect(stale.acquired).toBe(true);

		const replacement = await dispatcher.acquire({
			managedProfileDir: "/tmp/aura/default/chatgpt",
			serviceTarget: "chatgpt",
			kind: "features",
			operationClass: "exclusive-probe",
			ownerPid: 101,
		});
		expect(replacement.acquired).toBe(true);
		if (replacement.acquired) {
			expect(replacement.operation.kind).toBe("features");
			await replacement.release();
		}
	});

	test("serializes conflicting operations across dispatcher instances with file locks", async () => {
		const dir = await mkdtemp(path.join(os.tmpdir(), "browser-operation-dispatcher-"));
		try {
			const firstDispatcher = createFileBackedBrowserOperationDispatcher({
				lockRoot: dir,
				isOwnerAlive: () => true,
			});
			const secondDispatcher = createFileBackedBrowserOperationDispatcher({
				lockRoot: dir,
				isOwnerAlive: () => true,
			});

			const first = await firstDispatcher.acquire({
				managedProfileDir: "/tmp/aura/default/gemini",
				serviceTarget: "gemini",
				kind: "setup",
				operationClass: "exclusive-human",
				ownerPid: 200,
			});
			expect(first.acquired).toBe(true);

			const second = await secondDispatcher.acquire({
				managedProfileDir: "/tmp/aura/default/gemini",
				serviceTarget: "gemini",
				kind: "doctor",
				operationClass: "exclusive-probe",
				ownerPid: 201,
			});
			expect(second.acquired).toBe(false);
			if (!second.acquired) {
				expect(second.blockedBy).toMatchObject({
					kind: "setup",
					operationClass: "exclusive-human",
					ownerPid: 200,
				});
			}

			if (first.acquired) {
				await first.release();
			}
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	test("queued file-backed acquisition waits across dispatcher instances", async () => {
		const dir = await mkdtemp(path.join(os.tmpdir(), "browser-operation-queue-"));
		try {
			const firstDispatcher = createFileBackedBrowserOperationDispatcher({
				lockRoot: dir,
				isOwnerAlive: () => true,
			});
			const secondDispatcher = createFileBackedBrowserOperationDispatcher({
				lockRoot: dir,
				isOwnerAlive: () => true,
			});
			const first = await firstDispatcher.acquire({
				managedProfileDir: "/tmp/aura/default/chatgpt",
				serviceTarget: "chatgpt",
				kind: "browser-execution",
				operationClass: "exclusive-mutating",
				ownerPid: 220,
			});
			expect(first.acquired).toBe(true);
			if (!first.acquired) return;

			const queued = secondDispatcher.acquireQueued({
				managedProfileDir: "/tmp/aura/default/chatgpt",
				serviceTarget: "chatgpt",
				kind: "doctor",
				operationClass: "exclusive-probe",
				ownerPid: 221,
			}, {
				timeoutMs: 100,
				pollMs: 5,
				onBlocked: async (_result, context) => {
					if (context.attempt === 1) {
						await first.release();
					}
				},
			});

			const acquired = await queued;
			expect(acquired.acquired).toBe(true);
			if (acquired.acquired) {
				expect(acquired.operation.kind).toBe("doctor");
				await acquired.release();
			}
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	test("serializes raw DevTools endpoint operations", async () => {
		const dispatcher = createBrowserOperationDispatcher({
			isOwnerAlive: () => true,
		});

		const first = await dispatcher.acquire({
			rawDevTools: { host: "127.0.0.1", port: 45013 },
			kind: "browser-tools",
			operationClass: "exclusive-probe",
			ownerPid: 300,
			devTools: { host: "127.0.0.1", port: 45013 },
		});
		expect(first.acquired).toBe(true);

		const second = await dispatcher.acquire({
			rawDevTools: { host: "127.0.0.1", port: 45013 },
			kind: "browser-execution",
			operationClass: "exclusive-mutating",
			ownerPid: 301,
		});
		expect(second.acquired).toBe(false);
		if (!second.acquired) {
			expect(second.key).toBe("devtools:127.0.0.1:45013");
			expect(second.blockedBy).toMatchObject({
				kind: "browser-tools",
				serviceTarget: "raw-devtools",
				rawDevTools: { host: "127.0.0.1", port: 45013 },
			});
		}

		if (first.acquired) {
			await first.release();
		}
	});
});
