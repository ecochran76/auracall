import type {
	ProviderInteractionAdmission,
	ProviderInteractionLedger,
	ProviderInteractionPolicy,
	ProviderWarningClassification,
} from "../../packages/browser-service/src/service/interactionLedger.js";
import type {
	BrowserTabLease,
	BrowserTabLeaseRegistry,
	TabLeaseClaim,
	TabLeaseScope,
	TabLeaseWorkload,
} from "../../packages/browser-service/src/service/tabLeaseRegistry.js";
import type { PromptInput, PromptResult } from "./llmService/types.js";
import {
	assertChatgptLeasedPromptResult,
	buildChatgptLeasedPromptOptions,
	type ChatgptLeasedPromptRunner,
} from "./providers/chatgptTabAffinity.js";
import type { BrowserProviderListOptions } from "./providers/types.js";

export type ChatgptConversationExecutionResult =
	| { status: "completed"; result: PromptResult }
	| {
			status: "denied";
			admission: Extract<ProviderInteractionAdmission, { allowed: false }>;
	  };

type ChatgptTabAffinityExecutionInput = {
	mode: "tab-affinity";
	registry: BrowserTabLeaseRegistry;
	ledger: ProviderInteractionLedger;
	lease: BrowserTabLease;
	claim: TabLeaseClaim;
	operationId: string;
	endpoint: { host: string; port: number };
	input: PromptInput;
	options?: BrowserProviderListOptions;
	runPrompt: ChatgptLeasedPromptRunner;
	policy: ProviderInteractionPolicy;
	reservationTtlMs: number;
	idleTtlMs: number;
	now?: () => Date;
	classifyProviderWarning?: ProviderWarningClassifier;
};

export type ProviderWarningClassifier = (error: unknown) => {
	classification: ProviderWarningClassification;
	reason: string;
	cooldownUntil?: string | null;
} | null;

export type ExecuteChatgptConversationInput =
	| {
			mode: "serialized";
			input: PromptInput;
			runSerialized: (input: PromptInput) => Promise<PromptResult>;
	  }
	| ChatgptTabAffinityExecutionInput;

export type ProvisionedChatgptTab = Pick<
	ChatgptTabAffinityExecutionInput,
	"lease" | "claim" | "endpoint"
>;

export interface ExecuteProvisionedChatgptConversationInput {
	registry: BrowserTabLeaseRegistry;
	ledger: ProviderInteractionLedger;
	scope: TabLeaseScope;
	workload: Extract<TabLeaseWorkload, { kind: "conversation" | "new-conversation" }>;
	operationId: string;
	input: PromptInput;
	options?: BrowserProviderListOptions;
	runPrompt: ChatgptLeasedPromptRunner;
	acquireTab: (input: { interactionReservationId: string }) => Promise<ProvisionedChatgptTab>;
	policy: ProviderInteractionPolicy;
	reservationTtlMs: number;
	idleTtlMs: number;
	now?: () => Date;
	classifyProviderWarning: ProviderWarningClassifier;
}

export async function executeChatgptConversation(
	request: ExecuteChatgptConversationInput,
): Promise<ChatgptConversationExecutionResult> {
	if (request.mode === "serialized") {
		return { status: "completed", result: await request.runSerialized(request.input) };
	}
	const now = request.now ?? (() => new Date());
	const admittedAt = now().toISOString();
	const startsNewConversation = request.lease.workload.kind === "new-conversation";
	const admission = await request.ledger.reserve({
		scope: {
			provider: "chatgpt",
			tenantKey: request.lease.scope.tenantKey,
			runtimeProfileId: request.lease.scope.runtimeProfileId,
			managedBrowserProfile: request.lease.scope.managedBrowserProfile,
		},
		workloadId: workloadId(request.lease),
		operationId: request.operationId,
		tabLeaseId: request.lease.leaseId,
		interactionClass: startsNewConversation ? "conversation-start" : "prompt-continuation",
		mutability: "provider-mutating",
		startsNewConversation,
		now: admittedAt,
		reservationTtlMs: request.reservationTtlMs,
		policy: request.policy,
	});
	if (!admission.allowed) {
		await idleLease(request.registry, request.claim, admittedAt, "none");
		return { status: "denied", admission };
	}

	const started = await request.ledger.start({
		reservationId: admission.reservation.reservationId,
		startedAt: now().toISOString(),
	});
	if (!started.ok) {
		await idleLease(request.registry, request.claim, now().toISOString(), "none");
		throw new Error(`Interaction reservation could not start: ${started.reason}.`);
	}
	return executeAdmittedChatgptConversation(request, admission.reservation.reservationId, now);
}

export async function executeProvisionedChatgptConversation(
	request: ExecuteProvisionedChatgptConversationInput,
): Promise<ChatgptConversationExecutionResult> {
	assertRequestedWorkload(request.scope, request.workload, request.input);
	const now = request.now ?? (() => new Date());
	const startsNewConversation = request.workload.kind === "new-conversation";
	const admission = await request.ledger.reserve({
		scope: {
			provider: "chatgpt",
			tenantKey: request.scope.tenantKey,
			runtimeProfileId: request.scope.runtimeProfileId,
			managedBrowserProfile: request.scope.managedBrowserProfile,
		},
		workloadId: workloadIdentity(request.workload),
		operationId: request.operationId,
		tabLeaseId: null,
		interactionClass: startsNewConversation ? "conversation-start" : "prompt-continuation",
		mutability: "provider-mutating",
		startsNewConversation,
		now: now().toISOString(),
		reservationTtlMs: request.reservationTtlMs,
		policy: request.policy,
	});
	if (!admission.allowed) return { status: "denied", admission };
	const reservationId = admission.reservation.reservationId;
	const started = await request.ledger.start({
		reservationId,
		startedAt: now().toISOString(),
	});
	if (!started.ok) throw new Error(`Interaction reservation could not start: ${started.reason}.`);

	let provisioned: ProvisionedChatgptTab | null = null;
	try {
		provisioned = await request.acquireTab({ interactionReservationId: reservationId });
		assertProvisionedTab(request, provisioned);
		const bound = await request.ledger.bindTabLease({
			reservationId,
			tabLeaseId: provisioned.lease.leaseId,
			boundAt: now().toISOString(),
		});
		if (!bound.ok) throw new Error(`Interaction tab binding failed: ${bound.reason}.`);
	} catch (error) {
		if (provisioned) {
			await idleLease(request.registry, provisioned.claim, now().toISOString(), "none");
		}
		const settled = await request.ledger.settle({
			reservationId,
			settledAt: now().toISOString(),
			effectState: "none",
			outcome: "failed",
			stopReason: error instanceof Error ? error.message : String(error),
		});
		if (!settled.ok) throw new Error(`Provisioning settlement failed: ${settled.reason}.`);
		throw error;
	}

	return executeAdmittedChatgptConversation(
		{
			mode: "tab-affinity",
			registry: request.registry,
			ledger: request.ledger,
			...provisioned,
			operationId: request.operationId,
			input: request.input,
			options: request.options,
			runPrompt: request.runPrompt,
			policy: request.policy,
			reservationTtlMs: request.reservationTtlMs,
			idleTtlMs: request.idleTtlMs,
			now,
			classifyProviderWarning: request.classifyProviderWarning,
		},
		reservationId,
		now,
	);
}

async function executeAdmittedChatgptConversation(
	request: ChatgptTabAffinityExecutionInput,
	reservationId: string,
	now: () => Date,
): Promise<ChatgptConversationExecutionResult> {
	assertLeaseClaim(request.lease, request.claim, request.operationId);
	const providerOptions = buildChatgptLeasedPromptOptions({
		lease: request.lease,
		operationId: request.operationId,
		endpoint: request.endpoint,
		options: request.options,
		input: request.input,
	});

	let result: PromptResult;
	let activeClaim = request.claim;
	try {
		result = await request.runPrompt(request.input, providerOptions);
		assertChatgptLeasedPromptResult(request.lease, result);
		activeClaim = await settleSuccessfulLease(request, result, now().toISOString());
	} catch (error) {
		await settleFailedExecution(request, activeClaim, reservationId, now, error);
		throw error;
	}
	const settled = await request.ledger.settle({
		reservationId,
		settledAt: now().toISOString(),
		effectState: "settled",
		outcome: "succeeded",
	});
	if (!settled.ok) {
		const settlementError = new Error(`Interaction settlement failed: ${settled.reason}.`);
		try {
			await fenceLeaseAfterSettlementFailure(request, activeClaim, now().toISOString());
		} catch (fenceError) {
			throw new AggregateError(
				[settlementError, fenceError],
				"Interaction settlement failed and the exact tab lease could not be fenced.",
			);
		}
		throw settlementError;
	}
	await idleLease(request.registry, activeClaim, now().toISOString(), "settled");
	return { status: "completed", result };
}

async function fenceLeaseAfterSettlementFailure(
	request: ChatgptTabAffinityExecutionInput,
	claim: TabLeaseClaim,
	now: string,
): Promise<void> {
	const used = await request.registry.recordMeaningfulUse({
		claim,
		now,
		idleTtlMs: request.idleTtlMs,
		effectState: "outcome-unknown",
	});
	if (!used.ok) {
		throw new Error(`ChatGPT settlement-failure fence failed: ${used.conflict.kind}.`);
	}
	await idleLease(request.registry, used.value.claim, now, "outcome-unknown");
}

async function settleSuccessfulLease(
	request: ChatgptTabAffinityExecutionInput,
	result: PromptResult,
	now: string,
): Promise<TabLeaseClaim> {
	if (request.lease.workload.kind === "new-conversation") {
		if (!result.conversationId || !result.url) {
			throw new Error("ChatGPT new-conversation binding requires exact conversation ID and URL.");
		}
		const bound = await request.registry.bindConversation({
			claim: request.claim,
			conversationId: result.conversationId,
			targetFingerprint: result.url,
			now,
		});
		if (!bound.ok) throw new Error(`ChatGPT conversation binding failed: ${bound.conflict.kind}.`);
		return bound.value.claim;
	}

	const used = await request.registry.recordMeaningfulUse({
		claim: request.claim,
		now,
		idleTtlMs: request.idleTtlMs,
		targetFingerprint: result.url ?? request.lease.targetFingerprint,
		effectState: "settled",
	});
	if (!used.ok) throw new Error(`ChatGPT lease heartbeat failed: ${used.conflict.kind}.`);
	return used.value.claim;
}

async function settleFailedExecution(
	request: ChatgptTabAffinityExecutionInput,
	claim: TabLeaseClaim,
	reservationId: string,
	now: () => Date,
	error: unknown,
): Promise<void> {
	if (readFailureEffectState(error) === "pre_effect") {
		await idleLease(request.registry, claim, now().toISOString(), "none");
		const settled = await request.ledger.settle({
			reservationId,
			settledAt: now().toISOString(),
			effectState: "none",
			outcome: "cancelled",
			stopReason: error instanceof Error ? error.message : String(error),
		});
		if (!settled.ok) throw new Error(`Pre-effect interaction settlement failed: ${settled.reason}.`);
		return;
	}
	const used = await request.registry.recordMeaningfulUse({
		claim,
		now: now().toISOString(),
		idleTtlMs: request.idleTtlMs,
		effectState: "outcome-unknown",
	});
	if (used.ok) {
		await idleLease(request.registry, used.value.claim, now().toISOString(), "outcome-unknown");
	}
	const warning = request.classifyProviderWarning?.(error) ?? null;
	if (warning) {
		await request.ledger.recordProviderWarning({
			scope: {
				provider: "chatgpt",
				tenantKey: request.lease.scope.tenantKey,
				runtimeProfileId: request.lease.scope.runtimeProfileId,
				managedBrowserProfile: request.lease.scope.managedBrowserProfile,
			},
			...warning,
			observedAt: now().toISOString(),
		});
		return;
	}
	const settled = await request.ledger.settle({
		reservationId,
		settledAt: now().toISOString(),
		effectState: "outcome-unknown",
		outcome: "failed",
		stopReason: error instanceof Error ? error.message : String(error),
	});
	if (!settled.ok) throw new Error(`Failed interaction settlement failed: ${settled.reason}.`);
}

function readFailureEffectState(error: unknown): "pre_effect" | "effect_observed" | "unknown" {
	if (!error || typeof error !== "object") return "unknown";
	const details = (error as { details?: unknown }).details;
	if (!details || typeof details !== "object") return "unknown";
	const effectState = (details as { effectState?: unknown }).effectState;
	return effectState === "pre_effect" || effectState === "effect_observed" || effectState === "unknown"
		? effectState
		: "unknown";
}

async function idleLease(
	registry: BrowserTabLeaseRegistry,
	claim: TabLeaseClaim,
	now: string,
	effectState: "none" | "settled" | "outcome-unknown",
): Promise<void> {
	const idled = await registry.idle({ claim, now, effectState });
	if (!idled.ok) throw new Error(`ChatGPT lease idle transition failed: ${idled.conflict.kind}.`);
}

function assertLeaseClaim(lease: BrowserTabLease, claim: TabLeaseClaim, operationId: string): void {
	if (
		claim.leaseId !== lease.leaseId ||
		claim.revision !== lease.revision ||
		claim.operationId !== operationId
	) {
		throw new Error(`Tab lease claim does not match active lease ${lease.leaseId}.`);
	}
}

function workloadId(lease: BrowserTabLease): string {
	return workloadIdentity(lease.workload);
}

function workloadIdentity(workload: TabLeaseWorkload): string {
	switch (workload.kind) {
		case "conversation":
			return `conversation:${workload.conversationId}`;
		case "new-conversation":
			return `new-conversation:${workload.reservationId}`;
		case "live-follow":
		case "ephemeral":
			return `${workload.kind}:${workload.operationId}`;
	}
}

function assertRequestedWorkload(
	scope: TabLeaseScope,
	workload: ExecuteProvisionedChatgptConversationInput["workload"],
	input: PromptInput,
): void {
	if (scope.service !== "chatgpt")
		throw new Error(`Expected chatgpt scope, received ${scope.service}.`);
	if (workload.kind === "conversation" && input.conversationId !== workload.conversationId) {
		throw new Error("Prompt conversation does not match requested conversation workload.");
	}
	if (workload.kind === "new-conversation" && input.conversationId) {
		throw new Error("New-conversation workload cannot target an existing conversation.");
	}
}

function assertProvisionedTab(
	request: ExecuteProvisionedChatgptConversationInput,
	provisioned: ProvisionedChatgptTab,
): void {
	assertLeaseClaim(provisioned.lease, provisioned.claim, request.operationId);
	const actualScope = provisioned.lease.scope;
	const expectedScope = request.scope;
	if (
		actualScope.runtimeProfileId !== expectedScope.runtimeProfileId ||
		actualScope.managedBrowserProfile !== expectedScope.managedBrowserProfile ||
		actualScope.service !== expectedScope.service ||
		actualScope.tenantKey !== expectedScope.tenantKey ||
		workloadIdentity(provisioned.lease.workload) !== workloadIdentity(request.workload)
	) {
		throw new Error("Provisioned tab lease does not match the admitted scope and workload.");
	}
}
