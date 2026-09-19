"use strict";
/**
 * The accessibility snapshot the agent reads a page through.
 *
 * Two things went wrong with the old one, and both were found the hard
 * way: the founder's agent clicked a restaurant card on DoorDash and
 * said the page never loaded.
 *
 *  1. It took the first 2,000 nodes of the raw tree and dropped the rest
 *     without saying so. A shopping page has far more than that, so the
 *     agent saw the top of the page and nothing below it — and a card
 *     further down did not exist for it.
 *  2. Most of those 2,000 were unnamed containers: `generic` wrappers
 *     with no text, no value and no description, which carry nothing the
 *     agent can act on and cost a token each.
 *
 * So this prunes the wrappers (their children move up a level), caps the
 * nodes it *emits* rather than the nodes it *reads*, and when it does cut
 * the tree it says how much it cut, so the agent knows to narrow down
 * with `wait_for` or `evaluate_script` rather than concluding the thing
 * is not on the page.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_SNAPSHOT_NODE_CAP = void 0;
exports.buildAccessibilitySnapshot = buildAccessibilitySnapshot;
exports.describeSnapshot = describeSnapshot;
/** The default cap on emitted nodes. Roughly 100k characters of JSON at worst. */
exports.DEFAULT_SNAPSHOT_NODE_CAP = 4_000;
/**
 * Roles that say nothing on their own. A node with one of these, no name,
 * no value and no description is a wrapper: it is dropped and its
 * children take its place.
 */
const WRAPPER_ROLES = new Set([
    'generic', 'none', 'presentation', 'GenericContainer', 'InlineTextBox', 'LineBreak',
    'Ignored', 'LayoutTable', 'LayoutTableRow', 'LayoutTableCell',
]);
const toScalar = (value) => {
    if (value === null || value === undefined)
        return undefined;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
        return value;
    return String(value);
};
function buildAccessibilitySnapshot(rawNodes, options) {
    const cap = options.cap ?? exports.DEFAULT_SNAPSHOT_NODE_CAP;
    const nodes = rawNodes.filter(node => !node.ignored);
    const nodeById = new Map(nodes.map(node => [node.nodeId, node]));
    const refs = new Map();
    // The full pruned tree first, so the cut can be reported honestly.
    const isWrapper = (node) => {
        const role = toScalar(node.role?.value);
        const named = toScalar(node.name?.value) !== undefined && String(toScalar(node.name?.value)) !== '';
        const valued = toScalar(node.value?.value) !== undefined;
        const described = toScalar(node.description?.value) !== undefined && String(toScalar(node.description?.value)) !== '';
        return !named && !valued && !described && (role === undefined || WRAPPER_ROLES.has(String(role)));
    };
    const prune = (node, ancestors) => {
        if (ancestors.has(node.nodeId))
            return [];
        const next = new Set(ancestors).add(node.nodeId);
        const children = (node.childIds ?? [])
            .map(childId => nodeById.get(childId))
            .filter((child) => Boolean(child))
            .flatMap(child => prune(child, next));
        return isWrapper(node) ? children : [{ node, children }];
    };
    const roots = nodes
        .filter(node => !node.parentId || !nodeById.has(node.parentId))
        .flatMap(node => prune(node, new Set()));
    const count = (list) => list.reduce((sum, one) => sum + 1 + count(one.children), 0);
    const total = count(roots);
    // Emit in document order until the cap, then stop.
    let shown = 0;
    const emit = (pruned) => {
        if (shown >= cap)
            return null;
        shown += 1;
        const { node } = pruned;
        const ref = `ax-${options.pageId}-${node.nodeId}`;
        if (typeof node.backendDOMNodeId === 'number')
            refs.set(ref, node.backendDOMNodeId);
        const role = toScalar(node.role?.value);
        const name = toScalar(node.name?.value);
        const value = toScalar(node.value?.value);
        const description = toScalar(node.description?.value);
        const children = pruned.children
            .map(emit)
            .filter((child) => Boolean(child));
        return {
            ...(typeof node.backendDOMNodeId === 'number' ? { id: ref } : {}),
            ...(role !== undefined ? { role: String(role) } : {}),
            ...(name !== undefined ? { name: String(name) } : {}),
            ...(value !== undefined ? { value } : {}),
            ...(description !== undefined ? { description: String(description) } : {}),
            ...(children.length > 0 ? { children } : {}),
        };
    };
    const emitted = roots.map(emit).filter((node) => Boolean(node));
    const snapshot = emitted.length === 1
        ? emitted[0]
        : { role: 'RootWebArea', name: options.title, children: emitted };
    return { snapshot, refs, shown, dropped: Math.max(0, total - shown) };
}
/** The sentence that goes with a snapshot, saying whether it is whole. */
function describeSnapshot(build, prefix = 'Accessibility snapshot captured.') {
    if (build.dropped === 0)
        return prefix;
    return `${prefix} The page is larger than this: ${build.shown} nodes shown, ${build.dropped} further down not shown. `
        + 'If what you expect is not here, use wait_for with its text, scroll, or evaluate_script — do not conclude it is absent.';
}
//# sourceMappingURL=agentBrowserSnapshot.js.map