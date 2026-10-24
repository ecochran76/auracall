import { z } from "zod";
import type { GrokConnectorInstallationResult } from "../browser/grokConnectorInstallationService.js";
import { validateGrokConnectorInstallationInput } from "../browser/providers/grokConnectorInstallation.js";
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
export const GrokConnectorInstallationInputSchema = z
	.object({
		kind: z.enum(["custom", "catalog"]),
		name: z.string().min(1).max(100),
		endpoint: z.string().max(4096).optional(),
		connectorId: z.string().max(200).optional(),
		accountRef: z
			.string()
			.regex(/^[a-f0-9]{64}$/)
			.optional(),
	})
	.strict()
	.superRefine((input, context) => {
		try {
			validateGrokConnectorInstallationInput(input);
		} catch {
			context.addIssue({ code: "custom", message: "Invalid Connector installation input." });
		}
	});
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
	z
		.object({
			action: z.literal("install"),
			input: GrokConnectorInstallationInputSchema,
			expectedProviderAccountRef: z.string().regex(/^[a-f0-9]{64}$/),
			confirm: z.literal(true),
			runtimeProfile: z.string().min(1).max(200).optional(),
		})
		.strict(),
	z
		.object({
			action: z.literal("reconcile"),
			input: GrokConnectorInstallationInputSchema,
			expectedProviderAccountRef: z.string().regex(/^[a-f0-9]{64}$/),
			runtimeProfile: z.string().min(1).max(200).optional(),
		})
		.strict(),
]);
export type GrokConnectorsRequest = z.infer<typeof GrokConnectorsRequestSchema>;
export type GrokConnectorsResult =
	| GrokConnectorInventory
	| GrokConnectorDetail
	| GrokConnectorInstallationResult;
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
		if (request.action === "list") return await service.list(request.query);
		if (request.action === "inspect") return await service.inspect(request.selector);
		const operation = service[request.action];
		if (!operation) throw new Error("grok_connector_install_service_unavailable");
		return await operation(request);
	} catch {
		return grokConnectorsFailureResult();
	}
}

/** Incomplete installation is an actionable terminal result, never shell/tool success. */
export function grokConnectorsResultIsError(result: GrokConnectorsResult): boolean {
	return (
		result.status === "failed" ||
		("operationId" in result && !["completed", "already-connected"].includes(result.status))
	);
}

/** Aggregate status surface deliberately excludes endpoint/name/account/tool values. */
export function summarizeGrokConnectorDiagnostics(result: GrokConnectorsResult) {
	return {
		status: result.status,
		code: result.code,
		hasProviderAccountIdentity: result.providerAccountRef !== null,
		scope: "coverage" in result ? result.coverage.scope : "installation",
		complete: "coverage" in result ? result.coverage.complete : result.status === "completed",
		installed: "installed" in result ? result.installed.length : null,
		catalog: "catalog" in result ? result.catalog.length : null,
		tools: "tools" in result ? result.tools.length : null,
		auth: "auth" in result ? result.auth : null,
		hasEndpointIdentity: "endpointRef" in result ? result.endpointRef !== null : false,
		hasAccountIdentity: "accountRef" in result ? result.accountRef !== null : false,
		effectDispatched: "effectDispatched" in result ? result.effectDispatched : false,
		retrySafe: "retrySafe" in result ? result.retrySafe : true,
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
