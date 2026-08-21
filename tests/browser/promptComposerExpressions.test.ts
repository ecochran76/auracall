import { describe, expect, test } from "vitest";
import {
	buildAttachmentReadyExpressionForTest,
	buildPromptFocusExpressionForTest,
} from "../../src/browser/actions/promptComposer.ts";

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
		expect(expression).toContain("node.closest('[data-testid*=\"composer\"], form')");
		expect(expression).toContain("data-auracall-prompt-target");
		expect(expression).not.toContain("const node = document.querySelector(selector)");
	});
});
