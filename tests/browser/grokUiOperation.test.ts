import { expect, test } from "vitest";
import { closeGrokTransportBeforeShutdown } from "../../src/browser/grokUiOperation.js";
import { OwnedBackendRequestCleanupError } from "../../src/browser/ownedBackendRequestAuthority.js";

test("Grok teardown drains owned transport before browser shutdown", async () => {
	const events: string[] = [];
	await closeGrokTransportBeforeShutdown(
		{
			close: async () => {
				events.push("drain");
				await Promise.resolve();
				events.push("drained");
			},
		},
		async () => {
			events.push("shutdown");
		},
	);
	expect(events).toEqual(["drain", "drained", "shutdown"]);
});
test("uncertain Grok transport cleanup survives process cleanup", async () => {
	const events: string[] = [];
	const error = new OwnedBackendRequestCleanupError(new Error("fixture uncertainty"));
	await expect(
		closeGrokTransportBeforeShutdown(
			{
				close: async () => {
					events.push("drain");
					throw error;
				},
			},
			async () => {
				events.push("shutdown");
			},
		),
	).rejects.toBe(error);
	expect(events).toEqual(["drain", "shutdown"]);
});

test('unknown Grok submission effects stay uncertain in shared operation settlement',async()=>{
 const {createProviderTrafficGovernor}=await import('../../packages/browser-service/src/service/providerTrafficGovernor.js');const {BrowserAutomationError}=await import('../../src/oracle/errors.js');const {runGrokUiOperation}=await import('../../src/browser/grokUiOperation.js');const settlements:unknown[]=[];
 const governor=createProviderTrafficGovernor({attribution:{provider:'grok',runtimeProfileId:'fixture',managedBrowserProfile:'/fixture',targetId:'fixture',workloadId:'fixture',operationId:'fixture',tabLeaseId:'fixture'},interactionGovernor:{beforeInteraction:async()=>undefined},mutationAudit:async()=>undefined,settleInteraction:async value=>{settlements.push(value);}});
 await expect(runGrokUiOperation({governor,runtime:undefined,source:'provider:grok:submit',kind:'in-page-click',effect:async()=>{throw new BrowserAutomationError('unknown submit',{effectState:'unknown'});}})).rejects.toThrow('unknown submit');expect(settlements).toEqual([expect.objectContaining({effectState:'outcome-unknown'})]);
});
