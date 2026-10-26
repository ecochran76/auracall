/** Browser-side bounded observer shared by provider entity readers.
 * The caller passes its exact owned DOM scope; inactive alternates never
 * establish current metadata. No application functions are invoked. */
export const GROK_COMMITTED_REACT_PATH = `
      const committedPath = (seed, button, scopeRoot) => {
        let top = seed; const ascending = new Set();
        for (let depth = 0; top?.return && depth < 512; depth++) {
          if (ascending.has(top)) return null;
          ascending.add(top); top = top.return;
        }
        if (!top || top.return || top.tag !== 3 || !top.stateNode) return null;
        const owner = top.stateNode; const current = owner.current;
        if (!current || current.tag !== 3 || current.stateNode !== owner || current.return) return null;
        const stack = [{fiber:current,path:[]}]; const seen = new Set(); const matches = [];
        let budget = 20000;
        while (stack.length && budget-- > 0) {
          const {fiber,path} = stack.pop();
          if (!fiber || seen.has(fiber) || path.length >= 512) return null;
          seen.add(fiber); const next = [...path,fiber];
          if (fiber.stateNode === button) matches.push(next);
          if (fiber.sibling) stack.push({fiber:fiber.sibling,path});
          if (fiber.child) stack.push({fiber:fiber.child,path:next});
        }
        if (stack.length || matches.length !== 1 || owner.current !== current) return null;
        if (!matches[0].some(fiber => fiber.stateNode === scopeRoot)) return null;
        return {owner,current,path:matches[0].reverse()};
      };
`;
