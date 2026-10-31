import { type ChildProcess, fork } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { setAuracallHomeDirOverrideForTest } from "../../src/auracallHome.js";
import { conversationListSharingKey } from "../../src/browser/conversationListSharingKey.js";
import { ChatgptService } from "../../src/browser/llmService/providers/chatgptService.js";

function worker(root: string, key: string) {
	const child = fork(
		fileURLToPath(new URL("../fixtures/sharedListingWorker.ts", import.meta.url)),
		[root, key],
		{ execArgv: ["--import", "tsx"], stdio: ["ignore", "ignore", "pipe", "ipc"] },
	);
	const messages: Array<{ event: string; value?: unknown; message?: string }> = [];
	const listeners = new Set<() => void>();
	child.on("message", (message) => {
		messages.push(message as (typeof messages)[number]);
		for (const notify of listeners) notify();
	});
	const wait = (event: string) =>
		new Promise<(typeof messages)[number]>((resolve, reject) => {
			const timer = setTimeout(() => {
				listeners.delete(check);
				reject(new Error(`Worker did not emit ${event}: ${JSON.stringify(messages)}`));
			}, 5000);
			const check = () => {
				const found = messages.find((message) => message.event === event);
				if (found) {
					clearTimeout(timer);
					listeners.delete(check);
					resolve(found);
				}
			};
			listeners.add(check);
			check();
		});
	return { child, messages, wait };
}

test("separate processes share an overlapping listing without caching its completed result", async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), "shared-listing-"));
	const children: ChildProcess[] = [];
	try {
		const first = worker(root, "account-and-generation-A");
		children.push(first.child);
		await first.wait("provider-start");
		const second = worker(root, "account-and-generation-A");
		children.push(second.child);
		await second.wait("follower");
		first.child.send("release");
		second.child.send("release");
		const results = await Promise.all([first.wait("result"), second.wait("result")]);
		expect(results[0].value).toEqual(results[1].value);
		expect(
			[...first.messages, ...second.messages].filter(
				(message) => message.event === "provider-start",
			),
		).toHaveLength(1);
		const later = worker(root, "account-and-generation-A");
		children.push(later.child);
		await later.wait("provider-start");
		later.child.send("release");
		await later.wait("result");
		expect(await readdir(root)).toEqual(["ipc-secret"]);
	} finally {
		for (const child of children) child.kill();
		await rm(root, { recursive: true, force: true });
	}
});

test("public ChatGPT service lends its active observation to another process", async () => {
	const home = await mkdtemp(path.join(os.tmpdir(), "shared-list-service-"));
	setAuracallHomeDirOverrideForTest(home);
	let release: () => void = () => {};
	let started: () => void = () => {};
	const operationStarted = new Promise<void>((resolve) => {
		started = resolve;
	});
	let providerOperations = 0;
	let selectedTarget = "fixture-target";
	const resolutionLaunchFlags: Array<boolean | undefined> = [];
	const config = {
		auracallProfile: "fixture",
		browser: { target: "chatgpt", tabConcurrencyMode: "tab-affinity", cache: {} },
		services: { chatgpt: { identity: { email: "fixture@example.invalid" } } },
	};
	const service = ChatgptService.create(config as never, {
		browserService: {
			getConfig: () => config,
			resolveServiceTarget: async (input: { ensurePort?: boolean }) => {
				resolutionLaunchFlags.push(input.ensurePort);
				return {
					host: "127.0.0.1",
					port: 45009,
					browserProfile: "fixture",
					managedBrowserProfile: "/fixture/managed",
					browserProcessId: process.pid,
					tab: { targetId: selectedTarget, url: "https://chatgpt.com/" },
				};
			},
		} as never,
		// This stable injected utility seam represents a held provider observation.
		runUtilityOperation: (async () => {
			providerOperations++;
			selectedTarget = "utility-target";
			started();
			await new Promise<void>((resolve) => {
				release = resolve;
			});
			return [{ id: "synthetic-conversation", metadata: { fixture: true } }];
		}) as never,
	});
	const request = { includeHistory: true, historyLimit: 20 };
	const key = await conversationListSharingKey(
		config,
		await service.buildListOptions(request),
		request,
	);
	if (!key) throw new Error("Fixture sharing provenance missing");
	resolutionLaunchFlags.length = 0;
	let child: ChildProcess | undefined;
	try {
		const result = service.listConversations(undefined, request);
		await operationStarted;
		const peer = worker(path.join(home, "conversation-list-sharing"), key);
		child = peer.child;
		await Promise.race([peer.wait("follower"), peer.wait("provider-start")]);
		expect(peer.messages.some((message) => message.event === "provider-start")).toBe(false);
		release();
		expect((await peer.wait("result")).value).toEqual(await result);
		expect(providerOperations).toBe(1);
		expect(resolutionLaunchFlags).toEqual([false, false]);
	} finally {
		release();
		child?.kill();
		setAuracallHomeDirOverrideForTest(null);
		await rm(home, { recursive: true, force: true });
	}
});

test.each([
	"leader",
	"follower",
])("cancelling the %s caller preserves the other process's listing", async (role) => {
	const root = await mkdtemp(path.join(os.tmpdir(), "shared-listing-cancel-"));
	const children: ChildProcess[] = [];
	try {
		const first = worker(root, "same-request");
		children.push(first.child);
		await first.wait("provider-start");
		const second = worker(root, "same-request");
		children.push(second.child);
		await second.wait("follower");
		const cancelled = role === "leader" ? first : second;
		const retained = role === "leader" ? second : first;
		cancelled.child.send("cancel");
		expect((await cancelled.wait("error")).message).toBe("Caller cancelled");
		first.child.send("release");
		expect((await retained.wait("result")).value).toEqual([
			{ id: "synthetic-conversation", metadata: { fixture: true } },
		]);
	} finally {
		for (const child of children) child.kill();
		await rm(root, { recursive: true, force: true });
	}
});

test("distinct account/generation keys do not share provider work", async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), "shared-listing-isolation-"));
	const children: ChildProcess[] = [];
	try {
		const first = worker(root, "account-A-generation-1");
		children.push(first.child);
		await first.wait("provider-start");
		const second = worker(root, "account-B-generation-1");
		children.push(second.child);
		await second.wait("provider-start");
		first.child.send("release");
		second.child.send("release");
		await Promise.all([first.wait("result"), second.wait("result")]);
	} finally {
		for (const child of children) child.kill();
		await rm(root, { recursive: true, force: true });
	}
});

test("owner death fails subscribers without retrying their provider operation", async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), "shared-listing-death-"));
	const children: ChildProcess[] = [];
	try {
		const first = worker(root, "same");
		children.push(first.child);
		await first.wait("provider-start");
		const second = worker(root, "same");
		children.push(second.child);
		await second.wait("follower");
		first.child.kill("SIGKILL");
		expect((await second.wait("error")).message).toMatch(/owner.*no provider retry/i);
		expect(second.messages.some((message) => message.event === "provider-start")).toBe(false);
		const later = worker(root, "same");
		children.push(later.child);
		await later.wait("provider-start");
		later.child.send("release");
		await later.wait("result");
	} finally {
		for (const child of children) child.kill();
		await rm(root, { recursive: true, force: true });
	}
});

test("a failed observation fans out without a second provider operation", async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), "shared-listing-failure-"));
	const children: ChildProcess[] = [];
	try {
		const first = worker(root, "same");
		children.push(first.child);
		await first.wait("provider-start");
		const second = worker(root, "same");
		children.push(second.child);
		await second.wait("follower");
		first.child.send("fail");
		expect((await first.wait("error")).message).toBe("Synthetic provider warning");
		expect((await second.wait("error")).message).toBe("Synthetic provider warning");
		expect(second.messages.some((message) => message.event === "provider-start")).toBe(false);
	} finally {
		for (const child of children) child.kill();
		await rm(root, { recursive: true, force: true });
	}
});

test("cancelling every subscriber aborts the operation and releases its election", async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), "shared-listing-all-cancel-"));
	const children: ChildProcess[] = [];
	try {
		const first = worker(root, "same");
		children.push(first.child);
		await first.wait("provider-start");
		const second = worker(root, "same");
		children.push(second.child);
		await second.wait("follower");
		first.child.send("cancel");
		second.child.send("cancel");
		await Promise.all([first.wait("error"), second.wait("error")]);
		await new Promise<void>((resolve) =>
			first.child.exitCode !== null ? resolve() : first.child.once("exit", () => resolve()),
		);
		const later = worker(root, "same");
		children.push(later.child);
		await later.wait("provider-start");
		later.child.send("release");
		await later.wait("result");
	} finally {
		for (const child of children) child.kill();
		await rm(root, { recursive: true, force: true });
	}
});
