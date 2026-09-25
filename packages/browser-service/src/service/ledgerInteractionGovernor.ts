import type {
	ProviderInteractionClass,
	ProviderInteractionLedger,
	ProviderInteractionPolicy,
	ProviderInteractionScope,
	ProviderInteractionOutcome,
} from "./interactionLedger.js";
import type {
	BrowserInteractionClass,
	BrowserInteractionGovernor,
} from "./interactionGovernor.js";

export interface LedgerBackedBrowserInteractionGovernor extends BrowserInteractionGovernor {
	finish(input?: {
		outcome?: ProviderInteractionOutcome;
		effectState?: "none" | "settled" | "outcome-unknown";
		reason?: string | null;
	}): Promise<void>;
	close(input?: {
		outcome?: ProviderInteractionOutcome;
		effectState?: "none" | "settled" | "outcome-unknown";
		reason?: string | null;
	}): Promise<void>;
}

export class ProviderInteractionAdmissionError extends Error {
	constructor(readonly reason: string) {
		super(`Provider interaction admission denied: ${reason}.`);
		this.name = "ProviderInteractionAdmissionError";
	}
}

export class ProviderInteractionGovernorClosedError extends Error {
	constructor() {
		super("Provider interaction governor is closed.");
		this.name = "ProviderInteractionGovernorClosedError";
	}
}

export function createLedgerBackedBrowserInteractionGovernor(input: {
	ledger: ProviderInteractionLedger;
	scope: ProviderInteractionScope;
	workloadId: string;
	operationId: string;
	tabLeaseId: string;
	policy: ProviderInteractionPolicy;
	baseGovernor: BrowserInteractionGovernor;
	reservationTtlMs?: number;
	now?: () => Date;
}): LedgerBackedBrowserInteractionGovernor {
	const now = input.now ?? (() => new Date());
	let activeReservationId: string | null = null;
	let closed = false;

	const finish = async (
		settlement: {
			outcome?: ProviderInteractionOutcome;
			effectState?: "none" | "settled" | "outcome-unknown";
			reason?: string | null;
		} = {},
	) => {
		if (!activeReservationId) return;
		const reservationId = activeReservationId;
		activeReservationId = null;
		const settled = await input.ledger.settle({
			reservationId,
			settledAt: now().toISOString(),
			effectState: settlement.effectState ?? "settled",
			outcome: settlement.outcome ?? "succeeded",
			stopReason: settlement.reason,
		});
		if (!settled.ok) {
			throw new Error(`Provider interaction settlement failed: ${settled.reason}.`);
		}
	};

	return {
		async beforeInteraction(kind = "generic", abortSignal) {
			if (closed) throw new ProviderInteractionGovernorClosedError();
			await finish();
			await input.baseGovernor.beforeInteraction(kind, abortSignal);
			if (closed) throw new ProviderInteractionGovernorClosedError();
			const admission = await input.ledger.reserve({
				scope: input.scope,
				workloadId: input.workloadId,
				operationId: input.operationId,
				tabLeaseId: input.tabLeaseId,
				interactionClass: toLedgerInteractionClass(kind),
				mutability: isMutating(kind) ? "provider-mutating" : "read-only",
				startsNewConversation: false,
				now: now().toISOString(),
				reservationTtlMs: input.reservationTtlMs ?? 30_000,
				policy: input.policy,
			});
			if (!admission.allowed) throw new ProviderInteractionAdmissionError(admission.reason);
			if (closed) {
				const started = await input.ledger.start({
					reservationId: admission.reservation.reservationId,
					startedAt: now().toISOString(),
				});
				if (started.ok) {
					activeReservationId = admission.reservation.reservationId;
					await finish({
						outcome: "cancelled",
						effectState: "none",
						reason: "interaction-governor-closed",
					});
				}
				throw new ProviderInteractionGovernorClosedError();
			}
			const started = await input.ledger.start({
				reservationId: admission.reservation.reservationId,
				startedAt: now().toISOString(),
			});
			if (!started.ok) {
				throw new Error(`Provider interaction start failed: ${started.reason}.`);
			}
			activeReservationId = admission.reservation.reservationId;
			if (closed) {
				await finish({
					outcome: "cancelled",
					effectState: "none",
					reason: "interaction-governor-closed",
				});
				throw new ProviderInteractionGovernorClosedError();
			}
		},
		finish,
		async close(settlement = {}) {
			closed = true;
			await finish(settlement);
		},
	};
}

function toLedgerInteractionClass(kind: BrowserInteractionClass): ProviderInteractionClass {
	switch (kind) {
		case "conversation-read":
			return "conversation-read";
		case "page-refresh":
			return "reload";
		case "renavigation":
			return "navigation";
		case "upload-submit":
		case "provider-recovery":
			return "provider-mutation";
		case "generic":
			return "list-read";
	}
}

function isMutating(kind: BrowserInteractionClass): boolean {
	return kind === "upload-submit" || kind === "provider-recovery";
}
