import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";

const repositoryRoot = path.resolve(import.meta.dirname, "..");

describe("published codex-wake ChatGPT workflow", () => {
	test("binds the documented wake to the exact terminal receipt contract", async () => {
		const recipe = await fs.readFile(
			path.join(repositoryRoot, "docs/codex-wake-chatgpt.md"),
			"utf8",
		);
		expect(recipe).toContain("GET /v1/terminal-receipts/{session_id}");
		expect(recipe).toContain("--state-pointer /status");
		expect(recipe).toContain("--event-id-pointer /eventId");
		expect(recipe).toContain("--completed-at-pointer /completedAt");
		expect(recipe).toContain("--selector /object=auracall_terminal_session_receipt_observation");
		expect(recipe).toContain("--selector /eventKind=auracall.session.terminal");
		for (const status of ["succeeded", "error", "cancelled", "integrity_error"]) {
			expect(recipe).toContain(`--terminal-value ${status}`);
		}
		expect(recipe).toContain('--idempotency-key "$receipt_idempotency_key"');
		expect(recipe).toContain("--max-attempts 1");
		expect(recipe).toContain('--app-server-thread-id "$thread_id"');
		expect(recipe).toContain("--require-monitor");
		expect(recipe).toContain("--profile wsl-chrome-3");
		expect(recipe).toContain("Never resubmit the provider request");
		expect(recipe).toContain("do not point this wake at `/v1/runs/...`");
	});

	test("routes agents from the skill and user README to the maintained recipe", async () => {
		const [skill, readme] = await Promise.all([
			fs.readFile(
				path.join(repositoryRoot, ".agents/skills/auracall-chatgpt-browser/SKILL.md"),
				"utf8",
			),
			fs.readFile(path.join(repositoryRoot, "README.md"), "utf8"),
		]);
		expect(skill).toContain("docs/codex-wake-chatgpt.md");
		expect(skill).toContain("GET /v1/terminal-receipts/{session_id}");
		expect(skill).toContain("`--max-attempts 1`");
		expect(readme).toContain("[docs/codex-wake-chatgpt.md](docs/codex-wake-chatgpt.md)");
	});
});
