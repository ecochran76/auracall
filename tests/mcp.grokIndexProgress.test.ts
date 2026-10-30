import { expect, test } from "vitest";
import { registerAccountMirrorCompletionTools } from "../src/mcp/tools/accountMirrorCompletion.js";
import { z } from "zod";
import { createAccountMirrorStatusRegistry } from "../src/accountMirror/statusRegistry.js";
import { registerAccountMirrorRefreshTool } from "../src/mcp/tools/accountMirrorRefresh.js";
import { registerAccountMirrorStatusTool } from "../src/mcp/tools/accountMirrorStatus.js";

const progress = {
	phase: "follow" as const,
	state: "paused" as const,
	completedScopes: 1,
	totalScopes: 2,
	retainedRows: 4,
	observationCoverage: "partial" as const,
	requiresFullSweep: true,
	changedRows: 0,
	observedScopes: 1,
	omissions: ["Bot scopes not observed"],
};
const evidence = {
	identitySource: "auth-session",
	projectSampleIds: [],
	conversationSampleIds: [],
	grokIndex: progress,
	truncated: { projects: false, conversations: true, artifacts: false },
};
test("declared MCP refresh and status contracts retain sanitized Grok progress", () => {
	const tools = new Map<string, { outputSchema: z.ZodRawShape }>();
	const server = {
		registerTool: (name: string, config: { outputSchema: z.ZodRawShape }) =>
			tools.set(name, config),
	};
	const registry = createAccountMirrorStatusRegistry({
		config: {
			runtimeProfiles: {
				default: {
					browserProfile: "default",
					services: { grok: { identity: { email: "one@example.com" } } },
				},
			},
		},
	});
	registry.mergeState(
		{ provider: "grok", runtimeProfileId: "default" },
		{ metadataEvidence: evidence },
	);
	registerAccountMirrorStatusTool(server as never, { registry });
	registerAccountMirrorRefreshTool(server as never, {
		service: {
			requestRefresh: async () => {
				throw new Error("not called");
			},
		},
	});
	const statusTool = tools.get("account_mirror_status");
	const refreshTool = tools.get("account_mirror_refresh");
	if (!statusTool || !refreshTool) throw new Error("Missing registered mirror tool.");
	const statusSchema = z.object(statusTool.outputSchema);
	const parsed = statusSchema.parse(registry.readStatus({ provider: "grok" })) as ReturnType<
		typeof registry.readStatus
	>;
	expect(parsed.entries[0].metadataEvidence?.grokIndex).toEqual(progress);
	registry.mergeState(
		{ provider: "grok", runtimeProfileId: "default" },
		{ lastFailureAtMs: 1000, consecutiveFailureCount: 1 },
	);
	const failedStatus = statusSchema.parse(registry.readStatus({ provider: "grok" })) as ReturnType<
		typeof registry.readStatus
	>;
	expect(failedStatus.entries[0].metadataEvidence?.grokIndex?.state).toBe("failed");
	const refreshEvidence = refreshTool.outputSchema.metadataEvidence;
	expect(
		((refreshEvidence as z.ZodType).parse(evidence) as { grokIndex: unknown }).grokIndex,
	).toEqual(progress);
	const failedEvidence = (refreshEvidence as z.ZodType).parse({
		...evidence,
		grokIndex: { ...progress, state: "failed" },
	}) as { grokIndex: { state: string } };
	expect(failedEvidence.grokIndex.state).toBe("failed");
});

test("public MCP completion start preserves an explicit bounded Grok full sweep", async () => {
	const handlers = new Map<string, (input: unknown) => Promise<unknown>>();
	let request: unknown;
	registerAccountMirrorCompletionTools(
		{
			registerTool: (
				name: string,
				_config: unknown,
				handler: (input: unknown) => Promise<unknown>,
			) => handlers.set(name, handler),
		} as never,
		{
			service: {
				start: (input: unknown) => {
					request = input;
					return { object: "account_mirror_completion", id: "grok443-full-sweep" };
				},
			} as never,
		},
	);
	const handler = handlers.get("account_mirror_completion_start");
	if (!handler) throw new Error("Missing public completion tool");
	await handler({
		provider: "grok",
		runtimeProfile: "default",
		sweepMode: "full_sweep",
		maxPasses: 1,
		materializationPolicy: "metadata_only",
	});
	expect(request).toMatchObject({
		provider: "grok",
		runtimeProfileId: "default",
		sweepMode: "full_sweep",
		maxPasses: 1,
		materializationPolicy: "metadata_only",
	});
});
