import { describe, expect, test, vi } from "vitest";
import {
	formatLibraryFileInventory,
	listChatgptLibraryFilesForCli,
} from "../src/cli/libraryFilesCommand.js";

describe("library-files CLI", () => {
	test("lists bounded provider identities through the dedicated Library surface", async () => {
		const listLibraryFiles = vi.fn(async () => ({
			provider: "chatgpt" as const,
			complete: true,
			observedAt: "2026-09-27T12:00:00.000Z",
			files: [{ id: "file_packet", name: "Packet.pdf", provider: "chatgpt" as const }],
		}));
		const inventory = await listChatgptLibraryFilesForCli({} as never, {
			createClient: async () => ({ listLibraryFiles }),
		});

		expect(listLibraryFiles).toHaveBeenCalledOnce();
		expect(formatLibraryFileInventory(inventory)).toContain("- file_packet  Packet.pdf");
	});
});
