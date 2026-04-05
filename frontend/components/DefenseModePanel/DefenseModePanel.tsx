"use client";

import type { DefenseMove } from "@/hooks/useDefenseMode";
import { STRENGTH_DISPLAY } from "@/lib/strengthLabel";
import styles from "./DefenseModePanel.module.css";

type Props = {
	moves: DefenseMove[];
	active: boolean;
	onStop: () => void;
	onClose: () => void;
};

export default function DefenseModePanel({ moves, active, onStop, onClose }: Props) {
	return (
		<div className={styles.panel}>
			<div className={styles.header}>
				<div className={styles.headerLeft}>
					{active && <span className={styles.pulse} />}
					<span className={styles.title}>
						{active ? "Defending…" : "Defense complete"}
					</span>
				</div>
				<div className={styles.headerRight}>
					{active && (
						<button type="button" className={styles.stopBtn} onClick={onStop}>
							Stop
						</button>
					)}
					{!active && (
						<button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
							✕
						</button>
					)}
				</div>
			</div>

			<div className={styles.moves}>
				{moves.length === 0 && (
					<p className={styles.empty}>Analyzing strategy…</p>
				)}
				{moves.map((m) => (
					<div key={m.id} className={`${styles.move} ${styles[m.status]}`}>
						<div className={styles.moveTop}>
							<span
								className={styles.strengthPip}
								data-strength={m.nodeStrength}
								title={STRENGTH_DISPLAY[m.nodeStrength as keyof typeof STRENGTH_DISPLAY]?.title ?? m.nodeStrength}
							/>
							<div className={styles.targetInfo}>
								<span className={styles.targetLabel}>{m.nodeLabel}</span>
								<span className={styles.moveTypeBadge} data-type={m.moveType}>
									{m.moveType === "counter-defense" ? "Counter Defense" : "Claim Support"}
								</span>
							</div>
							<span className={styles.statusIcon}>
								{m.status === "pending" && <Spinner />}
								{m.status === "done" && "✓"}
								{m.status === "error" && "✕"}
							</span>
						</div>
						<p className={styles.supportText}>"{m.counterargumentText}"</p>
						{m.status === "done" && m.addedNodeLabels.length > 0 && (
							<div className={styles.added}>
								{m.addedNodeLabels.map((l, i) => (
									<span key={i} className={styles.addedChip}>{l}</span>
								))}
							</div>
						)}
						{m.status === "error" && (
							<p className={styles.errText}>{m.error}</p>
						)}
					</div>
				))}
			</div>
		</div>
	);
}

function Spinner() {
	return <span className={styles.spinner} aria-label="loading" />;
}
