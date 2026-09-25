import { describe, expect, test } from "vitest";

import { createInMemoryProviderInteractionLedger } from "../../packages/browser-service/src/service/interactionLedger.js";
import { clearConfiguredAggregateProviderWarning } from "../../src/browser/configuredProviderWarningClear.js";

describe("configured aggregate provider-warning clear", () => {
	test("clears the ChatGPT tenant warning into the operator quiet cooldown", async () => {
		const ledger = createInMemoryProviderInteractionLedger();
		await ledger.recordProviderWarning({
			scope: {
				provider: "chatgpt",
				tenantKey: "service-account:chatgpt:account-id=account-1",
				runtimeProfileId: "affinity",
				managedBrowserProfile: "managed-1",
			},
			classification: "human-verification",
			reason: "verification required",
			observedAt: "2026-09-24T12:00:00.000Z",
		});

		const cleared = await clearConfiguredAggregateProviderWarning({
			userConfig: {
				browser: { tabConcurrencyMode: "tab-affinity" },
				profiles: {
					affinity: {
						browser: { tabConcurrencyMode: "tab-affinity" },
						services: { chatgpt: { identity: { accountId: "account-1" } } },
					},
				},
			} as never,
			provider: "chatgpt",
			runtimeProfileId: "affinity",
			clearedAt: "2026-09-24T12:05:00.000Z",
			cooldownUntil: "2026-09-24T12:35:00.000Z",
			reason: "operator clear",
			deps: {
				createRuntime: () => ({
					mode: "tab-affinity",
					enabled: true,
					storageRoot: "/unused",
					registry: null,
					ledger,
					readStatus: async () => {
						throw new Error("not used");
					},
				}),
			},
		});

		expect(cleared).toBe(true);
		const denied = await ledger.reserve({
			scope: {
				provider: "chatgpt",
				tenantKey: "service-account:chatgpt:account-id=account-1",
				runtimeProfileId: "other-runtime",
				managedBrowserProfile: "managed-1",
			},
			workloadId: "conversation:one",
			operationId: "operation-one",
			interactionClass: "prompt-continuation",
			mutability: "provider-mutating",
			startsNewConversation: false,
			now: "2026-09-24T12:34:00.000Z",
			reservationTtlMs: 30_000,
			policy: {
				maxConcurrentChats: 4,
				maxConversationStartsPerHour: 120,
				maxConversationStartsPerDay: 240,
			},
		});
		expect(denied).toMatchObject({ allowed: false, reason: "provider-warning" });
	});
});
