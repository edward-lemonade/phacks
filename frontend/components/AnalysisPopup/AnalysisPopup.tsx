"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
	STRENGTH_DISPLAY,
	normalizeStrengthLabel,
	type StrengthLabel,
} from "@/lib/strengthLabel";
import { factKey, type FactKind } from "@/lib/factKey";
import type { ArgumentNodeData } from "@/lib/types";
import styles from "./AnalysisPopup.module.css";

type UserCompose = { kind: FactKind; text: string } | null;

type Props = {
	node: ArgumentNodeData;
	context: string;
	onClose: () => void;
	onExpandFact: (kind: FactKind, text: string, index: number) => Promise<void>;
	onUserFact: (kind: FactKind, text: string) => Promise<void>;
	onDeleteFact: (kind: FactKind, index: number) => void;
	mergedFactKeys: ReadonlySet<string>;
	pendingExpandFactKey: string | null;
	anyExpandInFlight: boolean;
};

export default function AnalysisPopup({
	node,
	context,
	onClose,
	onExpandFact,
	onUserFact,
	onDeleteFact,
	mergedFactKeys,
	pendingExpandFactKey,
	anyExpandInFlight,
}: Props) {
	const [err, setErr] = useState<string | null>(null);
	const [mounted, setMounted] = useState(false);
	const [compose, setCompose] = useState<UserCompose>(null);
	const [userBusy, setUserBusy] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	useEffect(() => { setMounted(true); }, []);

	// Focus textarea when compose panel opens
	useEffect(() => {
		if (compose) textareaRef.current?.focus();
	}, [compose?.kind]);

	const handleAdd = useCallback(
		async (kind: FactKind, text: string, index: number) => {
			const key = factKey(kind, index);
			if (mergedFactKeys.has(key) || !text.trim()) return;
			setErr(null);
			try {
				await onExpandFact(kind, text, index);
			} catch (e) {
				setErr(e instanceof Error ? e.message : "Could not add to graph.");
			}
		},
		[mergedFactKeys, onExpandFact]
	);

	const handleUserSubmit = useCallback(async () => {
		if (!compose?.text.trim() || userBusy || anyExpandInFlight) return;
		setErr(null);
		setUserBusy(true);
		try {
			await onUserFact(compose.kind, compose.text.trim());
			setCompose(null);
		} catch (e) {
			setErr(e instanceof Error ? e.message : "Could not add to graph.");
		} finally {
			setUserBusy(false);
		}
	}, [compose, userBusy, anyExpandInFlight, onUserFact]);

	const openCompose = useCallback((kind: FactKind) => {
		setCompose({ kind, text: "" });
		setErr(null);
	}, []);

	const strength: StrengthLabel = normalizeStrengthLabel(node.strength);
	const strengthMeta = STRENGTH_DISPLAY[strength];

	if (!mounted) return null;

	const inFlight = userBusy || anyExpandInFlight;

	return createPortal(
		<div className={styles.backdrop} onClick={onClose} role="presentation">
			<div
				className={styles.panel}
				onClick={(e) => e.stopPropagation()}
				role="dialog"
				aria-labelledby="popup-title"
			>
				<div className={styles.kicker}>{node.type}</div>
				<h3 id="popup-title" className={styles.title}>{node.label}</h3>
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
					{node.strength_reasoning ? (
						<p className={styles.reason}>{node.strength_reasoning}</p>
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
									<p className={`${styles.block} ${styles.blockCounter}`}>{c}</p>
									<div className={styles.factActions}>
										<button
											type="button"
											className={styles.factAdd}
											disabled={done || inFlight}
											onClick={() => handleAdd("counterargument", c, i)}
										>
											{done ? "Added" : busy ? "…" : "Add"}
										</button>
										<button
											type="button"
											className={styles.factDelete}
											aria-label="Remove counterargument"
											disabled={inFlight}
											onClick={() => onDeleteFact("counterargument", i)}
										>
											✕
										</button>
									</div>
								</div>
							);
						})}
					</div>
				) : null}

				{node.further_supports.length > 0 ? (
					<div className={styles.section}>
						<div className={styles.label}>Further support</div>
						{node.further_supports.map((s, i) => {
							const k = factKey("further_support", i);
							const busy = pendingExpandFactKey === k;
							const done = mergedFactKeys.has(k);
							return (
								<div key={k} className={styles.factRow}>
									<p className={`${styles.block} ${styles.blockStrength}`}>{s}</p>
									<div className={styles.factActions}>
										<button
											type="button"
											className={styles.factAdd}
											disabled={done || inFlight}
											onClick={() => handleAdd("further_support", s, i)}
										>
											{done ? "Added" : busy ? "…" : "Add"}
										</button>
										<button
											type="button"
											className={styles.factDelete}
											aria-label="Remove further support"
											disabled={inFlight}
											onClick={() => onDeleteFact("further_support", i)}
										>
											✕
										</button>
									</div>
								</div>
							);
						})}
					</div>
				) : null}

				{/* User-authored compose area */}
				{compose ? (
					<div className={styles.composeSection}>
						<div className={styles.composeHeader}>
							<span className={styles.composeKind}>
								{compose.kind === "counterargument" ? "Your rebuttal" : "Your support"}
							</span>
							<button
								type="button"
								className={styles.composeCancel}
								onClick={() => setCompose(null)}
								disabled={userBusy}
							>
								✕
							</button>
						</div>
						<textarea
							ref={textareaRef}
							className={styles.composeArea}
							placeholder={
								compose.kind === "counterargument"
									? "Describe your objection to this claim…"
									: "Describe additional support for this claim…"
							}
							value={compose.text}
							onChange={(e) =>
								setCompose((prev) => prev && { ...prev, text: e.target.value })
							}
							onKeyDown={(e) => {
								if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleUserSubmit();
							}}
							rows={3}
							disabled={userBusy}
						/>
						<button
							type="button"
							className={styles.composeSubmit}
							disabled={!compose.text.trim() || inFlight}
							onClick={handleUserSubmit}
						>
							{userBusy ? "Adding…" : "Add to map"}
						</button>
					</div>
				) : (
					<div className={styles.createRow}>
						<button
							type="button"
							className={`${styles.createBtn} ${styles.createCounter}`}
							disabled={inFlight}
							onClick={() => openCompose("counterargument")}
						>
							+ Rebuttal
						</button>
						<button
							type="button"
							className={`${styles.createBtn} ${styles.createSupport}`}
							disabled={inFlight}
							onClick={() => openCompose("further_support")}
						>
							+ Support
						</button>
					</div>
				)}

				<button type="button" className={styles.close} onClick={onClose}>
					Close
				</button>
			</div>
		</div>,
		document.body
	);
}