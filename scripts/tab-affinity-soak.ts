import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getAuracallHomeDir } from "../src/auracallHome.js";
import {
	createTabAffinitySoakEvent,
	type TabAffinitySoakEvent,
	type TabAffinitySoakIdentity,
} from "../src/browser/tabAffinitySoak.js";
import type { BrowserTabConcurrencyStatus } from "../src/browser/tabConcurrencyRuntime.js";

async function main(): Promise<void> {
	const [action, ...args] = process.argv.slice(2);
	if (!action || !["start", "snapshot", "finish"].includes(action)) {
		throw new Error(
			"Usage: tab-affinity-soak <start|snapshot|finish> --port <port> [--receipt-id <id>] --runtime-profile <id> --expected-identity <identity> --source-commit <sha> --installed-version <version>",
		);
	}
	const options = parseArgs(args);
	const port = Number(options.port);
	if (!Number.isInteger(port) || port <= 0) throw new Error("--port must be a positive integer");
	const identity: TabAffinitySoakIdentity = {
		runtimeProfileId: requireOption(options, "runtime-profile"),
		expectedIdentity: requireOption(options, "expected-identity"),
		sourceCommit: requireOption(options, "source-commit"),
		installedVersion: requireOption(options, "installed-version"),
	};
	const receiptId = options["receipt-id"] ?? randomUUID();
	const receiptPath = path.join(getAuracallHomeDir(), "soaks", `tab-affinity-${receiptId}.jsonl`);
	const existing = await readEvents(receiptPath);
	if (action === "start" && existing.length > 0)
		throw new Error(`Receipt already exists: ${receiptPath}`);
	if (action !== "start" && existing.length === 0)
		throw new Error(`Receipt not found: ${receiptPath}`);
	if (existing[0] && JSON.stringify(existing[0].identity) !== JSON.stringify(identity)) {
		throw new Error("Receipt identity differs from the supplied soak identity");
	}
	const status = await readStatus(port);
	const observedAt = new Date().toISOString();
	const first = existing[0];
	const startedAt = first?.observedAt ?? observedAt;
	const baseline = first?.snapshot ?? status;
	const event = createTabAffinitySoakEvent({
		receiptId,
		type: action === "start" ? "started" : action === "finish" ? "finished" : "snapshot",
		identity,
		startedAt,
		baseline,
		snapshot: { observedAt, status },
	});
	if (existing.some((candidate) => !candidate.evaluation.accepted)) {
		event.evaluation.accepted = false;
		if (!event.evaluation.hardStops.includes("prior-hard-stop")) {
			event.evaluation.hardStops.push("prior-hard-stop");
		}
	}
	await fs.mkdir(path.dirname(receiptPath), { recursive: true });
	await fs.appendFile(receiptPath, `${JSON.stringify(event)}\n`, { encoding: "utf8", mode: 0o600 });
	process.stdout.write(`${JSON.stringify({ receiptPath, event }, null, 2)}\n`);
	if (!event.evaluation.accepted) process.exitCode = 2;
}

async function readStatus(port: number): Promise<BrowserTabConcurrencyStatus> {
	const response = await fetch(`http://127.0.0.1:${port}/status`);
	if (!response.ok) throw new Error(`Status returned HTTP ${response.status}`);
	const payload = (await response.json()) as { tabConcurrency?: BrowserTabConcurrencyStatus };
	if (!payload.tabConcurrency) throw new Error("Status omitted tabConcurrency");
	return payload.tabConcurrency;
}

async function readEvents(receiptPath: string): Promise<TabAffinitySoakEvent[]> {
	try {
		const text = await fs.readFile(receiptPath, "utf8");
		return text
			.split("\n")
			.filter(Boolean)
			.map((line) => JSON.parse(line) as TabAffinitySoakEvent);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
		throw error;
	}
}

function parseArgs(args: string[]): Record<string, string> {
	const options: Record<string, string> = {};
	for (let index = 0; index < args.length; index += 2) {
		const key = args[index];
		const value = args[index + 1];
		if (!key?.startsWith("--") || value == null)
			throw new Error(`Invalid argument near ${key ?? "end"}`);
		options[key.slice(2)] = value;
	}
	return options;
}

function requireOption(options: Record<string, string>, key: string): string {
	const value = options[key]?.trim();
	if (!value) throw new Error(`--${key} is required`);
	return value;
}

await main();
