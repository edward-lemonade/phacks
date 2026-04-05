"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { apiUrl } from "@/lib/api";
import {
	STRENGTH_DISPLAY,
	normalizeStrengthLabel,
	type StrengthLabel,
} from "@/lib/strengthLabel";
import type { ArgumentNodeData, GraphData } from "@/lib/types";
import styles from "./AnalysisPopup.module.css";

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

	const strength: StrengthLabel = normalizeStrengthLabel(node.strength);
	const strengthMeta = STRENGTH_DISPLAY[strength];
	const reasoning = node.strength_reasoning;

	if (!mounted) return null;

	return createPortal(
		<div
			className={styles.backdrop}
			onClick={onClose}
			role="presentation"
		>
			<div
				className={styles.panel}
				onClick={(e) => e.stopPropagation()}
				role="dialog"
				aria-labelledby="popup-title"
			>
				<div className={styles.kicker}>{node.type}</div>
				<h3 id="popup-title" className={styles.title}>
					{node.label}
				</h3>
				<p className={styles.detail}>{node.detail}</p>

				{err ? <p className={styles.error}>{err}</p> : null}

				<div className={`${styles.strength} ${styles.strengthTop}`}>
					<div className={styles.label}>Strength</div>
					<div
						className={styles.strengthBadge}
						data-strength={strength}
						title={strengthMeta.hint}
					>
						{strengthMeta.title}
					</div>
					{reasoning ? (
						<p className={styles.reason}>{reasoning}</p>
					) : null}
				</div>

				{node.counterarguments.length > 0 ? (
					<div className={styles.section}>
						<div className={styles.label}>Counterarguments</div>
						<p className={styles.hint}>
							Possible objections — add to the graph to explore
							them.
						</p>
						{node.counterarguments.map((c, i) => {
							const k = factKey("counterargument", i);
							const busy = addingKey === k;
							const done = addedKeys.has(k);
							return (
								<div key={k} className={styles.factRow}>
									<p
										className={`${styles.block} ${styles.blockCounter}`}
									>
										{c}
									</p>
									<button
										type="button"
										className={styles.factAdd}
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
				) : null}

				{node.unacknowledged_strengths.length > 0 ? (
					<div className={styles.section}>
						<div className={styles.label}>
							Unacknowledged strengths
						</div>
						<p className={styles.hint}>
							Ways the claim could be stronger — add to grow the
							map.
						</p>
						{node.unacknowledged_strengths.map((s, i) => {
							const k = factKey("unacknowledged_strength", i);
							const busy = addingKey === k;
							const done = addedKeys.has(k);
							return (
								<div key={k} className={styles.factRow}>
									<p
										className={`${styles.block} ${styles.blockStrength}`}
									>
										{s}
									</p>
									<button
										type="button"
										className={styles.factAdd}
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
				) : null}

				<button type="button" className={styles.close} onClick={onClose}>
					Close
				</button>
			</div>
		</div>,
		document.body
	);
}
