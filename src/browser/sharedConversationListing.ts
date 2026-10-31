import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import fs from "node:fs/promises";
import net, { type Socket } from "node:net";
import path from "node:path";

type SharedInput<T> = {
	root: string;
	key: string;
	signal?: AbortSignal;
	onRole?: (role: "leader" | "follower") => void;
	run: (signal: AbortSignal) => Promise<T>;
};
type Frame = Record<string, unknown>;
const maxFrameBytes = 8 * 1024 * 1024;

function sign(secret: string, value: string): string {
	return createHmac("sha256", secret).update(value).digest("hex");
}
function matches(left: unknown, right: string): boolean {
	return (
		typeof left === "string" &&
		/^[a-f0-9]{64}$/.test(left) &&
		timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"))
	);
}
function send(socket: Socket, frame: Frame): void {
	const data = `${JSON.stringify(frame)}\n`;
	if (Buffer.byteLength(data) > maxFrameBytes)
		throw new Error("Shared listing exceeds the bounded IPC frame size.");
	socket.write(data);
}
function frames(socket: Socket, receive: (frame: Frame) => void): void {
	let pending = "";
	socket.setEncoding("utf8");
	socket.on("data", (chunk: string) => {
		pending += chunk;
		if (Buffer.byteLength(pending) > maxFrameBytes) {
			socket.destroy(new Error("Shared listing IPC frame is too large."));
			return;
		}
		let end = pending.indexOf("\n");
		while (end !== -1) {
			const text = pending.slice(0, end);
			pending = pending.slice(end + 1);
			try {
				receive(JSON.parse(text) as Frame);
			} catch {
				socket.destroy(new Error("Invalid shared listing IPC frame."));
				return;
			}
			end = pending.indexOf("\n");
		}
	});
}
async function credential(root: string): Promise<string> {
	await fs.mkdir(root, { recursive: true, mode: 0o700 });
	const stat = await fs.lstat(root);
	if (!stat.isDirectory() || (stat.mode & 0o077) !== 0 || stat.uid !== process.getuid?.())
		throw new Error("Shared listing directory must be private to the current user.");
	const target = path.join(root, "ipc-secret");
	const temporary = path.join(root, `secret-${randomBytes(12).toString("hex")}`);
	try {
		await fs.writeFile(temporary, randomBytes(32).toString("hex"), { flag: "wx", mode: 0o600 });
		try {
			await fs.link(temporary, target);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
		}
	} finally {
		await fs.rm(temporary, { force: true });
	}
	const info = await fs.lstat(target);
	if (!info.isFile() || (info.mode & 0o077) !== 0 || info.uid !== process.getuid?.())
		throw new Error("Shared listing credential must be private to the current user.");
	const secret = await fs.readFile(target, "utf8");
	if (!/^[a-f0-9]{64}$/.test(secret)) throw new Error("Invalid shared listing credential.");
	return secret;
}
function remoteError(error: unknown): Frame {
	const value = error instanceof Error ? error : new Error("Shared conversation listing failed.");
	const extra = error as {
		code?: unknown;
		blockingSurface?: { kind?: unknown; summary?: unknown };
	} | null;
	return {
		message: value.message.slice(0, 4096),
		code: typeof extra?.code === "string" ? extra.code : undefined,
		blockingSurface: extra?.blockingSurface
			? {
					kind: extra.blockingSurface.kind,
					summary: String(extra.blockingSurface.summary ?? "").slice(0, 160),
				}
			: undefined,
	};
}

/** Linux abstract sockets make election atomic and disappear on owner death.
 * Only overlapping, authenticated subscribers receive results; nothing is cached.
 */
export async function shareConversationListing<T>(input: SharedInput<T>): Promise<T> {
	input.signal?.throwIfAborted();
	if (process.platform !== "linux") return input.run(input.signal ?? new AbortController().signal);
	const root = path.resolve(input.root);
	const secret = await credential(root);
	input.signal?.throwIfAborted();
	const address = `\0auracall-list-${createHash("sha256").update(`${root}\0${input.key}`).digest("hex")}`;
	const controller = new AbortController();
	const subscribers = new Set<Socket>();
	const connections = new Set<Socket>();
	let localActive = true;
	let finished = false;
	let resolveLocal: (value: T) => void = () => {};
	let rejectLocal: (error: unknown) => void = () => {};
	const local = new Promise<T>((resolve, reject) => {
		resolveLocal = resolve;
		rejectLocal = reject;
	});
	// Election losers do not use this promise; keep an internal rejection handler.
	void local.catch(() => {});
	const checkInterest = () => {
		if (!finished && !localActive && subscribers.size === 0)
			controller.abort(new Error("All shared listing callers cancelled."));
	};
	const server = net.createServer((socket) => {
		connections.add(socket);
		const challenge = randomBytes(24).toString("hex");
		let authenticated = false;
		socket.setTimeout(5000, () => socket.destroy());
		socket.on("error", () => {});
		socket.on("close", () => {
			connections.delete(socket);
			subscribers.delete(socket);
			checkInterest();
		});
		frames(socket, (frame) => {
			if (
				authenticated ||
				finished ||
				controller.signal.aborted ||
				typeof frame.nonce !== "string" ||
				!/^[a-f0-9]{48}$/.test(frame.nonce) ||
				!matches(frame.proof, sign(secret, `join:${challenge}:${frame.nonce}`))
			) {
				socket.destroy();
				return;
			}
			authenticated = true;
			socket.setTimeout(0);
			subscribers.add(socket);
			send(socket, { type: "ready", proof: sign(secret, `ready:${challenge}:${frame.nonce}`) });
		});
		send(socket, { type: "challenge", nonce: challenge });
	});
	const elected = await new Promise<boolean>((resolve, reject) => {
		const onError = (error: NodeJS.ErrnoException) => {
			if (error.code === "EADDRINUSE") resolve(false);
			else reject(error);
		};
		server.once("error", onError);
		server.listen(address, () => {
			server.removeListener("error", onError);
			resolve(true);
		});
	});
	if (!elected) {
		server.close();
		return follow<T>(address, secret, input);
	}
	const onAbort = () => {
		if (!localActive || finished) return;
		localActive = false;
		rejectLocal(input.signal?.reason ?? new Error("Shared listing caller cancelled."));
		checkInterest();
	};
	input.signal?.addEventListener("abort", onAbort, { once: true });
	if (input.signal?.aborted) onAbort();
	input.onRole?.("leader");
	void (async () => {
		try {
			controller.signal.throwIfAborted();
			const value = await input.run(controller.signal);
			controller.signal.throwIfAborted();
			// Serialize before publishing to any caller, enforcing the same bounded wire contract.
			const frame = { type: "result", value };
			if (Buffer.byteLength(JSON.stringify(frame)) > maxFrameBytes - 1)
				throw new Error("Shared listing exceeds the bounded IPC frame size.");
			finished = true;
			for (const socket of subscribers) {
				send(socket, frame);
				socket.end();
			}
			if (localActive) resolveLocal(JSON.parse(JSON.stringify(frame)).value as T);
		} catch (error) {
			finished = true;
			for (const socket of subscribers) {
				send(socket, { type: "error", error: remoteError(error) });
				socket.end();
			}
			if (localActive) rejectLocal(error);
		} finally {
			input.signal?.removeEventListener("abort", onAbort);
			server.close();
			for (const socket of connections) if (!subscribers.has(socket)) socket.destroy();
		}
	})();
	return local;
}

function follow<T>(address: string, secret: string, input: SharedInput<T>): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const socket = net.createConnection(address);
		const nonce = randomBytes(24).toString("hex");
		let ready = false;
		let settled = false;
		let challenge = "";
		const finish = (error?: unknown, value?: T) => {
			if (settled) return;
			settled = true;
			input.signal?.removeEventListener("abort", onAbort);
			socket.destroy();
			if (error !== undefined) reject(error);
			else resolve(value as T);
		};
		const onAbort = () =>
			finish(input.signal?.reason ?? new Error("Shared listing caller cancelled."));
		input.signal?.addEventListener("abort", onAbort, { once: true });
		if (input.signal?.aborted) {
			onAbort();
			return;
		}
		socket.setTimeout(5000, () => finish(new Error("Shared listing authentication timed out.")));
		socket.on("error", () =>
			finish(new Error("Shared listing owner transport failed; no provider retry was attempted.")),
		);
		socket.on("close", () =>
			finish(
				new Error(
					"Shared listing owner closed before delivering a result; no provider retry was attempted.",
				),
			),
		);
		frames(socket, (frame) => {
			if (
				!challenge &&
				frame.type === "challenge" &&
				typeof frame.nonce === "string" &&
				/^[a-f0-9]{48}$/.test(frame.nonce)
			) {
				challenge = frame.nonce;
				send(socket, { nonce, proof: sign(secret, `join:${challenge}:${nonce}`) });
			} else if (
				!ready &&
				frame.type === "ready" &&
				matches(frame.proof, sign(secret, `ready:${challenge}:${nonce}`))
			) {
				ready = true;
				socket.setTimeout(0);
				input.onRole?.("follower");
			} else if (ready && frame.type === "result") finish(undefined, frame.value as T);
			else if (ready && frame.type === "error" && frame.error && typeof frame.error === "object") {
				const data = frame.error as Frame;
				finish(
					Object.assign(new Error(String(data.message)), {
						code: data.code,
						blockingSurface: data.blockingSurface,
					}),
				);
			} else finish(new Error("Shared listing authentication/protocol failure."));
		});
	});
}
