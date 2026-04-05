"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
	STRENGTH_DISPLAY,
	normalizeStrengthLabel,
	type StrengthLabel,
} from "@/lib/strengthLabel";
import { factKey, type FactKind } from "@/lib/factKey";
import type { ArgumentNodeData } from "@/lib/types";
import styles from "./AnalysisPopup.module.css";

type Props = {
	node: ArgumentNodeData;
	context: string;
	onClose: () => void;
	/** Parent runs fetch + merge; survives popup close. */
	onExpandFact: (
		kind: FactKind,
		text: string,
		index: number
	) => Promise<void>;
	/** Keys already merged for this node (from parent). */
	mergedFactKeys: ReadonlySet<string>;
	/** Fact key whose expand request is in flight (from parent; survives popup close). */
	pendingExpandFactKey: string | null;
	/** True while any expand request is in flight (may be for another node). */
	anyExpandInFlight: boolean;
};

export default function AnalysisPopup({
	node,
	context,
	onClose,
	onExpandFact,
	mergedFactKeys,
	pendingExpandFactKey,
	anyExpandInFlight,
}: Props) {
	const [err, setErr] = useState<string | null>(null);
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	const handleAdd = useCallback(
		async (kind: FactKind, text: string, index: number) => {
			const key = factKey(kind, index);
			if (mergedFactKeys.has(key) || !text.trim()) return;
			setErr(null);
			try {
				await onExpandFact(kind, text, index);
			} catch (e) {
				setErr(
					e instanceof Error ? e.message : "Could not add to graph."
				);
			}
		},
		[mergedFactKeys, onExpandFact]
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
						{node.counterarguments.map((c, i) => {
							const k = factKey("counterargument", i);
							const busy = pendingExpandFactKey === k;
							const done = mergedFactKeys.has(k);
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
										disabled={done || anyExpandInFlight}
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

				{node.further_supports.length > 0 ? (
					<div className={styles.section}>
						<div className={styles.label}>
							Further support
						</div>
						{node.further_supports.map((s, i) => {
							const k = factKey("further_support", i);
							const busy = pendingExpandFactKey === k;
							const done = mergedFactKeys.has(k);
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
										disabled={done || anyExpandInFlight}
										onClick={() =>
											handleAdd(
												"further_support",
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
