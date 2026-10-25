import { expect, it } from "vitest";
import { OwnedBackendRequestCleanupError } from "../../src/browser/ownedBackendRequestAuthority.js";
import { formatChatgptDeveloperAppListFailure } from "../../src/cli/chatgptDeveloperAppsCommand.js";

it("retains sanitized aggregate and cause leaves in app cleanup failure receipts", () => {
	const leaf = Object.assign(new Error("Invalid InterceptionId."), {
		cause: new Error(
			"Request failed https://example.test/callback?code=oauth-private operator@example.test Authorization: Bearer bearer-private",
		),
		request: { password: "object-private" },
	});
	const failure = new OwnedBackendRequestCleanupError(
		new AggregateError(
			[
				new AggregateError(
					[
						leaf,
						new Error(
							'Cookie: session=cookie-private\npassword="password-private" csrf=csrf-private',
						),
					],
					"Owned backend request admission failed.",
				),
			],
			"Provider observer cleanup failed.",
		),
	);
	const output = formatChatgptDeveloperAppListFailure(failure);
	const receipt = JSON.parse(output);
	expect(receipt).toMatchObject({
		status: "failed",
		cleanup: "unknown",
		diagnostics: {
			message: "Provider observer cleanup failed.",
			errors: [
				{
					message: "Owned backend request admission failed.",
					errors: [
						{ message: "Invalid InterceptionId.", cause: { name: "Error" } },
						{ name: "Error" },
					],
				},
			],
		},
	});
	expect(output).not.toMatch(
		/oauth-private|operator@example|bearer-private|cookie-private|password-private|csrf-private|object-private/,
	);
	expect(leaf.message).toBe("Invalid InterceptionId.");
});

it.each([
	["test", true],
	["test", false],
	["refresh-tools", true],
	["list", true],
] as const)("reports nested cleanup failures from the actual apps %s action; json=%s", async (requestedAction, json) => {
	const { readFileSync } = await import("node:fs");
	const { default: ts } = await import("typescript");
	const source = readFileSync("bin/auracall.ts", "utf8");
	const ast = ts.createSourceFile("auracall.ts", source, ts.ScriptTarget.Latest, true);
	const fn = ast.statements.find(
		(s) => ts.isFunctionDeclaration(s) && s.name?.text === "runChatgptDeveloperAppsCliAction",
	);
	if (!fn) throw new Error("CLI action function not found");
	const compiled = ts.transpile(fn.getText(ast), { target: ts.ScriptTarget.ES2022 });
	const output: string[] = [];
	const errors: string[] = [];
	const trace: string[] = [];
	const process = { exitCode: 0, cwd: () => "/fixture", env: {} };
	const failure = new OwnedBackendRequestCleanupError(
		new AggregateError([new Error("Invalid InterceptionId.")], "Provider observer cleanup failed."),
	);
	const action = new Function(
		"deps",
		`const {path,program,resolveConfig,getAuracallHomeDir,resolveManagedProfileDirForUserConfig,createFileBackedBrowserOperationDispatcher,runChatgptDeveloperAppOperationForCli,formatChatgptDeveloperAppListFailure,formatBrowserOperationBusyResult,exitAfterCompletedBrowserUtilityCommand,process,console}=deps;${compiled};return runChatgptDeveloperAppsCliAction;`,
	)({
		path: { join: () => "/fixture" },
		program: { opts: () => ({ json }) },
		resolveConfig: async () => ({}),
		getAuracallHomeDir: () => "/fixture",
		resolveManagedProfileDirForUserConfig: () => "/fixture/browser",
		createFileBackedBrowserOperationDispatcher: () => ({
			acquireQueued: async () => ({
				acquired: true,
				release: async () => {
					trace.push("released");
				},
			}),
		}),
		runChatgptDeveloperAppOperationForCli: async () => {
			throw failure;
		},
		formatChatgptDeveloperAppListFailure,
		formatBrowserOperationBusyResult: () => "busy",
		exitAfterCompletedBrowserUtilityCommand: async () => {
			trace.push("exited");
		},
		process,
		console: {
			log: (value: string) => output.push(value),
			error: (value: string) => errors.push(value),
		},
	});
	await expect(
		action({ opts: () => ({}) }, () => ({ action: requestedAction })),
	).resolves.toBeUndefined();
	expect(process.exitCode).toBe(1);
	expect(trace).toEqual(["released", "exited"]);
	const receipt = JSON.parse((json ? output : errors)[0]);
	expect(json ? errors : output).toEqual([]);
	expect(receipt).toMatchObject({
		action: requestedAction,
		status: requestedAction === "refresh-tools" ? "unconfirmed" : "failed",
		cleanup: "unknown",
		diagnostics: { errors: [{ message: "Invalid InterceptionId." }] },
	});
	if (requestedAction !== "list") expect(receipt.retrySafe).toBe(false);
});

it("bounds cyclic and oversized errors and omits unsafe metadata", () => {
	const error = Object.assign(
		new AggregateError(
			Array.from({ length: 100 }, () => new Error("x".repeat(50000))),
			"cleanup",
		),
		{
			stage: { token: "metadata-private" },
			timeoutMs: { cookie: "metadata-private" },
			code: { password: "metadata-private" },
		},
	);
	error.cause = error;
	const output = formatChatgptDeveloperAppListFailure(error);
	expect(output).not.toContain("metadata-private");
	expect(output.length).toBeLessThan(25000);
	expect(JSON.parse(output).diagnostics).toMatchObject({
		truncated: true,
		cause: { truncated: true },
	});
});

it("redacts quoted credential fields as well as header syntax", () => {
	const output = formatChatgptDeveloperAppListFailure(
		new Error(
			'HTTP failure {"Cookie":"short-cookie","Authorization":"Bearer short-auth","apiKey":"short-key","refresh_token":"short-refresh"}',
		),
	);
	expect(output).not.toMatch(/short-cookie|short-auth|short-key|short-refresh/);
	expect(output).toContain("HTTP failure");
});
