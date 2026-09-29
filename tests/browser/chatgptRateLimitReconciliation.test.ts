import { describe, expect, test } from "vitest";
import { reconcileChatgptRateLimitTargets } from "../../src/browser/chatgptRateLimitReconciliation.js";
import { reconcileRemoteChatgptRateLimitForTest } from "../../src/browser/index.js";

describe("ChatGPT rate-limit terminal reconciliation", () => {
	test("detects a delayed rate-limit warning on a sibling ChatGPT target", async () => {
		let pass = 0;
		const waits: number[] = [];
		const inspected: string[] = [];

		const result = await reconcileChatgptRateLimitTargets({
			currentTargetId: "leased-target",
			attempts: 3,
			intervalMs: 25,
			listTargets: async () => {
				pass += 1;
				return [
					{
						id: "sibling-target",
						type: "page",
						url: "https://chatgpt.com/c/sibling",
					},
					{
						id: "leased-target",
						type: "page",
						url: "https://chatgpt.com/c/leased",
					},
					{
						id: "unrelated-target",
						type: "page",
						url: "https://example.com/",
					},
				];
			},
			inspectTarget: async (target) => {
				inspected.push(`${pass}:${target.id}`);
				return pass >= 2 && target.id === "sibling-target"
					? { reason: "Too many requests.", source: "dialog" }
					: null;
			},
			wait: async (ms) => {
				waits.push(ms);
			},
		});

		expect(result).toEqual({
			targetId: "sibling-target",
			url: "https://chatgpt.com/c/sibling",
			reason: "Too many requests.",
			source: "dialog",
			attempt: 2,
			isCurrentTarget: false,
		});
		expect(inspected).toEqual([
			"1:leased-target",
			"1:sibling-target",
			"2:leased-target",
			"2:sibling-target",
		]);
		expect(waits).toEqual([25]);
	});

	test("detects a delayed rate-limit warning on the leased target", async () => {
		let pass = 0;
		const result = await reconcileChatgptRateLimitTargets({
			currentTargetId: "leased-target",
			attempts: 2,
			intervalMs: 10,
			listTargets: async () => {
				pass += 1;
				return [{ id: "leased-target", type: "page", url: "https://chatgpt.com/c/leased" }];
			},
			inspectTarget: async () =>
				pass === 2 ? { reason: "Too many requests.", source: "alert" } : null,
			wait: async () => undefined,
		});

		expect(result).toMatchObject({
			targetId: "leased-target",
			attempt: 2,
			isCurrentTarget: true,
			source: "alert",
		});
	});

	test("stops at the configured bound and excludes non-ChatGPT targets", async () => {
		let listCalls = 0;
		const waits: number[] = [];
		const inspected: string[] = [];
		const result = await reconcileChatgptRateLimitTargets({
			currentTargetId: "leased-target",
			attempts: 3,
			intervalMs: 40,
			listTargets: async () => {
				listCalls += 1;
				return [
					{ id: "leased-target", type: "page", url: "https://chatgpt.com/c/leased" },
					{ id: "worker", type: "service_worker", url: "https://chatgpt.com/sw.js" },
					{ id: "foreign", type: "page", url: "https://example.com/" },
				];
			},
			inspectTarget: async (target) => {
				inspected.push(target.id);
				return null;
			},
			wait: async (ms) => {
				waits.push(ms);
			},
		});

		expect(result).toBeNull();
		expect(listCalls).toBe(3);
		expect(inspected).toEqual(["leased-target", "leased-target", "leased-target"]);
		expect(waits).toEqual([40, 40]);
	});

	test("closes the sibling inspection client after detecting its warning", async () => {
		let closeCalls = 0;
		const leasedRuntime = { id: "leased" };
		const siblingRuntime = { id: "sibling", enable: async () => undefined };
		const result = await reconcileRemoteChatgptRateLimitForTest({
			host: "127.0.0.1",
			port: 9222,
			currentTargetId: "leased-target",
			currentRuntime: leasedRuntime as never,
			logger: Object.assign(() => undefined, { verbose: false }),
			attempts: 1,
			intervalMs: 0,
			stageTimeoutMs: 100,
			listTargets: async () => [
				{
					id: "leased-target",
					type: "page",
					url: "https://chatgpt.com/c/leased",
					description: "",
					devtoolsFrontendUrl: "",
					title: "ChatGPT",
					webSocketDebuggerUrl: "",
				},
				{
					id: "sibling-target",
					type: "page",
					url: "https://chatgpt.com/c/sibling",
					description: "",
					devtoolsFrontendUrl: "",
					title: "ChatGPT",
					webSocketDebuggerUrl: "",
				},
			],
			connectTarget: async () =>
				({
					Runtime: siblingRuntime,
					close: async () => {
						closeCalls += 1;
					},
				}) as never,
			detectSurface: async (runtime) =>
				runtime === (siblingRuntime as never)
					? { kind: "rate-limit", summary: "Too many requests.", details: { source: "dialog" } }
					: null,
			wait: async () => undefined,
		});

		expect(result).toMatchObject({ targetId: "sibling-target", isCurrentTarget: false });
		expect(closeCalls).toBe(1);
	});
});
