import type { Edge } from "@xyflow/react";
import type {
	ArgumentFlowNode,
	ArgumentNodeData,
	EdgeData,
	GraphData,
} from "@/lib/types";
import { graphNodeToArgumentData } from "@/lib/graphNodeData";

type XY = { x: number; y: number };

/**
 * Remap fragment node ids to avoid collisions; place new nodes near the parent.
 */
export function mergeFragmentNearParent(
	parentPosition: XY,
	fragment: GraphData,
	onNodeClick: (data: ArgumentNodeData) => void
): { nodes: ArgumentFlowNode[]; edges: Edge<EdgeData>[] } {
	const prefix = `exp-${Date.now()}`;
	const idMap = new Map<string, string>();
	fragment.nodes.forEach((n, i) => {
		idMap.set(n.id, `${prefix}-n${i}`);
	});

	const newNodes: ArgumentFlowNode[] = fragment.nodes.map((n, i) => ({
		id: idMap.get(n.id)!,
		type: "argument",
		position: {
			x: parentPosition.x + 200 + (i % 2) * 60,
			y: parentPosition.y + 100 + i * 55,
		},
		data: graphNodeToArgumentData(n, onNodeClick),
	}));

	const newEdges: Edge<EdgeData>[] = fragment.edges.map((e, i) => ({
		id: `${prefix}-e${i}`,
		source: idMap.get(e.source) ?? e.source,
		target: idMap.get(e.target) ?? e.target,
		data: { relation: e.relation },
	}));

	return { nodes: newNodes, edges: newEdges };
}
