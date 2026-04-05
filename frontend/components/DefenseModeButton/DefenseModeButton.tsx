"use client";

import styles from "./DefenseModeButton.module.css";

type Props = {
	active: boolean;
	onToggle: () => void;
	disabled?: boolean;
};

export default function DefenseModeButton({ active, onToggle, disabled }: Props) {
	return (
		<button
			type="button"
			className={`${styles.btn} ${active ? styles.active : ""}`}
			onClick={onToggle}
			disabled={disabled}
			title={active ? "Stop defense mode" : "Start defense mode — defends against counterclaims and strengthens weak claims"}
			aria-pressed={active}
			aria-label="Toggle defense mode"
		>
			<ShieldIcon />
			<span className={styles.label}>{active ? "Stop" : "Defend"}</span>
		</button>
	);
}

function ShieldIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
			<path
				d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"
				stroke="currentColor"
				strokeWidth="1.75"
				strokeLinejoin="round"
				strokeLinecap="round"
			/>
		</svg>
	);
}
