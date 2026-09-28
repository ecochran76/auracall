import { describe, expect, it } from "vitest";
import {
	createTabAffinitySoakEvent,
	evaluateTabAffinitySoakSnapshot,
	TAB_AFFINITY_SOAK_MINIMUM_MS,
} from "../../src/browser/tabAffinitySoak.js";
import type { BrowserTabConcurrencyStatus } from "../../src/browser/tabConcurrencyRuntime.js";

const healthy = (): BrowserTabConcurrencyStatus => ({
	mode: "tab-affinity",
	enabled: true,
	storageRoot: "/sanitized",
	leaseCount: 3,
	fencedLeaseCount: 3,
	interactionCount: 3,
	activeInteractionCount: 0,
	providerWarningEventCount: 0,
	providerWarnings: {
		active: 0,
		indefinite: 0,
		cooldown: 0,
		classifications: {},
		maximumCooldownRemainingMs: 0,
	},
	admissionRejections: { total: 0, latestReason: null, reasons: {} },
	aggregateUsage: { activeChats: 2, chatsLastHour: 2, chatsLastDay: 2, interactionsLastMinute: 3 },
	leaseStates: { active: 2, idle: 1, retiring: 0, released: 0, lost: 0 },
	workloads: { conversations: 2, newConversations: 0, liveFollow: 1, ephemeral: 0 },
	attention: { expiredIdle: 0, outcomeUnknown: 0, restartUnverified: 0 },
	bindingLifetimes: [],
	targetActions: {
		targetCreations: 3,
		adoptions: 0,
		navigations: 0,
		reloads: 0,
		focuses: 0,
		closes: 0,
	},
	targetActionsByWorkload: {
		conversations: {
			targetCreations: 2,
			adoptions: 0,
			navigations: 0,
			reloads: 0,
			focuses: 0,
			closes: 0,
		},
		newConversations: {
			targetCreations: 0,
			adoptions: 0,
			navigations: 0,
			reloads: 0,
			focuses: 0,
			closes: 0,
		},
		liveFollow: {
			targetCreations: 1,
			adoptions: 0,
			navigations: 0,
			reloads: 0,
			focuses: 0,
			closes: 0,
		},
		ephemeral: {
			targetCreations: 0,
			adoptions: 0,
			navigations: 0,
			reloads: 0,
			focuses: 0,
			closes: 0,
		},
	},
	retirements: { closed: 0, alreadyMissing: 0, preserved: 0 },
});

describe("tab-affinity soak evidence", () => {
	it("accepts a stable sanitized snapshot", () => {
		expect(evaluateTabAffinitySoakSnapshot({ baseline: healthy(), current: healthy() })).toEqual({
			accepted: true,
			hardStops: [],
		});
	});

	it("fails closed on guard, quota, lease, uncertainty, expiry, and target churn", () => {
		const current = healthy();
		current.providerWarnings.active = 1;
		current.providerWarningEventCount = 1;
		current.admissionRejections.total = 1;
		current.admissionRejections.latestReason = "minute-interaction-limit";
		current.leaseStates.lost = 1;
		current.attention.outcomeUnknown = 1;
		current.attention.restartUnverified = 1;
		current.attention.expiredIdle = 1;
		current.targetActions.targetCreations = 4;
		current.targetActions.navigations = 1;
		current.targetActionsByWorkload.conversations.navigations = 1;
		current.targetActions.reloads = 1;
		current.targetActions.focuses = 1;
		expect(evaluateTabAffinitySoakSnapshot({ baseline: healthy(), current })).toEqual({
			accepted: false,
			hardStops: [
				"provider-warning-active",
				"provider-warning-event",
				"admission-rejection",
				"lost-lease",
				"outcome-unknown",
				"restart-unverified",
				"expired-idle",
				"target-creation-churn",
				"navigation-churn",
				"reload-churn",
				"focus-churn",
			],
		});
	});

	it("allows warning and rejection history that predates the soak baseline", () => {
		const baseline = healthy();
		baseline.providerWarningEventCount = 2;
		baseline.admissionRejections = {
			total: 3,
			latestReason: "minute-interaction-limit",
			reasons: { "minute-interaction-limit": 3 },
		};
		const current = structuredClone(baseline);

		expect(evaluateTabAffinitySoakSnapshot({ baseline, current })).toEqual({
			accepted: true,
			hardStops: [],
		});
	});

	it("allows governed crawler navigation while preserving the non-crawler navigation gate", () => {
		const current = healthy();
		current.targetActions.navigations = 4;
		current.targetActionsByWorkload.liveFollow.navigations = 4;

		expect(evaluateTabAffinitySoakSnapshot({ baseline: healthy(), current })).toEqual({
			accepted: true,
			hardStops: [],
		});
	});

	it("allows target creation attributed one-for-one to new foreground work", () => {
		const current = healthy();
		current.leaseCount += 1;
		current.workloads.newConversations += 1;
		current.targetActions.targetCreations += 1;
		current.targetActions.navigations += 1;
		current.targetActionsByWorkload.newConversations.targetCreations += 1;
		current.targetActionsByWorkload.liveFollow.navigations += 1;

		expect(evaluateTabAffinitySoakSnapshot({ baseline: healthy(), current })).toEqual({
			accepted: true,
			hardStops: [],
		});
	});

	it("rejects unattributed and duplicate target creation", () => {
		const unattributed = healthy();
		unattributed.targetActions.targetCreations += 1;
		expect(evaluateTabAffinitySoakSnapshot({ baseline: healthy(), current: unattributed })).toEqual(
			{
				accepted: false,
				hardStops: ["target-creation-churn"],
			},
		);

		const duplicate = healthy();
		duplicate.workloads.newConversations += 1;
		duplicate.targetActions.targetCreations += 2;
		duplicate.targetActionsByWorkload.newConversations.targetCreations += 2;
		expect(evaluateTabAffinitySoakSnapshot({ baseline: healthy(), current: duplicate })).toEqual({
			accepted: false,
			hardStops: ["target-creation-churn"],
		});
	});

	it("allows a settled expired lease to pass through normal TTL retirement", () => {
		const current = healthy();
		current.leaseStates.active = 1;
		current.leaseStates.lost = 1;
		current.bindingLifetimes = [
			{
				workloadKind: "live-follow",
				state: "lost",
				effectState: "settled",
				ageMs: 901_000,
				lastMeaningfulUseAgeMs: 901_000,
				idleRemainingMs: -1_000,
				absoluteRemainingMs: 27_899_000,
				idleExpired: true,
				absoluteExpired: false,
			},
		];

		expect(evaluateTabAffinitySoakSnapshot({ baseline: healthy(), current })).toEqual({
			accepted: true,
			hardStops: [],
		});
	});

	it("still rejects unexplained, unsettled, or pre-expiry lost leases", () => {
		const unexplained = healthy();
		unexplained.leaseStates.lost = 1;
		expect(evaluateTabAffinitySoakSnapshot({ baseline: healthy(), current: unexplained })).toEqual({
			accepted: false,
			hardStops: ["lost-lease"],
		});

		const unsettled = healthy();
		unsettled.leaseStates.lost = 1;
		unsettled.bindingLifetimes = [
			{
				workloadKind: "conversation",
				state: "lost",
				effectState: "outcome-unknown",
				ageMs: 901_000,
				lastMeaningfulUseAgeMs: 901_000,
				idleRemainingMs: -1_000,
				absoluteRemainingMs: 27_899_000,
				idleExpired: true,
				absoluteExpired: false,
			},
		];
		expect(evaluateTabAffinitySoakSnapshot({ baseline: healthy(), current: unsettled })).toEqual({
			accepted: false,
			hardStops: ["lost-lease"],
		});

		const preExpiry = structuredClone(unsettled);
		preExpiry.bindingLifetimes[0] = {
			...preExpiry.bindingLifetimes[0]!,
			effectState: "settled",
			idleRemainingMs: 1_000,
			idleExpired: false,
		};
		expect(evaluateTabAffinitySoakSnapshot({ baseline: healthy(), current: preExpiry })).toEqual({
			accepted: false,
			hardStops: ["lost-lease"],
		});
	});

	it("rejects finish before the real minimum window", () => {
		const event = createTabAffinitySoakEvent({
			receiptId: "soak-1",
			type: "finished",
			identity: {
				runtimeProfileId: "wsl-chrome-3",
				expectedIdentity: "expected",
				sourceCommit: "abc",
				installedVersion: "0.1.1",
			},
			startedAt: "2026-09-25T00:00:00.000Z",
			baseline: healthy(),
			snapshot: { observedAt: "2026-09-25T01:00:00.000Z", status: healthy() },
		});
		expect(event.elapsedMs).toBeLessThan(TAB_AFFINITY_SOAK_MINIMUM_MS);
		expect(event.evaluation).toEqual({
			accepted: false,
			hardStops: ["minimum-window-not-elapsed"],
		});
	});
});
