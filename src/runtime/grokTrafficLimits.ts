import { resolveConfiguredServiceAccountId } from "../config/serviceAccountIdentity.js";
import { getCurrentRuntimeProfiles } from "../config/model.js";

function record(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

/** A runtime override can tighten the global account ceiling, never raise it. */
export function resolveGrokOperationsPerMinute(
	config: Record<string, unknown>,
	runtimeProfileId: string,
): number | null {
	const globalService = record(record(config.services)?.grok);
	const profile = record(getCurrentRuntimeProfiles(config)[runtimeProfileId]);
	const runtimeService = record(record(profile?.services)?.grok);
	const account = resolveConfiguredServiceAccountId(config, {
		serviceId: "grok",
		runtimeProfileId,
	});
	const sharedServices = account
		? Object.entries(getCurrentRuntimeProfiles(config))
				.filter(
					([id]) =>
						resolveConfiguredServiceAccountId(config, {
							serviceId: "grok",
							runtimeProfileId: id,
						}) === account,
				)
				.map(([, item]) => record(record(item.services)?.grok))
		: [];
	const limits = [globalService, runtimeService, ...sharedServices].flatMap((service) => {
		const value = record(service?.liveFollow)?.maxBrowserInteractionsPerMinute;
		if (value === undefined) return [];
		if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1)
			throw new Error("Grok maxBrowserInteractionsPerMinute must be a positive safe integer.");
		return [value];
	});
	return limits.length ? Math.min(...limits) : null;
}

export function resolveGrokOperationBudgetWaitMs(
	config: Record<string, unknown>,
	runtimeProfileId: string,
): number {
	const globalService = record(record(config.services)?.grok);
	const profile = record(getCurrentRuntimeProfiles(config)[runtimeProfileId]);
	const runtimeService = record(record(profile?.services)?.grok);
	const value = runtimeService?.operationBudgetWaitMs ?? globalService?.operationBudgetWaitMs ?? 0;
	if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
		throw new Error("Grok operationBudgetWaitMs must be a nonnegative safe integer.");
	return value;
}

/** Explicit operator ceiling; no provider quota is inferred. */
export function resolveGrokBackendRequestsPerMinute(
	config: Record<string, unknown>,
	runtimeProfileId: string,
): number | undefined {
	const account = resolveConfiguredServiceAccountId(config, {
		serviceId: "grok",
		runtimeProfileId,
	});
	const profiles = getCurrentRuntimeProfiles(config);
	const services = [
		record(record(config.services)?.grok),
		...Object.entries(profiles)
			.filter(
				([id]) =>
					id === runtimeProfileId ||
					(account !== null &&
						resolveConfiguredServiceAccountId(config, {
							serviceId: "grok",
							runtimeProfileId: id,
						}) === account),
			)
			.map(([, profile]) => record(record(profile.services)?.grok)),
	];
	const limits = services.flatMap((service) => {
		const value = service?.maxBackendRequestsPerMinute;
		if (value === undefined) return [];
		if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1)
			throw new Error("Grok maxBackendRequestsPerMinute must be a positive safe integer.");
		return [value];
	});
	return limits.length ? Math.min(...limits) : undefined;
}
export function resolveGrokBackendRequestBudgetWaitMs(
	config: Record<string, unknown>,
	runtimeProfileId: string,
): number {
	const globalService = record(record(config.services)?.grok);
	const profile = record(getCurrentRuntimeProfiles(config)[runtimeProfileId]);
	const service = record(record(profile?.services)?.grok);
	const value =
		service?.backendRequestBudgetWaitMs ?? globalService?.backendRequestBudgetWaitMs ?? 0;
	if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
		throw new Error("Grok backendRequestBudgetWaitMs must be a nonnegative safe integer.");
	return value;
}
