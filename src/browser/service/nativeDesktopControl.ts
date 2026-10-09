import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { getAuracallHomeDir } from "../../auracallHome.js";
import type { RemoteViewDesktopConfig } from "../types.js";
import { DesktopControlGate } from "./desktopControlGate.js";
import { readyNativeDesktopBrowsers } from "./nativeDesktopClient.js";
import {
	type NativeDesktopBrowser,
	NativeDesktopStore,
	nativeBrowserGeneration,
	nativeDesktopKey,
} from "./nativeDesktopStore.js";
import { RemoteViewApplication, RemoteViewProviderError } from "./remoteViewApplication.js";

const receiptSchema = z.object({
	token: z.string().uuid(),
	browserId: z.string(),
	binding: z.string(),
	issuanceKey: z.string().uuid(),
	routeId: z.string().optional(),
	revoked: z.boolean(),
});
type Receipt = z.infer<typeof receiptSchema>;

export class NativeDesktopControlError extends Error {
  constructor(message: string, readonly claimRetained: boolean) { super(message); this.name = 'NativeDesktopControlError'; }
}

/** Only exact provider revocation permits explicit automation resumption. URLs stay ephemeral. */
export class NativeDesktopControl {
	constructor(
		private readonly options: {
			directory?: string;
			gateDirectory?: string;
			ready?: typeof readyNativeDesktopBrowsers;
		} = {},
	) {}

	private directory(): string {
		return this.options.directory ?? path.join(getAuracallHomeDir(), "native-controls");
	}
	private file(selected: RemoteViewDesktopConfig): string {
		return path.join(this.directory(), `${nativeDesktopKey(selected)}.json`);
	}
	private async read(selected: RemoteViewDesktopConfig): Promise<Receipt | undefined> {
		try {
			return receiptSchema.parse(JSON.parse(await fs.readFile(this.file(selected), "utf8")));
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
			throw error;
		}
	}
	private async write(selected: RemoteViewDesktopConfig, receipt: Receipt): Promise<void> {
		await fs.mkdir(this.directory(), { recursive: true, mode: 0o700 });
		const temporary = path.join(this.directory(), `.${randomUUID()}.tmp`);
		try {
			await fs.writeFile(temporary, JSON.stringify(receipt), { flag: "wx", mode: 0o600 });
			await fs.rename(temporary, this.file(selected));
		} finally {
			await fs.rm(temporary, { force: true });
		}
	}
	private async browser(
		selected: RemoteViewDesktopConfig,
		browserId: string,
	): Promise<NativeDesktopBrowser> {
		const matches = (await (this.options.ready ?? readyNativeDesktopBrowsers)(selected)).filter(
			(item) => item.browserId === browserId,
		);
		if (matches.length !== 1 || !matches[0])
			throw new Error("Select a ready AuraCall-owned native browser.");
		return matches[0];
	}
	private exclusive<T>(selected: RemoteViewDesktopConfig, effect: () => Promise<T>): Promise<T> {
		return new NativeDesktopStore(this.directory()).exclusive(nativeDesktopKey(selected), effect);
	}

	async take(
		selected: RemoteViewDesktopConfig,
		browserId: string,
		token: string,
	): Promise<{ url: string; capability: "control"; token: string }> {
		z.string().uuid().parse(token);
		try { return await this.exclusive(selected, async () => {
			const browser = await this.browser(selected, browserId);
			const binding = nativeBrowserGeneration(browser);
			const gate = new DesktopControlGate(browser.assignment.desktopId, this.options.gateDirectory);
			let receipt = await this.read(selected);
			if (receipt) {
				if (
					receipt.token !== token ||
					receipt.browserId !== browserId ||
					receipt.binding !== binding ||
					receipt.revoked
				) {
					throw new Error(
						"Desktop control is already held; release the retained claim before another takeover.",
					);
				}
				await gate.assertControl(token, binding);
			} else {
				// Persist the caller's recovery identity before a control grant can exist.
				receipt = { token, browserId, binding, issuanceKey: randomUUID(), revoked: false };
				await this.write(selected, receipt);
				try {
					await gate.takeControl(binding, token);
				} catch (error) {
					await fs.rm(this.file(selected));
					throw error;
				}
			}
			const grant = await new RemoteViewApplication(selected).issueEmbed(
				browser.assignment,
				selected,
				"control",
				receipt.issuanceKey,
			);
			await this.write(selected, { ...receipt, routeId: grant.routeId });
			return { url: grant.url, capability: "control" as const, token };
		}); } catch (error) {
      // A definitive rejection must not strand a claim that never belonged to this caller.
      // Unknown receipt state stays retained, including lost issuance replies.
      let claimRetained = true;
      try { claimRetained = (await this.read(selected))?.token === token; } catch { /* fail closed */ }
      throw new NativeDesktopControlError(error instanceof Error ? error.message : 'Desktop control unavailable.', claimRetained);
    }
	}

	async release(
		selected: RemoteViewDesktopConfig,
		browserId: string,
		token: string,
	): Promise<void> {
		return this.exclusive(selected, async () => {
			const browser = await this.browser(selected, browserId);
			const binding = nativeBrowserGeneration(browser);
			let receipt = await this.read(selected);
			if (
				!receipt ||
				receipt.token !== token ||
				receipt.browserId !== browserId ||
				receipt.binding !== binding
			) {
				throw new Error("Desktop control ownership changed; refusing stale release.");
			}
			const gate = new DesktopControlGate(browser.assignment.desktopId, this.options.gateDirectory);
			await gate.assertControl(token, binding);
			const provider = new RemoteViewApplication(selected);
			if (!receipt.revoked) {
				try {
					if (!receipt.routeId) {
						const grant = await provider.issueEmbed(
							browser.assignment,
							selected,
							"control",
							receipt.issuanceKey,
						);
						receipt = { ...receipt, routeId: grant.routeId };
						await this.write(selected, receipt);
					}
					await provider.revokeEmbed(receipt.routeId as string, selected.appOrigin);
				} catch (revokeError) {
					// Replaying the exact durable issuance proves a terminal grant after expiry
					// or an acknowledged-lost revoke. Access denied alone is never that proof.
					try {
						await provider.issueEmbed(browser.assignment, selected, "control", receipt.issuanceKey);
					} catch (error) {
						if (
							error instanceof RemoteViewProviderError &&
							error.code === "consumer_grant_unavailable"
						) {
							receipt = { ...receipt, revoked: true };
						} else throw revokeError;
					}
					if (!receipt.revoked) throw revokeError;
				}
				receipt = { ...receipt, revoked: true };
				await this.write(selected, receipt);
			}
			await gate.releaseControl(token, binding);
			await fs.rm(this.file(selected));
		});
	}
}
