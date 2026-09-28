import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getAuracallHomeDir } from "./auracallHome.js";
import type { ResolvedUserConfig } from "./config.js";
import type {
	SessionMetadata,
	SessionStore,
	SessionTerminalReceiptIntentMetadata,
	SessionTerminalReceiptResultMetadata,
} from "./sessionStore.js";
import { sessionStore } from "./sessionStore.js";

export const TERMINAL_SESSION_RECEIPT_SCHEMA_VERSION = 1 as const;
export const TERMINAL_SESSION_RECEIPT_EVENT_KIND = "auracall.session.terminal" as const;

const PRIVATE_DIRECTORY_MODE = 0o700;
const PRIVATE_MUTABLE_FILE_MODE = 0o600;
const PRIVATE_IMMUTABLE_FILE_MODE = 0o400;
const MAX_RECONCILIATION_SESSIONS = 1000;
const RECEIPTS_DIRECTORY = path.join("receipts", "v1");
const RESULTS_DIRECTORY = path.join("results", "v1");
const STATE_FILE = path.join("state", "terminal-session-receipts-v1.json");
const SAFE_ERROR_CATEGORIES = new Set([
	"browser-automation",
	"browser-observation-expired",
	"browser-terminal-response",
	"file-validation",
	"prompt-validation",
]);
const SAFE_TRANSPORT_CODES = new Set([
	"api-error",
	"client-abort",
	"client-timeout",
	"connection-lost",
	"model-unavailable",
	"unknown",
	"unsupported-endpoint",
]);

type TerminalReceiptConfig = NonNullable<ResolvedUserConfig["terminalSessionReceipts"]>;
type TerminalState = SessionTerminalReceiptIntentMetadata["terminalState"];
type OperationStatus = "disabled" | "succeeded" | "deduplicated" | "failed";

export interface TerminalSessionReceipt {
	schemaVersion: 1;
	eventKind: typeof TERMINAL_SESSION_RECEIPT_EVENT_KIND;
	eventId: string;
	idempotencyKey: string;
	sessionRef: string;
	terminalState: TerminalState;
	terminalAt: string;
	persistedAt: string;
	publishedAt: string;
	execution: {
		mode: "api" | "browser" | "unknown";
		provider: "openai" | "anthropic" | "google" | "xai" | "other" | null;
		modelClass: "openai" | "anthropic" | "google" | "xai" | "other" | null;
	};
	result: {
		locator: string;
		digest: string;
		bytes: number;
	} | null;
	error: {
		category: string;
		code: string;
	} | null;
}

export interface TerminalReceiptFailure {
	code: string;
	at: string;
	eventId?: string | null;
	sessionRef?: string | null;
}

export interface TerminalReceiptOperationResult<T> {
	status: OperationStatus;
	value?: T;
	failure?: TerminalReceiptFailure;
}

export interface TerminalReceiptPreparation {
	intent: SessionTerminalReceiptIntentMetadata;
}

export interface TerminalReceiptReconciliationSummary {
	scanned: number;
	emitted: number;
	deduplicated: number;
	skipped: number;
	failed: number;
	completedAt: string;
}

interface TerminalReceiptLedger {
	schemaVersion: 1;
	lastSuccessfulEmission?: {
		eventId: string;
		sessionRef: string;
		publishedAt: string;
		disposition: "emitted" | "deduplicated";
	} | null;
	lastFailure?: TerminalReceiptFailure | null;
	reconciliation?: TerminalReceiptReconciliationSummary | null;
}

export interface TerminalReceiptStatus {
	object: "auracall_terminal_session_receipt_status";
	schemaVersion: 1;
	enabled: boolean;
	configuredRoot: {
		kind: "auracall-home-managed" | "custom" | "not-configured";
		display: string | null;
		fingerprint: string | null;
	};
	rootState: "disabled" | "ready" | "ready-to-create" | "invalid";
	rootFailureCode: string | null;
	lastSuccessfulEmission: TerminalReceiptLedger["lastSuccessfulEmission"];
	lastFailure: TerminalReceiptLedger["lastFailure"];
	reconciliation: TerminalReceiptLedger["reconciliation"];
}

export interface TerminalReceiptVerification {
	object: "auracall_terminal_session_receipt_verification";
	schemaVersion: 1;
	sessionRef: string;
	eventId: string;
	receiptLocator: string;
	terminalState: TerminalState;
	result: {
		locator: string;
		digest: string;
		bytes: number;
		verified: boolean;
	} | null;
	verified: boolean;
}

interface ReceiptDependencies {
	store?: SessionStore;
	now?: () => Date;
	excludeSessionId?: string | null;
}

class TerminalReceiptInvariantError extends Error {
	readonly code: string;

	constructor(code: string) {
		super(code);
		this.name = "TerminalReceiptInvariantError";
		this.code = code;
	}
}

export function terminalSessionReceiptsEnabled(config: ResolvedUserConfig | undefined): boolean {
	return config?.terminalSessionReceipts?.enabled === true;
}

export async function prepareTerminalSessionReceipt(input: {
	config: ResolvedUserConfig | undefined;
	session: SessionMetadata;
	terminalState: TerminalState;
	resultText?: string | null;
	now?: () => Date;
}): Promise<TerminalReceiptOperationResult<TerminalReceiptPreparation>> {
	const now = input.now ?? (() => new Date());
	const config = input.config?.terminalSessionReceipts;
	if (!config?.enabled) return { status: "disabled" };

	const identity = createEventIdentity(input.session.id);
	try {
		const root = await resolveRequiredRoot(config);
		let result: SessionTerminalReceiptResultMetadata | null = null;
		if (input.resultText != null) {
			const payload = Buffer.from(input.resultText, "utf8");
			const locator = path.posix.join(RESULTS_DIRECTORY, `${identity.eventId}.txt`);
			const targetPath = resolveContainedPath(root, locator);
			const immutable = await writeImmutableFile(targetPath, payload);
			result = {
				locator,
				digest: immutable.digest,
				bytes: immutable.bytes,
			};
		}

		if (input.terminalState === "succeeded" && !result) {
			throw new TerminalReceiptInvariantError("successful_result_missing");
		}

		return {
			status: "succeeded",
			value: {
				intent: {
					schemaVersion: TERMINAL_SESSION_RECEIPT_SCHEMA_VERSION,
					eventKind: TERMINAL_SESSION_RECEIPT_EVENT_KIND,
					...identity,
					terminalState: input.terminalState,
					persistedAt: now().toISOString(),
					result,
				},
			},
		};
	} catch (error) {
		const failure = failureFromError(error, now, identity);
		await recordFailureBestEffort(config, failure);
		return { status: "failed", failure };
	}
}

export async function publishTerminalSessionReceipt(input: {
	config: ResolvedUserConfig | undefined;
	session: SessionMetadata;
	now?: () => Date;
}): Promise<TerminalReceiptOperationResult<TerminalSessionReceipt>> {
	const now = input.now ?? (() => new Date());
	const config = input.config?.terminalSessionReceipts;
	if (!config?.enabled) return { status: "disabled" };

	const identity = createEventIdentity(input.session.id);
	try {
		const root = await resolveRequiredRoot(config);
		const locator = receiptLocator(identity.eventId);
		const targetPath = resolveContainedPath(root, locator);
		const existing = await readExistingReceipt(targetPath);
		if (existing) {
			assertReceiptMatchesSession(existing, input.session, identity);
			if (existing.result) await verifyStoredResult(root, existing.result);
			await updateLedger(root, (ledger) => ({
				...ledger,
				lastSuccessfulEmission: {
					eventId: existing.eventId,
					sessionRef: existing.sessionRef,
					publishedAt: existing.publishedAt,
					disposition: "deduplicated",
				},
				lastFailure: null,
			}));
			return { status: "deduplicated", value: existing };
		}
		const receipt = await buildReceipt(input.session, now, root);
		const payload = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, "utf8");
		let immutable: Awaited<ReturnType<typeof writeImmutableFile>>;
		try {
			immutable = await writeImmutableFile(targetPath, payload);
		} catch (error) {
			if (
				!(error instanceof TerminalReceiptInvariantError) ||
				error.code !== "immutable_content_mismatch"
			) {
				throw error;
			}
			const raced = await readExistingReceipt(targetPath);
			if (!raced) throw error;
			assertReceiptMatchesSession(raced, input.session, identity);
			if (raced.result) await verifyStoredResult(root, raced.result);
			await updateLedger(root, (ledger) => ({
				...ledger,
				lastSuccessfulEmission: {
					eventId: raced.eventId,
					sessionRef: raced.sessionRef,
					publishedAt: raced.publishedAt,
					disposition: "deduplicated",
				},
				lastFailure: null,
			}));
			return { status: "deduplicated", value: raced };
		}
		const disposition = immutable.created ? "emitted" : "deduplicated";
		await updateLedger(root, (ledger) => ({
			...ledger,
			lastSuccessfulEmission: {
				eventId: receipt.eventId,
				sessionRef: receipt.sessionRef,
				publishedAt: receipt.publishedAt,
				disposition,
			},
			lastFailure: null,
		}));
		return { status: immutable.created ? "succeeded" : "deduplicated", value: receipt };
	} catch (error) {
		const failure = failureFromError(error, now, identity);
		await recordFailureBestEffort(config, failure);
		return { status: "failed", failure };
	}
}

export async function reconcileTerminalSessionReceipts(
	config: ResolvedUserConfig | undefined,
	deps: ReceiptDependencies = {},
): Promise<TerminalReceiptOperationResult<TerminalReceiptReconciliationSummary>> {
	const receiptConfig = config?.terminalSessionReceipts;
	if (!receiptConfig?.enabled) return { status: "disabled" };
	const now = deps.now ?? (() => new Date());
	const store = deps.store ?? sessionStore;
	try {
		const root = await resolveRequiredRoot(receiptConfig);
		const sessions = (await store.listSessions())
			.filter(
				(session) =>
					terminalStateFromSession(session) !== null && session.id !== deps.excludeSessionId,
			)
			.slice(0, MAX_RECONCILIATION_SESSIONS);
		const summary: TerminalReceiptReconciliationSummary = {
			scanned: sessions.length,
			emitted: 0,
			deduplicated: 0,
			skipped: 0,
			failed: 0,
			completedAt: now().toISOString(),
		};

		for (const session of sessions) {
			const state = terminalStateFromSession(session);
			if (!state) {
				summary.skipped += 1;
				continue;
			}
			let candidate = session;
			if (!candidate.terminalReceiptIntent) {
				if (state === "succeeded") {
					summary.failed += 1;
					continue;
				}
				const prepared = await prepareTerminalSessionReceipt({
					config,
					session,
					terminalState: state,
					now,
				});
				if (!prepared.value) {
					summary.failed += 1;
					continue;
				}
				candidate = await store.updateSession(session.id, {
					terminalReceiptIntent: prepared.value.intent,
				});
			}
			const published = await publishTerminalSessionReceipt({ config, session: candidate, now });
			if (published.status === "succeeded") summary.emitted += 1;
			else if (published.status === "deduplicated") summary.deduplicated += 1;
			else summary.failed += 1;
		}

		summary.completedAt = now().toISOString();
		await updateLedger(root, (ledger) => ({ ...ledger, reconciliation: summary }));
		return { status: "succeeded", value: summary };
	} catch (error) {
		const failure = failureFromError(error, now);
		await recordFailureBestEffort(receiptConfig, failure);
		return { status: "failed", failure };
	}
}

export async function readTerminalSessionReceiptStatus(
	config: ResolvedUserConfig | undefined,
): Promise<TerminalReceiptStatus> {
	const receiptConfig = config?.terminalSessionReceipts;
	if (!receiptConfig?.enabled) {
		return {
			object: "auracall_terminal_session_receipt_status",
			schemaVersion: TERMINAL_SESSION_RECEIPT_SCHEMA_VERSION,
			enabled: false,
			configuredRoot: rootDescriptor(receiptConfig),
			rootState: "disabled",
			rootFailureCode: null,
			lastSuccessfulEmission: null,
			lastFailure: null,
			reconciliation: null,
		};
	}

	try {
		const resolved = resolveConfiguredRoot(receiptConfig);
		const exists = await pathExists(resolved);
		const root = await resolveAndValidateRoot(receiptConfig, { create: false });
		const ledger = root ? await readLedger(root) : null;
		return {
			object: "auracall_terminal_session_receipt_status",
			schemaVersion: TERMINAL_SESSION_RECEIPT_SCHEMA_VERSION,
			enabled: true,
			configuredRoot: rootDescriptor(receiptConfig),
			rootState: exists ? "ready" : "ready-to-create",
			rootFailureCode: null,
			lastSuccessfulEmission: ledger?.lastSuccessfulEmission ?? null,
			lastFailure: ledger?.lastFailure ?? null,
			reconciliation: ledger?.reconciliation ?? null,
		};
	} catch (error) {
		const failure = failureFromError(error, () => new Date());
		return {
			object: "auracall_terminal_session_receipt_status",
			schemaVersion: TERMINAL_SESSION_RECEIPT_SCHEMA_VERSION,
			enabled: true,
			configuredRoot: rootDescriptor(receiptConfig),
			rootState: "invalid",
			rootFailureCode: failure.code,
			lastSuccessfulEmission: null,
			lastFailure: failure,
			reconciliation: null,
		};
	}
}

export async function verifyTerminalSessionReceipt(
	sessionId: string,
	config: ResolvedUserConfig | undefined,
	deps: ReceiptDependencies = {},
): Promise<TerminalReceiptOperationResult<TerminalReceiptVerification>> {
	const receiptConfig = config?.terminalSessionReceipts;
	if (!receiptConfig?.enabled) return { status: "disabled" };
	const now = deps.now ?? (() => new Date());
	const store = deps.store ?? sessionStore;
	const identity = createEventIdentity(sessionId);
	try {
		const root = await resolveAndValidateRoot(receiptConfig, { create: false });
		if (!root) throw new TerminalReceiptInvariantError("receipt_root_missing");
		const session = await store.readSession(sessionId);
		if (!session) throw new TerminalReceiptInvariantError("session_not_found");
		const receiptPath = resolveContainedPath(root, receiptLocator(identity.eventId));
		const receipt = await readReceiptFile(receiptPath);
		assertReceiptIdentity(receipt, identity);
		const state = terminalStateFromSession(session);
		if (!state || receipt.terminalState !== state) {
			throw new TerminalReceiptInvariantError("terminal_state_mismatch");
		}

		let resultVerification: TerminalReceiptVerification["result"] = null;
		if (receipt.result) {
			const resultPath = resolveContainedPath(root, receipt.result.locator);
			const result = await readImmutablePrivateFile(resultPath);
			const digest = digestBuffer(result);
			const verified =
				digest === receipt.result.digest && result.byteLength === receipt.result.bytes;
			if (!verified) throw new TerminalReceiptInvariantError("result_digest_mismatch");
			resultVerification = { ...receipt.result, verified };
		} else if (receipt.terminalState === "succeeded") {
			throw new TerminalReceiptInvariantError("successful_result_missing");
		}

		return {
			status: "succeeded",
			value: {
				object: "auracall_terminal_session_receipt_verification",
				schemaVersion: TERMINAL_SESSION_RECEIPT_SCHEMA_VERSION,
				sessionRef: identity.sessionRef,
				eventId: identity.eventId,
				receiptLocator: receiptLocator(identity.eventId),
				terminalState: receipt.terminalState,
				result: resultVerification,
				verified: true,
			},
		};
	} catch (error) {
		return { status: "failed", failure: failureFromError(error, now, identity) };
	}
}

async function buildReceipt(
	session: SessionMetadata,
	now: () => Date,
	root: string,
): Promise<TerminalSessionReceipt> {
	const state = terminalStateFromSession(session);
	if (!state) throw new TerminalReceiptInvariantError("session_not_terminal");
	const intent = session.terminalReceiptIntent;
	const identity = createEventIdentity(session.id);
	if (!intent) throw new TerminalReceiptInvariantError("receipt_intent_missing");
	if (
		intent.schemaVersion !== TERMINAL_SESSION_RECEIPT_SCHEMA_VERSION ||
		intent.eventKind !== TERMINAL_SESSION_RECEIPT_EVENT_KIND
	) {
		throw new TerminalReceiptInvariantError("receipt_schema_mismatch");
	}
	if (
		intent.eventId !== identity.eventId ||
		intent.idempotencyKey !== identity.idempotencyKey ||
		intent.sessionRef !== identity.sessionRef
	) {
		throw new TerminalReceiptInvariantError("receipt_identity_mismatch");
	}
	if (intent.terminalState !== state) {
		throw new TerminalReceiptInvariantError("terminal_state_mismatch");
	}
	if (state === "succeeded" && !intent.result) {
		throw new TerminalReceiptInvariantError("successful_result_missing");
	}
	if (intent.result) {
		await verifyStoredResult(root, intent.result);
	}

	return {
		schemaVersion: TERMINAL_SESSION_RECEIPT_SCHEMA_VERSION,
		eventKind: TERMINAL_SESSION_RECEIPT_EVENT_KIND,
		eventId: identity.eventId,
		idempotencyKey: identity.idempotencyKey,
		sessionRef: identity.sessionRef,
		terminalState: state,
		terminalAt: session.completedAt ?? intent.persistedAt,
		persistedAt: intent.persistedAt,
		publishedAt: now().toISOString(),
		execution: summarizeExecution(session),
		result: intent.result ?? null,
		error: state === "succeeded" ? null : summarizeError(session, state),
	};
}

async function verifyStoredResult(
	root: string,
	result: SessionTerminalReceiptResultMetadata,
): Promise<void> {
	const targetPath = resolveContainedPath(root, result.locator);
	const payload = await readImmutablePrivateFile(targetPath);
	if (payload.byteLength !== result.bytes || digestBuffer(payload) !== result.digest) {
		throw new TerminalReceiptInvariantError("result_digest_mismatch");
	}
}

function summarizeExecution(session: SessionMetadata): TerminalSessionReceipt["execution"] {
	const mode = session.mode === "api" || session.mode === "browser" ? session.mode : "unknown";
	const browserTarget = session.browser?.config?.target;
	const model = session.model ?? session.options?.model ?? null;
	const modelClass = classifyModel(model);
	const provider =
		mode === "browser" ? (classifyProvider(browserTarget) ?? modelClass) : modelClass;
	return { mode, provider, modelClass };
}

function classifyProvider(
	value: string | null | undefined,
): TerminalSessionReceipt["execution"]["provider"] {
	if (!value) return null;
	const normalized = value.toLowerCase();
	if (normalized === "chatgpt" || normalized.startsWith("gpt") || normalized.startsWith("openai"))
		return "openai";
	if (normalized.startsWith("claude") || normalized.startsWith("anthropic")) return "anthropic";
	if (normalized.startsWith("gemini") || normalized.startsWith("google")) return "google";
	if (normalized.startsWith("grok") || normalized.startsWith("xai")) return "xai";
	return "other";
}

function classifyModel(
	value: string | null | undefined,
): TerminalSessionReceipt["execution"]["modelClass"] {
	return classifyProvider(value);
}

function summarizeError(session: SessionMetadata, state: Exclude<TerminalState, "succeeded">) {
	if (state === "cancelled") {
		return {
			category: "cancelled",
			code: session.transport?.reason === "client-abort" ? "client-abort" : "cancelled",
		};
	}
	const candidateCategory = session.error?.category;
	const category =
		typeof candidateCategory === "string" && SAFE_ERROR_CATEGORIES.has(candidateCategory)
			? candidateCategory
			: "session-error";
	const candidateCode = session.transport?.reason;
	const code =
		typeof candidateCode === "string" && SAFE_TRANSPORT_CODES.has(candidateCode)
			? candidateCode
			: category;
	return { category, code };
}

function boundedToken(value: unknown, fallback: string): string {
	if (typeof value !== "string") return fallback;
	const normalized = value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9._-]+/g, "-")
		.slice(0, 64);
	return normalized || fallback;
}

function terminalStateFromSession(session: SessionMetadata): TerminalState | null {
	if (session.status === "completed") return "succeeded";
	if (session.status === "error") return "error";
	if (session.status === "cancelled") return "cancelled";
	return null;
}

function createEventIdentity(sessionId: string) {
	const sessionDigest = digestText(`auracall-session-v1\0${sessionId}`);
	const eventDigest = digestText(`${TERMINAL_SESSION_RECEIPT_EVENT_KIND}\0${sessionDigest}`);
	return {
		sessionRef: `sha256:${sessionDigest}`,
		eventId: `evt_${eventDigest}`,
		idempotencyKey: `sha256:${eventDigest}`,
	};
}

function receiptLocator(eventId: string): string {
	return path.posix.join(RECEIPTS_DIRECTORY, `${eventId}.json`);
}

function resolveConfiguredRoot(config: TerminalReceiptConfig): string {
	const configured = config.root;
	if (!configured) throw new TerminalReceiptInvariantError("receipt_root_missing");
	if (configured === "auracall-home") {
		return path.join(getAuracallHomeDir(), "terminal-session-events");
	}
	if (
		!path.isAbsolute(configured) ||
		path.normalize(configured) !== configured ||
		configured === path.parse(configured).root
	) {
		throw new TerminalReceiptInvariantError("receipt_root_invalid");
	}
	return configured;
}

async function resolveAndValidateRoot(
	config: TerminalReceiptConfig,
	options: { create: boolean },
): Promise<string | null> {
	if (config.schemaVersion !== TERMINAL_SESSION_RECEIPT_SCHEMA_VERSION) {
		throw new TerminalReceiptInvariantError("receipt_schema_unsupported");
	}
	const root = resolveConfiguredRoot(config);
	await assertNoSymlinkAncestors(root);
	if (!(await pathExists(root))) {
		if (!options.create) return null;
		await fs.mkdir(root, { recursive: true, mode: PRIVATE_DIRECTORY_MODE });
	}
	const stats = await fs.lstat(root);
	if (stats.isSymbolicLink() || !stats.isDirectory()) {
		throw new TerminalReceiptInvariantError("receipt_root_not_directory");
	}
	assertOwnedByCurrentUser(stats);
	assertPrivatePermissions(stats.mode, "receipt_root_permissions_unsafe");
	return root;
}

async function resolveRequiredRoot(config: TerminalReceiptConfig): Promise<string> {
	const root = await resolveAndValidateRoot(config, { create: true });
	if (!root) throw new TerminalReceiptInvariantError("receipt_root_missing");
	return root;
}

async function assertNoSymlinkAncestors(targetPath: string): Promise<void> {
	let current = path.resolve(targetPath);
	for (;;) {
		try {
			const stats = await fs.lstat(current);
			if (stats.isSymbolicLink()) throw new TerminalReceiptInvariantError("receipt_path_symlink");
		} catch (error) {
			if (!isFsError(error, "ENOENT")) throw error;
		}
		const parent = path.dirname(current);
		if (parent === current) break;
		current = parent;
	}
}

async function ensurePrivateDirectory(targetPath: string): Promise<void> {
	await assertNoSymlinkAncestors(targetPath);
	await fs.mkdir(targetPath, { recursive: true, mode: PRIVATE_DIRECTORY_MODE });
	const stats = await fs.lstat(targetPath);
	if (stats.isSymbolicLink() || !stats.isDirectory()) {
		throw new TerminalReceiptInvariantError("receipt_path_not_directory");
	}
	assertOwnedByCurrentUser(stats);
	assertPrivatePermissions(stats.mode, "receipt_directory_permissions_unsafe");
}

async function writeImmutableFile(
	targetPath: string,
	payload: Buffer,
): Promise<{ created: boolean; digest: string; bytes: number }> {
	await ensurePrivateDirectory(path.dirname(targetPath));
	const digest = digestBuffer(payload);
	const existing = await readExistingImmutableFile(targetPath);
	if (existing) {
		if (existing.byteLength !== payload.byteLength || digestBuffer(existing) !== digest) {
			throw new TerminalReceiptInvariantError("immutable_content_mismatch");
		}
		return { created: false, digest, bytes: payload.byteLength };
	}

	const temporaryPath = path.join(
		path.dirname(targetPath),
		`.${path.basename(targetPath)}.${process.pid}.${randomUUID()}.tmp`,
	);
	let handle: Awaited<ReturnType<typeof fs.open>> | null = null;
	try {
		handle = await fs.open(temporaryPath, "wx", PRIVATE_MUTABLE_FILE_MODE);
		await handle.writeFile(payload);
		await handle.sync();
		await handle.close();
		handle = null;
		if (process.platform !== "win32") await fs.chmod(temporaryPath, PRIVATE_IMMUTABLE_FILE_MODE);
		try {
			await fs.link(temporaryPath, targetPath);
		} catch (error) {
			if (!isFsError(error, "EEXIST")) throw error;
			const raced = await readExistingImmutableFile(targetPath);
			if (!raced || raced.byteLength !== payload.byteLength || digestBuffer(raced) !== digest) {
				throw new TerminalReceiptInvariantError("immutable_content_mismatch");
			}
			return { created: false, digest, bytes: payload.byteLength };
		}
		await syncDirectory(path.dirname(targetPath));
		return { created: true, digest, bytes: payload.byteLength };
	} finally {
		await handle?.close().catch(() => undefined);
		await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
	}
}

async function readExistingImmutableFile(targetPath: string): Promise<Buffer | null> {
	try {
		return await readImmutablePrivateFile(targetPath);
	} catch (error) {
		if (isFsError(error, "ENOENT")) return null;
		throw error;
	}
}

async function readImmutablePrivateFile(targetPath: string): Promise<Buffer> {
	const payload = await readPrivateRegularFile(targetPath);
	if (process.platform !== "win32") {
		const stats = await fs.lstat(targetPath);
		if ((stats.mode & 0o222) !== 0) {
			throw new TerminalReceiptInvariantError("immutable_file_permissions_unsafe");
		}
	}
	return payload;
}

async function readPrivateRegularFile(targetPath: string): Promise<Buffer> {
	const stats = await fs.lstat(targetPath);
	if (stats.isSymbolicLink() || !stats.isFile()) {
		throw new TerminalReceiptInvariantError("receipt_file_not_regular");
	}
	assertOwnedByCurrentUser(stats);
	assertPrivatePermissions(stats.mode, "receipt_file_permissions_unsafe");
	return fs.readFile(targetPath);
}

async function readReceiptFile(targetPath: string): Promise<TerminalSessionReceipt> {
	const raw = await readImmutablePrivateFile(targetPath);
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw.toString("utf8"));
	} catch {
		throw new TerminalReceiptInvariantError("receipt_json_invalid");
	}
	if (!isRecord(parsed)) throw new TerminalReceiptInvariantError("receipt_json_invalid");
	return parsed as unknown as TerminalSessionReceipt;
}

async function readExistingReceipt(targetPath: string): Promise<TerminalSessionReceipt | null> {
	try {
		return await readReceiptFile(targetPath);
	} catch (error) {
		if (isFsError(error, "ENOENT")) return null;
		throw error;
	}
}

function assertReceiptMatchesSession(
	receipt: TerminalSessionReceipt,
	session: SessionMetadata,
	identity: ReturnType<typeof createEventIdentity>,
): void {
	assertReceiptIdentity(receipt, identity);
	const state = terminalStateFromSession(session);
	if (!state || receipt.terminalState !== state) {
		throw new TerminalReceiptInvariantError("terminal_state_mismatch");
	}
	const expectedResult = session.terminalReceiptIntent?.result ?? null;
	if (Boolean(receipt.result) !== Boolean(expectedResult)) {
		throw new TerminalReceiptInvariantError("receipt_result_mismatch");
	}
	if (
		receipt.result &&
		expectedResult &&
		(receipt.result.locator !== expectedResult.locator ||
			receipt.result.digest !== expectedResult.digest ||
			receipt.result.bytes !== expectedResult.bytes)
	) {
		throw new TerminalReceiptInvariantError("receipt_result_mismatch");
	}
}

function assertReceiptIdentity(
	receipt: TerminalSessionReceipt,
	identity: ReturnType<typeof createEventIdentity>,
): void {
	if (
		receipt.schemaVersion !== TERMINAL_SESSION_RECEIPT_SCHEMA_VERSION ||
		receipt.eventKind !== TERMINAL_SESSION_RECEIPT_EVENT_KIND
	) {
		throw new TerminalReceiptInvariantError("receipt_schema_mismatch");
	}
	if (
		receipt.eventId !== identity.eventId ||
		receipt.idempotencyKey !== identity.idempotencyKey ||
		receipt.sessionRef !== identity.sessionRef
	) {
		throw new TerminalReceiptInvariantError("receipt_identity_mismatch");
	}
}

function resolveContainedPath(root: string, locator: string): string {
	if (path.isAbsolute(locator) || locator.includes("\\")) {
		throw new TerminalReceiptInvariantError("receipt_locator_invalid");
	}
	const segments = locator.split("/");
	if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
		throw new TerminalReceiptInvariantError("receipt_locator_invalid");
	}
	const resolved = path.resolve(root, ...segments);
	const normalizedRoot = path.resolve(root);
	if (!resolved.startsWith(`${normalizedRoot}${path.sep}`)) {
		throw new TerminalReceiptInvariantError("receipt_locator_escape");
	}
	return resolved;
}

async function readLedger(root: string): Promise<TerminalReceiptLedger | null> {
	const targetPath = resolveContainedPath(root, STATE_FILE);
	try {
		const raw = await readPrivateRegularFile(targetPath);
		const parsed = JSON.parse(raw.toString("utf8")) as unknown;
		return isRecord(parsed) && parsed.schemaVersion === TERMINAL_SESSION_RECEIPT_SCHEMA_VERSION
			? (parsed as unknown as TerminalReceiptLedger)
			: null;
	} catch (error) {
		if (isFsError(error, "ENOENT")) return null;
		throw error;
	}
}

async function updateLedger(
	root: string,
	update: (ledger: TerminalReceiptLedger) => TerminalReceiptLedger,
): Promise<void> {
	const targetPath = resolveContainedPath(root, STATE_FILE);
	await ensurePrivateDirectory(path.dirname(targetPath));
	const current = (await readLedger(root)) ?? {
		schemaVersion: TERMINAL_SESSION_RECEIPT_SCHEMA_VERSION,
	};
	const next = update(current);
	const temporaryPath = `${targetPath}.${process.pid}.${randomUUID()}.tmp`;
	try {
		const handle = await fs.open(temporaryPath, "wx", PRIVATE_MUTABLE_FILE_MODE);
		try {
			await handle.writeFile(`${JSON.stringify(next, null, 2)}\n`, "utf8");
			await handle.sync();
		} finally {
			await handle.close();
		}
		if (process.platform !== "win32") await fs.chmod(temporaryPath, PRIVATE_MUTABLE_FILE_MODE);
		const existing = await lstatOrNull(targetPath);
		if (existing?.isSymbolicLink()) throw new TerminalReceiptInvariantError("receipt_path_symlink");
		await fs.rename(temporaryPath, targetPath);
		await syncDirectory(path.dirname(targetPath));
	} finally {
		await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
	}
}

async function recordFailureBestEffort(
	config: TerminalReceiptConfig,
	failure: TerminalReceiptFailure,
): Promise<void> {
	try {
		const root = await resolveAndValidateRoot(config, { create: false });
		if (!root) return;
		await updateLedger(root, (ledger) => ({ ...ledger, lastFailure: failure }));
	} catch {
		// Root validation failures remain visible through status rootState/rootFailureCode.
	}
}

function rootDescriptor(
	config: TerminalReceiptConfig | undefined,
): TerminalReceiptStatus["configuredRoot"] {
	if (!config?.root) return { kind: "not-configured", display: null, fingerprint: null };
	if (config.root === "auracall-home") {
		return {
			kind: "auracall-home-managed",
			display: "auracall-home/terminal-session-events",
			fingerprint: digestText(resolveConfiguredRoot(config)),
		};
	}
	return {
		kind: "custom",
		display: `custom:${path.basename(config.root)}`,
		fingerprint: digestText(config.root),
	};
}

function failureFromError(
	error: unknown,
	now: () => Date,
	identity: Partial<ReturnType<typeof createEventIdentity>> = {},
): TerminalReceiptFailure {
	return {
		code:
			error instanceof TerminalReceiptInvariantError
				? error.code
				: boundedToken(readErrorCode(error), "receipt_io_failure"),
		at: now().toISOString(),
		eventId: identity.eventId ?? null,
		sessionRef: identity.sessionRef ?? null,
	};
}

function readErrorCode(error: unknown): string {
	if (isRecord(error) && typeof error.code === "string")
		return `receipt_io_${error.code.toLowerCase()}`;
	return "receipt_io_failure";
}

function digestText(value: string): string {
	return createHash("sha256").update(value, "utf8").digest("hex");
}

function digestBuffer(value: Buffer): string {
	return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function assertOwnedByCurrentUser(stats: { uid: number }): void {
	if (process.platform === "win32" || typeof process.getuid !== "function") return;
	if (stats.uid !== process.getuid())
		throw new TerminalReceiptInvariantError("receipt_owner_mismatch");
}

function assertPrivatePermissions(mode: number, code: string): void {
	if (process.platform === "win32") return;
	if ((mode & 0o077) !== 0) throw new TerminalReceiptInvariantError(code);
}

async function syncDirectory(directory: string): Promise<void> {
	let handle: Awaited<ReturnType<typeof fs.open>> | null = null;
	try {
		handle = await fs.open(directory, "r");
		await handle.sync();
	} catch (error) {
		if (!isFsError(error, "EINVAL") && !isFsError(error, "ENOTSUP")) throw error;
	} finally {
		await handle?.close().catch(() => undefined);
	}
}

async function pathExists(targetPath: string): Promise<boolean> {
	try {
		await fs.lstat(targetPath);
		return true;
	} catch (error) {
		if (isFsError(error, "ENOENT")) return false;
		throw error;
	}
}

async function lstatOrNull(targetPath: string) {
	try {
		return await fs.lstat(targetPath);
	} catch (error) {
		if (isFsError(error, "ENOENT")) return null;
		throw error;
	}
}

function isFsError(error: unknown, code: string): boolean {
	return isRecord(error) && error.code === code;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
