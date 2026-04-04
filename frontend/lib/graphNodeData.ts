import type { ArgumentNodeData, GraphNode } from "@/lib/types";

export function graphNodeToArgumentData(
	n: GraphNode,
	onNodeClick: (data: ArgumentNodeData) => void
): ArgumentNodeData {
	return {
		id: n.id,
		type: n.type,
		label: n.label,
		detail: n.detail,
		strength: n.strength,
		counterarguments: n.counterarguments ?? [],
		unacknowledged_strengths: n.unacknowledged_strengths ?? [],
		fallacies: n.fallacies ?? [],
		strength_score: n.strength_score ?? n.strength,
		strength_reasoning: n.strength_reasoning ?? "",
		onNodeClick,
	};
}
