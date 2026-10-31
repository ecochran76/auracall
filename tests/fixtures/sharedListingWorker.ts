import { shareConversationListing } from "../../src/browser/sharedConversationListing.js";

const [root, key] = process.argv.slice(2);
const controller = new AbortController();
let release: () => void = () => {};
let fail: () => void = () => {};
process.on("message", (message) => {
	if (message === "release") release();
	if (message === "fail") fail();
	if (message === "cancel") controller.abort(new Error("Caller cancelled"));
});
try {
	const value = await shareConversationListing({
		root,
		key,
		signal: controller.signal,
		onRole: (role) => process.send?.({ event: role }),
		run: async (signal) => {
			process.send?.({ event: "provider-start" });
			await new Promise<void>((resolve, reject) => {
				release = resolve;
				fail = () =>
					reject(
						Object.assign(new Error("Synthetic provider warning"), {
							code: "FIXTURE_PROVIDER_WARNING",
						}),
					);
				signal.addEventListener("abort", () => reject(signal.reason), { once: true });
			});
			return [{ id: "synthetic-conversation", metadata: { fixture: true } }];
		},
	});
	process.send?.({ event: "result", value });
} catch (error) {
	process.send?.({
		event: "error",
		message: error instanceof Error ? error.message : String(error),
	});
} finally {
	process.channel?.unref();
}
