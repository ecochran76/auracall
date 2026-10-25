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
		phase: "follow" as const,
		state: "paused" as const,
		completedScopes: 1,
		totalScopes: 2,
		retainedRows: 4,
		observationCoverage: "partial" as const,
		requiresFullSweep: true,
		changedRows: 0,
		observedScopes: 1,
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
	let completionRequest: unknown;
	const server = await createResponsesHttpServer(
		{ host: "127.0.0.1", port: 0 },
		{
			config: config as never,
			accountMirrorStatusRegistry: registry,
			accountMirrorCompletionService: {
				start: (request: unknown) => {
					completionRequest = request;
					return { object: "account_mirror_completion", id: "grok443-full-sweep" };
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
		const started = await fetch(`http://127.0.0.1:${server.port}/v1/account-mirrors/completions`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				provider: "grok",
				runtimeProfile: "default",
				sweepMode: "full_sweep",
				maxPasses: 1,
				materializationPolicy: "metadata_only",
			}),
		});
		expect(started.status).toBe(202);
		expect(completionRequest).toMatchObject({
			provider: "grok",
			runtimeProfileId: "default",
			sweepMode: "full_sweep",
			maxPasses: 1,
			materializationPolicy: "metadata_only",
		});
	} finally {
		await server.close();
		setAuracallHomeDirOverrideForTest(null);
		await fs.rm(root, { recursive: true, force: true });
	}
});
