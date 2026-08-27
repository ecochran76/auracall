import { describe, expect, test, vi } from "vitest";
import {
	__test__ as promptComposer,
	submitPrompt,
} from "../../src/browser/actions/promptComposer.js";

describe("promptComposer", () => {
	test("requires the composer user text to equal the requested prompt", () => {
		expect(promptComposer.composerContainsPrompt("Corel33t", "Review the existing project")).toBe(
			false,
		);
		expect(
			promptComposer.composerContainsPrompt(
				"Retained stale draft. Review the existing project",
				"Review the existing project",
			),
		).toBe(false);
		expect(
			promptComposer.composerContainsPrompt(
				"Review the existing project",
				"Review the existing project",
			),
		).toBe(true);
	});

	test("rejects a newly committed turn that only contains the requested prompt", async () => {
		vi.useFakeTimers();
		try {
			const runtime = {
				evaluate: vi.fn().mockResolvedValue({
					result: {
						value: {
							turnsCount: 11,
							userMatched: true,
							prefixMatched: true,
							lastMatched: true,
							lastExactMatched: false,
							hasNewTurn: true,
							stopVisible: true,
							assistantVisible: false,
							composerCleared: true,
							inConversation: true,
							baseline: 10,
						},
					},
				}),
			} as unknown as {
				evaluate: (args: { expression: string; returnByValue?: boolean }) => Promise<unknown>;
			};

			const promise = promptComposer.verifyPromptCommitted(
				runtime as never,
				"Review the existing project",
				150,
				undefined,
				10,
			);
			const assertion = expect(promise).rejects.toThrow(/prompt did not appear/i);
			await vi.advanceTimersByTimeAsync(250);
			await assertion;
		} finally {
			vi.useRealTimers();
		}
	});

	test("fails closed when retained composer text cannot be cleared", async () => {
		const runtime = {
			evaluate: vi.fn().mockResolvedValue({
				result: {
					value: { cleared: false, beforeLength: 42, afterLength: 42 },
				},
			}),
		} as unknown as {
			evaluate: (args: { expression: string; returnByValue?: boolean }) => Promise<unknown>;
		};

		const logger = vi.fn<(message: string) => void>();
		await expect(
			promptComposer.preparePromptComposer(runtime as never, logger),
		).rejects.toMatchObject({
			details: { code: "prompt-composer-not-cleared" },
		});
	});

	test("does not treat cleared composer + stop button as committed without a new turn", async () => {
		vi.useFakeTimers();
		try {
			const runtime = {
				evaluate: vi
					.fn()
					// Baseline read (turn count)
					.mockResolvedValueOnce({ result: { value: 10 } })
					// Polls (repeat)
					.mockResolvedValue({
						result: {
							value: {
								turnsCount: 10,
								userMatched: false,
								prefixMatched: false,
								lastMatched: false,
								hasNewTurn: false,
								stopVisible: true,
								assistantVisible: false,
								composerCleared: true,
								inConversation: false,
							},
						},
					}),
			} as unknown as {
				evaluate: (args: { expression: string; returnByValue?: boolean }) => Promise<unknown>;
			};

			const promise = promptComposer.verifyPromptCommitted(runtime as never, "hello", 150);
			const assertion = expect(promise).rejects.toThrow(/prompt did not appear/i);
			await vi.advanceTimersByTimeAsync(250);
			await assertion;
		} finally {
			vi.useRealTimers();
		}
	});

	test("allows prompt match even if baseline turn count cannot be read", async () => {
		const runtime = {
			evaluate: vi
				.fn()
				// Baseline read fails
				.mockRejectedValueOnce(new Error("turn read failed"))
				// First poll shows prompt match (baseline unknown)
				.mockResolvedValueOnce({
					result: {
						value: {
							turnsCount: 1,
							userMatched: true,
							prefixMatched: false,
							lastMatched: true,
							lastExactMatched: true,
							hasNewTurn: false,
							stopVisible: false,
							assistantVisible: false,
							composerCleared: false,
							inConversation: true,
						},
					},
				}),
		} as unknown as {
			evaluate: (args: { expression: string; returnByValue?: boolean }) => Promise<unknown>;
		};

		await expect(
			promptComposer.verifyPromptCommitted(runtime as never, "hello", 150),
		).resolves.toBe(1);
	});

	test("waits for hot conversation submit readiness until stop state clears", async () => {
		vi.useFakeTimers();
		try {
			const runtime = {
				evaluate: vi
					.fn()
					.mockResolvedValueOnce({ result: { value: { ready: false } } })
					.mockResolvedValueOnce({ result: { value: { ready: false } } })
					.mockResolvedValueOnce({ result: { value: { ready: true } } }),
			} as unknown as {
				evaluate: (args: { expression: string; returnByValue?: boolean }) => Promise<unknown>;
			};

			const promise = promptComposer.waitForComposerReadyToSubmit(runtime as never, 500);
			await vi.advanceTimersByTimeAsync(250);
			await expect(promise).resolves.toBeUndefined();
			expect((runtime.evaluate as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(3);
		} finally {
			vi.useRealTimers();
		}
	});

	test("accepts immediate submit readiness when conversation is already settled", async () => {
		const runtime = {
			evaluate: vi.fn().mockResolvedValueOnce({ result: { value: { ready: true } } }),
		} as unknown as {
			evaluate: (args: { expression: string; returnByValue?: boolean }) => Promise<unknown>;
		};

		await expect(
			promptComposer.waitForComposerReadyToSubmit(runtime as never, 500),
		).resolves.toBeUndefined();
		expect((runtime.evaluate as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
	});

	test("accepts prompt text from the exact focused target through submit verification", async () => {
		const prompt = "Review the bounded Experiment 9 packet.";
		const runtime = {
			evaluate: vi
				.fn()
				// DOM readiness.
				.mockResolvedValueOnce({ result: { value: { ready: true, composer: true } } })
				// Focus and mark the exact visible composer-owned target.
				.mockResolvedValueOnce({ result: { value: { focused: true } } })
				// Clear retained user-authored text while preserving selected app pills.
				.mockResolvedValueOnce({
					result: { value: { cleared: true, beforeLength: 18, afterLength: 0 } },
				})
				// Initial readback sees the prompt only on the marked target.
				.mockResolvedValueOnce({
					result: {
						value: {
							editorText: "",
							fallbackValue: "",
							editorUserText: "",
							targetText: prompt,
							targetUserText: prompt,
						},
					},
				})
				// Pre-Send verification remains bound to that target.
				.mockResolvedValueOnce({
					result: {
						value: {
							editorText: "",
							fallbackValue: "",
							editorUserText: "",
							targetText: prompt,
							targetUserText: prompt,
						},
					},
				})
				// Composer ready, Send clicked, and the new user turn committed.
				.mockResolvedValueOnce({ result: { value: { ready: true } } })
				.mockResolvedValueOnce({ result: { value: "clicked" } })
				.mockResolvedValueOnce({
					result: {
						value: {
							turnsCount: 1,
							userMatched: true,
							prefixMatched: false,
							lastMatched: true,
							lastExactMatched: true,
							hasNewTurn: true,
							stopVisible: false,
							assistantVisible: false,
							composerCleared: true,
							inConversation: true,
							baseline: 0,
						},
					},
				}),
		};
		const input = {
			insertText: vi.fn().mockResolvedValue(undefined),
			dispatchKeyEvent: vi.fn().mockResolvedValue(undefined),
		};
		const logger = vi.fn<(message: string) => void>();

		await expect(
			submitPrompt(
				{
					runtime: runtime as never,
					input: input as never,
					baselineTurns: 0,
					inputTimeoutMs: 500,
				},
				prompt,
				logger,
			),
		).resolves.toBe(1);

		expect(input.insertText).toHaveBeenCalledWith({ text: prompt });
		expect(input.dispatchKeyEvent).not.toHaveBeenCalled();
		expect(runtime.evaluate).toHaveBeenCalledTimes(8);
	});
});
