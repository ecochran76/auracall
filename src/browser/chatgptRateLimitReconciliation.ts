import { matchesServiceUrl } from "./urlFamilies.js";

export type ChatgptRateLimitReconciliationTarget = {
	id?: string | null;
	type?: string | null;
	url?: string | null;
};

export type ChatgptRateLimitTargetEvidence = {
	reason: string;
	source?: string | null;
};

export type ChatgptRateLimitReconciliationResult = {
	targetId: string;
	url: string;
	reason: string;
	source: string | null;
	attempt: number;
	isCurrentTarget: boolean;
};

export async function reconcileChatgptRateLimitTargets(options: {
	currentTargetId?: string | null;
	attempts: number;
	intervalMs: number;
	listTargets: () => Promise<readonly ChatgptRateLimitReconciliationTarget[]>;
	inspectTarget: (
		target: ChatgptRateLimitReconciliationTarget & { id: string; url: string },
	) => Promise<ChatgptRateLimitTargetEvidence | null>;
	wait: (ms: number) => Promise<void>;
}): Promise<ChatgptRateLimitReconciliationResult | null> {
	const attempts = Math.max(1, Math.floor(options.attempts));
	const intervalMs = Math.max(0, Math.floor(options.intervalMs));
	const currentTargetId = options.currentTargetId?.trim() || null;

	for (let attempt = 1; attempt <= attempts; attempt += 1) {
		const targets = (await options.listTargets())
			.filter(
				(target): target is ChatgptRateLimitReconciliationTarget & { id: string; url: string } =>
					Boolean(target.id?.trim()) &&
					(!target.type || target.type === "page") &&
					Boolean(target.url?.trim()) &&
					matchesServiceUrl("chatgpt", target.url),
			)
			.sort((left, right) => {
				const leftCurrent = left.id === currentTargetId ? 0 : 1;
				const rightCurrent = right.id === currentTargetId ? 0 : 1;
				return leftCurrent - rightCurrent;
			});

		for (const target of targets) {
			const evidence = await options.inspectTarget(target).catch(() => null);
			if (!evidence?.reason.trim()) {
				continue;
			}
			return {
				targetId: target.id,
				url: target.url,
				reason: evidence.reason.trim(),
				source: evidence.source?.trim() || null,
				attempt,
				isCurrentTarget: target.id === currentTargetId,
			};
		}

		if (attempt < attempts && intervalMs > 0) {
			await options.wait(intervalMs);
		}
	}

	return null;
}
