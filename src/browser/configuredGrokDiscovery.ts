import path from "node:path";
import { getAuracallHomeDir } from "../auracallHome.js";
import {
	createGrokConnectorInvocationService,
	type GrokConnectorInvocationRequest,
} from "./grokConnectorInvocationService.js";
import { openGrokConnectorInvocationBrowser } from "./grokConnectorInvocationBrowser.js";
import { grokBotsFailureResult, summarizeGrokBotDiagnostics } from "../cli/grokBotsCommand.js";
import {
	grokConnectorsFailureResult,
	summarizeGrokConnectorDiagnostics,
} from "../cli/grokConnectorsCommand.js";
import { summarizeGrokFilesDiagnostics } from "../cli/grokFilesCommand.js";
import { getCurrentRuntimeProfiles } from "../config/model.js";
import type { ResolvedUserConfig } from "../config.js";
import { createGrokBotLifecycleService } from "./grokBotLifecycleService.js";
import { createGrokBotsService } from "./grokBotsService.js";
import { createGrokConnectorInstallationService } from "./grokConnectorInstallationService.js";
import { recordGrokConnectorProgress } from "./grokConnectorProgress.js";
import { createGrokConnectorsService } from "./grokConnectorsService.js";
import { createGrokConversationsService } from "./grokConversationsService.js";
import { recordGrokEcosystemProgress } from "./grokEcosystemProgress.js";
import { createGrokFilesService } from "./grokFilesService.js";
import { recordGrokHistoryProgress } from "./grokHistoryProgress.js";
import { GrokService } from "./llmService/providers/grokService.js";
import { grokFilesFailure } from "./providers/grokFiles.js";
import { resolveRuntimeProfileUserConfig } from "./service/profileConfig.js";

export async function resolveGrokReadSessionOptions(
	config: ResolvedUserConfig,
	runtimeProfile?: string,
	abortSignal?: AbortSignal,
	sessionOptions: { ensurePort?: boolean; tabTargetId?: string } = {},
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
	return GrokService.create(selected).buildListOptions(
		{
			abortSignal,
			...(sessionOptions.tabTargetId ? { tabTargetId: sessionOptions.tabTargetId } : {}),
		},
		{ ensurePort: sessionOptions.ensurePort !== false },
	);
}
export async function createConfiguredGrokConnectorsService(
	config: ResolvedUserConfig,
	runtimeProfile?: string,
	abortSignal?: AbortSignal,
	targetId?: string,
) {
	const options = await resolveGrokReadSessionOptions(
		config,
		runtimeProfile,
		abortSignal,
		targetId ? { ensurePort: false, tabTargetId: targetId } : {},
	);
	const service = createGrokConnectorsService(options);
	const invocation = createGrokConnectorInvocationService({
		directory: path.join(getAuracallHomeDir(), "private", "grok", "connector-invocations"),
		open: async (request) =>
			openGrokConnectorInvocationBrowser(
				targetId === request.targetId
					? options
					: await resolveGrokReadSessionOptions(config, runtimeProfile, abortSignal, {
							ensurePort: false,
							tabTargetId: request.targetId,
						}),
				request,
			),
	});
	const installation = createGrokConnectorInstallationService(options, {
		resolveReconciliationOptions: (targetId) =>
			resolveGrokReadSessionOptions(config, runtimeProfile, abortSignal, {
				ensurePort: false,
				tabTargetId: targetId,
			}),
	});
	const profile =
		options.providerSessionAuthorization?.context.auracallRuntimeProfile ??
		runtimeProfile ??
		config.auracallProfile ??
		"default";
	async function read<
		T extends
			| Awaited<ReturnType<typeof service.list>>
			| Awaited<ReturnType<typeof service.inspect>>
			| Awaited<ReturnType<typeof installation.install>>
			| Awaited<ReturnType<typeof invocation.invoke>>,
	>(action: () => Promise<T>): Promise<T> {
		try {
			const result = await action();
			try {
				await recordGrokConnectorProgress(profile, summarizeGrokConnectorDiagnostics(result));
			} catch {
				return { ...result, progressPersistence: "failed" as const };
			}
			return result;
		} catch (error) {
			try {
				await recordGrokConnectorProgress(
					profile,
					summarizeGrokConnectorDiagnostics(grokConnectorsFailureResult()),
				);
			} catch {
				/* Preserve original provider outcome and target custody. */
			}
			throw error;
		}
	}
	return {
		invoke: (request: GrokConnectorInvocationRequest) =>
			read(() => invocation.invoke({ ...request, runtimeProfile: profile })),
		list: (query?: string) => read(() => service.list(query)),
		inspect: (selector: Parameters<typeof service.inspect>[0]) =>
			read(() => service.inspect(selector)),
		install: (request: Parameters<typeof installation.install>[0]) =>
			read(() => installation.install(request)),
		reconcile: (request: Parameters<typeof installation.reconcile>[0]) =>
			read(() => installation.reconcile(request)),
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
			try {
				await recordGrokEcosystemProgress("files", profile, summarizeGrokFilesDiagnostics(result));
			} catch {
				return { ...result, progressPersistence: "failed" as const };
			}
			return result;
		} catch (error) {
			try {
				await recordGrokEcosystemProgress(
					"files",
					profile,
					summarizeGrokFilesDiagnostics(grokFilesFailure()),
				);
			} catch {
				/* Diagnostic persistence cannot replace the original operation error/custody. */
			}
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
	const lifecycle = createGrokBotLifecycleService(options);
	const profile =
		options.providerSessionAuthorization?.context.auracallRuntimeProfile ??
		runtimeProfile ??
		config.auracallProfile ??
		"default";
	async function run<
		T extends
			| Awaited<ReturnType<typeof service.list>>
			| Awaited<ReturnType<typeof service.invoke>>
			| Awaited<ReturnType<typeof lifecycle.run>>,
	>(action: () => Promise<T>) {
		try {
			const result = await action();
			try {
				await recordGrokEcosystemProgress("bots", profile, summarizeGrokBotDiagnostics(result));
			} catch {
				return { ...result, progressPersistence: "failed" as const };
			}
			return result;
		} catch (error) {
			try {
				await recordGrokEcosystemProgress(
					"bots",
					profile,
					summarizeGrokBotDiagnostics(grokBotsFailureResult()),
				);
			} catch {
				/* Diagnostic persistence cannot replace the original operation error/custody. */
			}
			throw error;
		}
	}
	return {
		lifecycle: (request: Parameters<typeof lifecycle.run>[0]) => run(() => lifecycle.run(request)),
		list: (source?: Parameters<typeof service.list>[0]) => run(() => service.list(source)),
		invoke: (selector: Parameters<typeof service.invoke>[0], prompt: string) =>
			run(() => service.invoke(selector, prompt)),
	};
}
