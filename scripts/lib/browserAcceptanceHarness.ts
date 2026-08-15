import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const oracleNoBannerEnvironmentName = "ORACLE_NO_BANNER";
const nodeNoWarningsEnvironmentName = "NODE_NO_WARNINGS";

export type AcceptanceCommandExpectation = "success" | "failure" | "any";

export interface AcceptanceCommandOptions {
	timeoutMs?: number;
	expect?: AcceptanceCommandExpectation;
	log?: boolean;
}

export interface AcceptanceCommandResult {
	status: number | null;
	stdout: string;
	stderr: string;
	combined: string;
}

export interface AcceptanceRunState<Summary extends object> {
	version: 1;
	updatedAt: string;
	lastError: string | null;
	summary: Summary;
}

export interface AcceptanceResume<Summary extends object> {
	path: string;
	state: AcceptanceRunState<Summary>;
}

interface AcceptanceSpawnResult {
	error?: Error;
	status: number | null;
	stdout?: string | null;
	stderr?: string | null;
}

interface AcceptanceSpawnOptions {
	cwd: string;
	encoding: "utf8";
	timeout: number;
	maxBuffer: number;
	env: NodeJS.ProcessEnv;
}

export interface BrowserAcceptanceHarnessDeps {
	spawn?: (
		command: string,
		args: string[],
		options: AcceptanceSpawnOptions,
	) => AcceptanceSpawnResult;
	readTextFile?: (filePath: string) => Promise<string>;
	ensureDir?: (directoryPath: string) => Promise<void>;
	writeTextFile?: (filePath: string, content: string) => Promise<void>;
	now?: () => Date;
}

function resolveAcceptancePath(rootDir: string, filePath: string): string {
	const trimmed = filePath.trim();
	return path.isAbsolute(trimmed) ? trimmed : path.resolve(rootDir, trimmed);
}

export async function readAcceptanceResume<Summary extends object>(
	rootDir: string,
	resumeFile: string | null | undefined,
	deps: BrowserAcceptanceHarnessDeps = {},
): Promise<AcceptanceResume<Summary> | null> {
	if (!resumeFile?.trim()) return null;
	const resolved = resolveAcceptancePath(rootDir, resumeFile);
	try {
		const raw = await (deps.readTextFile ?? ((filePath) => readFile(filePath, "utf8")))(resolved);
		const parsed = JSON.parse(raw) as Partial<AcceptanceRunState<Summary>>;
		if (!parsed || parsed.version !== 1 || !parsed.summary || typeof parsed.summary !== "object") {
			return null;
		}
		return {
			path: resolved,
			state: {
				version: 1,
				updatedAt:
					typeof parsed.updatedAt === "string"
						? parsed.updatedAt
						: (deps.now ?? (() => new Date()))().toISOString(),
				lastError: typeof parsed.lastError === "string" ? parsed.lastError : null,
				summary: parsed.summary,
			},
		};
	} catch {
		return null;
	}
}

export function parseAcceptanceJson<T>(label: string, text: string): T {
	const trimmed = text.trim();
	if (!trimmed) throw new Error(`${label} returned empty output.`);
	try {
		return JSON.parse(trimmed) as T;
	} catch (error) {
		throw new Error(
			`${label} did not return valid JSON.\n${trimmed}\n${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

export function createBrowserAcceptanceHarness<Summary extends object>(input: {
	rootDir: string;
	profile?: string | null;
	commandTimeoutMs: number;
	stateFile?: string | null;
	log(message: string): void;
	deps?: BrowserAcceptanceHarnessDeps;
}) {
	const spawn =
		input.deps?.spawn ??
		((command: string, args: string[], options: AcceptanceSpawnOptions) =>
			spawnSync(command, args, options));
	const now = input.deps?.now ?? (() => new Date());
	const statePath = input.stateFile?.trim()
		? resolveAcceptancePath(input.rootDir, input.stateFile)
		: null;
	const ensureDir = input.deps?.ensureDir ?? (async (directoryPath: string) => void (await mkdir(directoryPath, { recursive: true })));
	const writeTextFile =
		input.deps?.writeTextFile ??
		(async (filePath: string, content: string) => void (await writeFile(filePath, content, "utf8")));
	const checkpoint = async (summary: Summary, error?: unknown): Promise<void> => {
		if (!statePath) return;
		await ensureDir(path.dirname(statePath));
		const lastError = error == null ? null : error instanceof Error ? error.message : String(error);
		const state: AcceptanceRunState<Summary> = {
			version: 1,
			updatedAt: now().toISOString(),
			lastError,
			summary,
		};
		await writeTextFile(statePath, `${JSON.stringify(state, null, 2)}\n`);
	};

	return {
		run(extraArgs: readonly string[], options: AcceptanceCommandOptions = {}): AcceptanceCommandResult {
			const cliArgs = ["tsx", "bin/auracall.ts"];
			if (input.profile) cliArgs.push("--profile", input.profile);
			cliArgs.push(...extraArgs);
			const command = ["pnpm", ...cliArgs].join(" ");
			if (options.log !== false) input.log(`$ ${command}`);
			const result = spawn("pnpm", cliArgs, {
				cwd: input.rootDir,
				encoding: "utf8",
				timeout: options.timeoutMs ?? input.commandTimeoutMs,
				maxBuffer: 20 * 1024 * 1024,
				env: {
					...process.env,
					[oracleNoBannerEnvironmentName]: "1",
					[nodeNoWarningsEnvironmentName]: "1",
				},
			});
			if (result.error) throw result.error;
			const stdout = result.stdout ?? "";
			const stderr = result.stderr ?? "";
			const combined = [stdout, stderr].filter(Boolean).join("\n").trim();
			const expectation = options.expect ?? "success";
			if (expectation === "failure" && result.status === 0) {
				throw new Error(`Expected failure but command succeeded: ${command}`);
			}
			if (expectation === "success" && result.status !== 0) {
				throw new Error(`Command failed (${result.status}): ${command}\n${combined}`);
			}
			return {
				status: result.status,
				stdout,
				stderr,
				combined,
			};
		},

		parseJson<T>(label: string, text: string): T {
			return parseAcceptanceJson<T>(label, text);
		},

		checkpoint,

		async finalize(summary: Summary, error?: unknown) {
			await checkpoint(summary, error);
			return {
				summary,
				json: JSON.stringify(summary, null, 2),
				errorMessage:
					error == null ? null : error instanceof Error ? error.message : String(error),
				statePath,
			};
		},
	};
}
