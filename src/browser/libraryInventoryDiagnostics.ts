export const LIBRARY_INVENTORY_STAGES = [
	"cli-client-create",
	"cli-inventory-read",
	"affinity-resolve-target",
	"affinity-reconcile-leases",
	"affinity-retire-leases",
	"affinity-acquire-target",
	"affinity-build-options",
	"affinity-provider-read",
	"service-build-list-options",
	"service-provider-read",
	"service-cache-context",
	"service-cache-write",
	"interaction-governor",
	"connect",
	"identity",
	"dialog-cleanup",
	"route-readiness",
	"dom-inventory",
] as const;

export type LibraryInventoryStage = (typeof LIBRARY_INVENTORY_STAGES)[number];

export const LIBRARY_INVENTORY_CLEANUP_PHASES = [
	"provider-abort-requested",
	"read-rejected",
	"abort-cleanup-started",
	"abort-cleanup-settled",
	"abort-cleanup-timed-out",
	"affinity-settlement-started",
	"affinity-settlement-settled",
	"affinity-settlement-timed-out",
] as const;

export type LibraryInventoryCleanupPhase = (typeof LIBRARY_INVENTORY_CLEANUP_PHASES)[number];

export interface LibraryInventoryLifecycle {
	onStageEntered(stage: LibraryInventoryStage): void;
	onCleanupPhase(phase: LibraryInventoryCleanupPhase): void;
}

export type LibraryInventoryTimelineEvent =
	| { kind: "stage"; stage: LibraryInventoryStage; observedAt: string }
	| { kind: "cleanup"; phase: LibraryInventoryCleanupPhase; observedAt: string };

export interface LibraryInventoryDiagnosticsSnapshot {
	lastStage: LibraryInventoryStage | null;
	lastStageEnteredAt: string | null;
	cleanupPhase: LibraryInventoryCleanupPhase | null;
	cleanupPhaseObservedAt: string | null;
	timeline: LibraryInventoryTimelineEvent[];
}

const MAX_LIBRARY_INVENTORY_TIMELINE_EVENTS = 32;
const LIBRARY_INVENTORY_STAGE_SET = new Set<string>(LIBRARY_INVENTORY_STAGES);
const LIBRARY_INVENTORY_CLEANUP_PHASE_SET = new Set<string>(LIBRARY_INVENTORY_CLEANUP_PHASES);

export function recordLibraryInventoryStage(
	input: { libraryInventoryLifecycle?: LibraryInventoryLifecycle } | null | undefined,
	stage: LibraryInventoryStage,
): void {
	input?.libraryInventoryLifecycle?.onStageEntered(stage);
}

export function recordLibraryInventoryCleanupPhase(
	input: { libraryInventoryLifecycle?: LibraryInventoryLifecycle } | null | undefined,
	phase: LibraryInventoryCleanupPhase,
): void {
	input?.libraryInventoryLifecycle?.onCleanupPhase(phase);
}

export function createLibraryInventoryDiagnosticsRecorder(now: () => Date = () => new Date()): {
	lifecycle: LibraryInventoryLifecycle;
	snapshot: () => LibraryInventoryDiagnosticsSnapshot;
} {
	let lastStage: LibraryInventoryStage | null = null;
	let lastStageEnteredAt: string | null = null;
	let cleanupPhase: LibraryInventoryCleanupPhase | null = null;
	let cleanupPhaseObservedAt: string | null = null;
	const timeline: LibraryInventoryTimelineEvent[] = [];
	const recordedCleanupPhases = new Set<LibraryInventoryCleanupPhase>();
	const push = (event: LibraryInventoryTimelineEvent) => {
		timeline.push(event);
		if (timeline.length > MAX_LIBRARY_INVENTORY_TIMELINE_EVENTS) timeline.shift();
	};
	const lifecycle: LibraryInventoryLifecycle = {
		onStageEntered(stage) {
			if (!LIBRARY_INVENTORY_STAGE_SET.has(stage)) return;
			const observedAt = now().toISOString();
			lastStage = stage;
			lastStageEnteredAt = observedAt;
			push({ kind: "stage", stage, observedAt });
		},
		onCleanupPhase(phase) {
			if (!LIBRARY_INVENTORY_CLEANUP_PHASE_SET.has(phase)) return;
			if (recordedCleanupPhases.has(phase)) return;
			recordedCleanupPhases.add(phase);
			const observedAt = now().toISOString();
			cleanupPhase = phase;
			cleanupPhaseObservedAt = observedAt;
			push({ kind: "cleanup", phase, observedAt });
		},
	};
	return {
		lifecycle,
		snapshot: () => ({
			lastStage,
			lastStageEnteredAt,
			cleanupPhase,
			cleanupPhaseObservedAt,
			timeline: [...timeline],
		}),
	};
}
