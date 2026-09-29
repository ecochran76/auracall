import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { setAuracallHomeDirOverrideForTest } from "../../src/auracallHome.js";
import {
	appendChatgptMutationTimestamp,
	extractChatgptRateLimitSummary,
	getChatgptMutationBudgetWaitMs,
	getChatgptPostCommitQuietWaitMs,
	isChatgptRateLimitMessage,
	pruneChatgptMutationHistory,
	readChatgptRateLimitGuardState,
	recordChatgptRateLimitDetection,
	resolveChatgptRateLimitCooldownMs,
	resolveChatgptRateLimitGuardPath,
	resolveChatgptRateLimitProfileName,
	writeChatgptRateLimitGuardState,
} from "../../src/browser/chatgptRateLimitGuard.js";

describe("chatgptRateLimitGuard", () => {
	afterEach(() => {
		setAuracallHomeDirOverrideForTest(null);
	});

	test("derives profile name from managed profile directory layout", () => {
		expect(
			resolveChatgptRateLimitProfileName({
				managedProfileRoot: "/tmp/auracall/browser-profiles",
				managedProfileDir: "/tmp/auracall/browser-profiles/windows-chrome-test/chatgpt",
			}),
		).toBe("windows-chrome-test");
	});

	test("detects and summarizes live ChatGPT rate-limit messages", () => {
		const message =
			"Too many requests. You’re making requests too quickly. Please try again later.";
		expect(isChatgptRateLimitMessage(message)).toBe(true);
		expect(extractChatgptRateLimitSummary(message)).toBe("Too many requests.");
	});

	test("escalates cooldown for repeated ChatGPT rate-limit detections", () => {
		const now = 1_000_000;
		expect(
			resolveChatgptRateLimitCooldownMs(null, now, {
				baseCooldownMs: 5_000,
				repeatedCooldownMs: 15_000,
				repeatedWindowMs: 30_000,
			}),
		).toBe(5_000);
		expect(
			resolveChatgptRateLimitCooldownMs({ cooldownDetectedAt: now - 10_000 }, now, {
				baseCooldownMs: 5_000,
				repeatedCooldownMs: 15_000,
				repeatedWindowMs: 30_000,
			}),
		).toBe(15_000);
		expect(
			resolveChatgptRateLimitCooldownMs({ cooldownDetectedAt: now - 10_000 }, now, {
				retryAfterMs: 20_000,
				baseCooldownMs: 5_000,
				repeatedCooldownMs: 15_000,
				repeatedWindowMs: 30_000,
			}),
		).toBe(20_000);

		expect(
			resolveChatgptRateLimitCooldownMs(
				{ recentRateLimitDetectionAts: [now - 20_000, now - 10_000] },
				now,
				{
					baseCooldownMs: 5_000,
					escalationWindowMs: 60_000,
					maxCooldownMs: 60_000,
				},
			),
		).toBe(45_000);
		expect(
			resolveChatgptRateLimitCooldownMs(
				{ recentRateLimitDetectionAts: [now - 50_000, now - 40_000, now - 30_000] },
				now,
				{
					baseCooldownMs: 5_000,
					escalationWindowMs: 60_000,
					maxCooldownMs: 60_000,
				},
			),
		).toBe(60_000);
		expect(
			resolveChatgptRateLimitCooldownMs({ recentRateLimitDetectionAts: [now - 70_000] }, now, {
				baseCooldownMs: 5_000,
				escalationWindowMs: 60_000,
				maxCooldownMs: 60_000,
			}),
		).toBe(5_000);
	});

	test("writes and reads persisted guard state", async () => {
		const homeDir = await mkdtemp(path.join(os.tmpdir(), "auracall-chatgpt-guard-"));
		setAuracallHomeDirOverrideForTest(homeDir);

		try {
			const state = {
				provider: "chatgpt" as const,
				profile: "default",
				updatedAt: Date.now(),
				lastMutationAt: Date.now() - 1000,
				recentMutationAts: [Date.now() - 4000, Date.now() - 2000],
				recentRateLimitDetectionAts: [Date.now() - 3000],
				cooldownUntil: Date.now() + 5000,
				cooldownDetectedAt: Date.now() - 100,
				cooldownReason: "Too many requests.",
				cooldownAction: "browserRun",
			};
			await writeChatgptRateLimitGuardState(state, { profileName: "default" });
			const persisted = await readChatgptRateLimitGuardState({ profileName: "default" });
			expect(persisted).toEqual(state);
			expect(resolveChatgptRateLimitGuardPath({ profileName: "default" })).toBe(
				path.join(
					homeDir,
					"cache",
					"providers",
					"chatgpt",
					"__runtime__",
					"rate-limit-default.json",
				),
			);
		} finally {
			await rm(homeDir, { recursive: true, force: true });
		}
	});

	test("records a profile cooldown after a post-effect rate-limit detection", async () => {
		const homeDir = await mkdtemp(path.join(os.tmpdir(), "auracall-chatgpt-detection-"));
		setAuracallHomeDirOverrideForTest(homeDir);
		const now = 1_000_000;

		try {
			const recorded = await recordChatgptRateLimitDetection({
				profileName: "wsl-chrome-3",
				action: "remoteBrowserRun",
				reason: "Too many requests.",
				now,
			});

			expect(recorded).toMatchObject({
				profile: "wsl-chrome-3",
				cooldownDetectedAt: now,
				cooldownUntil: now + 5 * 60_000,
				cooldownReason: "Too many requests.",
				cooldownAction: "remoteBrowserRun",
				recentRateLimitDetectionAts: [now],
			});
			await expect(
				readChatgptRateLimitGuardState({ profileName: "wsl-chrome-3" }),
			).resolves.toEqual(recorded);
		} finally {
			await rm(homeDir, { recursive: true, force: true });
		}
	});

	test("ignores malformed persisted guard state", async () => {
		const homeDir = await mkdtemp(path.join(os.tmpdir(), "auracall-chatgpt-guard-"));
		setAuracallHomeDirOverrideForTest(homeDir);

		try {
			const statePath = resolveChatgptRateLimitGuardPath({ profileName: "wsl-chrome-2" });
			await mkdir(path.dirname(statePath), { recursive: true });
			await writeFile(
				statePath,
				'{\n  "provider": "chatgpt",\n  "profile": "wsl-chrome-2"\n}\n}\n',
				"utf8",
			);

			await expect(
				readChatgptRateLimitGuardState({ profileName: "wsl-chrome-2" }),
			).resolves.toBeNull();
		} finally {
			await rm(homeDir, { recursive: true, force: true });
		}
	});

	test("prunes old mutation timestamps and appends new ones in order", () => {
		expect(appendChatgptMutationTimestamp([1_000, 4_000, 12_000], 20_000, 10_000)).toEqual([
			12_000, 20_000,
		]);
		expect(pruneChatgptMutationHistory([1_000, 4_000, 12_000], 20_000, 10_000)).toEqual([12_000]);
	});

	test("calculates a rolling write-budget delay when the mutation window is full", () => {
		expect(
			getChatgptMutationBudgetWaitMs(
				{
					recentMutationAts: [10_000, 30_000, 50_000, 70_000],
				},
				80_000,
				{ windowMs: 120_000, maxWeight: 3 },
			),
		).toBe(50_000);
	});

	test("calculates a longer post-commit quiet period as recent activity grows", () => {
		expect(
			getChatgptPostCommitQuietWaitMs(
				{
					recentMutations: [
						{ at: 80_000, action: "renameConversation", weight: 1, quietMs: 12_000 },
						{ at: 95_000, action: "deleteConversation", weight: 1.5, quietMs: 15_000 },
					],
				},
				100_000,
				{ windowMs: 120_000, jitterMaxMs: 0 },
			),
		).toBe(14_000);
	});
});
