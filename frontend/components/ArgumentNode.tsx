"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { ArgumentFlowNode } from "@/lib/types";

const TYPE_COLORS: Record<
	string,
	{ bg: string; border: string; label: string }
> = {
	thesis: { bg: "#0f0f0f", border: "#e8e8e8", label: "#b8b8b8" },
	subclaim: { bg: "#12121c", border: "#6b7fd7", label: "#a5b4fc" },
	evidence: { bg: "#0c1f16", border: "#2d9f6a", label: "#6ee7b7" },
	warrant: { bg: "#1a160c", border: "#c9a227", label: "#fcd34d" },
	rebuttal: { bg: "#1f0c0c", border: "#dc5050", label: "#fca5a5" },
	axiom: { bg: "#140c1f", border: "#8b6fd6", label: "#c4b5fd" },
	fallacy: { bg: "#1f1208", border: "#ea580c", label: "#fdba74" },
};

export default function ArgumentNode({
	data,
	selected,
}: NodeProps<ArgumentFlowNode>) {
	const colors = TYPE_COLORS[data.type] ?? TYPE_COLORS.subclaim;
	const opacity = 0.55 + data.strength * 0.45;

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
			className="argument-node"
			style={{
				background: colors.bg,
				border: `2px solid ${colors.border}`,
				borderRadius: "var(--radius)",
				padding: "12px 14px",
				width: 180,
				cursor: "pointer",
				opacity,
				boxShadow: selected ? `0 0 0 2px ${colors.border}` : "none",
				transition: "box-shadow 0.15s ease, opacity 0.15s ease",
			}}
		>
			{/* Edges: child (below) source @ top → parent (above) target @ bottom */}
			<Handle type="source" position={Position.Top} style={{ opacity: 0 }} />
			<div
				style={{
					fontSize: 9,
					fontFamily: "var(--font-mono)",
					textTransform: "uppercase",
					letterSpacing: "0.12em",
					color: colors.label,
					marginBottom: 6,
				}}
			>
				{data.type}
			</div>
			<div
				style={{
					fontSize: 13,
					fontWeight: 600,
					color: "var(--text)",
					lineHeight: 1.35,
				}}
			>
				{data.label}
			</div>
			<Handle type="target" position={Position.Bottom} style={{ opacity: 0 }} />
		</div>
	);
}
