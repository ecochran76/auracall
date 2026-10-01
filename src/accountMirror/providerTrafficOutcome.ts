export type AccountMirrorProviderTrafficOutcome =
	| "active"
	| "budget_exhausted"
	| "warning_stop"
	| "clean_completion"
	| "cleanup_failure"
	| "other_failure";

export function classifyAccountMirrorProviderTrafficOutcome(input: {
	status: string;
	error?: { message?: string | null; code?: string | null } | null;
}): AccountMirrorProviderTrafficOutcome {
	const code = input.error?.code?.trim().toLowerCase() ?? "";
	const message = input.error?.message?.trim().toLowerCase() ?? "";
	if (
		code.includes("provider_traffic_budget") ||
		message.includes("provider traffic budget exhausted")
	) {
		return "budget_exhausted";
	}
	if (
		code.includes("provider_warning") ||
		/rate[- ]limit|too many requests|requests too quickly|provider traffic stopped after/.test(
			message,
		)
	) {
		return "warning_stop";
	}
	if (
		code.includes("cleanup") ||
		/cleanup|crawler heartbeat failed|crawler idle transition failed|settlement.*failed/.test(
			message,
		)
	) {
		return "cleanup_failure";
	}
	if (input.status === "completed" && !input.error) return "clean_completion";
	if (["failed", "blocked", "cancelled"].includes(input.status)) return "other_failure";
	return "active";
}
