import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { setAuracallHomeDirOverrideForTest } from "../src/auracallHome.js";
import {
	createResponsesHttpServer,
	type ResponsesHttpServerInstance,
} from "../src/http/responsesServer.js";
import { sessionStore } from "../src/sessionStore.js";
import {
	prepareTerminalSessionReceipt,
	publishTerminalSessionReceipt,
} from "../src/terminalSessionReceipts.js";

describe("terminal receipt HTTP observation", () => {
	const temporaryDirectories: string[] = [];
	const servers: ResponsesHttpServerInstance[] = [];

	afterEach(async () => {
		await Promise.all(servers.splice(0).map((server) => server.close()));
		setAuracallHomeDirOverrideForTest(null);
		await Promise.all(
			temporaryDirectories
				.splice(0)
				.map((directory) => fs.rm(directory, { recursive: true, force: true })),
		);
	});

	test("serves a stable codex-wake contract only after immutable receipt verification", async () => {
		const home = await fs.mkdtemp(path.join(os.tmpdir(), "auracall-http-terminal-receipt-"));
		temporaryDirectories.push(home);
		setAuracallHomeDirOverrideForTest(home);
		await sessionStore.ensureStorage();
		const config = {
			model: "gpt-5.6-sol",
			browser: {},
			terminalSessionReceipts: {
				enabled: true,
				root: "auracall-home",
				schemaVersion: 1,
			},
		} as const;
		const server = await createResponsesHttpServer({ host: "127.0.0.1", port: 0 }, { config });
		servers.push(server);
		const session = await sessionStore.createSession(
			{ prompt: "never expose me", model: "gpt-5.6-sol", mode: "browser" },
			process.cwd(),
		);
		const endpoint = `http://127.0.0.1:${server.port}/v1/terminal-receipts/${encodeURIComponent(session.id)}`;

		const pendingResponse = await fetch(endpoint);
		expect(pendingResponse.status).toBe(200);
		const pending = (await pendingResponse.json()) as Record<string, unknown>;
		expect(pending).toMatchObject({
			object: "auracall_terminal_session_receipt_observation",
			eventKind: "auracall.session.terminal",
			status: "pending",
			completedAt: null,
			verified: false,
		});

		const prepared = await prepareTerminalSessionReceipt({
			config,
			session,
			terminalState: "error",
		});
		const persisted = await sessionStore.updateSession(session.id, {
			status: "error",
			completedAt: "2026-09-27T17:00:00.000Z",
			terminalReceiptIntent: prepared.value?.intent,
		});
		await publishTerminalSessionReceipt({ config, session: persisted });

		const terminalResponse = await fetch(endpoint);
		expect(terminalResponse.status).toBe(200);
		const terminal = (await terminalResponse.json()) as Record<string, unknown>;
		expect(terminal).toMatchObject({
			eventId: pending.eventId,
			sessionRef: pending.sessionRef,
			status: "error",
			completedAt: "2026-09-27T17:00:00.000Z",
			verified: true,
			result: null,
			errorCode: null,
		});
		expect(JSON.stringify(terminal)).not.toContain("never expose me");

		const statusResponse = await fetch(`http://127.0.0.1:${server.port}/status`);
		const status = (await statusResponse.json()) as {
			routes: { terminalSessionReceiptTemplate?: string };
		};
		expect(status.routes.terminalSessionReceiptTemplate).toBe("/v1/terminal-receipts/{session_id}");
	});

	test("fails closed when receipts are disabled or the session does not exist", async () => {
		const home = await fs.mkdtemp(path.join(os.tmpdir(), "auracall-http-terminal-disabled-"));
		temporaryDirectories.push(home);
		setAuracallHomeDirOverrideForTest(home);
		const disabled = await createResponsesHttpServer({ host: "127.0.0.1", port: 0 });
		servers.push(disabled);
		expect(
			(await fetch(`http://127.0.0.1:${disabled.port}/v1/terminal-receipts/example`)).status,
		).toBe(409);

		const enabled = await createResponsesHttpServer(
			{ host: "127.0.0.1", port: 0 },
			{
				config: {
					model: "gpt-5.6-sol",
					browser: {},
					terminalSessionReceipts: {
						enabled: true,
						root: "auracall-home",
						schemaVersion: 1,
					},
				},
			},
		);
		servers.push(enabled);
		expect(
			(await fetch(`http://127.0.0.1:${enabled.port}/v1/terminal-receipts/missing`)).status,
		).toBe(404);
		expect(
			(await fetch(`http://127.0.0.1:${enabled.port}/v1/terminal-receipts/%2e%2e%2frequest`))
				.status,
		).toBe(404);
	});
});
