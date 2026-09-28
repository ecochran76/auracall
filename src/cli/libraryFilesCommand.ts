import { BrowserAutomationClient } from "../browser/client.js";
import type { LibraryFileInventory } from "../browser/libraryFiles.js";
import type { BrowserProviderListOptions } from "../browser/providers/types.js";
import type { ResolvedUserConfig } from "../config.js";
import { requireBundledServiceRouteTemplate } from "../services/registry.js";

const DEFAULT_LIBRARY_FILES_INVENTORY_TIMEOUT_MS = 60_000;
const DEFAULT_LIBRARY_FILES_OPERATION_TIMEOUT_MS = 54_000;
const DEFAULT_LIBRARY_FILES_CLEANUP_TIMEOUT_MS = 5_000;

interface ChatgptLibraryFilesCliClient {
	listLibraryFiles(options?: BrowserProviderListOptions): Promise<LibraryFileInventory>;
	close?(): Promise<void>;
	dispose?(): Promise<void>;
}

export interface ChatgptLibraryFilesCliDependencies {
	createClient?: () => Promise<ChatgptLibraryFilesCliClient>;
	inventoryTimeoutMs?: number;
	operationTimeoutMs?: number;
	cleanupTimeoutMs?: number;
}

export interface ChatgptLibraryFilesCommandOptions {
	json: boolean;
	abortSignal?: AbortSignal;
}

export interface ChatgptLibraryFilesTerminalResult {
	exitCode: number;
	stream: "stdout" | "stderr";
	output: string;
}

export class ChatgptLibraryFilesTimeoutError extends Error {
	readonly code = "library_files_inventory_timeout";

	constructor(readonly timeoutMs: number) {
		super(`ChatGPT Library inventory timed out after ${timeoutMs}ms.`);
		this.name = "ChatgptLibraryFilesTimeoutError";
	}
}

export class ChatgptLibraryFilesCancelledError extends Error {
	readonly code = "library_files_inventory_cancelled";

	constructor(readonly signal: string | null = null) {
		super(
			signal
				? `ChatGPT Library inventory cancelled by ${signal}.`
				: "ChatGPT Library inventory cancelled.",
		);
		this.name = "ChatgptLibraryFilesCancelledError";
	}
}

export async function listChatgptLibraryFilesForCli(
	userConfig: ResolvedUserConfig,
	dependencies: ChatgptLibraryFilesCliDependencies & { abortSignal?: AbortSignal } = {},
): Promise<LibraryFileInventory> {
	const inventoryTimeoutMs = normalizePositiveTimeout(
		dependencies.inventoryTimeoutMs,
		DEFAULT_LIBRARY_FILES_INVENTORY_TIMEOUT_MS,
	);
	const cleanupTimeoutMs = normalizePositiveTimeout(
		dependencies.cleanupTimeoutMs,
		DEFAULT_LIBRARY_FILES_CLEANUP_TIMEOUT_MS,
	);
	const operationTimeoutMs = Math.min(
		normalizePositiveTimeout(
			dependencies.operationTimeoutMs,
			DEFAULT_LIBRARY_FILES_OPERATION_TIMEOUT_MS,
		),
		Math.max(1, inventoryTimeoutMs - cleanupTimeoutMs - 1),
	);
	const controller = new AbortController();
	const stopForwardingAbort = forwardAbort(dependencies.abortSignal, controller);
	let client: ChatgptLibraryFilesCliClient | null = null;
	let closePromise: Promise<void> | null = null;
	let operationSettled = false;

	const closeClient = (): Promise<void> => {
		if (!client) return Promise.resolve();
		if (!closePromise) {
			closePromise = Promise.resolve().then(async () => {
				if (client?.dispose) {
					await client.dispose();
					return;
				}
				await client?.close?.();
			});
		}
		return closePromise;
	};

	const operation = (async () => {
		client = dependencies.createClient
			? await dependencies.createClient()
			: await BrowserAutomationClient.fromConfig(userConfig, { target: "chatgpt" });
		controller.signal.throwIfAborted();
		return await client.listLibraryFiles({
			abortSignal: controller.signal,
			configuredUrl: requireBundledServiceRouteTemplate("chatgpt", "library"),
			disableAccountFileListRetry: true,
			preserveActiveTab: true,
			requireExistingTarget: true,
		});
	})().finally(() => {
		operationSettled = true;
	});
	const boundedOperation = runWithInventoryDeadline(operation, controller, operationTimeoutMs);

	try {
		return await runWithInventoryDeadline(boundedOperation, controller, inventoryTimeoutMs);
	} finally {
		stopForwardingAbort();
		if (!operationSettled && !controller.signal.aborted) {
			controller.abort(new ChatgptLibraryFilesCancelledError());
		}
		await runWithCleanupDeadline(
			Promise.allSettled([operation, closeClient()]).then(() => undefined),
			cleanupTimeoutMs,
		);
	}
}

export async function runChatgptLibraryFilesCommandForCli(
	userConfig: ResolvedUserConfig,
	options: ChatgptLibraryFilesCommandOptions,
	dependencies: ChatgptLibraryFilesCliDependencies = {},
): Promise<ChatgptLibraryFilesTerminalResult> {
	try {
		const inventory = await listChatgptLibraryFilesForCli(userConfig, {
			...dependencies,
			abortSignal: options.abortSignal,
		});
		return {
			exitCode: inventory.complete ? 0 : 1,
			stream: "stdout",
			output: options.json
				? JSON.stringify(inventory, null, 2)
				: formatLibraryFileInventory(inventory),
		};
	} catch (error) {
		const failure = createLibraryFilesFailure(error);
		return {
			exitCode: failure.error.code === "library_files_inventory_cancelled" ? 130 : 1,
			stream: options.json ? "stdout" : "stderr",
			output: options.json
				? JSON.stringify(failure, null, 2)
				: `ChatGPT Library inventory failed: ${failure.error.message}`,
		};
	}
}

export function formatLibraryFileInventory(inventory: LibraryFileInventory): string {
	const lines = [
		`ChatGPT Library files (${inventory.files.length})`,
		`Observed: ${inventory.observedAt}`,
		`Inventory: ${inventory.complete ? "complete" : `incomplete (${inventory.incompleteReason ?? "unknown reason"})`}`,
	];
	if (inventory.files.length === 0) {
		lines.push("No usable Library files with stable provider IDs were observed.");
	} else {
		for (const file of inventory.files) {
			const metadata = [
				file.mimeType ?? null,
				file.sizeBytes == null ? null : `${file.sizeBytes} bytes`,
			]
				.filter(Boolean)
				.join(", ");
			lines.push(`- ${file.id}  ${file.name}${metadata ? ` (${metadata})` : ""}`);
		}
	}
	return lines.join("\n");
}

function createLibraryFilesFailure(error: unknown): {
	object: "auracall.library_files_error";
	status: "error";
	error: {
		code:
			| "library_files_inventory_timeout"
			| "library_files_inventory_cancelled"
			| "library_files_inventory_failed";
		message: string;
		timeoutMs?: number;
		signal?: string | null;
	};
} {
	if (error instanceof ChatgptLibraryFilesTimeoutError) {
		return {
			object: "auracall.library_files_error",
			status: "error",
			error: { code: error.code, message: error.message, timeoutMs: error.timeoutMs },
		};
	}
	if (error instanceof ChatgptLibraryFilesCancelledError) {
		return {
			object: "auracall.library_files_error",
			status: "error",
			error: { code: error.code, message: error.message, signal: error.signal },
		};
	}
	return {
		object: "auracall.library_files_error",
		status: "error",
		error: {
			code: "library_files_inventory_failed",
			message: error instanceof Error ? error.message : String(error),
		},
	};
}

function forwardAbort(source: AbortSignal | undefined, target: AbortController): () => void {
	if (!source) return () => undefined;
	const abort = () => {
		if (target.signal.aborted) return;
		const reason =
			source.reason instanceof ChatgptLibraryFilesCancelledError
				? source.reason
				: new ChatgptLibraryFilesCancelledError();
		target.abort(reason);
	};
	if (source.aborted) {
		abort();
		return () => undefined;
	}
	source.addEventListener("abort", abort, { once: true });
	return () => source.removeEventListener("abort", abort);
}

async function runWithInventoryDeadline<T>(
	operation: Promise<T>,
	controller: AbortController,
	timeoutMs: number,
): Promise<T> {
	let timeout: ReturnType<typeof setTimeout> | null = null;
	let removeAbortListener: () => void = () => undefined;
	try {
		const aborted = new Promise<never>((_resolve, reject) => {
			const onAbort = () =>
				reject(controller.signal.reason ?? new ChatgptLibraryFilesCancelledError());
			if (controller.signal.aborted) {
				onAbort();
				return;
			}
			controller.signal.addEventListener("abort", onAbort, { once: true });
			removeAbortListener = () => controller.signal.removeEventListener("abort", onAbort);
		});
		const timedOut = new Promise<never>((_resolve, reject) => {
			timeout = setTimeout(() => {
				const error = new ChatgptLibraryFilesTimeoutError(timeoutMs);
				controller.abort(error);
				reject(error);
			}, timeoutMs);
		});
		return await Promise.race([operation, aborted, timedOut]);
	} finally {
		removeAbortListener();
		if (timeout) clearTimeout(timeout);
	}
}

async function runWithCleanupDeadline(cleanup: Promise<void>, timeoutMs: number): Promise<void> {
	let timeout: ReturnType<typeof setTimeout> | null = null;
	try {
		await Promise.race([
			cleanup,
			new Promise<void>((resolve) => {
				timeout = setTimeout(resolve, timeoutMs);
			}),
		]);
	} finally {
		if (timeout) clearTimeout(timeout);
	}
}

function normalizePositiveTimeout(value: number | undefined, fallback: number): number {
	return Number.isFinite(value) && Number(value) > 0 ? Math.floor(Number(value)) : fallback;
}
