// biome-ignore-all lint/style/useNamingConvention: CDP protocol method names.
import { expect, test, vi } from "vitest";

const transport = vi.hoisted(() => ({ connect: vi.fn(), broadConnect: vi.fn() }));
vi.mock("../../packages/browser-service/src/guardedPuppeteer.js", () => ({
	connectGuardedPuppeteer: transport.broadConnect,
}));
vi.mock("../../packages/browser-service/src/chromeLifecycle.js", () => ({
	connectToChromeTarget: transport.connect,
}));

import { createBrowserToolsProgram } from "../../packages/browser-service/src/browserTools.js";

test.each([
	"owned",
	"missing",
])("eval exact target %s cannot fall back to another same-URL tab", async (requested) => {
	const client = {
		Target: { getTargetInfo: vi.fn(async () => ({ targetInfo: { targetId: "owned" } })) },
		Runtime: {
			enable: vi.fn(async () => {}),
			evaluate: vi.fn(async () => ({ result: { value: "observed" } })),
		},
		close: vi.fn(async () => {}),
	};
	transport.connect.mockResolvedValue(client);
	const program = createBrowserToolsProgram({ resolvePortOrLaunch: async () => 45040 });
	const log = vi.spyOn(console, "log").mockImplementation(() => {});
	try {
		const run = program.parseAsync([
			"node",
			"browser-tools",
			"eval",
			"--port",
			"45040",
			"--target-id",
			requested,
			"document.title",
		]);
		if (requested === "missing") {
			await expect(run).rejects.toThrow("Exact browser target is unavailable");
			expect(client.Runtime.evaluate).not.toHaveBeenCalled();
		} else {
			await run;
			expect(client.Runtime.evaluate).toHaveBeenCalledOnce();
		}
		expect(transport.connect).toHaveBeenLastCalledWith({
			host: "127.0.0.1",
			port: 45040,
			target: requested,
			timeoutMs: 15000,
		});
		expect(transport.broadConnect).not.toHaveBeenCalled();
		expect(client.close).toHaveBeenCalledOnce();
	} finally {
		log.mockRestore();
	}
});
