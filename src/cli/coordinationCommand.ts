import type { Command } from "commander";
import { getAuracallHomeDir } from "../auracallHome.js";
import { resetCoordination } from "../runtime/coordinationReset.js";

export function registerCoordinationCommand(program: Command): void {
	program
		.command("coordination")
		.description("Inspect or reset idle browser coordination state.")
		.command("reset")
		.description("Preview an idle-state reset; --yes archives and applies it.")
		.option("--yes", "Confirm that AuraCall work is idle and apply the reset.", false)
		.option("--json", "Emit the reset result as JSON.", false)
		.action(async (options) => {
			try {
				const result = await resetCoordination({
					homeDir: getAuracallHomeDir(),
					apply: options.yes,
				});
				if (options.json) console.log(JSON.stringify(result, null, 2));
				else {
					console.log(`Coordination reset: ${result.status}`);
					console.log(
						`State: ${result.before.records} interactions, ${result.before.events} events, ${result.before.leases} leases.`,
					);
					console.log(
						`Retained: ${result.retained.records} recent/undated interactions, ${result.retained.warnings} warnings.`,
					);
					if (result.backupPath) console.log(`Backup: ${result.backupPath}`);
					if (result.blockers.length) console.log(`Blocked: ${result.blockers.join(", ")}`);
					if (result.status === "preview")
						console.log(
							"When AuraCall work is idle, apply with: auracall coordination reset --yes",
						);
				}
				if (result.status === "blocked" || result.status === "partial") process.exitCode = 1;
			} catch (error) {
				const message = error instanceof Error ? error.message : "Coordination reset failed.";
				if (options.json) console.log(JSON.stringify({ status: "failed", error: message }));
				else console.error(message);
				process.exitCode = 1;
			}
		});
}
