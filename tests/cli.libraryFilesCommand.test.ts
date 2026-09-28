import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";
import {
	ChatgptLibraryFilesCancelledError,
	formatLibraryFileInventory,
	listChatgptLibraryFilesForCli,
	runChatgptLibraryFilesCommandForCli,
} from "../src/cli/libraryFilesCommand.js";

describe("library-files CLI", () => {
	test("hooks terminal output to the bounded one-shot process exit boundary", async () => {
		const source = await fs.readFile(path.resolve("bin/auracall.ts"), "utf8");
		const start = source.indexOf(".command('library-files')");
		const end = source.indexOf("const featuresCommand = program", start);
		const action = source.slice(start, end);
		expect(start).toBeGreaterThanOrEqual(0);
		expect(end).toBeGreaterThan(start);
		expect(action).toContain("exitAfterCompletedBrowserProbeCommand();");
	});

	test("exits after structured terminal output despite a retained event-loop handle", async () => {
		const fixture = path.resolve("tests/fixtures/libraryFilesExit.fixture.ts");
		const child = spawn(process.execPath, ["--import", "tsx", fixture], {
			cwd: process.cwd(),
			env: { ...process.env },
			stdio: ["ignore", "pipe", "pipe"],
		});
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (chunk) => {
			stdout += String(chunk);
		});
		child.stderr.on("data", (chunk) => {
			stderr += String(chunk);
		});
		const result = await Promise.race([
			new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
				child.once("exit", (code, signal) => resolve({ code, signal }));
			}),
			new Promise<never>((_, reject) => {
				const timer = setTimeout(() => {
					child.kill("SIGKILL");
					reject(new Error("library-files exit fixture retained its event-loop handle"));
				}, 2_000);
				timer.unref();
			}),
		]);

		expect(stderr).toBe("");
		expect(JSON.parse(stdout)).toMatchObject({
			object: "auracall.library_files_error",
			status: "error",
		});
		expect(result).toEqual({ code: 0, signal: null });
	});

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
		expect(listLibraryFiles).toHaveBeenCalledWith({
			abortSignal: expect.any(AbortSignal),
			configuredUrl: "https://chatgpt.com/library",
			preserveActiveTab: true,
			requireExistingTarget: true,
		});
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

	test("preserves a provider-stage error when client dispose does not settle", async () => {
		vi.useFakeTimers();
		try {
			const dispose = vi.fn(() => new Promise<void>(() => undefined));
			const resultPromise = runChatgptLibraryFilesCommandForCli(
				{} as never,
				{ json: true },
				{
					inventoryTimeoutMs: 25,
					cleanupTimeoutMs: 10,
					createClient: async () => ({
						dispose,
						listLibraryFiles: async () => {
							throw new Error(
								"ChatGPT Library inventory stage dom-inventory timed out after 10000ms.",
							);
						},
					}),
				},
			);
			const guarded = Promise.race([
				resultPromise,
				new Promise<"still-pending">((resolve) => {
					setTimeout(() => resolve("still-pending"), 11);
				}),
			]);

			await vi.advanceTimersByTimeAsync(11);
			const outcome = await guarded;
			await vi.advanceTimersByTimeAsync(24);
			await resultPromise;

			expect(outcome).not.toBe("still-pending");
			expect(dispose).toHaveBeenCalledOnce();
			expect(JSON.parse((outcome as Awaited<typeof resultPromise>).output)).toMatchObject({
				error: {
					code: "library_files_inventory_failed",
					message: "ChatGPT Library inventory stage dom-inventory timed out after 10000ms.",
				},
			});
		} finally {
			vi.useRealTimers();
		}
	});

	test("returns provider success when client dispose does not settle", async () => {
		vi.useFakeTimers();
		try {
			const dispose = vi.fn(() => new Promise<void>(() => undefined));
			const resultPromise = runChatgptLibraryFilesCommandForCli(
				{} as never,
				{ json: true },
				{
					inventoryTimeoutMs: 25,
					cleanupTimeoutMs: 10,
					createClient: async () => ({
						dispose,
						listLibraryFiles: async () => ({
							provider: "chatgpt" as const,
							complete: true,
							observedAt: "2026-09-28T12:00:00.000Z",
							files: [],
						}),
					}),
				},
			);
			const guarded = Promise.race([
				resultPromise,
				new Promise<"still-pending">((resolve) => {
					setTimeout(() => resolve("still-pending"), 11);
				}),
			]);

			await vi.advanceTimersByTimeAsync(11);
			const outcome = await guarded;
			await vi.advanceTimersByTimeAsync(24);
			await resultPromise;

			expect(outcome).not.toBe("still-pending");
			expect(dispose).toHaveBeenCalledOnce();
			expect(JSON.parse((outcome as Awaited<typeof resultPromise>).output)).toMatchObject({
				provider: "chatgpt",
				complete: true,
				files: [],
			});
		} finally {
			vi.useRealTimers();
		}
	});

	test("keeps the outer watchdog behind preflight, provider timeout, and settlement", async () => {
		vi.useFakeTimers();
		try {
			const delay = (timeoutMs: number) =>
				new Promise<void>((resolve) => setTimeout(resolve, timeoutMs));
			const resultPromise = runChatgptLibraryFilesCommandForCli(
				{} as never,
				{ json: true },
				{
					createClient: async () => {
						await delay(4_000);
						return {
							listLibraryFiles: async () => {
								await delay(6_000);
								await delay(30_000);
								await delay(3_000);
								await delay(5_000);
								throw new Error(
									"ChatGPT Library inventory stage dom-inventory timed out after 10000ms.",
								);
							},
						};
					},
				},
			);

			await vi.advanceTimersByTimeAsync(48_000);
			const result = await resultPromise;

			expect(result.exitCode).toBe(1);
			expect(JSON.parse(result.output)).toMatchObject({
				error: {
					code: "library_files_inventory_failed",
					message: "ChatGPT Library inventory stage dom-inventory timed out after 10000ms.",
				},
			});
		} finally {
			vi.useRealTimers();
		}
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
					inventoryTimeoutMs: 40,
					operationTimeoutMs: 25,
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
					inventoryTimeoutMs: 40,
					operationTimeoutMs: 25,
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
