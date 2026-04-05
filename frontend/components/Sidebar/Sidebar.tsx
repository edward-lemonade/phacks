"use client";

import type { ReactNode } from "react";
import styles from "./Sidebar.module.css";

type Props = {
	id: string;
	open: boolean;
	onToggle: () => void;
	brand: string;
	tagline: string;
	error: string | null;
	children: ReactNode;
};

export default function Sidebar({
	id,
	open,
	onToggle,
	brand,
	tagline,
	error,
	children,
}: Props) {
	return (
		<aside
			id={id}
			className={`${styles.sidebar}${open ? "" : ` ${styles.collapsed}`}`}
			aria-label="Input panel"
		>
			<div className={styles.inner}>
				<div className={styles.brandStage}>
					<h1 className={styles.brand} aria-label={brand}>
						{brand}
					</h1>
				</div>

				<div className={styles.expandedBlock}>
					{children}
					{error ? <p className={styles.error}>{error}</p> : null}
				</div>
			</div>

			<button
				type="button"
				className={styles.toggle}
				onClick={onToggle}
				aria-expanded={open}
				aria-controls={id}
				title={open ? "Collapse panel" : "Expand panel"}
			>
				<span className={styles.toggleGrip} aria-hidden>
					<span className={styles.toggleGripLine} />
					<span className={styles.toggleGripLine} />
					<span className={styles.toggleGripLine} />
				</span>
			</button>
		</aside>
	);
}
