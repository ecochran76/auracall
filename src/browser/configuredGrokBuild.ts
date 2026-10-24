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
	const options = await resolveGrokReadSessionOptions(config, runtimeProfile, abortSignal);
	const service = createGrokBuildService(options);
	const profile =
		options.providerSessionAuthorization?.context.auracallRuntimeProfile ??
		runtimeProfile ??
		config.auracallProfile ??
		"default";
	async function run(operation: () => Promise<GrokBuildResult>) {
		try {
			const result = await operation();
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
		discover: () => run(() => service.discover()),
		generate: (request) => run(() => service.generate(request)),
	};
}
