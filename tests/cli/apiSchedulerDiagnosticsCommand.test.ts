import { execFile } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, test } from "vitest";
import {
	formatApiSchedulerDiagnosticsCliSummary,
	readApiSchedulerDiagnosticsForCli,
} from "../../src/cli/apiSchedulerDiagnosticsCommand.js";

const execFileAsync = promisify(execFile);
const TSX_BIN = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
const CLI_ENTRY = path.join(process.cwd(), "bin", "auracall.ts");
const CLI_TIMEOUT = process.platform === "win32" ? 60_000 : 30_000;
const servers: http.Server[] = [];

const diagnosticsPayload = {
	object: "account_mirror_scheduler_diagnostics_bundle",
	target: {
		provider: "chatgpt",
		runtimeProfileId: "default",
		cachePath: "/account-mirror?provider=chatgpt&runtimeProfile=default&kind=all",
	},
	wait: {
		kind: "active",
		label: "active",
		activeCompletionId: "acctmirror_diagnostics_1",
	},
	completion: {
		id: "acctmirror_diagnostics_1",
		status: "running",
		phase: "backfill_history",
	},
	browserMutations: {
		total: 2,
		byKind: {
			navigate: 1,
		},
		bySource: {
			"provider:gemini:direct-conversation-fallback": 1,
		},
		duplicateSameRouteAttempts: {
			total: 1,
			items: [],
		},
		items: [],
	},
};

afterEach(async () => {
	await Promise.all(
		servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
	);
	servers.length = 0;
});

describe("api scheduler-diagnostics CLI helpers", () => {
	it("reads scheduler diagnostics through fetch", async () => {
		const fetchImpl = async (url: string | URL | Request) => {
			expect(String(url)).toBe(
				"http://127.0.0.1:18080/v1/account-mirrors/scheduler/diagnostics?provider=chatgpt&runtimeProfile=default&completionId=acctmirror_diagnostics_1",
			);
			return new Response(JSON.stringify(diagnosticsPayload), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		};

		await expect(
			readApiSchedulerDiagnosticsForCli(
				{
					port: 18080,
					timeoutMs: 1000,
					provider: "chatgpt",
					runtimeProfile: "default",
					completionId: "acctmirror_diagnostics_1",
				},
				fetchImpl,
			),
		).resolves.toMatchObject({
			host: "127.0.0.1",
			port: 18080,
			diagnostics: diagnosticsPayload,
		});
	});

	it("retries scheduler diagnostics with local API auth after 401", async () => {
		const authorizations: Array<string | null> = [];
		const fetchImpl = async (_url: string | URL | Request, init?: RequestInit) => {
			const headers = new Headers(init?.headers);
			authorizations.push(headers.get("authorization"));
			if (!headers.has("authorization")) {
				return new Response(JSON.stringify({ error: { message: "auth required" } }), {
					status: 401,
					headers: { "Content-Type": "application/json" },
				});
			}
			return new Response(JSON.stringify(diagnosticsPayload), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		};

		const previousKey = process.env.AURACALL_API_KEY;
		process.env.AURACALL_API_KEY = "test_scheduler_diagnostics_key";
		try {
			await expect(
				readApiSchedulerDiagnosticsForCli(
					{
						port: 18080,
						timeoutMs: 1000,
						provider: "chatgpt",
					},
					fetchImpl,
				),
			).resolves.toMatchObject({
				diagnostics: diagnosticsPayload,
			});
		} finally {
			if (previousKey === undefined) {
				delete process.env.AURACALL_API_KEY;
			} else {
				process.env.AURACALL_API_KEY = previousKey;
			}
		}
		expect(authorizations).toEqual([null, "Bearer test_scheduler_diagnostics_key"]);
	});

	it("formats the compact scheduler diagnostics bundle", () => {
		const output = formatApiSchedulerDiagnosticsCliSummary({
			host: "127.0.0.1",
			port: 18080,
			diagnostics: diagnosticsPayload,
		});

		expect(output).toContain("AuraCall account mirror scheduler diagnostics (127.0.0.1:18080)");
		expect(output).toContain("Target: chatgpt/default");
		expect(output).toContain("Wait: active");
		expect(output).toContain("Completion: acctmirror_diagnostics_1 running backfill_history");
		expect(output).toContain("Browser mutations: 2");
		expect(output).toContain("Duplicate same-route attempts: 1");
	});
});

describe("api scheduler-diagnostics CLI", () => {
	test(
		"reads diagnostics through the real command parser",
		async () => {
			const seenUrls: string[] = [];
			const server = http.createServer((req, res) => {
				seenUrls.push(req.url ?? "");
				res.writeHead(200, { "content-type": "application/json" });
				res.end(JSON.stringify(diagnosticsPayload));
			});
			servers.push(server);
			await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
			const address = server.address();
			if (!address || typeof address === "string") {
				throw new Error("expected TCP server address");
			}

			const env = {
				...process.env,
				// biome-ignore lint/style/useNamingConvention: environment variable name
				ORACLE_NO_BANNER: "1",
				// biome-ignore lint/style/useNamingConvention: environment variable name
				AURACALL_DISABLE_KEYTAR: "1",
			};

			const result = await execFileAsync(
				process.execPath,
				[
					TSX_BIN,
					CLI_ENTRY,
					"api",
					"scheduler-diagnostics",
					"--port",
					String(address.port),
					"--provider",
					"chatgpt",
					"--runtime-profile",
					"default",
					"--completion-id",
					"acctmirror_diagnostics_1",
					"--json",
				],
				{ env },
			);

			expect(JSON.parse(result.stdout)).toMatchObject({
				object: "account_mirror_scheduler_diagnostics_bundle",
				target: {
					provider: "chatgpt",
					runtimeProfileId: "default",
				},
			});
			expect(seenUrls.at(-1)).toBe(
				"/v1/account-mirrors/scheduler/diagnostics?provider=chatgpt&runtimeProfile=default&completionId=acctmirror_diagnostics_1",
			);
		},
		CLI_TIMEOUT,
	);
});
