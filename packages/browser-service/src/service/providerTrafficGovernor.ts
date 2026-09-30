import crypto from "node:crypto";

import type { BrowserInteractionClass, BrowserInteractionGovernor } from "./interactionGovernor.js";
import type { ProviderWarningClassification } from "./interactionLedger.js";
import type {
	BrowserMutationAuditSink,
	BrowserMutationKind,
	BrowserMutationOutcome,
	BrowserMutationRecord,
} from "./mutationDispatcher.js";

export interface ProviderTrafficAttribution {
	provider: string;
	runtimeProfileId: string;
	managedBrowserProfile: string;
	workloadId: string;
	operationId: string;
	tabLeaseId: string;
}

export interface ProviderTrafficWarning {
	classification: ProviderWarningClassification;
	reason: string;
	cooldownUntil?: string | null;
}

export interface ProviderTrafficActionInput {
	kind: BrowserMutationKind;
	interactionClass: BrowserInteractionClass;
	source: string;
	abortSignal?: AbortSignal | null;
	requestedUrl?: string | null;
	fromUrl?: string | null;
	toUrl?: string | null;
	targetId?: string | null;
	reused?: boolean;
	reason?: string | null;
	fallbackUsed?: boolean;
}

export interface ProviderTrafficActionSettlement {
	outcome: BrowserMutationOutcome;
	toUrl?: string | null;
	targetId?: string | null;
	reused?: boolean;
	reason?: string | null;
	fallbackUsed?: boolean;
	error?: string | null;
	probeContext?: unknown;
}

export interface ProviderTrafficAction {
	id: string;
	settle(details: ProviderTrafficActionSettlement): Promise<void>;
}

export interface ProviderTrafficGovernor {
	readonly attribution: ProviderTrafficAttribution;
	begin(input: ProviderTrafficActionInput): Promise<ProviderTrafficAction>;
}

export interface ProviderTrafficAuthority {
	governor: ProviderTrafficGovernor;
	close(input?: {
		outcome?: "succeeded" | "failed" | "cancelled";
		effectState?: "none" | "settled" | "outcome-unknown";
		reason?: string | null;
	}): Promise<void>;
}

export interface ProviderTrafficAuthorityFactory {
	acquire(input: { targetId: string }): Promise<ProviderTrafficAuthority>;
}

export class ProviderTrafficAttributionError extends Error {
	constructor(readonly field: keyof ProviderTrafficAttribution) {
		super(`Provider traffic attribution requires ${field}.`);
		this.name = "ProviderTrafficAttributionError";
	}
}

export class ProviderTrafficWarningError extends Error {
	constructor(readonly warning: ProviderTrafficWarning) {
		super(`Provider traffic stopped after ${warning.classification}: ${warning.reason}`);
		this.name = "ProviderTrafficWarningError";
	}
}

export class ProviderTrafficGovernorRequiredError extends Error {
	constructor(readonly source: string) {
		super(`Provider traffic governor is required before physical action: ${source}.`);
		this.name = "ProviderTrafficGovernorRequiredError";
	}
}

export function createProviderTrafficGovernor(input: {
	attribution: ProviderTrafficAttribution;
	interactionGovernor: BrowserInteractionGovernor;
	mutationAudit: BrowserMutationAuditSink;
	settleInteraction?: (input: {
		outcome: "succeeded" | "failed" | "cancelled";
		effectState: "none" | "settled" | "outcome-unknown";
		reason?: string | null;
	}) => Promise<void>;
	assertLease?: (attribution: ProviderTrafficAttribution) => Promise<void> | void;
	probeWarning?: (
		context: unknown,
		attribution: ProviderTrafficAttribution,
	) => Promise<ProviderTrafficWarning | null>;
	persistWarning?: (
		warning: ProviderTrafficWarning,
		attribution: ProviderTrafficAttribution,
	) => Promise<void>;
	createActionId?: () => string;
}): ProviderTrafficGovernor {
	const attribution = normalizeAttribution(input.attribution);
	const createActionId = input.createActionId ?? crypto.randomUUID;
	let observedWarning: ProviderTrafficWarning | null = null;

	return {
		attribution,
		async begin(actionInput) {
			if (observedWarning) throw new ProviderTrafficWarningError(observedWarning);
			actionInput.abortSignal?.throwIfAborted();
			await input.assertLease?.(attribution);
			await input.interactionGovernor.beforeInteraction(
				actionInput.interactionClass,
				actionInput.abortSignal,
			);
			actionInput.abortSignal?.throwIfAborted();

			const id = createActionId();
			const started: BrowserMutationRecord = {
				id,
				phase: "start",
				kind: actionInput.kind,
				source: actionInput.source,
				at: new Date().toISOString(),
				requestedUrl: actionInput.requestedUrl ?? null,
				fromUrl: actionInput.fromUrl ?? null,
				toUrl: actionInput.toUrl ?? null,
				targetId: actionInput.targetId ?? null,
				reused: actionInput.reused,
				reason: actionInput.reason ?? null,
				fallbackUsed: actionInput.fallbackUsed,
			};
			// This record is part of admission, not optional diagnostics. If it cannot
			// be persisted, the physical browser action must not start.
			await input.mutationAudit(started);

			let settled = false;
			return {
				id,
				async settle(details) {
					if (settled) throw new Error(`Provider traffic action ${id} is already settled.`);
					settled = true;
					await input.mutationAudit({
						...started,
						phase: "complete",
						at: new Date().toISOString(),
						toUrl: details.toUrl ?? started.toUrl ?? null,
						targetId: details.targetId ?? started.targetId ?? null,
						reused: details.reused ?? started.reused,
						reason: details.reason ?? started.reason ?? null,
						fallbackUsed: details.fallbackUsed ?? started.fallbackUsed,
						outcome: details.outcome,
						error: details.error ?? null,
					});
					await input.settleInteraction?.({
						outcome: details.outcome === "succeeded" ? "succeeded" : "failed",
						effectState: "settled",
						reason: details.error ?? details.reason ?? null,
					});

					const warning = input.probeWarning
						? await input.probeWarning(details.probeContext, attribution)
						: null;
					if (!warning) return;
					if (!input.persistWarning) {
						throw new Error("Provider traffic warning persistence is not configured.");
					}
					await input.persistWarning(warning, attribution);
					observedWarning = warning;
					throw new ProviderTrafficWarningError(warning);
				},
			};
		},
	};
}

function normalizeAttribution(input: ProviderTrafficAttribution): ProviderTrafficAttribution {
	const normalized = { ...input };
	for (const field of Object.keys(normalized) as Array<keyof ProviderTrafficAttribution>) {
		const value = normalized[field]?.trim();
		if (!value) throw new ProviderTrafficAttributionError(field);
		normalized[field] = value;
	}
	return Object.freeze(normalized);
}
