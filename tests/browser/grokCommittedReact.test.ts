import { runInNewContext } from "node:vm";
import { expect, test } from "vitest";
import { GROK_COMMITTED_REACT_PATH } from "../../src/browser/providers/grokCommittedReact.js";

interface Fiber {
	tag: number;
	stateNode?: unknown;
	return: Fiber | null;
	child?: Fiber;
	sibling?: Fiber;
}
function portal(depth: number) {
	const host = {};
	const owner: { current: Fiber | null } = { current: null };
	const root: Fiber = { tag: 3, stateNode: owner, return: null };
	owner.current = root;
	let parent = root;
	for (let i = 0; i < depth; i++) {
		const next: Fiber = { tag: i === 200 ? 4 : 0, return: parent };
		parent.child = next;
		parent = next;
	}
	const leaf: Fiber = { tag: 5, stateNode: host, return: parent };
	parent.child = leaf;
	return { host, owner, root, leaf };
}
function observe(tree: ReturnType<typeof portal>) {
	return runInNewContext(
		`(() => {${GROK_COMMITTED_REACT_PATH};return committedPath(seed,host,host)})()`,
		{ seed: tree.leaf, host: tree.host },
	);
}
test("qualifies a deep current portal despite an unrelated deep sibling", () => {
	// Native r20: Attach ancestry222 already found its unique host, but a
	// later branch reached depth256; Recent portal ancestry exceeded256.
	const tree = portal(300);
	const sibling = portal(400);
	if (!tree.root.child) throw new Error("fixture child required");
	tree.root.child.sibling = sibling.root.child;
	if (sibling.root.child) sibling.root.child.return = tree.root;
	expect(observe(tree)).toMatchObject({ owner: tree.owner, current: tree.root });
});
test.each([
	"ancestry",
	"topology",
	"node-budget",
] as const)("fails closed on %s exhaustion", (kind) => {
	const tree = portal(kind === "ancestry" ? 513 : 10);
	if (!tree.root.child) throw new Error("fixture child required");
	if (kind === "topology") {
		tree.root.child.sibling = portal(513).root.child;
		if (tree.root.child.sibling) tree.root.child.sibling.return = tree.root;
	}
	if (kind === "node-budget") {
		let previous = tree.root.child;
		for (let i = 0; i < 20001; i++) {
			const next: Fiber = { tag: 0, return: tree.root };
			previous.sibling = next;
			previous = next;
		}
	}
	expect(observe(tree)).toBeNull();
});
