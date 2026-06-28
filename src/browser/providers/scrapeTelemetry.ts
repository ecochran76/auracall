import type { BrowserProviderListOptions } from "./types.js";

export interface BrowserScrapeTelemetrySnapshot {
	providerActions: Record<string, number>;
	cdpCalls: Record<string, number>;
	candidates: Record<string, number>;
	downloads: {
		attempted: number;
		succeeded: number;
		failed: number;
	};
	notes: string[];
}

export interface BrowserScrapeTelemetryRecorder extends BrowserScrapeTelemetrySnapshot {
	onUpdate?: () => void;
}

export function createBrowserScrapeTelemetryRecorder(options?: {
	onUpdate?: () => void;
}): BrowserScrapeTelemetryRecorder {
	return {
		providerActions: {},
		cdpCalls: {},
		candidates: {},
		downloads: {
			attempted: 0,
			succeeded: 0,
			failed: 0,
		},
		notes: [],
		onUpdate: options?.onUpdate,
	};
}

export function snapshotBrowserScrapeTelemetry(
	telemetry: BrowserScrapeTelemetryRecorder | null | undefined,
): BrowserScrapeTelemetrySnapshot | null {
	if (!telemetry) return null;
	return {
		providerActions: { ...telemetry.providerActions },
		cdpCalls: { ...telemetry.cdpCalls },
		candidates: { ...telemetry.candidates },
		downloads: { ...telemetry.downloads },
		notes: [...telemetry.notes],
	};
}

export function recordBrowserScrapeProviderAction(
	options: BrowserProviderListOptions | null | undefined,
	action: string,
): void {
	const telemetry = options?.scrapeTelemetry;
	increment(telemetry?.providerActions, action);
	notify(telemetry);
}

export function recordBrowserScrapeCdpCall(
	options: BrowserProviderListOptions | null | undefined,
	method: string,
): void {
	const telemetry = options?.scrapeTelemetry;
	increment(telemetry?.cdpCalls, method);
	notify(telemetry);
}

export function recordBrowserScrapeCandidateCount(
	options: BrowserProviderListOptions | null | undefined,
	name: string,
	count: number,
): void {
	const candidates = options?.scrapeTelemetry?.candidates;
	if (!candidates) return;
	candidates[name] = Math.max(0, Math.floor(count));
	notify(options?.scrapeTelemetry);
}

export function recordBrowserScrapeDownloadAttempt(
	options: BrowserProviderListOptions | null | undefined,
): void {
	const downloads = options?.scrapeTelemetry?.downloads;
	if (!downloads) return;
	downloads.attempted += 1;
	notify(options?.scrapeTelemetry);
}

export function recordBrowserScrapeDownloadSuccess(
	options: BrowserProviderListOptions | null | undefined,
): void {
	const downloads = options?.scrapeTelemetry?.downloads;
	if (!downloads) return;
	downloads.succeeded += 1;
	notify(options?.scrapeTelemetry);
}

export function recordBrowserScrapeDownloadFailure(
	options: BrowserProviderListOptions | null | undefined,
): void {
	const downloads = options?.scrapeTelemetry?.downloads;
	if (!downloads) return;
	downloads.failed += 1;
	notify(options?.scrapeTelemetry);
}

export function recordBrowserScrapeNote(
	options: BrowserProviderListOptions | null | undefined,
	note: string,
): void {
	const notes = options?.scrapeTelemetry?.notes;
	if (!notes) return;
	notes.push(note);
	notify(options?.scrapeTelemetry);
}

function increment(target: Record<string, number> | undefined, key: string): void {
	if (!target) return;
	target[key] = (target[key] ?? 0) + 1;
}

function notify(telemetry: BrowserScrapeTelemetryRecorder | null | undefined): void {
	telemetry?.onUpdate?.();
}
