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

export type DefenseMove = {
	id: string;
	nodeLabel: string;
	nodeStrength: string;
	counterargumentText: string;
	moveType: "counter-defense" | "claim-support";
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

export function useDefenseMode({ getNodes, getEdges, originalText, onMerge }: Deps) {
	const [active, setActive] = useState(false);
	const [moves, setMoves] = useState<DefenseMove[]>([]);
	const stopRef = useRef(false);
	const runningRef = useRef(false);

	const patchMove = (id: string, patch: Partial<DefenseMove>) =>
		setMoves((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));

	/** Find the thesis node (main claim). */
	const findThesis = useCallback((): ArgumentFlowNode | null => {
		const nodes = getNodes();
		return nodes.find((n) => n.data.type === "thesis") ?? null;
	}, [getNodes]);

	/** Use parity traversal to find counterclaims that oppose the thesis.
	 * Parity tracks: supports=even, contradicts=odd. A counterclaim with odd parity opposes thesis.
	 */
	const findOpposingCounterclaims = useCallback((): ArgumentFlowNode[] => {
		const nodes = getNodes();
		const edges = getEdges();
		const thesis = findThesis();

		if (!thesis) return [];

		// BFS with parity tracking
		const parity = new Map<string, number>(); // 0=even (supports), 1=odd (opposes)
		const queue: string[] = [thesis.id];
		parity.set(thesis.id, 0); // Thesis has even parity (supports itself)

		while (queue.length > 0) {
			const current = queue.shift()!;
			const currentParity = parity.get(current)!;

			// Find all edges from current node
			for (const edge of edges) {
				if (edge.target !== current) continue;
				if (parity.has(edge.source)) continue; // Already visited

				const relation = String(edge.data?.relation ?? "");
				const newParity = relation === "contradicts" ? 1 - currentParity : currentParity;
				parity.set(edge.source, newParity);
				queue.push(edge.source);
			}
		}

		// Find counterclaims with odd parity (they oppose the thesis)
		const opposingCounterclaims = nodes.filter(
			(n) => n.data.type === "counterclaim" && parity.get(n.id) === 1
		);

		return opposingCounterclaims;
	}, [getNodes, getEdges, findThesis]);

	/** Pick the strongest opposing counterclaim that hasn't been defended yet. */
	const pickStrongestCounterclaimToThesis = useCallback(
		(defended: Set<string>): { node: ArgumentFlowNode; counterargument: string } | null => {
			const opposingCounterclaims = findOpposingCounterclaims();

			// Filter to those with counterarguments and not yet defended
			const eligible = opposingCounterclaims
				.filter(
					(n) =>
						!defended.has(n.id) &&
						n.data.counterarguments.length > 0
				)
				.sort((a, b) => {
					const ra = STRENGTH_RANK[normalizeStrengthLabel(a.data.strength)] ?? 2;
					const rb = STRENGTH_RANK[normalizeStrengthLabel(b.data.strength)] ?? 2;
					return rb - ra; // Strongest first
				});

			if (!eligible.length) return null;

			const strongestCounterclaim = eligible[0];
			const counterargument = strongestCounterclaim.data.counterarguments[0];
			return { node: strongestCounterclaim, counterargument };
		},
		[findOpposingCounterclaims]
	);

	/** Pick the weakest normal claim (not counterclaim) that has further supports available. */
	const pickWeakestClaim = useCallback(
		(supported: Set<string>): { node: ArgumentFlowNode; supportText: string } | null => {
			const nodes = getNodes();
			const edges = getEdges();

			const alreadySupported = new Set(
				edges
					.filter((e) => String(e.data?.relation ?? "") === "supports")
					.map((e) => e.target)
			);

			const normalClaims = nodes
				.filter(
					(n) =>
						n.data.type !== "counterclaim" &&
						!supported.has(n.id) &&
						!alreadySupported.has(n.id) &&
						n.data.further_supports.length > 0
				)
				.sort((a, b) => {
					const ra = STRENGTH_RANK[normalizeStrengthLabel(a.data.strength)] ?? 2;
					const rb = STRENGTH_RANK[normalizeStrengthLabel(b.data.strength)] ?? 2;
					return ra - rb; // Sort ascending: weakest first
				});

			if (!normalClaims.length) return null;

			const weakest = normalClaims[0];
			const supportText = weakest.data.further_supports[0];
			return { node: weakest, supportText };
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

		const defended = new Set<string>();
		const supported = new Set<string>();

		async function tick() {
			runningRef.current = true;

			// Phase 1: Defend against strong counterclaims to thesis using counterarguments (parity mechanism)
			while (!stopRef.current) {
				const pick = pickStrongestCounterclaimToThesis(defended);
				if (!pick) break;

				const { node, counterargument } = pick;
				defended.add(node.id);

				const moveId = `${node.id}-counter-${Date.now()}`;
				const move: DefenseMove = {
					id: moveId,
					nodeLabel: node.data.label,
					nodeStrength: normalizeStrengthLabel(node.data.strength),
					counterargumentText: counterargument,
					moveType: "counter-defense",
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
				}
			}

			// Phase 2: Support weak normal claims
			while (!stopRef.current) {
				const pick = pickWeakestClaim(supported);
				if (!pick) break;

				const { node, supportText } = pick;
				supported.add(node.id);

				const moveId = `${node.id}-support-${Date.now()}`;
				const move: DefenseMove = {
					id: moveId,
					nodeLabel: node.data.label,
					nodeStrength: normalizeStrengthLabel(node.data.strength),
					counterargumentText: supportText,
					moveType: "claim-support",
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
							fact_kind: "further_supports",
							fact_text: supportText,
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
				}
			}

			runningRef.current = false;
			setActive(false);
		}

		tick();
	}, [pickStrongestCounterclaimToThesis, pickWeakestClaim, originalText, onMerge]);

	const toggle = useCallback(() => {
		if (active) stop();
		else start();
	}, [active, start, stop]);

	const clearMoves = useCallback(() => setMoves([]), []);

	return { active, moves, toggle, clearMoves };
}
