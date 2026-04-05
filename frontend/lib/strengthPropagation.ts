import type { Edge } from "@xyflow/react";

import type { ArgumentFlowNode, EdgeData } from "@/lib/types";
import { normalizeStrengthLabel } from "@/lib/strengthLabel";
import type { StrengthLabel } from "@/lib/strengthLabel";

// ─── Strength enum ────────────────────────────────────────────────────────────

export enum Strength {
	False      = 0,
	Fallacious = 1,
	Weak       = 2,
	Strong     = 3,
	True       = 4,
}

/** Map from the string labels used elsewhere in the app to the enum. */
const LABEL_TO_STRENGTH: Record<string, Strength> = {
	false:      Strength.False,
	fallacious: Strength.Fallacious,
	weak:       Strength.Weak,
	strong:     Strength.Strong,
	true:       Strength.True,
};

const STRENGTH_TO_LABEL: Record<Strength, StrengthLabel> = {
	[Strength.False]:      "false",
	[Strength.Fallacious]: "fallacious",
	[Strength.Weak]:       "weak",
	[Strength.Strong]:     "strong",
	[Strength.True]:       "true",
};

function toEnum(s: StrengthLabel | string | unknown): Strength {
	return LABEL_TO_STRENGTH[String(s).toLowerCase()] ?? Strength.Weak;
}

function toLabel(s: Strength): StrengthLabel {
	return STRENGTH_TO_LABEL[s];
}

// ─── Strength predicates ──────────────────────────────────────────────────────

/** A supporting child actively helps the parent. */
export function isActiveSupport(s: Strength): boolean {
	return s >= Strength.Strong;           // Strong or True
}

/** A supporting child is present but not compelling. */
export function isPassiveSupport(s: Strength): boolean {
	return s === Strength.Weak;
}

/** A contradicting child is a real threat to the parent. */
export function isThreateningAttack(s: Strength): boolean {
	return s >= Strength.Strong;           // Strong or True
}

/** A contradicting child is too weak to damage the parent. */
export function isNeutralizedAttack(s: Strength): boolean {
	return s <= Strength.Fallacious;       // False or Fallacious
}

/** The node's own asserted strength is reliable independent of structure. */
export function isAxiomaticallyTrue(s: Strength): boolean {
	return s === Strength.True;
}

/** The node has been conclusively refuted regardless of support. */
export function isConclusivelFalse(s: Strength): boolean {
	return s === Strength.False;
}

// ─── Inflow helpers ───────────────────────────────────────────────────────────

interface Inflow {
	relation: "supports" | "contradicts" | string;
	strength: Strength;
}

/**
 * Derive the computed strength of a node given its own asserted strength
 * and the already-resolved strengths of every child that targets it.
 *
 * Rules (evaluated in priority order):
 *
 * 1. No inflows → keep the node's own asserted strength unchanged.
 * 2. Any threatening, un-neutralized attack → clamp to Weak at most.
 *    (A True node attacked by a Strong counterclaim drops to Weak.)
 * 3. At least one active supporting child and no threatening attacks → Strong.
 * 4. All attacking children are neutralized and there are supporting children
 *    → upgrade one step toward the node's own asserted strength (max Strong).
 * 5. Only passive (Weak) support, no attacks → keep the node's own strength.
 * 6. Fallback → keep the node's own asserted strength.
 */
export function computeStrength(
	ownStrength: Strength,
	inflows: Inflow[]
): Strength {
	if (inflows.length === 0) return ownStrength;

	const supports = inflows.filter((i) => i.relation === "supports");
	const attacks  = inflows.filter((i) => i.relation === "contradicts");

	// Summarise the support side.
	const bestSupport: Strength = supports.length > 0
		? (Math.max(...supports.map((i) => i.strength)) as Strength)
		: Strength.False;
	const hasActiveSupport = supports.some((i) => isActiveSupport(i.strength));
	const hasAnySupport    = supports.length > 0;

	// Summarise the attack side.
	const bestAttack: Strength = attacks.length > 0
		? (Math.max(...attacks.map((i) => i.strength)) as Strength)
		: Strength.False;
	const hasAnyAttack          = attacks.length > 0;
	const hasThreateningAttack  = attacks.some((i) => isThreateningAttack(i.strength));
	const allAttacksNeutralized = hasAnyAttack && attacks.every((i) => isNeutralizedAttack(i.strength));
	const hasLiveAttack         = hasAnyAttack && !allAttacksNeutralized;

	// ── No attacks present ───────────────────────────────────────────────────
	if (!hasAnyAttack) {
		if (!hasAnySupport)   return ownStrength;     // no inflows (safety net)
		if (hasActiveSupport) return Strength.Strong; // strong/true child → Strong
		                      return Strength.Weak;   // only weak/fallacious support → Weak
	}

	// ── No support present ───────────────────────────────────────────────────
	if (!hasAnySupport) {
		if (!hasThreateningAttack) return ownStrength;          // weak/fallacious attacks → no effect
		if (bestAttack >= Strength.True)   return Strength.False; // conclusive refutation
		                                   return Strength.Weak;  // strong attack → floor Weak
	}

	// ── Both attacks and supports present ────────────────────────────────────
	if (allAttacksNeutralized) {
		// Every attacker is False or Fallacious — support wins uncontested.
		if (hasActiveSupport) return Strength.Strong;
		                      return Strength.Weak;
	}

	if (hasLiveAttack && hasThreateningAttack) {
		// Live threatening attack present.
		if (hasActiveSupport && bestSupport > bestAttack) {
			// Support outweighs attack — hold at Weak rather than collapsing further.
			return Strength.Weak;
		}
		// Attack dominates or ties.
		if (bestAttack >= Strength.True) return Strength.False;
		                                 return Strength.Weak;
	}

	if (hasLiveAttack && !hasThreateningAttack) {
		// Live but non-threatening attacks (Weak contradictions) — support can carry.
		if (hasActiveSupport) return Strength.Strong;
		                      return Strength.Weak;
	}

	// Exhaustive — unreachable.
	return ownStrength;
}

// ─── Graph traversal ──────────────────────────────────────────────────────────

/**
 * Recompute strengths bottom-up (leaves → roots) by recursively resolving each
 * node from the strengths of its children before evaluating the node itself.
 *
 * Returns a new nodes array only when at least one strength changed; otherwise
 * returns the original reference so React can skip re-renders.
 */
export function propagateArgumentStrengths(
	nodes: ArgumentFlowNode[],
	edges: Edge<EdgeData>[]
): ArgumentFlowNode[] {
	if (nodes.length === 0) return nodes;

	// Build adjacency: parent → children (children are edge sources)
	const childrenByParent = new Map<string, string[]>();
	for (const e of edges) {
		const list = childrenByParent.get(e.target) ?? [];
		list.push(e.source);
		childrenByParent.set(e.target, list);
	}

	// Build edge lookup: child id → { relation, target }
	const edgesBySource = new Map<string, { relation: string; target: string }[]>();
	for (const e of edges) {
		const list = edgesBySource.get(e.source) ?? [];
		list.push({ relation: String(e.data?.relation ?? ""), target: e.target });
		edgesBySource.set(e.source, list);
	}

	const ownStrengthOf = new Map<string, Strength>(
		nodes.map((n) => [n.id, toEnum(n.data.strength)])
	);

	// Memoised recursive resolver — each node is computed exactly once.
	const resolved = new Map<string, Strength>();

	function resolve(id: string): Strength {
		if (resolved.has(id)) return resolved.get(id)!;

		// Prevent infinite loops in cycles by seeding with own strength first.
		resolved.set(id, ownStrengthOf.get(id) ?? Strength.Weak);

		const children = childrenByParent.get(id) ?? [];
		const inflows: Inflow[] = children.map((cid) => {
			// Find the edge that connects this child to this parent.
			const edgeInfo = (edgesBySource.get(cid) ?? []).find(
				(e) => e.target === id
			);
			return {
				relation: edgeInfo?.relation ?? "supports",
				strength: resolve(cid),
			};
		});

		const computed = computeStrength(
			ownStrengthOf.get(id) ?? Strength.Weak,
			inflows
		);
		resolved.set(id, computed);
		return computed;
	}

	for (const n of nodes) resolve(n.id);

	// Apply results — return original ref if nothing changed.
	let changed = false;
	const out = nodes.map((n) => {
		const next = toLabel(resolved.get(n.id) ?? toEnum(n.data.strength));
		if (next === n.data.strength) return n;
		changed = true;
		return { ...n, data: { ...n.data, strength: next } };
	});

	return changed ? out : nodes;
}