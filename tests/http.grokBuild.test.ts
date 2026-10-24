import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test, vi } from "vitest";
import { setAuracallHomeDirOverrideForTest } from "../src/auracallHome.js";
import { grokBuildUnknown } from "../src/browser/grokBuildService.js";
import { recordGrokEcosystemProgress } from "../src/browser/grokEcosystemProgress.js";
import { createBrowserTabConcurrencyRuntime } from "../src/browser/tabConcurrencyRuntime.js";
import { createResponsesHttpServer } from "../src/http/responsesServer.js";

test("Build HTTP validates confirmation before resolving and preserves partial generation outcome", async () => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "grok-build-http-"));
	setAuracallHomeDirOverrideForTest(root);
	const result = {
		...grokBuildUnknown("grok_build_app_version_not_observed"),
		status: "partial" as const,
		effectState: "completed" as const,
		retrySafe: false,
	};
	const generate = vi.fn(async () => result);
	const resolver = vi.fn(async () => ({ discover: async () => result, generate }));
	const server = await createResponsesHttpServer(
		{ host: "127.0.0.1", port: 0 },
		{ grokBuildServiceResolver: resolver },
	);
	try {
		const endpoint = `http://127.0.0.1:${server.port}/v1/grok/build/query`;
		const request = {
			action: "generate",
			prompt: "Synthetic unpublished Build",
			runtimeProfile: "default",
			timeoutMs: 1000,
		};
		const denied = await fetch(endpoint, { method: "POST", body: JSON.stringify(request) });
		expect(denied.status).toBe(400);
		expect(resolver).not.toHaveBeenCalled();
		const response = await fetch(endpoint, {
			method: "POST",
			body: JSON.stringify({ ...request, confirmed: true }),
		});
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual(result);
		expect(generate).toHaveBeenCalledWith({ ...request, confirmed: true });
		expect(resolver).toHaveBeenCalledTimes(1);
	} finally {
		await server.close();
		setAuracallHomeDirOverrideForTest(null);
		await fs.rm(root, { recursive: true, force: true });
	}
});

test("Ops projects partial Build state without retaining response text or private URLs", async () => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "grok-build-ops-"));
	setAuracallHomeDirOverrideForTest(root);
	try {
		await recordGrokEcosystemProgress("build", "default", {
			status: "partial",
			code: "grok_build_app_version_not_observed",
			effectState: "completed",
			text: "PRIVATE_BUILD_TEXT",
			url: "https://private.example/result",
			hasResponseIdentity: true,
		});
		const status = await createBrowserTabConcurrencyRuntime({} as never).readStatus();
		expect(status.providerControls?.grok.build).toMatchObject({
			status: "partial",
			effectState: "completed",
			hasResponseIdentity: true,
		});
		expect(JSON.stringify(status.providerControls)).not.toContain("PRIVATE_BUILD_TEXT");
		expect(JSON.stringify(status.providerControls)).not.toContain("private.example");
	} finally {
		setAuracallHomeDirOverrideForTest(null);
		await fs.rm(root, { recursive: true, force: true });
	}
});
