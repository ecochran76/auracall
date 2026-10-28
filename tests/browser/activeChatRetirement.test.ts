import { expect, test, vi } from "vitest";
import { createInMemoryBrowserTabLeaseRegistry } from "../../packages/browser-service/src/service/tabLeaseRegistry.js";
import { runConfiguredChatgptTabMaintenance } from "../../src/browser/configuredChatgptTabMaintenance.js";

test.each([
	["active", "idle"],
	["unknown", "idle"],
	["active", "lost"],
	["unknown", "lost"],
	["inactive", "idle"],
] as const)("handles an expired %s response in a %s lease", async (activity, state) => {
	const registry = createInMemoryBrowserTabLeaseRegistry();
	let now = "2026-10-10T00:00:00Z";
	let live = true;
	const closeTarget = vi.fn(async () => {
		live = false;
	});
	const run = () =>
		runConfiguredChatgptTabMaintenance({
			userConfig: {
				browser: { tabConcurrencyMode: "tab-affinity" },
				profiles: {
					fixture: {
						browser: { tabConcurrencyMode: "tab-affinity" },
						services: { chatgpt: { identity: { accountId: "fixture" } } },
					},
				},
			} as never,
			now: () => new Date(now),
			deps: {
				createRuntime: () => ({ registry }),
				createBrowserService: () => ({
					resolveServiceTarget: async () => ({
						host: "127.0.0.1",
						port: 9222,
						managedBrowserProfile: "/fixture/chatgpt",
					}),
				}),
				listTargets: async () =>
					(live
						? [{ id: "active-chat", url: "https://chatgpt.com/c/fixture", type: "page" }]
						: []) as never,
				closeTarget,
				probeActivity: async () => activity,
			} as never,
		});
	const reserved=await registry.reserve({scope:{runtimeProfileId:"fixture",managedBrowserProfile:"/fixture/chatgpt",service:"chatgpt",tenantKey:"service-account:chatgpt:account-id=fixture"},targetId:"active-chat",workload:{kind:"conversation",conversationId:"fixture"},operationId:"fixture-owned",now,idleTtlMs:300_000,absoluteTtlMs:300_000,targetFingerprint:"https://chatgpt.com/c/fixture"});
	if (!reserved.ok) throw new Error("fixture reservation failed");
	await registry.idle({claim:reserved.value.claim,now,effectState:"settled"});
	await run();
	if (state === "lost") {
		const lease = (await registry.list())[0];
		await registry.markLost({
			leaseId: lease.leaseId,
			expectedRevision: lease.revision,
			now,
			reason: "restart-unverified",
		});
	}
	now = "2026-10-10T00:05:01Z";
	await run();
	expect(closeTarget).toHaveBeenCalledTimes(activity === "inactive" ? 1 : 0);
	expect((await registry.list())[0].actionCounts.closes).toBe(activity === "inactive" ? 1 : 0);
});

test.each([
	["active", "idle"],
	["unknown", "idle"],
	["active", "lost"],
	["unknown", "lost"],
] as const)("a preserved %s lost tab does not prevent expiry of another dormant %s tab", async (activity, dormantState) => {
	const registry = createInMemoryBrowserTabLeaseRegistry();
	const scope = {
		runtimeProfileId: "fixture",
		managedBrowserProfile: "/fixture/chatgpt",
		service: "chatgpt",
		tenantKey: "service-account:chatgpt:account-id=fixture",
	};
	for (const targetId of ["preserved", "dormant"]) {
		const reserved = await registry.reserve({
			scope,
			targetId,
			workload: { kind: "ephemeral", operationId: targetId },
			operationId: targetId,
			now: "2026-10-10T00:00:00Z",
			idleTtlMs: 60000,
			absoluteTtlMs: 3600000,
			targetFingerprint: "https://chatgpt.com/",
		});
		if (!reserved.ok) throw new Error("reserve failed");
		if (targetId === "preserved" || dormantState === "lost")
			await registry.markLost({
				leaseId: reserved.value.lease.leaseId,
				expectedRevision: reserved.value.lease.revision,
				now: "2026-10-10T00:01:01Z",
				reason: "restart-unverified",
			});
		else
			await registry.idle({
				claim: reserved.value.claim,
				now: "2026-10-10T00:00:01Z",
				effectState: "settled",
			});
	}
	const live = new Set(["preserved", "dormant"]);
	const closeTarget = vi.fn(async (_host, _port, targetId) => {
		live.delete(targetId);
	});
	const summary = await runConfiguredChatgptTabMaintenance({
		userConfig: {
			browser: { tabConcurrencyMode: "tab-affinity" },
			profiles: {
				fixture: {
					browser: { tabConcurrencyMode: "tab-affinity" },
					services: { chatgpt: { identity: { accountId: "fixture" } } },
				},
			},
		} as never,
		now: () => new Date("2026-10-10T00:05:01Z"),
		deps: {
			createRuntime: () => ({ registry }),
			createBrowserService: () => ({
				resolveServiceTarget: async () => ({
					host: "127.0.0.1",
					port: 9222,
					managedBrowserProfile: "/fixture/chatgpt",
				}),
			}),
			listTargets: async () =>
				[...live].map((id) => ({ id, url: "https://chatgpt.com/", type: "page" })) as never,
			probeActivity: async (_endpoint, targetId) =>
				targetId === "preserved" ? activity : "inactive",
			closeTarget,
		},
	});
	expect([...live]).toEqual(["preserved"]);
	expect(summary.closedCount).toBe(1);
	expect(summary.restartPreservedCount).toBe(1);
	expect(summary.errors).toEqual([
		{
			runtimeProfileId: "fixture",
			message: `tab-retirement-deferred: provider-activity-${activity}`,
		},
	]);
	expect(closeTarget).toHaveBeenCalledTimes(1);
});
