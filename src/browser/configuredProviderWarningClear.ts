import { resolveConfiguredServiceAccountId } from "../config/serviceAccountIdentity.js";
import type { ResolvedUserConfig } from "../config.js";
import { resolveRuntimeProfileUserConfig } from "./service/profileConfig.js";
import { createBrowserTabConcurrencyRuntime } from "./tabConcurrencyRuntime.js";

export async function clearConfiguredAggregateProviderWarning(input: {
	userConfig: ResolvedUserConfig;
	provider: "chatgpt" | "gemini" | "grok";
	runtimeProfileId: string;
	clearedAt: string;
	cooldownUntil: string | null;
	reason: string;
	deps?: {
		createRuntime?: typeof createBrowserTabConcurrencyRuntime;
	};
}): Promise<boolean> {
	if (input.provider !== "chatgpt") return false;
	const runtimeConfig = resolveRuntimeProfileUserConfig(input.userConfig, {
		runtimeProfileId: input.runtimeProfileId,
		provider: input.provider,
	}) as ResolvedUserConfig;
	if (runtimeConfig.browser?.tabConcurrencyMode !== "tab-affinity") return false;
	const tenantKey = resolveConfiguredServiceAccountId(runtimeConfig as Record<string, unknown>, {
		serviceId: "chatgpt",
		runtimeProfileId: input.runtimeProfileId,
	});
	const ledger = (input.deps?.createRuntime ?? createBrowserTabConcurrencyRuntime)(
		runtimeConfig,
	).ledger;
	if (!tenantKey || !ledger) {
		throw new Error(
			"ChatGPT affinity provider guard clear requires its tenant identity and interaction ledger.",
		);
	}
	await ledger.clearProviderWarning({
		scope: {
			provider: input.provider,
			tenantKey,
			runtimeProfileId: input.runtimeProfileId,
			managedBrowserProfile: `operator-clear:${input.runtimeProfileId}`,
		},
		clearedAt: input.clearedAt,
		cooldownUntil: input.cooldownUntil,
		reason: input.reason,
	});
	return true;
}
