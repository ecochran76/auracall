import { GROK_COMMITTED_REACT_PATH } from "./grokCommittedReact.js";
import type { GrokConnectorRuntime } from "./grokConnectors.js";

export interface GrokComposerConnector {
	id: string;
	name: string;
	enabled: boolean;
}
/** Reads the actual Attach > Connectors menu. A checked label alone is not
 * identity: the exact row must belong to the current committed keyed subtree.
 * This observer neither opens menus nor changes any Connector selection. */
export async function observeGrokComposerConnector(
	runtime: GrokConnectorRuntime,
	expected: { id: string; name: string },
): Promise<GrokComposerConnector | null> {
	const response = await runtime.evaluate({
		returnByValue: true,
		expression: `(() => {
 const expected=${JSON.stringify(expected)};
 if(!expected.id||!expected.name)return null;
 const visible=e=>e&&e.getAttribute('aria-hidden')!=='true'&&getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility!=='hidden'&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0;
 const menus=Array.from(document.querySelectorAll('[role="menu"]')).filter(visible);
 const matches=[];
 for(const menu of menus)for(const row of menu.querySelectorAll('[role="menuitemcheckbox"]'))if(visible(row)&&row.getAttribute('data-testid')==='attach-connector-'+expected.name)matches.push({row,menu});
 if(matches.length!==1)return null;
 const {row,menu}=matches[0];
 const checked=row.getAttribute('aria-checked');if(!['true','false'].includes(checked))return null;
 const keys=Object.keys(row).filter(k=>k.startsWith('__reactFiber'));if(keys.length!==1)return null;
 ${GROK_COMMITTED_REACT_PATH}
 const current=committedPath(row[keys[0]],row,menu);if(!current)return null;
 const keyed=current.path.filter(f=>f.key===expected.id&&f.memoizedProps?.['data-testid']==='attach-connector-'+expected.name&&f.memoizedProps?.role==='menuitemcheckbox');
 if(keyed.length!==1||keyed[0].memoizedProps['aria-checked']!==(checked==='true')||current.owner.current!==current.current)return null;
 return {id:expected.id,name:expected.name,enabled:checked==='true'};
 })()`,
	});
	if (response.exceptionDetails) return null;
	return (response.result.value as GrokComposerConnector | null) ?? null;
}
