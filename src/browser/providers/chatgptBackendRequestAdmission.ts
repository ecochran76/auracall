import { createHash, randomUUID } from "node:crypto";
import type Protocol from "devtools-protocol";
import {
	holdCdpCommandAdmission,
	withCdpCommandTimeout,
} from "../../../packages/browser-service/src/guardedCdp.js";
import {
	ProviderBackendRequestCancelledBeforeDispatchError,
	type ProviderTrafficGovernor,
} from "../../../packages/browser-service/src/service/providerTrafficGovernor.js";
import type { ChromeClient } from "../types.js";

type StartupWaiter = (ready: () => Promise<boolean>, signal: AbortSignal) => Promise<void>;
const startupWaiters = new WeakMap<object, StartupWaiter>();

/** Keep the owning transport alive while its initial request admissions finish. */
export async function waitForOwnedChatgptBackendStartup(
	client: ChromeClient,
	ready: () => Promise<boolean>,
	signal: AbortSignal,
): Promise<void> {
	const wait = startupWaiters.get(client);
	if (!wait) throw new Error("Owned backend request startup is unavailable for this client.");
	await wait(ready, signal);
}

async function withStartupAbort<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
	signal.throwIfAborted();
	let aborted: (() => void) | undefined;
	try {
		return await Promise.race([
			pending,
			new Promise<never>((_resolve, reject) => {
				aborted = () => reject(signal.reason);
				signal.addEventListener("abort", aborted, { once: true });
			}),
		]);
	} finally {
		if (aborted) signal.removeEventListener("abort", aborted);
	}
}

export async function attachOwnedChatgptBackendRequestAdmission(
	client: ChromeClient,
	governor: ProviderTrafficGovernor,
	options?: { abortSignal?: AbortSignal },
): Promise<{ dispose(): Promise<void> }> {
	const admit = governor.admitBackendRequest?.bind(governor);
	if (!admit || !governor.attribution.targetId)
		throw new Error("Owned backend request admission is unavailable.");
	const hold = await holdCdpCommandAdmission(client, options);
	const namespace = randomUUID();
	const requests = new Map<string, Promise<void>>();
	const pending = new Set<Promise<void>>();
	let closing = false;
	const cancellation = new AbortController();
	const failures: unknown[] = [];
	const failPausedRequest = async (requestId: string, knownNotDispatched: boolean) => {
		try {
			await withCdpCommandTimeout(
				client,
				{
					timeoutMs: 3_000,
					timeoutMessage: "Owned backend request cancellation command timed out.",
				},
				() => client.Fetch.failRequest({ requestId, errorReason: "BlockedByClient" }),
			);
		} catch (error) {
			// Chrome can cancel a paused resource while admission is being drained.
			// Only a proven pre-dispatch request may treat its disappearance as settled.
			if (
				!(
					knownNotDispatched &&
					error instanceof Error &&
					error.message === "Invalid InterceptionId."
				)
			)
				throw error;
		}
	};
	const handler = (event: Protocol.Fetch.RequestPausedEvent): Promise<void> => {
		const existing = requests.get(event.requestId);
		if (existing) return existing;
		const task = hold
			.run("Provider.backendRequest", async () => {
				if (closing) {
					await failPausedRequest(event.requestId, true);
					return;
				}
				const url = new URL(event.request.url);
				if (
					!["https://chatgpt.com", "https://chat.openai.com"].includes(url.origin) ||
					!url.pathname.startsWith("/backend-api/")
				) {
					await client.Fetch.continueRequest({ requestId: event.requestId });
					return;
				}
				const key = `sha256:${createHash("sha256")
					.update(
						JSON.stringify([
							namespace,
							governor.attribution.targetId,
							governor.attribution.tabLeaseId,
							event.requestId,
						]),
					)
					.digest("hex")}`;
				try {
					await admit(
						key,
						async () => {
							await client.Fetch.continueRequest({ requestId: event.requestId });
						},
						cancellation.signal,
						client.Runtime,
					);
				} catch (error) {
					if (!(error instanceof ProviderBackendRequestCancelledBeforeDispatchError))
						failures.push(error);
					await failPausedRequest(
						event.requestId,
						error instanceof ProviderBackendRequestCancelledBeforeDispatchError,
					);
				}
			})
			.catch((error) => {
				failures.push(error);
			});
		requests.set(event.requestId, task);
		pending.add(task);
		void task.then(() => pending.delete(task));
		return task;
	};
	const subscription: unknown = client.Fetch.requestPaused(handler);
	const dispose = async () => {
		closing = true;
		startupWaiters.delete(client);
		cancellation.abort();
		while (pending.size) await Promise.all(pending);
		await withCdpCommandTimeout(
			client,
			{
				timeoutMs: 3_000,
				timeoutMessage: "Owned backend request interception shutdown timed out.",
			},
			() => client.Fetch.disable(),
		);
		while (pending.size) await Promise.all(pending);
		if (typeof subscription === "function") subscription();
		else {
			const remove = (
				client as ChromeClient & {
					removeListener?: (event: string, callback: typeof handler) => void;
				}
			).removeListener;
			if (!remove) throw new Error("Fetch listener cleanup is unavailable.");
			remove.call(client, "Fetch.requestPaused", handler);
		}
		// Keep custody until the guarded transport successfully disconnects.
		if (failures.length === 1) throw failures[0];
		if (failures.length > 1)
			throw new AggregateError(failures, "Owned backend request admission failed.");
	};
	try {
		await client.Fetch.enable({
			patterns: [
				{ urlPattern: "https://chatgpt.com/backend-api/*", requestStage: "Request" },
				{ urlPattern: "https://chat.openai.com/backend-api/*", requestStage: "Request" },
			],
		});
	} catch (error) {
		try {
			await dispose();
		} catch (cleanup) {
			throw new AggregateError([error, cleanup], "Backend request setup and cleanup failed.");
		}
		throw error;
	}
	startupWaiters.set(client, async (ready, signal) => {
		for (;;) {
			signal.throwIfAborted();
			if (closing) throw new Error("Owned backend request startup client is closing.");
			const pageReady = await ready();
			signal.throwIfAborted();
			if (closing) throw new Error("Owned backend request startup client is closing.");
			if (failures.length === 1) throw failures[0];
			if (failures.length > 1)
				throw new AggregateError(failures, "Owned backend request admission failed.");
			if (pageReady && pending.size === 0) return;
			await withStartupAbort(
				pending.size
					? Promise.all([...pending]).then(() => undefined)
					: new Promise<void>((resolve) => setTimeout(resolve, 250)),
				signal,
			);
		}
	});
	return { dispose };
}
