import { BrowserAutomationError } from "../oracle/errors.js";
import type { ProviderTrafficGovernor } from "../../packages/browser-service/src/service/providerTrafficGovernor.js";

export async function runGrokUiOperation<T>(input: {
	governor: ProviderTrafficGovernor | undefined;
	runtime: unknown;
	source: string;
	kind: "input" | "in-page-click" | "navigate";
	effect: () => Promise<T>;
	abortSignal?: AbortSignal;
}): Promise<T> {
	const governor = input.governor;
	if (!governor || governor.attribution.provider !== "grok")
		throw new Error("Grok UI operation requires exact provider traffic authority.");
	await governor.checkWarning?.(input.runtime);
	const action = await governor.begin({
		kind: input.kind,
		interactionClass: input.source.includes("submit") ? "upload-submit" : "generic",
		source: input.source,
		abortSignal: input.abortSignal,
		targetId: governor.attribution.targetId,
	});
	let result: T;
	try {
		input.abortSignal?.throwIfAborted();
		result = await input.effect();
	} catch (error) {
		await action.settle({
			outcome: "failed",
            effectState: error instanceof BrowserAutomationError && error.details?.effectState === "unknown" ? "outcome-unknown" : "settled",
			probeContext: input.runtime,
			error: error instanceof Error ? error.message : "Grok UI operation failed",
		});
		throw error;
	}
	await action.settle({ outcome: "succeeded", probeContext: input.runtime });
	return result;
}
/** Keep observer/Fetch draining ahead of destroying its browser prerequisite. */
export async function closeGrokTransportBeforeShutdown(
	client: { close(): Promise<void> } | null | undefined,
	shutdown: () => Promise<void>,
): Promise<void> {
	const failures: unknown[] = [];
	try {
		await client?.close();
	} catch (error) {
		failures.push(error);
	}
	try {
		await shutdown();
	} catch (error) {
		failures.push(error);
	}
	if (failures.length === 1) throw failures[0];
	if (failures.length > 1)
		throw new AggregateError(failures, "Grok transport and browser cleanup failed.");
}
