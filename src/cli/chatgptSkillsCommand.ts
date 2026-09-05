import { lstat, readFile, stat } from "node:fs/promises";
import path from "node:path";

import { BrowserAutomationClient } from "../browser/client.js";
import {
	type ChatgptSkillBrowserClient,
	createChatgptSkillBrowserAdapter,
	hashChatgptSkillInstructions,
	normalizeInstructions,
} from "../browser/providers/chatgptSkills.js";
import type { ResolvedUserConfig } from "../config.js";

const MAX_CHATGPT_SKILL_SOURCE_BYTES = 1_048_576;

export type ChatgptSkillCollection = "installed" | "created-by-me" | "unknown";
export type ChatgptSkillReviewStatus = "needs-review" | "ready" | "unknown";

export interface ChatgptSkillFile {
	path: string;
	sha256: string | null;
}

export interface ChatgptSkill {
	id: string;
	name: string;
	collection: ChatgptSkillCollection;
	reviewStatus: ChatgptSkillReviewStatus;
	owner: string | null;
	description: string | null;
	files: ChatgptSkillFile[];
	contentHash: string | null;
}

export interface ChatgptSkillState {
	account: { email: string | null; plan: string | null };
	inventoryComplete: boolean;
	skills: ChatgptSkill[];
	observedAt: string;
}

export interface ChatgptSkillSource {
	name: string;
	description: string | null;
	instructions: string;
	contentHash: string;
}

export interface ChatgptSkillMutationOutcome {
	status: "completed" | "awaiting-human" | "outcome-unknown";
	message: string;
	skillId?: string | null;
	currentUrl?: string | null;
}

export interface ChatgptSkillAdapter {
	readState(): Promise<ChatgptSkillState>;
	readSkill(id: string): Promise<ChatgptSkill | null>;
	select(skill: ChatgptSkill): Promise<ChatgptSkillMutationOutcome>;
	create(source: ChatgptSkillSource): Promise<ChatgptSkillMutationOutcome>;
	update(skill: ChatgptSkill, source: ChatgptSkillSource): Promise<ChatgptSkillMutationOutcome>;
	delete(skill: ChatgptSkill): Promise<ChatgptSkillMutationOutcome>;
}

type ChatgptSkillCliAdapter = ChatgptSkillAdapter & { close(): Promise<void> };

export interface ChatgptSkillCliDependencies {
	createBrowser?: (
		userConfig: ResolvedUserConfig,
		options: { target: "chatgpt" },
	) => Promise<ChatgptSkillBrowserClient>;
	createAdapter?: (
		browser: ChatgptSkillBrowserClient,
		options: { abortSignal?: AbortSignal },
	) => ChatgptSkillCliAdapter;
}

export type ChatgptSkillOperationInput =
	| { action: "list"; expectedAccount: string }
	| { action: "show"; expectedAccount: string; skillId: string }
	| { action: "select"; expectedAccount: string; confirmed: boolean; skillId: string }
	| {
			action: "create";
			expectedAccount: string;
			confirmed: boolean;
			source: ChatgptSkillSource;
	  }
	| {
			action: "update";
			expectedAccount: string;
			confirmed: boolean;
			skillId: string;
			expectedHash: string;
			source: ChatgptSkillSource;
	  }
	| {
			action: "delete";
			expectedAccount: string;
			confirmed: boolean;
			skillId: string;
	  };

export type ChatgptSkillOperationResult =
	| { action: "list"; status: "observed"; state: ChatgptSkillState }
	| { action: "show"; status: "observed"; state: ChatgptSkillState; skill: ChatgptSkill }
	| {
			action: "select" | "create" | "update" | "delete";
			status: ChatgptSkillMutationOutcome["status"];
			state: ChatgptSkillState;
			outcome: ChatgptSkillMutationOutcome;
			skill?: ChatgptSkill | null;
	  };

export async function executeChatgptSkillOperation(
	input: ChatgptSkillOperationInput,
	adapter: ChatgptSkillAdapter,
): Promise<ChatgptSkillOperationResult> {
	const state = await adapter.readState();
	assertExpectedAccount(state, input.expectedAccount);
	if (!state.inventoryComplete) {
		throw new Error(`ChatGPT skill ${input.action} requires a complete inventory.`);
	}
	if (input.action === "list") {
		return { action: "list", status: "observed", state };
	}
	if (input.action === "show") {
		const skill = mergeInventorySkill(await readExactSkill(adapter, input.skillId), state);
		return { action: "show", status: "observed", state, skill };
	}
	if (!input.confirmed) {
		throw new Error(`ChatGPT skill ${input.action} requires --yes.`);
	}
	if (input.action === "select") {
		const skillId = assertExactSkillId(input.skillId);
		const matches = state.skills.filter((skill) => skill.id === skillId);
		if (matches.length !== 1) {
			throw new Error(`ChatGPT skill ${skillId} was not found once in the complete inventory.`);
		}
		const skill = matches[0];
		const outcome = await adapter.select(skill);
		return { action: "select", status: outcome.status, state, outcome, skill };
	}
	if (input.action === "create") {
		assertSkillSource(input.source);
		const outcome = await adapter.create(input.source);
		if (outcome.status !== "completed") {
			return { action: "create", status: outcome.status, state, outcome };
		}
		const skillId = assertExactSkillId(outcome.skillId);
		const fresh = await readFreshState(adapter, input.expectedAccount, "create");
		if (fresh.skills.filter((skill) => skill.id === skillId).length !== 1) {
			throw new Error(`ChatGPT skill create did not produce exactly one fresh skill ${skillId}.`);
		}
		const skill = mergeInventorySkill(await readExactSkill(adapter, skillId), fresh);
		assertHash(skill, input.source.contentHash, "create");
		return { action: "create", status: "completed", state: fresh, outcome, skill };
	}
	const skillId = assertExactSkillId(input.skillId);
	const before = await readExactSkill(adapter, skillId);
	if (input.action === "update") {
		assertSkillSource(input.source);
		assertSha256(input.expectedHash, "expected prior content hash");
		if (before.contentHash !== input.expectedHash.toLowerCase()) {
			throw new Error(
				`ChatGPT skill ${skillId} content hash changed; expected ${input.expectedHash}, observed ${before.contentHash ?? "unknown"}.`,
			);
		}
		const outcome = await adapter.update(before, input.source);
		if (outcome.status !== "completed") {
			return { action: "update", status: outcome.status, state, outcome, skill: before };
		}
		const fresh = await readFreshState(adapter, input.expectedAccount, "update");
		const skill = mergeInventorySkill(await readExactSkill(adapter, skillId), fresh);
		assertHash(skill, input.source.contentHash, "update");
		return { action: "update", status: "completed", state: fresh, outcome, skill };
	}
	const outcome = await adapter.delete(before);
	if (outcome.status !== "completed") {
		return { action: "delete", status: outcome.status, state, outcome, skill: before };
	}
	const fresh = await readFreshState(adapter, input.expectedAccount, "delete");
	if (fresh.skills.some((skill) => skill.id === skillId)) {
		throw new Error(`ChatGPT skill ${skillId} is still present after delete.`);
	}
	return { action: "delete", status: "completed", state: fresh, outcome, skill: before };
}

export async function loadChatgptSkillSource(input: {
	sourcePath: string;
	name: string;
	description?: string | null;
}): Promise<ChatgptSkillSource> {
	const sourcePath = path.resolve(input.sourcePath);
	const sourceLinkStat = await lstat(sourcePath);
	if (sourceLinkStat.isSymbolicLink()) {
		throw new Error("ChatGPT skill source must not be a symbolic link.");
	}
	const sourceStat = await stat(sourcePath);
	const skillPath = sourceStat.isDirectory() ? path.join(sourcePath, "SKILL.md") : sourcePath;
	if (!sourceStat.isDirectory() && path.basename(skillPath).toLowerCase() !== "skill.md") {
		throw new Error(
			"ChatGPT skill source must be a SKILL.md file or a directory containing SKILL.md.",
		);
	}
	const skillLinkStat = await lstat(skillPath);
	const skillStat = await stat(skillPath);
	if (!skillStat.isFile() || skillLinkStat.isSymbolicLink()) {
		throw new Error("ChatGPT skill source SKILL.md must be a regular file.");
	}
	if (skillStat.size > MAX_CHATGPT_SKILL_SOURCE_BYTES) {
		throw new Error("ChatGPT skill source SKILL.md exceeds the 1 MiB limit.");
	}
	const instructions = normalizeInstructions(await readFile(skillPath, "utf8"));
	const source = {
		name: input.name.trim(),
		description: input.description?.trim() || null,
		instructions,
		contentHash: hashChatgptSkillInstructions(instructions),
	};
	assertSkillSource(source);
	return source;
}

export async function runChatgptSkillOperationForCli(
	userConfig: ResolvedUserConfig,
	input: ChatgptSkillOperationInput,
	dependencies: ChatgptSkillCliDependencies = {},
): Promise<ChatgptSkillOperationResult> {
	const createBrowser = dependencies.createBrowser ?? BrowserAutomationClient.fromConfig;
	const createAdapter = dependencies.createAdapter ?? createChatgptSkillBrowserAdapter;
	const controller = new AbortController();
	let adapter: ChatgptSkillCliAdapter | null = null;
	try {
		const browser = await createBrowser(userConfig, { target: "chatgpt" });
		adapter = createAdapter(browser, { abortSignal: controller.signal });
		return await executeChatgptSkillOperation(input, adapter);
	} finally {
		controller.abort();
		await adapter?.close().catch(() => undefined);
	}
}

export function formatChatgptSkillOperationResult(result: ChatgptSkillOperationResult): string {
	const header = [
		`ChatGPT skills (${result.state.account.email ?? "unknown"})`,
		`Inventory complete: ${result.state.inventoryComplete ? "yes" : "no"}`,
	];
	if (result.action === "list") {
		return [
			...header,
			`Skills: ${result.state.skills.length}`,
			...result.state.skills.map((skill) =>
				[
					skill.id,
					skill.name,
					skill.collection,
					skill.reviewStatus,
					skill.contentHash ?? "hash unknown",
				].join(" | "),
			),
		].join("\n");
	}
	if (result.action === "show") {
		return [
			...header,
			`Skill: ${result.skill.id}`,
			`Name: ${result.skill.name}`,
			`Collection: ${result.skill.collection}`,
			`Review: ${result.skill.reviewStatus}`,
			`Owner: ${result.skill.owner ?? "unknown"}`,
			`Content SHA-256: ${result.skill.contentHash ?? "unknown"}`,
			`Files: ${result.skill.files.map((file) => file.path).join(", ") || "(none)"}`,
		].join("\n");
	}
	return [
		...header,
		`Action: ${result.action}`,
		`Status: ${result.status}`,
		result.outcome.message,
		...(result.skill?.id ? [`Skill: ${result.skill.id}`] : []),
		...(result.skill?.contentHash ? [`Content SHA-256: ${result.skill.contentHash}`] : []),
	].join("\n");
}

async function readFreshState(
	adapter: ChatgptSkillAdapter,
	expectedAccount: string,
	action: string,
): Promise<ChatgptSkillState> {
	const fresh = await adapter.readState();
	assertExpectedAccount(fresh, expectedAccount);
	if (!fresh.inventoryComplete) {
		throw new Error(`ChatGPT skill ${action} postcondition requires a complete inventory.`);
	}
	return fresh;
}

async function readExactSkill(adapter: ChatgptSkillAdapter, value: string): Promise<ChatgptSkill> {
	const id = assertExactSkillId(value);
	const skill = await adapter.readSkill(id);
	if (!skill || skill.id !== id) {
		throw new Error(`ChatGPT skill ${id} was not found by exact ID.`);
	}
	return skill;
}

function assertExactSkillId(value: string | null | undefined): string {
	const id = String(value ?? "")
		.trim()
		.toLowerCase();
	if (!/^[a-f0-9]{32}$/.test(id)) {
		throw new Error("ChatGPT Skill operations require an exact 32-hex skill ID.");
	}
	return id;
}

function assertSkillSource(source: ChatgptSkillSource): void {
	if (!source.name.trim()) throw new Error("ChatGPT skill source requires a name.");
	if (!source.instructions.trim())
		throw new Error("ChatGPT skill source requires SKILL.md content.");
	assertSha256(source.contentHash, "source content hash");
}

function assertSha256(value: string, label: string): void {
	if (!/^[a-f0-9]{64}$/i.test(value)) {
		throw new Error(`ChatGPT skill ${label} must be a SHA-256 digest.`);
	}
}

function assertHash(skill: ChatgptSkill, expected: string, action: string): void {
	if (skill.contentHash !== expected.toLowerCase()) {
		throw new Error(
			`ChatGPT skill ${action} content hash mismatch; expected ${expected}, observed ${skill.contentHash ?? "unknown"}.`,
		);
	}
}

function mergeInventorySkill(skill: ChatgptSkill, state: ChatgptSkillState): ChatgptSkill {
	const inventory = state.skills.find((candidate) => candidate.id === skill.id);
	return inventory
		? { ...skill, collection: inventory.collection, reviewStatus: inventory.reviewStatus }
		: skill;
}

function assertExpectedAccount(state: ChatgptSkillState, expected: string): void {
	const wanted = expected.trim().toLowerCase();
	const actual = state.account.email?.trim().toLowerCase() ?? "";
	if (!wanted || actual !== wanted) {
		throw new Error(
			`Expected ChatGPT account ${expected || "(missing)"}, but the managed browser is ${state.account.email ?? "unknown"}.`,
		);
	}
}
