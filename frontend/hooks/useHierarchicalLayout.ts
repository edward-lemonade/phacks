import dagre from "dagre";
import { useEffect } from "react";
import type { Edge } from "@xyflow/react";
import { useReactFlow } from "@xyflow/react";

import type { ArgumentFlowNode, EdgeData } from "@/lib/types";

/** Matches ArgumentNode visual width */
const NODE_W = 180;
/** Approximate height: type line + label + padding + border */
const NODE_H = 92;

function isCounterishNodeType(type: string): boolean {
	return (
		type === "counterclaim" ||
		type === "rebuttal" ||
		type === "fallacy"
	);
}

/**
 * Dagre TB: setEdge(upper, lower) places `upper` above `lower`.
 * Default API: child → parent as source → target → setEdge(target, source).
 * Contradicts edges are often reversed by the model; force the counter below the claim.
 */
function dagreUpperLower(
	e: Edge<EdgeData>,
	nodeById: Map<string, ArgumentFlowNode>
): [string, string] {
	const rel = String(e.data?.relation ?? "");
	const sMeta = nodeById.get(e.source);
	const tMeta = nodeById.get(e.target);
	const sType = sMeta?.data?.type ?? "";
	const tType = tMeta?.data?.type ?? "";

	if (rel === "contradicts") {
		if (sType === "thesis" && tType !== "thesis") {
			return [e.source, e.target];
		}
		if (tType === "thesis" && sType !== "thesis") {
			return [e.target, e.source];
		}
		if (isCounterishNodeType(sType) && !isCounterishNodeType(tType)) {
			return [e.target, e.source];
		}
		if (isCounterishNodeType(tType) && !isCounterishNodeType(sType)) {
			return [e.source, e.target];
		}
	}

	return [e.target, e.source];
}

/**
 * Top-down layout. API edges are child → parent (source supports target);
 * Dagre uses parent → child so the parent ranks above the child.
 */
export function useHierarchicalLayout(
	nodes: ArgumentFlowNode[],
	edges: Edge<EdgeData>[]
) {
	const { setNodes } = useReactFlow();

	useEffect(() => {
		if (!nodes.length) return;

		const g = new dagre.graphlib.Graph();
		g.setDefaultEdgeLabel(() => ({}));
		g.setGraph({
			rankdir: "TB",
			nodesep: 56,
			ranksep: 88,
			marginx: 48,
			marginy: 48,
		});

		const nodeById = new Map(nodes.map((n) => [n.id, n]));

		nodes.forEach((n) => {
			g.setNode(n.id, { width: NODE_W, height: NODE_H });
		});

		edges.forEach((e) => {
			const [upper, lower] = dagreUpperLower(e, nodeById);
			g.setEdge(upper, lower);
		});

		dagre.layout(g);

		setNodes((prev) =>
			prev.map((n) => {
				const pos = g.node(n.id);
				if (!pos || typeof pos.x !== "number" || typeof pos.y !== "number") {
					return n;
				}
				return {
					...n,
					position: {
						x: pos.x - NODE_W / 2,
						y: pos.y - NODE_H / 2,
					},
				};
			})
		);
	}, [nodes.length, edges.length, setNodes]);
}
