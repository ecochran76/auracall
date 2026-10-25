import type { ResolvedUserConfig } from "../config.js";
import { resolveGrokReadSessionOptions } from "./configuredGrokDiscovery.js";
import {
	createGrokBuildService,
	grokBuildUnknown,
	type GrokBuildService,
	type GrokBuildResult,
} from "./grokBuildService.js";
import { recordGrokEcosystemProgress } from "./grokEcosystemProgress.js";
import { summarizeGrokBuildDiagnostics } from "../cli/grokBuildCommand.js";

export async function createConfiguredGrokBuildService(
	config: ResolvedUserConfig,
	runtimeProfile?: string,
	abortSignal?: AbortSignal,
): Promise<GrokBuildService> {
	async function run(
		kind: "discover" | "generate" | "inspect",
		operation: (service: GrokBuildService) => Promise<GrokBuildResult>,
	) {
		let profile = runtimeProfile ?? config.auracallProfile ?? "default";
		try {
			const options = await resolveGrokReadSessionOptions(config, runtimeProfile, abortSignal, {
				ensurePort: kind !== "inspect",
			});
			profile = options.providerSessionAuthorization?.context.auracallRuntimeProfile ?? profile;
			const result = await operation(createGrokBuildService(options));
			try {
				await recordGrokEcosystemProgress("build", profile, summarizeGrokBuildDiagnostics(result));
			} catch {
				return { ...result, progressPersistence: "failed" as const };
			}
			return result;
		} catch (error) {
			try {
				await recordGrokEcosystemProgress(
					"build",
					profile,
					summarizeGrokBuildDiagnostics(grokBuildUnknown("grok_build_request_failed")),
				);
			} catch {
				/* Diagnostic persistence cannot replace retained effect custody. */
			}
			throw error;
		}
	}
	return {
		discover: () => run("discover", (service) => service.discover()),
		inspect: (request) => run("inspect", (service) => service.inspect(request)),
		generate: (request) => run("generate", (service) => service.generate(request)),
	};
}
