import {
	summarizeGrokConnectorDiagnostics,
	grokConnectorsFailureResult,
} from "../cli/grokConnectorsCommand.js";
import { recordGrokConnectorProgress } from "./grokConnectorProgress.js";
import type { ResolvedUserConfig } from "../config.js";
import { getCurrentRuntimeProfiles } from "../config/model.js";
import { resolveRuntimeProfileUserConfig } from "./service/profileConfig.js";
import { GrokService } from "./llmService/providers/grokService.js";
import { createGrokConnectorsService } from "./grokConnectorsService.js";

export async function resolveGrokReadSessionOptions(
	config: ResolvedUserConfig,
	runtimeProfile?: string,
	abortSignal?: AbortSignal,
) {
	const selectedId = runtimeProfile ?? config.auracallProfile;
	if (
		runtimeProfile &&
		runtimeProfile !== config.auracallProfile &&
		!getCurrentRuntimeProfiles(config)[runtimeProfile]
	)
		throw new Error("Unknown Grok runtime profile.");
	const selected = resolveRuntimeProfileUserConfig(config, {
		runtimeProfileId: selectedId,
		provider: "grok",
	}) as ResolvedUserConfig;
	return GrokService.create(selected).buildListOptions({ abortSignal }, { ensurePort: true });
}
export async function createConfiguredGrokConnectorsService(
	config: ResolvedUserConfig,
	runtimeProfile?: string,
	abortSignal?: AbortSignal,
) {
	const options = await resolveGrokReadSessionOptions(config, runtimeProfile, abortSignal);
	const service = createGrokConnectorsService(options);
	const profile =
		options.providerSessionAuthorization?.context.auracallRuntimeProfile ??
		runtimeProfile ??
		config.auracallProfile ??
		"default";
	async function read<
		T extends
			| Awaited<ReturnType<typeof service.list>>
			| Awaited<ReturnType<typeof service.inspect>>,
	>(action: () => Promise<T>): Promise<T> {
		try {
			const result = await action();
			await recordGrokConnectorProgress(profile, summarizeGrokConnectorDiagnostics(result));
			return result;
		} catch (error) {
			await recordGrokConnectorProgress(
				profile,
				summarizeGrokConnectorDiagnostics(grokConnectorsFailureResult()),
			);
			throw error;
		}
	}
	return {
		list: (query?: string) => read(() => service.list(query)),
		inspect: (selector: Parameters<typeof service.inspect>[0]) =>
			read(() => service.inspect(selector)),
	};
}
