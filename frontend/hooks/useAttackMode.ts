import { useCallback, useRef, useState } from "react";
import type { Edge } from "@xyflow/react";
import { apiUrl } from "@/lib/api";
import { normalizeStrengthLabel } from "@/lib/strengthLabel";
import type { ArgumentFlowNode, ArgumentNodeData, EdgeData, GraphData } from "@/lib/types";

const STRENGTH_RANK: Record<string, number> = {
	false: 0,
	fallacious: 1,
	weak: 2,
	strong: 3,
	true: 4,
};

export type AttackMove = {
	id: string;
	nodeLabel: string;
	nodeStrength: string;
	counterargumentText: string;
	status: "pending" | "done" | "error";
	addedNodeLabels: string[];
	error?: string;
};

type Deps = {
	getNodes: () => ArgumentFlowNode[];
	getEdges: () => Edge<EdgeData>[];
	originalText: string;
	onMerge: (parentNode: ArgumentNodeData, data: GraphData) => void;
};

export function useAttackMode({ getNodes, getEdges, originalText, onMerge }: Deps) {
	const [active, setActive] = useState(false);
	const [moves, setMoves] = useState<AttackMove[]>([]);
	const stopRef = useRef(false);
	const runningRef = useRef(false);

	const patchMove = (id: string, patch: Partial<AttackMove>) =>
		setMoves((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));

	/** Strongest node that has at least one counterargument suggestion and no contradicts edge yet. */
	const pickStrongest = useCallback(
		(attacked: Set<string>): { node: ArgumentFlowNode; counterargument: string } | null => {
			const nodes = getNodes();
			const edges = getEdges();

			const alreadyContradicted = new Set(
				edges
					.filter((e) => String(e.data?.relation ?? "") === "contradicts")
					.map((e) => e.target)
			);

			const eligible = nodes
				.filter(
					(n) =>
						n.data.type !== "counterclaim" &&
						!attacked.has(n.id) &&
						!alreadyContradicted.has(n.id) &&
						n.data.counterarguments.length > 0
				)
				.sort((a, b) => {
					const ra = STRENGTH_RANK[normalizeStrengthLabel(a.data.strength)] ?? 2;
					const rb = STRENGTH_RANK[normalizeStrengthLabel(b.data.strength)] ?? 2;
					return rb - ra;
				});

			if (!eligible.length) return null;
			const node = eligible[0];
			const counterargument = node.data.counterarguments[0];
			return { node, counterargument };
		},
		[getNodes, getEdges]
	);

	const stop = useCallback(() => {
		stopRef.current = true;
		setActive(false);
	}, []);

	const start = useCallback(() => {
		if (runningRef.current) return;
		stopRef.current = false;
		setActive(true);
		setMoves([]);

		const attacked = new Set<string>();

		async function tick() {
			runningRef.current = true;
			while (!stopRef.current) {
				const pick = pickStrongest(attacked);
				if (!pick) break;

				const { node, counterargument } = pick;
				attacked.add(node.id);

				const moveId = `${node.id}-${Date.now()}`;
				const move: AttackMove = {
					id: moveId,
					nodeLabel: node.data.label,
					nodeStrength: normalizeStrengthLabel(node.data.strength),
					counterargumentText: counterargument,
					status: "pending",
					addedNodeLabels: [],
				};
				setMoves((prev) => [...prev, move]);

				try {
					const res = await fetch(apiUrl("/api/expand-fact"), {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							parent_node_id: node.id,
							fact_kind: "counterargument",
							fact_text: counterargument,
							original_text: originalText,
							parent_label: node.data.label,
							parent_detail: node.data.detail,
							parent_type: node.data.type,
						}),
					});

					if (!res.ok) {
						const body = (await res.json().catch(() => ({}))) as { detail?: string };
						throw new Error(body.detail ?? "Expand failed");
					}

					const data = (await res.json()) as GraphData;
					onMerge(node.data, data);

					patchMove(moveId, {
						status: "done",
						addedNodeLabels: data.nodes.map((n) => n.label),
					});
				} catch (e) {
					patchMove(moveId, {
						status: "error",
						error: e instanceof Error ? e.message : "Unknown error",
					});
					// keep going on error — just skip this node
				}
			}

			runningRef.current = false;
			setActive(false);
		}

		tick();
	}, [pickStrongest, originalText, onMerge]);

	const toggle = useCallback(() => {
		if (active) stop();
		else start();
	}, [active, start, stop]);

	const clearMoves = useCallback(() => setMoves([]), []);

	return { active, moves, toggle, clearMoves };
}