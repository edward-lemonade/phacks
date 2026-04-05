import type { ArgumentNodeData, GraphNode } from "@/lib/types";
import { normalizeStrengthLabel } from "@/lib/strengthLabel";

export function graphNodeToArgumentData(
	n: GraphNode,
	onNodeClick: (data: ArgumentNodeData) => void
): ArgumentNodeData {
	return {
		id: n.id,
		type: n.type,
		label: n.label,
		detail: n.detail,
		strength: normalizeStrengthLabel(n.strength),
		counterarguments: n.counterarguments ?? [],
		further_supports: n.further_supports ?? [],
		strength_reasoning: n.strength_reasoning ?? "",
		onNodeClick,
	};
}
