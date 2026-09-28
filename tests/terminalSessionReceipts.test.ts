import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { setAuracallHomeDirOverrideForTest } from "../src/auracallHome.js";
import { ComposedConfigSchema } from "../src/config/schema.js";
import type { ResolvedUserConfig } from "../src/config.js";
import { sessionStore } from "../src/sessionStore.js";
import {
	prepareTerminalSessionReceipt,
	publishTerminalSessionReceipt,
	readTerminalSessionReceiptStatus,
	reconcileTerminalSessionReceipts,
	verifyTerminalSessionReceipt,
} from "../src/terminalSessionReceipts.js";

describe("terminal session receipts", () => {
	let temporaryHome: string;
	let receiptRoot: string;

	beforeEach(async () => {
		temporaryHome = await fs.mkdtemp(path.join(os.tmpdir(), "auracall-terminal-receipts-"));
		receiptRoot = path.join(temporaryHome, "events");
		setAuracallHomeDirOverrideForTest(temporaryHome);
		await sessionStore.ensureStorage();
	});

	afterEach(async () => {
		setAuracallHomeDirOverrideForTest(null);
		await fs.rm(temporaryHome, { recursive: true, force: true });
	});

	test.each([
		["completed", "succeeded"],
		["error", "error"],
		["cancelled", "cancelled"],
	] as const)("publishes a privacy-bounded %s fixture after terminal persistence", async (status, terminalState) => {
		const config = enabledConfig(receiptRoot);
		const session = await sessionStore.createSession(
			{ prompt: "private prompt must not enter the receipt", model: "gpt-5.6-sol", mode: "api" },
			process.cwd(),
		);
		const prepared = await prepareTerminalSessionReceipt({
			config,
			session,
			terminalState,
			resultText: terminalState === "succeeded" ? "private final result" : null,
			now: fixedClock("2026-09-27T10:00:00.000Z"),
		});
		expect(prepared.status).toBe("succeeded");
		const persisted = await sessionStore.updateSession(session.id, {
			status,
			completedAt: "2026-09-27T10:00:01.000Z",
			errorMessage: status === "completed" ? undefined : "private provider failure text",
			error:
				status === "completed"
					? undefined
					: { category: "fixture-private-error", message: "do not emit me" },
			terminalReceiptIntent: prepared.value?.intent,
		});

		const published = await publishTerminalSessionReceipt({
			config,
			session: persisted,
			now: fixedClock("2026-09-27T10:00:02.000Z"),
		});
		expect(published.status).toBe("succeeded");
		expect(published.value).toMatchObject({
			schemaVersion: 1,
			eventKind: "auracall.session.terminal",
			terminalState,
			terminalAt: "2026-09-27T10:00:01.000Z",
		});
		expect(published.value?.sessionRef).toMatch(/^sha256:/);
		expect(JSON.stringify(published.value)).not.toContain(session.id);
		expect(JSON.stringify(published.value)).not.toContain("private prompt");
		expect(JSON.stringify(published.value)).not.toContain("private provider failure");
		expect(JSON.stringify(published.value)).not.toContain(receiptRoot);
		expect(published.value?.result === null).toBe(terminalState !== "succeeded");
		if (terminalState !== "succeeded") {
			expect(published.value?.error?.category).toBe(
				terminalState === "cancelled" ? "cancelled" : "session-error",
			);
		}

		const verification = await verifyTerminalSessionReceipt(session.id, config);
		const receiptStatus = await readTerminalSessionReceiptStatus(config);
		expect(verification.status).toBe("succeeded");
		expect(verification.value?.verified).toBe(true);
		expect(verification.value?.result?.verified ?? null).toBe(
			terminalState === "succeeded" ? true : null,
		);
		expect(receiptStatus.lastSuccessfulEmission).toMatchObject({
			eventId: published.value?.eventId,
			disposition: "emitted",
		});

		if (process.platform !== "win32") {
			const receiptPath = path.join(
				receiptRoot,
				...(verification.value?.receiptLocator.split("/") ?? []),
			);
			expect((await fs.lstat(receiptPath)).mode & 0o777).toBe(0o400);
			if (verification.value?.result) {
				const resultPath = path.join(receiptRoot, ...verification.value.result.locator.split("/"));
				expect((await fs.lstat(resultPath)).mode & 0o777).toBe(0o400);
			}
		}
	});

	test("deduplicates repeated finalization without rewriting the immutable receipt", async () => {
		const config = enabledConfig(receiptRoot);
		const session = await sessionStore.createSession(
			{ prompt: "repeat", model: "gpt-5.6-sol" },
			process.cwd(),
		);
		const prepared = await prepareTerminalSessionReceipt({
			config,
			session,
			terminalState: "succeeded",
			resultText: "stable answer",
			now: fixedClock("2026-09-27T11:00:00.000Z"),
		});
		const persisted = await sessionStore.updateSession(session.id, {
			status: "completed",
			completedAt: "2026-09-27T11:00:01.000Z",
			terminalReceiptIntent: prepared.value?.intent,
		});
		const first = await publishTerminalSessionReceipt({
			config,
			session: persisted,
			now: fixedClock("2026-09-27T11:00:02.000Z"),
		});
		const receiptPath = path.join(receiptRoot, ...receiptLocator(first.value?.eventId).split("/"));
		const before = await fs.readFile(receiptPath);
		const second = await publishTerminalSessionReceipt({
			config,
			session: persisted,
			now: fixedClock("2026-09-27T12:00:00.000Z"),
		});
		const after = await fs.readFile(receiptPath);

		expect(first.status).toBe("succeeded");
		expect(second.status).toBe("deduplicated");
		expect(after.equals(before)).toBe(true);
		expect(second.value?.publishedAt).toBe("2026-09-27T11:00:02.000Z");
	});

	test("distinguishes a durable empty result from a missing successful result", async () => {
		const config = enabledConfig(receiptRoot);
		const session = await sessionStore.createSession(
			{ prompt: "empty result", model: "gpt-5.6-sol" },
			process.cwd(),
		);
		const prepared = await prepareTerminalSessionReceipt({
			config,
			session,
			terminalState: "succeeded",
			resultText: "",
		});
		expect(prepared.value?.intent.result?.bytes).toBe(0);
		const persisted = await sessionStore.updateSession(session.id, {
			status: "completed",
			terminalReceiptIntent: prepared.value?.intent,
		});

		const published = await publishTerminalSessionReceipt({ config, session: persisted });
		expect(published).toMatchObject({
			status: "succeeded",
			value: { terminalState: "succeeded", result: { bytes: 0 } },
		});
	});

	test("rejects a receipt whose immutable permissions were weakened", async () => {
		if (process.platform === "win32") return;
		const config = enabledConfig(receiptRoot);
		const session = await sessionStore.createSession(
			{ prompt: "permission check", model: "gpt-5.6-sol" },
			process.cwd(),
		);
		const prepared = await prepareTerminalSessionReceipt({
			config,
			session,
			terminalState: "succeeded",
			resultText: "stable answer",
		});
		const persisted = await sessionStore.updateSession(session.id, {
			status: "completed",
			completedAt: "2026-09-27T12:30:00.000Z",
			terminalReceiptIntent: prepared.value?.intent,
		});
		const published = await publishTerminalSessionReceipt({ config, session: persisted });
		const receiptPath = path.join(
			receiptRoot,
			...receiptLocator(published.value?.eventId).split("/"),
		);
		await fs.chmod(receiptPath, 0o600);

		const verification = await verifyTerminalSessionReceipt(session.id, config);
		expect(verification).toMatchObject({
			status: "failed",
			failure: { code: "immutable_file_permissions_unsafe" },
		});
	});

	test("reconciles a crash after result and terminal metadata persistence", async () => {
		const config = enabledConfig(receiptRoot);
		const session = await sessionStore.createSession(
			{ prompt: "recover", model: "gemini-3-pro" },
			process.cwd(),
		);
		const prepared = await prepareTerminalSessionReceipt({
			config,
			session,
			terminalState: "succeeded",
			resultText: "persisted before crash",
			now: fixedClock("2026-09-27T13:00:00.000Z"),
		});
		const receiptPath = path.join(
			receiptRoot,
			...receiptLocator(prepared.value?.intent.eventId).split("/"),
		);
		await expect(fs.access(receiptPath)).rejects.toMatchObject({ code: "ENOENT" });
		await sessionStore.updateSession(session.id, {
			status: "completed",
			completedAt: "2026-09-27T13:00:01.000Z",
			terminalReceiptIntent: prepared.value?.intent,
		});

		const before = await verifyTerminalSessionReceipt(session.id, config);
		expect(before.status).toBe("failed");
		const reconciliation = await reconcileTerminalSessionReceipts(config, {
			now: fixedClock("2026-09-27T13:00:02.000Z"),
		});
		const after = await verifyTerminalSessionReceipt(session.id, config);

		expect(reconciliation.value).toMatchObject({ scanned: 1, emitted: 1, failed: 0 });
		expect(after.value?.verified).toBe(true);
		const replay = await reconcileTerminalSessionReceipts(config, {
			now: fixedClock("2026-09-27T13:00:03.000Z"),
		});
		expect(replay.value).toMatchObject({ scanned: 1, emitted: 0, deduplicated: 1, failed: 0 });
	});

	test("does not infer success when a crash happened before result persistence", async () => {
		const config = enabledConfig(receiptRoot);
		const session = await sessionStore.createSession(
			{ prompt: "no result", model: "gpt-5.6-sol" },
			process.cwd(),
		);
		await sessionStore.updateSession(session.id, {
			status: "completed",
			completedAt: "2026-09-27T14:00:00.000Z",
		});

		const reconciliation = await reconcileTerminalSessionReceipts(config, {
			now: fixedClock("2026-09-27T14:00:01.000Z"),
		});
		const verification = await verifyTerminalSessionReceipt(session.id, config);

		expect(reconciliation.value).toMatchObject({ scanned: 1, emitted: 0, failed: 1 });
		expect(verification.status).toBe("failed");
	});

	test("fails closed for unsafe permissions and symlink roots", async () => {
		if (process.platform === "win32") return;
		await fs.mkdir(receiptRoot, { mode: 0o755 });
		await fs.chmod(receiptRoot, 0o755);
		const session = await sessionStore.createSession(
			{ prompt: "unsafe", model: "gpt-5.6-sol" },
			process.cwd(),
		);
		const unsafe = await prepareTerminalSessionReceipt({
			config: enabledConfig(receiptRoot),
			session,
			terminalState: "succeeded",
			resultText: "answer",
		});
		expect(unsafe).toMatchObject({
			status: "failed",
			failure: { code: "receipt_root_permissions_unsafe" },
		});
		expect((await readTerminalSessionReceiptStatus(enabledConfig(receiptRoot))).rootState).toBe(
			"invalid",
		);

		const realRoot = path.join(temporaryHome, "real-events");
		const linkedRoot = path.join(temporaryHome, "linked-events");
		await fs.mkdir(realRoot, { mode: 0o700 });
		await fs.symlink(realRoot, linkedRoot);
		const symlinked = await prepareTerminalSessionReceipt({
			config: enabledConfig(linkedRoot),
			session,
			terminalState: "succeeded",
			resultText: "answer",
		});
		expect(symlinked).toMatchObject({
			status: "failed",
			failure: { code: "receipt_path_symlink" },
		});
	});

	test("configuration is disabled by default and rejects traversal, downgrade, and unknown fields", () => {
		const disabled = ComposedConfigSchema.parse({ model: "gpt-5.6-sol", browser: {} });
		expect(disabled.terminalSessionReceipts).toBeUndefined();
		expect(() =>
			ComposedConfigSchema.parse({
				model: "gpt-5.6-sol",
				browser: {},
				terminalSessionReceipts: { enabled: true, root: "../events", schemaVersion: 1 },
			}),
		).toThrow();
		expect(() =>
			ComposedConfigSchema.parse({
				model: "gpt-5.6-sol",
				browser: {},
				terminalSessionReceipts: { enabled: true, root: receiptRoot, schemaVersion: 0 },
			}),
		).toThrow();
		expect(() =>
			ComposedConfigSchema.parse({
				model: "gpt-5.6-sol",
				browser: {},
				terminalSessionReceipts: {
					enabled: true,
					root: receiptRoot,
					schemaVersion: 1,
					extra: true,
				},
			}),
		).toThrow();
	});
});

function enabledConfig(root: string): ResolvedUserConfig {
	return ComposedConfigSchema.parse({
		model: "gpt-5.6-sol",
		browser: {},
		terminalSessionReceipts: {
			enabled: true,
			root,
			schemaVersion: 1,
		},
	});
}

function fixedClock(value: string): () => Date {
	return () => new Date(value);
}

function receiptLocator(eventId: string | undefined): string {
	if (!eventId) throw new Error("Missing fixture event id.");
	return `receipts/v1/${eventId}.json`;
}
