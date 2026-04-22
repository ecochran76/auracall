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
});
