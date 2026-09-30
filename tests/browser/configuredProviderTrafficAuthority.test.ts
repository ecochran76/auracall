import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

import { setAuracallHomeDirOverrideForTest } from "../../src/auracallHome.js";
import { createConfiguredProviderTrafficAuthorityFactory } from "../../src/browser/configuredProviderTrafficAuthority.js";
import { createBrowserTabConcurrencyRuntime } from "../../src/browser/tabConcurrencyRuntime.js";

afterEach(() => {
	setAuracallHomeDirOverrideForTest(null);
});

describe("configured provider traffic authority", () => {
	test("gives serialized provider clients an exact persisted lease and releases it on close", async () => {
		const directory = await mkdtemp(path.join(os.tmpdir(), "auracall-provider-traffic-"));
		try {
			setAuracallHomeDirOverrideForTest(directory);
			const records: Array<{ phase: string; targetId?: string | null }> = [];
			const config = {
				auracallProfile: "runtime-1",
				browser: { tabConcurrencyMode: "serialized" },
			} as never;
			const factory = createConfiguredProviderTrafficAuthorityFactory({
				userConfig: config,
				provider: "gemini",
				managedBrowserProfile: "/managed/gemini",
				mutationAudit: (record) => {
					records.push(record);
				},
				baseOptions: {},
			});

			const authority = await factory.acquire({ targetId: "target-1" });
			const action = await authority.governor.begin({
				kind: "navigate",
				interactionClass: "renavigation",
				source: "test:gemini",
				targetId: "target-1",
			});
			await action.settle({ outcome: "succeeded", targetId: "target-1" });
			await authority.close();

			expect(records).toEqual([
				expect.objectContaining({ phase: "start", targetId: "target-1" }),
				expect.objectContaining({ phase: "complete", targetId: "target-1" }),
			]);
			const status = await createBrowserTabConcurrencyRuntime(config).readStatus();
			expect(status).toMatchObject({
				mode: "serialized",
				enabled: false,
				leaseCount: 1,
				fencedLeaseCount: 0,
				interactionCount: 1,
				activeInteractionCount: 0,
				leaseStates: { released: 1 },
			});
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	test("client attachment closes authority exactly once", async () => {
		const close = vi.fn(async () => undefined);
		const authorityClose = vi.fn(async () => undefined);
		const acquire = vi.fn(async () => ({
			governor: { attribution: {} as never, begin: vi.fn() },
			close: authorityClose,
		}));
		const { annotateClientMutationContext } = await import(
			"../../src/browser/providers/mutationAudit.js"
		);
		const client = { close } as never;
		await annotateClientMutationContext(
			client,
			{
				providerTrafficRequired: true,
				providerTrafficAuthorityFactory: { acquire },
			},
			"provider:gemini",
			"target-1",
		);

		await (client as { close: () => Promise<void> }).close();
		await (client as { close: () => Promise<void> }).close();
		expect(acquire).toHaveBeenCalledOnce();
		expect(close).toHaveBeenCalledOnce();
		expect(authorityClose).toHaveBeenCalledOnce();
	});
});
