// biome-ignore-all lint/style/useNamingConvention: CDP and provider identity wire names are case-sensitive.

import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getAuracallHomeDir } from "../auracallHome.js";
import { projectGrokAccountReference } from "./grokAccountReference.js";
import type {
	GrokConnectorConnection,
	GrokConnectorServiceDependencies,
} from "./grokConnectorsService.js";
import {
	createGrokConnectorInstallationClient,
	type GrokConnectorInstallationInput,
	type GrokConnectorInstallationOutcome,
	validateGrokConnectorInstallationInput,
} from "./providers/grokConnectorInstallation.js";
import { resolveProviderTrafficGovernor } from "./providers/mutationAudit.js";
import type { BrowserProviderListOptions } from "./providers/types.js";
import type { ChromeClient } from "./types.js";
export interface GrokConnectorInstallationRequest {
	input: GrokConnectorInstallationInput;
	expectedProviderAccountRef: string;
	confirm?: boolean;
	reconciliationTarget?: { targetId: string; connectorId: string };
}
export interface GrokConnectorInstallationResult extends GrokConnectorInstallationOutcome {
	operationId: string;
	retrySafe: boolean;
	targetId?: string;
	journalPersistence?: "failed";
}
export interface GrokConnectorInstallationService {
	install(request: GrokConnectorInstallationRequest): Promise<GrokConnectorInstallationResult>;
	reconcile(request: GrokConnectorInstallationRequest): Promise<GrokConnectorInstallationResult>;
}
interface Journal {
	reconciliations?: {
		previousTargetId: string;
		targetId: string;
		connectorId: string;
		verifiedAt: string;
		previousResult?: GrokConnectorInstallationResult;
	}[];
	version: 1;
	operationId: string;
	input: GrokConnectorInstallationInput;
	providerAccountRef: string;
	runtimeProfile: string;
	targetId?: string;
	effectDispatched: boolean;
	result?: GrokConnectorInstallationResult;
}
export interface GrokConnectorInstallationDependencies extends GrokConnectorServiceDependencies {
	journalDirectory?: string;
	resolveReconciliationOptions?: (targetId: string) => Promise<BrowserProviderListOptions>;
}
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
/** One exclusive durable intent per account/profile/input. Existing intents are
 * observational only, including after process death. No implicit retry/reset. */
export function createGrokConnectorInstallationService(
	options: BrowserProviderListOptions,
	dependencies: GrokConnectorInstallationDependencies = {},
): GrokConnectorInstallationService {
	const profile = options.providerSessionAuthorization?.context.auracallRuntimeProfile ?? "default";
	const directory =
		dependencies.journalDirectory ??
		path.join(getAuracallHomeDir(), "private", "grok", "connector-installations");
	async function persist(file: string, record: Journal) {
		const temporary = `${file}.${randomUUID()}.tmp`;
		try {
			const handle = await fs.open(temporary, "wx", 0o600);
			try {
				await handle.writeFile(JSON.stringify(record));
				await handle.sync();
			} finally {
				await handle.close();
			}
			await fs.rename(temporary, file);
		} finally {
			await fs.rm(temporary, { force: true });
		}
	}
	async function run(
		mode: "install" | "reconcile",
		request: GrokConnectorInstallationRequest,
	): Promise<GrokConnectorInstallationResult> {
		options.abortSignal?.throwIfAborted();
		const input = validateGrokConnectorInstallationInput(request.input);
		const recovery = request.reconciliationTarget;
		if (
			recovery &&
			(mode !== "reconcile" ||
				input.kind !== "custom" ||
				!/^[A-Za-z0-9-]{1,512}$/.test(recovery.targetId) ||
				!/^connector_[0-9a-f-]{36}$/i.test(recovery.connectorId))
		)
			throw new Error("grok_connector_reconciliation_target_invalid");
		if (!/^[a-f0-9]{64}$/.test(request.expectedProviderAccountRef))
			throw new Error("grok_connector_install_provider_account_required");
		if (mode === "install" && request.confirm !== true)
			throw new Error("grok_connector_install_confirmation_required");
		const operationId = digest(
			JSON.stringify([
				request.expectedProviderAccountRef,
				input.kind,
				input.endpoint ?? input.connectorId ?? input.name,
			]),
		);
		const file = path.join(directory, `${operationId}.json`);
		let record: Journal = {
			version: 1,
			operationId,
			input,
			providerAccountRef: request.expectedProviderAccountRef,
			runtimeProfile: profile,
			effectDispatched: false,
		};
		let existing = false;
		let explicitContinuation = false;
		const base = (
			status: GrokConnectorInstallationResult["status"],
			code: string,
		): GrokConnectorInstallationResult => ({
			status,
			code,
			input,
			providerAccountRef: request.expectedProviderAccountRef,
			effectDispatched: record.effectDispatched,
			operationId,
			retrySafe: !record.effectDispatched,
			...(record.targetId ? { targetId: record.targetId } : {}),
		});
		await fs.mkdir(directory, { recursive: true, mode: 0o700 });
		if (mode === "install") {
			try {
				const handle = await fs.open(file, "wx", 0o600);
				try {
					await handle.writeFile(JSON.stringify(record));
					await handle.sync();
				} finally {
					await handle.close();
				}
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
				existing = true;
			}
		} else existing = true;
		if (existing) {
			let saved: Journal;
			try {
				saved = JSON.parse(await fs.readFile(file, "utf8"));
			} catch {
				return {
					...base("unconfirmed", "grok_connector_install_journal_unavailable"),
					retrySafe: false,
				};
			}
			if (
				!saved ||
				saved.version !== 1 ||
				typeof saved.effectDispatched !== "boolean" ||
				(saved.targetId !== undefined &&
					(typeof saved.targetId !== "string" || !saved.targetId || saved.targetId.length > 512)) ||
				saved.operationId !== operationId ||
				saved.providerAccountRef !== request.expectedProviderAccountRef ||
				typeof saved.runtimeProfile !== "string"
			)
				throw new Error("grok_connector_install_journal_invalid");
			record = saved;
			if (JSON.stringify(saved.input) !== JSON.stringify(input) || saved.runtimeProfile !== profile)
				return {
					...base("unconfirmed", "grok_connector_install_custody_conflict"),
					retrySafe: false,
				};
			if (!record.targetId)
				return {
					...base("unconfirmed", "grok_connector_install_reconcile_required"),
					retrySafe: false,
				};
		}
		// An explicit confirmed install can continue exactly one recorded preparation
		// refusal. Never reopen an uncertain, failed, incomplete or unjournaled effect.
		if (
			existing &&
			mode === "install" &&
			!record.effectDispatched &&
			record.result?.status === "unsupported" &&
			record.result.retrySafe === true &&
			record.result.effectDispatched === false &&
			record.result.code === "grok_connector_install_existing_endpoint_unobserved"
		) {
			try {
				const claim = await fs.open(`${file}.continuation`, "wx", 0o600);
				try {
					await claim.writeFile(operationId);
					await claim.sync();
				} finally {
					await claim.close();
				}
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
				return {
					...base("unconfirmed", "grok_connector_install_continuation_claimed"),
					retrySafe: false,
				};
			}
			explicitContinuation = true;
		}
		options.abortSignal?.throwIfAborted();
		const connect =
			dependencies.connect ??
			(async (inputOptions: BrowserProviderListOptions) => {
				const { connectToGrokTab } = await import("./providers/grokAdapter.js");
				return connectToGrokTab(inputOptions);
			});
		let connection: GrokConnectorConnection | undefined;
		let retainTarget = existing;
		let dispatched = false;
		let result: GrokConnectorInstallationResult | undefined;
		try {
			const sessionOptions = recovery
				? await dependencies.resolveReconciliationOptions?.(recovery.targetId)
				: options;
			if (!sessionOptions || (recovery && sessionOptions.tabTargetId !== recovery.targetId))
				throw new Error("grok_connector_reconciliation_options_required");
			connection = await connect({
				...sessionOptions,
				providerTrafficRequired: true,
				...(recovery
					? { tabTargetId: recovery.targetId }
					: record.targetId
						? { tabTargetId: record.targetId }
						: {}),
			});
			const activeConnection = connection;
			const governor = resolveProviderTrafficGovernor(connection.client);
			if (!governor || governor.attribution.provider !== "grok" || !governor.admitBackendRequest)
				throw new Error("grok_connector_install_governor_required");
			if (
				!connection.targetId ||
				governor.attribution.targetId !== connection.targetId ||
				((recovery?.targetId ?? record.targetId) &&
					(recovery?.targetId ?? record.targetId) !== connection.targetId)
			)
				throw new Error("grok_connector_install_target_not_verified");
			await governor.checkWarning?.(connection.client.Runtime);
			const action = await governor.begin({
				kind:
					mode === "install" && (!existing || explicitContinuation)
						? "in-page-click"
						: "provider-read",
				interactionClass: "generic",
				source: "provider:grok:connector-installation",
				targetId: connection.targetId,
				abortSignal: options.abortSignal,
			});
			try {
				const { checkGrokBrowserAuthPreflight } = await import("./providers/grokAdapter.js");
				const verify = async () => {
					const proof = await checkGrokBrowserAuthPreflight(
						activeConnection.client.Runtime as ChromeClient["Runtime"],
						sessionOptions,
					);
					if (
						!proof.ok ||
						projectGrokAccountReference(proof.actualIdentity, "typed-v1") !==
							request.expectedProviderAccountRef
					)
						throw new Error("grok_connector_install_account_not_verified");
					return proof.actualIdentity?.id;
				};
				const providerUserId = await verify();
				const previousTargetId = record.targetId;
				if (!recovery) record.targetId = connection.targetId;
				const client = createGrokConnectorInstallationClient(connection.client.Runtime, {
					providerAccountRef: request.expectedProviderAccountRef,
					providerUserId,
					abortSignal: options.abortSignal,
					pressEscape: connection.client.Input
						? async () => {
								await activeConnection.client.Input?.dispatchKeyEvent({
									type: "keyDown",
									key: "Escape",
									code: "Escape",
									windowsVirtualKeyCode: 27,
								});
								await activeConnection.client.Input?.dispatchKeyEvent({
									type: "keyUp",
									key: "Escape",
									code: "Escape",
									windowsVirtualKeyCode: 27,
								});
							}
						: undefined,
					beforeCommit: async () => {
						await governor.checkWarning?.(activeConnection.client.Runtime);
						await verify();
						record.effectDispatched = true;
						await persist(file, record);
						dispatched = true;
						retainTarget = true;
					},
				});
				let outcome: GrokConnectorInstallationOutcome;
				if ((existing && !explicitContinuation) || mode === "reconcile")
					outcome = await client.reconcile(input, recovery?.connectorId);
				else {
					outcome = await client.prepare(input);
					if (mode === "install" && outcome.prepared)
						outcome = await client.commit(outcome.prepared);
				}
				await verify();
				if (recovery && outcome.status === "already-connected" && previousTargetId) {
					record.reconciliations = [
						...(record.reconciliations ?? []),
						{
							previousTargetId,
							targetId: connection.targetId,
							connectorId: recovery.connectorId,
							verifiedAt: new Date().toISOString(),
							previousResult: record.result,
						},
					];
					record.targetId = connection.targetId;
				}
				record.effectDispatched = existing
					? record.effectDispatched || outcome.effectDispatched
					: outcome.effectDispatched;
				// Preparation tokens belong to this transport only; never publish replayable tokens.
				const { prepared: _prepared, ...safe } = outcome;
				result = {
					...safe,
					operationId,
					effectDispatched: record.effectDispatched,
					retrySafe: !record.effectDispatched,
					targetId: connection.targetId,
				};
				retainTarget = record.effectDispatched || outcome.status === "prepared";
				record.result = result;
				try {
					await persist(file, record);
				} catch {
					result = { ...result, journalPersistence: "failed", retrySafe: false };
					retainTarget = true;
				}
				await action.settle({
					outcome: ["failed", "unconfirmed"].includes(result.status) ? "failed" : "succeeded",
					effectState:
						record.effectDispatched &&
						result.status !== "completed" &&
						result.status !== "already-connected" &&
						!(
							result.status === "failed" &&
							result.code === "grok_connector_install_connection_failed"
						)
							? "outcome-unknown"
							: "settled",
					probeContext: connection.client.Runtime,
				});
			} catch (error) {
				retainTarget = retainTarget || dispatched;
				await action.settle({
					outcome: "failed",
					effectState: retainTarget ? "outcome-unknown" : "settled",
					error: "grok_connector_install_failed",
					probeContext: connection.client.Runtime,
				});
				throw error;
			}
		} catch {
			result = {
				...base(
					dispatched || record.effectDispatched ? "unconfirmed" : "failed",
					dispatched || record.effectDispatched
						? "grok_connector_install_reconcile_required"
						: "grok_connector_install_failed",
				),
				retrySafe: false,
			};
			record.result = result;
			try {
				await persist(file, record);
			} catch {
				result.journalPersistence = "failed";
			}
		} finally {
			if (connection) {
				try {
					await connection.client.close();
				} catch {
					retainTarget = true;
					result = {
						...(result ?? base("unconfirmed", "grok_connector_install_cleanup_unknown")),
						status: "unconfirmed",
						code: "grok_connector_install_cleanup_unknown",
						retrySafe: false,
					};
				}
				if (connection.shouldClose && connection.targetId && !retainTarget) {
					if (dependencies.closeTarget) await dependencies.closeTarget(connection);
					else {
						const { default: CDP } = await import("./cdp.js");
						await CDP.Close({
							host: connection.host,
							port: connection.port,
							id: connection.targetId,
						});
					}
				}
			}
		}
		return result ?? base("failed", "grok_connector_install_failed");
	}
	return {
		install: (request) => run("install", request),
		reconcile: (request) => run("reconcile", request),
	};
}
