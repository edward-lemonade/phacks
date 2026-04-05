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
			<button
				type="button"
				className={styles.toggle}
				onClick={onToggle}
				aria-expanded={open}
				aria-controls={id}
				title={open ? "Collapse panel" : "Expand panel"}
			>
				<span className={styles.toggleIcon} aria-hidden>
					{open ? "‹" : "›"}
				</span>
			</button>

			<div className={styles.inner}>
				<h1 className={styles.brand} aria-label={brand}>
					{brand.split("").map((ch, i) => (
						<span key={i} className={styles.brandChar}>
							{ch}
						</span>
					))}
				</h1>

				<div className={styles.expandedBlock}>
					<p className={styles.tagline}>{tagline}</p>
					{children}
					{error ? <p className={styles.error}>{error}</p> : null}
				</div>
			</div>
		</aside>
	);
}
