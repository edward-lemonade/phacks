"use client";

import styles from "./TextInput.module.css";

type Props = {
	onSubmit: (text: string) => void;
	loading: boolean;
};

export default function TextInput({ onSubmit, loading }: Props) {
	return (
		<form
			className={styles.form}
			onSubmit={(e) => {
				e.preventDefault();
				const fd = new FormData(e.currentTarget);
				onSubmit(String(fd.get("text") ?? ""));
			}}
		>
			<label className={styles.label} htmlFor="argument-text">
				Paste text to map its argument structure
			</label>
			<textarea
				id="argument-text"
				name="text"
				placeholder="A paragraph, talk outline, or short essay…"
				rows={4}
				className={styles.area}
			/>
			<button type="submit" className={styles.submit} disabled={loading}>
				{loading ? "Analyzing…" : "Analyze"}
			</button>
		</form>
	);
}
