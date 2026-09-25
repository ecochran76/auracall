import { afterEach, describe, expect, test, vi } from "vitest";

import { createTabAffinityMaintenanceLoop } from "../../src/browser/tabAffinityMaintenanceLoop.js";

afterEach(() => {
	vi.useRealTimers();
});

describe("tab affinity maintenance loop", () => {
	test("runs one pass at a time and reschedules only after settlement", async () => {
		vi.useFakeTimers();
		const finishes: Array<() => void> = [];
		const run = vi.fn(
			() =>
				new Promise<void>((resolve) => {
					finishes.push(resolve);
				}),
		);
		const loop = createTabAffinityMaintenanceLoop({ intervalMs: 1_000, run });
		loop.start();

		await vi.advanceTimersByTimeAsync(1_000);
		expect(run).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(5_000);
		expect(run).toHaveBeenCalledTimes(1);

		finishes.shift()?.();
		await Promise.resolve();
		await vi.advanceTimersByTimeAsync(1_000);
		expect(run).toHaveBeenCalledTimes(2);
		finishes.shift()?.();
		await loop.close();
	});

	test("clears a pending pass and never runs after close", async () => {
		vi.useFakeTimers();
		const run = vi.fn().mockResolvedValue(undefined);
		const loop = createTabAffinityMaintenanceLoop({ intervalMs: 1_000, run });
		loop.start();
		await loop.close();
		await vi.advanceTimersByTimeAsync(5_000);
		expect(run).not.toHaveBeenCalled();
	});

	test("keeps failures bounded and schedules the next pass", async () => {
		vi.useFakeTimers();
		const logger = vi.fn();
		const run = vi
			.fn<() => Promise<void>>()
			.mockRejectedValueOnce(new Error("census unavailable"))
			.mockResolvedValue(undefined);
		const loop = createTabAffinityMaintenanceLoop({ intervalMs: 1_000, run, logger });
		loop.start();

		await vi.advanceTimersByTimeAsync(1_000);
		expect(logger).toHaveBeenCalledWith("Tab-affinity maintenance failed: census unavailable");
		await vi.advanceTimersByTimeAsync(1_000);
		expect(run).toHaveBeenCalledTimes(2);
		await loop.close();
	});
});
