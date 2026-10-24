import { z } from "zod";
import type { GrokConnectorsService } from "../browser/grokConnectorsService.js";
import type {
	GrokConnectorDetail,
	GrokConnectorInventory,
} from "../browser/providers/grokConnectors.js";

// biome-ignore lint/style/useNamingConvention: Public Zod schemas use the repository PascalCase convention.
export const GrokConnectorSelectorSchema = z
	.object({
		id: z.string().trim().min(1).max(512).optional(),
		name: z.string().trim().min(1).max(200).optional(),
		endpoint: z.string().url().max(4096).optional(),
		kind: z.enum(["installed", "catalog"]).optional(),
	})
	.strict()
	.refine(
		(value) => Boolean(value.id || value.name || value.endpoint),
		"A Connector selector is required",
	);
// biome-ignore lint/style/useNamingConvention: Public Zod schemas use the repository PascalCase convention.
export const GrokConnectorsRequestSchema = z.discriminatedUnion("action", [
	z
		.object({
			action: z.literal("list"),
			query: z.string().max(200).optional(),
			runtimeProfile: z.string().min(1).max(200).optional(),
		})
		.strict(),
	z
		.object({
			action: z.literal("inspect"),
			selector: GrokConnectorSelectorSchema,
			runtimeProfile: z.string().min(1).max(200).optional(),
		})
		.strict(),
]);
export type GrokConnectorsRequest = z.infer<typeof GrokConnectorsRequestSchema>;
export type GrokConnectorsResult = GrokConnectorInventory | GrokConnectorDetail;
export type GrokConnectorsServiceResolver = (
	request: GrokConnectorsRequest,
) => Promise<GrokConnectorsService> | GrokConnectorsService;

/** Shared command/API operation: resolve configured authority before calling it. */
export async function runGrokConnectorsCommand(
	input: unknown,
	service: GrokConnectorsService,
): Promise<GrokConnectorsResult> {
	try {
		const request = GrokConnectorsRequestSchema.parse(input);
		return await (request.action === "list"
			? service.list(request.query)
			: service.inspect(request.selector));
	} catch {
		return grokConnectorsFailureResult();
	}
}

/** Aggregate status surface deliberately excludes endpoint/name/account/tool values. */
export function summarizeGrokConnectorDiagnostics(result: GrokConnectorsResult) {
	return {
		status: result.status,
		code: result.code,
		hasProviderAccountIdentity: result.providerAccountRef !== null,
		scope: result.coverage.scope,
		complete: result.coverage.complete,
		installed: "installed" in result ? result.installed.length : null,
		catalog: "catalog" in result ? result.catalog.length : null,
		tools: "tools" in result ? result.tools.length : null,
		auth: "auth" in result ? result.auth : null,
		hasEndpointIdentity: "endpointRef" in result ? result.endpointRef !== null : false,
		hasAccountIdentity: "accountRef" in result ? result.accountRef !== null : false,
	};
}

export function grokConnectorsFailureResult(): GrokConnectorInventory {
	return {
		providerAccountRef: null,
		status: "failed",
		code: "grok_connector_discovery_failed",
		installed: [],
		catalog: [],
		coverage: { scope: "visible", complete: false, reason: "discovery-failed" },
	};
}

/** Never expose thrown transport messages, URL inputs or raw error causes. */
export function formatGrokConnectorsFailure(): string {
	return JSON.stringify(grokConnectorsFailureResult());
}
