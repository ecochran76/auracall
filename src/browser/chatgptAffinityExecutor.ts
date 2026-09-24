import type {
	ProviderInteractionAdmission,
	ProviderInteractionLedger,
	ProviderInteractionPolicy,
} from "../../packages/browser-service/src/service/interactionLedger.js";
import type {
	BrowserTabLease,
	BrowserTabLeaseRegistry,
	TabLeaseClaim,
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

export type ExecuteChatgptConversationInput =
	| {
			mode: "serialized";
			input: PromptInput;
			runSerialized: (input: PromptInput) => Promise<PromptResult>;
	  }
	| {
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
	  };

export async function executeChatgptConversation(
	request: ExecuteChatgptConversationInput,
): Promise<ChatgptConversationExecutionResult> {
	if (request.mode === "serialized") {
		return { status: "completed", result: await request.runSerialized(request.input) };
	}

	assertLeaseClaim(request.lease, request.claim, request.operationId);
	const providerOptions = buildChatgptLeasedPromptOptions({
		lease: request.lease,
		operationId: request.operationId,
		endpoint: request.endpoint,
		options: request.options,
		input: request.input,
	});
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

	let result: PromptResult;
	let activeClaim = request.claim;
	try {
		result = await request.runPrompt(request.input, providerOptions);
		assertChatgptLeasedPromptResult(request.lease, result);
		activeClaim = await settleSuccessfulLease(request, result, now().toISOString());
		await idleLease(request.registry, activeClaim, now().toISOString(), "settled");
	} catch (error) {
		await settleFailedExecution(
			request,
			activeClaim,
			admission.reservation.reservationId,
			now,
			error,
		);
		throw error;
	}
	const settled = await request.ledger.settle({
		reservationId: admission.reservation.reservationId,
		settledAt: now().toISOString(),
		effectState: "settled",
		outcome: "succeeded",
	});
	if (!settled.ok) throw new Error(`Interaction settlement failed: ${settled.reason}.`);
	return { status: "completed", result };
}

async function settleSuccessfulLease(
	request: Extract<ExecuteChatgptConversationInput, { mode: "tab-affinity" }>,
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
	request: Extract<ExecuteChatgptConversationInput, { mode: "tab-affinity" }>,
	claim: TabLeaseClaim,
	reservationId: string,
	now: () => Date,
	error: unknown,
): Promise<void> {
	const used = await request.registry.recordMeaningfulUse({
		claim,
		now: now().toISOString(),
		idleTtlMs: request.idleTtlMs,
		effectState: "outcome-unknown",
	});
	if (used.ok) {
		await idleLease(request.registry, used.value.claim, now().toISOString(), "outcome-unknown");
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
	switch (lease.workload.kind) {
		case "conversation":
			return `conversation:${lease.workload.conversationId}`;
		case "new-conversation":
			return `new-conversation:${lease.workload.reservationId}`;
		case "live-follow":
		case "ephemeral":
			return `${lease.workload.kind}:${lease.workload.operationId}`;
	}
}
