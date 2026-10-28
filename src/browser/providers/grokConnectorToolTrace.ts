import { GROK_COMMITTED_REACT_PATH } from "./grokCommittedReact.js";
import type { GrokConnectorRuntime } from "./grokConnectors.js";

export interface GrokConnectorToolTrace {
	status: "observed";
	scope: "current-retained-response";
	conversationId: string;
	responseId: string;
	calls: {
		cardId: string;
		connectorId: string;
		toolName: string;
		arguments: unknown;
		result: unknown;
	}[];
	otherTools: string[];
}
/** Native tool cards are evidence; assistant prose and reasoning text are not.
 * Reads only the selected response's committed owner and settled MCP cards. */
export async function readGrokConnectorToolTrace(
	runtime: GrokConnectorRuntime,
	expected: { responseId: string; connector: { id: string; name: string } },
): Promise<GrokConnectorToolTrace | null> {
	const reply = await runtime.evaluate({
		returnByValue: true,
		expression: `(()=>{
 const expected=${JSON.stringify(expected)};
 if(location.origin!=='https://grok.com')return null;
 const visible=e=>e&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0&&getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility!=='hidden';
 const rows=Array.from(document.querySelectorAll('[id^="response-"]')).filter(e=>e.id===expected.responseId&&visible(e));if(rows.length!==1)return null;
 const row=rows[0],keys=Object.keys(row).filter(k=>k.startsWith('__reactFiber'));if(keys.length!==1)return null;
 ${GROK_COMMITTED_REACT_PATH}
 const current=committedPath(row[keys[0]],row,document.body);if(!current)return null;
 const owners=current.path.map(f=>f.memoizedProps).filter(p=>p?.response&&p.selectedId===p.response.responseId&&'response-'+p.response.responseId===row.id);
 if(!owners.length||owners.some(p=>p.response!==owners[0].response))return null;
 const r=owners[0].response;
 if(r.sender!=='assistant'||r.state!=='closed'||r.partial!==false||typeof r.conversationId!=='string'||!r.conversationId||location.pathname!=='/c/'+r.conversationId||!Array.isArray(r.traceSteps)||r.traceSteps.length>1000)return null;
 const calls=[],otherTools=[],seen=new Set();
 let bytes=0;
 for(const step of r.traceSteps){
  if(step?.type!=='tool')continue;
  if(!Array.isArray(step.cards)||step.cards.length>100)return null;
  for(const card of step.cards){
   if(!card||typeof card.toolUsageCardId!=='string'||!card.toolUsageCardId||seen.has(card.toolUsageCardId)||r.toolSettledByCardId?.[card.toolUsageCardId]!==true)return null;
   seen.add(card.toolUsageCardId);if(seen.size>1000)return null;
   const others=Object.keys(card).filter(k=>!['mcp','toolUsageCardId','intent'].includes(k)&&card[k]!=null);
   for(const key of others)if(!otherTools.includes(key))otherTools.push(key);
   if(!card.mcp){if(!others.length)return null;continue;}
   const m=card.mcp;
   if(m.connectorId!==expected.connector.id||m.connectorName!==expected.connector.name||typeof m.toolName!=='string'||!m.toolName||typeof m.toolArgsJson!=='string'||typeof m.toolResultJson!=='string')return null;
   bytes+=m.toolArgsJson.length+m.toolResultJson.length;if(bytes>2000000)return null;
   let args,result;try{args=JSON.parse(m.toolArgsJson);result=JSON.parse(m.toolResultJson);}catch{return null;}
   if(!result||typeof result!=='object'||typeof result.isError!=='boolean')return null;
   calls.push({cardId:card.toolUsageCardId,connectorId:m.connectorId,toolName:m.toolName,arguments:args,result});
  }
 }
 if(!calls.length||current.owner.current!==current.current)return null;
 return {status:'observed',scope:'current-retained-response',conversationId:r.conversationId,responseId:row.id,calls,otherTools};
 })()`,
	});
	if (reply.exceptionDetails) return null;
	return (reply.result.value as GrokConnectorToolTrace | null) ?? null;
}
