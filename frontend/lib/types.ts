import type { Node } from "@xyflow/react";
import type { StrengthLabel } from "@/lib/strengthLabel";

export type NodeType =
	| "thesis"
	| "subclaim"
	| "evidence"
	| "axiom"
	| "counterclaim";

export type EdgeRelation =
	| "supports"
	| "contradicts"
	| "qualifies"
	| "assumes"
	| "contains_fallacy";

/** API graph node — includes embedded analysis (not separate canvas nodes) */
export interface GraphNode {
	id: string;
	type: NodeType | string;
	label: string;
	detail: string;
	strength: StrengthLabel | string;
	counterarguments?: string[];
	unacknowledged_strengths?: string[];
	strength_reasoning?: string;
}

export interface GraphEdge {
	id: string;
	source: string;
	target: string;
	relation: EdgeRelation | string;
}

export interface GraphData {
	nodes: GraphNode[];
	edges: GraphEdge[];
}

export interface ArgumentNodeData extends Record<string, unknown> {
	id: string;
	type: string;
	label: string;
	detail: string;
	strength: StrengthLabel;
	counterarguments: string[];
	unacknowledged_strengths: string[];
	strength_reasoning: string;
	onNodeClick: (data: ArgumentNodeData) => void;
}

/** Custom node type for React Flow / XYFlow */
export type ArgumentFlowNode = Node<ArgumentNodeData, "argument">;

export interface EdgeData extends Record<string, unknown> {
	relation?: EdgeRelation | string;
}

export interface NodeAnalysisResult {
	counterarguments: string[];
	strength: StrengthLabel;
	strength_reasoning: string;
}
