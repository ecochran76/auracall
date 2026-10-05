import { expect, test } from "vitest";
import { createInMemoryBrowserTabLeaseRegistry } from "../../packages/browser-service/src/service/tabLeaseRegistry.js";
import { registerUnownedBrowserTabDeadlines } from "../../packages/browser-service/src/service/tabInventory.js";

test("all unowned pages get a persistent deadline without renewing it on the next census", async () => {
	const registry = createInMemoryBrowserTabLeaseRegistry();
	const scope = {
		runtimeProfileId: "runtime",
		managedBrowserProfile: "/managed/chatgpt",
		service: "chatgpt",
		tenantKey: "tenant",
	};
	const targets = [
		{ targetId: "blank", url: "about:blank" },
		{ targetId: "external", url: "https://example.com/" },
		{ targetId: "restored", url: "https://chatgpt.com/c/restored" },
	];
	await registerUnownedBrowserTabDeadlines({
		registry,
		scope,
		targets,
		now: () => new Date("2026-10-05T11:00:00Z"),
		ttlMs: 300_000,
	});
	expect((await registry.list()).map((lease) => lease.idleExpiresAt)).toEqual(
		Array(3).fill("2026-10-05T11:05:00.000Z"),
	);
	await registerUnownedBrowserTabDeadlines({
		registry,
		scope,
		targets,
		now: () => new Date("2026-10-05T11:04:00Z"),
		ttlMs: 300_000,
	});
	expect(await registry.list()).toHaveLength(3);
	expect((await registry.list()).map((lease) => lease.idleExpiresAt)).toEqual(
		Array(3).fill("2026-10-05T11:05:00.000Z"),
	);
});
