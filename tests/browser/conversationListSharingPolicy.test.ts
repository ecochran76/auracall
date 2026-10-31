import { expect, test } from "vitest";
import { conversationListSharingKey } from "../../src/browser/conversationListSharingKey.js";
import {
	markGeneratedConversationListOptions,
	shareableConversationListOptions,
} from "../../src/browser/conversationListSharingPolicy.js";
import { createProviderSessionAuthority } from "../../src/browser/providers/providerSessionAuthority.js";
import type { BrowserProviderListOptions } from "../../src/browser/providers/types.js";

test("generated option spreads stay portable, while caller-owned policies never become portable", () => {
	const resolved: BrowserProviderListOptions = {
		includeHistory: true,
		historyLimit: 20,
		interactionGovernor: { beforeInteraction: async () => {} },
	};
	markGeneratedConversationListOptions(resolved, { includeHistory: true, historyLimit: 20 });
	expect(shareableConversationListOptions({ ...resolved })).toEqual({
		includeHistory: true,
		historyLimit: 20,
	});
	expect(
		shareableConversationListOptions({ ...resolved, onTargetNavigation: () => {} }),
	).toBeNull();
	expect(
		shareableConversationListOptions({
			...resolved,
			interactionGovernor: { beforeInteraction: async () => {} },
		}),
	).toBeNull();
	const custom: BrowserProviderListOptions = { interactionGovernor: resolved.interactionGovernor };
	markGeneratedConversationListOptions(custom, custom);
	expect(shareableConversationListOptions(custom)).toBeNull();
});

test("generated target selection is rebuilt while explicit target selection remains part of the request", () => {
	const resolved: BrowserProviderListOptions = {
		tabTargetId: "discovered-target",
		tabUrl: "https://chatgpt.com/",
		historyLimit: 5,
	};
	markGeneratedConversationListOptions(resolved, { historyLimit: 5 });
	expect(shareableConversationListOptions({ ...resolved })).toEqual({ historyLimit: 5 });
	const explicit: BrowserProviderListOptions = {
		tabTargetId: "caller-target",
		tabUrl: "https://chatgpt.com/",
	};
	markGeneratedConversationListOptions(explicit, { ...explicit });
	expect(shareableConversationListOptions({ ...explicit })).toEqual({
		tabTargetId: "caller-target",
		tabUrl: "https://chatgpt.com/",
	});
	expect(shareableConversationListOptions({ ...resolved, tabTargetId: "changed-target" })).toEqual({
		tabTargetId: "changed-target",
		historyLimit: 5,
	});
});

test("sharing identity separates accounts, scopes, coverage, policy and browser generations", async () => {
	const config = { services: { chatgpt: { identity: { email: "fixture@example.invalid" } } } };
	const authority = createProviderSessionAuthority(config);
	const context = {
		providerId: "chatgpt" as const,
		auracallRuntimeProfile: "fixture",
		browserProfile: "fixture",
		managedBrowserProfile: "/fixture/managed",
		browserProcessId: process.pid,
		devtoolsHost: "127.0.0.1",
		devtoolsPort: 45009,
		browserTargetId: "fixture-target",
	};
	const options: BrowserProviderListOptions = {
		providerSessionAuthorization: {
			authority,
			context,
			expectation: authority.resolveExpectation(context),
		},
	};
	const authorization = options.providerSessionAuthorization;
	if (!authorization) throw new Error("Fixture authorization missing");
	const request = { includeHistory: true, historyLimit: 20 };
	const key = await conversationListSharingKey(config, options, request);
	expect(key).toMatch(/^[a-f0-9]{64}$/);
	expect(
		await conversationListSharingKey({ services: config.services }, options, {
			historyLimit: 20,
			includeHistory: true,
		}),
	).toBe(key);
	for (const change of [
		{ historyLimit: 21 },
		{ projectId: "other" },
		{ allowNavigation: false },
		{ tabTargetId: "other" },
		{ historySince: "2026-01-01" },
	]) {
		expect(await conversationListSharingKey(config, options, { ...request, ...change })).not.toBe(
			key,
		);
	}
	expect(
		await conversationListSharingKey(
			{ ...config, auracallProfile: "other-account-binding" },
			options,
			request,
		),
	).not.toBe(key);
	expect(
		await conversationListSharingKey(
			config,
			{
				...options,
				providerSessionAuthorization: {
					...authorization,
					context: { ...context, browserTargetId: "other-target" },
				},
			},
			request,
		),
	).toBe(key);
	expect(
		await conversationListSharingKey(
			config,
			{
				...options,
				providerSessionAuthorization: {
					...authorization,
					context: { ...context, browserProcessId: 0 },
				},
			},
			request,
		),
	).toBeNull();
	expect(
		await conversationListSharingKey({ ...config, callback: () => {} }, options, request),
	).toBeNull();
});
