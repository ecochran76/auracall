import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import { createAccountMirrorStatusRegistry } from "../src/accountMirror/statusRegistry.js";
import { setAuracallHomeDirOverrideForTest } from "../src/auracallHome.js";
import { summarizeApiStatusPayload } from "../src/cli/apiStatusCommand.js";
import { createResponsesHttpServer } from "../src/http/responsesServer.js";

test("HTTP status, Ops and CLI summaries retain the same Grok checkpoint progress", async () => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "grok-http-index-"));
	setAuracallHomeDirOverrideForTest(root);
	const config = {
		runtimeProfiles: {
			default: {
				browserProfile: "default",
				services: {
					grok: { identity: { email: "one@example.com" }, liveFollow: { enabled: false } },
				},
			},
		},
	};
	const registry = createAccountMirrorStatusRegistry({ config });
	const grokIndex = {
		phase: "backfill" as const,
		state: "paused" as const,
		completedScopes: 1,
		totalScopes: 2,
		retainedRows: 4,
		omissions: ["Bot scopes unobserved"],
	};
	registry.mergeState(
		{ provider: "grok", runtimeProfileId: "default" },
		{
			metadataEvidence: {
				identitySource: "auth-session",
				projectSampleIds: [],
				conversationSampleIds: [],
				grokIndex,
				truncated: { projects: false, conversations: true, artifacts: false },
			},
		},
	);
	const server = await createResponsesHttpServer(
		{ host: "127.0.0.1", port: 0 },
		{
			config: config as never,
			accountMirrorStatusRegistry: registry,
			accountMirrorCompletionService: {
				start: () => {
					throw new Error("no start");
				},
				read: () => null,
				list: () => [],
				control: () => null,
			} as never,
		},
	);
	try {
		const response = await fetch(`http://127.0.0.1:${server.port}/status`);
		expect(response.status).toBe(200);
		const payload = await response.json();
		const account = payload.liveFollow.targets.accounts.find(
			(x: { provider: string }) => x.provider === "grok",
		);
		expect(account.grokIndex).toEqual(grokIndex);
		const cli = summarizeApiStatusPayload(payload, { host: "127.0.0.1", port: server.port });
		expect(cli.liveFollow.targets?.accounts.find((x) => x.provider === "grok")?.grokIndex).toEqual(
			grokIndex,
		);
		const html = await (await fetch(`http://127.0.0.1:${server.port}/ops/browser`)).text();
		expect(html).toContain("grokIndex: target.grokIndex || null");
	} finally {
		await server.close();
		setAuracallHomeDirOverrideForTest(null);
		await fs.rm(root, { recursive: true, force: true });
	}
});
