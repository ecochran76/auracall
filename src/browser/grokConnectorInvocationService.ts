import type { GrokConnectorToolTrace } from "./providers/grokConnectorToolTrace.js";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export interface GrokConnectorInvocationRequest {
	action: "invoke";
	targetId: string;
	expectedProviderAccountRef: string;
	selector: { id: string; name: string; endpoint: string };
	prompt: string;
	confirm: true;
	runtimeProfile?: string;
}
export interface GrokConnectorInvocationResult {
	status: "unconfirmed" | "blocked";
	code: string;
	operationId: string;
	providerAccountRef: string;
	targetId: string;
	responseId: string | null;
	text: string | null;
	effectState: "none" | "unknown";
	retrySafe: boolean;
	toolTrace: GrokConnectorToolTrace | null;
	cleanup?: "failed";
}
/** Account-bound browser port. prepare must qualify exact Connector endpoint and
 * selection before any prompt dispatch; observe never writes a prompt. */
export interface GrokConnectorInvocationPort {
	prepare(): Promise<boolean | string>;
	submit(): Promise<void>;
	observe(): Promise<{
		responseId: string | null;
		text: string | null;
		toolTrace?: GrokConnectorToolTrace | null;
	}>;
	close?(): Promise<void>;
}
export function createGrokConnectorInvocationService(deps: {
	directory: string;
	open(request: GrokConnectorInvocationRequest): Promise<GrokConnectorInvocationPort>;
}) {
	return {
		async invoke(request: GrokConnectorInvocationRequest): Promise<GrokConnectorInvocationResult> {
			const identity = {
				runtimeProfile: request.runtimeProfile ?? "default",
				targetId: request.targetId,
				providerAccountRef: request.expectedProviderAccountRef,
				selector: {
					id: request.selector.id,
					name: request.selector.name,
					endpoint: request.selector.endpoint,
				},
				prompt: request.prompt,
			};
			const operationId = createHash("sha256").update(JSON.stringify(identity)).digest("hex");
			const base: GrokConnectorInvocationResult = {
				status: "blocked",
				code: "grok_connector_invocation_not_dispatched",
				operationId,
				providerAccountRef: request.expectedProviderAccountRef,
				targetId: request.targetId,
				responseId: null,
				text: null,
				effectState: "none",
				retrySafe: true,
				toolTrace: null,
			};
			if (
				request.confirm !== true ||
				!request.prompt.trim() ||
				request.prompt.length > 100000 ||
				!request.targetId ||
				!/^[a-f0-9]{64}$/.test(request.expectedProviderAccountRef)
			)
				return { ...base, code: "grok_connector_invocation_request_invalid" };
			const fence = path.join(deps.directory, `${operationId}.json`);
			let existing = false;
			try {
				await fs.mkdir(deps.directory, { recursive: true, mode: 0o700 });
				const saved = JSON.parse(await fs.readFile(fence, "utf8"));
				if (JSON.stringify(saved.identity) !== JSON.stringify(identity))
					throw new Error("grok_connector_invocation_identity_changed");
				existing = true;
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ENOENT")
					return {
						...base,
						status: "unconfirmed",
						code: "grok_connector_invocation_journal_unavailable",
						effectState: "unknown",
						retrySafe: false,
					};
			}
			let port: GrokConnectorInvocationPort;
			try {
				port = await deps.open(request);
			} catch {
				return {
					...base,
					status: existing ? "unconfirmed" : "blocked",
					code: "grok_connector_invocation_browser_unavailable",
					effectState: existing ? "unknown" : "none",
					retrySafe: !existing,
				};
			}
			let dispatched = existing;
			let outcome = base;
			try {
				if (!existing) {
					const prepared = await port.prepare();
					if (prepared !== true) {
						outcome = {
							...base,
							code:
								typeof prepared === "string"
									? prepared
									: "grok_connector_invocation_selection_not_verified",
						};
						return outcome;
					}
					// Exclusive durable fence is committed before submit. A crash/lost response
					// leaves this exact intent reconcilable, never eligible for automatic replay.
					try {
						const handle = await fs.open(fence, "wx", 0o600);
						try {
							await handle.writeFile(
								JSON.stringify({ operationId, identity, phase: "dispatching" }),
							);
							await handle.sync();
						} finally {
							await handle.close();
						}
					} catch (error) {
						if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
						existing = true;
					}
					const directory = await fs.open(deps.directory, "r");
					try {
						await directory.sync();
					} finally {
						await directory.close();
					}
					dispatched = true;
					if (!existing) await port.submit();
				}
				let anchoredResponse: string | undefined;
				if (existing) {
					const names = (await fs.readdir(deps.directory)).filter(
						(n) => n.startsWith(`${operationId}.observation-`) && n.endsWith(".json"),
					);
					if (names.length > 100) throw new Error("grok_connector_observation_limit");
					const ids = new Set<string>();
					for (const name of names) {
						const saved = JSON.parse(await fs.readFile(path.join(deps.directory, name), "utf8"));
						if (saved.operationId !== operationId)
							throw new Error("grok_connector_observation_identity");
						if (typeof saved.responseId === "string" && saved.responseId) ids.add(saved.responseId);
					}
					if (ids.size === 1) anchoredResponse = [...ids][0];
				}
				let observation = await port.observe();
				const responseChanged =
					existing && (!anchoredResponse || observation.responseId !== anchoredResponse);
				if (responseChanged) observation = { responseId: null, text: null, toolTrace: null };
				const result: GrokConnectorInvocationResult = {
					...base,
					...observation,
					status: "unconfirmed",
					code: responseChanged
						? "grok_connector_invocation_response_changed"
						: observation.toolTrace
							? observation.toolTrace.otherTools.length
								? "grok_connector_additional_tool_activity_observed"
								: "grok_connector_tool_trace_observed"
							: "grok_connector_native_tool_trace_unconfirmed",
					effectState: "unknown",
					retrySafe: false,
				};
				await fs.writeFile(
					path.join(deps.directory, `${operationId}.observation-${randomUUID()}.json`),
					JSON.stringify(result),
					{ flag: "wx", mode: 0o600 },
				);
				outcome = result;
				return outcome;
			} catch {
				outcome = {
					...base,
					status: dispatched ? "unconfirmed" : "blocked",
					code: dispatched
						? "grok_connector_submission_outcome_unknown"
						: "grok_connector_invocation_preparation_failed",
					effectState: dispatched ? "unknown" : "none",
					retrySafe: !dispatched,
				};
				return outcome;
			} finally {
				try {
					await port.close?.();
				} catch {
					outcome.cleanup = "failed";
				}
			}
		},
	};
}
