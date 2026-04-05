import type { Edge } from "@xyflow/react";

import type { ArgumentFlowNode, EdgeData } from "@/lib/types";
import { normalizeStrengthLabel } from "@/lib/strengthLabel";
import type { StrengthLabel } from "@/lib/strengthLabel";

/** Relations from a child that count as attacking the parent (child → parent). */
export const ATTACK_RELATIONS: ReadonlySet<string> = new Set(["contradicts"]);

// —— Predicates (tweak these rules) ——

/** Strength labels that pressure a parent when unaddressed. */
export function isThreateningContradictionStrength(s: StrengthLabel): boolean {
	return s === "true" || s === "strong";
}

/** Strength labels that count as “handled” / low threat from sub-structure. */
export function isLowThreatStrength(s: StrengthLabel): boolean {
	return s === "weak" || s === "fallacious" || s === "false";
}

/**
 * An attacking node is “rebuked” when it has at least one child in the graph
 * whose strength is low-threat (sub-claims under the attack weaken it).
 */
export function attackNodeIsRebukedInGraph(
	attackerId: string,
	nodesById: Map<string, { strength: unknown }>,
	childrenOf: (parentId: string) => string[]
): boolean {
	const kids = childrenOf(attackerId);
	if (kids.length === 0) return false;
	return kids.some((cid) => {
		const n = nodesById.get(cid);
		if (!n) return false;
		return isLowThreatStrength(normalizeStrengthLabel(n.strength));
	});
}

/** True if this edge from child → parent should participate in attack logic. */
export function edgeIsAttackOnParent(e: Edge<EdgeData>): boolean {
	const r = String(e.data?.relation ?? "");
	return ATTACK_RELATIONS.has(r);
}

/**
 * Parent should be pulled toward weak if any attacker is threatening and not rebuked.
 * Applies to all node types (thesis, evidence, counterclaim, …) uniformly.
 */
export function shouldDowngradeParentDueToContradictions(
	parentId: string,
	edges: Edge<EdgeData>[],
	strengths: Map<string, StrengthLabel>,
	nodesById: Map<string, { strength: unknown }>,
	childrenOf: (parentId: string) => string[]
): boolean {
	for (const e of edges) {
		if (e.target !== parentId) continue;
		if (!edgeIsAttackOnParent(e)) continue;
		const sid = e.source;
		const s = strengths.get(sid) ?? normalizeStrengthLabel(nodesById.get(sid)?.strength);
		if (!isThreateningContradictionStrength(s)) continue;
		if (attackNodeIsRebukedInGraph(sid, nodesById, childrenOf)) continue;
		return true;
	}
	return false;
}

/**
 * Parent can move from weak → strong when every attacking edge is either
 * non-threatening, or a threatening attacker is rebuked in the graph.
 */
export function shouldUpgradeParentAfterRebukes(
	parentId: string,
	edges: Edge<EdgeData>[],
	strengths: Map<string, StrengthLabel>,
	nodesById: Map<string, { strength: unknown }>,
	childrenOf: (parentId: string) => string[]
): boolean {
	const attacks = edges.filter(
		(e) => e.target === parentId && edgeIsAttackOnParent(e)
	);
	if (attacks.length === 0) return false;
	return attacks.every((e) => {
		const sid = e.source;
		const s = strengths.get(sid) ?? normalizeStrengthLabel(nodesById.get(sid)?.strength);
		if (!isThreateningContradictionStrength(s)) return true;
		return attackNodeIsRebukedInGraph(sid, nodesById, childrenOf);
	});
}

function findRootNodeIds(
	nodes: ArgumentFlowNode[],
	edges: Edge<EdgeData>[]
): string[] {
	const targets = new Set(edges.map((e) => e.target));
	return nodes.map((n) => n.id).filter((id) => !targets.has(id));
}

function depthFromRoots(
	rootIds: string[],
	childrenOf: (id: string) => string[]
): Map<string, number> {
	const depth = new Map<string, number>();
	const q = [...rootIds];
	for (const r of rootIds) depth.set(r, 0);
	while (q.length) {
		const p = q.shift()!;
		const d = depth.get(p) ?? 0;
		for (const c of childrenOf(p)) {
			if (!depth.has(c)) {
				depth.set(c, d + 1);
				q.push(c);
			}
		}
	}
	return depth;
}

/**
 * Recompute strengths bottom-up (leaves → roots). Returns a new nodes array only if
 * some strength changed; otherwise returns the input reference.
 */
export function propagateArgumentStrengths(
	nodes: ArgumentFlowNode[],
	edges: Edge<EdgeData>[]
): ArgumentFlowNode[] {
	if (nodes.length === 0) return nodes;

	const nodesById = new Map(nodes.map((n) => [n.id, n.data]));
	const childrenByParent = new Map<string, string[]>();
	for (const e of edges) {
		const list = childrenByParent.get(e.target) ?? [];
		list.push(e.source);
		childrenByParent.set(e.target, list);
	}
	const childrenOf = (parentId: string) => childrenByParent.get(parentId) ?? [];

	const roots = findRootNodeIds(nodes, edges);
	const rootList = roots.length > 0 ? roots : [nodes[0].id];

	const depthMap = depthFromRoots(rootList, childrenOf);
	for (const n of nodes) {
		if (!depthMap.has(n.id)) depthMap.set(n.id, 0);
	}
	const order = [...nodes]
		.map((n) => n.id)
		.sort((a, b) => (depthMap.get(b) ?? 0) - (depthMap.get(a) ?? 0));

	const strengths = new Map<string, StrengthLabel>();
	for (const n of nodes) {
		strengths.set(n.id, normalizeStrengthLabel(n.data.strength));
	}

	for (const id of order) {
		const cur = strengths.get(id) ?? "weak";
		let next = cur;

		const down = shouldDowngradeParentDueToContradictions(
			id,
			edges,
			strengths,
			nodesById,
			childrenOf
		);
		const up = shouldUpgradeParentAfterRebukes(
			id,
			edges,
			strengths,
			nodesById,
			childrenOf
		);

		if (down && (cur === "strong" || cur === "true")) {
			next = "weak";
		} else if (!down && up && cur === "weak") {
			next = "strong";
		}

		strengths.set(id, next);
	}

	let changed = false;
	const out = nodes.map((n) => {
		const s = strengths.get(n.id) ?? normalizeStrengthLabel(n.data.strength);
		if (s !== n.data.strength) {
			changed = true;
			return {
				...n,
				data: { ...n.data, strength: s },
			};
		}
		return n;
	});

	return changed ? out : nodes;
}
