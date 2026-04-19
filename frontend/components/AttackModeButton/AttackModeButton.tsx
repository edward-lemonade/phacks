"use client";

import styles from "./AttackModeButton.module.css";

type Props = {
	active: boolean;
	onToggle: () => void;
	disabled?: boolean;
};

export default function AttackModeButton({ active, onToggle, disabled }: Props) {
	return (
		<button
			type="button"
			className={`${styles.btn} ${active ? styles.active : ""}`}
			onClick={onToggle}
			disabled={disabled}
			title={active ? "Stop attack mode" : "Start attack mode — auto-generates counterclaims"}
			aria-pressed={active}
			aria-label="Toggle attack mode"
		>
			<SwordIcon />
			<span className={styles.label}>{active ? "Stop" : "Attack"}</span>
		</button>
	);
}

function SwordIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
			<path
				d="M14.5 2L22 9.5 10.5 21 3 21 3 13.5 14.5 2z"
				stroke="currentColor"
				strokeWidth="1.75"
				strokeLinejoin="round"
			/>
			<path
				d="M2 22 7 17"
				stroke="currentColor"
				strokeWidth="1.75"
				strokeLinecap="round"
			/>
			<path
				d="M15 5l4 4"
				stroke="currentColor"
				strokeWidth="1.75"
				strokeLinecap="round"
			/>
		</svg>
	);
}