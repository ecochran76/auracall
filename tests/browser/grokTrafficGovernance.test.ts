// biome-ignore-all lint/style/useNamingConvention: CDP protocol domain names are case-sensitive.
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { setAuracallHomeDirOverrideForTest } from "../../src/auracallHome.js";
import { createConfiguredProviderTrafficAuthorityFactory } from "../../src/browser/configuredProviderTrafficAuthority.js";

const connection = vi.hoisted(() => ({ connect: vi.fn() }));
vi.mock("../../packages/browser-service/src/chromeLifecycle.js", async (original) => ({
	...(await original<typeof import("../../packages/browser-service/src/chromeLifecycle.js")>()),
	connectToChromeTarget: connection.connect,
}));

const roots: string[] = [];
afterEach(async () => {
	setAuracallHomeDirOverrideForTest(null);
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("Grok public traffic authority shares operation capacity across runtime profiles", async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), "grok-traffic-"));
	roots.push(root);
	setAuracallHomeDirOverrideForTest(root);
	const factory = (profile: string) =>
		createConfiguredProviderTrafficAuthorityFactory({
			userConfig: {
				auracallProfile: profile,
				browser: { tabConcurrencyMode: "serialized" },
				services: {
					grok: {
						identity: { email: "operator@example.test" },
						liveFollow: { maxBrowserInteractionsPerMinute: 1 },
					},
				},
			} as never,
			provider: "grok",
			managedBrowserProfile: path.join(root, profile),
			mutationAudit: async () => undefined,
			baseOptions: { interactionGovernor: { beforeInteraction: async () => undefined } },
		});
	const first = await factory("first").acquire({ targetId: "first-target" });
	const second = await factory("second").acquire({ targetId: "second-target" });
	try {
		const action = await first.governor.begin({
			kind: "navigate",
			interactionClass: "renavigation",
			source: "fixture:first",
		});
		await action.settle({ outcome: "succeeded" });
		await expect(
			second.governor.begin({
				kind: "navigate",
				interactionClass: "renavigation",
				source: "fixture:second",
			}),
		).rejects.toThrow("minute-interaction-limit");
	} finally {
		await first.close();
		await second.close();
	}
});

test("Grok owned read preflight freezes a visible limit before later account effects", async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), "grok-warning-"));
	roots.push(root);
	setAuracallHomeDirOverrideForTest(root);
	const { annotateClientMutationContext } = await import(
		"../../src/browser/providers/mutationAudit.js"
	);
	let closes = 0;
	const config = { services: { grok: { identity: { email: "operator@example.test" } } } };
	const factory = (name: string) =>
		createConfiguredProviderTrafficAuthorityFactory({
			userConfig: { ...config, auracallProfile: name } as never,
			provider: "grok",
			managedBrowserProfile: path.join(root, name),
			mutationAudit: async () => undefined,
			baseOptions: {},
		});
	const client = {
		Runtime: {
			evaluate: async () => ({ result: { value: "Query limit reached. Try again in 5 minutes." } }),
		},
		close: async () => {
			closes++;
		},
	};
	await expect(
		annotateClientMutationContext(
			client as never,
			{
				providerTrafficRequired: true,
				providerTrafficAuthorityFactory: factory("first"),
			},
			"provider:grok",
			"first-target",
		),
	).rejects.toThrow("rate-limit");
	expect(closes).toBe(1);
	const second = await factory("second").acquire({ targetId: "second-target" });
	try {
		await expect(
			second.governor.begin({
				kind: "navigate",
				interactionClass: "renavigation",
				source: "fixture:second",
			}),
		).rejects.toThrow("provider-warning");
	} finally {
		await second.close();
	}
});

test.each([
	true,
	false,
])("Grok Ops readback reports capacity with configured identity=%s", async (configuredIdentity) => {
	const root = await mkdtemp(path.join(os.tmpdir(), "grok-controls-"));
	roots.push(root);
	setAuracallHomeDirOverrideForTest(root);
	const { createBrowserTabConcurrencyRuntime } = await import(
		"../../src/browser/tabConcurrencyRuntime.js"
	);
	const config = {
		auracallProfile: "fixture",
		services: {
			grok: {
				identity: { email: "operator@example.test" },
				liveFollow: { maxBrowserInteractionsPerMinute: 1 },
				operationBudgetWaitMs: 100,
			},
		},
		runtimeProfiles: {
			fixture: { services: { grok: { liveFollow: { maxBrowserInteractionsPerMinute: 8 } } } },
		},
	};
	if (!configuredIdentity) delete (config.services.grok as { identity?: unknown }).identity;
	const authority = await createConfiguredProviderTrafficAuthorityFactory({
		userConfig: config as never,
		provider: "grok",
		managedBrowserProfile: path.join(root, "managed"),
		mutationAudit: async () => undefined,
		baseOptions: {},
	}).acquire({ targetId: "fixture-target" });
	try {
		const action = await authority.governor.begin({
			kind: "navigate",
			interactionClass: "renavigation",
			source: "fixture:read",
		});
		await action.settle({ outcome: "succeeded" });
		const status = await createBrowserTabConcurrencyRuntime(config as never).readStatus();
		expect(status.providerControls?.grok).toMatchObject({
			maxOperationsPerMinute: 1,
			operationBudgetWaitMs: 100,
			usedOperationsLastMinute: 1,
			remainingOperations: 0,
			blockedReason: "minute-interaction-limit",
			nextEligibleAt: expect.any(String),
		});
		const runtime = createBrowserTabConcurrencyRuntime(config as never);
		if (!runtime.ledger) throw new Error("Missing fixture ledger");
		await runtime.ledger.recordProviderWarning({
			scope: {
				provider: "grok",
				tenantKey: configuredIdentity
					? "service-account:grok:operator@example.test"
					: `managed-browser:${path.join(root, "managed")}`,
				runtimeProfileId: "fixture",
				managedBrowserProfile: path.join(root, "managed"),
			},
			classification: "rate-limit",
			reason: "fixture warning",
			observedAt: new Date().toISOString(),
			cooldownUntil: new Date(Date.now() + 5000).toISOString(),
		});
		const warned = await runtime.readStatus();
		expect(warned.providerControls?.grok.blockedReason).toBe("provider-warning");
		expect(warned.providerControls?.grok.nextEligibleAt).toBe(
			status.providerControls?.grok.nextEligibleAt,
		);

		expect(JSON.stringify(status.providerControls)).not.toContain("operator@example.test");
	} finally {
		await authority.close();
	}
});

test("Grok configured capacity wait stays pending and cancellation prevents a later operation", async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), "grok-wait-"));
	roots.push(root);
	setAuracallHomeDirOverrideForTest(root);
	const { createBrowserTabConcurrencyRuntime } = await import(
		"../../src/browser/tabConcurrencyRuntime.js"
	);
	const config = {
		services: {
			grok: {
				identity: { email: "operator@example.test" },
				liveFollow: { maxBrowserInteractionsPerMinute: 1 },
				operationBudgetWaitMs: 5000,
			},
		},
	};
	const make = (name: string) =>
		createConfiguredProviderTrafficAuthorityFactory({
			userConfig: { ...config, auracallProfile: name } as never,
			provider: "grok",
			managedBrowserProfile: path.join(root, name),
			mutationAudit: async () => undefined,
			baseOptions: {},
		});
	const first = await make("first").acquire({ targetId: "first-target" });
	const second = await make("second").acquire({ targetId: "second-target" });
	const controller = new AbortController();
	try {
		const action = await first.governor.begin({
			kind: "navigate",
			interactionClass: "renavigation",
			source: "fixture:first",
		});
		await action.settle({ outcome: "succeeded" });
		let settled = false;
		const waiting = second.governor.begin({
			kind: "navigate",
			interactionClass: "renavigation",
			source: "fixture:waiting",
			abortSignal: controller.signal,
		});
		void waiting.then(
			() => {
				settled = true;
			},
			() => {
				settled = true;
			},
		);
		await vi.waitFor(async () => {
			const ledger = createBrowserTabConcurrencyRuntime(config as never).ledger;
			if (!ledger) throw new Error("Missing fixture ledger");
			const events = await ledger.listEvents();
			expect(events.some((item) => item.reason === "minute-interaction-limit")).toBe(true);
		});
		expect(settled).toBe(false);
		controller.abort(new Error("operator cancelled wait"));
		await expect(waiting).rejects.toThrow(/abort|cancelled/i);
	} finally {
		controller.abort();
		await first.close();
		await second.close();
	}
});

test("GrokService identity read consumes shared discovery capacity before probing a second time", async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), "grok-service-read-"));
	roots.push(root);
	setAuracallHomeDirOverrideForTest(root);
	const { GrokService } = await import("../../src/browser/llmService/providers/grokService.js");
	let identityReads = 0;
	connection.connect.mockImplementation(async () => ({
		Page: { enable: async () => undefined },
		Runtime: {
			enable: async () => undefined,
			evaluate: async ({ expression }: { expression: string }) => {
				if (expression.includes("const identity = { id: null")) {
					identityReads++;
					return {
						result: {
							value: {
								email: "operator@example.test",
								name: "Fixture",
								source: "app",
								guestAuthCta: false,
							},
						},
					};
				}
				return { result: { value: null } };
			},
		},
		close: async () => undefined,
	}));
	const service = GrokService.create(
		{
			auracallProfile: "fixture",
			services: {
				grok: {
					identity: { email: "operator@example.test" },
					liveFollow: { maxBrowserInteractionsPerMinute: 1 },
				},
			},
		} as never,
		{
			browserService: {
				getConfig: () => ({ auracallProfile: "fixture" }),
				resolveServiceTarget: async () => ({
					host: "127.0.0.1",
					port: 9222,
					browserProfile: "fixture",
					browserProcessId: 1234,
					tab: { targetId: "fixture-target", url: "https://grok.com/" },
					managedBrowserProfile: path.join(root, "managed"),
				}),
			} as never,
		},
	);
	expect(await service.getUserIdentity()).toMatchObject({ email: "operator@example.test" });
	await expect(service.getUserIdentity()).rejects.toThrow("minute-interaction-limit");
	expect(identityReads).toBe(1);
});

test("a higher-cap Grok runtime cannot bypass a lower configured ceiling for the same account", async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), "grok-shared-config-"));
	roots.push(root);
	setAuracallHomeDirOverrideForTest(root);
	const config = {
		auracallProfile: "higher",
		defaultRuntimeProfile: "higher",
		services: { grok: { identity: { email: "operator@example.test" } } },
		runtimeProfiles: {
			lower: { services: { grok: { liveFollow: { maxBrowserInteractionsPerMinute: 1 } } } },
			higher: { services: { grok: { liveFollow: { maxBrowserInteractionsPerMinute: 8 } } } },
			foreign: {
				services: {
					grok: {
						identity: { email: "foreign@example.test" },
						liveFollow: { maxBrowserInteractionsPerMinute: 1 },
					},
				},
			},
		},
	};
	const authority = await createConfiguredProviderTrafficAuthorityFactory({
		userConfig: config as never,
		provider: "grok",
		managedBrowserProfile: path.join(root, "managed"),
		mutationAudit: async () => undefined,
		baseOptions: {},
	}).acquire({ targetId: "fixture-target" });
	try {
		const first = await authority.governor.begin({
			kind: "provider-read",
			interactionClass: "generic",
			source: "fixture:higher",
		});
		await first.settle({ outcome: "succeeded" });
		await expect(
			authority.governor.begin({
				kind: "provider-read",
				interactionClass: "generic",
				source: "fixture:bypass",
			}),
		).rejects.toThrow("minute-interaction-limit");
	} finally {
		await authority.close();
	}
});

test.each([
	"operations",
	"requests",
])("separate OS processes cannot bypass Grok %s capacity with a higher local cap", async (budget) => {
	const root = await mkdtemp(path.join(os.tmpdir(), "grok-processes-"));
	roots.push(root);
	const { execFile } = await import("node:child_process");
	const { promisify } = await import("node:util");
	const execute = promisify(execFile);
	const source = `
    import { createHash } from "node:crypto";
    import path from 'node:path';
    import { createConfiguredProviderTrafficAuthorityFactory } from './src/browser/configuredProviderTrafficAuthority.ts';
    const name = process.env.GROK_FIXTURE_PROFILE;
    const authority = await createConfiguredProviderTrafficAuthorityFactory({
      userConfig: { auracallProfile: name, services: { grok: { identity: { email: 'operator@example.test' }, ...(process.env.GROK_FIXTURE_BUDGET === 'requests' ? { maxBackendRequestsPerMinute: Number(process.env.GROK_FIXTURE_CAP) } : {liveFollow: { maxBrowserInteractionsPerMinute: Number(process.env.GROK_FIXTURE_CAP) }}) } } },
      provider: 'grok', managedBrowserProfile: path.join(process.env.AURACALL_HOME_DIR, name),
      mutationAudit: async () => undefined, baseOptions: {},
    }).acquire({ targetId: name });
    try {
      if (process.env.GROK_FIXTURE_BUDGET === 'requests') await authority.governor.admitBackendRequest('sha256:'+createHash('sha256').update(name).digest('hex'),async()=>undefined); else {const action = await authority.governor.begin({ kind: 'provider-read', interactionClass: 'generic', source: 'fixture:process' }); await action.settle({ outcome: 'succeeded' });}
      process.stdout.write('admitted');
    } catch (error) { process.stdout.write((error.reason === 'minute-interaction-limit' || error.name === 'ProviderBackendRequestBudgetExceededError') ? 'denied-by-shared-cap' : 'unexpected-error'); }
    finally { await authority.close(); }
  `;
	const run = (profile: string, cap: string) =>
		execute(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", source], {
			cwd: process.cwd(),
			env: {
				...process.env,
				AURACALL_HOME_DIR: root,
				GROK_FIXTURE_PROFILE: profile,
				GROK_FIXTURE_BUDGET: budget,
				GROK_FIXTURE_CAP: cap,
			},
			timeout: 15_000,
		});
	expect((await run("first", "1")).stdout).toBe("admitted");
	expect((await run("higher", "9")).stdout).toBe("denied-by-shared-cap");
});

test("serialized Grok reads refuse a second target on the same managed browser", async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), "grok-serialized-"));
	roots.push(root);
	setAuracallHomeDirOverrideForTest(root);
	const factory = createConfiguredProviderTrafficAuthorityFactory({
		userConfig: {
			browser: { tabConcurrencyMode: "serialized" },
			services: { grok: { identity: { email: "operator@example.test" } } },
		} as never,
		provider: "grok",
		managedBrowserProfile: path.join(root, "managed"),
		mutationAudit: async () => undefined,
		baseOptions: {},
	});
	const first = await factory.acquire({ targetId: "first-target" });
	try {
		await expect(factory.acquire({ targetId: "competing-target" })).rejects.toThrow(
			"workload-owned",
		);
	} finally {
		await first.close();
	}
});

test("exhausted feature discovery never switches Imagine mode", async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), "grok-feature-cap-"));
	roots.push(root);
	setAuracallHomeDirOverrideForTest(root);
	const authority = await createConfiguredProviderTrafficAuthorityFactory({
		userConfig: {
			services: { grok: { liveFollow: { maxBrowserInteractionsPerMinute: 1 } } },
		} as never,
		provider: "grok",
		managedBrowserProfile: path.join(root, "managed"),
		mutationAudit: async () => undefined,
		baseOptions: {},
	}).acquire({ targetId: "fixture-target" });
	const first = await authority.governor.begin({
		kind: "provider-read",
		interactionClass: "generic",
		source: "fixture:first",
	});
	await first.settle({ outcome: "succeeded" });
	let switches = 0;
	connection.connect.mockImplementation(async () => ({
		Page: { enable: async () => undefined },
		Runtime: {
			enable: async () => undefined,
			evaluate: async ({ expression }: { expression: string }) => {
				if (expression.includes("const action = 'grok-imagine-video-mode'")) switches++;
				return { result: { value: true } };
			},
		},
		close: async () => undefined,
	}));
	const { createGrokAdapter } = await import("../../src/browser/providers/grokAdapter.js");
	const getFeatureSignature = createGrokAdapter().getFeatureSignature;
	if (!getFeatureSignature) throw new Error("Missing Grok feature discovery");
	try {
		await expect(
			getFeatureSignature({
				host: "127.0.0.1",
				port: 9222,
				tabTargetId: "fixture-target",
				providerTrafficGovernor: authority.governor,
				discoveryAction: "grok-imagine-video-mode",
			}),
		).rejects.toThrow("minute-interaction-limit");
		expect(switches).toBe(0);
	} finally {
		await authority.close();
	}
});
