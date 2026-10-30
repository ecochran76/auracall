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
      const box=e=>{const r=e.getBoundingClientRect(),left=r.left??r.x??0,top=r.top??r.y??0;return {left,top,right:r.right??left+r.width,bottom:r.bottom??top+r.height,width:r.width,height:r.height};};
      const clips=value=>/hidden|clip|scroll|auto/.test(String(value||''));
      const visible=e=>{
        if(!e)return false;
        const rect=box(e),width=Number(window.innerWidth),height=Number(window.innerHeight);
        if(!(rect.width>0&&rect.height>0&&Number.isFinite(width)&&Number.isFinite(height)&&width>0&&height>0))return false;
        if(rect.left<0||rect.top<0||rect.right>width||rect.bottom>height)return false;
        for(let node=e;node;node=node.parentElement){
          const style=getComputedStyle(node),opacity=Number.parseFloat(style.opacity);
          if(node.getAttribute('aria-hidden')==='true'||(node.getAttribute('role')==='dialog'&&node.getAttribute('data-closed')!==null)||style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse'||(Number.isFinite(opacity)&&opacity<=0))return false;
          if(node!==e){const bounds=box(node);
            if(clips(style.overflowX??style.overflow)&&(rect.left<bounds.left||rect.right>bounds.right))return false;
            if(clips(style.overflowY??style.overflow)&&(rect.top<bounds.top||rect.bottom>bounds.bottom))return false;
          }
        }
        return true;
      };
      const label=e=>String(e.innerText||e.textContent||'').trim().replace(/\\s+/g,' ');
      const dialogs=Array.from(document.querySelectorAll('[role="dialog"]')).filter(visible)
        .filter(d=>d.getAttribute('data-analytics-name')==='add-connector-modal');
      const empty={status:'inconclusive',category:'inconclusive',nameMatches:false,endpointMatches:false,customControlCount:0,addControlCount:0,addEnabled:false};
      if(!String(location.href).startsWith('https://grok.com/')||dialogs.length!==1)return empty;
      const root=dialogs[0];
      const controls=Array.from(root.querySelectorAll('button,[role="button"]')).filter(visible);
      const custom=controls.filter(e=>label(e)==='Custom'||label(e)==='Custom Add your own custom connector');
      const add=controls.filter(e=>label(e)==='Add Connector');
      const inputs=Array.from(root.querySelectorAll('input')).filter(visible);
      const names=inputs.filter(e=>e.getAttribute('placeholder')==='My Connector');
      const urls=inputs.filter(e=>e.getAttribute('placeholder')==='https://mcp.example.com/sse');
      const nameMatches=names.length===1&&names[0].value===${JSON.stringify(request.connector.name)};
      const endpointMatches=urls.length===1&&urls[0].value===${JSON.stringify(request.connector.endpoint)};
      // Only rendered leaf anchors qualify terminal text. Whole-panel labels
      // include inactive carousel content and cannot establish the visible phase.
      const anchors=Array.from(root.querySelectorAll('div,span,p,h1,h2,h3,h4,h5,h6,strong,b,em,[role="heading"],[role="alert"]'))
        .filter(node=>node.children.length===0&&visible(node)).map(label);
      const failureHeading=anchors.includes('Connection failed');
      const failureMessage=anchors.includes('Sorry, there was a problem connecting to this MCP server.');
      const back=controls.filter(node=>label(node)==='Go Back');
      const terminalVisible=failureHeading||failureMessage||back.length>0;
      let category='inconclusive';
      if(terminalVisible){
        if(failureHeading&&failureMessage&&back.length===1&&custom.length===0&&names.length===0&&urls.length===0)category='connection-failed';
      }else if(nameMatches&&endpointMatches&&custom.length===0&&anchors.some(text=>/authentication required|authorization required|complete authentication|continue in your browser|sign in to connect/i.test(text)))category='authentication-required';
      else if(names.length===1&&urls.length===1&&custom.length===0)category='custom-form';
      else if(custom.length===1&&names.length===0&&urls.length===0)category='connector-picker';
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
