import { access, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { setAuracallHomeDirOverrideForTest } from "../../src/auracallHome.js";
import { BrowserAutomationClient } from "../../src/browser/client.js";
import { createBrowserTabConcurrencyRuntime } from "../../src/browser/tabConcurrencyRuntime.js";

afterEach(() => {
	setAuracallHomeDirOverrideForTest(null);
});

describe("browser tab concurrency runtime", () => {
	test("keeps serialized mode as the no-storage default", async () => {
		const directory = await mkdtemp(path.join(os.tmpdir(), "auracall-tab-runtime-"));
		try {
			setAuracallHomeDirOverrideForTest(directory);
			const runtime = createBrowserTabConcurrencyRuntime({ browser: {} } as never);

			expect(runtime).toMatchObject({
				mode: "serialized",
				enabled: false,
				registry: null,
				ledger: null,
			});
			await expect(access(path.join(directory, "browser-coordination"))).rejects.toThrow();
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	test("constructs shared durable coordination stores only for explicit affinity mode", async () => {
		const directory = await mkdtemp(path.join(os.tmpdir(), "auracall-tab-runtime-"));
		try {
			setAuracallHomeDirOverrideForTest(directory);
			const runtime = createBrowserTabConcurrencyRuntime({
				browser: { tabConcurrencyMode: "tab-affinity" },
			} as never);

			expect(runtime).toMatchObject({
				mode: "tab-affinity",
				enabled: true,
				storageRoot: path.join(directory, "browser-coordination"),
			});
			expect(runtime.registry).not.toBeNull();
			expect(runtime.ledger).not.toBeNull();

			const lease = await runtime.registry?.reserve({
				scope: {
					runtimeProfileId: "runtime-1",
					managedBrowserProfile: "managed-1",
					service: "chatgpt",
					tenantKey: "tenant-1",
				},
				targetId: "target-1",
				workload: { kind: "conversation", conversationId: "conversation-1" },
				operationId: "operation-1",
				now: "2026-09-24T12:00:00.000Z",
				idleTtlMs: 60_000,
				absoluteTtlMs: 3_600_000,
			});
			expect(lease?.ok).toBe(true);
			expect(await runtime.readStatus()).toMatchObject({
				mode: "tab-affinity",
				enabled: true,
				leaseCount: 1,
				interactionCount: 0,
			});
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	test("publishes resolved mode status from the production browser client factory", async () => {
		const directory = await mkdtemp(path.join(os.tmpdir(), "auracall-tab-client-"));
		try {
			setAuracallHomeDirOverrideForTest(directory);
			const client = await BrowserAutomationClient.fromConfig(
				{
					browser: { target: "chatgpt", tabConcurrencyMode: "tab-affinity" },
				} as never,
				{ target: "chatgpt" },
			);

			expect(await client.getTabConcurrencyStatus()).toMatchObject({
				mode: "tab-affinity",
				enabled: true,
				leaseCount: 0,
				interactionCount: 0,
			});
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});
});
