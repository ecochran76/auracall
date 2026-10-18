import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";
import CDP, {
	setCdpCommandAdmissionResolver,
} from "../../packages/browser-service/src/guardedCdp.js";
import { createInMemoryBrowserTabLeaseRegistry } from "../../packages/browser-service/src/service/tabLeaseRegistry.js";
import { createInMemoryProviderInteractionLedger } from "../../packages/browser-service/src/service/interactionLedger.js";
import * as lifecycle from "../../packages/browser-service/src/chromeLifecycle.js";
import * as concurrency from "../../src/browser/tabConcurrencyRuntime.js";
import * as coordinator from "../../src/accountMirror/liveFollowTabCoordinator.js";
import { BrowserService } from "../../src/browser/service/browserService.js";
import { createConfiguredLiveFollowAffinity } from "../../src/accountMirror/configuredLiveFollowAffinity.js";

const enabled = process.env.AURACALL_NATIVE_FIXTURE_TEST === "1";
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe.skipIf(!enabled)("native provider-free live-follow idle traffic", () => {
	test("settled crawler cannot keep producing backend requests after its owner finishes", async () => {
		const profile = await fs.mkdtemp(path.join(os.tmpdir(), "auracall-idle-native-"));
		const browser = spawn(
			"/usr/bin/google-chrome",
			[
				"--headless=new",
				"--no-first-run",
				"--no-default-browser-check",
				"--disable-background-networking",
				"--disable-sync",
				"--proxy-server=http://127.0.0.1:1",
				"--host-resolver-rules=MAP * ~NOTFOUND,EXCLUDE 127.0.0.1",
				"--remote-debugging-port=0",
				`--user-data-dir=${profile}`,
				"about:blank",
			],
			{ stdio: "ignore" },
		);
		let client: Awaited<ReturnType<typeof CDP>> | undefined;
		try {
			let port = 0;
			for (let i = 0; i < 100; i++) {
				try {
					port = Number(
						(await fs.readFile(path.join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0],
					);
					break;
				} catch {
					await delay(25);
				}
			}
			if (!port) throw new Error("Isolated Chrome endpoint unavailable");
			setCdpCommandAdmissionResolver(async (endpoint) => {
				if (endpoint.port !== port) throw new Error("Fixture cannot access another browser");
				return {
					run: async (_command, effect) => effect(),
					hold: async () => ({ run: async (_command, effect) => effect(), close: async () => {} }),
				};
			});
			const targets = await lifecycle.listChromeTargets(port, "127.0.0.1");
			const targetId = targets.find((t) => t.type === "page")?.id;
			if (!targetId) throw new Error("Fixture target missing");
			client = await CDP({ port, target: targetId });
			await client.Page.enable();
			await client.Runtime.enable();
			await client.Network.enable();
			let requests = 0;
			client.Network.requestWillBeSent((e) => {
				if (e.request.url.includes("/backend-api/fixture-idle")) requests++;
			});
			const scope = {
				runtimeProfileId: "runtime-1",
				managedBrowserProfile: profile,
				service: "chatgpt",
				tenantKey: "service-account:chatgpt:account-id=account-1",
			};
			const registry = createInMemoryBrowserTabLeaseRegistry();
			const reserved = await registry.reserve({
				scope,
				processBound: true,
				targetId,
				workload: { kind: "live-follow", operationId: "op-native" },
				operationId: "op-native",
				now: new Date().toISOString(),
				idleTtlMs: 60000,
				absoluteTtlMs: 3600000,
				targetFingerprint: "about:blank",
			});
			if (!reserved.ok) throw new Error("Fixture reserve failed");
			vi.spyOn(concurrency, "createBrowserTabConcurrencyRuntime").mockReturnValue({
				registry,
				ledger: createInMemoryProviderInteractionLedger(),
			} as never);
			const acquireCrawler = coordinator.acquireLiveFollowCrawlerTab;
			vi.spyOn(coordinator, "acquireLiveFollowCrawlerTab").mockResolvedValue({
				...reserved.value,
				endpoint: { host: "127.0.0.1", port },
			} as never);
			vi.spyOn(BrowserService, "fromConfig").mockReturnValue({
				resolveServiceTarget: async () => ({
					host: "127.0.0.1",
					port,
					managedBrowserProfile: profile,
				}),
				getMutationAuditSink: () => async () => undefined,
			} as never);
			const affinity = await createConfiguredLiveFollowAffinity({
				userConfig: {
					auracallProfile: "runtime-1",
					browser: { tabConcurrencyMode: "tab-affinity" },
					profiles: {
						"runtime-1": { services: { chatgpt: { identity: { accountId: "account-1" } } } },
					},
				} as never,
				provider: "chatgpt",
				runtimeProfileId: "runtime-1",
				operationId: "op-native",
				maxBrowserInteractionsPerMinute: 20,
			});
			await client.Runtime.evaluate({
				expression:
					"globalThis.fixturePoll=setInterval(()=>fetch('https://chatgpt.com/backend-api/fixture-idle').catch(()=>{}),25);void 0",
			});
			for (let i = 0; i < 100 && requests < 3; i++) await delay(20);
			expect(requests).toBeGreaterThanOrEqual(3);
			await affinity?.completeSuccess();
			const afterFinish = requests;
			await delay(250);
			expect(requests - afterFinish).toBe(0);
			expect((await registry.list())[0]).toMatchObject({
				state: "idle",
				effectState: "settled",
				targetFingerprint: "about:blank",
			});

			const inspect = vi.fn(async () => {
				const observed = await client?.Runtime.evaluate({
					expression: "location.href",
					returnByValue: true,
				});
				return { url: String(observed?.result.value) };
			});
			const open = vi.fn(async (): Promise<never> => {
				throw new Error("Unexpected replacement target");
			});
			const next = await acquireCrawler({
				registry,
				scope,
				operationId: "op-next",
				targetUrl: "https://chatgpt.com/",
				allowOwnedUnloadedTarget: true,
				idleTtlMs: 60000,
				absoluteTtlMs: 3600000,
				resolveExistingEndpoint: async () => ({
					host: "127.0.0.1",
					port,
					managedBrowserProfile: profile,
				}),
				startBrowser: async () => {
					throw new Error("Unexpected replacement browser");
				},
				inspectTarget: inspect,
				openTarget: open,
				closeTarget: async () => {
					throw new Error("Unexpected close of retained target");
				},
			});
			expect(inspect).toHaveBeenCalledOnce();
			expect(open).not.toHaveBeenCalled();
			expect(next.unloadedTarget).toBe(true);
			expect(next.lease).toMatchObject({
				targetId,
				state: "active",
				effectState: "settled",
				ownerOperationId: "op-next",
			});
			expect(next.claim.revision).toBeGreaterThan(reserved.value.claim.revision);
			expect(
				(await lifecycle.listChromeTargets(port, "127.0.0.1")).filter((t) => t.type === "page"),
			).toHaveLength(1);
			expect(requests - afterFinish).toBe(0);
		} finally {
			await client?.close().catch(() => {});
			vi.restoreAllMocks();
			setCdpCommandAdmissionResolver(undefined);
			browser.kill("SIGTERM");
			await Promise.race([new Promise((resolve) => browser.once("exit", resolve)), delay(2000)]);
			await fs.rm(profile, { recursive: true, force: true });
		}
	}, 15000);
});
