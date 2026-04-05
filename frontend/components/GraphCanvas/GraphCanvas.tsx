"use client";

import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	type MouseEvent,
	type MutableRefObject,
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
	type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import AnalysisPopup from "@/components/AnalysisPopup";
import ArgumentNode from "@/components/ArgumentNode";
import { useHierarchicalLayout } from "@/hooks/useHierarchicalLayout";
import { apiUrl } from "@/lib/api";
import { factKey, type FactKind } from "@/lib/factKey";
import {
	edgeStrokeFromChildStrength,
	hexToRgba,
	markerSizeFromChildStrength,
} from "@/lib/edgeStrengthStyle";
import { graphNodeToArgumentData } from "@/lib/graphNodeData";
import { mergeFragmentNearParent } from "@/lib/mergeGraphFragment";
import { propagateArgumentStrengths } from "@/lib/strengthPropagation";
import type {
	ArgumentFlowNode,
	ArgumentNodeData,
	EdgeData,
	GraphData,
} from "@/lib/types";
import styles from "./GraphCanvas.module.css";

const nodeTypes = { argument: ArgumentNode };

const RELATION_COLORS: Record<"supports" | "contradicts", string> = {
	supports: "#2d9f6a",
	contradicts: "#dc5050",
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

type FlowInnerProps = {
	initialNodes: ArgumentFlowNode[];
	initialEdges: Edge<EdgeData>[];
	originalText: string;
    onLoadingChange: (loading: boolean) => void;
};

function FlowInner({ initialNodes, initialEdges, originalText, onLoadingChange }: FlowInnerProps) {
	const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
	const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
	const [selectedNode, setSelectedNode] = useState<ArgumentNodeData | null>(null);
	const [mergedFactKeysByNodeId, setMergedFactKeysByNodeId] = useState<
		Record<string, string[]>
	>({});
	const [pendingExpand, setPendingExpand] = useState<{
		nodeId: string;
		factKey: string;
	} | null>(null);
	const [nodeDataVersion, setNodeDataVersion] = useState(0);
	const expandInFlightRef = useRef(false);
	const { getNode } = useReactFlow();
	const screenToFlowRef = useRef<
		(p: { x: number; y: number }) => { x: number; y: number }
	>((p) => p);


	const handleNodeClick = useCallback((nodeData: ArgumentNodeData) => {
		setSelectedNode(nodeData);
	}, []);

    useEffect(() => {
		onLoadingChange(pendingExpand !== null);
	}, [pendingExpand, onLoadingChange]);

	/** Shared merge logic after any expand/user-fact API call. */
	const mergeFragment = useCallback(
		(parentNode: ArgumentNodeData, data: GraphData) => {
			const parent = getNode(parentNode.id);
			const pos = parent?.position ?? { x: 0, y: 0 };
			const { nodes: addN, edges: addE } = mergeFragmentNearParent(
				pos,
				data,
				handleNodeClick
			);
			setNodes((nds) => [...nds, ...addN]);
			setEdges((eds) => [...eds, ...addE]);
		},
		[getNode, handleNodeClick, setEdges, setNodes]
	);

	const runExpandFact = useCallback(
		async (
			parentNode: ArgumentNodeData,
			kind: FactKind,
			text: string,
			index: number
		) => {
			if (expandInFlightRef.current) {
				throw new Error("Wait for the current add to finish.");
			}
			const key = factKey(kind, index);
			expandInFlightRef.current = true;
			setPendingExpand({ nodeId: parentNode.id, factKey: key });
			try {
				const res = await fetch(apiUrl("/api/expand-fact"), {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						parent_node_id: parentNode.id,
						fact_kind: kind,
						fact_text: text,
						original_text: originalText,
						parent_label: parentNode.label,
						parent_detail: parentNode.detail,
						parent_type: parentNode.type,
					}),
				});
				if (!res.ok) {
					const body = (await res.json().catch(() => ({}))) as { detail?: string };
					throw new Error(body.detail ?? "Expand failed");
				}
				const data = (await res.json()) as GraphData;
				mergeFragment(parentNode, data);
				setMergedFactKeysByNodeId((prev) => {
					const existing = prev[parentNode.id] ?? [];
					if (existing.includes(key)) return prev;
					return { ...prev, [parentNode.id]: [...existing, key] };
				});
			} finally {
				expandInFlightRef.current = false;
				setPendingExpand((p) =>
					p?.nodeId === parentNode.id && p?.factKey === key ? null : p
				);
			}
		},
		[mergeFragment, originalText]
	);

	const handlePopupExpandFact = useCallback(
		async (kind: FactKind, text: string, index: number) => {
			if (!selectedNode) return;
			await runExpandFact(selectedNode, kind, text, index);
		},
		[selectedNode, runExpandFact]
	);

	const handleUserFact = useCallback(
		async (kind: FactKind, text: string) => {
			if (!selectedNode || expandInFlightRef.current) {
				throw new Error("Wait for the current add to finish.");
			}
			expandInFlightRef.current = true;
			const key = `user:${kind}:${Date.now()}`;
			setPendingExpand({ nodeId: selectedNode.id, factKey: key });
			try {
				const res = await fetch(apiUrl("/api/user-fact"), {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						parent_node_id: selectedNode.id,
						fact_kind: kind,
						fact_text: text,
						original_text: originalText,
						parent_label: selectedNode.label,
						parent_detail: selectedNode.detail,
						parent_type: selectedNode.type,
					}),
				});
				if (!res.ok) {
					const body = (await res.json().catch(() => ({}))) as { detail?: string };
					throw new Error(body.detail ?? "User fact expansion failed");
				}
				const data = (await res.json()) as GraphData;
				mergeFragment(selectedNode, data);
			} finally {
				expandInFlightRef.current = false;
				setPendingExpand(null);
			}
		},
		[selectedNode, originalText, mergeFragment]
	);

	/** Remove a suggested fact from a node's data and re-propagate strength. */
	const handleDeleteFact = useCallback(
		(kind: FactKind, index: number) => {
			if (!selectedNode) return;
			const nodeId = selectedNode.id;

			setNodes((nds) => {
				const updated = nds.map((n) => {
					if (n.id !== nodeId) return n;
					const data = { ...n.data };
					if (kind === "counterargument") {
						data.counterarguments = data.counterarguments.filter((_, i) => i !== index);
					} else {
						data.further_supports = data.further_supports.filter((_, i) => i !== index);
					}
					return { ...n, data };
				});
				return propagateArgumentStrengths(updated, edges);
			});

			setSelectedNode((prev) => {
				if (!prev || prev.id !== nodeId) return prev;
				if (kind === "counterargument") {
					return {
						...prev,
						counterarguments: prev.counterarguments.filter((_, i) => i !== index),
					};
				}
				return {
					...prev,
					further_supports: prev.further_supports.filter((_, i) => i !== index),
				};
			});

			setNodeDataVersion((v) => v + 1);
		},
		// edgesRef is a stable ref — safe to omit from deps.
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[selectedNode, setNodes]
	);

	const handleNodesChange = useCallback(
		(changes: NodeChange<ArgumentFlowNode>[]) => {
			onNodesChange(changes);

			const hasRemoval = changes.some((c) => c.type === "remove");
			if (!hasRemoval) return;

			const removedIds = new Set(
				changes
					.filter((c): c is Extract<NodeChange<ArgumentFlowNode>, { type: "remove" }> => c.type === "remove")
					.map((c) => c.id)
			);
			setSelectedNode((prev) =>
				prev && removedIds.has(prev.id) ? null : prev
			);

			// Propagate using the ref so the updater always sees the current
			// edges, not whatever was closed over when this callback was created.
			setNodes((nds) => propagateArgumentStrengths(nds, edges));
		},
		[onNodesChange, setNodes]
	);

	const graphStructureKey = useMemo(
		() =>
			edges
				.map((e) => `${e.id}:${e.source}:${e.target}:${String(e.data?.relation ?? "")}`)
				.join("|") +
			"|" +
			[...nodes.map((n) => n.id)].sort().join(","),
		[edges, nodes]
	);

	useLayoutEffect(() => {
		setNodes((curr) => propagateArgumentStrengths(curr, edges));
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [graphStructureKey, nodeDataVersion, edges]);
    useEffect(() => {
        setNodes((curr) => propagateArgumentStrengths(curr, edges));
    }, [])

	// Sync the popup's node data when strengths change.
	useEffect(() => {
		setSelectedNode((prev) => {
			if (!prev) return prev;
			const m = nodes.find((n) => n.id === prev.id);
			if (!m || m.data.strength === prev.strength) return prev;
			return { ...m.data, onNodeClick: prev.onNodeClick };
		});
	}, [nodes]);

	const enrichedNodes: ArgumentFlowNode[] = nodes.map((n) => ({
		...n,
		type: "argument",
		data: { ...n.data, id: n.id, onNodeClick: handleNodeClick },
	}));

	const styledEdges = edges.map((e) => {
		const child = nodes.find((n) => n.id === e.source);
		const childStrength = child?.data?.strength ?? "weak";
		const vis = edgeStrokeFromChildStrength(childStrength);
		const mk = markerSizeFromChildStrength(childStrength);
		const rel = String(e.data?.relation ?? "");
		const color =
			rel === "supports" || rel === "contradicts"
				? RELATION_COLORS[rel]
				: "#4a4a55";
		const strokeColor = hexToRgba(color, vis.strokeOpacity);
		return {
			...e,
			style: { stroke: strokeColor, strokeWidth: vis.strokeWidth },
			markerEnd: {
				type: MarkerType.ArrowClosed,
				color: strokeColor,
				width: mk.width,
				height: mk.height,
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
			const pos = screenToFlowRef.current({ x: event.clientX, y: event.clientY });
			const id = `user-${Date.now()}`;
			const newNode: ArgumentFlowNode = {
				id,
				type: "argument",
				position: { x: pos.x - 90, y: pos.y - 28 },
				data: {
					type: "subclaim",
					label: "New node",
					detail: "",
					strength: "weak",
					id,
					counterarguments: [],
					further_supports: [],
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
				onNodesChange={handleNodesChange}
				onEdgesChange={onEdgesChange}
				onConnect={onConnect}
				onDoubleClick={onFlowDoubleClick}
				zoomOnDoubleClick={false}
				nodeTypes={nodeTypes}
				fitView
				minZoom={0.2}
				maxZoom={1.5}
				className={styles.flow}
				style={{ width: "100%", height: "100%" }}
			>
				<FlowEffects nodes={nodes} edges={edges} screenToFlowRef={screenToFlowRef} />
				<Background color="var(--grid)" gap={28} size={1} />
				<Controls showInteractive={false} />
				{selectedNode ? (
					<AnalysisPopup
						node={selectedNode}
						context={originalText}
						onClose={() => setSelectedNode(null)}
						mergedFactKeys={new Set(mergedFactKeysByNodeId[selectedNode.id] ?? [])}
						pendingExpandFactKey={
							pendingExpand?.nodeId === selectedNode.id
								? pendingExpand.factKey
								: null
						}
						anyExpandInFlight={pendingExpand !== null}
						onExpandFact={handlePopupExpandFact}
						onUserFact={handleUserFact}
						onDeleteFact={handleDeleteFact}
					/>
				) : null}
			</ReactFlow>
		</>
	);
}

type Props = {
	graphData: GraphData;
	originalText: string;
    onLoadingChange: (loading: boolean) => void;
};

export default function GraphCanvas({ graphData, originalText, onLoadingChange }: Props) {
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
			<div className={styles.flowRoot}>
				<FlowInner
					initialNodes={initialNodes}
					initialEdges={initialEdges}
					originalText={originalText}
                    onLoadingChange={onLoadingChange}
				/>
			</div>
		</ReactFlowProvider>
	);
}