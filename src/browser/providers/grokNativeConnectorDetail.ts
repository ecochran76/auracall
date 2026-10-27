import { createHash } from "node:crypto";
import type {
	GrokConnectorDetail,
	GrokConnectorRuntime,
	GrokConnectorSelector,
} from "./grokConnectors.js";

/** Exact-ID metadata reads only. Uses the observed personal MCP protocol, never tool execution. */
export async function readGrokNativeConnectorDetail(
	runtime: GrokConnectorRuntime,
	selector: GrokConnectorSelector,
	providerUserId: string,
	abortSignal?: AbortSignal,
): Promise<GrokConnectorDetail> {
	const failure = (): GrokConnectorDetail => ({
		providerAccountRef: null,
		status: "incomplete",
		connector: null,
		endpoint: null,
		endpointRef: null,
		auth: "unknown",
		accountRef: null,
		tools: [],
		coverage: { scope: "detail", complete: false, reason: "native-detail-not-qualified" },
		code: "grok_connector_native_detail_not_qualified",
	});
	abortSignal?.throwIfAborted();
	const result = await runtime.evaluate({
		returnByValue: true,
		awaitPromise: true,
		expression: `(async()=>{
 const selection=${JSON.stringify(selector)}, actor=${JSON.stringify(providerUserId)};
 if(location.origin !== 'https://grok.com') return null;
 const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),10000);
 const post=async(path,body)=>{
 const response=await fetch(path,{method:'POST',credentials:'include',redirect:'error',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:controller.signal});
 if(!response.ok) throw new Error('metadata-read-failed');
 const text=await response.text(); if(text.length>2000000) throw new Error('metadata-limit'); return JSON.parse(text);
 };
 try {
 const scope='CONNECTOR_SCOPE_USER';
 const {connector:c}=await post('/rest/connectors/get',{id:selection.id,scope,scopeId:actor});
 const config=c?.connectorConfig?.mcpConfig;
 if(!c || c.connectorId!==selection.id || c.scope!==scope || c.scopeId!==actor || c.connectorType!=='CONNECTOR_TYPE_MCP' || config?.isEnabled!==true || (config.requiresOauth!==false && c.hasValidOauthTokens!==true) || typeof c.name!=='string' || !c.name || (selection.name && selection.name!==c.name)) return null;
 const url=new URL(config.serverUrl);
 if(url.protocol!=='https:' || url.username || url.password || url.search || url.hash || !/^\\/(mcp|sse)\\/?$/.test(url.pathname) || (selection.endpoint && selection.endpoint!==config.serverUrl)) return null;
 const data=await post('/rest/mcp/discovered-tools/list',{scopeId:actor,connectorIds:[selection.id],scope});
 if(!Array.isArray(data.mcpTools) || data.mcpTools.length>1000 || !Array.isArray(data.connectorIdsNeedingReauth) || data.connectorIdsNeedingReauth.length || !Array.isArray(data.connectorsNeedingReauth) || data.connectorsNeedingReauth.length) return null;
 const tools=[];
 for(const tool of data.mcpTools){
 const name=tool.remoteName || tool.name;
 if(tool.connectorId!==selection.id || tool.serverUrl!==config.serverUrl || tool.isBlocked!==false || typeof name!=='string' || !/^[a-zA-Z0-9_.:-]{1,200}$/.test(name) || tools.includes(name)) return null;
 tools.push(name);
 }
 return {id:c.connectorId,name:c.name,endpoint:config.serverUrl,tools};
 } catch { return null; } finally {clearTimeout(timer);}
 })()`,
	});
	abortSignal?.throwIfAborted();
	const value = result.result.value as {
		id: string;
		name: string;
		endpoint: string;
		tools: string[];
	} | null;
	if (result.exceptionDetails || !value) return failure();
	return {
		providerAccountRef: null,
		status: "complete",
		connector: { id: value.id, name: value.name, kind: "installed" },
		endpoint: value.endpoint,
		endpointRef: createHash("sha256").update(value.endpoint).digest("hex"),
		auth: "connected",
		accountRef: null,
		tools: value.tools,
		coverage: { scope: "detail", complete: true, reason: "native-selected-tools-observed" },
		code: "grok_connector_native_detail_observed",
	};
}
