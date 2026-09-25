import { describe, expect, test } from "vitest";
import {
	buildAttachmentReadyExpressionForTest,
	buildPromptFocusExpressionForTest,
} from "../../src/browser/actions/promptComposer.ts";
import {
	ASSISTANT_ROLE_SELECTOR,
	CONVERSATION_TURN_SELECTOR,
} from "../../src/browser/constants.ts";

describe("prompt composer attachment expressions", () => {
	test("attachment ready check does not match prompt text", () => {
		const expression = buildAttachmentReadyExpressionForTest(["oracle-attach-verify.txt"]);
		expect(expression).toContain("document.querySelector('[data-testid*=\"composer\"]')");
		expect(expression).toContain("composer.querySelectorAll");
		expect(expression).toContain('input[type="file"]');
		expect(expression).not.toContain("a,div,span");
		expect(expression).not.toContain(
			'document.querySelectorAll(\'[data-testid*="chip"],[data-testid*="attachment"],a,div,span\')',
		);
	});
});

describe("prompt composer focus expression", () => {
	test("binds insertion to one visible composer-owned target", () => {
		const expression = buildPromptFocusExpressionForTest();

		expect(expression).toContain("document.querySelectorAll(selector)");
		expect(expression).toContain("getBoundingClientRect");
		expect(expression).toContain("style.visibility !== 'hidden'");
		expect(expression).toContain(
			"node.closest('[data-testid*=\"composer\"], [data-chatgpt-composer], form')",
		);
		expect(expression).toContain(
			"composer.matches('[data-testid*=\"composer\"], [data-chatgpt-composer]')",
		);
		expect(expression).toContain("data-auracall-prompt-target");
		expect(expression).not.toContain("const node = document.querySelector(selector)");
	});

	test("recognizes the current ChatGPT turn and role-bearing search units", () => {
		expect(CONVERSATION_TURN_SELECTOR).toContain("[data-content-search-unit-key]");
		expect(ASSISTANT_ROLE_SELECTOR).toContain('[data-content-search-unit-key$=":assistant"]');
		expect(ASSISTANT_ROLE_SELECTOR).toContain('[data-chatgpt-search-unit-key$=":assistant"]');
	});
});
