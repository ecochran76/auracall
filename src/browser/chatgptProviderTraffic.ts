import type { ProviderTrafficWarning } from "../../packages/browser-service/src/service/providerTrafficGovernor.js";

type RuntimeEvaluator = {
	evaluate(input: {
		expression: string;
		returnByValue: boolean;
	}): Promise<{ result?: { value?: unknown } }>;
};

export async function probeVisibleChatgptRateLimitWarning(
	context: unknown,
): Promise<ProviderTrafficWarning | null> {
	const runtime = context as Partial<RuntimeEvaluator> | null;
	if (!runtime?.evaluate) return null;
	const evaluated = await runtime.evaluate({
		expression: `(() => Array.from(document.querySelectorAll('[role="dialog"],[aria-modal="true"],[role="alert"],[aria-live]')).filter((node) => { const rect = node.getBoundingClientRect(); return rect.width > 0 && rect.height > 0; }).map((node) => String(node.textContent || '').replace(/\\s+/g, ' ').trim()).find((text) => /too many requests|making requests too quickly|rate limit/i.test(text))?.slice(0, 240) || null)()`,
		returnByValue: true,
	});
	const reason =
		typeof evaluated.result?.value === "string" ? evaluated.result.value.trim() : "";
	return reason ? { classification: "rate-limit", reason } : null;
}
