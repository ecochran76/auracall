import type { ProviderTrafficWarning } from "../../packages/browser-service/src/service/providerTrafficGovernor.js";

type WarningEvaluator = {
	evaluate(input: {
		expression: string;
		returnByValue: boolean;
	}): Promise<{ result?: { value?: unknown } }>;
};

/** Only owned visible warning surfaces are evidence; conversation prose is excluded. */
export async function probeGrokRateLimitWarning(
	context: unknown,
): Promise<ProviderTrafficWarning | null> {
	const native = (context as { nativeProviderResponse?: { url?: string; status?: number } } | null)
		?.nativeProviderResponse;
	if (native?.status === 429 && typeof native.url === "string") {
		try {
			const url = new URL(native.url);
			if (url.origin === "https://grok.com" && url.pathname.startsWith("/rest/"))
				return { classification: "rate-limit", reason: "Owned Grok backend returned HTTP 429." };
		} catch {
			return null;
		}
	}
	const runtime = context as Partial<WarningEvaluator> | null;
	if (!runtime?.evaluate) return null;
	const result = await runtime.evaluate({
		expression: `(() => {
      if (location.origin !== 'https://grok.com') return null;
      const nodes = Array.from(document.querySelectorAll('[role="dialog"],[role="alert"],[role="status"],[aria-live],[data-sonner-toast],[data-toast]'));
      const warning = nodes.filter(node => {
        const r = node.getBoundingClientRect();
        const s = getComputedStyle(node);
        return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
      }).map(node => String(node.textContent || '').replace(/\\s+/g, ' ').trim())
        .find(text => /query limit|too many requests|rate limit|request limit|slow down|try again in\\s+\\d+/i.test(text));
      return warning ? warning.slice(0, 240) : null;
    })()`,
		returnByValue: true,
	});
	const reason = typeof result.result?.value === "string" ? result.result.value.trim() : "";
	return reason ? { classification: "rate-limit", reason } : null;
}
