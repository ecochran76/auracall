import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import type { Client } from "chrome-remote-interface";
import CDP from "chrome-remote-interface";
import {
	buildChatgptToolApprovalProbeExpressionForTest,
	type ChatgptToolApprovalObservation,
	createChatgptToolApprovalHandler,
} from "../src/browser/actions/chatgptToolApproval.js";
import type { BrowserLogger, ChatgptToolApprovalPolicy } from "../src/browser/types.js";
import { enforceRawDevToolsEscapeHatchForCli } from "./raw-devtools-guard.js";

enforceRawDevToolsEscapeHatchForCli();

type Options = {
	host: string;
	port: number;
	urlContains: string;
	policy: Exclude<ChatgptToolApprovalPolicy, "manual">;
	expectedFingerprintContains: string | null;
	activate: boolean;
	output: string | null;
	waitMs: number;
};

type ApprovalProbe = {
	status: "none" | "ambiguous" | "approval-required";
	count?: number;
	fingerprint?: string;
	actionLabel?: "Allow once" | "Always allow";
	surfaceId?: string;
	controlId?: string;
	x?: number;
	y?: number;
	control?: Record<string, unknown>;
};

function readValue(argv: string[], flag: string): string | null {
	const index = argv.indexOf(flag);
	if (index < 0) return null;
	const value = argv[index + 1];
	if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value.`);
	return value;
}

function parseOptions(argv: string[]): Options {
	const portValue = readValue(argv, "--port");
	const urlContains = readValue(argv, "--url-contains");
	const policyValue = readValue(argv, "--policy") ?? "allow-once";
	const activate = argv.includes("--activate");
	const output = readValue(argv, "--output");
	const expectedFingerprintContains = readValue(argv, "--expected-fingerprint-contains");
	const waitValue = readValue(argv, "--wait-ms") ?? "0";
	if (!portValue || !/^\d+$/.test(portValue)) throw new Error("--port must be an integer.");
	if (!/^\d+$/.test(waitValue) || Number(waitValue) > 60_000) {
		throw new Error("--wait-ms must be an integer between 0 and 60000.");
	}
	if (!urlContains) throw new Error("--url-contains is required.");
	if (policyValue !== "allow-once" && policyValue !== "always-allow") {
		throw new Error("--policy must be allow-once or always-allow.");
	}
	if (activate && (!output || !expectedFingerprintContains)) {
		throw new Error(
			"--activate requires --output and --expected-fingerprint-contains for an exact recorded action.",
		);
	}
	return {
		host: readValue(argv, "--host") ?? "127.0.0.1",
		port: Number(portValue),
		urlContains,
		policy: policyValue,
		expectedFingerprintContains,
		activate,
		output,
		waitMs: Number(waitValue),
	};
}

function digest(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

function sanitizeProbe(probe: ApprovalProbe, expected: string | null) {
	const fingerprint = probe.fingerprint ?? "";
	return {
		status: probe.status,
		count: probe.count,
		actionLabel: probe.actionLabel,
		surfaceId: probe.surfaceId,
		controlId: probe.controlId,
		x: probe.x,
		y: probe.y,
		control: probe.control,
		fingerprintLength: fingerprint.length,
		fingerprintSha256: fingerprint ? digest(fingerprint) : null,
		expectedFingerprintMatched: expected ? fingerprint.includes(expected.toLowerCase()) : null,
	};
}

async function writeReceipt(
	output: string | null,
	receipt: Record<string, unknown>,
): Promise<void> {
	const serialized = `${JSON.stringify(receipt, null, 2)}\n`;
	if (!output) {
		process.stdout.write(serialized);
		return;
	}
	await fs.writeFile(output, serialized, { mode: 0o600 });
	await fs.chmod(output, 0o600);
	process.stdout.write(`${output}\n`);
}

async function main(): Promise<void> {
	const options = parseOptions(process.argv.slice(2));
	const startedAt = new Date().toISOString();
	const targets = (await CDP.List({ host: options.host, port: options.port })).filter(
		(target) => target.type === "page" && target.url.includes(options.urlContains),
	);
	if (targets.length !== 1) {
		throw new Error(
			`Expected one page target containing ${JSON.stringify(options.urlContains)}, found ${targets.length}.`,
		);
	}
	const target = targets[0];
	const client = (await CDP({
		host: options.host,
		port: options.port,
		target: target.id,
	})) as Client;
	const observations: ChatgptToolApprovalObservation[] = [];
	const log: string[] = [];
	const logger = ((message: string) => log.push(message)) as BrowserLogger;
	logger.verbose = false;
	try {
		await client.Runtime.enable();
		await client.Page.enable();
		const waitStartedAt = Date.now();
		let probeAttempts = 0;
		let initial: ApprovalProbe = { status: "none" };
		let continuePolling = true;
		while (continuePolling) {
			probeAttempts += 1;
			const initialResult = await client.Runtime.evaluate({
				expression: buildChatgptToolApprovalProbeExpressionForTest(options.policy),
				returnByValue: true,
			});
			initial = (initialResult.result.value ?? { status: "none" }) as ApprovalProbe;
			continuePolling = initial.status === "none" && Date.now() - waitStartedAt < options.waitMs;
			if (continuePolling) await new Promise((resolve) => setTimeout(resolve, 100));
		}
		const waitElapsedMs = Date.now() - waitStartedAt;
		const initialSanitized = sanitizeProbe(initial, options.expectedFingerprintContains);
		if (!options.activate) {
			await writeReceipt(options.output, {
				schema: "auracall.chatgpt-tool-approval-cdp-observation.v1",
				startedAt,
				finishedAt: new Date().toISOString(),
				mode: "observe",
				endpoint: { host: options.host, port: options.port },
				target: { id: target.id, url: target.url },
				wait: { requestedMs: options.waitMs, elapsedMs: waitElapsedMs, probeAttempts },
				initial: initialSanitized,
			});
			return;
		}
		if (
			initial.status !== "approval-required" ||
			initialSanitized.expectedFingerprintMatched !== true
		) {
			throw new Error(
				"The exact expected approval fingerprint is not uniquely visible; no action taken.",
			);
		}
		const handle = createChatgptToolApprovalHandler({
			client,
			policy: options.policy,
			logger,
			onObservation: (observation) => observations.push(observation),
		});
		let outcome: Awaited<ReturnType<ReturnType<typeof createChatgptToolApprovalHandler>>> | null =
			null;
		let failure: { name: string; message: string } | null = null;
		try {
			outcome = await handle();
		} catch (error) {
			failure = {
				name: error instanceof Error ? error.name : "Error",
				message: error instanceof Error ? error.message : String(error),
			};
		}
		const eventResult = initial.controlId
			? await client.Runtime.evaluate({
					expression: `(() => {
              const state = globalThis.__auracallChatgptToolApprovalIdentityV1;
              const receipt = state?.events instanceof Map ? state.events.get(${JSON.stringify(initial.controlId)}) : null;
              return receipt ? {
                counts: { ...receipt.counts },
                trustedCounts: { ...receipt.trustedCounts },
                lastType: receipt.lastType,
                lastTrusted: receipt.lastTrusted,
              } : null;
            })()`,
					returnByValue: true,
				})
			: null;
		await writeReceipt(options.output, {
			schema: "auracall.chatgpt-tool-approval-cdp-observation.v1",
			startedAt,
			finishedAt: new Date().toISOString(),
			mode: "activate",
			endpoint: { host: options.host, port: options.port },
			target: { id: target.id, url: target.url },
			wait: { requestedMs: options.waitMs, elapsedMs: waitElapsedMs, probeAttempts },
			policy: options.policy,
			initial: initialSanitized,
			observations,
			outcome:
				outcome?.status === "approved"
					? {
							...outcome,
							fingerprint: undefined,
							fingerprintSha256: digest(outcome.fingerprint),
						}
					: outcome,
			failure,
			eventReceipt: eventResult?.result.value ?? null,
			log,
		});
		if (failure) throw new Error(failure.message);
	} finally {
		await client.close();
	}
}

void main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});
