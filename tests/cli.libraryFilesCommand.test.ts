import { describe, expect, test, vi } from "vitest";
import {
	ChatgptLibraryFilesCancelledError,
	formatLibraryFileInventory,
	listChatgptLibraryFilesForCli,
	runChatgptLibraryFilesCommandForCli,
} from "../src/cli/libraryFilesCommand.js";

describe("library-files CLI", () => {
	test("lists bounded provider identities through the dedicated Library surface and closes once", async () => {
		const close = vi.fn(async () => undefined);
		const listLibraryFiles = vi.fn(async () => ({
			provider: "chatgpt" as const,
			complete: true,
			observedAt: "2026-09-27T12:00:00.000Z",
			files: [{ id: "file_packet", name: "Packet.pdf", provider: "chatgpt" as const }],
		}));
		const inventory = await listChatgptLibraryFilesForCli({} as never, {
			createClient: async () => ({ close, listLibraryFiles }),
		});

		expect(listLibraryFiles).toHaveBeenCalledOnce();
		expect(listLibraryFiles).toHaveBeenCalledWith({ abortSignal: expect.any(AbortSignal) });
		expect(close).toHaveBeenCalledOnce();
		expect(formatLibraryFileInventory(inventory)).toContain("- file_packet  Packet.pdf");
	});

	test("returns structured JSON and closes once after a provider error", async () => {
		const close = vi.fn(async () => undefined);
		const result = await runChatgptLibraryFilesCommandForCli(
			{} as never,
			{ json: true },
			{
				createClient: async () => ({
					close,
					listLibraryFiles: async () => {
						throw new Error("provider fixture failed");
					},
				}),
			},
		);

		expect(close).toHaveBeenCalledOnce();
		expect(result.exitCode).toBe(1);
		expect(result.stream).toBe("stdout");
		expect(JSON.parse(result.output)).toMatchObject({
			object: "auracall.library_files_error",
			status: "error",
			error: {
				code: "library_files_inventory_failed",
				message: "provider fixture failed",
			},
		});
	});

	test("times out the complete inventory, aborts it, and joins close before returning", async () => {
		vi.useFakeTimers();
		try {
			const events: string[] = [];
			let rejectInventory: ((error: unknown) => void) | null = null;
			const close = vi.fn(async () => {
				events.push("close");
				rejectInventory?.(new Error("closed after abort"));
			});
			const resultPromise = runChatgptLibraryFilesCommandForCli(
				{} as never,
				{ json: true },
				{
					inventoryTimeoutMs: 25,
					cleanupTimeoutMs: 10,
					createClient: async () => ({
						close,
						listLibraryFiles: async (options) =>
							new Promise((_resolve, reject) => {
								rejectInventory = reject;
								options?.abortSignal?.addEventListener("abort", () => events.push("abort"), {
									once: true,
								});
							}),
					}),
				},
			);

			await vi.advanceTimersByTimeAsync(25);
			const result = await resultPromise;

			expect(events).toEqual(["abort", "close"]);
			expect(close).toHaveBeenCalledOnce();
			expect(result.exitCode).toBe(1);
			expect(JSON.parse(result.output)).toMatchObject({
				error: {
					code: "library_files_inventory_timeout",
					timeoutMs: 25,
				},
			});
		} finally {
			vi.useRealTimers();
		}
	});

	test("bounds client creation and browser discovery before an inventory client exists", async () => {
		vi.useFakeTimers();
		try {
			const resultPromise = runChatgptLibraryFilesCommandForCli(
				{} as never,
				{ json: true },
				{
					inventoryTimeoutMs: 25,
					cleanupTimeoutMs: 10,
					createClient: async () => new Promise(() => undefined),
				},
			);

			await vi.advanceTimersByTimeAsync(25);
			await vi.advanceTimersByTimeAsync(10);
			const result = await resultPromise;

			expect(result.exitCode).toBe(1);
			expect(JSON.parse(result.output)).toMatchObject({
				error: {
					code: "library_files_inventory_timeout",
					timeoutMs: 25,
				},
			});
		} finally {
			vi.useRealTimers();
		}
	});

	test("returns after the cleanup deadline when client close does not settle", async () => {
		vi.useFakeTimers();
		try {
			const close = vi.fn(async () => new Promise<void>(() => undefined));
			const resultPromise = runChatgptLibraryFilesCommandForCli(
				{} as never,
				{ json: true },
				{
					inventoryTimeoutMs: 25,
					cleanupTimeoutMs: 10,
					createClient: async () => ({
						close,
						listLibraryFiles: async (options) =>
							new Promise((_resolve, reject) => {
								options?.abortSignal?.addEventListener(
									"abort",
									() => reject(options.abortSignal?.reason),
									{ once: true },
								);
							}),
					}),
				},
			);

			await vi.advanceTimersByTimeAsync(25);
			await vi.advanceTimersByTimeAsync(10);
			const result = await resultPromise;

			expect(close).toHaveBeenCalledOnce();
			expect(result.exitCode).toBe(1);
			expect(JSON.parse(result.output)).toMatchObject({
				error: { code: "library_files_inventory_timeout" },
			});
		} finally {
			vi.useRealTimers();
		}
	});

	test("cancels provider-free inventory and closes before returning exit 130", async () => {
		const controller = new AbortController();
		const close = vi.fn(async () => undefined);
		let inventoryStarted: (() => void) | null = null;
		const started = new Promise<void>((resolve) => {
			inventoryStarted = resolve;
		});
		const resultPromise = runChatgptLibraryFilesCommandForCli(
			{} as never,
			{ abortSignal: controller.signal, json: true },
			{
				createClient: async () => ({
					close,
					listLibraryFiles: async (options) =>
						new Promise((_resolve, reject) => {
							inventoryStarted?.();
							options?.abortSignal?.addEventListener(
								"abort",
								() => reject(options.abortSignal?.reason),
								{ once: true },
							);
						}),
				}),
			},
		);
		await started;
		controller.abort(new ChatgptLibraryFilesCancelledError("SIGINT"));
		const result = await resultPromise;

		expect(close).toHaveBeenCalledOnce();
		expect(result.exitCode).toBe(130);
		expect(result.stream).toBe("stdout");
		expect(JSON.parse(result.output)).toMatchObject({
			error: {
				code: "library_files_inventory_cancelled",
				signal: "SIGINT",
			},
		});
	});
});
