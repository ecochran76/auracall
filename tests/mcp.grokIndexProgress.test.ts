import { expect, test } from "vitest";
import { z } from "zod";
import { createAccountMirrorStatusRegistry } from "../src/accountMirror/statusRegistry.js";
import { registerAccountMirrorRefreshTool } from "../src/mcp/tools/accountMirrorRefresh.js";
import { registerAccountMirrorStatusTool } from "../src/mcp/tools/accountMirrorStatus.js";

const progress = {
	phase: "backfill" as const,
	state: "paused" as const,
	completedScopes: 1,
	totalScopes: 2,
	retainedRows: 4,
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
	const refreshEvidence = refreshTool.outputSchema.metadataEvidence;
	expect(
		((refreshEvidence as z.ZodType).parse(evidence) as { grokIndex: unknown }).grokIndex,
	).toEqual(progress);
});
