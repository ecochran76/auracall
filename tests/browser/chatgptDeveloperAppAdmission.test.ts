import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test, vi } from "vitest";
import CDP, { setCdpCommandAdmissionResolver } from "../../packages/browser-service/src/guardedCdp.js";
import { DesktopControlGate } from "../../src/browser/service/desktopControlGate.js";
import { createChatgptDeveloperAppBrowserAdapter } from "../../src/browser/providers/chatgptDeveloperApps.js";

const wire = vi.hoisted(() => ({ commands: [] as string[] }));
vi.mock("chrome-remote-interface", () => ({ default: vi.fn(async () => {
 const client = {
  send: async (command: string) => { wire.commands.push(command); if (command === "Runtime.evaluate") throw new Error("inventory reached"); return {}; },
  Runtime: { enable: async () => client.send("Runtime.enable"), evaluate: async () => client.send("Runtime.evaluate") },
  Page: { enable: async () => client.send("Page.enable") },
  close: async () => undefined,
 };
 return client;
}) }));

test("developer-app attachment waits for transient display contention within its stage deadline", async () => {
 wire.commands.length = 0;
 const directory = await fs.mkdtemp(path.join(os.tmpdir(), "auracall-app-admission-"));
 const gate = new DesktopControlGate("fixture", directory);
 const held = await gate.holdAutomation("generation");
 setCdpCommandAdmissionResolver(async () => ({ run: (_command, effect, options) => gate.withAutomation("generation", effect, options) }));
 const client = await CDP({ host: "127.0.0.1", port: 45015 });
 const adapter = createChatgptDeveloperAppBrowserAdapter({
  userConfig: {} as never, getUserIdentity: async () => null,
  connectDevTools: async () => ({ client: client as never, port: 45015 }),
 }, async () => { throw new Error("unexpected browser creation"); });
 const release = setTimeout(() => { void held.close(); }, 3500);
 try {
  await expect(adapter.readState()).rejects.toThrow("inventory reached");
  expect(wire.commands.slice(0, 2)).toEqual(["Runtime.enable", "Page.enable"]);
 } finally {
  clearTimeout(release); await held.close(); await adapter.close();
  setCdpCommandAdmissionResolver(undefined);
  await fs.rm(directory, { recursive: true, force: true });
 }
}, 10000);

test.each(["caller", "stage"])("%s cancellation stops attachment before wire dispatch and preserves owner custody", async mode => {
 wire.commands.length = 0;
 const directory = await fs.mkdtemp(path.join(os.tmpdir(), "auracall-app-cancel-"));
 const gate = new DesktopControlGate("fixture", directory);
 const held = await gate.holdAutomation("generation");
 const cancellation = new AbortController();
 setCdpCommandAdmissionResolver(async () => ({ run: (_command, effect, options) => gate.withAutomation("generation", effect, options) }));
 const client = await CDP({ host: "127.0.0.1", port: 45015 });
 const adapter = createChatgptDeveloperAppBrowserAdapter({
  userConfig: {} as never, getUserIdentity: async () => null,
  connectDevTools: async () => ({ client: client as never, port: 45015 }),
 }, async () => { throw new Error("unexpected browser creation"); },
 { abortSignal: cancellation.signal });
 const abort = mode === "caller" ? setTimeout(() => cancellation.abort(new Error("caller cancelled")), 100) : undefined;
 try {
  await expect(adapter.readState()).rejects.toThrow(mode === "caller" ? "caller cancelled" : "timed out after 10000ms");
  expect(wire.commands).toEqual([]);
  await expect(held.run(async () => true)).resolves.toBe(true);
  await held.close();
  // Queue cleanup must not dispatch a command after cancellation/release.
  await gate.withAutomation("generation", async () => undefined);
  expect(wire.commands).toEqual([]);
 } finally {
  clearTimeout(abort); await held.close(); await adapter.close();
  setCdpCommandAdmissionResolver(undefined);
  await fs.rm(directory, { recursive: true, force: true });
 }
}, 15000);
