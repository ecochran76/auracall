import { AsyncLocalStorage } from "node:async_hooks";

/** Aggregate only: raw URLs and request IDs never enter the returned report. */
export class BrowserPerformanceDiagnostics {
	private readonly started: number;
	private stopped: number | undefined;
	private currentStage = "other";
	private stageStarted: number;
	private readonly stages = new Map<string, number>();
	private readonly pending = new Map<string, number>();
	private readonly routes = { installed: 0, linked: 0, other: 0 };
	private observedConnections = 0;
	private readonly connectionIds = new WeakMap<object, number>();
	private readonly attachedConnections = new WeakSet<object>();
	private nextConnectionId = 0;
	private total = 0;
	private responses = 0;
	private failed = 0;
	private responseTotalMs = 0;
	private responseMaxMs = 0;
	private trackingLimitReached = false;
	private readonly admissions = {
		attempted: 0,
		admitted: 0,
		rejected: 0,
		pending: 0,
		durationMs: 0,
		maxMs: 0,
	};

	constructor(private readonly now: () => number = () => performance.now()) {
		this.started = this.stageStarted = now();
	}

	stage(stage: string): void {
		if (this.stopped !== undefined) return;
		this.closeStage(this.now());
		this.currentStage = [
			"queue-admission",
			"browser-resolution",
			"utility-admission",
			"interaction-admission",
			"identity",
			"attachment",
			"inventory",
			"developer-mode",
			"restore-navigation",
			"cleanup",
		].includes(stage)
			? stage
			: "other";
	}

	attached(connection: object): void {
		if (this.stopped !== undefined || this.attachedConnections.has(connection)) return;
		this.attachedConnections.add(connection);
		this.observedConnections++;
	}

	request(requestId: string, url: string, connection: object = this): void {
		if (this.stopped !== undefined) return;
		let parsed: URL;
		try {
			parsed = new URL(url);
		} catch {
			return;
		}
		if (
			!["https://chatgpt.com", "https://chat.openai.com"].includes(parsed.origin) ||
			!parsed.pathname.startsWith("/backend-api/")
		)
			return;
		requestId = this.requestKey(connection, requestId);
		this.total++;
		const route =
			parsed.pathname === "/backend-api/ps/plugins/installed"
				? "installed"
				: parsed.pathname === "/backend-api/aip/connectors/links/list_accessible"
					? "linked"
					: "other";
		this.routes[route]++;
		if (this.pending.size < 1000 || this.pending.has(requestId))
			this.pending.set(requestId, this.now());
		else this.trackingLimitReached = true;
	}

	response(requestId: string, connection: object = this): void {
		this.settleRequest(this.requestKey(connection, requestId), false);
	}
	failure(requestId: string, connection: object = this): void {
		this.settleRequest(this.requestKey(connection, requestId), true);
	}

	admission(): (outcome: "admitted" | "rejected") => void {
		if (this.stopped !== undefined) return () => undefined;
		const started = this.now();
		this.admissions.attempted++;
		this.admissions.pending++;
		let settled = false;
		return (outcome) => {
			if (settled || this.stopped !== undefined) return;
			settled = true;
			const elapsed = Math.max(0, this.now() - started);
			this.admissions[outcome]++;
			this.admissions.pending--;
			this.admissions.durationMs += elapsed;
			this.admissions.maxMs = Math.max(this.admissions.maxMs, elapsed);
		};
	}

	finish() {
		if (this.stopped === undefined) {
			this.stopped = this.now();
			this.closeStage(this.stopped);
			this.pending.clear();
		}
		return {
			version: 1,
			coverage: "owned-backend-interception-after-attachment",
			observedConnections: this.observedConnections,
			elapsedMs: Math.max(0, this.stopped - this.started),
			stages: [...this.stages].map(([stage, durationMs]) => ({ stage, durationMs })),
			backendRequests: {
				total: this.total,
				routes: { ...this.routes },
				responses: this.responses,
				failed: this.failed,
				unresolved: this.total - this.responses - this.failed,
				trackingLimitReached: this.trackingLimitReached,
				responseMs: { total: this.responseTotalMs, max: this.responseMaxMs },
			},
			admission: { ...this.admissions },
		};
	}

	private requestKey(connection: object, requestId: string): string {
		let id = this.connectionIds.get(connection);
		if (id === undefined) {
			id = this.nextConnectionId++;
			this.connectionIds.set(connection, id);
		}
		return `${id}:${requestId}`;
	}

	private closeStage(at: number): void {
		const elapsed = Math.max(0, at - this.stageStarted);
		if (elapsed > 0 || this.stages.has(this.currentStage))
			this.stages.set(this.currentStage, (this.stages.get(this.currentStage) ?? 0) + elapsed);
		this.stageStarted = at;
	}

	private settleRequest(requestId: string, failed: boolean): void {
		if (this.stopped !== undefined) return;
		const started = this.pending.get(requestId);
		if (started === undefined) return;
		this.pending.delete(requestId);
		if (failed) this.failed++;
		else {
			this.responses++;
			const elapsed = Math.max(0, this.now() - started);
			this.responseTotalMs += elapsed;
			this.responseMaxMs = Math.max(this.responseMaxMs, elapsed);
		}
	}
}

const activeDiagnostic = new AsyncLocalStorage<BrowserPerformanceDiagnostics>();

export function withBrowserPerformanceDiagnostics<T>(
	diagnostic: BrowserPerformanceDiagnostics,
	operation: () => T,
): T {
	return activeDiagnostic.run(diagnostic, operation);
}

export function currentBrowserPerformanceDiagnostics(): BrowserPerformanceDiagnostics | undefined {
	return activeDiagnostic.getStore();
}
