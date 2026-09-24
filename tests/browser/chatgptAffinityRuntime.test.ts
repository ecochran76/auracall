import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";

import { runChatgptPromptWithConfiguredAffinity } from "../../src/browser/chatgptAffinityRuntime.js";
import { createBrowserTabConcurrencyRuntime } from "../../src/browser/tabConcurrencyRuntime.js";

describe("configured ChatGPT affinity runtime", () => {
	test("preserves serialized execution without resolving or creating a browser target", async () => {
		const runSerialized = vi.fn(async () => ({ text: "serialized" }));
		const resolveServiceTarget = vi.fn();
		const openTarget = vi.fn();

		const result = await runChatgptPromptWithConfiguredAffinity({
			userConfig: { browser: { tabConcurrencyMode: "serialized" } } as never,
			runtime: createBrowserTabConcurrencyRuntime({
				browser: { tabConcurrencyMode: "serialized" },
			} as never),
			input: { prompt: "compatibility" },
			runSerialized,
			runExact: vi.fn(),
			resolveServiceTarget,
			openTarget,
			closeTarget: vi.fn(),
		});

		expect(result).toEqual({ text: "serialized" });
		expect(runSerialized).toHaveBeenCalledOnce();
		expect(resolveServiceTarget).not.toHaveBeenCalled();
		expect(openTarget).not.toHaveBeenCalled();
	});

	test("runs explicit affinity on one newly leased exact target", async () => {
		const directory = await mkdtemp(path.join(os.tmpdir(), "auracall-affinity-runtime-"));
		try {
			const userConfig = {
				auracallProfile: "runtime-1",
				browser: {
					tabConcurrencyMode: "tab-affinity",
					chatgptUrl: "https://chatgpt.com/",
				},
				services: {
					chatgpt: { identity: { email: "operator@example.com" } },
				},
			} as never;
			const runtime = createBrowserTabConcurrencyRuntime(userConfig, { storageRoot: directory });
			const resolveServiceTarget = vi.fn(async () => ({
				host: "127.0.0.1",
				port: 45011,
				managedBrowserProfile: "/profiles/managed-1",
			}));
			const openTarget = vi.fn(async () => ({
				targetId: "target-1",
				url: "https://chatgpt.com/",
			}));
			const runExact = vi.fn(async (_input, options) => ({
				text: "created",
				conversationId: "conversation-1",
				url: "https://chatgpt.com/c/conversation-1",
				tabTargetId: options.tabTargetId,
			}));
			const operationIds = ["operation-1", "operation-2"];

			const result = await runChatgptPromptWithConfiguredAffinity({
				userConfig,
				runtime,
				input: { prompt: "new" },
				runSerialized: vi.fn(),
				runExact,
				resolveServiceTarget,
				openTarget,
				inspectTarget: vi.fn(async () => ({
					url: "https://chatgpt.com/c/conversation-1",
				})),
				closeTarget: vi.fn(),
				now: () => new Date("2026-09-24T12:00:00.000Z"),
				generateId: () => operationIds.shift() ?? "unexpected-operation",
			});
			const continued = await runChatgptPromptWithConfiguredAffinity({
				userConfig,
				runtime,
				input: { prompt: "continue", conversationId: "conversation-1" },
				runSerialized: vi.fn(),
				runExact,
				resolveServiceTarget,
				openTarget,
				inspectTarget: vi.fn(async () => ({
					url: "https://chatgpt.com/c/conversation-1",
				})),
				closeTarget: vi.fn(),
				now: () => new Date("2026-09-24T12:00:01.000Z"),
				generateId: () => operationIds.shift() ?? "unexpected-operation",
			});

			expect(result).toMatchObject({
				conversationId: "conversation-1",
				tabTargetId: "target-1",
			});
			expect(resolveServiceTarget).toHaveBeenCalledWith(
				expect.objectContaining({ serviceId: "chatgpt", ensurePort: false }),
			);
			expect(openTarget).toHaveBeenCalledOnce();
			expect(continued).toMatchObject({
				conversationId: "conversation-1",
				tabTargetId: "target-1",
			});
			expect(runExact.mock.calls[0]?.[1]).toMatchObject({
				tabTargetId: "target-1",
				preserveActiveTab: true,
			});
			expect(await runtime.readStatus()).toMatchObject({
				leaseCount: 1,
				interactionCount: 2,
				activeInteractionCount: 0,
			});
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	test("fails before browser resolution when affinity lacks configured tenant identity", async () => {
		const directory = await mkdtemp(path.join(os.tmpdir(), "auracall-affinity-runtime-"));
		try {
			const userConfig = {
				browser: { tabConcurrencyMode: "tab-affinity" },
			} as never;
			const resolveServiceTarget = vi.fn();
			await expect(
				runChatgptPromptWithConfiguredAffinity({
					userConfig,
					runtime: createBrowserTabConcurrencyRuntime(userConfig, { storageRoot: directory }),
					input: { prompt: "new" },
					runSerialized: vi.fn(),
					runExact: vi.fn(),
					resolveServiceTarget,
					openTarget: vi.fn(),
					closeTarget: vi.fn(),
				}),
			).rejects.toThrow("configured ChatGPT tenant identity");
			expect(resolveServiceTarget).not.toHaveBeenCalled();
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});
});
