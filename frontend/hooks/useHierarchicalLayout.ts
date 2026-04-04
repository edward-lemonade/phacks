import dagre from "dagre";
import { useEffect } from "react";
import type { Edge } from "@xyflow/react";
import { useReactFlow } from "@xyflow/react";

import type { ArgumentFlowNode, EdgeData } from "@/lib/types";

/** Matches ArgumentNode visual width */
const NODE_W = 180;
/** Approximate height: type line + label + padding + border */
const NODE_H = 92;

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

		nodes.forEach((n) => {
			g.setNode(n.id, { width: NODE_W, height: NODE_H });
		});

		edges.forEach((e) => {
			g.setEdge(e.target, e.source);
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
