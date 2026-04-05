"use client";

import { useCallback, useRef, useState } from "react";
import styles from "./StartThesisButton.module.css";

type Props = {
	onSubmit: (text: string) => Promise<void>;
	busy: boolean;
};

export default function StartThesisButton({ onSubmit, busy }: Props) {
	const [open, setOpen] = useState(false);
	const [text, setText] = useState("");
	const [err, setErr] = useState<string | null>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	const handleSubmit = useCallback(async () => {
		const trimmed = text.trim();
		if (!trimmed || busy) return;
		setErr(null);
		try {
			await onSubmit(trimmed);
			setText("");
			setOpen(false);
		} catch (e) {
			setErr(e instanceof Error ? e.message : "Could not add thesis.");
		}
	}, [text, busy, onSubmit]);

	const handleOpen = useCallback(() => {
		setOpen(true);
		// rAF so the textarea is in the DOM before we focus
		requestAnimationFrame(() => textareaRef.current?.focus());
	}, []);

	const handleCancel = useCallback(() => {
		setOpen(false);
		setText("");
		setErr(null);
	}, []);

	return (
		<div className={styles.wrap}>
			{open ? (
				<div className={styles.panel}>
					<div className={styles.header}>
						<span className={styles.kicker}>New Thesis</span>
						<button
							type="button"
							className={styles.cancelBtn}
							onClick={handleCancel}
							disabled={busy}
						>
							✕
						</button>
					</div>
					<textarea
						ref={textareaRef}
						className={styles.textarea}
						placeholder="State your central thesis…"
						value={text}
						rows={3}
						disabled={busy}
						onChange={(e) => setText(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit();
						}}
					/>
					{err && <p className={styles.error}>{err}</p>}
					<button
						type="button"
						className={styles.submitBtn}
						disabled={!text.trim() || busy}
						onClick={handleSubmit}
					>
						{busy ? "Analyzing…" : "Add to map"}
					</button>
				</div>
			) : (
				<button
					type="button"
					className={styles.triggerBtn}
					onClick={handleOpen}
				>
					+ Start Thesis
				</button>
			)}
		</div>
	);
}