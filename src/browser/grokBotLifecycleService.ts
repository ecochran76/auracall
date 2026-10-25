// biome-ignore-all lint/style/useNamingConvention: Provider/CDP wire names.
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getAuracallHomeDir } from "../auracallHome.js";
import { projectGrokAccountReference } from "./grokAccountReference.js";
import type { GrokBotServiceDependencies } from "./grokBotsService.js";
import { runGrokUiOperation } from "./grokUiOperation.js";
import {
	createGrokBotLifecycleClient,
	type GrokBotConfigurationPatch,
	type GrokBotLifecycleResult,
	grokBotLifecycleUnknown,
} from "./providers/grokBotLifecycle.js";
import { resolveProviderTrafficGovernor } from "./providers/mutationAudit.js";
import type { BrowserProviderListOptions } from "./providers/types.js";
import type { ChromeClient } from "./types.js";
export type GrokBotLifecycleRequest =
	| {
			action: "create";
			name: string;
			expectedProviderAccountRef: string;
			confirm: boolean;
			acceptTerms: boolean;
	  }
	| {
			action: "edit";
			selector: { id: string; name: string };
			patch: GrokBotConfigurationPatch;
			targetId: string;
			expectedProviderAccountRef: string;
			confirm: boolean;
	  }
	| {
			action: "inspect";
			selector: { id: string; name: string };
			targetId: string;
			expectedProviderAccountRef: string;
	  }
	| { action: "reconcile"; operationId: string; expectedProviderAccountRef: string };
interface Journal {
	version: 1;
	operationId: string;
	account: string;
	request: Extract<GrokBotLifecycleRequest, { action: "create" | "edit" }>;
	targetId?: string;
	effectDispatched: boolean;
	result?: GrokBotLifecycleResult;
}
export interface GrokBotLifecycleDependencies extends GrokBotServiceDependencies {
	journalDirectory?: string;
}
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function validSavedRequest(request: Journal["request"]): boolean {
	if (!request || request.confirm !== true) return false;
	if (request.action === "create")
		return (
			typeof request.name === "string" &&
			request.name.trim().length > 0 &&
			request.name.length <= 80 &&
			request.acceptTerms === true
		);
	return (
		request.action === "edit" &&
		!!request.selector &&
		typeof request.selector.id === "string" &&
		/^[a-f0-9-]{36}$/.test(request.selector.id) &&
		typeof request.selector.name === "string" &&
		request.selector.name.length > 0 &&
		!!request.patch &&
		typeof request.patch === "object" &&
		Object.entries(request.patch).every(
			([key, value]) => ["name", "title", "description"].includes(key) && typeof value === "string",
		)
	);
}

export function createGrokBotLifecycleService(
	options: BrowserProviderListOptions,
	dependencies: GrokBotLifecycleDependencies = {},
) {
	const directory =
		dependencies.journalDirectory ??
		path.join(getAuracallHomeDir(), "private", "grok", "bot-lifecycle");
	async function persist(file: string, record: Journal) {
		const tmp = `${file}.${randomUUID()}.tmp`;
		try {
			const h = await fs.open(tmp, "wx", 0o600);
			try {
				await h.writeFile(JSON.stringify(record));
				await h.sync();
			} finally {
				await h.close();
			}
			await fs.rename(tmp, file);
		} finally {
			await fs.rm(tmp, { force: true });
		}
	}
	return {
		async run(request: GrokBotLifecycleRequest): Promise<GrokBotLifecycleResult> {
			const unknown = (code: string) => ({
				...grokBotLifecycleUnknown(code),
				providerAccountRef: request.expectedProviderAccountRef,
			});
			if (!/^[a-f0-9]{64}$/.test(request.expectedProviderAccountRef))
				return unknown("grok_bot_expected_account_required");
			if (
				request.action === "edit" &&
				(request.patch.instructions !== undefined || request.patch.model !== undefined)
			)
				return {
					...unknown(
						request.patch.instructions !== undefined
							? "grok_bot_instructions_unavailable"
							: "grok_bot_model_defaults_unavailable",
					),
					status: "unavailable",
				};
			if ((request.action === "create" || request.action === "edit") && request.confirm !== true)
				return unknown("grok_bot_mutation_confirmation_required");
			if (request.action === "create" && request.acceptTerms !== true)
				return unknown("grok_bot_terms_confirmation_required");
			if (request.action === "create" && (!request.name.trim() || request.name.length > 80))
				return unknown("grok_bot_name_invalid");
			let record: Journal | undefined;
			let existing = false;
			let file: string | undefined;
			if (request.action !== "inspect") {
				const operationId =
					request.action === "reconcile"
						? request.operationId
						: hash([
								request.expectedProviderAccountRef,
								request.action,
								request.action === "create"
									? request.name
									: [
											request.selector.id,
											["name", "title", "description", "instructions", "model"].map((key) => [
												key,
												request.patch[key as keyof GrokBotConfigurationPatch] ?? null,
											]),
										],
							]);
				if (!/^[a-f0-9]{64}$/.test(operationId)) return unknown("grok_bot_operation_id_invalid");
				file = path.join(directory, `${operationId}.json`);
				await fs.mkdir(directory, { recursive: true, mode: 0o700 });
				if (request.action !== "reconcile") {
					record = {
						version: 1,
						operationId,
						account: request.expectedProviderAccountRef,
						request,
						targetId: request.action === "edit" ? request.targetId : undefined,
						effectDispatched: false,
					};
					try {
						const h = await fs.open(file, "wx", 0o600);
						try {
							await h.writeFile(JSON.stringify(record));
							await h.sync();
						} finally {
							await h.close();
						}
					} catch (error) {
						if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
						existing = true;
					}
				} else existing = true;
				if (existing) {
					try {
						record = JSON.parse(await fs.readFile(file, "utf8"));
					} catch {
						return {
							...unknown("grok_bot_journal_unavailable"),
							operationId,
							effectState: "unknown",
						};
					}
					if (
						!record ||
						record.version !== 1 ||
						record.operationId !== operationId ||
						record.account !== request.expectedProviderAccountRef ||
						typeof record.effectDispatched !== "boolean" ||
						!record.request ||
						!["create", "edit"].includes(record.request.action) ||
						record.request.expectedProviderAccountRef !== record.account ||
						!validSavedRequest(record.request) ||
						(record.targetId !== undefined &&
							(typeof record.targetId !== "string" || !record.targetId))
					)
						return { ...unknown("grok_bot_journal_invalid"), operationId, effectState: "unknown" };
					if (!record.targetId)
						return {
							...unknown("grok_bot_reconciliation_target_missing"),
							operationId,
							effectState: record.effectDispatched ? "unknown" : "none",
						};
				}
			}
			const retainedTarget = request.action === "inspect" ? request.targetId : record?.targetId;
			const connect =
				dependencies.connect ??
				(async (input: BrowserProviderListOptions) => {
					const { connectToGrokTab } = await import("./providers/grokAdapter.js");
					return connectToGrokTab(input);
				});
			let connection: Awaited<ReturnType<typeof connect>>;
			try {
				connection = await connect({
					...options,
					providerTrafficRequired: true,
					...(retainedTarget
						? { tabTargetId: retainedTarget, allowNavigation: false, preserveActiveTab: true }
						: {
								tabTargetId: undefined,
								tabLifecycle: "retain-new",
								preserveActiveTab: false,
								configuredUrl: "https://grok.com/",
								conversationId: undefined,
								projectId: undefined,
							}),
				});
			} catch {
				return {
					...unknown(
						existing
							? "grok_bot_operator_reconciliation_required"
							: "grok_bot_connection_unconfirmed",
					),
					...(retainedTarget ? { targetId: retainedTarget } : {}),
					...(record ? { operationId: record.operationId } : {}),
					effectState: record?.effectDispatched ? "unknown" : "none",
				};
			}
			let result: GrokBotLifecycleResult | undefined;
			let failure: unknown;
			try {
				const governor = resolveProviderTrafficGovernor(connection.client);
				if (
					!governor ||
					governor.attribution.provider !== "grok" ||
					!governor.admitBackendRequest ||
					!connection.targetId ||
					governor.attribution.targetId !== connection.targetId ||
					(retainedTarget && retainedTarget !== connection.targetId)
				)
					throw Error("grok_bot_exact_governed_target_required");
				if (!retainedTarget && (connection as { usedExisting?: boolean }).usedExisting !== false)
					throw Error("grok_bot_creation_requires_new_target");
				await governor.checkWarning?.(connection.client.Runtime);
				const admission = await governor.begin({
					kind: "provider-read",
					interactionClass: "generic",
					source: "provider:grok:bot-lifecycle",
					targetId: connection.targetId,
					abortSignal: options.abortSignal,
				});
				try {
					const verify =
						dependencies.verifyAccount ??
						(async (runtime: ChromeClient["Runtime"], input: BrowserProviderListOptions) => {
							const { checkGrokBrowserAuthPreflight } = await import("./providers/grokAdapter.js");
							const proof = await checkGrokBrowserAuthPreflight(runtime, input);
							return proof.ok
								? projectGrokAccountReference(proof.actualIdentity, "legacy-untagged")
								: null;
						});
					const check = async () => {
						if (
							(await verify(connection.client.Runtime as ChromeClient["Runtime"], options)) !==
							request.expectedProviderAccountRef
						)
							throw Error("grok_bot_account_not_verified");
					};
					await check();
					if (record && file) {
						record.targetId = connection.targetId;
						await persist(file, record);
					}
					const client = createGrokBotLifecycleClient(connection.client.Runtime, {
						abortSignal: options.abortSignal,
						effect: (kind, source, run) =>
							runGrokUiOperation({
								governor,
								runtime: connection.client.Runtime,
								kind,
								source,
								abortSignal: options.abortSignal,
								effect: run,
							}),
						beforeCommit: async () => {
							await governor.checkWarning?.(connection.client.Runtime);
							await check();
							if (!record || !file) throw Error("grok_bot_mutation_journal_required");
							record.effectDispatched = true;
							await persist(file, record);
						},
					});
					if (request.action === "inspect") {
						if (!(await client.open(request.selector)))
							result = unknown("grok_bot_exact_settings_unknown");
						else result = await client.inspect(request.selector);
					} else if (existing && record) {
						const original = record.request;
						const name =
							original.action === "create"
								? original.name
								: (original.patch.name ?? original.selector.name);
						result = await client.reconcile(
							name,
							original.action === "edit" ? original.selector.id : undefined,
						);
						if (
							result.status === "supported" &&
							original.action === "edit" &&
							result.bot &&
							Object.entries(original.patch).some(
								([key, value]) => result?.bot?.[key as keyof typeof result.bot] !== value,
							)
						)
							result = {
								...result,
								status: "unknown",
								code: "grok_bot_reconciliation_saved_fields_mismatch",
							};
						result.effectState = record.effectDispatched
							? result.status === "supported"
								? "completed"
								: "unknown"
							: "none";
					} else if (request.action === "create") result = await client.create(request.name);
					else if (request.action === "edit")
						result = await client.edit(request.selector, request.patch);
					else result = unknown("grok_bot_reconciliation_unavailable");
					await check();
					result = {
						...result,
						providerAccountRef: request.expectedProviderAccountRef,
						targetId: connection.targetId,
						...(record ? { operationId: record.operationId } : {}),
					};
					if (record && file) {
						record.result = result;
						record.effectDispatched = result.effectState !== "none";
						try {
							await persist(file, record);
						} catch {
							result = { ...result, journalPersistence: "failed" };
						}
					}
					await admission.settle({
						outcome: result.status === "unknown" ? "failed" : "succeeded",
						effectState: result.effectState === "unknown" ? "outcome-unknown" : "settled",
						probeContext: connection.client.Runtime,
					});
				} catch (error) {
					await admission.settle({
						outcome: "failed",
						effectState: record?.effectDispatched ? "outcome-unknown" : "none",
						error: "grok_bot_lifecycle_unconfirmed",
						probeContext: connection.client.Runtime,
					});
					throw error;
				}
			} catch (error) {
				failure = error;
			} finally {
				try {
					await connection.client.close();
				} catch (error) {
					failure = failure
						? new AggregateError([failure, error], "grok_bot_lifecycle_cleanup_failed")
						: error;
				}
			}
			// Physical target is retained across every mutation and ambiguous outcome.
			if (failure)
				return {
					...unknown(
						existing
							? "grok_bot_operator_reconciliation_required"
							: "grok_bot_lifecycle_unconfirmed",
					),
					targetId: connection.targetId,
					effectState: record?.effectDispatched ? "unknown" : "none",
					...(record ? { operationId: record.operationId } : {}),
				};
			return result ?? unknown("grok_bot_lifecycle_unknown");
		},
	};
}
