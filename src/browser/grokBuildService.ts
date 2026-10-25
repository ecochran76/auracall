import { projectGrokAccountReference } from "./grokAccountReference.js";
import type { ChromeClient } from "./types.js";
import type { BrowserProviderListOptions } from "./providers/types.js";
import type { GrokConnectorConnection } from "./grokConnectorsService.js";
import { resolveProviderTrafficGovernor } from "./providers/mutationAudit.js";
import { runGrokUiOperation } from "./grokUiOperation.js";
import { BrowserAutomationError } from "../oracle/errors.js";
import {
	discoverGrokModels,
	selectGrokMode,
	verifyGrokCurrentModel,
	setGrokPrompt,
	submitGrokPrompt,
	readGrokAssistantSnapshotForRuntime,
	waitForGrokAssistantResult,
} from "./actions/grok.js";
import { hasEmptyGrokBuildRoot, readGrokBuildResponseIdentity } from "./providers/grokBuild.js";

export interface GrokBuildResult {
	status: "available" | "unavailable" | "partial" | "unknown" | "invalid";
	code: string;
	targetId: string | null;
	providerAccountRef: string | null;
	mode: "available" | "account_gated" | "not_observed";
	generation: {
		status: "not_started" | "response_completed" | "unknown";
		responseId: string | null;
		text: string | null;
		markdown: string | null;
	};
	conversationId: string | null;
	conversationUrl: string | null;
	app: { id: string | null; version: string | null };
	preview: { status: "unknown"; url: null };
	artifacts: { status: "unavailable"; code: string; entries: never[] };
	publication: { requested: false; status: "unknown" };
	cleanupState: "completed" | "unknown";
	effectState: "none" | "completed" | "unknown";
	retrySafe: boolean;
}
export interface GrokBuildService {
	discover(): Promise<GrokBuildResult>;
	generate(request: {
		prompt: string;
		confirmed: boolean;
		timeoutMs?: number;
	}): Promise<GrokBuildResult>;
}
export interface GrokBuildDependencies {
	connect?: (options: BrowserProviderListOptions) => Promise<GrokConnectorConnection>;
	closeTarget?: (connection: GrokConnectorConnection) => Promise<void>;
	verifyAccount?: (
		runtime: ChromeClient["Runtime"],
		options: BrowserProviderListOptions,
	) => Promise<string | null>;
}
export function grokBuildUnknown(code = "grok_build_operation_unknown"): GrokBuildResult {
	return {
		status: "unknown",
		code,
		targetId: null,
		providerAccountRef: null,
		mode: "not_observed",
		generation: { status: "not_started", responseId: null, text: null, markdown: null },
		conversationId: null,
		conversationUrl: null,
		app: { id: null, version: null },
		preview: { status: "unknown", url: null },
		artifacts: { status: "unavailable", code: "grok_build_app_version_not_observed", entries: [] },
		publication: { requested: false, status: "unknown" },
		cleanupState: "unknown",
		effectState: "none",
		retrySafe: true,
	};
}
/** Uses the same configured browser/account/traffic authority as Grok conversations.
 * A terminal text response does not establish a generated app or version. */
export function createGrokBuildService(
	options: BrowserProviderListOptions,
	dependencies: GrokBuildDependencies = {},
): GrokBuildService {
	async function run(
		request?: Parameters<GrokBuildService["generate"]>[0],
	): Promise<GrokBuildResult> {
		if (
			request &&
			(!request.confirmed ||
				!request.prompt.trim() ||
				request.prompt.length > 100000 ||
				(request.timeoutMs !== undefined &&
					(!Number.isInteger(request.timeoutMs) ||
						request.timeoutMs < 1 ||
						request.timeoutMs > 7200000)))
		)
			return { ...grokBuildUnknown("grok_build_request_invalid"), status: "invalid" };
		if (request && options.abortSignal?.aborted)
			return { ...grokBuildUnknown("grok_build_cancelled_preflight"), cleanupState: "completed" };
		options.abortSignal?.throwIfAborted();
		const connect =
			dependencies.connect ??
			(async (input: BrowserProviderListOptions) => {
				const { connectToGrokTab } = await import("./providers/grokAdapter.js");
				return connectToGrokTab(input);
			});
		const connection = await connect({
			...options,
			providerTrafficRequired: true,
			...(request
				? {
						tabLifecycle: "retain-new" as const,
						configuredUrl: "https://grok.com/",
						conversationId: undefined,
						projectId: undefined,
					}
				: {}),
		});
		const client = connection.client as ChromeClient;
		let result = grokBuildUnknown();
		result.targetId = connection.targetId ?? null;
		let submissionAttempted = false;
		let submitted = false;
		let operationError: unknown;
		let transportClosed = false;
		try {
			const governor = resolveProviderTrafficGovernor(client);
			if (!governor || governor.attribution.provider !== "grok" || !governor.admitBackendRequest)
				throw new Error("grok_build_governor_required");
			if (!connection.targetId || governor.attribution.targetId !== connection.targetId)
				throw new Error("grok_build_target_not_verified");
			const verify =
				dependencies.verifyAccount ??
				(async (runtime: ChromeClient["Runtime"], input: BrowserProviderListOptions) => {
					const { checkGrokBrowserAuthPreflight } = await import("./providers/grokAdapter.js");
					const proof = await checkGrokBrowserAuthPreflight(runtime, input);
					return proof.ok ? projectGrokAccountReference(proof.actualIdentity, "legacy-untagged") : null;
				});
			await governor.checkWarning?.(client.Runtime);
			const admission = await governor.begin({
				kind: "provider-read",
				interactionClass: "generic",
				source: "provider:grok:build",
				targetId: connection.targetId,
				abortSignal: options.abortSignal,
			});
			try {
				const account = await verify(client.Runtime, options);
				if (!account) throw new Error("grok_build_account_not_verified");
				const entries = await runGrokUiOperation({
					governor,
					runtime: client.Runtime,
					kind: "in-page-click",
					source: "provider:grok:build-discover",
					abortSignal: options.abortSignal,
					effect: () => discoverGrokModels(client.Input, client.Runtime),
				});
				const matches = entries.filter((entry) => entry.label.toLowerCase() === "build");
				result = grokBuildUnknown();
				result.providerAccountRef = account;
				result.targetId = connection.targetId;
				if (matches.length !== 1) {
					result.status = "unavailable";
					result.code = "grok_build_not_observed";
				} else if (matches[0].entitlement !== "available") {
					result.status = "unavailable";
					result.code = "grok_build_account_gated";
					result.mode = "account_gated";
				} else {
					result.status = "available";
					result.code = "grok_build_mode_available";
					result.mode = "available";
				}
				const effect = <T>(kind: "input" | "in-page-click", source: string, fn: () => Promise<T>) =>
					runGrokUiOperation({
						governor,
						runtime: client.Runtime,
						kind,
						source: `provider:grok:build-${source}`,
						abortSignal: options.abortSignal,
						effect: fn,
					});
				if (request && result.mode === "available") {
					if (!(await hasEmptyGrokBuildRoot(client.Runtime))) {
						result.status = "unavailable";
						result.code = "grok_build_empty_root_required";
					} else {
						await effect("in-page-click", "select", () =>
							selectGrokMode(client.Input, client.Runtime, "Build", () => {}),
						);
						const baseline = await readGrokAssistantSnapshotForRuntime(client.Runtime);
						await effect("input", "prompt", () =>
							setGrokPrompt(client.Input, client.Runtime, request.prompt),
						);
						if (
							(await effect("in-page-click", "verify-mode", () =>
								verifyGrokCurrentModel(client.Input, client.Runtime),
							)) !== "Build"
						)
							throw new Error("grok_build_mode_changed");
						if ((await verify(client.Runtime, options)) !== account)
							throw new Error("grok_build_account_changed");
						await effect("in-page-click", "submit", async () => {
							submissionAttempted = true;
							await submitGrokPrompt(client.Input, client.Runtime);
							submitted = true;
						});
						const answer = await waitForGrokAssistantResult(
							client.Runtime,
							request.timeoutMs ?? 120000,
							() => {},
							{
								baseline,
								abortSignal: options.abortSignal,
								checkWarning: () => governor.checkWarning?.(client.Runtime) ?? Promise.resolve(),
							},
						);
						const snapshot = await readGrokAssistantSnapshotForRuntime(client.Runtime);
						const identity = await readGrokBuildResponseIdentity(
							client.Runtime,
							snapshot.responseId,
						);
						if (!identity) throw new Error("grok_build_response_identity_unobserved");
						result = {
							...result,
							...identity,
							status: "partial",
							code: "grok_build_app_identity_unobserved",
							generation: {
								status: "response_completed",
								responseId: snapshot.responseId,
								text: answer.text,
								markdown: answer.markdown,
							},
							effectState: "completed",
							retrySafe: false,
						};
					}
				}
				if ((await verify(client.Runtime, options)) !== account)
					throw new Error("grok_build_account_changed");
				await admission.settle({ outcome: "succeeded", probeContext: client.Runtime });
			} catch (error) {
				await admission.settle({
					outcome: "failed",
					effectState: submissionAttempted ? "outcome-unknown" : "none",
					error: "grok_build_operation_failed",
					probeContext: client.Runtime,
				});
				throw error;
			}
		} catch (error) {
			if (!request) operationError = error;
			else {
				const definitelyNoSend =
					error instanceof BrowserAutomationError && error.details?.effectState === "pre_effect";
				const uncertain = (submissionAttempted && !definitelyNoSend) || submitted;
				result = {
					...grokBuildUnknown(),
					targetId: connection.targetId ?? null,
					mode: result.mode,
					status: "unknown",
					code: uncertain ? "grok_build_generation_outcome_unknown" : "grok_build_preflight_failed",
					effectState: uncertain ? "unknown" : "none",
					retrySafe: !uncertain,
					generation: {
						status: uncertain ? "unknown" : "not_started",
						responseId: null,
						text: null,
						markdown: null,
					},
				};
			}
		} finally {
			try {
				await client.close();
				transportClosed = true;
				result.cleanupState = "completed";
			} catch (cleanupError) {
				if (request) {
					result.status = "unknown";
					result.code = "grok_build_cleanup_unknown";
					result.retrySafe = false;
					result.cleanupState = "unknown";
				} else
					operationError = operationError
						? new AggregateError([operationError, cleanupError], "grok_build_cleanup_unknown")
						: cleanupError;
			}
			if (!request && transportClosed && connection.shouldClose && connection.targetId) {
				try {
					if (dependencies.closeTarget) await dependencies.closeTarget(connection);
					else {
						const { default: CDP } = await import("./cdp.js");
						await CDP.Close({
							host: connection.host,
							port: connection.port,
							id: connection.targetId,
						});
					}
				} catch (cleanupError) {
					operationError = operationError
						? new AggregateError([operationError, cleanupError], "grok_build_cleanup_unknown")
						: cleanupError;
				}
			}
		}
		if (operationError) throw operationError;
		return result;
	}
	return { discover: () => run(), generate: (request) => run(request) };
}
