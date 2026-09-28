import { BrowserAutomationClient } from "../browser/client.js";
import type { LibraryFileInventory } from "../browser/libraryFiles.js";
import type { ResolvedUserConfig } from "../config.js";

export async function listChatgptLibraryFilesForCli(
	userConfig: ResolvedUserConfig,
	deps: {
		createClient?: () => Promise<Pick<BrowserAutomationClient, "listLibraryFiles">>;
	} = {},
): Promise<LibraryFileInventory> {
	const client = deps.createClient
		? await deps.createClient()
		: await BrowserAutomationClient.fromConfig(userConfig, { target: "chatgpt" });
	return client.listLibraryFiles();
}

export function formatLibraryFileInventory(inventory: LibraryFileInventory): string {
	const lines = [
		`ChatGPT Library files (${inventory.files.length})`,
		`Observed: ${inventory.observedAt}`,
		`Inventory: ${inventory.complete ? "complete" : `incomplete (${inventory.incompleteReason ?? "unknown reason"})`}`,
	];
	if (inventory.files.length === 0) {
		lines.push("No usable Library files with stable provider IDs were observed.");
	} else {
		for (const file of inventory.files) {
			const metadata = [
				file.mimeType ?? null,
				file.sizeBytes == null ? null : `${file.sizeBytes} bytes`,
			]
				.filter(Boolean)
				.join(", ");
			lines.push(`- ${file.id}  ${file.name}${metadata ? ` (${metadata})` : ""}`);
		}
	}
	return lines.join("\n");
}
