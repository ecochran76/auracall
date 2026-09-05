import { describe, expect, it, vi } from "vitest";

import {
	type ChatgptSkillAdapter,
	type ChatgptSkillState,
	executeChatgptSkillOperation,
	loadChatgptSkillSource,
} from "../../src/cli/chatgptSkillsCommand.js";

function state(overrides: Partial<ChatgptSkillState> = {}): ChatgptSkillState {
	return {
		account: { email: "owner@example.com", plan: "pro" },
		inventoryComplete: true,
		skills: [
			{
				id: "11111111111111111111111111111111",
				name: "Repeated",
				collection: "installed",
				reviewStatus: "unknown",
				owner: null,
				description: null,
				files: [],
				contentHash: null,
			},
			{
				id: "22222222222222222222222222222222",
				name: "Repeated",
				collection: "created-by-me",
				reviewStatus: "needs-review",
				owner: "Owner",
				description: null,
				files: [{ path: "SKILL.md", sha256: null }],
				contentHash: null,
			},
		],
		observedAt: "2026-09-02T00:00:00.000Z",
		...overrides,
	};
}

function adapterWith(initial: ChatgptSkillState): ChatgptSkillAdapter {
	return {
		readState: vi.fn().mockResolvedValue(initial),
		readSkill: vi.fn(),
		select: vi.fn(),
		create: vi.fn(),
		update: vi.fn(),
		delete: vi.fn(),
	};
}

describe("executeChatgptSkillOperation", () => {
	it("loads one deterministic bounded SKILL.md source", async () => {
		const source = await loadChatgptSkillSource({
			sourcePath: new URL("../fixtures/chatgpt-skill", import.meta.url).pathname,
			name: " Provider-free canary ",
			description: " Probe ",
		});
		expect(source.name).toBe("Provider-free canary");
		expect(source.description).toBe("Probe");
		expect(source.instructions.endsWith("\n")).toBe(true);
		expect(source.contentHash).toMatch(/^[a-f0-9]{64}$/);
	});

	it("lists a complete exact-account inventory without collapsing duplicate names", async () => {
		const adapter: ChatgptSkillAdapter = {
			readState: vi.fn().mockResolvedValue(state()),
			readSkill: vi.fn(),
			select: vi.fn(),
			create: vi.fn(),
			update: vi.fn(),
			delete: vi.fn(),
		};

		const result = await executeChatgptSkillOperation(
			{ action: "list", expectedAccount: "OWNER@example.com" },
			adapter,
		);

		expect(result.action).toBe("list");
		expect(result.state.skills).toHaveLength(2);
		expect(result.state.skills.map((skill) => skill.collection)).toEqual([
			"installed",
			"created-by-me",
		]);
		expect(adapter.create).not.toHaveBeenCalled();
	});

	it("fails before reads beyond inventory when account or completeness is unproven", async () => {
		const wrong = adapterWith(state());
		await expect(
			executeChatgptSkillOperation(
				{ action: "show", expectedAccount: "other@example.com", skillId: "1".repeat(32) },
				wrong,
			),
		).rejects.toThrow("Expected ChatGPT account other@example.com");
		expect(wrong.readSkill).not.toHaveBeenCalled();

		const incomplete = adapterWith(state({ inventoryComplete: false }));
		await expect(
			executeChatgptSkillOperation(
				{ action: "show", expectedAccount: "owner@example.com", skillId: "1".repeat(32) },
				incomplete,
			),
		).rejects.toThrow("requires a complete inventory");
		expect(incomplete.readSkill).not.toHaveBeenCalled();
	});

	it("shows only one exact stable skill id", async () => {
		const adapter = adapterWith(state());
		vi.mocked(adapter.readSkill).mockResolvedValue(state().skills[0]);
		const result = await executeChatgptSkillOperation(
			{ action: "show", expectedAccount: "owner@example.com", skillId: "1".repeat(32) },
			adapter,
		);
		expect(result.action).toBe("show");
		if (result.action !== "show") throw new Error("expected show result");
		expect(result.skill.id).toBe("1".repeat(32));
		await expect(
			executeChatgptSkillOperation(
				{ action: "show", expectedAccount: "owner@example.com", skillId: "Repeated" },
				adapter,
			),
		).rejects.toThrow("exact 32-hex skill ID");
	});

	it("selects one exact stable skill id only after explicit confirmation", async () => {
		const adapter = adapterWith(state());
		vi.mocked(adapter.select).mockResolvedValue({
			status: "completed",
			message: "selected and cleaned",
			skillId: "1".repeat(32),
			currentUrl: "https://chatgpt.com/",
		});

		await expect(
			executeChatgptSkillOperation(
				{
					action: "select",
					expectedAccount: "owner@example.com",
					confirmed: false,
					skillId: "1".repeat(32),
				},
				adapter,
			),
		).rejects.toThrow("requires --yes");
		expect(adapter.select).not.toHaveBeenCalled();

		const result = await executeChatgptSkillOperation(
			{
				action: "select",
				expectedAccount: "owner@example.com",
				confirmed: true,
				skillId: "1".repeat(32),
			},
			adapter,
		);
		expect(result).toMatchObject({ action: "select", status: "completed" });
		expect(adapter.select).toHaveBeenCalledWith(state().skills[0]);
		expect(adapter.readSkill).not.toHaveBeenCalled();
	});

	it("proves create by returned fresh id and exact source hash", async () => {
		const adapter = adapterWith(state({ skills: [] }));
		const source = {
			name: "Canary",
			description: "first",
			instructions: "alpha",
			contentHash: "a".repeat(64),
		};
		vi.mocked(adapter.create).mockResolvedValue({
			status: "completed",
			message: "created",
			skillId: "3".repeat(32),
		});
		vi.mocked(adapter.readState)
			.mockResolvedValueOnce(state({ skills: [] }))
			.mockResolvedValueOnce(
				state({
					skills: [
						{
							...state().skills[0],
							id: "3".repeat(32),
							name: "Canary",
							contentHash: source.contentHash,
						},
					],
				}),
			);
		vi.mocked(adapter.readSkill).mockResolvedValue({
			...state().skills[0],
			id: "3".repeat(32),
			name: "Canary",
			contentHash: source.contentHash,
		});

		const result = await executeChatgptSkillOperation(
			{ action: "create", expectedAccount: "owner@example.com", confirmed: true, source },
			adapter,
		);
		expect(result.status).toBe("completed");
		if (result.action !== "create") throw new Error("expected create result");
		expect(result.skill?.contentHash).toBe(source.contentHash);
	});

	it("rejects an update whose expected prior hash is stale before mutation", async () => {
		const adapter = adapterWith(
			state({ skills: [{ ...state().skills[0], contentHash: "b".repeat(64) }] }),
		);
		vi.mocked(adapter.readSkill).mockResolvedValue({
			...state().skills[0],
			contentHash: "b".repeat(64),
		});
		await expect(
			executeChatgptSkillOperation(
				{
					action: "update",
					expectedAccount: "owner@example.com",
					confirmed: true,
					skillId: "1".repeat(32),
					expectedHash: "a".repeat(64),
					source: {
						name: "Repeated",
						description: null,
						instructions: "new",
						contentHash: "c".repeat(64),
					},
				},
				adapter,
			),
		).rejects.toThrow("content hash changed");
		expect(adapter.update).not.toHaveBeenCalled();
	});

	it("proves exact absence after a confirmed delete", async () => {
		const adapter = adapterWith(state());
		vi.mocked(adapter.readSkill).mockResolvedValueOnce(state().skills[0]);
		vi.mocked(adapter.delete).mockResolvedValue({ status: "completed", message: "deleted" });
		vi.mocked(adapter.readState)
			.mockResolvedValueOnce(state())
			.mockResolvedValueOnce(state({ skills: state().skills.slice(1) }));
		const result = await executeChatgptSkillOperation(
			{
				action: "delete",
				expectedAccount: "owner@example.com",
				confirmed: true,
				skillId: "1".repeat(32),
			},
			adapter,
		);
		expect(result.status).toBe("completed");
	});

	it("returns an uncertain outcome without performing postcondition reads", async () => {
		const adapter = adapterWith(state({ skills: [] }));
		vi.mocked(adapter.create).mockResolvedValue({
			status: "outcome-unknown",
			message: "submission result unknown",
		});
		const result = await executeChatgptSkillOperation(
			{
				action: "create",
				expectedAccount: "owner@example.com",
				confirmed: true,
				source: {
					name: "Canary",
					description: null,
					instructions: "alpha",
					contentHash: "a".repeat(64),
				},
			},
			adapter,
		);
		expect(result.status).toBe("outcome-unknown");
		expect(adapter.readState).toHaveBeenCalledTimes(1);
		expect(adapter.readSkill).not.toHaveBeenCalled();
	});
});
