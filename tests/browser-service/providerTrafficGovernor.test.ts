import { describe, expect, test, vi } from "vitest";
import type { BrowserMutationRecord } from "../../packages/browser-service/src/service/mutationDispatcher.js";
import { navigateAndSettle } from "../../packages/browser-service/src/service/ui.js";
import {
	createProviderTrafficGovernor,
	ProviderTrafficAttributionError,
	type ProviderTrafficWarning,
	ProviderTrafficWarningError,
} from "../../packages/browser-service/src/service/providerTrafficGovernor.js";

const attribution = {
	provider: "chatgpt",
	runtimeProfileId: "wsl-chrome-3",
	managedBrowserProfile: "/managed/chatgpt",
	workloadId: "live-follow:completion-1",
	operationId: "completion-1",
	tabLeaseId: "lease-1",
};

describe("provider traffic governor", () => {
	test("rejects missing exact provider-work attribution during construction", () => {
		expect(() =>
			createProviderTrafficGovernor({
				attribution: { ...attribution, tabLeaseId: "" },
				interactionGovernor: { beforeInteraction: vi.fn() },
				mutationAudit: vi.fn(),
			}),
		).toThrowError(ProviderTrafficAttributionError);
	});

	test("fails before effect when lease validation, admission, or start persistence fails", async () => {
		const physicalEffect = vi.fn();
		const rejectedLease = createProviderTrafficGovernor({
			attribution,
			interactionGovernor: { beforeInteraction: vi.fn() },
			mutationAudit: vi.fn(),
			assertLease: vi.fn(async () => {
				throw new Error("lease-lost");
			}),
		});
		await expect(
			rejectedLease.begin({ kind: "reload", interactionClass: "page-refresh", source: "test" }),
		).rejects.toThrow("lease-lost");

		const rejectedAdmission = createProviderTrafficGovernor({
			attribution,
			interactionGovernor: {
				beforeInteraction: vi.fn(async () => {
					throw new Error("cooldown-active");
				}),
			},
			mutationAudit: vi.fn(),
		});
		await expect(
			rejectedAdmission.begin({
				kind: "navigate",
				interactionClass: "renavigation",
				source: "test",
			}),
		).rejects.toThrow("cooldown-active");

		const rejectedStart = createProviderTrafficGovernor({
			attribution,
			interactionGovernor: { beforeInteraction: vi.fn() },
			mutationAudit: vi.fn(async () => {
				throw new Error("ledger-unwritable");
			}),
		});
		await expect(
			rejectedStart.begin({ kind: "reload", interactionClass: "page-refresh", source: "test" }),
		).rejects.toThrow("ledger-unwritable");
		expect(physicalEffect).not.toHaveBeenCalled();
	});

	test("fails before effect when a provider-marked client loses its governor", async () => {
		const navigate = vi.fn(async () => undefined);
		await expect(
			navigateAndSettle(
				{
					Page: { navigate } as never,
					Runtime: { evaluate: vi.fn(async () => ({ result: { value: null } })) } as never,
					__auracallProviderTrafficRequired: true,
				} as never,
				{ url: "https://chatgpt.com/c/1" },
			),
		).rejects.toThrow("Provider traffic governor is required");
		expect(navigate).not.toHaveBeenCalled();
	});

	test("records settlement and persists a warning before rejecting later traffic", async () => {
		const observedRecords: BrowserMutationRecord[] = [];
		const audit = vi.fn(async (record: BrowserMutationRecord) => {
			observedRecords.push(record);
		});
		const persistWarning = vi.fn(async () => undefined);
		const settleInteraction = vi.fn(async () => undefined);
		const governor = createProviderTrafficGovernor({
			attribution,
			interactionGovernor: { beforeInteraction: vi.fn(async () => undefined) },
			mutationAudit: audit,
			settleInteraction,
			probeWarning: vi.fn(
				async (): Promise<ProviderTrafficWarning> => ({
					classification: "rate-limit",
					reason: "Too many requests",
					cooldownUntil: "2026-09-30T02:00:00.000Z",
				}),
			),
			persistWarning,
			createActionId: () => "action-1",
		});

		const action = await governor.begin({
			kind: "reload",
			interactionClass: "page-refresh",
			source: "live-follow:reload",
		});
		await expect(
			action.settle({ outcome: "succeeded", probeContext: { visible: true } }),
		).rejects.toBeInstanceOf(ProviderTrafficWarningError);

		expect(audit).toHaveBeenCalledTimes(2);
		expect(settleInteraction).toHaveBeenCalledWith({
			outcome: "succeeded",
			effectState: "settled",
			reason: null,
		});
		expect(observedRecords.map((record) => record.phase)).toEqual(["start", "complete"]);
		expect(persistWarning).toHaveBeenCalledWith(
			expect.objectContaining({ classification: "rate-limit", reason: "Too many requests" }),
			expect.objectContaining({ operationId: "completion-1", tabLeaseId: "lease-1" }),
		);
		await expect(
			governor.begin({ kind: "reload", interactionClass: "page-refresh", source: "late" }),
		).rejects.toBeInstanceOf(ProviderTrafficWarningError);
	});
});
