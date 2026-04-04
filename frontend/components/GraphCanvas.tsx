"use client";

import {
	useCallback,
	useLayoutEffect,
	useRef,
	useState,
	type Dispatch,
	type MouseEvent,
	type MutableRefObject,
	type SetStateAction,
} from "react";
import {
	ReactFlow,
	Background,
	Controls,
	MarkerType,
	ReactFlowProvider,
	addEdge,
	useEdgesState,
	useNodesState,
	useReactFlow,
	type Connection,
	type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import ArgumentNode from "@/components/ArgumentNode";
import AnalysisPopup from "@/components/AnalysisPopup";
import { useHierarchicalLayout } from "@/hooks/useHierarchicalLayout";
import { graphNodeToArgumentData } from "@/lib/graphNodeData";
import { mergeFragmentNearParent } from "@/lib/mergeGraphFragment";
import type {
	ArgumentFlowNode,
	ArgumentNodeData,
	EdgeData,
	GraphData,
} from "@/lib/types";

const nodeTypes = { argument: ArgumentNode };

const RELATION_COLORS: Record<string, string> = {
	supports: "#2d9f6a",
	contradicts: "#dc5050",
	qualifies: "#c9a227",
	assumes: "#8b6fd6",
	contains_fallacy: "#ea580c",
};

type FlowEffectsProps = {
	nodes: ArgumentFlowNode[];
	edges: Edge<EdgeData>[];
	screenToFlowRef: MutableRefObject<
		(p: { x: number; y: number }) => { x: number; y: number }
	>;
};

function FlowEffects({ nodes, edges, screenToFlowRef }: FlowEffectsProps) {
	const { screenToFlowPosition } = useReactFlow();
	useHierarchicalLayout(nodes, edges);

	useLayoutEffect(() => {
		screenToFlowRef.current = screenToFlowPosition;
	}, [screenToFlowPosition, screenToFlowRef]);

	return null;
}

type PopupLayerProps = {
	selectedNode: ArgumentNodeData;
	originalText: string;
	onClose: () => void;
	handleNodeClick: (data: ArgumentNodeData) => void;
	setNodes: Dispatch<SetStateAction<ArgumentFlowNode[]>>;
	setEdges: Dispatch<SetStateAction<Edge<EdgeData>[]>>;
};

function AnalysisPopupLayer({
	selectedNode,
	originalText,
	onClose,
	handleNodeClick,
	setNodes,
	setEdges,
}: PopupLayerProps) {
	const { getNode } = useReactFlow();

	const onMergeGraph = useCallback(
		(fragment: GraphData) => {
			const parent = getNode(selectedNode.id);
			const pos = parent?.position ?? { x: 0, y: 0 };
			const { nodes: addN, edges: addE } = mergeFragmentNearParent(
				pos,
				fragment,
				handleNodeClick
			);
			setNodes((nds) => [...nds, ...addN]);
			setEdges((eds) => [...eds, ...addE]);
		},
		[
			getNode,
			handleNodeClick,
			selectedNode.id,
			setEdges,
			setNodes,
		]
	);

	return (
		<AnalysisPopup
			node={selectedNode}
			context={originalText}
			onClose={onClose}
			onMergeGraph={onMergeGraph}
		/>
	);
}

type FlowInnerProps = {
	initialNodes: ArgumentFlowNode[];
	initialEdges: Edge<EdgeData>[];
	originalText: string;
};

function FlowInner({ initialNodes, initialEdges, originalText }: FlowInnerProps) {
	const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
	const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
	const [selectedNode, setSelectedNode] = useState<ArgumentNodeData | null>(
		null
	);
	const screenToFlowRef = useRef<
		(p: { x: number; y: number }) => { x: number; y: number }
	>((p) => p);

	const handleNodeClick = useCallback((nodeData: ArgumentNodeData) => {
		setSelectedNode(nodeData);
	}, []);

	const enrichedNodes: ArgumentFlowNode[] = nodes.map((n) => ({
		...n,
		type: "argument",
		data: {
			...n.data,
			id: n.id,
			onNodeClick: handleNodeClick,
		},
	}));

	const styledEdges = edges.map((e) => {
		const color = RELATION_COLORS[String(e.data?.relation ?? "")] ?? "#4a4a55";
		return {
			...e,
			style: { stroke: color, strokeWidth: 1.5 },
			markerEnd: {
				type: MarkerType.ArrowClosed,
				color,
				width: 16,
				height: 16,
			},
		};
	});

	const onConnect = useCallback(
		(params: Connection) =>
			setEdges((eds) => addEdge({ ...params, animated: false }, eds)),
		[setEdges]
	);

	const onFlowDoubleClick = useCallback(
		(event: MouseEvent) => {
			const el = event.target as HTMLElement | null;
			if (el?.closest(".react-flow__node")) return;
			if (!el?.closest(".react-flow__pane")) return;
			const pos = screenToFlowRef.current({
				x: event.clientX,
				y: event.clientY,
			});
			const id = `user-${Date.now()}`;
			const newNode: ArgumentFlowNode = {
				id,
				type: "argument",
				position: { x: pos.x - 90, y: pos.y - 28 },
				data: {
					type: "subclaim",
					label: "New node",
					detail: "",
					strength: 0.5,
					id,
					counterarguments: [],
					unacknowledged_strengths: [],
					fallacies: [],
					strength_score: 0.5,
					strength_reasoning: "",
					onNodeClick: handleNodeClick,
				},
			};
			setNodes((nds) => [...nds, newNode]);
		},
		[handleNodeClick, setNodes]
	);

	return (
		<>
			<ReactFlow
				nodes={enrichedNodes}
				edges={styledEdges}
				onNodesChange={onNodesChange}
				onEdgesChange={onEdgesChange}
				onConnect={onConnect}
				onDoubleClick={onFlowDoubleClick}
				zoomOnDoubleClick={false}
				nodeTypes={nodeTypes}
				fitView
				minZoom={0.2}
				maxZoom={1.5}
				className="argument-flow"
				style={{ width: "100%", height: "100%" }}
			>
				<FlowEffects
					nodes={nodes}
					edges={edges}
					screenToFlowRef={screenToFlowRef}
				/>
				<Background color="var(--grid)" gap={28} size={1} />
				<Controls showInteractive={false} />
				{selectedNode && (
					<AnalysisPopupLayer
						selectedNode={selectedNode}
						originalText={originalText}
						onClose={() => setSelectedNode(null)}
						handleNodeClick={handleNodeClick}
						setNodes={setNodes}
						setEdges={setEdges}
					/>
				)}
			</ReactFlow>
		</>
	);
}

type Props = {
	graphData: GraphData;
	originalText: string;
};

export default function GraphCanvas({ graphData, originalText }: Props) {
	const noopClick = useCallback((_d: ArgumentNodeData) => {}, []);

	const initialNodes: ArgumentFlowNode[] = graphData.nodes.map((n) => ({
		id: n.id,
		type: "argument",
		position: { x: 0, y: 0 },
		data: graphNodeToArgumentData(n, noopClick),
	}));

	const initialEdges: Edge<EdgeData>[] = graphData.edges.map((e) => ({
		id: e.id,
		source: e.source,
		target: e.target,
		data: { relation: e.relation },
	}));

	return (
		<ReactFlowProvider>
			<div className="canvas-flow-root">
				<FlowInner
					initialNodes={initialNodes}
					initialEdges={initialEdges}
					originalText={originalText}
				/>
			</div>
		</ReactFlowProvider>
	);
}
