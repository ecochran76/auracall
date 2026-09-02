import { describe, expect, it } from "vitest";

import {
	buildChatgptSkillEditorProbeExpression,
	deriveChatgptSkillDetail,
	deriveChatgptSkillState,
	hashChatgptSkillInstructions,
	joinChatgptCodeMirrorLines,
	normalizeChatgptSkillInventoryPayloads,
	readChatgptSkillIdFromUrl,
} from "../../src/browser/providers/chatgptSkills.js";

describe("ChatGPT Skill provider contracts", () => {
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
			expect.objectContaining({ id: "1".repeat(32), collection: "installed", reviewStatus: "unknown" }),
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
					hazelnuts: [
						{ id: "1".repeat(32), name: "same-name", display_name: "Same" },
						shared,
					],
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
		expect(readChatgptSkillIdFromUrl(`https://example.com/skills?skill_id=${"b".repeat(32)}`)).toBeNull();
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
});
