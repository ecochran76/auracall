import type { SelectorList } from './types.js';

export function buildSelectorArrayLiteral(selectors: SelectorList): string {
  return JSON.stringify(selectors);
}

export function buildFindFirstSelectorExpression(selectorsLiteral: string, varName = 'selectors'): string {
  return `(() => {
    const ${varName} = ${selectorsLiteral};
    return ${varName}.map((selector) => document.querySelector(selector)).find(Boolean) ?? null;
  })()`;
}

export function buildFindAllSelectorsExpression(selectorsLiteral: string, varName = 'selectors'): string {
  return `(() => {
    const ${varName} = ${selectorsLiteral};
    return ${varName}.flatMap((selector) => Array.from(document.querySelectorAll(selector)));
  })()`;
}
