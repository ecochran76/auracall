import { z } from "zod";
import type { GrokConnectorRuntime } from "./providers/grokConnectors.js";
export const grokUnknownObservationRequestSchema = z
	.object({
		leaseId: z.string().min(1).max(512),
		expectedRevision: z.number().int().nonnegative(),
		targetId: z.string().regex(/^[A-Za-z0-9-]{1,512}$/),
		scope: z
			.object({
				runtimeProfileId: z.string().min(1),
				managedBrowserProfile: z.string().min(1),
				service: z.literal("grok"),
				tenantKey: z.string().min(1),
			})
			.strict(),
		browserProcessId: z.number().int().positive(),
		browserStartTime: z.string().regex(/^\d+$/),
		expectedProviderAccountRef: z.string().regex(/^[a-f0-9]{64}$/),
		connector: z
			.object({
				name: z.string().min(1).max(100),
				endpoint: z
					.string()
					.url()
					.refine((value) => {
						const url = new URL(value);
						return (
							url.protocol === "https:" &&
							!url.username &&
							!url.password &&
							!url.search &&
							!url.hash &&
							url.href === value
						);
					}, "Canonical HTTPS endpoint required"),
			})
			.strict(),
	})
	.strict();
export type GrokUnknownObservationRequest = z.infer<typeof grokUnknownObservationRequestSchema>;
/** UI categories are observations only. A terminal message without canonical
 * identity cannot attribute the original outcome; this never settles its lease.
 * Category precedence is presentation only: mixed chooser/form controls do not
 * establish an exact active phase. Counts and booleans retain that ambiguity. */
export interface GrokUnknownConnectorObservation {
	status: "observed" | "inconclusive";
	category:
		| "connector-picker"
		| "custom-form"
		| "authentication-required"
		| "connection-failed"
		| "inconclusive";
	effectState: "outcome-unknown";
	leaseId: string;
	leaseRevision: number;
	nameMatches: boolean;
	endpointMatches: boolean;
	customControlCount: number;
	addControlCount: number;
	addEnabled: boolean;
}
const observationSchema = z
	.object({
		status: z.enum(["observed", "inconclusive"]),
		category: z.enum([
			"connector-picker",
			"custom-form",
			"authentication-required",
			"connection-failed",
			"inconclusive",
		]),
		nameMatches: z.boolean(),
		endpointMatches: z.boolean(),
		customControlCount: z.number().int().nonnegative().max(100),
		addControlCount: z.number().int().nonnegative().max(100),
		addEnabled: z.boolean(),
	})
	.strict();
/** Fixed pure DOM observation: no input, navigation, fetch or caller-supplied code. */
export async function readGrokUnknownConnectorObservation(
	runtime: GrokConnectorRuntime,
	request: GrokUnknownObservationRequest,
): Promise<GrokUnknownConnectorObservation> {
	const result = await runtime.evaluate({
		returnByValue: true,
		expression: `(() => {
      const observationKind='grok-unknown-connector-outcome';
      const visible=e=>{
        if(!e)return false;
        for(let n=e;n;n=n.parentElement)
          if(n.getAttribute('aria-hidden')==='true'||(n.getAttribute('role')==='dialog'&&n.getAttribute('data-closed')!==null))return false;
        const style=getComputedStyle(e),rect=e.getBoundingClientRect();
        return style.display!=='none'&&style.visibility!=='hidden'&&rect.width>0&&rect.height>0;
      };
      const label=e=>String(e.innerText||e.textContent||'').trim().replace(/\\s+/g,' ');
      const dialogs=Array.from(document.querySelectorAll('[role="dialog"]')).filter(visible)
        .filter(d=>d.getAttribute('data-analytics-name')==='add-connector-modal');
      const empty={status:'inconclusive',category:'inconclusive',nameMatches:false,endpointMatches:false,customControlCount:0,addControlCount:0,addEnabled:false};
      if(!String(location.href).startsWith('https://grok.com/')||dialogs.length!==1)return empty;
      const root=dialogs[0],text=label(root);
      const controls=Array.from(root.querySelectorAll('button,[role="button"]')).filter(visible);
      const custom=controls.filter(e=>label(e)==='Custom'||label(e)==='Custom Add your own custom connector');
      const add=controls.filter(e=>label(e)==='Add Connector');
      const inputs=Array.from(root.querySelectorAll('input')).filter(visible);
      const names=inputs.filter(e=>e.getAttribute('placeholder')==='My Connector');
      const urls=inputs.filter(e=>e.getAttribute('placeholder')==='https://mcp.example.com/sse');
      const nameMatches=names.length===1&&names[0].value===${JSON.stringify(request.connector.name)};
      const endpointMatches=urls.length===1&&urls[0].value===${JSON.stringify(request.connector.endpoint)};
      let category='inconclusive';
      if(text.includes('Connection failed')&&text.includes('Sorry, there was a problem connecting to this MCP server.'))category='connection-failed';
      else if(nameMatches&&endpointMatches&&/authentication required|authorization required|complete authentication|continue in your browser|sign in to connect/i.test(text))category='authentication-required';
      else if(names.length===1&&urls.length===1)category='custom-form';
      else if(custom.length===1)category='connector-picker';
      return {status:category==='inconclusive'?'inconclusive':'observed',category,nameMatches,endpointMatches,
        customControlCount:custom.length,addControlCount:add.length,addEnabled:add.length===1&&!add[0].disabled&&add[0].getAttribute('aria-disabled')!=='true'};
    })()`,
	});
	if (result.exceptionDetails || !result.result.value)
		throw Error("grok_unknown_observation_dom_failed");
	return {
		...observationSchema.parse(result.result.value),
		effectState: "outcome-unknown",
		leaseId: request.leaseId,
		leaseRevision: request.expectedRevision,
	};
}
