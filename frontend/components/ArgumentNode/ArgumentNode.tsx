"use client";

import type { CSSProperties } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { ArgumentFlowNode } from "@/lib/types";
import { strengthLabelOpacity } from "@/lib/strengthLabel";
import styles from "./ArgumentNode.module.css";

const TYPE_COLORS: Record<
	string,
	{ bg: string; border: string; label: string }
> = {
	thesis: { bg: "#0f0f0f", border: "#e8e8e8", label: "#b8b8b8" },
	subclaim: { bg: "#12121c", border: "#6b7fd7", label: "#a5b4fc" },
	evidence: { bg: "#0c1f16", border: "#2d9f6a", label: "#6ee7b7" },
	axiom: { bg: "#140c1f", border: "#8b6fd6", label: "#c4b5fd" },
	counterclaim: { bg: "#1f0c0c", border: "#dc5050", label: "#fca5a5" },
	rebuttal: { bg: "#1f0c0c", border: "#dc5050", label: "#fca5a5" },
	fallacy: { bg: "#1f1208", border: "#ea580c", label: "#fdba74" },
	warrant: { bg: "#1a160c", border: "#c9a227", label: "#fcd34d" },
};

export default function ArgumentNode({
	data,
	selected,
}: NodeProps<ArgumentFlowNode>) {
	const colors = TYPE_COLORS[data.type] ?? TYPE_COLORS.subclaim;
	const opacity = 0.45 + strengthLabelOpacity(data.strength) * 0.55;
	const shadow = selected ? `0 0 0 2px ${colors.border}` : "none";

	return (
		<div
			role="button"
			tabIndex={0}
			onClick={() => data.onNodeClick(data)}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					data.onNodeClick(data);
				}
			}}
			className={styles.root}
			style={
				{
					"--arg-node-bg": colors.bg,
					"--arg-node-border": colors.border,
					"--arg-node-label": colors.label,
					"--arg-node-opacity": opacity,
					"--arg-node-shadow": shadow,
				} as CSSProperties
			}
		>
			<Handle
				type="source"
				position={Position.Top}
				className={styles.handleHidden}
			/>
			<div className={styles.typeLabel}>{data.type}</div>
			<div className={styles.labelText}>{data.label}</div>
			<Handle
				type="target"
				position={Position.Bottom}
				className={styles.handleHidden}
			/>
		</div>
	);
}
