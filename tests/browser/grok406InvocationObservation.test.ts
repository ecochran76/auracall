// biome-ignore-all lint/style/useNamingConvention: CDP uses native protocol names.
import { expect, it } from "vitest";
import { observeGrokConnectorInvocationResponse } from "../../src/browser/grokConnectorInvocationBrowser.js";
it("refuses a different response after the waiter accepted a terminal response even when text is identical", async () => {
	const baseline = {
		count: 0,
		lastText: "",
		lastMarkdown: "",
		lastHtml: "",
		responseId: "",
		streaming: false,
		terminal: false,
		terminalEvidence: "",
		toastText: "",
	};
	const answer = {
		...baseline,
		count: 1,
		lastText: "same answer",
		lastMarkdown: "same answer",
		responseId: "response-A",
		terminal: true,
		terminalEvidence: "native",
	};
	let reads = 0;
	const runtime = {
		evaluate: async () => ({
			result: {
				value: ++reads <= 3 ? answer : reads === 4 ? { ...answer, responseId: "response-B" } : null,
			},
		}),
	};
	await expect(
		observeGrokConnectorInvocationResponse(
			runtime as never,
			{ id: "connector-native", name: "Example" },
			{ baseline },
		),
	).rejects.toThrow("grok_connector_result_attribution_unknown");
});
