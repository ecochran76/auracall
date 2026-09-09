import { describe, expect, it, vi } from "vitest";
import { ChatgptSkillBrowserAdapter } from "../../src/browser/providers/chatgptSkills.js";
import type { ChatgptSkill } from "../../src/cli/chatgptSkillsCommand.js";

const mocks = vi.hoisted(() => ({
	navigate: vi.fn(),
	submit: vi.fn(),
	wait: vi.fn(),
	mode: vi.fn(),
	identity: vi.fn(),
}));
vi.mock("../../src/browser/service/ui.js", () => ({
	navigateAndSettle: mocks.navigate,
	pressButtonWithTrustedPointer: vi.fn(async () => ({ ok: true })),
	waitForPredicate: vi.fn(async () => ({ ok: true })),
	reloadAndSettle: vi.fn(),
	setInputValue: vi.fn(),
}));
vi.mock("../../src/browser/actions/promptComposer.js", () => ({ submitPrompt: mocks.submit }));
vi.mock("../../src/browser/actions/assistantResponse.js", () => ({
	waitForAssistantResponse: mocks.wait,
}));
vi.mock("../../src/browser/actions/chatgptComposerMode.js", () => ({
	ensureChatgptComposerMode: mocks.mode,
}));
vi.mock("../../src/browser/providers/chatgptAdapter.js", () => ({
	classifyChatgptBlockingSurfaceProbe: vi.fn(() => null),
	readChatgptUserIdentity: mocks.identity,
}));

const skill: ChatgptSkill = {
	id: "1".repeat(32),
	name: "Canary",
	collection: "installed",
	reviewStatus: "ready",
	owner: null,
	description: null,
	files: [],
	contentHash: null,
};
function setup(
	options: { lostSelection?: boolean; sendFailure?: boolean; wrongAccount?: boolean } = {},
) {
	vi.clearAllMocks();
	let inserted = false;
	let submitted = false;
	mocks.navigate.mockResolvedValue({ ok: true });
	mocks.mode.mockResolvedValue(undefined);
	mocks.identity.mockResolvedValue({
		email: options.wrongAccount ? "other@example.com" : "owner@example.com",
	});
	mocks.wait.mockResolvedValue({ text: "Skill result", meta: {} });
	mocks.submit.mockImplementation(async (deps) => {
		inserted = true;
		await deps.beforeSend();
		submitted = true;
		if (options.sendFailure) throw new Error("send acknowledgement lost");
		return 1;
	});
	const client = {
		["Runtime"]: {
			enable: vi.fn(),
			evaluate: vi.fn(async ({ expression }) => {
				if (expression.startsWith("document.querySelectorAll(")) return { result: { value: 0 } };
				if (expression === "location.href")
					return {
						result: { value: submitted ? "https://chatgpt.com/c/canary" : "https://chatgpt.com/" },
					};
				if (expression.includes("providerPrefillOnly"))
					return {
						result: {
							value: {
								selected: !(inserted && options.lostSelection),
								markerObserved: !(inserted && options.lostSelection),
								skillId: skill.id,
							},
						},
					};
				return { result: { value: true } };
			}),
		},
		["Page"]: { enable: vi.fn() },
		["Input"]: {},
		close: vi.fn(async () => undefined),
	};
	const connect = vi.fn(async () => ({ client, port: 45015 }));
	const adapter = new ChatgptSkillBrowserAdapter({
		connectChatgptPromptWorkbench: connect,
	} as never);
	return { adapter, connect, client, wasSubmitted: () => submitted };
}

describe("Skill selection and prompt continuity", () => {
	it("selects and submits on the same connection without cleanup between them", async () => {
		const { adapter, connect, client } = setup();
		const result = await adapter.run(skill, {
			prompt: "Investigate",
			expectedAccount: "owner@example.com",
			timeoutMs: 1000,
		});
		expect(result.status).toBe("completed");
		expect(result.responseText).toBe("Skill result");
		expect(result.submissionAttempted).toBe(true);
		expect(mocks.submit.mock.calls[0][0].runtime).toBe(client.Runtime);
		expect(mocks.wait.mock.calls[0][0]).toBe(client.Runtime);
		expect(mocks.wait.mock.calls[0][3]).toEqual({ minTurnIndex: 0 });
		expect(mocks.mode).toHaveBeenCalledWith(client.Runtime, "chat", expect.any(Function));
		await adapter.close();
		expect(connect).toHaveBeenCalledTimes(1);
		expect(mocks.navigate.mock.calls.map((call) => call[1].url)).toEqual([
			`https://chatgpt.com/skills?skill_id=${skill.id}`,
		]);
	});
	it("refuses Send when inserting the prompt loses the Skill marker", async () => {
		const { adapter, wasSubmitted } = setup({ lostSelection: true });
		const result = await adapter.run(skill, {
			prompt: "Investigate",
			expectedAccount: "owner@example.com",
			timeoutMs: 1000,
		});
		expect(result.status).toBe("outcome-unknown");
		expect(wasSubmitted()).toBe(false);
		expect(mocks.wait).not.toHaveBeenCalled();
	});
	it("refuses Send when the same tab no longer has the expected account", async () => {
		const { adapter, wasSubmitted } = setup({ wrongAccount: true });
		const result = await adapter.run(skill, {
			prompt: "Investigate",
			expectedAccount: "owner@example.com",
			timeoutMs: 1000,
		});
		expect(result.status).toBe("outcome-unknown");
		expect(wasSubmitted()).toBe(false);
	});
	it("preserves uncertain sends and does not retry or navigate away", async () => {
		const { adapter } = setup({ sendFailure: true });
		const result = await adapter.run(skill, {
			prompt: "Investigate",
			expectedAccount: "owner@example.com",
			timeoutMs: 1000,
		});
		expect(result.status).toBe("outcome-unknown");
		expect(result.submissionAttempted).toBe(true);
		expect(result.currentUrl).toBe("https://chatgpt.com/c/canary");
		expect(result.message).toContain("do not retry");
		await adapter.close();
		expect(mocks.submit).toHaveBeenCalledTimes(1);
		expect(mocks.navigate).toHaveBeenCalledTimes(1);
		expect(mocks.wait).not.toHaveBeenCalled();
	});
});
