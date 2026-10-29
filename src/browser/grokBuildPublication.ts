import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import type { GrokBuildInspectRequest, GrokBuildPublicationControls } from "./grokBuildService.js";
import { runGrokUiOperation } from "./grokUiOperation.js";
import { grokBuildPublicationControlExpression } from "./providers/grokBuildPublication.js";
import { resolveProviderTrafficGovernor } from "./providers/mutationAudit.js";
import type { ChromeClient } from "./types.js";

/** Explicit reversible native dialog inspection. Final Publish is never clicked. */
export async function inspectGrokBuildPublicationControls(
	client: ChromeClient,
	request: GrokBuildInspectRequest,
	abortSignal?: AbortSignal,
): Promise<{ controls?: GrokBuildPublicationControls; dialogDismissed: boolean }> {
	const governor = resolveProviderTrafficGovernor(client);
	const token = randomUUID();
	const evaluate = async (action: "open" | "read" | "focus" | "dismissed") => {
		const result = await client.Runtime.evaluate({
			expression: grokBuildPublicationControlExpression(request, token, action),
			returnByValue: true,
		});
		if (result.exceptionDetails) throw new Error("grok_build_publication_observation_failed");
		return result.result.value as {
			code: string;
			controls?: Omit<GrokBuildPublicationControls, "dialogDismissed">;
		};
	};
	let observed: Omit<GrokBuildPublicationControls, "dialogDismissed"> | undefined;
	let dialogDismissed = false;
	try {
		const { ensureGrokTabVisible } = await import("./providers/grokAdapter.js");
		await runGrokUiOperation({
			governor,
			runtime: client.Runtime,
			kind: "input",
			source: "provider:grok:publication-inspect-focus",
			abortSignal,
			effect: () => ensureGrokTabVisible(client),
		});
		const opened = await runGrokUiOperation({
			governor,
			runtime: client.Runtime,
			kind: "in-page-click",
			source: "provider:grok:publication-inspect-open",
			abortSignal,
			effect: () => evaluate("open"),
		});
		if (opened.code !== "opened") return { dialogDismissed: true };
		for (let attempt = 0; attempt < 10; attempt++) {
			abortSignal?.throwIfAborted();
			const result = await evaluate("read");
			if (result.code === "observed") {
				observed = result.controls;
				break;
			}
			if (attempt < 9) await delay(100, undefined, { signal: abortSignal });
		}
	} finally {
		// Cleanup retains normal governor authority even after cancellation of the read.
		try {
			await runGrokUiOperation({
				governor,
				runtime: client.Runtime,
				kind: "input",
				source: "provider:grok:publication-inspect-dismiss",
				effect: async () => {
					if ((await evaluate("focus")).code !== "focused") return;
					await client.Input.dispatchKeyEvent({
						type: "keyDown",
						key: "Escape",
						code: "Escape",
						windowsVirtualKeyCode: 27,
					});
					await client.Input.dispatchKeyEvent({
						type: "keyUp",
						key: "Escape",
						code: "Escape",
						windowsVirtualKeyCode: 27,
					});
				},
			});
			for (let attempt = 0; attempt < 10; attempt++) {
				if ((await evaluate("dismissed")).code === "dismissed") {
					dialogDismissed = true;
					break;
				}
				if (attempt < 9) await delay(100);
			}
		} catch {
			/* An unverified dismissal is returned separately from transport cleanup. */
		}
	}
	return {
		dialogDismissed,
		...(observed && dialogDismissed ? { controls: { ...observed, dialogDismissed: true } } : {}),
	};
}
