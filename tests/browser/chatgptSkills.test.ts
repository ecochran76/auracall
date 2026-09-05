import { describe, expect, it, vi } from "vitest";

import {
	buildChatgptSkillEditorProbeExpression,
	buildChatgptSkillCleanupExpression,
	buildChatgptSkillSelectionProbeExpression,
	createChatgptSkillBrowserAdapter,
	deriveChatgptSkillDetail,
	deriveChatgptSkillState,
	hashChatgptSkillInstructions,
	isChatgptSkillAbsentFromInventory,
	joinChatgptCodeMirrorLines,
	normalizeChatgptSkillInventoryPayloads,
	readChatgptSkillIdFromUrl,
} from "../../src/browser/providers/chatgptSkills.js";

describe("ChatGPT Skill provider contracts", () => {
	it("attaches the Skills workflow to the qualified ChatGPT prompt workbench", async () => {
		const genericConnect = vi.fn();
		const promptConnect = vi.fn(async () => ({
			client: {
				["Runtime"]: {
					enable: vi.fn(async () => undefined),
					evaluate: vi.fn(async () => ({ result: { value: "https://chatgpt.com/" } })),
				},
				["Page"]: { enable: vi.fn(async () => undefined) },
				close: vi.fn(async () => undefined),
			},
			port: 45015,
		}));
		const adapter = createChatgptSkillBrowserAdapter({
			userConfig: {} as never,
			getUserIdentity: vi.fn(async () => null),
			connectDevTools: genericConnect,
			connectChatgptPromptWorkbench: promptConnect,
		} as never);

		await (adapter as unknown as { ensureClient(): Promise<unknown> }).ensureClient();
		await adapter.close();

		expect(promptConnect).toHaveBeenCalledOnce();
		expect(genericConnect).not.toHaveBeenCalled();
	});

	it("derives stable duplicate-name inventory without inventing unobserved state", () => {
		const result = deriveChatgptSkillState({
			identity: { email: "owner@example.com", accountPlanType: "pro" },
			inventory: {
				complete: true,
				entries: [
					{ id: "1".repeat(32), name: "Same", collection: "installed", reviewStatus: null },
					{
						id: "2".repeat(32),
						name: "Same",
						collection: "created-by-me",
						reviewStatus: "Needs review",
					},
				],
			},
			observedAt: "2026-09-02T00:00:00.000Z",
		});
		expect(result.inventoryComplete).toBe(true);
		expect(result.skills).toEqual([
			expect.objectContaining({
				id: "1".repeat(32),
				collection: "installed",
				reviewStatus: "unknown",
			}),
			expect.objectContaining({
				id: "2".repeat(32),
				collection: "created-by-me",
				reviewStatus: "needs-review",
			}),
		]);
	});

	it("normalizes complete installed and created payloads with created ownership precedence", () => {
		const shared = {
			id: "2".repeat(32),
			name: "same-name",
			display_name: "Same",
			safety_check_status: "unchecked",
		};
		expect(
			normalizeChatgptSkillInventoryPayloads({
				installed: {
					hazelnuts: [{ id: "1".repeat(32), name: "same-name", display_name: "Same" }, shared],
				},
				created: { hazelnuts: [shared] },
			}),
		).toEqual({
			complete: true,
			entries: [
				{ id: "1".repeat(32), name: "Same", collection: "installed", reviewStatus: null },
				{
					id: "2".repeat(32),
					name: "Same",
					collection: "created-by-me",
					reviewStatus: "Needs review",
				},
			],
		});
		expect(
			normalizeChatgptSkillInventoryPayloads({ installed: { hazelnuts: [] }, created: null }),
		).toEqual({ complete: false, entries: [] });
	});

	it("hashes canonical SKILL.md readback and binds it to the exact detail id", () => {
		expect(joinChatgptCodeMirrorLines(["# Canary", "", "Do one thing.", ""])).toBe(
			"# Canary\n\nDo one thing.\n",
		);
		const detail = deriveChatgptSkillDetail({
			id: "a".repeat(32),
			name: "Canary",
			owner: "Owner",
			description: "Probe",
			filePaths: ["SKILL.md"],
			instructions: "# Canary\r\n\r\nDo one thing.\n\n",
		});
		expect(detail.id).toBe("a".repeat(32));
		expect(detail.contentHash).toBe(hashChatgptSkillInstructions("# Canary\n\nDo one thing.\n"));
		expect(detail.files).toEqual([{ path: "SKILL.md", sha256: detail.contentHash }]);
	});

	it("accepts only observed exact detail and editor routes", () => {
		expect(readChatgptSkillIdFromUrl(`https://chatgpt.com/skills?skill_id=${"b".repeat(32)}`)).toBe(
			"b".repeat(32),
		);
		expect(readChatgptSkillIdFromUrl(`https://chatgpt.com/skills/editor/${"c".repeat(32)}`)).toBe(
			"c".repeat(32),
		);
		expect(readChatgptSkillIdFromUrl("https://chatgpt.com/skills?skill_id=Canary")).toBeNull();
		expect(readChatgptSkillIdFromUrl("https://chatgpt.com/skills/editor/Canary")).toBeNull();
		expect(
			readChatgptSkillIdFromUrl(`https://example.com/skills?skill_id=${"b".repeat(32)}`),
		).toBeNull();
	});

	it("builds an executable editor probe that preserves CodeMirror line breaks", () => {
		const id = "d".repeat(32);
		const editor = {
			querySelectorAll: () => [
				{ textContent: "# Canary" },
				{ textContent: "" },
				{ textContent: "Return ready." },
			],
		};
		const document = {
			querySelector: (selector: string) => {
				if (selector.includes("-name")) return { value: " Canary " };
				if (selector.includes("-description")) return { value: " Probe " };
				if (selector === ".cm-content") return editor;
				return null;
			},
		};
		const evaluate = new Function(
			"document",
			"location",
			`return ${buildChatgptSkillEditorProbeExpression(id)}`,
		);
		expect(evaluate(document, { pathname: `/skills/editor/${id}` })).toEqual({
			id,
			name: "Canary",
			owner: null,
			description: "Probe",
			filePaths: ["SKILL.md"],
			instructions: "# Canary\n\nReturn ready.",
		});
	});

	it("accepts delete only from fresh complete exact-ID inventory absence", () => {
		const id = "e".repeat(32);
		expect(isChatgptSkillAbsentFromInventory({ complete: true, entries: [] }, id)).toBe(true);
		expect(
			isChatgptSkillAbsentFromInventory(
				{ complete: true, entries: [{ id, name: "Canary", collection: "created-by-me" }] },
				id,
			),
		).toBe(false);
		expect(isChatgptSkillAbsentFromInventory({ complete: false, entries: [] }, id)).toBe(false);
	});

	it("binds selection proof to an empty composer and the exact skill identity", () => {
		const id = "f".repeat(32);
		const skillMarker = {
			getAttribute: (name: string) =>
				name === "data-skill-id" ? id : name === "data-skill-name" ? "Canary" : null,
			textContent: "Canary",
			getBoundingClientRect: () => ({ width: 120, height: 24 }),
		};
		const editor = {
			innerText: "",
			textContent: "",
			getBoundingClientRect: () => ({ width: 400, height: 80 }),
			closest: () => composer,
			cloneNode: () => ({
				textContent: "",
				querySelectorAll: () => [],
			}),
		};
		const composer = {
			querySelectorAll: () => [skillMarker],
			getBoundingClientRect: () => ({ width: 500, height: 120 }),
		};
		const document = {
			querySelector: (selector: string) => (selector === "#prompt-textarea" ? editor : null),
			querySelectorAll: () => [skillMarker],
		};
		const evaluate = new Function(
			"document",
			"location",
			"HTMLElement",
			`return ${buildChatgptSkillSelectionProbeExpression({ id, name: "Canary" })}`,
		);
		expect(
			evaluate(
				document,
				{ origin: "https://chatgpt.com", pathname: "/", href: "https://chatgpt.com/" },
				Object,
			),
		).toEqual({
			selected: true,
			skillId: id,
			skillName: "Canary",
			composerEmpty: true,
		});
	});

	it("treats an exact inline Skill pill as an empty user composer", () => {
		const id = "a".repeat(32);
		const content = { textContent: "Canary " };
		const removed = {
			remove: vi.fn(() => {
				content.textContent = " ";
			}),
		};
		const skillMarker = {
			getAttribute: (name: string) =>
				name === "data-id" ? `hazelnut:${id}` : name === "data-keyword" ? "Canary" : null,
			textContent: "Canary",
			getBoundingClientRect: () => ({ width: 120, height: 24 }),
		};
		const composer = { querySelectorAll: () => [skillMarker] };
		const editor = {
			closest: () => composer,
			getBoundingClientRect: () => ({ width: 400, height: 80 }),
			cloneNode: () => ({
				get textContent() {
					return content.textContent;
				},
				querySelectorAll: () => [removed],
			}),
		};
		const document = {
			querySelector: (selector: string) => (selector === "#prompt-textarea" ? editor : null),
		};
		const evaluate = new Function(
			"document",
			"location",
			"HTMLElement",
			`return ${buildChatgptSkillSelectionProbeExpression({ id, name: "Canary" })}`,
		);

		expect(
			evaluate(
				document,
				{ origin: "https://chatgpt.com", href: "https://chatgpt.com/" },
				Object,
			),
		).toMatchObject({ selected: true, skillId: id, skillName: "Canary", composerEmpty: true });
		expect(removed.remove).toHaveBeenCalledOnce();
	});

	it("clears only one exact Skill pill from an otherwise empty composer", () => {
		const id = "b".repeat(32);
		const expression = buildChatgptSkillCleanupExpression({ id, name: "Canary" });
		expect(expression).toContain("pills.length !== 1 || matches.length !== 1");
		expect(expression).toContain("composer-not-exact-single-skill");
		expect(expression).toContain("inputType: 'deleteByCut'");
	});
});
