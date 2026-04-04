"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { apiUrl } from "@/lib/api";
import type { ArgumentNodeData, GraphData } from "@/lib/types";

type FactKind = "counterargument" | "unacknowledged_strength";

type Props = {
	node: ArgumentNodeData;
	context: string;
	onClose: () => void;
	onMergeGraph: (fragment: GraphData) => void;
};

function factKey(kind: FactKind, index: number) {
	return `${kind}:${index}`;
}

export default function AnalysisPopup({
	node,
	context,
	onClose,
	onMergeGraph,
}: Props) {
	const [addingKey, setAddingKey] = useState<string | null>(null);
	const [addedKeys, setAddedKeys] = useState<Set<string>>(
		() => new Set()
	);
	const [err, setErr] = useState<string | null>(null);
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	const handleAdd = useCallback(
		async (kind: FactKind, text: string, index: number) => {
			const key = factKey(kind, index);
			if (addedKeys.has(key) || !text.trim()) return;
			setErr(null);
			setAddingKey(key);
			try {
				const res = await fetch(apiUrl("/api/expand-fact"), {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						parent_node_id: node.id,
						fact_kind: kind,
						fact_text: text,
						original_text: context,
						parent_label: node.label,
						parent_detail: node.detail,
						parent_type: node.type,
					}),
				});
				if (!res.ok) {
					const body = (await res.json().catch(() => ({}))) as {
						detail?: string;
					};
					throw new Error(body.detail ?? "Expand failed");
				}
				const data = (await res.json()) as GraphData;
				onMergeGraph(data);
				setAddedKeys((prev) => new Set(prev).add(key));
			} catch (e) {
				setErr(
					e instanceof Error ? e.message : "Could not add to graph."
				);
			} finally {
				setAddingKey(null);
			}
		},
		[addedKeys, context, node, onMergeGraph]
	);

	const score = node.strength_score;
	const reasoning = node.strength_reasoning;

	if (!mounted) return null;

	return createPortal(
		<div className="popup-backdrop" onClick={onClose} role="presentation">
			<div
				className="popup-panel"
				onClick={(e) => e.stopPropagation()}
				role="dialog"
				aria-labelledby="popup-title"
			>
				<div className="popup-kicker">{node.type}</div>
				<h3 id="popup-title" className="popup-title">
					{node.label}
				</h3>
				<p className="popup-detail">{node.detail}</p>

				{err && <p className="popup-error">{err}</p>}

				<div className="popup-strength popup-strength--top">
					<div className="popup-label">
						Analysis strength — {Math.round(score * 100)}%
					</div>
					<div className="popup-bar">
						<div
							className="popup-bar-fill"
							style={{ width: `${score * 100}%` }}
						/>
					</div>
					{reasoning ? (
						<p className="popup-reason">{reasoning}</p>
					) : null}
				</div>

				{node.counterarguments.length > 0 && (
					<div className="popup-section">
						<div className="popup-label">Counterarguments</div>
						<p className="popup-hint">
							Possible objections — add to the graph to explore
							them.
						</p>
						{node.counterarguments.map((c, i) => {
							const k = factKey("counterargument", i);
							const busy = addingKey === k;
							const done = addedKeys.has(k);
							return (
								<div key={k} className="popup-fact-row">
									<p className="popup-block popup-block--counter">
										{c}
									</p>
									<button
										type="button"
										className="popup-fact-add"
										disabled={busy || done}
										onClick={() =>
											handleAdd("counterargument", c, i)
										}
									>
										{done
											? "Added"
											: busy
												? "…"
												: "Add"}
									</button>
								</div>
							);
						})}
					</div>
				)}

				{node.unacknowledged_strengths.length > 0 && (
					<div className="popup-section">
						<div className="popup-label">
							Unacknowledged strengths
						</div>
						<p className="popup-hint">
							Ways the claim could be stronger — add to grow the
							map.
						</p>
						{node.unacknowledged_strengths.map((s, i) => {
							const k = factKey("unacknowledged_strength", i);
							const busy = addingKey === k;
							const done = addedKeys.has(k);
							return (
								<div key={k} className="popup-fact-row">
									<p className="popup-block popup-block--strength">
										{s}
									</p>
									<button
										type="button"
										className="popup-fact-add"
										disabled={busy || done}
										onClick={() =>
											handleAdd(
												"unacknowledged_strength",
												s,
												i
											)
										}
									>
										{done
											? "Added"
											: busy
												? "…"
												: "Add"}
									</button>
								</div>
							);
						})}
					</div>
				)}

				{node.fallacies.length > 0 && (
					<div className="popup-section">
						<div className="popup-label">Fallacies</div>
						{node.fallacies.map((f, i) => (
							<p
								key={`fallacy-${i}`}
								className="popup-block popup-block--fallacy"
							>
								{f}
							</p>
						))}
					</div>
				)}

				<button type="button" className="popup-close" onClick={onClose}>
					Close
				</button>
			</div>
		</div>,
		document.body
	);
}
