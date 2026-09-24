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

	test("reports sanitized lease lifecycle and target action aggregates", async () => {
		const directory = await mkdtemp(path.join(os.tmpdir(), "auracall-tab-runtime-"));
		try {
			const runtime = createBrowserTabConcurrencyRuntime(
				{ browser: { tabConcurrencyMode: "tab-affinity" } } as never,
				{
					storageRoot: path.join(directory, "coordination"),
					now: () => new Date("2026-09-24T12:02:00.000Z"),
				},
			);
			const registry = runtime.registry;
			expect(registry).not.toBeNull();
			if (!registry) throw new Error("expected tab lease registry");

			const reserved = await registry.reserve({
				scope: {
					runtimeProfileId: "runtime-1",
					managedBrowserProfile: "managed-1",
					service: "chatgpt",
					tenantKey: "tenant-1",
				},
				targetId: "target-1",
				workload: { kind: "conversation", conversationId: "conversation-secret" },
				operationId: "operation-1",
				now: "2026-09-24T12:00:00.000Z",
				idleTtlMs: 60_000,
				absoluteTtlMs: 3_600_000,
			});
			expect(reserved.ok).toBe(true);
			if (!reserved.ok) throw new Error("expected tab lease reservation");

			const action = await registry.recordTargetAction({
				claim: reserved.value.claim,
				action: "navigation",
				occurredAt: "2026-09-24T12:00:01.000Z",
				idleTtlMs: 60_000,
			});
			expect(action.ok).toBe(true);
			if (!action.ok) throw new Error("expected target action");
			await registry.idle({
				claim: action.value.claim,
				now: "2026-09-24T12:00:02.000Z",
				effectState: "outcome-unknown",
			});

			const status = await runtime.readStatus();
			expect(status).toMatchObject({
				leaseStates: { active: 0, idle: 1, retiring: 0, released: 0, lost: 0 },
				workloads: {
					conversations: 1,
					newConversations: 0,
					liveFollow: 0,
					ephemeral: 0,
				},
				attention: { expiredIdle: 1, outcomeUnknown: 1, restartUnverified: 0 },
				bindingLifetimes: [
					{
						workloadKind: "conversation",
						state: "idle",
						effectState: "outcome-unknown",
						ageMs: 120_000,
						idleRemainingMs: 0,
						absoluteRemainingMs: 3_480_000,
						idleExpired: true,
						absoluteExpired: false,
					},
				],
				targetActions: {
					targetCreations: 0,
					adoptions: 0,
					navigations: 1,
					reloads: 0,
					focuses: 0,
					closes: 0,
				},
				retirements: { closed: 0, alreadyMissing: 0, preserved: 0 },
			});
			expect(JSON.stringify(status)).not.toContain("conversation-secret");
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
