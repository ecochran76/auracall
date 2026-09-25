export interface TabAffinityMaintenanceLoop {
	start(): void;
	runNow(): Promise<void>;
	close(): Promise<void>;
}

export function createTabAffinityMaintenanceLoop(input: {
	intervalMs: number;
	run: () => Promise<void>;
	logger?: (message: string) => void;
}): TabAffinityMaintenanceLoop {
	const intervalMs = Math.max(0, input.intervalMs);
	const logger = input.logger ?? (() => undefined);
	let closed = false;
	let timer: NodeJS.Timeout | null = null;
	let activePass: Promise<void> | null = null;

	const schedule = () => {
		if (closed || intervalMs <= 0 || timer || activePass) return;
		timer = setTimeout(() => {
			timer = null;
			void runNow();
		}, intervalMs);
		timer.unref();
	};

	const runNow = async () => {
		if (closed) return;
		if (activePass) return activePass;
		activePass = input
			.run()
			.catch((error) => {
				logger(
					`Tab-affinity maintenance failed: ${error instanceof Error ? error.message : String(error)}`,
				);
			})
			.finally(() => {
				activePass = null;
				schedule();
			});
		return activePass;
	};

	return {
		start: schedule,
		runNow,
		async close() {
			closed = true;
			if (timer) {
				clearTimeout(timer);
				timer = null;
			}
			await activePass;
		},
	};
}
