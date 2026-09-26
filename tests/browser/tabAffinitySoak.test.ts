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

	it("fails closed on guard, lease, uncertainty, expiry, and target churn", () => {
		const current = healthy();
		current.providerWarnings.active = 1;
		current.leaseStates.lost = 1;
		current.attention.outcomeUnknown = 1;
		current.attention.restartUnverified = 1;
		current.attention.expiredIdle = 1;
		current.targetActions.navigations = 1;
		current.targetActionsByWorkload.conversations.navigations = 1;
		current.targetActions.reloads = 1;
		current.targetActions.focuses = 1;
		expect(evaluateTabAffinitySoakSnapshot({ baseline: healthy(), current })).toEqual({
			accepted: false,
			hardStops: [
				"provider-warning-active",
				"lost-lease",
				"outcome-unknown",
				"restart-unverified",
				"expired-idle",
				"navigation-churn",
				"reload-churn",
				"focus-churn",
			],
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
