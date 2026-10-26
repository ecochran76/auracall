import { summarizeGrokBuildDiagnostics } from "../cli/grokBuildCommand.js";
import type { ResolvedUserConfig } from "../config.js";
import { resolveGrokReadSessionOptions } from "./configuredGrokDiscovery.js";
import {
	createGrokBuildService,
	type GrokBuildResult,
	type GrokBuildService,
	grokBuildUnknown,
} from "./grokBuildService.js";
import { recordGrokEcosystemProgress } from "./grokEcosystemProgress.js";

export async function createConfiguredGrokBuildService(
	config: ResolvedUserConfig,
	runtimeProfile?: string,
	abortSignal?: AbortSignal,
): Promise<GrokBuildService> {
	async function run(
		targetId: string | undefined,
		operation: (service: GrokBuildService) => Promise<GrokBuildResult>,
	) {
		let profile = runtimeProfile ?? config.auracallProfile ?? "default";
		try {
			const { GrokService } = await import("./llmService/providers/grokService.js");
			const options = targetId
				? await GrokService.create({
						...config,
						auracallProfile: runtimeProfile ?? config.auracallProfile,
					}).buildListOptions(
						{
							tabTargetId: targetId,
							requireExistingTarget: true,
							allowNavigation: false,
							tabLifecycle: "retain",
							abortSignal,
						},
						{ ensurePort: false },
					)
				: await resolveGrokReadSessionOptions(config, runtimeProfile, abortSignal, {
						ensurePort: true,
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
		export: (request) => run(request.targetId, (service) => service.export(request)),
		discover: () => run(undefined, (service) => service.discover()),
		inspect: (request) => run(request.targetId, (service) => service.inspect(request)),
		generate: (request) => run(undefined, (service) => service.generate(request)),
	};
}
