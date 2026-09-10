import { BrowserAutomationClient } from "../browser/client.js";
import {
	type ChatgptDeveloperAppBrowserClient,
	type ChatgptDeveloperAppBrowserClientFactory,
	createChatgptDeveloperAppBrowserAdapter,
} from "../browser/providers/chatgptDeveloperApps.js";
import type { ResolvedUserConfig } from "../config.js";

const DEFAULT_CHATGPT_DEVELOPER_APP_LIST_TIMEOUT_MS = 45_000;
const DEFAULT_CHATGPT_DEVELOPER_APP_OPERATION_TIMEOUT_MS = 300_000;
const DEFAULT_CHATGPT_DEVELOPER_APP_CLOSE_TIMEOUT_MS = 5_000;

export type ChatgptDeveloperAppOperationPhase =
	| "browser_initialization"
	| "initial_inventory"
	| "developer_mode_confirmation"
	| "validation"
	| "create"
	| "delete"
	| "post_delete_inventory"
	| "recreate"
	| "post_create_inventory"
	| "select_for_test"
	| "submit_test"
	| "uninstall";

export class ChatgptDeveloperAppOperationTimeoutError extends Error {
	readonly code = "chatgpt_developer_app_operation_timeout";

	constructor(
		readonly action: Exclude<ChatgptDeveloperAppOperationInput["action"], "list">,
		readonly phase: ChatgptDeveloperAppOperationPhase,
		readonly timeoutMs: number,
		readonly effectState: "pre_effect" | "unknown",
	) {
		const effectGuidance =
			effectState === "unknown"
				? "provider effect may be unknown. Reconcile exact app inventory before retrying."
				: "no provider mutation phase started.";
		super(
			`ChatGPT developer-app ${action} timed out during ${phase.replaceAll("_", " ")} after ${timeoutMs}ms; ${effectGuidance}`,
		);
		this.name = "ChatgptDeveloperAppOperationTimeoutError";
	}
}

export function formatChatgptDeveloperAppOperationTimeoutError(
	error: ChatgptDeveloperAppOperationTimeoutError,
): {
	action: ChatgptDeveloperAppOperationTimeoutError["action"];
	status: "timed-out";
	error: {
		code: ChatgptDeveloperAppOperationTimeoutError["code"];
		message: string;
		phase: ChatgptDeveloperAppOperationPhase;
		timeoutMs: number;
		effectState: ChatgptDeveloperAppOperationTimeoutError["effectState"];
		retrySafe: boolean;
	};
} {
	return {
		action: error.action,
		status: "timed-out",
		error: {
			code: error.code,
			message: error.message,
			phase: error.phase,
			timeoutMs: error.timeoutMs,
			effectState: error.effectState,
			retrySafe: error.effectState === "pre_effect",
		},
	};
}

export interface ChatgptDeveloperAppAccount {
	email: string | null;
	plan: string | null;
}

export interface ChatgptDeveloperApp {
	pluginId: string;
	appIds: string[];
	name: string;
	status?: string | null;
	enabled?: boolean | null;
	authStatus?: string | null;
	reviewStatus?: string | null;
	endpoint?: string | null;
	authorization?: string | null;
	versionId?: string | null;
	scope?: string | null;
	discoverability?: string | null;
	creatorName?: string | null;
	description?: string | null;
}

export interface ChatgptDeveloperAppState {
	account: ChatgptDeveloperAppAccount;
	developerMode: boolean;
	inventoryComplete: boolean;
	apps: ChatgptDeveloperApp[];
	observedAt: string;
}

export interface ChatgptDeveloperAppAdapter {
	readState(): Promise<ChatgptDeveloperAppState>;
	create(input: ChatgptDeveloperAppCreateInput): Promise<ChatgptDeveloperAppMutationOutcome>;
	delete(app: ChatgptDeveloperApp): Promise<ChatgptDeveloperAppMutationOutcome>;
	selectForTest(app: ChatgptDeveloperApp): Promise<ChatgptDeveloperAppMutationOutcome>;
	submitTest(app: ChatgptDeveloperApp, prompt: string): Promise<ChatgptDeveloperAppMutationOutcome>;
	uninstall(app: ChatgptDeveloperApp): Promise<ChatgptDeveloperAppMutationOutcome>;
}

type ChatgptDeveloperAppCliAdapter = ChatgptDeveloperAppAdapter & {
	close(): Promise<void>;
};

export interface ChatgptDeveloperAppCliDependencies {
	listTimeoutMs?: number;
	operationTimeoutMs?: number;
	closeTimeoutMs?: number;
	createBrowser?: (
		userConfig: ResolvedUserConfig,
		options: { target: "chatgpt" },
	) => Promise<ChatgptDeveloperAppBrowserClient>;
	createAdapter?: (
		browser: ChatgptDeveloperAppBrowserClient,
		createBrowser: ChatgptDeveloperAppBrowserClientFactory,
		options: { abortSignal?: AbortSignal },
	) => ChatgptDeveloperAppCliAdapter;
	onPhase?: (phase: ChatgptDeveloperAppOperationPhase) => void;
}

export type ChatgptDeveloperAppAuth = "oauth" | "none" | "mixed";

export interface ChatgptDeveloperAppCreateInput {
	name: string;
	serverUrl: string;
	description?: string | null;
	auth: ChatgptDeveloperAppAuth;
	connection: "server-url" | "tunnel";
}

export interface ChatgptDeveloperAppMutationOutcome {
	status: "completed" | "awaiting-human" | "recreate-pending";
	message: string;
	currentUrl?: string | null;
	app?: ChatgptDeveloperApp | null;
	recovery?: {
		action: "create";
		input: ChatgptDeveloperAppCreateInput;
		reason: string;
	};
}

export type ChatgptDeveloperAppOperationInput =
	| { action: "list" }
	| ({
			action: "create";
			confirmed: boolean;
			expectedAccount: string;
	  } & ChatgptDeveloperAppCreateInput)
	| {
			action: "refresh";
			app: string;
			serverUrl: string;
			description?: string | null;
			auth: ChatgptDeveloperAppAuth;
			connection: "server-url" | "tunnel";
			confirmed: boolean;
			expectedAccount: string;
	  }
	| {
			action: "test";
			app: string;
			submit: boolean;
			prompt?: string | null;
			confirmed: boolean;
			expectedAccount: string;
	  }
	| {
			action: "uninstall";
			app: string;
			confirmed: boolean;
			expectedAccount: string;
	  };

export type ChatgptDeveloperAppOperationResult =
	| {
			action: "list";
			status: "observed";
			state: ChatgptDeveloperAppState;
	  }
	| {
			action: Exclude<ChatgptDeveloperAppOperationInput["action"], "list">;
			status: ChatgptDeveloperAppMutationOutcome["status"];
			state: ChatgptDeveloperAppState;
			outcome: ChatgptDeveloperAppMutationOutcome;
	  };

export async function executeChatgptDeveloperAppOperation(
	input: ChatgptDeveloperAppOperationInput,
	adapter: ChatgptDeveloperAppAdapter,
	options: { onPhase?: (phase: ChatgptDeveloperAppOperationPhase) => void } = {},
): Promise<ChatgptDeveloperAppOperationResult> {
	const enterPhase = (phase: ChatgptDeveloperAppOperationPhase) => options.onPhase?.(phase);
	enterPhase("initial_inventory");
	let state = await adapter.readState();
	if (input.action === "list") {
		return {
			action: "list",
			status: "observed",
			state,
		};
	}
	const requiresConfirmation = input.action !== "test" || input.submit;
	if (requiresConfirmation && !input.confirmed) {
		throw new Error(`ChatGPT developer-app ${input.action} requires --yes.`);
	}
	if ((input.action === "create" || input.action === "refresh") && !state.developerMode) {
		// Settings navigation can briefly expose a stale switch value. Confirm
		// once through the same complete account/inventory read before either
		// rejecting or opening a provider mutation surface.
		enterPhase("developer_mode_confirmation");
		state = await adapter.readState();
	}
	enterPhase("validation");
	const expectedAccount = normalizeAccount(input.expectedAccount);
	const actualAccount = normalizeAccount(state.account.email);
	if (!actualAccount || actualAccount !== expectedAccount) {
		throw new Error(
			`Expected ChatGPT account ${input.expectedAccount}, but the managed browser is ${state.account.email ?? "unknown"}.`,
		);
	}
	if (!state.inventoryComplete) {
		throw new Error(
			`ChatGPT developer-app ${input.action} requires a complete installed-app inventory; the provider inventory response was incomplete.`,
		);
	}
	if (input.action === "create") {
		if (!state.developerMode) {
			throw new Error("ChatGPT Developer mode must be enabled before creating an app.");
		}
		const createInput = normalizeCreateInput(input);
		assertNoExistingAppName(state.apps, createInput.name);
		enterPhase("create");
		const outcome = await adapter.create(createInput);
		return {
			action: "create",
			status: outcome.status,
			state,
			outcome,
		};
	}
	if (input.action === "refresh") {
		if (!state.developerMode) {
			throw new Error("ChatGPT Developer mode must be enabled before replacing an app.");
		}
		const app = resolveExactApp(state.apps, input.app);
		assertUniqueReplacementName(state.apps, app);
		const replacementInput = normalizeDeveloperAppCreateInput({
			name: app.name,
			serverUrl: input.serverUrl,
			description: input.description ?? app.description ?? null,
			auth: input.auth,
			connection: input.connection,
		});
		enterPhase("delete");
		const deleteOutcome = await adapter.delete(app);
		if (deleteOutcome.status === "awaiting-human") {
			return {
				action: "refresh",
				status: deleteOutcome.status,
				state,
				outcome: deleteOutcome,
			};
		}
		let postDeleteState: ChatgptDeveloperAppState;
		try {
			enterPhase("post_delete_inventory");
			postDeleteState = await adapter.readState();
		} catch (error) {
			const outcome = buildRecreatePendingOutcome(
				app,
				replacementInput,
				`post-delete inventory failed: ${readErrorMessage(error)}`,
			);
			return { action: "refresh", status: outcome.status, state, outcome };
		}
		if (!postDeleteState.inventoryComplete) {
			const outcome = buildRecreatePendingOutcome(
				app,
				replacementInput,
				"post-delete installed-app inventory was incomplete, so absence was not proven",
			);
			return { action: "refresh", status: outcome.status, state, outcome };
		}
		if (replacementTargetRemains(postDeleteState.apps, app)) {
			throw new Error(
				`ChatGPT developer app ${app.name} is still present after delete; refusing to create a duplicate.`,
			);
		}
		let createOutcome: ChatgptDeveloperAppMutationOutcome;
		try {
			enterPhase("recreate");
			createOutcome = await adapter.create(replacementInput);
		} catch (error) {
			const outcome = buildRecreatePendingOutcome(app, replacementInput, readErrorMessage(error));
			return { action: "refresh", status: outcome.status, state, outcome };
		}
		let replacementApp: ChatgptDeveloperApp | null = null;
		try {
			enterPhase("post_create_inventory");
			const postCreateState = await adapter.readState();
			if (postCreateState.inventoryComplete) {
				const candidates = postCreateState.apps.filter(
					(candidate) =>
						normalizeAccount(candidate.name) === normalizeAccount(app.name) &&
						!appIdentityOverlaps(candidate, app),
				);
				if (candidates.length === 1) replacementApp = candidates[0];
			}
		} catch {
			// Creation was submitted already; later read-only inventory must verify its identity.
		}
		const outcome: ChatgptDeveloperAppMutationOutcome = {
			...createOutcome,
			message: `${app.name} old app deleted. ${createOutcome.message}`,
			app: replacementApp ?? createOutcome.app ?? null,
		};
		return {
			action: "refresh",
			status: outcome.status,
			state,
			outcome,
		};
	}
	if (input.action === "uninstall") {
		const app = resolveExactApp(state.apps, input.app);
		enterPhase("uninstall");
		const outcome = await adapter.uninstall(app);
		return {
			action: "uninstall",
			status: outcome.status,
			state,
			outcome,
		};
	}
	if (input.action === "test") {
		const app = resolveExactApp(state.apps, input.app);
		enterPhase(input.submit ? "submit_test" : "select_for_test");
		const outcome = input.submit
			? await adapter.submitTest(app, normalizeTestPrompt(input.prompt))
			: await adapter.selectForTest(app);
		return {
			action: "test",
			status: outcome.status,
			state,
			outcome,
		};
	}
	throw new Error("Unsupported ChatGPT developer-app action.");
}

export async function runChatgptDeveloperAppOperationForCli(
	userConfig: ResolvedUserConfig,
	input: ChatgptDeveloperAppOperationInput,
	dependencies: ChatgptDeveloperAppCliDependencies = {},
): Promise<ChatgptDeveloperAppOperationResult> {
	const createBrowser = dependencies.createBrowser ?? BrowserAutomationClient.fromConfig;
	const createAdapter = dependencies.createAdapter ?? createChatgptDeveloperAppBrowserAdapter;
	const abortController = new AbortController();
	const active: { adapter: ChatgptDeveloperAppCliAdapter | null } = { adapter: null };
	let activePhase: ChatgptDeveloperAppOperationPhase = "browser_initialization";
	const onPhase = (phase: ChatgptDeveloperAppOperationPhase) => {
		activePhase = phase;
		dependencies.onPhase?.(phase);
		if (process.env.AURACALL_DEBUG_DEVELOPER_APPS === "1") {
			process.stderr.write(`[developer-apps] operation phase: ${phase}\n`);
		}
	};
	const operation = async () => {
		onPhase("browser_initialization");
		const browser = await createBrowser(userConfig, { target: "chatgpt" });
		abortController.signal.throwIfAborted();
		active.adapter = createAdapter(
			browser,
			(config) => createBrowser(config, { target: "chatgpt" }),
			{ abortSignal: abortController.signal },
		);
		abortController.signal.throwIfAborted();
		return executeChatgptDeveloperAppOperation(input, active.adapter, { onPhase });
	};
	try {
		const timeoutMs =
			input.action === "list"
				? normalizePositiveTimeout(
						dependencies.listTimeoutMs,
						DEFAULT_CHATGPT_DEVELOPER_APP_LIST_TIMEOUT_MS,
					)
				: normalizePositiveTimeout(
						dependencies.operationTimeoutMs,
						DEFAULT_CHATGPT_DEVELOPER_APP_OPERATION_TIMEOUT_MS,
					);
		return await withChatgptDeveloperAppDeadline(
			operation(),
			timeoutMs,
			input.action === "list"
				? `ChatGPT developer-app list timed out after ${timeoutMs}ms.`
				: () =>
						new ChatgptDeveloperAppOperationTimeoutError(
							input.action,
							activePhase,
							timeoutMs,
							chatgptDeveloperAppPhaseMayHaveEffect(input.action, activePhase)
								? "unknown"
								: "pre_effect",
						),
			(error) => abortController.abort(error),
		);
	} finally {
		abortController.abort();
		if (active.adapter) {
			const closeTimeoutMs = normalizePositiveTimeout(
				dependencies.closeTimeoutMs,
				DEFAULT_CHATGPT_DEVELOPER_APP_CLOSE_TIMEOUT_MS,
			);
			await withChatgptDeveloperAppDeadline(
				active.adapter.close(),
				closeTimeoutMs,
				`ChatGPT developer-app browser client close timed out after ${closeTimeoutMs}ms.`,
			).catch(() => undefined);
		}
	}
}

function normalizePositiveTimeout(value: number | undefined, fallback: number): number {
	return Number.isFinite(value) && Number(value) > 0 ? Math.floor(Number(value)) : fallback;
}

async function withChatgptDeveloperAppDeadline<T>(
	operation: Promise<T>,
	timeoutMs: number,
	timeoutError: string | (() => Error),
	onTimeout?: (error: Error) => void,
): Promise<T> {
	let timeout: ReturnType<typeof setTimeout> | null = null;
	try {
		return await Promise.race([
			operation,
			new Promise<never>((_resolve, reject) => {
				timeout = setTimeout(() => {
					const error =
						typeof timeoutError === "function" ? timeoutError() : new Error(timeoutError);
					try {
						onTimeout?.(error);
					} finally {
						reject(error);
					}
				}, timeoutMs);
			}),
		]);
	} finally {
		if (timeout) clearTimeout(timeout);
	}
}

function chatgptDeveloperAppPhaseMayHaveEffect(
	action: Exclude<ChatgptDeveloperAppOperationInput["action"], "list">,
	phase: ChatgptDeveloperAppOperationPhase,
): boolean {
	if (action === "create") return phase === "create";
	if (action === "refresh") {
		return ["delete", "post_delete_inventory", "recreate", "post_create_inventory"].includes(phase);
	}
	if (action === "uninstall") return phase === "uninstall";
	return phase === "submit_test";
}

export function formatChatgptDeveloperAppOperationResult(
	result: ChatgptDeveloperAppOperationResult,
): string {
	const account = result.state.account.email ?? "unknown";
	const header = [
		`ChatGPT developer apps (${account})`,
		`Developer mode: ${result.state.developerMode ? "enabled" : "disabled"}`,
		`Inventory complete: ${result.state.inventoryComplete ? "yes" : "no"}`,
	];
	if (result.action !== "list") {
		return [
			...header,
			`Action: ${result.action}`,
			`Status: ${result.status}`,
			result.outcome.message,
			...(result.outcome.currentUrl ? [`Current URL: ${result.outcome.currentUrl}`] : []),
		].join("\n");
	}
	const rows = result.state.apps.map((app) =>
		[
			app.name,
			app.pluginId,
			app.reviewStatus ?? app.discoverability ?? "installed",
			app.authStatus ?? "auth unknown",
			app.status ?? "status unknown",
		].join(" | "),
	);
	return [
		...header,
		`Installed apps: ${result.state.apps.length}`,
		...(rows.length > 0 ? rows : ["(none)"]),
	].join("\n");
}

function normalizeAccount(value: string | null | undefined): string {
	return String(value ?? "")
		.trim()
		.toLowerCase();
}

function resolveExactApp(
	apps: readonly ChatgptDeveloperApp[],
	reference: string,
): ChatgptDeveloperApp {
	const normalized = normalizeAccount(reference);
	const matches = apps.filter((app) =>
		[app.pluginId, app.name, ...app.appIds].some(
			(candidate) => normalizeAccount(candidate) === normalized,
		),
	);
	if (matches.length === 0) {
		throw new Error(`ChatGPT developer app "${reference}" is not installed.`);
	}
	if (matches.length > 1) {
		throw new Error(
			`ChatGPT developer app "${reference}" is ambiguous; use an exact plugin id or app id.`,
		);
	}
	return matches[0];
}

function normalizeCreateInput(
	input: Extract<ChatgptDeveloperAppOperationInput, { action: "create" }>,
): ChatgptDeveloperAppCreateInput {
	return normalizeDeveloperAppCreateInput(input);
}

function normalizeDeveloperAppCreateInput(
	input: ChatgptDeveloperAppCreateInput,
): ChatgptDeveloperAppCreateInput {
	const name = input.name.trim();
	if (!name) {
		throw new Error("ChatGPT developer-app create requires --name.");
	}
	let serverUrl: URL;
	try {
		serverUrl = new URL(input.serverUrl);
	} catch {
		throw new Error("ChatGPT developer-app create requires a valid --server-url.");
	}
	if (serverUrl.protocol !== "https:" && serverUrl.hostname !== "localhost") {
		throw new Error("ChatGPT developer-app server URL must use HTTPS unless it is localhost.");
	}
	if (input.auth !== "oauth" && input.auth !== "none" && input.auth !== "mixed") {
		throw new Error("ChatGPT developer-app auth must be oauth, none, or mixed.");
	}
	if (input.connection !== "server-url" && input.connection !== "tunnel") {
		throw new Error("ChatGPT developer-app connection must be server-url or tunnel.");
	}
	return {
		name,
		serverUrl: serverUrl.href,
		description: input.description?.trim() || null,
		auth: input.auth,
		connection: input.connection,
	};
}

function replacementTargetRemains(
	apps: readonly ChatgptDeveloperApp[],
	target: ChatgptDeveloperApp,
): boolean {
	const targetIds = new Set(
		[target.pluginId, ...target.appIds].map(normalizeAccount).filter(Boolean),
	);
	const targetName = normalizeAccount(target.name);
	return apps.some((app) => {
		if (normalizeAccount(app.name) === targetName) return true;
		return [app.pluginId, ...app.appIds]
			.map(normalizeAccount)
			.some((candidate) => targetIds.has(candidate));
	});
}

function assertUniqueReplacementName(
	apps: readonly ChatgptDeveloperApp[],
	target: ChatgptDeveloperApp,
): void {
	const sameName = apps.filter(
		(app) => normalizeAccount(app.name) === normalizeAccount(target.name),
	);
	if (sameName.length !== 1 || sameName[0].pluginId !== target.pluginId) {
		throw new Error(
			`ChatGPT developer app ${target.name} cannot be replaced because more than one installed app has the same normalized name.`,
		);
	}
}

function assertNoExistingAppName(apps: readonly ChatgptDeveloperApp[], name: string): void {
	const existing = apps.find((app) => normalizeAccount(app.name) === normalizeAccount(name));
	if (existing) {
		throw new Error(
			`ChatGPT already has one installed app named ${existing.name}; refusing to create a duplicate.`,
		);
	}
}

function appIdentityOverlaps(left: ChatgptDeveloperApp, right: ChatgptDeveloperApp): boolean {
	const rightIds = new Set([right.pluginId, ...right.appIds].map(normalizeAccount).filter(Boolean));
	return [left.pluginId, ...left.appIds]
		.map(normalizeAccount)
		.some((candidate) => rightIds.has(candidate));
}

function buildRecreatePendingOutcome(
	app: ChatgptDeveloperApp,
	input: ChatgptDeveloperAppCreateInput,
	reason: string,
): ChatgptDeveloperAppMutationOutcome {
	return {
		status: "recreate-pending",
		message: `${app.name} was deleted, but recreation is pending: ${reason}. Verify the old app remains absent, then resume with guarded apps create using the returned input.`,
		app,
		recovery: {
			action: "create",
			input,
			reason,
		},
	};
}

function readErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function normalizeTestPrompt(value: string | null | undefined): string {
	const prompt = String(value ?? "").trim();
	if (!prompt) {
		throw new Error("ChatGPT developer-app submitted test requires --prompt.");
	}
	return prompt;
}
