import { describe, expect, it } from "vitest";

import {
	deriveChatgptSkillDetail,
	deriveChatgptSkillState,
	hashChatgptSkillInstructions,
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

	it("hashes canonical SKILL.md readback and binds it to the exact detail id", () => {
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

	it("accepts only the observed exact 32-hex skill_id route", () => {
		expect(readChatgptSkillIdFromUrl(`https://chatgpt.com/skills?skill_id=${"b".repeat(32)}`)).toBe(
			"b".repeat(32),
		);
		expect(readChatgptSkillIdFromUrl("https://chatgpt.com/skills?skill_id=Canary")).toBeNull();
		expect(readChatgptSkillIdFromUrl(`https://example.com/skills?skill_id=${"b".repeat(32)}`)).toBeNull();
	});
});
