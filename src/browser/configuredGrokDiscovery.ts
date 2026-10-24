import { createGrokFilesService } from "./grokFilesService.js";
import { createGrokBotsService } from "./grokBotsService.js";
import { grokFilesFailure } from "./providers/grokFiles.js";
import { grokBotsFailureResult, summarizeGrokBotDiagnostics } from "../cli/grokBotsCommand.js";
import { summarizeGrokFilesDiagnostics } from "../cli/grokFilesCommand.js";
import { recordGrokEcosystemProgress } from "./grokEcosystemProgress.js";
import { createGrokConversationsService } from "./grokConversationsService.js";
import { recordGrokHistoryProgress } from "./grokHistoryProgress.js";
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

export async function createConfiguredGrokConversationsService(
	config: ResolvedUserConfig,
	runtimeProfile?: string,
	abortSignal?: AbortSignal,
) {
	const options = await resolveGrokReadSessionOptions(config, runtimeProfile, abortSignal);
	const service = createGrokConversationsService(options);
	const profile =
		options.providerSessionAuthorization?.context.auracallRuntimeProfile ??
		runtimeProfile ??
		config.auracallProfile ??
		"default";
	return {
		list: async (request?: Parameters<typeof service.list>[0]) => {
			const result = await service.list(request);
			await recordGrokHistoryProgress(profile, result.coverage);
			return result;
		},
	};
}

export async function createConfiguredGrokFilesService(
	config: ResolvedUserConfig,
	runtimeProfile?: string,
	abortSignal?: AbortSignal,
) {
	const options = await resolveGrokReadSessionOptions(config, runtimeProfile, abortSignal);
	const service = createGrokFilesService(options);
	const profile =
		options.providerSessionAuthorization?.context.auracallRuntimeProfile ??
		runtimeProfile ??
		config.auracallProfile ??
		"default";
	async function run(action: () => Promise<Awaited<ReturnType<typeof service.context>>>) {
		try {
			const result = await action();
			await recordGrokEcosystemProgress("files", profile, summarizeGrokFilesDiagnostics(result));
			return result;
		} catch (error) {
			await recordGrokEcosystemProgress(
				"files",
				profile,
				summarizeGrokFilesDiagnostics(grokFilesFailure()),
			);
			throw error;
		}
	}
	return {
		context: () => run(() => service.context()),
		recent: () => run(() => service.recent()),
		select: (id: string) => run(() => service.select(id)),
		upload: (paths: string[]) => run(() => service.upload(paths)),
	};
}
export async function createConfiguredGrokBotsService(
	config: ResolvedUserConfig,
	runtimeProfile?: string,
	abortSignal?: AbortSignal,
) {
	const options = await resolveGrokReadSessionOptions(config, runtimeProfile, abortSignal);
	const service = createGrokBotsService(options);
	const profile =
		options.providerSessionAuthorization?.context.auracallRuntimeProfile ??
		runtimeProfile ??
		config.auracallProfile ??
		"default";
	async function run<
		T extends Awaited<ReturnType<typeof service.list>> | Awaited<ReturnType<typeof service.invoke>>,
	>(action: () => Promise<T>) {
		try {
			const result = await action();
			await recordGrokEcosystemProgress("bots", profile, summarizeGrokBotDiagnostics(result));
			return result;
		} catch (error) {
			await recordGrokEcosystemProgress(
				"bots",
				profile,
				summarizeGrokBotDiagnostics(grokBotsFailureResult()),
			);
			throw error;
		}
	}
	return {
		list: (source?: Parameters<typeof service.list>[0]) => run(() => service.list(source)),
		invoke: (selector: Parameters<typeof service.invoke>[0], prompt: string) =>
			run(() => service.invoke(selector, prompt)),
	};
}
